//! Port-forwarding tunnels, each run as its own `ssh -N` process.

use crate::domain::{Connection, ConnectionTarget};
use crate::openssh::{OpenSsh, OpenSshError};
use crate::process::hide_window;
use crate::security::{validate_alias, validate_connection, validate_host, ValidationError};
use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TunnelKind {
    /// `-L`: a local port reaches a host as seen from the server.
    Local,
    /// `-R`: a server port reaches a host as seen from this computer.
    Remote,
    /// `-D`: a local SOCKS proxy through the server.
    Dynamic,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Tunnel {
    pub id: String,
    pub name: String,
    /// The host this tunnel connects through, as the host list identifies it.
    pub host_id: String,
    pub kind: TunnelKind,
    pub bind_address: Option<String>,
    pub bind_port: u16,
    /// Required for local and remote forwards; unused for dynamic ones.
    pub target_host: Option<String>,
    pub target_port: Option<u16>,
}

fn address(value: &str) -> Result<String, OpenSshError> {
    validate_host(value)?;
    Ok(if value.contains(':') {
        format!("[{value}]")
    } else {
        value.to_owned()
    })
}

fn port(value: Option<u16>, field: &'static str) -> Result<u16, OpenSshError> {
    match value {
        Some(port) if port > 0 => Ok(port),
        Some(_) => Err(ValidationError::Port.into()),
        None => Err(ValidationError::Required { field }.into()),
    }
}

impl Tunnel {
    /// The argument for `-L`, `-R` or `-D`, after validating every part.
    pub fn forward_spec(&self) -> Result<String, OpenSshError> {
        let mut spec = String::new();
        if let Some(bind) = self.bind_address.as_deref().filter(|bind| !bind.is_empty()) {
            spec.push_str(&address(bind)?);
            spec.push(':');
        }
        spec.push_str(&port(Some(self.bind_port), "local port")?.to_string());
        if self.kind != TunnelKind::Dynamic {
            let host = self
                .target_host
                .as_deref()
                .filter(|host| !host.is_empty())
                .ok_or(ValidationError::Required {
                    field: "target host",
                })?;
            let target_port = port(self.target_port, "target port")?;
            spec.push_str(&format!(":{}:{target_port}", address(host)?));
        }
        Ok(spec)
    }
}

/// The `ssh` arguments that run `tunnel` through `connection`.
pub fn tunnel_args(connection: &Connection, tunnel: &Tunnel) -> Result<Vec<String>, OpenSshError> {
    validate_connection(connection)?;
    let flag = match tunnel.kind {
        TunnelKind::Local => "-L",
        TunnelKind::Remote => "-R",
        TunnelKind::Dynamic => "-D",
    };
    let mut args: Vec<String> = [
        "-N",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
    ]
    .map(str::to_owned)
    .to_vec();
    args.extend([flag.to_owned(), tunnel.forward_spec()?]);
    if let Some(jump) = &connection.proxy_jump {
        validate_alias(jump)?;
        args.extend(["-J".to_owned(), jump.clone()]);
    }
    match &connection.target {
        ConnectionTarget::Alias { alias } => args.push(alias.clone()),
        ConnectionTarget::Endpoint {
            hostname,
            username,
            port,
        } => {
            args.extend(["-p".to_owned(), port.to_string()]);
            if let Some(username) = username {
                args.extend(["-l".to_owned(), username.clone()]);
            }
            args.push(hostname.clone());
        }
    }
    Ok(args)
}

/// Starts the tunnel in the background. Standard error is piped so the
/// caller can show why a tunnel failed.
pub fn spawn_tunnel(
    openssh: &OpenSsh,
    connection: &Connection,
    tunnel: &Tunnel,
    env: &[(String, String)],
) -> Result<Child, OpenSshError> {
    let args = tunnel_args(connection, tunnel)?;
    Ok(hide_window(&mut Command::new(openssh.ssh_path()?))
        .args(args)
        .envs(env.iter().cloned())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tunnel(kind: TunnelKind) -> Tunnel {
        Tunnel {
            id: "t".into(),
            name: "db".into(),
            host_id: "h".into(),
            kind,
            bind_address: None,
            bind_port: 15432,
            target_host: Some("db.internal".into()),
            target_port: Some(5432),
        }
    }

    #[test]
    fn builds_forward_specs() {
        assert_eq!(
            tunnel(TunnelKind::Local).forward_spec().unwrap(),
            "15432:db.internal:5432"
        );
        let mut socks = tunnel(TunnelKind::Dynamic);
        socks.bind_address = Some("::1".into());
        assert_eq!(socks.forward_spec().unwrap(), "[::1]:15432");
    }

    #[test]
    fn rejects_unsafe_or_missing_parts() {
        let mut bad = tunnel(TunnelKind::Local);
        bad.target_host = Some("-oProxyCommand=evil".into());
        assert!(bad.forward_spec().is_err());
        let mut missing = tunnel(TunnelKind::Remote);
        missing.target_port = None;
        assert!(missing.forward_spec().is_err());
        let mut zero = tunnel(TunnelKind::Dynamic);
        zero.bind_port = 0;
        assert!(zero.forward_spec().is_err());
    }

    #[test]
    fn arguments_end_with_the_destination() {
        let connection = Connection::alias("prod", "prod");
        let args = tunnel_args(&connection, &tunnel(TunnelKind::Local)).unwrap();
        assert_eq!(args[0], "-N");
        assert!(args.contains(&"ExitOnForwardFailure=yes".to_owned()));
        assert_eq!(
            args[args.len() - 3..],
            ["-L", "15432:db.internal:5432", "prod"]
        );
    }
}

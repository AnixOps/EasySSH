//! Host list commands. The frontend only ever sees display data; launching a
//! session goes back through `easyssh-core`, which validates every argument.

use easyssh_core::{
    scan_default_ssh_config, AppConfig, ConfigStore, Connection, ConnectionTarget,
    ExternalTerminal, OpenSsh, SshInvocation,
};
use serde::Serialize;
use std::collections::HashSet;

/// Hosts discovered in `~/.ssh/config` have no saved record, so their id is
/// derived from the alias instead.
const SSH_CONFIG_ID_PREFIX: &str = "ssh-config:";

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HostSource {
    Saved,
    SshConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostView {
    pub id: String,
    pub name: String,
    /// Human-readable destination, e.g. `root@10.0.0.5:2222` or an alias.
    pub target: String,
    /// The equivalent `ssh` command line, for copying.
    pub command: String,
    pub group_id: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub color: Option<String>,
    pub source: HostSource,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupView {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostsSnapshot {
    pub hosts: Vec<HostView>,
    pub groups: Vec<GroupView>,
    pub warnings: Vec<String>,
}

impl HostView {
    fn saved(connection: &Connection) -> Self {
        Self {
            id: connection.id.clone(),
            name: connection.name.clone(),
            target: display_target(&connection.target),
            command: display_command(&connection.target),
            group_id: connection.group_id.clone(),
            tags: connection.tags.clone(),
            favorite: connection.favorite,
            color: connection.color.clone(),
            source: HostSource::Saved,
        }
    }

    fn ssh_config(alias: &str) -> Self {
        let target = ConnectionTarget::Alias {
            alias: alias.to_owned(),
        };
        Self {
            id: format!("{SSH_CONFIG_ID_PREFIX}{alias}"),
            name: alias.to_owned(),
            target: display_target(&target),
            command: display_command(&target),
            group_id: None,
            tags: Vec::new(),
            favorite: false,
            color: None,
            source: HostSource::SshConfig,
        }
    }
}

fn display_target(target: &ConnectionTarget) -> String {
    match target {
        ConnectionTarget::Alias { alias } => alias.clone(),
        ConnectionTarget::Endpoint {
            hostname,
            username,
            port,
        } => {
            let user = username
                .as_deref()
                .map(|user| format!("{user}@"))
                .unwrap_or_default();
            if *port == 22 {
                format!("{user}{hostname}")
            } else {
                format!("{user}{hostname}:{port}")
            }
        }
    }
}

fn display_command(target: &ConnectionTarget) -> String {
    match target {
        ConnectionTarget::Alias { alias } => format!("ssh {alias}"),
        ConnectionTarget::Endpoint {
            hostname,
            username,
            port,
        } => {
            let mut command = String::from("ssh ");
            if *port != 22 {
                command.push_str(&format!("-p {port} "));
            }
            if let Some(user) = username {
                command.push_str(&format!("{user}@"));
            }
            command.push_str(hostname);
            command
        }
    }
}

fn load_config() -> Result<AppConfig, String> {
    let store = ConfigStore::default_path().map_err(|error| error.to_string())?;
    store.load().map_err(|error| error.to_string())
}

fn snapshot(config: &AppConfig, ssh_config_aliases: &[String]) -> Vec<HostView> {
    let saved_aliases: HashSet<&str> = config
        .connections
        .iter()
        .filter_map(|connection| match &connection.target {
            ConnectionTarget::Alias { alias } => Some(alias.as_str()),
            ConnectionTarget::Endpoint { .. } => None,
        })
        .collect();
    let mut hosts: Vec<HostView> = config.connections.iter().map(HostView::saved).collect();
    hosts.extend(
        ssh_config_aliases
            .iter()
            .filter(|alias| !saved_aliases.contains(alias.as_str()))
            .map(|alias| HostView::ssh_config(alias)),
    );
    hosts
}

#[tauri::command]
pub fn load_hosts() -> Result<HostsSnapshot, String> {
    let config = load_config()?;
    let discovery = scan_default_ssh_config();
    Ok(HostsSnapshot {
        hosts: snapshot(&config, &discovery.aliases),
        groups: config
            .groups
            .iter()
            .map(|group| GroupView {
                id: group.id.clone(),
                name: group.name.clone(),
                color: group.color.clone(),
            })
            .collect(),
        warnings: discovery.warnings,
    })
}

fn resolve(config: &AppConfig, host_id: &str) -> Result<Connection, String> {
    if let Some(alias) = host_id.strip_prefix(SSH_CONFIG_ID_PREFIX) {
        return Ok(Connection::alias(alias, alias));
    }
    config
        .connections
        .iter()
        .find(|connection| connection.id == host_id)
        .cloned()
        .ok_or_else(|| format!("unknown host: {host_id}"))
}

/// Resolves a host id from the frontend into its saved or derived connection.
pub fn connection(host_id: &str) -> Result<Connection, String> {
    resolve(&load_config()?, host_id)
}

/// Resolves a host id from the frontend into a validated `ssh` invocation.
pub fn invocation(host_id: &str) -> Result<(Connection, SshInvocation), String> {
    let connection = connection(host_id)?;
    let invocation =
        SshInvocation::for_connection(&OpenSsh, &connection).map_err(|error| error.to_string())?;
    Ok((connection, invocation))
}

/// Opens the host in the platform terminal, as a fallback to the embedded one.
#[tauri::command]
pub fn open_external(host_id: String) -> Result<(), String> {
    let (connection, invocation) = invocation(&host_id)?;
    ExternalTerminal::launch(&connection.name, &invocation).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoint(username: Option<&str>, port: u16) -> ConnectionTarget {
        ConnectionTarget::Endpoint {
            hostname: "10.0.0.5".to_owned(),
            username: username.map(str::to_owned),
            port,
        }
    }

    #[test]
    fn endpoint_display_omits_default_port() {
        assert_eq!(display_target(&endpoint(Some("root"), 22)), "root@10.0.0.5");
        assert_eq!(
            display_command(&endpoint(Some("root"), 22)),
            "ssh root@10.0.0.5"
        );
    }

    #[test]
    fn endpoint_display_keeps_custom_port() {
        assert_eq!(display_target(&endpoint(None, 2222)), "10.0.0.5:2222");
        assert_eq!(
            display_command(&endpoint(None, 2222)),
            "ssh -p 2222 10.0.0.5"
        );
    }

    #[test]
    fn ssh_config_aliases_already_saved_are_not_duplicated() {
        let mut config = AppConfig::new();
        config
            .connections
            .push(Connection::alias("Production", "prod"));
        let aliases = vec!["prod".to_owned(), "pi".to_owned()];
        let hosts = snapshot(&config, &aliases);
        assert_eq!(hosts.len(), 2);
        assert_eq!(hosts[0].source, HostSource::Saved);
        assert_eq!(hosts[1].id, "ssh-config:pi");
        assert_eq!(hosts[1].source, HostSource::SshConfig);
    }

    #[test]
    fn ssh_config_ids_resolve_to_alias_connections() {
        let connection = resolve(&AppConfig::new(), "ssh-config:pi").unwrap();
        assert_eq!(
            connection.target,
            ConnectionTarget::Alias {
                alias: "pi".to_owned()
            }
        );
        assert!(resolve(&AppConfig::new(), "missing").is_err());
    }
}

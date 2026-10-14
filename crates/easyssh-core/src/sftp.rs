//! Remote file access through the system OpenSSH `sftp` client.
//!
//! Browsing uses one long-lived `sftp` process per host with piped stdio. In
//! that mode `sftp` echoes every command as `sftp> <command>` and line-buffers
//! its output, so each command is followed by a marker (`lpwd`, which we never
//! send otherwise) and its output is everything before the marker's echo.
//! Transfers run in their own `sftp -b -` process so they can be cancelled.
//!
//! These processes have no terminal, so OpenSSH asks for passwords and
//! host-key confirmations through `SSH_ASKPASS`; callers pass that
//! environment in. Answers go straight to OpenSSH and are never stored.

use crate::domain::{Connection, ConnectionTarget};
use crate::openssh::{OpenSsh, OpenSshError};
use crate::security::{validate_alias, validate_connection};
use serde::Serialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::Duration;

const MARKER: &str = "lpwd";
const REPLY_TIMEOUT: Duration = Duration::from_secs(30);
/// Long enough to type a password into the prompt.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteFileKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub name: String,
    pub kind: RemoteFileKind,
    pub size: u64,
    /// As printed by the server, e.g. `Oct 14 09:12` or `Jan  3  2025`.
    pub modified: String,
    pub permissions: String,
}

/// Arguments shared by browsing and transfer processes.
pub fn sftp_args(connection: &Connection, batch: bool) -> Result<Vec<String>, OpenSshError> {
    validate_connection(connection)?;
    let mut args: Vec<String> = vec!["-q".into()];
    if batch {
        args.extend(["-b".into(), "-".into()]);
    }
    if let Some(jump) = &connection.proxy_jump {
        validate_alias(jump)?;
        args.extend(["-J".into(), jump.clone()]);
    }
    match &connection.target {
        ConnectionTarget::Alias { alias } => args.push(alias.clone()),
        ConnectionTarget::Endpoint {
            hostname,
            username,
            port,
        } => {
            args.extend(["-P".into(), port.to_string()]);
            let host = if hostname.contains(':') {
                format!("[{hostname}]")
            } else {
                hostname.clone()
            };
            match username.as_deref().filter(|user| !user.is_empty()) {
                Some(user) => args.push(format!("{user}@{host}")),
                None => args.push(host),
            }
        }
    }
    Ok(args)
}

/// Quotes a path as one `sftp` argument. Inside double quotes `sftp` treats
/// glob characters literally, so only `"` and `\` need escaping. Line breaks
/// and other control characters are rejected because they would end the
/// command and start another.
pub fn quote(path: &str) -> Result<String, OpenSshError> {
    if path.is_empty() || path.chars().any(char::is_control) {
        return Err(OpenSshError::Failed(format!("unsupported path: {path:?}")));
    }
    let mut quoted = String::with_capacity(path.len() + 2);
    quoted.push('"');
    for ch in path.chars() {
        if ch == '"' || ch == '\\' {
            quoted.push('\\');
        }
        quoted.push(ch);
    }
    quoted.push('"');
    Ok(quoted)
}

/// Joins a remote directory and a name with `/`.
pub fn join_remote(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

/// Parses `ls -la` output, skipping `.` and `..`.
pub fn parse_listing(output: &str) -> Vec<RemoteFile> {
    output.lines().filter_map(parse_listing_line).collect()
}

fn parse_listing_line(line: &str) -> Option<RemoteFile> {
    // permissions links owner group size month day time-or-year name
    let mut rest = line;
    let mut fields = Vec::with_capacity(8);
    for _ in 0..8 {
        rest = rest.trim_start_matches(' ');
        let end = rest.find(' ')?;
        fields.push(&rest[..end]);
        rest = &rest[end..];
    }
    let name = rest.strip_prefix(' ')?;
    let permissions = fields[0];
    if permissions.len() < 10 || name.is_empty() || name == "." || name == ".." {
        return None;
    }
    let kind = match permissions.as_bytes()[0] {
        b'd' => RemoteFileKind::Directory,
        b'-' => RemoteFileKind::File,
        b'l' => RemoteFileKind::Symlink,
        _ => RemoteFileKind::Other,
    };
    let name = match kind {
        RemoteFileKind::Symlink => name.split(" -> ").next().unwrap_or(name),
        _ => name,
    };
    Some(RemoteFile {
        name: name.to_owned(),
        kind,
        size: fields[4].parse().unwrap_or(0),
        modified: format!("{} {} {}", fields[5], fields[6], fields[7]),
        permissions: permissions.to_owned(),
    })
}

/// Parses the reply to `pwd`.
pub fn parse_pwd(output: &str) -> Option<String> {
    output
        .lines()
        .find_map(|line| line.strip_prefix("Remote working directory: "))
        .map(str::to_owned)
}

enum Line {
    Out(String),
    Err(String),
}

/// A long-lived `sftp` process for browsing one host.
pub struct SftpSession {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<Line>,
    home: String,
}

impl SftpSession {
    /// Starts `sftp` and waits until it answers, so an authentication
    /// failure is reported here rather than on the first listing.
    pub fn connect(
        openssh: &OpenSsh,
        connection: &Connection,
        env: &[(String, String)],
    ) -> Result<Self, OpenSshError> {
        let mut child = Command::new(openssh.sftp_path()?)
            .args(sftp_args(connection, false)?)
            .envs(env.iter().cloned())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let (Some(stdin), Some(stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            return Err(OpenSshError::Failed("sftp pipes are unavailable".into()));
        };
        let (sender, lines) = mpsc::channel();
        forward_lines(stdout, sender.clone(), Line::Out);
        forward_lines(stderr, sender, Line::Err);
        let mut session = Self {
            child,
            stdin,
            lines,
            home: String::new(),
        };
        let output = session.run_for("pwd", LOGIN_TIMEOUT)?;
        session.home = parse_pwd(&output)
            .ok_or_else(|| OpenSshError::Failed("sftp did not report a directory".into()))?;
        Ok(session)
    }

    pub fn home(&self) -> &str {
        &self.home
    }

    pub fn list(&mut self, dir: &str) -> Result<Vec<RemoteFile>, OpenSshError> {
        let output = self.run(&format!("ls -la {}", quote(dir)?))?;
        Ok(parse_listing(&output))
    }

    pub fn mkdir(&mut self, path: &str) -> Result<(), OpenSshError> {
        self.run(&format!("mkdir {}", quote(path)?)).map(drop)
    }

    pub fn remove(&mut self, path: &str, directory: bool) -> Result<(), OpenSshError> {
        let command = if directory { "rmdir" } else { "rm" };
        self.run(&format!("{command} {}", quote(path)?)).map(drop)
    }

    pub fn rename(&mut self, from: &str, to: &str) -> Result<(), OpenSshError> {
        self.run(&format!("rename {} {}", quote(from)?, quote(to)?))
            .map(drop)
    }

    /// Runs one command and returns its standard output. Anything the
    /// command writes to standard error is treated as a failure.
    fn run(&mut self, command: &str) -> Result<String, OpenSshError> {
        self.run_for(command, REPLY_TIMEOUT)
    }

    fn run_for(&mut self, command: &str, timeout: Duration) -> Result<String, OpenSshError> {
        writeln!(self.stdin, "{command}\n{MARKER}").map_err(|_| self.ended())?;
        self.stdin.flush().map_err(|_| self.ended())?;
        let echo = format!("sftp> {command}");
        let marker = format!("sftp> {MARKER}");
        let mut output = String::new();
        let mut errors = String::new();
        let mut started = false;
        loop {
            match self.lines.recv_timeout(timeout) {
                Ok(Line::Out(line)) if !started => started = line == echo,
                Ok(Line::Out(line)) if line == marker => break,
                Ok(Line::Out(line)) => {
                    output.push_str(&line);
                    output.push('\n');
                }
                Ok(Line::Err(line)) => {
                    errors.push_str(&line);
                    errors.push('\n');
                }
                Err(RecvTimeoutError::Timeout) => {
                    return Err(OpenSshError::Failed("sftp did not respond".into()))
                }
                Err(RecvTimeoutError::Disconnected) => {
                    let detail = errors.trim();
                    return Err(if detail.is_empty() {
                        self.ended()
                    } else {
                        OpenSshError::Failed(detail.to_owned())
                    });
                }
            }
        }
        // The marker's own reply ("Local working directory: ...") follows.
        let _ = self.lines.recv_timeout(REPLY_TIMEOUT);
        // Give a late standard-error line from the command a moment to arrive.
        while let Ok(line) = self.lines.recv_timeout(Duration::from_millis(20)) {
            if let Line::Err(line) = line {
                errors.push_str(&line);
                errors.push('\n');
            }
        }
        if errors.trim().is_empty() {
            Ok(output)
        } else {
            Err(OpenSshError::Failed(errors.trim().to_owned()))
        }
    }

    fn ended(&self) -> OpenSshError {
        OpenSshError::Failed("the sftp session has ended".into())
    }
}

impl Drop for SftpSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn forward_lines(
    stream: impl Read + Send + 'static,
    sender: mpsc::Sender<Line>,
    wrap: fn(String) -> Line,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(stream).lines() {
            let Ok(line) = line else { break };
            let line = wrap(line.trim_end_matches('\r').to_owned());
            if sender.send(line).is_err() {
                break;
            }
        }
    });
}

/// Starts a transfer in its own `sftp -b -` process. The caller waits on or
/// kills the returned child; standard error carries the failure reason.
pub fn spawn_transfer(
    openssh: &OpenSsh,
    connection: &Connection,
    upload: bool,
    local: &Path,
    remote: &str,
    env: &[(String, String)],
) -> Result<Child, OpenSshError> {
    let local = local
        .to_str()
        .ok_or_else(|| OpenSshError::Failed("local path is not valid UTF-8".into()))?;
    let command = if upload {
        format!("put -r {} {}\n", quote(local)?, quote(remote)?)
    } else {
        format!("get -r {} {}\n", quote(remote)?, quote(local)?)
    };
    let mut child = Command::new(openssh.sftp_path()?)
        .args(sftp_args(connection, true)?)
        .envs(env.iter().cloned())
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(command.as_bytes())?;
    }
    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_paths_as_single_arguments() {
        assert_eq!(quote("/srv/my app").unwrap(), "\"/srv/my app\"");
        assert_eq!(quote("a\"b\\c").unwrap(), "\"a\\\"b\\\\c\"");
        assert!(quote("a\nrm -r /").is_err());
        assert!(quote("").is_err());
    }

    #[test]
    fn parses_long_listing() {
        let output = "\
drwxr-xr-x    5 deploy   deploy       4096 Oct 14 09:12 .
drwxr-xr-x    3 root     root         4096 Jan  3  2025 ..
drwxr-xr-x    2 deploy   deploy       4096 Oct 14 09:12 app
-rw-r--r--    1 deploy   deploy      12034 Oct 13 18:40 deploy notes.md
lrwxrwxrwx    1 deploy   deploy         11 Sep  2 11:05 current -> releases/42
-rwxr-xr-x    1 1001     1001         2048 Jan  3  2025  leading space
";
        let files = parse_listing(output);
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].name, "app");
        assert_eq!(files[0].kind, RemoteFileKind::Directory);
        assert_eq!(files[1].name, "deploy notes.md");
        assert_eq!(files[1].size, 12034);
        assert_eq!(files[1].modified, "Oct 13 18:40");
        assert_eq!(files[2].name, "current");
        assert_eq!(files[2].kind, RemoteFileKind::Symlink);
        assert_eq!(files[3].name, " leading space");
        assert_eq!(files[3].modified, "Jan 3 2025");
    }

    #[test]
    fn ignores_noise_lines() {
        assert!(parse_listing("Can't ls: \"/nope\" not found\n\n").is_empty());
    }

    #[test]
    fn parses_pwd_reply() {
        assert_eq!(
            parse_pwd("Remote working directory: /home/deploy\n").as_deref(),
            Some("/home/deploy")
        );
        assert_eq!(parse_pwd("nothing"), None);
    }

    #[test]
    fn joins_remote_paths() {
        assert_eq!(join_remote("/", "etc"), "/etc");
        assert_eq!(join_remote("/home/deploy", "app"), "/home/deploy/app");
    }

    #[test]
    fn endpoint_arguments_use_uppercase_port_and_bracket_ipv6() {
        let connection = Connection {
            target: ConnectionTarget::Endpoint {
                hostname: "2001:db8::1".into(),
                username: Some("ops".into()),
                port: 2222,
            },
            ..Connection::alias("x", "unused")
        };
        let args = sftp_args(&connection, true).unwrap();
        assert_eq!(args, ["-q", "-b", "-", "-P", "2222", "ops@[2001:db8::1]"]);
    }
}

//! Host list commands. The frontend only ever sees display data; launching a
//! session goes back through `easyssh-core`, which validates every argument.

use easyssh_core::security::{validate_alias, validate_connection};
use easyssh_core::{
    scan_default_ssh_config, AppConfig, ConfigStore, Connection, ConnectionTarget,
    ExternalTerminal, Group, OpenSsh, SshInvocation,
};
use serde::{Deserialize, Serialize};
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
    /// The editable values, for the host editor.
    pub fields: HostFields,
}

/// Connection settings as the host editor shows and returns them.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostFields {
    /// Set for a `~/.ssh/config` alias; the endpoint fields are then unused.
    pub alias: Option<String>,
    pub hostname: String,
    pub username: Option<String>,
    pub port: u16,
    pub proxy_jump: Option<String>,
    pub notes: String,
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
            fields: fields_of(connection),
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
            fields: HostFields {
                alias: Some(alias.to_owned()),
                port: 22,
                ..HostFields::default()
            },
        }
    }
}

fn fields_of(connection: &Connection) -> HostFields {
    let mut fields = HostFields {
        proxy_jump: connection.proxy_jump.clone(),
        notes: connection.notes.clone(),
        port: 22,
        ..HostFields::default()
    };
    match &connection.target {
        ConnectionTarget::Alias { alias } => fields.alias = Some(alias.clone()),
        ConnectionTarget::Endpoint {
            hostname,
            username,
            port,
        } => {
            fields.hostname = hostname.clone();
            fields.username = username.clone();
            fields.port = *port;
        }
    }
    fields
}

/// What the host editor submits. `id` is a saved host's id, a
/// `~/.ssh/config` host's derived id (saved as a new host), or `None`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInput {
    pub id: Option<String>,
    pub name: String,
    pub group: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub color: Option<String>,
    pub fields: HostFields,
}

fn trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// Finds a group by name, ignoring case, or creates it.
fn group_for(config: &mut AppConfig, name: Option<&str>) -> Option<String> {
    let name = trimmed(name)?;
    if let Some(group) = config
        .groups
        .iter()
        .find(|group| group.name.eq_ignore_ascii_case(&name))
    {
        return Some(group.id.clone());
    }
    let id = format!("group-{}", chrono::Utc::now().timestamp_millis());
    config.groups.push(Group {
        id: id.clone(),
        name,
        color: None,
        parent_id: None,
    });
    Some(id)
}

/// Applies the editor's values to `connection` and validates the result.
fn apply(
    connection: &mut Connection,
    input: &HostInput,
    group_id: Option<String>,
) -> Result<(), String> {
    let fields = &input.fields;
    connection.name = input.name.trim().to_owned();
    connection.target = match trimmed(fields.alias.as_deref()) {
        Some(alias) => ConnectionTarget::Alias { alias },
        None => ConnectionTarget::Endpoint {
            hostname: fields.hostname.trim().to_owned(),
            username: trimmed(fields.username.as_deref()),
            port: fields.port,
        },
    };
    connection.group_id = group_id;
    let mut tags: Vec<String> = Vec::new();
    for tag in input.tags.iter().map(|tag| tag.trim()) {
        if !tag.is_empty() && !tags.iter().any(|existing| existing == tag) {
            tags.push(tag.to_owned());
        }
    }
    connection.tags = tags;
    connection.favorite = input.favorite;
    connection.color = trimmed(input.color.as_deref());
    connection.proxy_jump = trimmed(fields.proxy_jump.as_deref());
    connection.notes = fields.notes.trim().to_owned();
    validate_connection(connection).map_err(|error| error.to_string())?;
    if let Some(jump) = &connection.proxy_jump {
        validate_alias(jump).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn save_config(config: &AppConfig) -> Result<(), String> {
    let store = ConfigStore::default_path().map_err(|error| error.to_string())?;
    store.save(config).map_err(|error| error.to_string())
}

/// Creates or updates a host and returns its id.
#[tauri::command]
pub fn host_save(input: HostInput) -> Result<String, String> {
    let mut config = load_config()?;
    let index = input.id.as_deref().and_then(|id| {
        config
            .connections
            .iter()
            .position(|connection| connection.id == id)
    });
    let mut connection = match index {
        Some(index) => config.connections[index].clone(),
        None => Connection::alias(input.name.trim(), "new"),
    };
    let group_id = group_for(&mut config, input.group.as_deref());
    apply(&mut connection, &input, group_id)?;
    connection.updated_at = chrono::Utc::now();
    let id = connection.id.clone();
    match index {
        Some(index) => config.connections[index] = connection,
        None => config.connections.push(connection),
    }
    save_config(&config)?;
    Ok(id)
}

#[tauri::command]
pub fn host_delete(id: String) -> Result<(), String> {
    let mut config = load_config()?;
    config.connections.retain(|connection| connection.id != id);
    config.recent_connection_ids.retain(|recent| *recent != id);
    save_config(&config)
}

#[tauri::command]
pub fn host_set_favorite(id: String, favorite: bool) -> Result<(), String> {
    let mut config = load_config()?;
    let connection = config
        .connections
        .iter_mut()
        .find(|connection| connection.id == id)
        .ok_or("only saved hosts can be favorites")?;
    connection.favorite = favorite;
    save_config(&config)
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

    fn input(name: &str, fields: HostFields) -> HostInput {
        HostInput {
            id: None,
            name: name.to_owned(),
            group: Some(" Production ".to_owned()),
            tags: vec!["web".to_owned(), " web ".to_owned(), String::new()],
            favorite: true,
            color: Some("chart-3".to_owned()),
            fields,
        }
    }

    #[test]
    fn editor_values_become_a_validated_endpoint() {
        let mut config = AppConfig::new();
        let fields = HostFields {
            hostname: " 10.0.0.5 ".to_owned(),
            username: Some(String::new()),
            port: 2222,
            ..HostFields::default()
        };
        let input = input("web-01", fields);
        let group_id = group_for(&mut config, input.group.as_deref());
        let mut connection = Connection::alias("x", "x");
        apply(&mut connection, &input, group_id.clone()).unwrap();
        assert_eq!(connection.target, endpoint(None, 2222));
        assert_eq!(connection.tags, ["web"]);
        assert_eq!(config.groups[0].name, "Production");
        assert_eq!(group_for(&mut config, Some("production")), group_id);
    }

    #[test]
    fn unsafe_editor_values_are_rejected() {
        let mut connection = Connection::alias("x", "x");
        let fields = HostFields {
            hostname: "host; rm -rf /".to_owned(),
            port: 22,
            ..HostFields::default()
        };
        assert!(apply(&mut connection, &input("bad", fields), None).is_err());
        let fields = HostFields {
            alias: Some("prod".to_owned()),
            proxy_jump: Some("-oProxyCommand=evil".to_owned()),
            ..HostFields::default()
        };
        assert!(apply(&mut connection, &input("bad", fields), None).is_err());
    }
}

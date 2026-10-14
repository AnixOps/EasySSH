//! App settings and a check of the local OpenSSH setup.

use crate::hosts::{load_config, save_config};
use easyssh_core::{scan_default_ssh_config, Locale, OpenSsh, Theme};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    theme: Theme,
    locale: Locale,
    terminal_font_size: f32,
    terminal_scrollback: usize,
}

#[tauri::command]
pub fn settings_get() -> Result<Settings, String> {
    let config = load_config()?;
    Ok(Settings {
        theme: config.theme,
        locale: config.locale,
        terminal_font_size: config.terminal.font_size,
        terminal_scrollback: config.terminal.scrollback_lines,
    })
}

#[tauri::command]
pub fn settings_save(settings: Settings) -> Result<(), String> {
    if !(9.0..=32.0).contains(&settings.terminal_font_size) {
        return Err("the font size must be between 9 and 32".to_owned());
    }
    if !(1_000..=200_000).contains(&settings.terminal_scrollback) {
        return Err("scrollback must be between 1,000 and 200,000 lines".to_owned());
    }
    let mut config = load_config()?;
    config.theme = settings.theme;
    config.locale = settings.locale;
    config.terminal.font_size = settings.terminal_font_size;
    config.terminal.scrollback_lines = settings.terminal_scrollback;
    save_config(&config)
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    /// The agent answered and holds keys.
    Ready,
    /// The agent answered but holds no keys.
    Empty,
    /// No agent could be reached.
    Unavailable,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStatus {
    ssh_version: Option<String>,
    sftp_found: bool,
    agent: AgentState,
    agent_keys: Vec<String>,
    agent_error: Option<String>,
    ssh_config_hosts: usize,
}

fn agent_state(available: bool, error: Option<&str>) -> AgentState {
    if available {
        AgentState::Ready
    } else if error.is_some_and(|error| error.contains("no identities")) {
        AgentState::Empty
    } else {
        AgentState::Unavailable
    }
}

/// Runs `ssh -V` and `ssh-add -l`; slow enough to keep off the main thread.
#[tauri::command]
pub async fn ssh_status() -> Result<SshStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let diagnostics = OpenSsh.diagnostics(None);
        let (available, agent_keys, agent_error) = match diagnostics.agent_keys {
            Some(keys) => (keys.available, keys.fingerprints, keys.raw_error),
            None => (false, Vec::new(), Some("ssh-add was not found".to_owned())),
        };
        SshStatus {
            ssh_version: diagnostics.ssh_version,
            sftp_found: OpenSsh.sftp_path().is_ok(),
            agent: agent_state(available, agent_error.as_deref()),
            agent_keys,
            agent_error,
            ssh_config_hosts: scan_default_ssh_config().aliases.len(),
        }
    })
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{agent_state, AgentState};

    #[test]
    fn tells_an_empty_agent_from_a_missing_one() {
        assert_eq!(agent_state(true, None), AgentState::Ready);
        assert_eq!(
            agent_state(false, Some("The agent has no identities.")),
            AgentState::Empty
        );
        assert_eq!(
            agent_state(false, Some("Could not open a connection to your agent.")),
            AgentState::Unavailable
        );
    }
}

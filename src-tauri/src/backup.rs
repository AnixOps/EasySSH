//! Export, import and Git sync of hosts, groups, snippets and tunnels. The
//! file never contains passwords, keys or remote commands (see core sync.rs);
//! Git authentication stays with the system git.

use crate::hosts::{load_config, save_config};
use easyssh_core::sync::{GitSync, ImportSummary, SyncFile};
use easyssh_core::AppConfig;
use serde::Serialize;
use std::path::Path;

/// Exported files are small; anything larger is not one of ours.
const MAX_IMPORT_BYTES: u64 = 5 * 1024 * 1024;

#[tauri::command]
pub fn config_export(path: String) -> Result<(), String> {
    let json = SyncFile::from_config(&load_config()?)
        .canonical_json()
        .map_err(|error| error.to_string())?;
    std::fs::write(path, json).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn config_import(path: String) -> Result<ImportSummary, String> {
    let size = std::fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_IMPORT_BYTES {
        return Err("the file is too large to be an AnixOps SSH export".to_owned());
    }
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    let file = SyncFile::parse(&bytes).map_err(|error| error.to_string())?;
    let mut config = load_config()?;
    let summary = file.merge_into(&mut config);
    save_config(&config)?;
    Ok(summary)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncView {
    configured: bool,
    repository_path: Option<String>,
    remote_url: Option<String>,
    branch: String,
    last_success_at: Option<String>,
    last_error: Option<String>,
}

#[tauri::command]
pub fn sync_get() -> Result<SyncView, String> {
    let config = load_config()?;
    let sync = &config.sync;
    Ok(SyncView {
        configured: GitSync::repository(&config).is_ok(),
        repository_path: sync.repository_path.clone(),
        remote_url: sync.remote_url.clone(),
        branch: sync.branch.clone().unwrap_or_else(|| "main".to_owned()),
        last_success_at: sync.last_success_at.map(|time| time.to_rfc3339()),
        last_error: sync.last_error.clone(),
    })
}

/// Uses `repository_path` for sync, creating a Git repository there (with
/// `remote_url` as origin) unless one exists.
#[tauri::command]
pub async fn sync_setup(
    repository_path: String,
    remote_url: Option<String>,
    branch: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = repository_path.trim().to_owned();
        let branch = branch
            .map(|branch| branch.trim().to_owned())
            .filter(|branch| !branch.is_empty())
            .unwrap_or_else(|| "main".to_owned());
        let remote = remote_url
            .map(|url| url.trim().to_owned())
            .filter(|url| !url.is_empty());
        if path.is_empty() {
            return Err("choose a folder for the sync repository".to_owned());
        }
        if !Path::new(&path).join(".git").exists() {
            GitSync::init(Path::new(&path), remote.as_deref(), &branch)
                .map_err(|error| error.to_string())?;
        }
        let mut config = load_config()?;
        config.sync.repository_path = Some(path);
        config.sync.remote_url = remote;
        config.sync.branch = Some(branch);
        config.sync.last_error = None;
        save_config(&config)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Records the outcome of a push or pull so the panel can show it.
fn run_sync<T>(action: fn(&mut AppConfig) -> Result<T, String>) -> Result<T, String> {
    let mut config = load_config()?;
    let result = action(&mut config);
    if let Err(error) = &result {
        config.sync.last_error = Some(error.clone());
    }
    save_config(&config)?;
    result
}

#[tauri::command]
pub async fn sync_push() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        run_sync(|config| GitSync::push(config).map_err(|error| error.to_string()))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Replaces local hosts, groups, snippets and tunnels with the repository's.
/// Returns false when the repository has nothing yet.
#[tauri::command]
pub async fn sync_pull() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        run_sync(|config| GitSync::pull(config).map_err(|error| error.to_string()))
    })
    .await
    .map_err(|error| error.to_string())?
}

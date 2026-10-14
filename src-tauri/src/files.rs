//! File pane commands: browsing through a long-lived `sftp` per pane, and
//! transfers in their own `sftp` processes so each can be cancelled.

use crate::{askpass, hosts};
use easyssh_core::sftp::{self, RemoteFile, SftpSession};
use easyssh_core::{OpenSsh, OpenSshError};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{ipc::Channel, AppHandle, State};

struct RunningTransfer {
    child: Mutex<Child>,
    cancelled: AtomicBool,
}

#[derive(Default)]
pub struct Files {
    sessions: Mutex<HashMap<String, Arc<Mutex<SftpSession>>>>,
    transfers: Mutex<HashMap<String, Arc<RunningTransfer>>>,
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn next_id() -> String {
    NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string()
}

fn lock_error<T>(_: T) -> String {
    "file state is unavailable".to_owned()
}

async fn blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
}

async fn on_session<T, F>(files: &Files, id: &str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut SftpSession) -> Result<T, OpenSshError> + Send + 'static,
{
    let session = files
        .sessions
        .lock()
        .map_err(lock_error)?
        .get(id)
        .cloned()
        .ok_or("the file session has ended")?;
    blocking(move || {
        let mut session = session.lock().map_err(lock_error)?;
        task(&mut session).map_err(|error| error.to_string())
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFiles {
    id: String,
    home: String,
}

#[tauri::command]
pub async fn sftp_open(
    app: AppHandle,
    files: State<'_, Files>,
    host_id: String,
) -> Result<OpenedFiles, String> {
    let connection = hosts::connection(&host_id)?;
    let env = askpass::env_for(&app, &connection.name)?;
    let session = blocking(move || {
        SftpSession::connect(&OpenSsh, &connection, &env).map_err(|error| error.to_string())
    })
    .await?;
    let id = next_id();
    let home = session.home().to_owned();
    files
        .sessions
        .lock()
        .map_err(lock_error)?
        .insert(id.clone(), Arc::new(Mutex::new(session)));
    Ok(OpenedFiles { id, home })
}

#[tauri::command]
pub async fn sftp_list(
    files: State<'_, Files>,
    id: String,
    path: String,
) -> Result<Vec<RemoteFile>, String> {
    on_session(&files, &id, move |session| session.list(&path)).await
}

#[tauri::command]
pub async fn sftp_mkdir(files: State<'_, Files>, id: String, path: String) -> Result<(), String> {
    on_session(&files, &id, move |session| session.mkdir(&path)).await
}

#[tauri::command]
pub async fn sftp_remove(
    files: State<'_, Files>,
    id: String,
    path: String,
    directory: bool,
) -> Result<(), String> {
    on_session(&files, &id, move |session| session.remove(&path, directory)).await
}

#[tauri::command]
pub async fn sftp_rename(
    files: State<'_, Files>,
    id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    on_session(&files, &id, move |session| session.rename(&from, &to)).await
}

#[tauri::command]
pub fn sftp_close(files: State<'_, Files>, id: String) -> Result<(), String> {
    files.sessions.lock().map_err(lock_error)?.remove(&id);
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum TransferEvent {
    Progress { bytes: u64 },
    Done,
    Failed { message: String },
    Cancelled,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedTransfer {
    id: String,
    local: String,
    remote: String,
}

/// Uploads `local` into the remote directory `remote`, or downloads the
/// remote path `remote` into the user's Downloads folder.
#[tauri::command]
pub fn transfer_start(
    app: AppHandle,
    files: State<'_, Files>,
    host_id: String,
    upload: bool,
    remote: String,
    local: Option<String>,
    events: Channel<TransferEvent>,
) -> Result<StartedTransfer, String> {
    let connection = hosts::connection(&host_id)?;
    let (local, remote) = if upload {
        let local = PathBuf::from(local.ok_or("no local file was given")?);
        let name = local
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("the local file name is not valid UTF-8")?;
        let remote = sftp::join_remote(&remote, name);
        (local, remote)
    } else {
        let name = remote
            .rsplit('/')
            .find(|part| !part.is_empty())
            .ok_or("the remote path has no file name")?;
        (unique_download_path(&safe_file_name(name))?, remote)
    };
    let env = askpass::env_for(&app, &connection.name)?;
    let mut child = sftp::spawn_transfer(&OpenSsh, &connection, upload, &local, &remote, &env)
        .map_err(|error| error.to_string())?;
    let stderr = child.stderr.take();
    let errors = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_string(&mut text);
        }
        text
    });
    let id = next_id();
    let transfer = Arc::new(RunningTransfer {
        child: Mutex::new(child),
        cancelled: AtomicBool::new(false),
    });
    files
        .transfers
        .lock()
        .map_err(lock_error)?
        .insert(id.clone(), transfer.clone());

    let local_path = local.clone();
    std::thread::spawn(move || {
        let event = watch(&transfer, &local_path, upload, &events);
        let event = match event {
            Ok(()) => TransferEvent::Done,
            Err(_) if transfer.cancelled.load(Ordering::Relaxed) => {
                if !upload {
                    remove_partial(&local_path);
                }
                TransferEvent::Cancelled
            }
            Err(message) => {
                let detail = errors.join().unwrap_or_default();
                let detail = detail.trim();
                TransferEvent::Failed {
                    message: if detail.is_empty() {
                        message
                    } else {
                        detail.to_owned()
                    },
                }
            }
        };
        let _ = events.send(event);
    });

    Ok(StartedTransfer {
        id,
        local: local.to_string_lossy().into_owned(),
        remote,
    })
}

/// Waits for the transfer, reporting the size of a download as it grows.
fn watch(
    transfer: &RunningTransfer,
    local: &Path,
    upload: bool,
    events: &Channel<TransferEvent>,
) -> Result<(), String> {
    let mut reported = None;
    loop {
        let status = transfer
            .child
            .lock()
            .map_err(lock_error)?
            .try_wait()
            .map_err(|error| error.to_string())?;
        if let Some(status) = status {
            return if status.success() {
                Ok(())
            } else {
                Err(format!("sftp exited with {status}"))
            };
        }
        if !upload {
            if let Ok(metadata) = std::fs::metadata(local) {
                let bytes = metadata.len();
                if metadata.is_file() && reported != Some(bytes) {
                    reported = Some(bytes);
                    let _ = events.send(TransferEvent::Progress { bytes });
                }
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}

#[tauri::command]
pub fn transfer_cancel(files: State<'_, Files>, id: String) -> Result<(), String> {
    let transfer = files.transfers.lock().map_err(lock_error)?.remove(&id);
    if let Some(transfer) = transfer {
        transfer.cancelled.store(true, Ordering::Relaxed);
        let _ = transfer.child.lock().map_err(lock_error)?.kill();
    }
    Ok(())
}

fn remove_partial(path: &Path) {
    let _ = if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
}

/// Remote names come from the server, so they must not be able to point
/// outside the Downloads folder.
fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect();
    if matches!(cleaned.trim(), "" | "." | "..") {
        "download".to_owned()
    } else {
        cleaned
    }
}

fn unique_download_path(name: &str) -> Result<PathBuf, String> {
    let dir = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or("no Downloads folder was found")?;
    let candidate = dir.join(name);
    if !candidate.exists() {
        return Ok(candidate);
    }
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(name);
    let extension = path.extension().and_then(|extension| extension.to_str());
    for number in 1..1000 {
        let file = match extension {
            Some(extension) => format!("{stem} ({number}).{extension}"),
            None => format!("{stem} ({number})"),
        };
        let candidate = dir.join(file);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("too many files with the same name".to_owned())
}

#[cfg(test)]
mod tests {
    use super::safe_file_name;

    #[test]
    fn remote_names_cannot_escape_the_downloads_folder() {
        assert_eq!(safe_file_name("..\\..\\evil.exe"), ".._.._evil.exe");
        assert_eq!(safe_file_name(".."), "download");
        assert_eq!(safe_file_name("C:evil"), "C_evil");
        assert_eq!(safe_file_name("report 2026.pdf"), "report 2026.pdf");
    }
}

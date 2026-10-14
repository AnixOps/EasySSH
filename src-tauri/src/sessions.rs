//! Interactive sessions: a PTY running the system `ssh` (or a local shell),
//! streamed to the frontend over a Tauri channel. The app only relays bytes;
//! authentication stays with OpenSSH and the SSH agent.

use crate::hosts;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{ipc::Channel, AppHandle, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum SessionEvent {
    Data { data: String },
    Exit { code: Option<u32> },
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Sessions(Mutex<HashMap<String, Session>>);

static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn command_for(host_id: Option<&str>) -> Result<CommandBuilder, String> {
    let mut command = match host_id {
        Some(host_id) => {
            let (_, invocation) = hosts::invocation(host_id)?;
            let mut command = CommandBuilder::new(invocation.executable);
            command.args(invocation.args);
            command
        }
        None => local_shell(),
    };
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    if let Some(home) = dirs::home_dir() {
        command.cwd(home);
    }
    Ok(command)
}

#[cfg(windows)]
fn local_shell() -> CommandBuilder {
    let path = std::env::var_os("PATH").unwrap_or_default();
    for name in ["pwsh.exe", "powershell.exe"] {
        if let Some(found) = std::env::split_paths(&path)
            .map(|dir| dir.join(name))
            .find(|candidate| candidate.is_file())
        {
            let mut command = CommandBuilder::new(found);
            command.arg("-NoLogo");
            return command;
        }
    }
    CommandBuilder::new_default_prog()
}

#[cfg(not(windows))]
fn local_shell() -> CommandBuilder {
    CommandBuilder::new_default_prog()
}

fn lock_error<T>(_: T) -> String {
    "session state is unavailable".to_owned()
}

/// Starts a session for `host_id`, or a local shell when it is `None`, and
/// returns its id. Output and the exit status arrive on `events`.
#[tauri::command]
pub fn session_open(
    app: AppHandle,
    sessions: State<'_, Sessions>,
    host_id: Option<String>,
    cols: u16,
    rows: u16,
    events: Channel<SessionEvent>,
) -> Result<String, String> {
    let command = command_for(host_id.as_deref())?;
    let pair = native_pty_system()
        .openpty(pty_size(cols, rows))
        .map_err(|error| error.to_string())?;
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let killer = child.clone_killer();

    let id = NEXT_SESSION.fetch_add(1, Ordering::Relaxed).to_string();
    sessions.0.lock().map_err(lock_error)?.insert(
        id.clone(),
        Session {
            master: pair.master,
            writer,
            killer,
        },
    );

    let (exit_sender, exit_receiver) = mpsc::channel();
    let session_id = id.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|status| status.exit_code());
        let _ = exit_sender.send(code);
        // On Windows the ConPTY keeps the reader open after the child exits;
        // dropping the PTY ends it.
        if let Ok(mut sessions) = app.state::<Sessions>().0.lock() {
            sessions.remove(&session_id);
        }
    });
    std::thread::spawn(move || pump(reader, &events, &exit_receiver));
    Ok(id)
}

fn pump(
    mut reader: Box<dyn Read + Send>,
    events: &Channel<SessionEvent>,
    exit: &mpsc::Receiver<Option<u32>>,
) {
    let mut buffer = [0u8; 16 * 1024];
    let mut decoder = Utf8Stream::default();
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                let data = decoder.push(&buffer[..read]);
                if !data.is_empty() && events.send(SessionEvent::Data { data }).is_err() {
                    break;
                }
            }
        }
    }
    let code = exit.recv_timeout(Duration::from_secs(3)).ok().flatten();
    let _ = events.send(SessionEvent::Exit { code });
}

#[tauri::command]
pub fn session_write(
    sessions: State<'_, Sessions>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = sessions.0.lock().map_err(lock_error)?;
    let session = sessions.get_mut(&id).ok_or("session has ended")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|()| session.writer.flush())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn session_resize(
    sessions: State<'_, Sessions>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = sessions.0.lock().map_err(lock_error)?;
    let Some(session) = sessions.get(&id) else {
        return Ok(());
    };
    session
        .master
        .resize(pty_size(cols, rows))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn session_close(sessions: State<'_, Sessions>, id: String) -> Result<(), String> {
    let session = sessions.0.lock().map_err(lock_error)?.remove(&id);
    if let Some(mut session) = session {
        let _ = session.killer.kill();
    }
    Ok(())
}

/// Turns a byte stream into UTF-8 text, keeping a multi-byte character that
/// is split across reads until its remaining bytes arrive.
#[derive(Default)]
struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut text = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(valid) => {
                    text.push_str(valid);
                    self.pending.clear();
                    return text;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    text.push_str(&String::from_utf8_lossy(&self.pending[..valid]));
                    match error.error_len() {
                        Some(invalid) => {
                            text.push(char::REPLACEMENT_CHARACTER);
                            self.pending.drain(..valid + invalid);
                        }
                        None => {
                            self.pending.drain(..valid);
                            return text;
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Utf8Stream;

    #[test]
    fn keeps_split_characters_until_complete() {
        let mut stream = Utf8Stream::default();
        let bytes = "主机".as_bytes();
        assert_eq!(stream.push(&bytes[..2]), "");
        assert_eq!(stream.push(&bytes[2..4]), "主");
        assert_eq!(stream.push(&bytes[4..]), "机");
    }

    #[test]
    fn replaces_invalid_bytes() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(b"a\xffb"), "a\u{FFFD}b");
    }

    #[test]
    fn passes_ascii_through() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(b"\x1b[32mok\x1b[0m"), "\x1b[32mok\x1b[0m");
    }
}

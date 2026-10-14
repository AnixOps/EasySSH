//! Helpers for background OpenSSH processes.

use std::process::Command;

/// Keeps a background console program (`sftp`, `ssh -N`) from opening a
/// console window when started from the GUI app on Windows.
pub fn hide_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

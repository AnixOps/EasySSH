//! Installing an update from inside the app: download the installer named by
//! the verified feed, verify it (size, SHA-256, signature) against the keys
//! compiled in, put it in place and start the new version.
//!
//! - Windows: the NSIS installer, run passive (`/P`: a progress bar, no
//!   questions) with `/R`, which starts the app again when it is done. It
//!   closes every running AnixOps SSH process, the session daemon too.
//! - macOS: the `.app` from the disk image replaces the running bundle (a
//!   rename on the same volume), then the app is opened again.
//! - Linux AppImage: the new AppImage replaces the file named by `$APPIMAGE`.
//! - Linux `.deb` and anything else: not installable from here; the page says
//!   why and offers the release page.
//!
//! On macOS and Linux the session daemon of the old build keeps its sessions
//! and the new build attaches to them (the build handover in
//! `easysshd::supervisor`).

use easyssh_update::{DownloadError, Update, Verifier};
use serde::Serialize;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// How this installation can be updated.
#[allow(dead_code)] // each platform reports some of them
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Support {
    /// Download, install and restart from the app.
    Auto,
    /// Installed by a package manager (`.deb`): update it the same way.
    Package,
    /// macOS runs the app from a translocated copy: move it to Applications.
    MoveToApplications,
    /// The app's folder is not writable by this user.
    NoPermission,
    /// A development build or an unknown layout.
    None,
}

/// Where the install is: shown while it runs, read again after the page
/// was closed and opened.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// "downloading", "verifying", "installing", "restarting"; `None` when idle.
    pub phase: Option<&'static str>,
    pub downloaded: u64,
    pub total: u64,
}

const IDLE: Progress = Progress {
    phase: None,
    downloaded: 0,
    total: 0,
};

static PROGRESS: Mutex<Progress> = Mutex::new(IDLE);
static CANCEL: AtomicBool = AtomicBool::new(false);
const EVENT: &str = "update-progress";

pub fn progress() -> Progress {
    PROGRESS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

fn set(app: &AppHandle, next: Progress) {
    *PROGRESS.lock().unwrap_or_else(|e| e.into_inner()) = next.clone();
    let _ = app.emit(EVENT, next);
}

pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

/// How the program can start again once the old process is gone.
#[allow(dead_code)] // each platform uses one
enum Relaunch {
    /// The installer starts it (Windows `/R`).
    ByInstaller,
    /// Run this command once this process has exited.
    After(Vec<std::ffi::OsString>),
}

/// Worked out once: it probes the app's folder for write access.
pub fn support() -> Support {
    static SUPPORT: std::sync::OnceLock<Support> = std::sync::OnceLock::new();
    *SUPPORT.get_or_init(|| {
        if cfg!(debug_assertions) && std::env::var_os("EASYSSH_UPDATE_TEST_INSTALL").is_none() {
            return Support::None;
        }
        platform::support()
    })
}

/// Downloads, verifies and installs `update`, then starts the new version
/// and quits. Returns only on failure (or cancel); the state is idle again.
pub async fn install(app: AppHandle, verifier: Verifier, update: Update) -> Result<(), String> {
    if support() != Support::Auto {
        return Err("this installation cannot be updated from the app".into());
    }
    {
        let mut progress = PROGRESS.lock().unwrap_or_else(|e| e.into_inner());
        if progress.phase.is_some() {
            return Err("an update is already being installed".into());
        }
        progress.phase = Some("downloading");
    }
    CANCEL.store(false, Ordering::SeqCst);
    let worker = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || run(&worker, &verifier, &update)).await;
    let relaunch = match result {
        Ok(Ok(relaunch)) => relaunch,
        Ok(Err(error)) => {
            set(&app, IDLE);
            return Err(error);
        }
        Err(error) => {
            set(&app, IDLE);
            return Err(error.to_string());
        }
    };
    set(
        &app,
        Progress {
            phase: Some("restarting"),
            ..progress()
        },
    );
    if let Relaunch::After(command) = relaunch {
        platform::relaunch_after_exit(&command)?;
    }
    // Let the page paint "Restarting…" before the window goes.
    tokio::time::sleep(Duration::from_millis(400)).await;
    app.exit(0);
    Ok(())
}

fn run(app: &AppHandle, verifier: &Verifier, update: &Update) -> Result<Relaunch, String> {
    let name = update
        .file_name()
        .ok_or("the update has no usable file name")?;
    let total = u64::try_from(update.length).map_err(|_| "the update has no size")?;
    if update.signature.is_empty() {
        return Err("check for updates again before installing".into());
    }
    let dir = platform::download_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let part = dir.join(format!(".{name}.part"));
    let file = dir.join(platform::saved_name(name));

    // Download.
    let mut out = File::create(&part).map_err(|e| format!("{}: {e}", part.display()))?;
    let mut last = Instant::now();
    let downloaded = easyssh_update::download(&update.url, &mut out, total, |done| {
        if last.elapsed() >= Duration::from_millis(150) || done == total {
            last = Instant::now();
            set(
                app,
                Progress {
                    phase: Some("downloading"),
                    downloaded: done,
                    total,
                },
            );
        }
        !CANCEL.load(Ordering::SeqCst)
    });
    drop(out);
    if let Err(error) = downloaded {
        let _ = std::fs::remove_file(&part);
        return Err(match error {
            DownloadError::Cancelled => "cancelled".into(),
            DownloadError::Failed(reason) => format!("download failed: {reason}"),
        });
    }

    // Verify the file that will be opened, after it is complete.
    set(
        app,
        Progress {
            phase: Some("verifying"),
            downloaded: total,
            total,
        },
    );
    let verified = File::open(&part).map_err(|e| e.to_string()).and_then(|f| {
        verifier
            .verify_archive(f, &update.item())
            .map_err(|e| e.to_string())
    });
    if let Err(error) = verified {
        let _ = std::fs::remove_file(&part);
        return Err(format!(
            "the download does not verify ({error}); nothing was installed"
        ));
    }
    if CANCEL.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&part);
        return Err("cancelled".into());
    }

    set(
        app,
        Progress {
            phase: Some("installing"),
            downloaded: total,
            total,
        },
    );
    std::fs::rename(&part, &file).map_err(|e| e.to_string())?;
    platform::install(&file)
}

/// Removes installers left from earlier updates (the folder is ours).
pub fn clean_old_downloads() {
    let Ok(dir) = platform::download_dir() else {
        return;
    };
    if dir != cache_dir() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn cache_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("EasySSH")
        .join("updates")
}

/// The folder can be written by this user (a file can be made in it).
#[allow(dead_code)]
fn writable(dir: &Path) -> bool {
    tempfile_in(dir).is_ok()
}

#[allow(dead_code)]
fn tempfile_in(dir: &Path) -> std::io::Result<()> {
    let probe = dir.join(format!(".anixops-ssh-write-test-{}", std::process::id()));
    File::create(&probe)?;
    std::fs::remove_file(&probe)
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{cache_dir, Relaunch, Support};
    use std::path::{Path, PathBuf};

    pub fn support() -> Support {
        Support::Auto
    }

    pub fn download_dir() -> Result<PathBuf, String> {
        Ok(cache_dir())
    }

    pub fn saved_name(name: &str) -> String {
        name.to_owned()
    }

    pub fn install(installer: &Path) -> Result<Relaunch, String> {
        // Passive, update mode, start the app again when done.
        match std::process::Command::new(installer)
            .args(["/P", "/R", "/UPDATE"])
            .spawn()
        {
            Ok(_) => Ok(Relaunch::ByInstaller),
            // ERROR_ELEVATION_REQUIRED: installed for all users.
            Err(e) if e.raw_os_error() == Some(740) => Err(
                "the installer needs administrator rights; run the downloaded installer by hand"
                    .into(),
            ),
            Err(e) => Err(format!("cannot start the installer: {e}")),
        }
    }

    pub fn relaunch_after_exit(_: &[std::ffi::OsString]) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(unix)]
mod unix {
    use std::ffi::OsString;
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    /// Waits for the process `$1` to exit (at most 30 s), then runs the rest.
    pub const SCRIPT: &str = r#"pid=$1; shift; i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 150 ]; do sleep 0.2; i=$((i+1)); done
exec "$@""#;

    /// Starts `command` once this process has exited, from a shell in its own
    /// process group so it outlives us.
    pub fn relaunch_after_exit(command: &[OsString]) -> Result<(), String> {
        Command::new("/bin/sh")
            .arg("-c")
            .arg(SCRIPT)
            .arg("sh")
            .arg(std::process::id().to_string())
            .args(command)
            // The AppImage runtime's own variables name the old image.
            .env_remove("APPIMAGE")
            .env_remove("APPDIR")
            .env_remove("ARGV0")
            .env_remove("OWD")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("cannot restart: {e}"))
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{cache_dir, writable, Relaunch, Support};
    use std::path::{Path, PathBuf};
    use std::process::Command;

    pub use super::unix::relaunch_after_exit;

    /// The running `.app` bundle.
    fn bundle() -> Option<PathBuf> {
        let exe = std::env::current_exe().ok()?;
        exe.ancestors()
            .find(|p| p.extension().is_some_and(|e| e == "app"))
            .map(Path::to_path_buf)
    }

    pub fn support() -> Support {
        let Some(bundle) = bundle() else {
            return Support::None;
        };
        if bundle.to_string_lossy().contains("/AppTranslocation/") {
            return Support::MoveToApplications;
        }
        match bundle.parent() {
            Some(parent) if writable(parent) => Support::Auto,
            _ => Support::NoPermission,
        }
    }

    pub fn download_dir() -> Result<PathBuf, String> {
        Ok(cache_dir())
    }

    pub fn saved_name(name: &str) -> String {
        name.to_owned()
    }

    fn run(command: &mut Command) -> Result<(), String> {
        let output = command.output().map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
        }
    }

    /// Detaches the disk image when the install is done or failed.
    struct Mounted(PathBuf);

    impl Drop for Mounted {
        fn drop(&mut self) {
            let _ = Command::new("hdiutil")
                .args(["detach", "-force", "-quiet"])
                .arg(&self.0)
                .output();
            let _ = std::fs::remove_dir(&self.0);
        }
    }

    pub fn install(dmg: &Path) -> Result<Relaunch, String> {
        let bundle = bundle().ok_or("the app is not running from an .app bundle")?;
        let parent = bundle.parent().ok_or("the app has no folder")?;
        let name = bundle
            .file_name()
            .ok_or("the app has no name")?
            .to_string_lossy()
            .into_owned();

        let mount = dmg.with_extension("mount");
        let _ = std::fs::create_dir_all(&mount);
        // The image was verified; it is opened read-only and never shown in Finder.
        run(Command::new("hdiutil")
            .args([
                "attach",
                "-nobrowse",
                "-noautoopen",
                "-noverify",
                "-readonly",
                "-quiet",
                "-mountpoint",
            ])
            .arg(&mount)
            .arg(dmg))
        .map_err(|e| format!("cannot open the disk image: {e}"))?;
        let mounted = Mounted(mount.clone());
        let new_app = std::fs::read_dir(&mounted.0)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|entry| entry.path())
            .find(|p| p.extension().is_some_and(|e| e == "app"))
            .ok_or("the disk image holds no app")?;

        // Copy next to the running app, on the same volume, then swap by renames.
        let staged = parent.join(format!(".{name}.update"));
        let old = parent.join(format!(".{name}.old"));
        let _ = std::fs::remove_dir_all(&staged);
        let _ = std::fs::remove_dir_all(&old);
        run(Command::new("ditto").arg(&new_app).arg(&staged))
            .map_err(|e| format!("cannot copy the new version: {e}"))?;
        drop(mounted);
        let _ = Command::new("xattr")
            .args(["-dr", "com.apple.quarantine"])
            .arg(&staged)
            .output();
        std::fs::rename(&bundle, &old).map_err(|e| {
            let _ = std::fs::remove_dir_all(&staged);
            format!("cannot replace the app: {e}")
        })?;
        if let Err(e) = std::fs::rename(&staged, &bundle) {
            let _ = std::fs::rename(&old, &bundle);
            let _ = std::fs::remove_dir_all(&staged);
            return Err(format!("cannot replace the app: {e}"));
        }
        // The running process keeps its open files; the old copy can go.
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_file(dmg);
        Ok(Relaunch::After(vec![
            "/usr/bin/open".into(),
            "-n".into(),
            bundle.into(),
        ]))
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::{writable, Relaunch, Support};
    use std::path::{Path, PathBuf};

    pub use super::unix::relaunch_after_exit;

    /// The AppImage file this process was started from.
    fn appimage() -> Option<PathBuf> {
        let path = PathBuf::from(std::env::var_os("APPIMAGE")?);
        path.is_file().then_some(path)
    }

    pub fn support() -> Support {
        let Some(image) = appimage() else {
            return Support::Package;
        };
        match image.parent() {
            Some(parent) if writable(parent) => Support::Auto,
            _ => Support::NoPermission,
        }
    }

    /// Next to the AppImage, so the swap is a rename on the same file system.
    pub fn download_dir() -> Result<PathBuf, String> {
        appimage()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .ok_or_else(|| "not running from an AppImage".to_owned())
    }

    /// Hidden until it replaces the running AppImage.
    pub fn saved_name(name: &str) -> String {
        format!(".{name}.update")
    }

    pub fn install(file: &Path) -> Result<Relaunch, String> {
        use std::os::unix::fs::PermissionsExt;
        let image = appimage().ok_or("not running from an AppImage")?;
        let mode = std::fs::metadata(&image)
            .map(|m| m.permissions().mode() | 0o111)
            .unwrap_or(0o755);
        let replaced = std::fs::set_permissions(file, std::fs::Permissions::from_mode(mode))
            .and_then(|()| std::fs::rename(file, &image));
        if let Err(e) = replaced {
            let _ = std::fs::remove_file(file);
            return Err(format!("cannot replace the AppImage: {e}"));
        }
        Ok(Relaunch::After(vec![image.into()]))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod platform {
    use super::{Relaunch, Support};
    use std::path::{Path, PathBuf};

    pub fn support() -> Support {
        Support::None
    }

    pub fn download_dir() -> Result<PathBuf, String> {
        Err("not supported".into())
    }

    pub fn saved_name(name: &str) -> String {
        name.to_owned()
    }

    pub fn install(_: &Path) -> Result<Relaunch, String> {
        Err("not supported".into())
    }

    pub fn relaunch_after_exit(_: &[std::ffi::OsString]) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_install_starts_idle() {
        assert_eq!(progress(), IDLE);
    }

    #[cfg(unix)]
    #[test]
    fn the_relaunch_waits_for_this_process_and_runs_the_command() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("ran");
        // This test process is still alive, so the shell would wait for it;
        // run the script against a pid that does not exist instead.
        let status = std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg(unix::SCRIPT)
            .arg("sh")
            .arg("999999999")
            .arg("touch")
            .arg(&marker)
            .status()
            .unwrap();
        assert!(status.success());
        assert!(marker.exists());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn an_appimage_is_replaced_in_place_and_stays_executable() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("AnixOps-SSH.AppImage");
        std::fs::write(&image, b"old").unwrap();
        std::fs::set_permissions(&image, std::fs::Permissions::from_mode(0o750)).unwrap();
        // The only test in this binary that sets it.
        std::env::set_var("APPIMAGE", &image);
        assert_eq!(platform::support(), Support::Auto);
        assert_eq!(platform::download_dir().unwrap(), dir.path());
        let new = dir
            .path()
            .join(platform::saved_name("AnixOps-SSH_9.9.9_amd64.AppImage"));
        std::fs::write(&new, b"new").unwrap();
        let Relaunch::After(command) = platform::install(&new).unwrap() else {
            panic!("an AppImage restarts itself");
        };
        assert_eq!(command, vec![image.clone().into_os_string()]);
        assert_eq!(std::fs::read(&image).unwrap(), b"new");
        assert!(!new.exists());
        let mode = std::fs::metadata(&image).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o751);
        std::env::remove_var("APPIMAGE");
        assert_eq!(platform::support(), Support::Package);
    }
}

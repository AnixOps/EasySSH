//! AnixOps SSH: the Tauri app. The desktop build (`main.rs`) is a thin client
//! of the session daemon; the mobile build (Android and iOS, `mobile.rs`)
//! embeds the engine in the app process, because a phone allows no resident
//! background process. See docs/mobile-prototype.md.

#[cfg(desktop)]
mod ai;
#[cfg(desktop)]
mod askpass;
#[cfg(desktop)]
mod backup;
#[cfg(desktop)]
mod daemon;
#[cfg(desktop)]
mod edit;
#[cfg(desktop)]
mod files;
#[cfg(desktop)]
mod hosts;
#[cfg(desktop)]
mod import;
#[cfg(desktop)]
mod known_hosts;
#[cfg(desktop)]
mod monitor;
#[cfg(desktop)]
mod serial;
#[cfg(desktop)]
mod session_logs;
#[cfg(desktop)]
mod sessions;
#[cfg(desktop)]
mod settings;
#[cfg(desktop)]
mod snippets;
#[cfg(desktop)]
mod sync;
#[cfg(desktop)]
mod telemetry;
#[cfg(desktop)]
mod terminal_transfer;
#[cfg(desktop)]
mod tunnels;
#[cfg(desktop)]
mod update;
#[cfg(desktop)]
mod update_install;
#[cfg(desktop)]
mod vault;
#[cfg(desktop)]
mod webview_chrome;

#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
mod mobile_vault;

/// The app's entry point: `main` on the desktop, the generated activity or
/// application delegate on Android and iOS.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    desktop_run();
    #[cfg(mobile)]
    mobile::run();
}

#[cfg(desktop)]
fn desktop_run() {
    use tauri::Manager;

    // OpenSSH starts this executable to ask for a password; see askpass.rs.
    askpass::run_helper_if_requested();
    // Crash capture first, so a panic in the daemon below is caught too.
    telemetry::init();
    // Or, with `--easysshd`, the background session daemon; see daemon.rs.
    daemon::run_if_requested();

    tauri::Builder::default()
        // First, as the plugin requires: a second launch (an anixops-ssh://
        // link opened while the app runs) hands its arguments to this
        // process, which gets the link through the deep-link plugin, and
        // exits. All this process does itself is bring its window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(daemon::DaemonState::default())
        .manage(sessions::Sessions::default())
        .manage(files::Files::default())
        .manage(edit::Edits::default())
        .manage(askpass::Askpass::default())
        .manage(tunnels::Tunnels::default())
        .manage(ai::Ai::default())
        .manage(easyssh_engine::terminal_files::TerminalFiles::default())
        .invoke_handler(tauri::generate_handler![
            hosts::load_hosts,
            hosts::open_external,
            hosts::host_save,
            hosts::host_delete,
            hosts::host_set_favorite,
            import::import_preview_file,
            import::import_preview_ssh_config,
            import::import_apply_hosts,
            import::service_remembered,
            import::service_test,
            import::service_preview,
            known_hosts::known_hosts_list,
            known_hosts::known_hosts_import,
            known_hosts::known_hosts_remove,
            snippets::snippets_list,
            snippets::snippet_save,
            snippets::snippet_delete,
            tunnels::tunnels_list,
            tunnels::tunnel_save,
            tunnels::tunnel_delete,
            tunnels::tunnel_start,
            tunnels::tunnel_stop,
            settings::settings_get,
            settings::settings_save,
            settings::ssh_status,
            settings::monospace_fonts,
            telemetry::telemetry_status,
            telemetry::telemetry_pending,
            telemetry::telemetry_delete_pending,
            telemetry::telemetry_report_frontend,
            update::update_status,
            update::update_set_auto,
            update::update_check,
            update::update_open,
            update::update_install,
            update::update_cancel,
            backup::config_export,
            backup::config_import,
            backup::sync_get,
            backup::sync_setup,
            backup::sync_push,
            backup::sync_pull,
            serial::serial_ports,
            sessions::session_open,
            sessions::session_write,
            sessions::session_resize,
            sessions::session_close,
            sessions::sessions_list,
            sessions::session_attach,
            sessions::session_detach,
            files::sftp_open,
            files::sftp_list,
            files::sftp_mkdir,
            files::sftp_remove,
            files::sftp_rename,
            files::sftp_chmod,
            files::sftp_close,
            files::transfer_start,
            files::transfer_cancel,
            edit::edit_prepare,
            edit::edit_open,
            edit::edit_watch,
            edit::edit_stop,
            terminal_transfer::terminal_file_open_read,
            terminal_transfer::terminal_file_read,
            terminal_transfer::terminal_file_open_write,
            terminal_transfer::terminal_file_write,
            terminal_transfer::terminal_file_close,
            monitor::monitor_sample,
            monitor::monitor_signal,
            askpass::askpass_reply,
            askpass::askpass_unlock,
            sync::sync_call,
            vault::vault_status,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_unlock_with,
            vault::vault_enable_unlock,
            vault::vault_add_unlock_item,
            vault::vault_remove_unlock_item,
            vault::vault_disable_unlock,
            vault::vault_set_passphrase,
            vault::vault_remove_passphrase,
            vault::vault_set_auto_lock,
            vault::vault_forget_all,
            vault::secrets_status,
            vault::secrets_set,
            daemon::hostkey_reply,
            ai::ai_config_get,
            ai::ai_config_save,
            ai::ai_key_set,
            ai::ai_prepare,
            ai::ai_send,
            ai::ai_cancel,
            session_logs::session_logs_settings_get,
            session_logs::session_logs_settings_save,
            session_logs::session_log_host_set,
            session_logs::session_logs_list,
            session_logs::session_log_open,
            session_logs::session_log_export,
            session_logs::session_log_delete
        ])
        .setup(|app| {
            // Installed packages register the scheme themselves (the deb, the
            // NSIS installer, the macOS bundle). An AppImage and a development
            // run have nothing installed, so register at run time.
            #[cfg(any(target_os = "linux", windows))]
            if cfg!(debug_assertions) || std::env::var_os("APPIMAGE").is_some() {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = app.deep_link().register_all() {
                    eprintln!("cannot register the anixops-ssh:// scheme: {error}");
                }
            }
            webview_chrome::lock_down(app);
            daemon::start(app.handle());
            edit::clean_all(app.handle());
            telemetry::start_background();
            update::start_background(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build AnixOps SSH")
        .run(|app, event| {
            // Background ssh processes do not end with the window on their own.
            if let tauri::RunEvent::Exit = event {
                app.state::<tunnels::Tunnels>().stop_all();
                tunnels::stop_remote(app);
            }
        });
}

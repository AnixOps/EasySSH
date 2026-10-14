// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod askpass;
mod files;
mod hosts;
mod sessions;
mod settings;
mod snippets;
mod tunnels;

fn main() {
    // OpenSSH starts this executable to ask for a password; see askpass.rs.
    askpass::run_helper_if_requested();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(sessions::Sessions::default())
        .manage(files::Files::default())
        .manage(askpass::Askpass::default())
        .manage(tunnels::Tunnels::default())
        .invoke_handler(tauri::generate_handler![
            hosts::load_hosts,
            hosts::open_external,
            hosts::host_save,
            hosts::host_delete,
            hosts::host_set_favorite,
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
            sessions::session_open,
            sessions::session_write,
            sessions::session_resize,
            sessions::session_close,
            files::sftp_open,
            files::sftp_list,
            files::sftp_mkdir,
            files::sftp_remove,
            files::sftp_rename,
            files::sftp_close,
            files::transfer_start,
            files::transfer_cancel,
            askpass::askpass_reply
        ])
        .build(tauri::generate_context!())
        .expect("failed to build AnixOps SSH")
        .run(|app, event| {
            // Background ssh processes do not end with the window on their own.
            if let tauri::RunEvent::Exit = event {
                app.state::<tunnels::Tunnels>().stop_all();
            }
        });
}

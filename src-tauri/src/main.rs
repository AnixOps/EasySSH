// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod files;
mod hosts;
mod sessions;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(sessions::Sessions::default())
        .manage(files::Files::default())
        .invoke_handler(tauri::generate_handler![
            hosts::load_hosts,
            hosts::open_external,
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
            files::transfer_cancel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AnixOps SSH");
}

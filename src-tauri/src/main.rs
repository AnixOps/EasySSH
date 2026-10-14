// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hosts;
mod sessions;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(sessions::Sessions::default())
        .invoke_handler(tauri::generate_handler![
            hosts::load_hosts,
            hosts::open_external,
            sessions::session_open,
            sessions::session_write,
            sessions::session_resize,
            sessions::session_close
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AnixOps SSH");
}

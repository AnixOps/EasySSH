// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hosts;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            hosts::load_hosts,
            hosts::open_external
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AnixOps SSH");
}

#[cfg(not(test))]
mod commands;
mod db;
mod domain;
mod services;

#[cfg(not(test))]
use tauri::Manager;

#[cfg(not(test))]
pub struct AppState {
    database: db::database::Database,
    originals_root: std::path::PathBuf,
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let library_root = app.path().app_local_data_dir()?;
            let database = db::database::Database::open(&library_root)?;
            app.manage(AppState { database, originals_root: library_root.join("originals") });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::get_library_health,
            commands::inbox::get_inbox_items,
            commands::inbox::import_files,
            commands::problems::get_problem_document,
            commands::problems::save_problem_field
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("failed to run 错题智库");
}

#[cfg(test)]
pub fn run() {
    unreachable!("the desktop bootstrap is not part of unit tests");
}

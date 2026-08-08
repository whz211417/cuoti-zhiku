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
    library_root: std::path::PathBuf,
    originals_root: std::path::PathBuf,
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // This records a safe status and never blocks local study work if Credential Manager is unavailable.
            services::credentials::migrate_legacy_dashscope_key_on_startup();
            let library_root = app.path().app_local_data_dir()?;
            let database = db::database::Database::open(&library_root)?;
            app.manage(AppState {
                database,
                library_root: library_root.clone(),
                originals_root: library_root.join("originals"),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::has_ai_api_key,
            commands::ai::has_ai_provider_key,
            commands::ai::save_ai_api_key,
            commands::ai::save_ai_provider_key,
            commands::ai::clear_ai_api_key,
            commands::ai::clear_ai_provider_key,
            commands::ai::get_ai_credential_migration_status,
            commands::ai::retry_ai_credential_migration,
            commands::ai::test_ai_provider,
            commands::ai::activate_ai_provider,
            commands::ai::is_ai_provider_active,
            commands::ai::run_problem_analysis,
            commands::backup::create_library_backup,
            commands::backup::restore_library_backup,
            commands::health::get_library_health,
            commands::courses::get_courses,
            commands::courses::create_course,
            commands::dashboard::get_dashboard_overview,
            commands::dashboard::search_library,
            commands::dashboard::get_all_problems,
            commands::inbox::get_inbox_items,
            commands::inbox::import_files,
            commands::knowledge::get_knowledge_graph,
            commands::knowledge::export_obsidian_vault,
            commands::knowledge::open_obsidian_canvas,
            commands::materials::import_course_material_file,
            commands::materials::save_course_material,
            commands::materials::search_course_material,
            commands::problems::get_problem_document,
            commands::problems::save_problem_field,
            commands::problems::complete_review,
            commands::problems::get_due_review_problems,
            commands::problems::export_problem_book
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

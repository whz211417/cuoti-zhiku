use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn create_library_backup(
    state: State<'_, AppState>,
    destination: String,
) -> Result<(), String> {
    state
        .database
        .create_backup(std::path::Path::new(&destination))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_library_backup(
    state: State<'_, AppState>,
    source: String,
) -> Result<String, String> {
    let backup_root = state.library_root.join("backups");
    std::fs::create_dir_all(&backup_root).map_err(|error| error.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let rescue = backup_root.join(format!("before-restore-{timestamp}.sqlite3"));
    state
        .database
        .create_backup(&rescue)
        .map_err(|error| error.to_string())?;
    state
        .database
        .restore_from_snapshot(std::path::Path::new(&source))
        .map_err(|error| error.to_string())?;
    Ok(rescue.to_string_lossy().into_owned())
}

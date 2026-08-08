use std::{fs, path::Path};

use tauri::State;

use crate::{
    services::backup::{create_complete_backup, extract_complete_backup, CompleteBackupReport},
    AppState,
};

#[tauri::command]
pub fn create_library_backup(
    state: State<'_, AppState>,
    destination: String,
) -> Result<CompleteBackupReport, String> {
    create_complete_backup(
        &state.database,
        &state.originals_root,
        Path::new(&destination),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_library_backup(
    state: State<'_, AppState>,
    source: String,
) -> Result<String, String> {
    let backup_root = state.library_root.join("backups");
    fs::create_dir_all(&backup_root).map_err(|error| error.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let rescue = backup_root.join(format!("before-restore-{timestamp}.czkbackup"));
    create_complete_backup(&state.database, &state.originals_root, &rescue)
        .map_err(|error| error.to_string())?;

    let source = Path::new(&source);
    if source
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("sqlite3"))
    {
        state
            .database
            .restore_from_snapshot(source)
            .map_err(|error| error.to_string())?;
        return Ok(rescue.to_string_lossy().into_owned());
    }

    let staging = state
        .library_root
        .join(format!("restore-staging-{timestamp}"));
    let rollback_database = state
        .library_root
        .join(format!("rollback-{timestamp}.sqlite3"));
    let previous_originals = state
        .library_root
        .join(format!("originals-before-restore-{timestamp}"));
    let result = (|| {
        let extracted =
            extract_complete_backup(source, &staging).map_err(|error| error.to_string())?;

        let validation_root = staging.join("validation");
        let validation = crate::db::database::Database::open(&validation_root)
            .map_err(|error| error.to_string())?;
        validation
            .restore_from_snapshot(&extracted.database_path)
            .map_err(|error| error.to_string())?;
        drop(validation);

        state
            .database
            .create_backup(&rollback_database)
            .map_err(|error| error.to_string())?;
        if state.originals_root.exists() {
            fs::rename(&state.originals_root, &previous_originals)
                .map_err(|error| error.to_string())?;
        }
        if extracted.originals_root.exists() {
            fs::rename(&extracted.originals_root, &state.originals_root).map_err(|error| {
                let _ = fs::rename(&previous_originals, &state.originals_root);
                error.to_string()
            })?;
        } else {
            fs::create_dir_all(&state.originals_root).map_err(|error| error.to_string())?;
        }

        if let Err(error) = state
            .database
            .restore_from_snapshot(&extracted.database_path)
        {
            let failed_originals = state
                .library_root
                .join(format!("originals-failed-restore-{timestamp}"));
            let _ = fs::rename(&state.originals_root, failed_originals);
            let _ = fs::rename(&previous_originals, &state.originals_root);
            let _ = state.database.restore_from_snapshot(&rollback_database);
            return Err(error.to_string());
        }
        if previous_originals.exists() {
            let _ = fs::remove_dir_all(&previous_originals);
        }
        Ok(())
    })();
    let _ = fs::remove_file(&rollback_database);
    let _ = fs::remove_dir_all(&staging);
    result?;
    Ok(rescue.to_string_lossy().into_owned())
}

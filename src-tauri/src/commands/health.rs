use tauri::State;

use crate::{db::database::LibraryHealth, AppState};

#[tauri::command]
pub fn get_library_health(state: State<'_, AppState>) -> Result<LibraryHealth, String> {
    state.database.health().map_err(|error| error.to_string())
}

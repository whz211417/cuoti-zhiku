use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn get_courses(state: State<'_, AppState>) -> Result<Vec<crate::db::database::Course>, String> {
    state.database.list_courses().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_course(
    state: State<'_, AppState>,
    name: String,
    term: String,
    color: String,
) -> Result<crate::db::database::Course, String> {
    state.database.create_course(&name, &term, &color).map_err(|error| error.to_string())
}

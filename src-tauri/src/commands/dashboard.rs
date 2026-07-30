use tauri::State;

use crate::{
    domain::dashboard::{DashboardOverview, LibrarySearchResult},
    AppState,
};

#[tauri::command]
pub fn get_dashboard_overview(
    state: State<'_, AppState>,
    today: String,
) -> Result<DashboardOverview, String> {
    state
        .database
        .dashboard_overview(&today)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_library(
    state: State<'_, AppState>,
    query: String,
    limit: u32,
) -> Result<Vec<LibrarySearchResult>, String> {
    state
        .database
        .search_library(&query, limit)
        .map_err(|error| error.to_string())
}

use tauri::State;

use crate::{domain::problems::ProblemFieldKind, AppState};

#[tauri::command]
pub fn get_problem_document(
    state: State<'_, AppState>,
    problem_id: String,
) -> Result<crate::domain::problems::ProblemDocument, String> {
    state.database.get_problem_document(&problem_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_problem_field(
    state: State<'_, AppState>,
    problem_id: String,
    kind: String,
    value: String,
    expected_updated_at: String,
) -> Result<crate::domain::problems::SavedProblemField, String> {
    let kind = ProblemFieldKind::parse(&kind).ok_or_else(|| "不支持的题目字段。".to_owned())?;
    state
        .database
        .save_problem_field(&problem_id, kind, &value, &expected_updated_at)
        .map_err(|error| error.to_string())
}

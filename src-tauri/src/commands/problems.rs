use tauri::State;

use crate::{domain::problems::ProblemFieldKind, AppState};

#[tauri::command]
pub fn get_problem_document(
    state: State<'_, AppState>,
    problem_id: String,
) -> Result<crate::domain::problems::ProblemDocument, String> {
    state
        .database
        .get_problem_document(&problem_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_problem_field(
    state: State<'_, AppState>,
    problem_id: String,
    kind: String,
    value: String,
    expected_version: String,
) -> Result<crate::domain::problems::SavedProblemField, String> {
    let kind = ProblemFieldKind::parse(&kind).ok_or_else(|| "不支持的题目字段。".to_owned())?;
    state
        .database
        .save_problem_field(&problem_id, kind, &value, &expected_version)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn complete_review(
    state: State<'_, AppState>,
    problem_id: String,
    grade: String,
    reviewed_on: String,
) -> Result<crate::domain::review::ReviewSchedule, String> {
    let grade = crate::domain::review::ReviewGrade::parse(&grade)
        .ok_or_else(|| "不支持的复习评分。".to_owned())?;
    state
        .database
        .complete_review(&problem_id, grade, &reviewed_on)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_due_review_problems(
    state: State<'_, AppState>,
    today: String,
) -> Result<Vec<crate::db::database::ReviewProblem>, String> {
    state
        .database
        .list_due_review_problems(&today)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_problem_book(
    state: State<'_, AppState>,
    destination: String,
    include_answers: bool,
) -> Result<crate::db::database::ProblemBook, String> {
    state
        .database
        .write_problem_book(std::path::Path::new(&destination), include_answers)
        .map_err(|error| error.to_string())
}

use tauri::State;

use crate::{domain::knowledge::KnowledgeGraph, AppState};

#[tauri::command]
pub fn get_knowledge_graph(
    state: State<'_, AppState>,
    course_id: Option<String>,
    today: String,
) -> Result<KnowledgeGraph, String> {
    state
        .database
        .knowledge_graph(course_id.as_deref(), &today)
        .map_err(|error| error.to_string())
}

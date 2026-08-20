use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn import_course_material_file(
    state: State<'_, AppState>,
    course_id: String,
    path: String,
) -> Result<crate::db::database::CourseMaterial, String> {
    let path = std::path::Path::new(&path);
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "请选择有效的课程资料文件。".to_owned())?;
    let content = crate::services::material::extract_material_text(path)
        .map_err(|error| error.to_string())?;
    let original = crate::services::ingest::import_original(path, &state.originals_root)
        .map_err(|error| error.to_string())?;
    state
        .database
        .record_course_material_with_original(&course_id, filename, &content, Some(&original))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_course_material(
    state: State<'_, AppState>,
    course_id: String,
    filename: String,
    content: String,
) -> Result<crate::db::database::CourseMaterial, String> {
    state
        .database
        .record_course_material(&course_id, &filename, &content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_course_materials(
    state: State<'_, AppState>,
    course_id: String,
    deleted_only: bool,
) -> Result<Vec<crate::db::database::CourseMaterial>, String> {
    state
        .database
        .list_course_materials(&course_id, deleted_only)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn trash_course_material(
    state: State<'_, AppState>,
    course_id: String,
    material_id: String,
) -> Result<(), String> {
    state
        .database
        .trash_course_material(&course_id, &material_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_course_material(
    state: State<'_, AppState>,
    course_id: String,
    material_id: String,
) -> Result<(), String> {
    state
        .database
        .restore_course_material(&course_id, &material_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn purge_course_material(
    state: State<'_, AppState>,
    course_id: String,
    material_id: String,
) -> Result<(), String> {
    let original = state
        .database
        .purge_course_material(&course_id, &material_id)
        .map_err(|error| error.to_string())?;
    if let Some(relative_path) = original {
        crate::services::ingest::remove_original(&state.originals_root, &relative_path)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn search_course_material(
    state: State<'_, AppState>,
    course_id: String,
    query: String,
) -> Result<Vec<crate::db::database::MaterialSnippet>, String> {
    state
        .database
        .search_course_material(&course_id, &query, 6)
        .map_err(|error| error.to_string())
}

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
    state
        .database
        .record_course_material(&course_id, filename, &content)
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
) -> Result<Vec<crate::db::database::CourseMaterial>, String> {
    state.database.list_course_materials(&course_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_course_material(
    state: State<'_, AppState>,
    course_id: String,
    material_id: String,
) -> Result<(), String> {
    state.database.delete_course_material(&course_id, &material_id).map_err(|error| error.to_string())
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

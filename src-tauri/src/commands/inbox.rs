use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::{services::ingest::import_original, AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFileResult {
    pub source_path: String,
    pub item: Option<crate::db::database::InboxItem>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn import_files(
    state: State<'_, AppState>,
    paths: Vec<PathBuf>,
    course_id: Option<String>,
) -> Vec<ImportFileResult> {
    paths
        .into_iter()
        .map(|path| {
            let source_path = path.to_string_lossy().into_owned();
            let result = import_original(&path, &state.originals_root)
                .map_err(|error| error.to_string())
                .and_then(|original| {
                    state
                        .database
                        .record_inbox_item(path.file_name().and_then(|value| value.to_str()).unwrap_or("未命名文件"), &original, course_id.as_deref())
                        .map_err(|error| error.to_string())
                });
            match result {
                Ok(item) => ImportFileResult { source_path, item: Some(item), error: None },
                Err(error) => ImportFileResult { source_path, item: None, error: Some(error) },
            }
        })
        .collect()
}

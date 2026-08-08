use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use tauri::State;

use crate::{
    services::ingest::{import_original, import_original_bytes},
    AppState,
};

const MAX_CLIPBOARD_IMAGE_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFileResult {
    pub source_path: String,
    pub item: Option<crate::db::database::InboxItem>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_inbox_items(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::database::InboxItem>, String> {
    state
        .database
        .list_inbox_items()
        .map_err(|error| error.to_string())
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
                        .record_inbox_item(
                            path.file_name()
                                .and_then(|value| value.to_str())
                                .unwrap_or("未命名文件"),
                            &original,
                            course_id.as_deref(),
                        )
                        .map_err(|error| error.to_string())
                });
            match result {
                Ok(item) => ImportFileResult {
                    source_path,
                    item: Some(item),
                    error: None,
                },
                Err(error) => ImportFileResult {
                    source_path,
                    item: None,
                    error: Some(error),
                },
            }
        })
        .collect()
}

#[tauri::command]
pub fn import_clipboard_image(
    state: State<'_, AppState>,
    data_base64: String,
    mime_type: String,
    course_id: Option<String>,
) -> Result<crate::db::database::InboxItem, String> {
    if data_base64.len() > (MAX_CLIPBOARD_IMAGE_BYTES * 4 / 3) + 8 {
        return Err("剪贴板图片超过 25 MB，未导入。".to_owned());
    }
    let bytes = STANDARD
        .decode(data_base64)
        .map_err(|_| "剪贴板图片数据无效。".to_owned())?;
    if bytes.is_empty() || bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err("剪贴板图片为空或超过 25 MB，未导入。".to_owned());
    }
    let extension = match mime_type.as_str() {
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => "png",
        "image/jpeg" if bytes.starts_with(b"\xff\xd8\xff") => "jpg",
        "image/webp" if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" => {
            "webp"
        }
        "image/png" | "image/jpeg" | "image/webp" => {
            return Err("剪贴板图片格式与内容不一致。".to_owned())
        }
        _ => return Err("剪贴板中没有可导入的 PNG、JPEG 或 WebP 图片。".to_owned()),
    };
    let original = import_original_bytes(&bytes, extension, &state.originals_root)
        .map_err(|error| error.to_string())?;
    let filename = format!(
        "剪贴板截图-{}.{}",
        chrono::Local::now().format("%Y%m%d-%H%M%S"),
        extension
    );
    state
        .database
        .record_inbox_item(&filename, &original, course_id.as_deref())
        .map_err(|error| error.to_string())
}

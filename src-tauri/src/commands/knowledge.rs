use std::path::Path;

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

#[tauri::command]
pub fn export_obsidian_vault(
    state: State<'_, AppState>,
    destination: String,
    course_id: Option<String>,
    today: String,
) -> Result<crate::services::obsidian::ObsidianExportReport, String> {
    crate::services::obsidian::export_to_obsidian(
        &state.database,
        &state.originals_root,
        Path::new(&destination),
        course_id.as_deref(),
        &today,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_obsidian_canvas(canvas_path: String) -> Result<(), String> {
    let path = Path::new(&canvas_path);
    if !path.is_absolute() || path.extension().and_then(|value| value.to_str()) != Some("canvas") {
        return Err("只能打开已导出的 Obsidian Canvas 文件。".to_owned());
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| "找不到已导出的 Canvas 文件，请重新导出。".to_owned())?;
    let encoded = percent_encode(&canonical.to_string_lossy());
    let uri = format!("obsidian://open?path={encoded}");
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(uri)
            .spawn()
            .map_err(|_| "无法打开 Obsidian。导出文件仍然安全保存在所选目录。".to_owned())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = uri;
        Err("当前版本仅支持在 Windows 上打开 Obsidian。".to_owned())
    }
}

fn percent_encode(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (*byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

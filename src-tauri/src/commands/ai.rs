use base64::Engine;
use tauri::State;

use crate::{
    services::ai::{AiConnectionResult, AiProviderClient, AiProviderConfig, AnalysisMode},
    AppState,
};

#[tauri::command]
pub fn has_ai_api_key() -> bool {
    crate::services::credentials::has_api_key()
}

#[tauri::command]
pub fn has_ai_provider_key(provider_id: String) -> Result<bool, String> {
    crate::services::credentials::has_provider_key(&provider_id)
}

#[tauri::command]
pub fn save_ai_api_key(api_key: String) -> Result<(), String> {
    crate::services::credentials::save_api_key(&api_key)
}

#[tauri::command]
pub fn save_ai_provider_key(provider_id: String, api_key: String) -> Result<(), String> {
    crate::services::credentials::save_provider_key(&provider_id, &api_key)
}

#[tauri::command]
pub fn clear_ai_api_key() -> Result<(), String> {
    crate::services::credentials::clear_api_key()
}

#[tauri::command]
pub fn clear_ai_provider_key(provider_id: String) -> Result<(), String> {
    crate::services::credentials::clear_provider_key(&provider_id)
}

#[tauri::command]
pub fn get_ai_credential_migration_status(
) -> crate::services::credentials::CredentialMigrationStatus {
    crate::services::credentials::credential_migration_status()
}

#[tauri::command]
pub fn retry_ai_credential_migration() -> crate::services::credentials::CredentialMigrationStatus {
    crate::services::credentials::retry_credential_migration()
}

#[tauri::command]
pub async fn test_ai_provider(config: AiProviderConfig) -> Result<AiConnectionResult, String> {
    config.validate().map_err(|error| error.to_string())?;
    let api_key = crate::services::credentials::read_provider_key(&config.id)?;
    let client = AiProviderClient::new(config, api_key).map_err(|error| error.to_string())?;
    client
        .test_connection()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn run_problem_analysis(
    state: State<'_, AppState>,
    problem_id: String,
    mode: AnalysisMode,
    config: AiProviderConfig,
) -> Result<Vec<crate::services::ai::AiFieldSuggestion>, String> {
    let document = state
        .database
        .get_problem_document(&problem_id)
        .map_err(|error| error.to_string())?;
    let existing_text = document
        .fields
        .iter()
        .map(|field| format!("{}: {}", field.kind, field.value))
        .collect::<Vec<_>>()
        .join("\n");
    if existing_text.trim().is_empty() {
        return Err("请先补充题干或个人作答，再使用 AI 辅助整理。".to_owned());
    }
    config.validate().map_err(|error| error.to_string())?;
    let api_key = crate::services::credentials::read_provider_key(&config.id)?;
    let images = state
        .database
        .problem_attachment(&problem_id)
        .map_err(|error| error.to_string())?
        .filter(|attachment| attachment.mime_type.starts_with("image/"))
        .map(|attachment| {
            let path = state.originals_root.join(&attachment.relative_path);
            let bytes =
                std::fs::read(path).map_err(|error| format!("无法读取题目原图：{error}"))?;
            if bytes.len() > 15 * 1024 * 1024 {
                return Err("题图超过 15 MB，请压缩后重试。".to_owned());
            }
            Ok(crate::services::ai::AiImage {
                mime_type: attachment.mime_type,
                base64_data: base64::engine::general_purpose::STANDARD.encode(bytes),
            })
        })
        .transpose()?
        .into_iter()
        .collect::<Vec<_>>();
    let client = AiProviderClient::new(config, api_key).map_err(|error| error.to_string())?;
    client
        .analyze(mode, &existing_text, &[], &images)
        .await
        .map_err(|error| error.to_string())
}

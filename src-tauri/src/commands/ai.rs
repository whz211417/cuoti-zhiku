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
pub fn has_ai_provider_key(config: AiProviderConfig) -> Result<bool, String> {
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    crate::services::credentials::has_provider_key(&config.id, &endpoint)
}

#[tauri::command]
pub fn save_ai_api_key(api_key: String) -> Result<(), String> {
    crate::services::credentials::save_api_key(&api_key)
}

#[tauri::command]
pub fn save_ai_provider_key(config: AiProviderConfig, api_key: String) -> Result<(), String> {
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    crate::services::credentials::save_provider_key(&config.id, &endpoint, &api_key)
}

#[tauri::command]
pub fn clear_ai_api_key() -> Result<(), String> {
    crate::services::credentials::clear_api_key()
}

#[tauri::command]
pub fn clear_ai_provider_key(config: AiProviderConfig) -> Result<(), String> {
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    crate::services::credentials::clear_provider_key(&config.id, &endpoint)
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
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    let fingerprint = config.authorization_fingerprint().map_err(|error| error.to_string())?;
    let api_key = crate::services::credentials::read_provider_key(&config.id, &endpoint)?;
    let provider_id = config.id.clone();
    let client = AiProviderClient::new(config, api_key).map_err(|error| error.to_string())?;
    let result = client
        .test_connection()
        .await
        .map_err(|error| error.to_string())?;
    crate::services::credentials::record_tested_provider_config(
        &provider_id,
        &endpoint,
        &fingerprint,
    )?;
    Ok(result)
}

#[tauri::command]
pub fn activate_ai_provider(config: AiProviderConfig) -> Result<(), String> {
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    let fingerprint = config.authorization_fingerprint().map_err(|error| error.to_string())?;
    crate::services::credentials::activate_provider_config(&config.id, &endpoint, &fingerprint)
}

#[tauri::command]
pub fn is_ai_provider_active(config: AiProviderConfig) -> Result<bool, String> {
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    let fingerprint = config.authorization_fingerprint().map_err(|error| error.to_string())?;
    crate::services::credentials::is_active_provider_config(
        &config.id,
        &endpoint,
        &fingerprint,
    )
}

#[tauri::command]
pub async fn run_problem_analysis(
    state: State<'_, AppState>,
    problem_id: String,
    mode: AnalysisMode,
    config: AiProviderConfig,
    material_chunk_ids: Vec<String>,
    expected_version: String,
    include_original_image: bool,
) -> Result<Vec<crate::services::ai::AiFieldSuggestion>, String> {
    let document = state
        .database
        .get_problem_document(&problem_id)
        .map_err(|error| error.to_string())?;
    let prepared = crate::services::ai::prepare_analysis(
        &document,
        &config,
        &expected_version,
        include_original_image,
        crate::services::credentials::assert_active_provider_config,
        || {
            state
                .database
                .material_context_for_problem(&problem_id, &material_chunk_ids)
                .map_err(|error| error.to_string())
                .map(|snippets| snippets.into_iter().map(|snippet| crate::services::ai::AuthorizedMaterial {
                    chunk_id: snippet.chunk_id,
                    filename: snippet.filename,
                    excerpt: snippet.excerpt,
                }).collect())
        },
        crate::services::credentials::read_provider_key,
    )?;
    let images = if include_original_image {
        let attachment = state
            .database
            .problem_attachment(&problem_id)
            .map_err(|error| error.to_string())?
            .filter(|attachment| attachment.mime_type.starts_with("image/"))
            .ok_or_else(|| "题图已被移除或无法读取，请重新打开题目确认。".to_owned())?;
        let path = state.originals_root.join(&attachment.relative_path);
        let bytes = std::fs::read(path).map_err(|_| "无法读取题目原图，请检查本地原件后重试。".to_owned())?;
        if bytes.len() > 15 * 1024 * 1024 {
            return Err("题图超过 15 MB，请压缩后重试。".to_owned());
        }
        vec![crate::services::ai::AiImage {
            mime_type: attachment.mime_type,
            base64_data: base64::engine::general_purpose::STANDARD.encode(bytes),
        }]
    } else {
        Vec::new()
    };
    let client = AiProviderClient::new(config, prepared.api_key).map_err(|error| error.to_string())?;
    client
        .analyze(mode, &prepared.existing_text, &prepared.materials, &images)
        .await
        .map_err(|error| error.to_string())
}

#![cfg_attr(test, allow(dead_code))]

mod client;
mod providers;

#[allow(unused_imports)]
pub use client::{
    classify_status, classify_transport, parse_model_content, AiError, AiErrorKind,
    AiProviderClient, AiResponse,
};
#[allow(unused_imports)]
pub use providers::{
    build_analysis_request_body, build_probe_request_body, build_request_body, normalize_endpoint,
    AiImage, AiProviderConfig, AiRequest, AnalysisMode,
};

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiFieldSuggestion {
    pub kind: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthorizedMaterial {
    pub chunk_id: String,
    pub filename: String,
    pub excerpt: String,
}

#[derive(Debug)]
pub(crate) struct PreparedAnalysis {
    pub existing_text: String,
    pub materials: Vec<AuthorizedMaterial>,
    pub api_key: String,
}

pub(crate) fn prepare_analysis<VerifyCurrent, LoadMaterials, ReadCredential>(
    document: &crate::domain::problems::ProblemDocument,
    config: &AiProviderConfig,
    expected_version: &str,
    include_original_image: bool,
    verify_current: VerifyCurrent,
    load_materials: LoadMaterials,
    read_credential: ReadCredential,
) -> Result<PreparedAnalysis, String>
where
    VerifyCurrent: FnOnce(&str) -> Result<(), String>,
    LoadMaterials: FnOnce() -> Result<Vec<AuthorizedMaterial>, String>,
    ReadCredential: FnOnce(&str, &str) -> Result<String, String>,
{
    if document.version != expected_version {
        return Err("题目已在另一处更新，请重新核对发送范围。".to_owned());
    }
    let existing_text = document
        .fields
        .iter()
        .filter(|field| !field.value.trim().is_empty())
        .map(|field| format!("{}: {}", field.kind, field.value.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    if include_original_image && !document.has_image_attachment {
        return Err("这道题没有可发送的题图。".to_owned());
    }
    if existing_text.is_empty() && !include_original_image {
        return Err("请先补充题干或明确授权发送题图，再使用 AI 辅助整理。".to_owned());
    }
    let endpoint = config.validate().map_err(|error| error.to_string())?;
    config
        .analysis_model(include_original_image)
        .map_err(|error| error.to_string())?;
    let fingerprint = config
        .authorization_fingerprint()
        .map_err(|error| error.to_string())?;
    verify_current(&fingerprint)?;
    let materials = load_materials()?;
    let api_key = read_credential(&config.id, &endpoint)?;
    Ok(PreparedAnalysis {
        existing_text,
        materials,
        api_key,
    })
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionResult {
    pub authenticated: bool,
    pub model_available: bool,
    pub vision_declared: bool,
}

#[cfg(test)]
mod tests;

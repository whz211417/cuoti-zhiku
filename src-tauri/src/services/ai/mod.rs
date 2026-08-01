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

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionResult {
    pub authenticated: bool,
    pub model_available: bool,
    pub vision_declared: bool,
}

#[cfg(test)]
mod tests;

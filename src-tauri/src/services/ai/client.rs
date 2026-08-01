use std::{fmt, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{AiConnectionResult, AiFieldSuggestion, AiImage, AiProviderConfig, AnalysisMode};

const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AiErrorKind {
    Authentication,
    Quota,
    RateLimit,
    ModelNotFound,
    Format,
    Network,
    Timeout,
    Capability,
    Configuration,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AiError {
    kind: AiErrorKind,
    safe_message: String,
}

impl AiError {
    fn new(kind: AiErrorKind, safe_message: impl Into<String>) -> Self {
        Self {
            kind,
            safe_message: safe_message.into(),
        }
    }

    pub(crate) fn configuration(message: impl Into<String>) -> Self {
        Self::new(AiErrorKind::Configuration, message)
    }

    pub(crate) fn capability(message: impl Into<String>) -> Self {
        Self::new(AiErrorKind::Capability, message)
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn kind(&self) -> AiErrorKind {
        self.kind
    }
}

impl fmt::Display for AiError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.safe_message)
    }
}

impl std::error::Error for AiError {}

#[derive(Clone, Debug, Deserialize)]
pub struct AiResponse {
    choices: Vec<AiChoice>,
}

impl AiResponse {
    pub fn content(&self) -> Option<String> {
        extract_content(self)
    }
}

#[derive(Clone, Debug, Deserialize)]
struct AiChoice {
    message: AiResponseMessage,
}

#[derive(Clone, Debug, Deserialize)]
struct AiResponseMessage {
    content: Value,
}

pub struct AiProviderClient {
    config: AiProviderConfig,
    endpoint: String,
    api_key: String,
    http: reqwest::Client,
}

impl AiProviderClient {
    pub fn new(config: AiProviderConfig, api_key: String) -> Result<Self, AiError> {
        let endpoint = config.validate()?;
        if api_key.trim().is_empty() {
            return Err(AiError::new(
                AiErrorKind::Authentication,
                "尚未保存该 AI 平台的 API Key。",
            ));
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(config.request_timeout_seconds))
            .build()
            .map_err(|_| safe_error(AiErrorKind::Network))?;
        Ok(Self {
            config,
            endpoint,
            api_key,
            http,
        })
    }

    pub async fn test_connection(&self) -> Result<AiConnectionResult, AiError> {
        let body = super::build_probe_request_body(self.config.selected_model.trim());
        self.send(&body).await?;
        Ok(AiConnectionResult {
            authenticated: true,
            model_available: true,
            vision_declared: self.config.supports_vision,
        })
    }

    pub async fn analyze(
        &self,
        mode: AnalysisMode,
        existing_text: &str,
        material_excerpts: &[String],
        images: &[AiImage],
    ) -> Result<Vec<AiFieldSuggestion>, AiError> {
        let body = self
            .config
            .analysis_request(mode, existing_text, material_excerpts, images)?;
        let content = self.send(&body).await?;
        parse_model_content(&content)
    }

    async fn send(&self, body: &Value) -> Result<String, AiError> {
        let response = self
            .http
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(body)
            .send()
            .await
            .map_err(|error| safe_error(classify_transport(error.is_timeout())))?;
        let status = response.status().as_u16();
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES)
        {
            return Err(safe_error(AiErrorKind::Format));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| safe_error(classify_transport(error.is_timeout())))?;
        if bytes.len() as u64 > MAX_RESPONSE_BYTES {
            return Err(safe_error(AiErrorKind::Format));
        }
        let text = String::from_utf8_lossy(&bytes);
        if !(200..300).contains(&status) {
            return Err(safe_error(classify_status(status, &text)));
        }
        let response: AiResponse =
            serde_json::from_slice(&bytes).map_err(|_| safe_error(AiErrorKind::Format))?;
        response
            .content()
            .ok_or_else(|| safe_error(AiErrorKind::Format))
    }
}

fn extract_content(response: &AiResponse) -> Option<String> {
    let content = &response.choices.first()?.message.content;
    if let Some(text) = content.as_str() {
        return Some(text.to_owned());
    }
    content.as_array().and_then(|parts| {
        let joined = parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("");
        (!joined.is_empty()).then_some(joined)
    })
}

pub fn classify_status(status: u16, response_body: &str) -> AiErrorKind {
    let hint = response_body.to_ascii_lowercase();
    if status == 408 || status == 504 {
        AiErrorKind::Timeout
    } else if status == 401 || status == 403 {
        AiErrorKind::Authentication
    } else if status == 402
        || hint.contains("insufficient quota")
        || hint.contains("insufficient balance")
        || hint.contains("billing")
    {
        AiErrorKind::Quota
    } else if status == 429 {
        AiErrorKind::RateLimit
    } else if (status == 400 || status == 404)
        && (hint.contains("model") || hint.contains("deployment"))
    {
        AiErrorKind::ModelNotFound
    } else {
        AiErrorKind::Network
    }
}

pub fn classify_transport(is_timeout: bool) -> AiErrorKind {
    if is_timeout {
        AiErrorKind::Timeout
    } else {
        AiErrorKind::Network
    }
}

fn safe_error(kind: AiErrorKind) -> AiError {
    let message = match kind {
        AiErrorKind::Authentication => "API Key 无效或没有访问权限，请检查后重试。",
        AiErrorKind::Quota => "AI 账户额度不足或计费不可用，请在平台控制台检查余额。",
        AiErrorKind::RateLimit => "AI 平台当前请求过多，请稍后重试。",
        AiErrorKind::ModelNotFound => "所选模型不可用，请在 AI 设置中选择可用模型。",
        AiErrorKind::Format => "AI 返回内容无法安全解析，请重试或更换模型。",
        AiErrorKind::Network => "无法连接 AI 平台，请检查网络和接口地址。",
        AiErrorKind::Timeout => "AI 请求超时，请稍后重试或调整超时设置。",
        AiErrorKind::Capability => "当前 AI 配置不支持此请求。",
        AiErrorKind::Configuration => "AI 配置无效，请检查设置。",
    };
    AiError::new(kind, message)
}

#[derive(Deserialize)]
struct ModelFields {
    stem: Option<String>,
    standard_answer: Option<String>,
    explanation: Option<String>,
    mistake_reason: Option<String>,
    #[serde(default)]
    knowledge_points: Vec<String>,
    #[serde(default)]
    citations: Vec<Value>,
}

pub fn parse_model_content(content: &str) -> Result<Vec<AiFieldSuggestion>, AiError> {
    let fields: ModelFields =
        serde_json::from_str(content).map_err(|_| safe_error(AiErrorKind::Format))?;
    if !fields.citations.is_empty() {
        return Err(AiError::new(
            AiErrorKind::Format,
            "AI 返回了无法对应到本地片段的教材引用，已拒绝本次引用。",
        ));
    }
    let mut suggestions = Vec::new();
    push_suggestion(&mut suggestions, "stem", fields.stem);
    push_suggestion(&mut suggestions, "standard_answer", fields.standard_answer);
    push_suggestion(&mut suggestions, "explanation", fields.explanation);
    push_suggestion(&mut suggestions, "mistake_reason", fields.mistake_reason);
    let knowledge_points = fields
        .knowledge_points
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if !knowledge_points.is_empty() {
        suggestions.push(AiFieldSuggestion {
            kind: "notes".to_owned(),
            value: format!("知识点：{}", knowledge_points.join("、")),
        });
    }
    Ok(suggestions)
}

fn push_suggestion(suggestions: &mut Vec<AiFieldSuggestion>, kind: &str, value: Option<String>) {
    if let Some(value) = value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    {
        suggestions.push(AiFieldSuggestion {
            kind: kind.to_owned(),
            value,
        });
    }
}

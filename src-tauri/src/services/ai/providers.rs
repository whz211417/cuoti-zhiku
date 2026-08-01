use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::AiError;

const COMPLETIONS_SUFFIX: &str = "/chat/completions";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisMode {
    Flash,
    Deep,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiProviderConfig {
    pub id: String,
    pub display_name: String,
    pub base_url: String,
    pub selected_model: String,
    pub vision_model: Option<String>,
    pub supports_vision: bool,
    pub request_timeout_seconds: u64,
    pub allow_insecure_localhost: bool,
}

#[derive(Clone, Debug)]
pub struct AiImage {
    pub mime_type: String,
    pub base64_data: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct AiRequest {
    pub model: String,
    pub messages: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<Value>,
    pub max_completion_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

impl AiProviderConfig {
    pub fn validate(&self) -> Result<String, AiError> {
        if self.id.is_empty()
            || !self.id.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '-' || character == '_'
            })
        {
            return Err(AiError::configuration("AI 平台标识无效，请重新选择平台。"));
        }
        if self.selected_model.trim().is_empty() {
            return Err(AiError::configuration("请先填写或选择模型。"));
        }
        if !(10..=180).contains(&self.request_timeout_seconds) {
            return Err(AiError::configuration("请求超时必须设置为 10 到 180 秒。"));
        }
        normalize_endpoint(&self.base_url, self.allow_insecure_localhost)
    }

    pub fn analysis_request(
        &self,
        mode: AnalysisMode,
        existing_text: &str,
        material_excerpts: &[String],
        images: &[AiImage],
    ) -> Result<Value, AiError> {
        self.validate()?;
        let model = if images.is_empty() {
            self.selected_model.trim()
        } else {
            if !self.supports_vision {
                return Err(AiError::capability(
                    "当前平台配置不支持图片理解。请选择支持图片的模型，或先手动补充题干。",
                ));
            }
            self.vision_model
                .as_deref()
                .map(str::trim)
                .filter(|model| !model.is_empty())
                .ok_or_else(|| {
                    AiError::capability(
                        "当前平台尚未配置图片模型。请在 AI 设置中选择图片模型后重试。",
                    )
                })?
        };
        Ok(build_analysis_request_body(
            model,
            mode,
            existing_text,
            material_excerpts,
            images,
        ))
    }
}

pub fn normalize_endpoint(
    base_url: &str,
    allow_insecure_localhost: bool,
) -> Result<String, AiError> {
    let candidate = base_url.trim();
    if candidate.is_empty() || candidate.contains('\\') {
        return Err(AiError::configuration("AI 接口地址格式无效。"));
    }
    if candidate.contains('?') || candidate.contains('#') {
        return Err(AiError::configuration(
            "AI 接口地址不能包含查询参数或片段。",
        ));
    }

    let (raw_scheme, remainder) = candidate
        .split_once("://")
        .ok_or_else(|| AiError::configuration("AI 接口地址必须使用 HTTPS。"))?;
    let scheme = raw_scheme.to_ascii_lowercase();
    if scheme != "https" && scheme != "http" {
        return Err(AiError::configuration("AI 接口地址必须使用 HTTPS。"));
    }
    let authority_end = remainder.find('/').unwrap_or(remainder.len());
    let authority = &remainder[..authority_end];
    let raw_path = &remainder[authority_end..];
    if authority.is_empty()
        || authority.contains('@')
        || raw_path.contains('%')
        || raw_path.contains("//")
        || raw_path
            .split('/')
            .any(|segment| segment == "." || segment == "..")
    {
        return Err(AiError::configuration("AI 接口地址格式无效。"));
    }

    let mut url =
        Url::parse(candidate).map_err(|_| AiError::configuration("AI 接口地址格式无效。"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
    {
        return Err(AiError::configuration("AI 接口地址格式无效。"));
    }

    if scheme == "http" {
        if !allow_insecure_localhost || !is_exact_loopback_authority(authority) {
            return Err(AiError::configuration(
                "远程 AI 接口必须使用 HTTPS；HTTP 仅可用于已确认的本机服务。",
            ));
        }
    }

    let mut path = url.path().trim_end_matches('/').to_owned();
    while path.ends_with(COMPLETIONS_SUFFIX) {
        path.truncate(path.len() - COMPLETIONS_SUFFIX.len());
        path = path.trim_end_matches('/').to_owned();
    }
    path.push_str(COMPLETIONS_SUFFIX);
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn is_exact_loopback_authority(authority: &str) -> bool {
    if let Some(rest) = authority.strip_prefix('[') {
        let Some((host, suffix)) = rest.split_once(']') else {
            return false;
        };
        return host.eq_ignore_ascii_case("::1")
            && (suffix.is_empty()
                || suffix.strip_prefix(':').is_some_and(|port| {
                    !port.is_empty() && port.chars().all(|c| c.is_ascii_digit())
                }));
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (authority, None),
    };
    let valid_port =
        port.is_none_or(|port| !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()));
    valid_port && (host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1")
}

pub fn build_probe_request_body(model: &str) -> Value {
    serde_json::to_value(AiRequest {
        model: model.to_owned(),
        messages: vec![json!({ "role": "user", "content": "只回复 OK" })],
        response_format: None,
        max_completion_tokens: 8,
        temperature: None,
    })
    .expect("AI probe request is serializable")
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn build_request_body(
    model: &str,
    existing_text: &str,
    material_excerpts: &[String],
    images: &[AiImage],
) -> Value {
    build_analysis_request_body(
        model,
        AnalysisMode::Flash,
        existing_text,
        material_excerpts,
        images,
    )
}

pub fn build_analysis_request_body(
    model: &str,
    mode: AnalysisMode,
    existing_text: &str,
    material_excerpts: &[String],
    images: &[AiImage],
) -> Value {
    let materials = if material_excerpts.is_empty() {
        "本次没有提供教材片段；citations 必须返回空数组。".to_owned()
    } else {
        material_excerpts
            .iter()
            .enumerate()
            .map(|(index, excerpt)| format!("[本地片段 {}]\n{}", index + 1, excerpt))
            .collect::<Vec<_>>()
            .join("\n\n")
    };
    let mut user_content = vec![json!({
        "type": "text",
        "text": format!(
            "请生成可审核的字段建议。\n\n现有题目内容：\n{}\n\n允许使用的本地教材片段：\n{}",
            existing_text, materials
        )
    })];
    user_content.extend(images.iter().map(|image| {
        json!({
            "type": "image_url",
            "image_url": {
                "url": format!("data:{};base64,{}", image.mime_type, image.base64_data)
            }
        })
    }));
    let (mode_instruction, budget) = match mode {
        AnalysisMode::Flash => ("用简洁、直接的方式完成整理。", 1200),
        AnalysisMode::Deep => ("逐步核对题意、推理过程和常见错因，给出更深入的解析。", 2400),
    };
    serde_json::to_value(AiRequest {
        model: model.to_owned(),
        messages: vec![
            json!({
                "role": "system",
                "content": format!(
                    "你是中文学习题目整理助手。{}只输出 JSON，不要 Markdown。不得捏造教材依据。字段必须为 stem、standard_answer、explanation、mistake_reason、knowledge_points、citations；不确定内容使用 null。没有提供教材片段时 citations 必须为空数组。",
                    mode_instruction
                )
            }),
            json!({ "role": "user", "content": user_content }),
        ],
        response_format: Some(json!({ "type": "json_object" })),
        max_completion_tokens: budget,
        temperature: Some(0.2),
    })
    .expect("AI analysis request is serializable")
}

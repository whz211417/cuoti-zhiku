#![cfg_attr(test, allow(dead_code))]

use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisMode {
    Flash,
    Deep,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiFieldSuggestion {
    pub kind: String,
    pub value: String,
}

#[derive(Clone, Debug)]
pub struct AiImage {
    pub mime_type: String,
    pub base64_data: String,
}

#[derive(Debug)]
pub enum AiError {
    InvalidResponse(String),
    Network(String),
}

impl fmt::Display for AiError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidResponse(message) => formatter.write_str(message),
            Self::Network(message) => write!(formatter, "AI 请求没有完成：{message}"),
        }
    }
}

impl std::error::Error for AiError {}

pub fn model_for(mode: AnalysisMode) -> &'static str {
    match mode {
        AnalysisMode::Flash => "qwen3-vl-flash",
        AnalysisMode::Deep => "qwen3-vl-plus",
    }
}

pub fn build_request_body(
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
        "text": format!("请生成可审核的字段建议。\n\n现有题目内容：\n{}\n\n允许使用的本地教材片段：\n{}", existing_text, materials)
    })];
    user_content.extend(images.iter().map(|image| {
        json!({
            "type": "image_url",
            "image_url": {
                "url": format!("data:{};base64,{}", image.mime_type, image.base64_data)
            }
        })
    }));
    json!({
        "model": model_for(mode),
        "messages": [
            {
                "role": "system",
                "content": "你是中文经济学错题整理助手。请只输出 JSON，不要 Markdown。不得捏造教材依据。字段必须为 stem、standard_answer、explanation、mistake_reason、knowledge_points、citations；不确定内容使用 null。citations 暂时必须为空数组。"
            },
            {
                "role": "user",
                "content": user_content
            }
        ],
        "response_format": { "type": "json_object" },
        "max_completion_tokens": 1800,
        "temperature": 0.2
    })
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
    let fields: ModelFields = serde_json::from_str(content)
        .map_err(|_| AiError::InvalidResponse("AI 返回的字段格式无法审核，请重试。".to_owned()))?;
    if !fields.citations.is_empty() {
        return Err(AiError::InvalidResponse(
            "AI 返回了无法对应到本地片段的教材引用，已拒绝本次教材引用。".to_owned(),
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

pub async fn request_analysis(
    api_key: &str,
    mode: AnalysisMode,
    existing_text: &str,
    material_excerpts: &[String],
    images: &[AiImage],
) -> Result<Vec<AiFieldSuggestion>, AiError> {
    let response = reqwest::Client::new()
        .post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        .bearer_auth(api_key)
        .timeout(std::time::Duration::from_secs(90))
        .json(&build_request_body(
            mode,
            existing_text,
            material_excerpts,
            images,
        ))
        .send()
        .await
        .map_err(|error| AiError::Network(error.to_string()))?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|error| AiError::Network(error.to_string()))?;
    if !status.is_success() {
        let message = body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("请检查 API Key、账户余额或网络连接。");
        return Err(AiError::Network(message.to_owned()));
    }
    let content = body
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| AiError::InvalidResponse("AI 没有返回可审核内容。".to_owned()))?;
    parse_model_content(content)
}

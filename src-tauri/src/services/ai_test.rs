use serde_json::json;

use super::ai::{build_request_body, model_for, parse_model_content, AiImage, AnalysisMode};

#[test]
fn maps_only_explicit_analysis_modes_to_supported_qwen_models() {
    assert_eq!(model_for(AnalysisMode::Flash), "qwen3-vl-flash");
    assert_eq!(model_for(AnalysisMode::Deep), "qwen3-vl-plus");
}

#[test]
fn builds_a_structured_request_without_embedding_the_api_key() {
    let body = build_request_body(AnalysisMode::Flash, "财政扩张如何影响 IS 曲线？", &[], &[]);
    let serialized = serde_json::to_string(&body).expect("serialize request");

    assert!(serialized.contains("json_object"));
    assert!(serialized.contains("qwen3-vl-flash"));
    assert!(!serialized.contains("api-key"));
}

#[test]
fn includes_only_explicitly_supplied_question_images_in_the_request() {
    let body = build_request_body(
        AnalysisMode::Flash,
        "请识别题图并整理。",
        &[],
        &[AiImage {
            mime_type: "image/png".to_owned(),
            base64_data: "aW1hZ2U=".to_owned(),
        }],
    );
    let serialized = serde_json::to_string(&body).expect("serialize request");

    assert!(serialized.contains("data:image/png;base64,aW1hZ2U="));
}

#[test]
fn rejects_model_citations_that_cannot_be_verified_locally() {
    let content = json!({
        "stem": "测试题",
        "standard_answer": "测试答案",
        "explanation": null,
        "mistake_reason": null,
        "knowledge_points": [],
        "citations": [{ "chunk_id": "unknown", "quote": "not local" }]
    })
    .to_string();

    let error = parse_model_content(&content).expect_err("unverified citation rejected");

    assert!(error.to_string().contains("教材引用"));
}

#[test]
fn converts_only_non_empty_fields_into_reviewable_suggestions() {
    let content = json!({
        "stem": "财政扩张如何影响 IS 曲线？",
        "standard_answer": "IS 曲线向右移动。",
        "explanation": "政府购买增加会提高总需求。",
        "mistake_reason": "",
        "knowledge_points": ["IS-LM 模型", "财政政策"],
        "citations": []
    })
    .to_string();

    let suggestions = parse_model_content(&content).expect("valid suggestions");

    assert_eq!(suggestions.len(), 4);
    assert!(suggestions
        .iter()
        .any(|field| field.kind == "standard_answer"));
    assert!(suggestions
        .iter()
        .any(|field| field.kind == "notes" && field.value.contains("IS-LM 模型")));
}

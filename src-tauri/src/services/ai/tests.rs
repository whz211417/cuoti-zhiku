use super::{
    build_analysis_request_body, build_probe_request_body, build_request_body, classify_status,
    classify_transport, normalize_endpoint, parse_model_content, AiErrorKind, AiImage,
    AiProviderClient, AiProviderConfig, AnalysisMode,
};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

const TEST_MAX_RESPONSE_BYTES: usize = 1024 * 1024;

fn accept_before(listener: &TcpListener, timeout: Duration) -> Option<TcpStream> {
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => return Some(stream),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return None;
                }
                thread::sleep(Duration::from_millis(5));
            }
            Err(error) => panic!("local mock accept failed: {error}"),
        }
    }
}

fn read_http_request(stream: &mut TcpStream) -> (String, Vec<u8>) {
    stream
        .set_nonblocking(false)
        .expect("restore blocking mock connection");
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("configure mock request timeout");
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 2048];
    let header_end = loop {
        let read = stream.read(&mut buffer).expect("read local mock request");
        assert!(read > 0, "request ended before headers");
        bytes.extend_from_slice(&buffer[..read]);
        if let Some(position) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break position + 4;
        }
    };
    let headers = String::from_utf8_lossy(&bytes[..header_end]).into_owned();
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().expect("valid content length"))
        })
        .unwrap_or(0);
    while bytes.len() < header_end + content_length {
        let read = stream.read(&mut buffer).expect("read local mock body");
        assert!(read > 0, "request ended before body");
        bytes.extend_from_slice(&buffer[..read]);
    }
    (
        headers,
        bytes[header_end..header_end + content_length].to_vec(),
    )
}

fn config(base_url: String) -> AiProviderConfig {
    AiProviderConfig {
        id: "custom-local".to_owned(),
        display_name: "Local test".to_owned(),
        base_url,
        selected_model: "model-x".to_owned(),
        vision_model: Some("vision-x".to_owned()),
        supports_vision: true,
        request_timeout_seconds: 10,
        allow_insecure_localhost: true,
    }
}

fn spawn_json_server(
    status: u16,
    response_body: &'static str,
) -> (String, mpsc::Receiver<Value>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local mock server");
    listener
        .set_nonblocking(true)
        .expect("configure local mock server");
    let address = listener.local_addr().expect("local mock address");
    let (request_sender, request_receiver) = mpsc::channel();
    let handle = thread::spawn(move || {
        let mut stream =
            accept_before(&listener, Duration::from_secs(5)).expect("local mock request timed out");
        let (_, body) = read_http_request(&mut stream);
        let body = serde_json::from_slice(&body).expect("JSON request body");
        let _ = request_sender.send(body);

        let reason = if status == 200 { "OK" } else { "Error" };
        let response = format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
            response_body.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write local mock response");
    });
    (format!("http://{address}/v1"), request_receiver, handle)
}

#[derive(Debug)]
struct RedirectObservation {
    received: bool,
    had_authorization: bool,
    had_question_marker: bool,
}

fn spawn_redirect_pair(
    status: u16,
) -> (
    String,
    mpsc::Receiver<RedirectObservation>,
    thread::JoinHandle<()>,
    thread::JoinHandle<()>,
) {
    let target_listener = TcpListener::bind("127.0.0.1:0").expect("bind redirect target");
    target_listener
        .set_nonblocking(true)
        .expect("configure redirect target");
    let target_address = target_listener
        .local_addr()
        .expect("redirect target address");
    let (observation_sender, observation_receiver) = mpsc::channel();
    let target = thread::spawn(move || {
        let Some(mut stream) = accept_before(&target_listener, Duration::from_millis(750)) else {
            observation_sender
                .send(RedirectObservation {
                    received: false,
                    had_authorization: false,
                    had_question_marker: false,
                })
                .expect("record absent redirect");
            return;
        };
        let (headers, body) = read_http_request(&mut stream);
        observation_sender
            .send(RedirectObservation {
                received: true,
                had_authorization: headers.to_ascii_lowercase().contains("authorization:"),
                had_question_marker: String::from_utf8_lossy(&body)
                    .contains("sensitive-question-marker"),
            })
            .expect("record followed redirect");
        let response_body = r#"{"choices":[{"message":{"content":"{\"stem\":\"redirected\",\"knowledge_points\":[],\"citations\":[]}"}}]}"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
            response_body.len()
        );
        let _ = stream.write_all(response.as_bytes());
    });

    let redirect_listener = TcpListener::bind("127.0.0.1:0").expect("bind redirect source");
    redirect_listener
        .set_nonblocking(true)
        .expect("configure redirect source");
    let redirect_address = redirect_listener
        .local_addr()
        .expect("redirect source address");
    let source = thread::spawn(move || {
        let mut stream = accept_before(&redirect_listener, Duration::from_secs(5))
            .expect("redirect source request timed out");
        let _ = read_http_request(&mut stream);
        let location = format!("http://{target_address}/redirect-location-marker");
        let response_body = r#"{"marker":"redirect-response-marker"}"#;
        let response = format!(
            "HTTP/1.1 {status} Redirect\r\nLocation: {location}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
            response_body.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write redirect response");
    });
    (
        format!("http://{redirect_address}/v1"),
        observation_receiver,
        source,
        target,
    )
}

fn spawn_oversized_chunked_error_server() -> (String, mpsc::Receiver<usize>, thread::JoinHandle<()>)
{
    const CHUNK_BYTES: usize = 16 * 1024;
    const TOTAL_BYTES: usize = 4 * 1024 * 1024;
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind chunked mock");
    listener
        .set_nonblocking(true)
        .expect("configure chunked mock");
    let address = listener.local_addr().expect("chunked mock address");
    let (written_sender, written_receiver) = mpsc::channel();
    let server = thread::spawn(move || {
        let mut stream = accept_before(&listener, Duration::from_secs(5))
            .expect("chunked mock request timed out");
        let _ = read_http_request(&mut stream);
        stream
            .write_all(
                b"HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
            )
            .expect("write chunked response headers");
        let mut payload = vec![b'x'; CHUNK_BYTES];
        payload[..25].copy_from_slice(b"sensitive-response-marker");
        let mut written = 0;
        while written < TOTAL_BYTES {
            let header = format!("{:X}\r\n", payload.len());
            if stream.write_all(header.as_bytes()).is_err()
                || stream.write_all(&payload).is_err()
                || stream.write_all(b"\r\n").is_err()
                || stream.flush().is_err()
            {
                break;
            }
            written += payload.len();
            thread::sleep(Duration::from_millis(2));
        }
        if written == TOTAL_BYTES {
            let _ = stream.write_all(b"0\r\n\r\n");
        }
        written_sender
            .send(written)
            .expect("record chunked bytes written");
    });
    (format!("http://{address}/v1"), written_receiver, server)
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("build local test runtime")
        .block_on(future)
}

#[test]
fn rejects_remote_http_but_allows_only_explicit_loopback_http() {
    assert!(normalize_endpoint("http://api.example.com/v1", false).is_err());
    assert!(normalize_endpoint("http://localhost:11434/v1", false).is_err());
    assert!(normalize_endpoint("http://localhost:11434/v1", true).is_ok());
    assert!(normalize_endpoint("http://127.0.0.1:11434/v1", true).is_ok());
    assert!(normalize_endpoint("http://[::1]:11434/v1", true).is_ok());

    for unsafe_url in [
        "http://localhost.evil.example/v1",
        "http://localhost@evil.example/v1",
        "http://127.0.0.1.evil.example/v1",
        "http://2130706433/v1",
        "http://017700000001/v1",
        "http://0x7f000001/v1",
    ] {
        assert!(
            normalize_endpoint(unsafe_url, true).is_err(),
            "{unsafe_url}"
        );
    }
}

#[test]
fn normalizes_exactly_one_completion_suffix_and_rejects_url_ambiguity() {
    assert_eq!(
        normalize_endpoint("https://api.example.com/v1/", false).unwrap(),
        "https://api.example.com/v1/chat/completions"
    );
    assert_eq!(
        normalize_endpoint(
            "https://api.example.com/v1/chat/completions/chat/completions/",
            false,
        )
        .unwrap(),
        "https://api.example.com/v1/chat/completions"
    );

    for unsafe_url in [
        "ftp://api.example.com/v1",
        "https://user:pass@api.example.com/v1",
        "https://api.example.com/v1?redirect=http://localhost",
        "https://api.example.com/v1#fragment",
        "https://api.example.com/v1/%2e%2e/secret",
        "https://api.example.com/v1//shadow",
        "https:\\api.example.com\\v1",
    ] {
        assert!(
            normalize_endpoint(unsafe_url, false).is_err(),
            "{unsafe_url}"
        );
    }
}

#[test]
fn normalizes_every_bundled_provider_base_url() {
    for (base_url, endpoint) in [
        (
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        ),
        (
            "https://api.deepseek.com",
            "https://api.deepseek.com/chat/completions",
        ),
        (
            "https://open.bigmodel.cn/api/paas/v4",
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        ),
        (
            "https://api.moonshot.cn/v1",
            "https://api.moonshot.cn/v1/chat/completions",
        ),
        (
            "https://api.openai.com/v1",
            "https://api.openai.com/v1/chat/completions",
        ),
    ] {
        assert_eq!(normalize_endpoint(base_url, false).unwrap(), endpoint);
    }
}

#[test]
fn validates_timeout_model_and_provider_identifier_without_a_key_field() {
    let serialized = serde_json::to_value(config("https://api.example.com/v1".to_owned())).unwrap();
    assert!(serialized.get("apiKey").is_none());

    let mut invalid = config("https://api.example.com/v1".to_owned());
    invalid.request_timeout_seconds = 9;
    assert!(invalid.validate().is_err());
    invalid.request_timeout_seconds = 181;
    assert!(invalid.validate().is_err());
    invalid.request_timeout_seconds = 60;
    invalid.selected_model = "   ".to_owned();
    assert!(invalid.validate().is_err());
    invalid.selected_model = "model-x".to_owned();
    invalid.id = "unsafe/id".to_owned();
    assert!(invalid.validate().is_err());
}

#[test]
fn builds_generic_request_without_provider_branches_or_economics_copy() {
    let body = build_request_body("model-x", "题干", &[], &[]);
    assert_eq!(body["model"], "model-x");
    assert!(body.to_string().contains("中文学习题目整理助手"));
    assert!(!body.to_string().contains("经济学"));
}

#[test]
fn mode_changes_instructions_and_budget_but_never_the_selected_model() {
    let flash = build_analysis_request_body("chosen-model", AnalysisMode::Flash, "题干", &[], &[]);
    let deep = build_analysis_request_body("chosen-model", AnalysisMode::Deep, "题干", &[], &[]);

    assert_eq!(flash["model"], "chosen-model");
    assert_eq!(deep["model"], "chosen-model");
    assert_ne!(
        flash["max_completion_tokens"],
        deep["max_completion_tokens"]
    );
    assert_ne!(
        flash["messages"][0]["content"],
        deep["messages"][0]["content"]
    );
}

#[test]
fn probe_is_minimal_text_only_and_uses_the_selected_model() {
    let body = build_probe_request_body("model-x");
    assert_eq!(body["model"], "model-x");
    assert_eq!(body["max_completion_tokens"], 8);
    assert_eq!(body["messages"].as_array().unwrap().len(), 1);
    assert_eq!(body["messages"][0]["content"], "只回复 OK");
    assert!(!body.to_string().contains("image_url"));
    assert!(!body.to_string().contains("本地片段"));
}

#[test]
fn selects_declared_vision_model_and_never_silently_drops_images() {
    let image = AiImage {
        mime_type: "image/png".to_owned(),
        base64_data: "cGxhY2Vob2xkZXI=".to_owned(),
    };
    let provider = config("https://api.example.com/v1".to_owned());
    let body = provider
        .analysis_request(AnalysisMode::Flash, "题干", &[], &[image.clone()])
        .unwrap();
    assert_eq!(body["model"], "vision-x");
    assert!(body.to_string().contains("image_url"));

    let mut no_vision_model = provider.clone();
    no_vision_model.vision_model = None;
    let error = no_vision_model
        .analysis_request(AnalysisMode::Flash, "题干", &[], &[image.clone()])
        .unwrap_err();
    assert_eq!(error.kind(), AiErrorKind::Capability);

    let mut unsupported = provider;
    unsupported.supports_vision = false;
    let error = unsupported
        .analysis_request(AnalysisMode::Flash, "题干", &[], &[image])
        .unwrap_err();
    assert_eq!(error.kind(), AiErrorKind::Capability);
}

#[test]
fn classifies_all_public_error_categories() {
    assert_eq!(classify_status(401, ""), AiErrorKind::Authentication);
    assert_eq!(
        classify_status(403, "forbidden"),
        AiErrorKind::Authentication
    );
    assert_eq!(
        classify_status(402, "insufficient balance"),
        AiErrorKind::Quota
    );
    assert_eq!(
        classify_status(429, "insufficient quota"),
        AiErrorKind::Quota
    );
    assert_eq!(classify_status(429, "rate limit"), AiErrorKind::RateLimit);
    assert_eq!(
        classify_status(404, "model not found"),
        AiErrorKind::ModelNotFound
    );
    assert_eq!(
        classify_status(400, "unknown model"),
        AiErrorKind::ModelNotFound
    );
    assert_eq!(
        classify_status(408, "request timeout"),
        AiErrorKind::Timeout
    );
    assert_eq!(classify_status(500, "server error"), AiErrorKind::Network);
    assert_eq!(classify_transport(true), AiErrorKind::Timeout);
    assert_eq!(classify_transport(false), AiErrorKind::Network);
}

#[test]
fn local_mock_verifies_probe_request_and_success_response() {
    let (base_url, captured, server) =
        spawn_json_server(200, r#"{"choices":[{"message":{"content":"OK"}}]}"#);
    let client = AiProviderClient::new(config(base_url), "placeholder-key".to_owned()).unwrap();

    let result = block_on(client.test_connection()).unwrap();
    let request = captured.recv_timeout(Duration::from_secs(2)).unwrap();
    server.join().unwrap();

    assert!(result.authenticated);
    assert!(result.model_available);
    assert!(result.vision_declared);
    assert_eq!(request, build_probe_request_body("model-x"));
}

#[test]
fn local_mock_maps_service_failures_to_safe_errors() {
    let (base_url, _, server) = spawn_json_server(
        401,
        r#"{"error":{"message":"secret-response-marker placeholder-key"}}"#,
    );
    let client = AiProviderClient::new(config(base_url), "placeholder-key".to_owned()).unwrap();

    let error = block_on(client.test_connection()).unwrap_err();
    server.join().unwrap();

    assert_eq!(error.kind(), AiErrorKind::Authentication);
    assert!(!error.to_string().contains("placeholder-key"));
    assert!(!error.to_string().contains("secret-response-marker"));
}

#[test]
fn never_follows_307_or_308_redirects_with_question_or_credentials() {
    for status in [307, 308] {
        let (base_url, observed, source, target) = spawn_redirect_pair(status);
        let client = AiProviderClient::new(config(base_url), "placeholder-key".to_owned()).unwrap();

        let outcome =
            block_on(client.analyze(AnalysisMode::Flash, "sensitive-question-marker", &[], &[]));
        let observation = observed.recv_timeout(Duration::from_secs(2)).unwrap();
        source.join().unwrap();
        target.join().unwrap();

        assert!(!observation.received);
        assert!(!observation.had_authorization);
        assert!(!observation.had_question_marker);
        let error = outcome.unwrap_err();
        assert_eq!(error.kind(), AiErrorKind::Network);
        assert!(!error.to_string().contains("redirect-location-marker"));
        assert!(!error.to_string().contains("redirect-response-marker"));
        assert!(!error.to_string().contains("placeholder-key"));
        assert!(!error.to_string().contains("sensitive-question-marker"));
    }
}

#[test]
fn aborts_chunked_error_response_just_after_the_size_limit() {
    const TOTAL_BYTES: usize = 4 * 1024 * 1024;
    let (base_url, written, server) = spawn_oversized_chunked_error_server();
    let client = AiProviderClient::new(config(base_url), "placeholder-key".to_owned()).unwrap();

    let error = block_on(client.test_connection()).unwrap_err();
    let written = written.recv_timeout(Duration::from_secs(2)).unwrap();
    server.join().unwrap();

    assert_eq!(error.kind(), AiErrorKind::Format);
    assert!(
        written < TOTAL_BYTES,
        "client consumed the complete response"
    );
    assert!(written <= TEST_MAX_RESPONSE_BYTES + 8 * 16 * 1024);
    assert!(!error.to_string().contains("sensitive-response-marker"));
    assert!(!error.to_string().contains("placeholder-key"));
}

#[test]
fn local_mock_parses_analysis_fields_without_exposing_response_text() {
    let (base_url, captured, server) = spawn_json_server(
        200,
        r#"{"choices":[{"message":{"content":"{\"stem\":\"供审核题干\",\"standard_answer\":\"答案\",\"explanation\":null,\"mistake_reason\":null,\"knowledge_points\":[],\"citations\":[]}"}}]}"#,
    );
    let client = AiProviderClient::new(config(base_url), "placeholder-key".to_owned()).unwrap();

    let suggestions = block_on(client.analyze(AnalysisMode::Deep, "原题", &[], &[])).unwrap();
    let request = captured.recv_timeout(Duration::from_secs(2)).unwrap();
    server.join().unwrap();

    assert_eq!(request["model"], "model-x");
    assert!(suggestions
        .iter()
        .any(|suggestion| suggestion.kind == "stem" && suggestion.value == "供审核题干"));
}

#[test]
fn malformed_success_response_becomes_a_safe_format_error() {
    let (base_url, _, server) = spawn_json_server(200, r#"{"secret":"secret-response-marker"}"#);
    let client = AiProviderClient::new(config(base_url), "placeholder-key".to_owned()).unwrap();

    let error = block_on(client.test_connection()).unwrap_err();
    server.join().unwrap();

    assert_eq!(error.kind(), AiErrorKind::Format);
    assert!(!error.to_string().contains("placeholder-key"));
    assert!(!error.to_string().contains("secret-response-marker"));
}

#[test]
fn parses_review_fields_and_rejects_unverifiable_citations() {
    let suggestions = parse_model_content(
        r#"{"stem":"题目","standard_answer":"答案","explanation":"解析","mistake_reason":"错因","knowledge_points":["IS 曲线"],"citations":[]}"#,
    )
    .unwrap();
    assert!(suggestions
        .iter()
        .any(|item| item.kind == "standard_answer"));
    assert!(suggestions.iter().any(|item| item.kind == "notes"));

    let error = parse_model_content(
        r#"{"stem":"题目","knowledge_points":[],"citations":[{"source":"伪造教材"}]}"#,
    )
    .unwrap_err();
    assert_eq!(error.kind(), AiErrorKind::Format);
}

#[test]
fn deserializes_camel_case_config_without_accepting_credentials() {
    let value = json!({
        "id": "deepseek",
        "displayName": "DeepSeek",
        "baseUrl": "https://api.deepseek.com",
        "selectedModel": "deepseek-v4-flash",
        "visionModel": null,
        "supportsVision": false,
        "requestTimeoutSeconds": 60,
        "allowInsecureLocalhost": false
    });
    let provider: AiProviderConfig = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(provider.id, "deepseek");
    assert_eq!(provider.selected_model, "deepseek-v4-flash");

    let mut with_embedded_key = value;
    with_embedded_key["apiKey"] = json!("must-not-cross-native-config");
    assert!(serde_json::from_value::<AiProviderConfig>(with_embedded_key).is_err());
}

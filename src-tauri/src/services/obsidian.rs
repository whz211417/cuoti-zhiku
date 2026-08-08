use std::{
    collections::HashMap,
    fmt, fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::db::database::{
    Database, ObsidianExportCourse, ObsidianExportProblem, ObsidianExportSnapshot,
};

const MANAGED_DIRECTORY: &str = "错题智库";
const MANIFEST_NAME: &str = "_同步清单.json";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ObsidianExportReport {
    pub written: usize,
    pub unchanged: usize,
    pub conflicts: usize,
    pub failed: usize,
    pub course_canvas_path: Option<String>,
}

#[derive(Debug)]
pub enum ObsidianExportError {
    Database(String),
    Io(std::io::Error),
    InvalidDestination(String),
    Manifest(serde_json::Error),
}

impl fmt::Display for ObsidianExportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(message) => write!(formatter, "无法读取本地资料库：{message}"),
            Self::Io(error) => write!(formatter, "无法写入 Obsidian 导出目录：{error}"),
            Self::InvalidDestination(message) => formatter.write_str(message),
            Self::Manifest(error) => write!(formatter, "无法生成同步清单：{error}"),
        }
    }
}

impl std::error::Error for ObsidianExportError {}

impl From<std::io::Error> for ObsidianExportError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ObsidianExportError {
    fn from(error: serde_json::Error) -> Self {
        Self::Manifest(error)
    }
}

#[derive(Debug, Clone)]
struct DesiredFile {
    relative_path: PathBuf,
    bytes: Vec<u8>,
    cuoti_id: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    format_version: u8,
    exported_at: String,
    files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    path: String,
    sha256: String,
    cuoti_id: String,
}

pub fn export_to_obsidian(
    database: &Database,
    originals_root: &Path,
    destination: &Path,
    course_id: Option<&str>,
    today: &str,
) -> Result<ObsidianExportReport, ObsidianExportError> {
    validate_destination(destination)?;
    fs::create_dir_all(destination)?;
    let managed_root = destination.join(MANAGED_DIRECTORY);
    if managed_root.exists() && fs::symlink_metadata(&managed_root)?.file_type().is_symlink() {
        return Err(ObsidianExportError::InvalidDestination(
            "导出目录不能通过符号链接跳转。".to_owned(),
        ));
    }
    fs::create_dir_all(&managed_root)?;

    let snapshot = database
        .obsidian_export_snapshot(course_id, today)
        .map_err(|error| ObsidianExportError::Database(error.to_string()))?;
    let desired = build_desired_files(&snapshot, originals_root)?;
    let prior_manifest = read_manifest(&managed_root.join(MANIFEST_NAME));
    let prior_hashes = prior_manifest
        .map(|manifest| manifest.files.into_iter().map(|file| (file.path, file.sha256)).collect())
        .unwrap_or_else(HashMap::new);
    let mut report = ObsidianExportReport {
        written: 0,
        unchanged: 0,
        conflicts: 0,
        failed: 0,
        course_canvas_path: None,
    };
    let mut next_manifest_files = Vec::new();

    for file in desired {
        let canonical_relative = slash_path(&file.relative_path);
        let desired_hash = sha256(&file.bytes);
        let target = managed_root.join(&file.relative_path);
        ensure_inside(&managed_root, &target)?;
        let written_relative = if target.is_file() {
            let current_hash = sha256(&fs::read(&target)?);
            if current_hash == desired_hash {
                report.unchanged += 1;
                file.relative_path.clone()
            } else if prior_hashes.get(&canonical_relative) == Some(&current_hash) {
                atomic_write(&target, &file.bytes)?;
                report.written += 1;
                file.relative_path.clone()
            } else {
                let conflict = conflict_path(&target);
                atomic_write(&conflict, &file.bytes)?;
                report.conflicts += 1;
                conflict
                    .strip_prefix(&managed_root)
                    .map_err(|_| ObsidianExportError::InvalidDestination("冲突副本超出导出目录。".to_owned()))?
                    .to_path_buf()
            }
        } else {
            atomic_write(&target, &file.bytes)?;
            report.written += 1;
            file.relative_path.clone()
        };
        let written_path = slash_path(&written_relative);
        if file.relative_path.file_name().and_then(|name| name.to_str()) == Some("课程知识网络.canvas") {
            report.course_canvas_path = Some(managed_root.join(&written_relative).to_string_lossy().into_owned());
        }
        next_manifest_files.push(ManifestFile {
            path: written_path,
            sha256: desired_hash,
            cuoti_id: file.cuoti_id,
        });
    }

    next_manifest_files.sort_by(|left, right| left.path.cmp(&right.path));
    let manifest = ExportManifest {
        format_version: 1,
        exported_at: Utc::now().to_rfc3339(),
        files: next_manifest_files,
    };
    atomic_write(
        &managed_root.join(MANIFEST_NAME),
        &serde_json::to_vec_pretty(&manifest)?,
    )?;
    Ok(report)
}

fn build_desired_files(
    snapshot: &ObsidianExportSnapshot,
    originals_root: &Path,
) -> Result<Vec<DesiredFile>, ObsidianExportError> {
    let mut files = Vec::new();
    for course in &snapshot.courses {
        let course_directory = PathBuf::from(sanitize_filename(&course.name));
        let course_topics = snapshot
            .graph
            .topics
            .iter()
            .filter(|topic| topic.course_id == course.id)
            .collect::<Vec<_>>();
        let course_problems = snapshot
            .problems
            .iter()
            .filter(|problem| problem.course_id == course.id)
            .collect::<Vec<_>>();

        files.push(text_file(
            course_directory.join("课程概览.md"),
            course_overview_markdown(course, &course_topics),
            course.id.clone(),
        ));
        for topic in &course_topics {
            files.push(text_file(
                course_directory
                    .join("知识点")
                    .join(format!("{}.md", sanitize_filename(&topic.name))),
                topic_markdown(topic, &course_problems),
                topic.id.clone(),
            ));
        }
        for problem in &course_problems {
            files.push(text_file(
                course_directory
                    .join("错题")
                    .join(format!("题目-{}.md", sanitize_filename(&problem.id))),
                problem_markdown(problem),
                problem.id.clone(),
            ));
            for attachment in &problem.attachments {
                let source = originals_root.join(&attachment.relative_path);
                ensure_inside(originals_root, &source)?;
                if !source.is_file() {
                    return Err(ObsidianExportError::InvalidDestination(format!(
                        "题目 {} 的本地原件缺失，已停止导出。",
                        problem.id
                    )));
                }
                files.push(DesiredFile {
                    relative_path: course_directory.join("附件").join(format!(
                        "{}-{}",
                        sanitize_filename(&problem.id),
                        sanitize_filename(&attachment.filename)
                    )),
                    bytes: fs::read(source)?,
                    cuoti_id: problem.id.clone(),
                });
            }
        }
        files.push(text_file(
            course_directory.join("课程知识网络.canvas"),
            serde_json::to_string_pretty(&course_canvas(
                course,
                &course_directory,
                &course_topics,
                &course_problems,
            ))?,
            course.id.clone(),
        ));
    }
    Ok(files)
}

fn course_overview_markdown(
    course: &ObsidianExportCourse,
    topics: &[&crate::domain::knowledge::KnowledgeTopic],
) -> String {
    let mut markdown = format!(
        "---\ncuoti_id: {}\ncourse_id: {}\nkind: course\nupdated_at: {}\n---\n\n# {}\n\n",
        yaml(&course.id), yaml(&course.id), yaml(&course.updated_at), course.name
    );
    if !course.term.trim().is_empty() {
        markdown.push_str(&format!("学期：{}\n\n", course.term.trim()));
    }
    markdown.push_str("## 知识点\n\n");
    if topics.is_empty() {
        markdown.push_str("尚未从已整理题目中形成知识点。\n");
    } else {
        for topic in topics {
            markdown.push_str(&format!(
                "- [{}](知识点/{}.md) · {} 道题 · 掌握度 {}\n",
                topic.name,
                markdown_path(&sanitize_filename(&topic.name)),
                topic.problem_count,
                topic.mastery_score
            ));
        }
    }
    markdown
}

fn topic_markdown(
    topic: &crate::domain::knowledge::KnowledgeTopic,
    problems: &[&ObsidianExportProblem],
) -> String {
    let mut markdown = format!(
        "---\ncuoti_id: {}\ncourse_id: {}\nkind: knowledge_topic\nmastery: {}\n---\n\n# {}\n\n关联错题：{} 道，到期复习：{} 道。\n\n",
        yaml(&topic.id), yaml(&topic.course_id), topic.mastery_score, topic.name,
        topic.problem_count, topic.due_count
    );
    if !topic.mistake_reasons.is_empty() {
        markdown.push_str("## 常见错因\n\n");
        for reason in &topic.mistake_reasons {
            markdown.push_str(&format!("- {}\n", reason));
        }
        markdown.push('\n');
    }
    markdown.push_str("## 关联题目\n\n");
    for problem_id in &topic.problem_ids {
        if let Some(problem) = problems.iter().find(|problem| &problem.id == problem_id) {
            markdown.push_str(&format!(
                "- [{}](../错题/题目-{}.md)\n",
                problem.title,
                markdown_path(&sanitize_filename(&problem.id))
            ));
        }
    }
    markdown
}

fn problem_markdown(problem: &ObsidianExportProblem) -> String {
    let mut markdown = format!(
        "---\ncuoti_id: {}\ncourse_id: {}\nkind: problem\nupdated_at: {}\n---\n\n# {}\n",
        yaml(&problem.id), yaml(&problem.course_id), yaml(&problem.updated_at), problem.title
    );
    for (kind, heading) in [
        ("stem", "题干"),
        ("own_answer", "我的作答"),
        ("standard_answer", "标准答案"),
        ("explanation", "解析"),
        ("mistake_reason", "错因"),
        ("notes", "知识点与笔记"),
    ] {
        if let Some(value) = problem.fields.get(kind).filter(|value| !value.trim().is_empty()) {
            markdown.push_str(&format!("\n## {heading}\n\n{}\n", value.trim()));
        }
    }
    if !problem.attachments.is_empty() {
        markdown.push_str("\n## 原件\n\n");
        for attachment in &problem.attachments {
            let exported_name = format!(
                "{}-{}",
                sanitize_filename(&problem.id),
                sanitize_filename(&attachment.filename)
            );
            markdown.push_str(&format!(
                "- [{}](../附件/{})\n",
                attachment.filename,
                markdown_path(&exported_name)
            ));
        }
    }
    markdown
}

fn course_canvas(
    course: &ObsidianExportCourse,
    course_directory: &Path,
    topics: &[&crate::domain::knowledge::KnowledgeTopic],
    problems: &[&ObsidianExportProblem],
) -> serde_json::Value {
    let vault_prefix = PathBuf::from(MANAGED_DIRECTORY).join(course_directory);
    let mut nodes = vec![json!({
        "id": format!("course-{}", course.id), "type": "file",
        "file": slash_path(&vault_prefix.join("课程概览.md")),
        "x": 0, "y": 160, "width": 300, "height": 180
    })];
    let mut edges = Vec::new();
    for (index, topic) in topics.iter().enumerate() {
        let topic_node_id = format!("topic-{}", topic.id);
        nodes.push(json!({
            "id": topic_node_id, "type": "file",
            "file": slash_path(&vault_prefix.join("知识点").join(format!("{}.md", sanitize_filename(&topic.name)))),
            "x": 430, "y": (index as i64) * 180, "width": 300, "height": 140
        }));
        edges.push(json!({
            "id": format!("edge-course-{}", topic.id), "fromNode": format!("course-{}", course.id),
            "fromSide": "right", "toNode": topic_node_id, "toSide": "left", "label": "包含"
        }));
    }
    for (index, problem) in problems.iter().enumerate() {
        let problem_node_id = format!("problem-{}", problem.id);
        nodes.push(json!({
            "id": problem_node_id, "type": "file",
            "file": slash_path(&vault_prefix.join("错题").join(format!("题目-{}.md", sanitize_filename(&problem.id)))),
            "x": 860, "y": (index as i64) * 150, "width": 340, "height": 120
        }));
        for topic in topics.iter().filter(|topic| topic.problem_ids.contains(&problem.id)) {
            edges.push(json!({
                "id": format!("edge-{}-{}", topic.id, problem.id), "fromNode": format!("topic-{}", topic.id),
                "fromSide": "right", "toNode": problem_node_id, "toSide": "left", "label": "涉及"
            }));
        }
    }
    json!({ "nodes": nodes, "edges": edges })
}

fn text_file(relative_path: PathBuf, content: String, cuoti_id: String) -> DesiredFile {
    DesiredFile { relative_path, bytes: content.into_bytes(), cuoti_id }
}

fn read_manifest(path: &Path) -> Option<ExportManifest> {
    fs::read(path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

fn validate_destination(destination: &Path) -> Result<(), ObsidianExportError> {
    if destination.as_os_str().is_empty() {
        return Err(ObsidianExportError::InvalidDestination("请选择 Obsidian Vault 目录。".to_owned()));
    }
    if destination.exists() && fs::symlink_metadata(destination)?.file_type().is_symlink() {
        return Err(ObsidianExportError::InvalidDestination("Vault 目录不能是符号链接。".to_owned()));
    }
    Ok(())
}

fn ensure_inside(root: &Path, candidate: &Path) -> Result<(), ObsidianExportError> {
    if !candidate.starts_with(root) || candidate.components().any(|part| matches!(part, std::path::Component::ParentDir)) {
        return Err(ObsidianExportError::InvalidDestination("导出路径超出用户选择的目录。".to_owned()));
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), ObsidianExportError> {
    let parent = path.parent().ok_or_else(|| ObsidianExportError::InvalidDestination("导出文件没有安全的父目录。".to_owned()))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".{}.partial", path.file_name().and_then(|name| name.to_str()).unwrap_or("export")));
    fs::write(&temporary, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary, path)?;
    Ok(())
}

fn conflict_path(path: &Path) -> PathBuf {
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("文件");
    let extension = path.extension().and_then(|value| value.to_str());
    let name = match extension {
        Some(extension) => format!("{stem}.错题智库冲突-{stamp}.{extension}"),
        None => format!("{stem}.错题智库冲突-{stamp}"),
    };
    path.with_file_name(name)
}

fn sanitize_filename(value: &str) -> String {
    let mut sanitized = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { character }
        })
        .take(80)
        .collect::<String>();
    sanitized = sanitized.trim_end_matches([' ', '.']).to_owned();
    if sanitized.is_empty() { "未命名".to_owned() } else { sanitized }
}

fn markdown_path(value: &str) -> String {
    value.replace(' ', "%20")
}

fn slash_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn yaml(value: &str) -> String {
    serde_json::to_string(value).expect("serializing a string cannot fail")
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

use std::fs;

use tempfile::tempdir;

use crate::{
    db::database::Database,
    domain::problems::ProblemFieldKind,
    services::{
        ingest::import_original,
        obsidian::export_to_obsidian,
    },
};

fn prepared_library() -> (tempfile::TempDir, Database, String) {
    let root = tempdir().expect("library root");
    let database = Database::open(root.path()).expect("database");
    let course = database
        .create_course("宏观/经济学", "2026 春", "#5e9ce6", "school")
        .expect("course");
    let source = root.path().join("is-lm.png");
    fs::write(&source, b"question-image").expect("source image");
    let originals = root.path().join("originals");
    let original = import_original(&source, &originals).expect("import original");
    let inbox = database
        .record_inbox_item("IS:LM?.png", &original, Some(&course.id))
        .expect("problem");

    let mut document = database.get_problem_document(&inbox.problem_id).expect("document");
    for (kind, value) in [
        (ProblemFieldKind::Stem, "财政扩张如何影响 IS 曲线？"),
        (ProblemFieldKind::StandardAnswer, "IS 曲线向右移动。"),
        (ProblemFieldKind::Explanation, "总需求上升。"),
        (ProblemFieldKind::MistakeReason, "混淆货币政策"),
        (ProblemFieldKind::Notes, "知识点：IS 曲线、财政政策"),
    ] {
        let saved = database
            .save_problem_field(&inbox.problem_id, kind, value, &document.version)
            .expect("field");
        document.version = saved.version;
    }
    (root, database, course.id)
}

#[test]
fn exports_readable_markdown_canvas_manifest_and_attachments() {
    let (library, database, course_id) = prepared_library();
    let vault = tempdir().expect("vault");

    let report = export_to_obsidian(
        &database,
        &library.path().join("originals"),
        vault.path(),
        Some(&course_id),
        "2026-08-08",
    )
    .expect("export");

    assert!(report.written >= 6);
    assert_eq!(report.conflicts, 0);
    let managed = vault.path().join("错题智库");
    let course_dir = managed.join("宏观_经济学");
    assert!(course_dir.join("课程概览.md").is_file());
    assert!(course_dir.join("课程知识网络.canvas").is_file());
    assert!(managed.join("_同步清单.json").is_file());
    let canvas: serde_json::Value = serde_json::from_slice(
        &fs::read(course_dir.join("课程知识网络.canvas")).expect("canvas"),
    )
    .expect("valid canvas json");
    assert!(canvas["nodes"].as_array().is_some_and(|nodes| nodes.len() >= 3));
    assert!(canvas["edges"].as_array().is_some_and(|edges| edges.len() >= 2));
    let problem_markdown = fs::read_dir(course_dir.join("错题"))
        .expect("problem dir")
        .next()
        .expect("problem file")
        .expect("problem entry")
        .path();
    let markdown = fs::read_to_string(problem_markdown).expect("markdown");
    assert!(markdown.contains("cuoti_id:"));
    assert!(markdown.contains("财政扩张如何影响 IS 曲线？"));
    assert!(fs::read_dir(course_dir.join("附件")).expect("attachments").next().is_some());
}

#[test]
fn preserves_user_edits_and_writes_a_conflict_copy() {
    let (library, database, course_id) = prepared_library();
    let vault = tempdir().expect("vault");
    export_to_obsidian(
        &database,
        &library.path().join("originals"),
        vault.path(),
        Some(&course_id),
        "2026-08-08",
    )
    .expect("first export");
    let overview = vault.path().join("错题智库/宏观_经济学/课程概览.md");
    fs::write(&overview, "用户在 Obsidian 中写下的内容").expect("edit overview");

    let report = export_to_obsidian(
        &database,
        &library.path().join("originals"),
        vault.path(),
        Some(&course_id),
        "2026-08-08",
    )
    .expect("second export");

    assert_eq!(fs::read_to_string(&overview).expect("preserved"), "用户在 Obsidian 中写下的内容");
    assert_eq!(report.conflicts, 1);
    assert!(fs::read_dir(overview.parent().expect("course dir"))
        .expect("course files")
        .filter_map(Result::ok)
        .any(|entry| entry.file_name().to_string_lossy().contains("错题智库冲突")));
}

use super::database::Database;
use crate::services::ingest::ImportedOriginal;
use rusqlite::Connection;

#[test]
fn opens_a_wal_database_with_foreign_keys_enabled() {
    let root = tempfile::tempdir().expect("temporary library root");
    let database = Database::open(root.path()).expect("open library database");

    assert!(database.foreign_keys_enabled().expect("foreign key status"));
    assert_eq!(database.journal_mode().expect("journal mode"), "wal");
    assert_eq!(database.schema_version().expect("schema version"), 4);
}

#[test]
fn reports_database_health_without_exposing_its_connection() {
    let root = tempfile::tempdir().expect("temporary library root");
    let database = Database::open(root.path()).expect("open library database");

    let health = database.health().expect("library health");

    assert_eq!(health.schema_version, 4);
    assert!(health.foreign_keys_enabled);
    assert_eq!(health.journal_mode, "wal");
}

#[test]
fn writes_a_consistent_backup_to_a_new_destination() {
    let root = tempfile::tempdir().expect("temporary library root");
    let destination = root.path().join("错题智库备份.sqlite3");
    let database = Database::open(root.path()).expect("open library database");
    database
        .create_course("宏观经济学", "", "#CE8876")
        .expect("course");

    database
        .create_backup(&destination)
        .expect("backup created");
    let restored = Connection::open(&destination).expect("open backup");

    assert!(destination.is_file());
    assert_eq!(
        restored
            .query_row("SELECT COUNT(*) FROM courses", [], |row| row
                .get::<_, i64>(0))
            .expect("courses"),
        1
    );
}

#[test]
fn restores_a_valid_snapshot_into_the_open_library() {
    let current_root = tempfile::tempdir().expect("current library root");
    let source_root = tempfile::tempdir().expect("source library root");
    let snapshot = source_root.path().join("library-backup.sqlite3");
    let current = Database::open(current_root.path()).expect("current database");
    current
        .create_course("旧课程", "", "#777777")
        .expect("old course");
    let source = Database::open(source_root.path()).expect("source database");
    source
        .create_course("宏观经济学", "", "#4A78A8")
        .expect("source course");
    source.create_backup(&snapshot).expect("source snapshot");

    current
        .restore_from_snapshot(&snapshot)
        .expect("restore snapshot");
    let courses = current.list_courses().expect("restored courses");

    assert_eq!(courses.len(), 1);
    assert_eq!(courses[0].name, "宏观经济学");
}

#[test]
fn refuses_to_restore_a_file_that_is_not_a_valid_library() {
    let root = tempfile::tempdir().expect("library root");
    let invalid = root.path().join("invalid.sqlite3");
    std::fs::write(&invalid, b"not a sqlite database").expect("invalid fixture");
    let database = Database::open(root.path()).expect("database");

    let error = database
        .restore_from_snapshot(&invalid)
        .expect_err("invalid restore rejected");

    assert!(error.to_string().contains("备份"));
}

#[test]
fn returns_the_local_question_image_for_an_explicit_ai_preview() {
    let root = tempfile::tempdir().expect("library root");
    let database = Database::open(root.path()).expect("database");
    let original = ImportedOriginal {
        sha256: "a".repeat(64),
        relative_path: std::path::PathBuf::from("aa/bb/question.png"),
        mime_type: "image/png".to_owned(),
        byte_size: 128,
        duplicate: false,
    };
    let item = database
        .record_inbox_item("question.png", &original, None)
        .expect("inbox item");

    let attachment = database
        .problem_attachment(&item.problem_id)
        .expect("attachment lookup")
        .expect("question attachment");

    assert_eq!(attachment.relative_path, original.relative_path);
    assert_eq!(attachment.mime_type, "image/png");
}

use std::fs;

use tempfile::tempdir;

use crate::{
    db::database::Database,
    services::{
        backup::{create_complete_backup, extract_complete_backup},
        ingest::import_original,
    },
};

#[test]
fn complete_backup_contains_a_valid_database_and_originals() {
    let library = tempdir().expect("library");
    let database = Database::open(library.path()).expect("database");
    database
        .create_course("宏观经济学", "2026 春", "#5e9ce6", "school")
        .expect("course");
    let source = library.path().join("question.png");
    fs::write(&source, b"real-image-bytes").expect("source");
    let original = import_original(&source, &library.path().join("originals")).expect("original");
    let destination = library.path().join("library.czkbackup");

    let report = create_complete_backup(&database, &library.path().join("originals"), &destination)
        .expect("backup");
    assert_eq!(report.original_count, 1);
    assert!(report.total_bytes > original.byte_size);

    let staging = tempdir().expect("staging");
    let extracted = extract_complete_backup(&destination, staging.path()).expect("extract");
    let restored = Database::open(&staging.path().join("restored-db")).expect("restored db");
    restored
        .restore_from_snapshot(&extracted.database_path)
        .expect("valid database");
    assert_eq!(restored.list_courses().expect("courses").len(), 1);
    assert_eq!(
        fs::read(extracted.originals_root.join(original.relative_path)).expect("restored original"),
        b"real-image-bytes"
    );
}

#[test]
fn complete_backup_rejects_tampered_content() {
    let library = tempdir().expect("library");
    let database = Database::open(library.path()).expect("database");
    let destination = library.path().join("library.czkbackup");
    create_complete_backup(&database, &library.path().join("originals"), &destination)
        .expect("backup");
    let mut bytes = fs::read(&destination).expect("archive");
    let last = bytes.last_mut().expect("archive bytes");
    *last ^= 0xff;
    fs::write(&destination, bytes).expect("tamper");

    let staging = tempdir().expect("staging");
    let error = extract_complete_backup(&destination, staging.path()).expect_err("must reject");
    assert!(error.to_string().contains("校验"));
}

use std::fs;

use crate::db::database::Database;

use super::ingest::import_original;

#[test]
fn stores_content_once_under_its_sha256_path() {
    let temp = tempfile::tempdir().expect("temporary file library");
    let source = temp.path().join("elasticity.png");
    fs::write(&source, b"elasticity").expect("fixture source");

    let first = import_original(&source, &temp.path().join("originals")).expect("first import");
    let second = import_original(&source, &temp.path().join("originals")).expect("duplicate import");

    assert!(temp.path().join("originals").join(&first.relative_path).is_file());
    assert!(!first.duplicate);
    assert!(second.duplicate);
    assert_eq!(first.sha256, second.sha256);
}

#[test]
fn creates_distinct_inbox_records_that_share_a_duplicate_original() {
    let temp = tempfile::tempdir().expect("temporary file library");
    let source = temp.path().join("is-lm.pdf");
    fs::write(&source, b"is-lm").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");

    let first_original = import_original(&source, &temp.path().join("originals")).expect("first import");
    let first = database.record_inbox_item("is-lm.pdf", &first_original, None).expect("first inbox item");
    let second_original = import_original(&source, &temp.path().join("originals")).expect("duplicate import");
    let second = database.record_inbox_item("is-lm.pdf", &second_original, None).expect("second inbox item");

    assert_ne!(first.id, second.id);
    assert_eq!(first.attachment_id, second.attachment_id);
    assert_eq!(first.filename, "is-lm.pdf");
}

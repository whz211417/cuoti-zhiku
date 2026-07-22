use std::fs;

use crate::{db::database::{Database, DatabaseError}, services::ingest::import_original};

use super::problems::ProblemFieldKind;

#[test]
fn rejects_a_field_save_based_on_a_stale_document_version() {
    let temp = tempfile::tempdir().expect("temporary library");
    let source = temp.path().join("is-lm.png");
    fs::write(&source, b"IS-LM").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");
    let original = import_original(&source, &temp.path().join("originals")).expect("original");
    let inbox = database.record_inbox_item("is-lm.png", &original, None).expect("inbox item");
    let expected_version = database.problem_updated_at(&inbox.problem_id).expect("initial version");

    let first = database
        .save_problem_field(&inbox.problem_id, ProblemFieldKind::Stem, "扩张性财政政策如何影响 IS 曲线？", &expected_version)
        .expect("first save");
    let document = database.get_problem_document(&inbox.problem_id).expect("saved document");
    let stale = database.save_problem_field(
        &inbox.problem_id,
        ProblemFieldKind::Stem,
        "过期文本",
        &expected_version,
    );

    assert_eq!(first.value, "扩张性财政政策如何影响 IS 曲线？");
    assert_eq!(document.updated_at, first.updated_at);
    assert_eq!(document.fields[0].kind, "stem");
    assert_eq!(document.fields[0].value, first.value);
    assert!(matches!(stale, Err(DatabaseError::Conflict(_))));
}

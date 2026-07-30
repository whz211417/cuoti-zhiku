use std::fs;

use crate::{
    db::database::{Database, DatabaseError},
    services::ingest::import_original,
};

use super::{problems::ProblemFieldKind, review::ReviewGrade};

#[test]
fn rejects_a_field_save_based_on_a_stale_document_version() {
    let temp = tempfile::tempdir().expect("temporary library");
    let source = temp.path().join("is-lm.png");
    fs::write(&source, b"IS-LM").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");
    let original = import_original(&source, &temp.path().join("originals")).expect("original");
    let inbox = database
        .record_inbox_item("is-lm.png", &original, None)
        .expect("inbox item");
    let expected_version = database
        .problem_updated_at(&inbox.problem_id)
        .expect("initial version");

    let first = database
        .save_problem_field(
            &inbox.problem_id,
            ProblemFieldKind::Stem,
            "扩张性财政政策如何影响 IS 曲线？",
            &expected_version,
        )
        .expect("first save");
    let document = database
        .get_problem_document(&inbox.problem_id)
        .expect("saved document");
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

#[test]
fn persists_the_next_review_date_after_a_grade() {
    let temp = tempfile::tempdir().expect("temporary library");
    let source = temp.path().join("review.png");
    fs::write(&source, b"review").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");
    let original = import_original(&source, &temp.path().join("originals")).expect("original");
    let inbox = database
        .record_inbox_item("review.png", &original, None)
        .expect("inbox item");

    let schedule = database
        .complete_review(&inbox.problem_id, ReviewGrade::Familiar, "2026-07-22")
        .expect("review saved");

    assert_eq!(schedule.interval_days, 2);
    assert_eq!(schedule.next_review_on, "2026-07-24");
}

#[test]
fn lists_only_due_problems_with_a_question_stem() {
    let temp = tempfile::tempdir().expect("temporary library");
    let source = temp.path().join("due-review.png");
    fs::write(&source, b"due review").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");
    let original = import_original(&source, &temp.path().join("originals")).expect("original");
    let inbox = database
        .record_inbox_item("due-review.png", &original, None)
        .expect("inbox item");
    let version = database
        .problem_updated_at(&inbox.problem_id)
        .expect("initial version");

    database
        .save_problem_field(
            &inbox.problem_id,
            ProblemFieldKind::Stem,
            "IS 曲线右移的原因是什么？",
            &version,
        )
        .expect("question stem saved");

    let due = database
        .list_due_review_problems("2026-07-22")
        .expect("due reviews");

    assert_eq!(due.len(), 1);
    assert_eq!(due[0].id, inbox.problem_id);
    assert_eq!(due[0].stem, "IS 曲线右移的原因是什么？");
}

#[test]
fn builds_separate_question_and_answer_books_from_local_records() {
    let temp = tempfile::tempdir().expect("temporary library");
    let source = temp.path().join("export.png");
    fs::write(&source, b"export").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");
    let original = import_original(&source, &temp.path().join("originals")).expect("original");
    let inbox = database
        .record_inbox_item("export.png", &original, None)
        .expect("inbox item");
    let initial_version = database
        .problem_updated_at(&inbox.problem_id)
        .expect("initial version");
    let stem = database
        .save_problem_field(
            &inbox.problem_id,
            ProblemFieldKind::Stem,
            "货币供给增加如何影响 LM 曲线？",
            &initial_version,
        )
        .expect("question stem saved");
    let answer = database
        .save_problem_field(
            &inbox.problem_id,
            ProblemFieldKind::StandardAnswer,
            "LM 曲线向右移动。",
            &stem.updated_at,
        )
        .expect("answer saved");
    database
        .save_problem_field(
            &inbox.problem_id,
            ProblemFieldKind::Explanation,
            "实际货币余额上升，均衡利率下降。",
            &answer.updated_at,
        )
        .expect("explanation saved");

    let question_book = database.export_problem_book(false).expect("question book");
    let answer_book = database.export_problem_book(true).expect("answer book");

    assert_eq!(question_book.problem_count, 1);
    assert!(question_book.markdown.contains("# 错题智库 · 题目册"));
    assert!(question_book
        .markdown
        .contains("货币供给增加如何影响 LM 曲线？"));
    assert!(!question_book.markdown.contains("LM 曲线向右移动。"));
    assert!(answer_book.markdown.contains("# 错题智库 · 答案解析册"));
    assert!(answer_book.markdown.contains("LM 曲线向右移动。"));
    assert!(answer_book
        .markdown
        .contains("实际货币余额上升，均衡利率下降。"));
}

#[test]
fn writes_a_completed_book_to_the_user_selected_destination() {
    let temp = tempfile::tempdir().expect("temporary library");
    let source = temp.path().join("write-export.png");
    let destination = temp.path().join("答案解析册.md");
    fs::write(&source, b"write export").expect("fixture source");
    let database = Database::open(temp.path()).expect("database");
    let original = import_original(&source, &temp.path().join("originals")).expect("original");
    let inbox = database
        .record_inbox_item("write-export.png", &original, None)
        .expect("inbox item");
    let version = database
        .problem_updated_at(&inbox.problem_id)
        .expect("initial version");
    database
        .save_problem_field(
            &inbox.problem_id,
            ProblemFieldKind::Stem,
            "价格上限会造成什么后果？",
            &version,
        )
        .expect("question saved");

    let exported = database
        .write_problem_book(&destination, true)
        .expect("book written");

    assert_eq!(exported.problem_count, 1);
    assert_eq!(
        fs::read_to_string(destination).expect("exported markdown"),
        exported.markdown
    );
}

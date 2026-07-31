use super::database::{Database, DatabaseError};
use crate::services::ingest::ImportedOriginal;
use rusqlite::{params, Connection};

fn dashboard_database() -> (tempfile::TempDir, Database) {
    let root = tempfile::tempdir().expect("temporary dashboard library");
    let database = Database::open(root.path()).expect("open dashboard library");
    (root, database)
}

fn dashboard_connection(root: &tempfile::TempDir) -> Connection {
    Connection::open(root.path().join("library.sqlite3")).expect("open fixture connection")
}

fn insert_dashboard_course(connection: &Connection, id: &str, name: &str, created_at: &str) {
    connection
        .execute(
            "INSERT INTO courses(id, name, term, color, created_at, updated_at)
             VALUES (?1, ?2, '', '#CE8876', ?3, ?3)",
            params![id, name, created_at],
        )
        .expect("insert dashboard course");
}

#[allow(clippy::too_many_arguments)]
fn insert_dashboard_problem(
    connection: &Connection,
    id: &str,
    course_id: &str,
    status: &str,
    title: &str,
    next_review_at: Option<&str>,
    updated_at: &str,
    last_reviewed_at: Option<&str>,
) {
    connection
        .execute(
            "INSERT INTO problems(id, course_id, status, title, next_review_at, created_at, updated_at, last_reviewed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)",
            params![id, course_id, status, title, next_review_at, updated_at, last_reviewed_at],
        )
        .expect("insert dashboard problem");
}

fn insert_dashboard_field(connection: &Connection, problem_id: &str, kind: &str, value: &str) {
    connection
        .execute(
            "INSERT INTO problem_fields(problem_id, kind, value, updated_at) VALUES (?1, ?2, ?3, '2026-07-30')",
            params![problem_id, kind, value],
        )
        .expect("insert dashboard field");
}

fn insert_library_course(connection: &Connection, id: &str, name: &str, updated_at: &str) {
    connection
        .execute(
            "INSERT INTO courses(id, name, term, color, created_at, updated_at)
             VALUES (?1, ?2, '', '#CE8876', ?3, ?3)",
            params![id, name, updated_at],
        )
        .expect("insert library search course");
}

fn insert_library_material(
    connection: &Connection,
    id: &str,
    course_id: &str,
    filename: &str,
    created_at: &str,
    chunks: &[&str],
) {
    connection
        .execute(
            "INSERT INTO course_materials(id, course_id, filename, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, course_id, filename, chunks.join(" "), created_at],
        )
        .expect("insert library search material");
    for (ordinal, content) in chunks.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO material_chunks(id, material_id, ordinal, content)
                 VALUES (?1, ?2, ?3, ?4)",
                params![format!("{id}-chunk-{ordinal}"), id, ordinal as i64, content],
            )
            .expect("insert library search material chunk");
    }
}

#[test]
fn library_search_finds_problem_course_and_material_for_is_lm() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_library_course(
        &connection,
        "macro",
        "IS-LM macroeconomics",
        "2026-07-30T08:00:00",
    );
    insert_dashboard_problem(
        &connection,
        "is-lm-problem",
        "macro",
        "active",
        "IS-LM equilibrium",
        None,
        "2026-07-30T09:00:00",
        None,
    );
    insert_library_material(
        &connection,
        "is-lm-material",
        "macro",
        "is-lm-notes.md",
        "2026-07-30T07:00:00",
        &["The IS-LM model"],
    );
    drop(connection);

    let results = database
        .search_library("IS-LM", 12)
        .expect("library search");

    assert!(results.iter().any(|result| result.kind == "problem"));
    assert!(results.iter().any(|result| result.kind == "course"));
    assert!(results.iter().any(|result| result.kind == "material"));
}

#[test]
fn library_search_never_exceeds_the_single_global_limit() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    for index in 0..5 {
        insert_library_course(
            &connection,
            &format!("limit-{index}"),
            "Global limit course",
            &format!("2026-07-30T0{index}:00:00"),
        );
    }
    drop(connection);

    let results = database
        .search_library("Global limit", 2)
        .expect("library search");

    assert_eq!(results.len(), 2);
}

#[test]
fn library_search_treats_percent_and_underscore_as_literal_characters() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_library_course(
        &connection,
        "literal-wildcards",
        "Literal %_ marker",
        "2026-07-30",
    );
    insert_library_course(
        &connection,
        "wildcard-lookalike",
        "Literal ab marker",
        "2026-07-29",
    );
    drop(connection);

    let results = database.search_library("%_", 12).expect("library search");

    assert_eq!(
        results
            .iter()
            .map(|result| result.id.as_str())
            .collect::<Vec<_>>(),
        vec!["literal-wildcards"]
    );
}

#[test]
fn library_search_treats_backslash_as_an_escapeable_literal_character() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_library_course(&connection, "backslash", "Path \\ separator", "2026-07-30");
    insert_library_course(&connection, "plain", "Path separator", "2026-07-29");
    drop(connection);

    let results = database.search_library("\\", 12).expect("library search");

    assert_eq!(
        results
            .iter()
            .map(|result| result.id.as_str())
            .collect::<Vec<_>>(),
        vec!["backslash"]
    );
}

#[test]
fn library_search_clamps_limit_to_the_inclusive_range_one_through_twelve() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    for index in 0..13 {
        insert_library_course(
            &connection,
            &format!("clamp-{index}"),
            "Clamp result",
            &format!("2026-07-{index:02}"),
        );
    }
    drop(connection);

    assert_eq!(
        database
            .search_library("Clamp result", 0)
            .expect("zero limit clamped")
            .len(),
        1
    );
    assert_eq!(
        database
            .search_library("Clamp result", 99)
            .expect("large limit clamped")
            .len(),
        12
    );
}

#[test]
fn library_search_collapses_duplicate_material_chunks_without_reordering_materials() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_library_course(&connection, "materials", "Material course", "2026-07-01");
    insert_library_material(
        &connection,
        "material-new",
        "materials",
        "new.md",
        "2026-07-30T09:00:00",
        &["IS-LM first chunk", "IS-LM second chunk"],
    );
    insert_library_material(
        &connection,
        "material-old",
        "materials",
        "old.md",
        "2026-07-29T09:00:00",
        &["IS-LM old chunk"],
    );
    drop(connection);

    let results = database
        .search_library("IS-LM", 12)
        .expect("library search");
    let material_ids = results
        .iter()
        .filter(|result| result.kind == "material")
        .map(|result| result.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(material_ids, vec!["material-new", "material-old"]);
}

#[test]
fn library_search_returns_no_results_for_a_whitespace_only_query() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_library_course(&connection, "nonempty", "Searchable course", "2026-07-30");
    drop(connection);

    let results = database
        .search_library(" \n\t ", 12)
        .expect("library search");

    assert!(results.is_empty());
}

#[test]
fn dashboard_overview_returns_zero_counts_for_an_empty_library() {
    let (_root, database) = dashboard_database();

    let overview = database
        .dashboard_overview("2026-07-30")
        .expect("empty dashboard overview");

    assert_eq!(overview.due_review_count, 0);
    assert_eq!(overview.pending_inbox_count, 0);
    assert!(overview.course_summaries.is_empty());
    assert!(overview.recent_problems.is_empty());
    assert!(overview.top_mistake_reasons.is_empty());
    assert!(overview.top_knowledge_topics.is_empty());
    assert_eq!(overview.activity_last_seven_days.len(), 7);
    assert!(overview
        .activity_last_seven_days
        .iter()
        .all(|day| day.count == 0));
}

#[test]
fn dashboard_overview_aggregates_courses_materials_inbox_and_reviewed_problems() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "macro", "宏观经济学", "2026-07-01");
    insert_dashboard_course(&connection, "micro", "微观经济学", "2026-07-02");
    insert_dashboard_problem(
        &connection,
        "reviewed",
        "macro",
        "active",
        "IS-LM 分析",
        Some("2026-07-30"),
        "2026-07-30T09:00:00",
        Some("2026-07-30"),
    );
    insert_dashboard_problem(
        &connection,
        "inbox-macro",
        "macro",
        "inbox",
        "待整理宏观题",
        None,
        "2026-07-29T09:00:00",
        None,
    );
    insert_dashboard_problem(
        &connection,
        "inbox-micro",
        "micro",
        "inbox",
        "待整理微观题",
        Some("2026-07-31"),
        "2026-07-28T09:00:00",
        None,
    );
    connection
        .execute(
            "INSERT INTO course_materials(id, course_id, filename, content, created_at)
             VALUES ('material-1', 'macro', 'chapter-1.pdf', 'IS-LM', '2026-07-30')",
            [],
        )
        .expect("insert material");
    for (id, problem_id, attachment_id, filename) in [
        ("inbox-1", "inbox-macro", "attachment-1", "macro.png"),
        ("inbox-2", "inbox-micro", "attachment-2", "micro.png"),
    ] {
        connection
            .execute(
                "INSERT INTO attachments(id, sha256, relative_path, mime_type, byte_size, created_at)
                 VALUES (?1, ?2, ?3, 'image/png', 1, '2026-07-30')",
                params![attachment_id, format!("{attachment_id}-sha"), format!("{attachment_id}.png")],
            )
            .expect("insert attachment");
        connection
            .execute(
                "INSERT INTO inbox_items(id, problem_id, attachment_id, filename, created_at)
                 VALUES (?1, ?2, ?3, ?4, '2026-07-30')",
                params![id, problem_id, attachment_id, filename],
            )
            .expect("insert inbox item");
    }
    insert_dashboard_field(
        &connection,
        "reviewed",
        "mistake_reason",
        "蹇界暐杈归檯鏉′欢",
    );
    drop(connection);

    let overview = database
        .dashboard_overview("2026-07-30")
        .expect("populated dashboard overview");

    assert_eq!(overview.course_count, 2);
    assert_eq!(overview.material_count, 1);
    assert_eq!(overview.due_review_count, 1);
    assert_eq!(overview.pending_inbox_count, 2);
    assert_eq!(overview.course_summaries.len(), 2);
    assert_eq!(overview.course_summaries[0].id, "macro");
    assert_eq!(overview.course_summaries[0].problem_count, 2);
    assert_eq!(overview.course_summaries[0].pending_count, 1);
    assert_eq!(overview.course_summaries[0].due_count, 1);
    assert_eq!(overview.course_summaries[0].material_count, 1);
    assert_eq!(overview.course_summaries[1].id, "micro");
    assert_eq!(overview.course_summaries[1].problem_count, 1);
    assert_eq!(overview.course_summaries[1].pending_count, 1);
    assert_eq!(overview.course_summaries[1].due_count, 0);
    assert_eq!(overview.recent_problems.len(), 3);
    assert_eq!(overview.recent_problems[0].id, "reviewed");
    assert_eq!(overview.top_mistake_reasons[0].label, "蹇界暐杈归檯鏉′欢");
    assert_eq!(overview.top_mistake_reasons[0].count, 1);
    assert_eq!(overview.activity_last_seven_days.len(), 7);
}

#[test]
fn dashboard_overview_rejects_a_today_value_outside_the_iso_date_format() {
    let (_root, database) = dashboard_database();

    let result = database.dashboard_overview("2026/07/30");

    assert!(matches!(
        result,
        Err(DatabaseError::Conflict(message)) if message == "today must use YYYY-MM-DD"
    ));
}

#[test]
fn dashboard_overview_returns_exactly_seven_consecutive_activity_dates_ending_today() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "activity", "活动课程", "2026-07-01");
    for (id, updated_at, last_reviewed_at) in [
        ("day-24", "2026-07-24T08:00:00", None),
        ("day-25", "2026-07-25T08:00:00", None),
        ("day-26", "2026-07-26T08:00:00", Some("2026-07-26")),
        ("day-27", "2026-07-27T08:00:00", None),
        ("day-28", "2026-07-28T08:00:00", None),
        ("day-29", "2026-07-29T08:00:00", None),
        ("day-30", "2026-07-30T08:00:00", Some("2026-07-30")),
    ] {
        insert_dashboard_problem(
            &connection,
            id,
            "activity",
            "active",
            id,
            None,
            updated_at,
            last_reviewed_at,
        );
    }
    drop(connection);

    let activity = database
        .dashboard_overview("2026-07-30")
        .expect("activity dashboard overview")
        .activity_last_seven_days;

    assert_eq!(
        activity
            .iter()
            .map(|day| day.date.as_str())
            .collect::<Vec<_>>(),
        vec![
            "2026-07-24",
            "2026-07-25",
            "2026-07-26",
            "2026-07-27",
            "2026-07-28",
            "2026-07-29",
            "2026-07-30",
        ]
    );
    assert_eq!(
        activity.iter().map(|day| day.count).collect::<Vec<_>>(),
        vec![1; 7]
    );
}

#[test]
fn dashboard_overview_deduplicates_and_splits_knowledge_topics_per_problem() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "topics", "知识点课程", "2026-07-01");
    insert_dashboard_problem(
        &connection,
        "topic-problem",
        "topics",
        "active",
        "知识点题目",
        None,
        "2026-07-30T08:00:00",
        None,
    );
    insert_dashboard_field(
        &connection,
        "topic-problem",
        "notes",
        "鐭ヨ瘑鐐癸細IS-LM 妯″瀷銆佽储鏀挎斂绛朻；IS-LM 妯″瀷\n 璐㈡斂鏀跨瓥",
    );
    drop(connection);

    let topics = database
        .dashboard_overview("2026-07-30")
        .expect("topic dashboard overview")
        .top_knowledge_topics;

    assert_eq!(topics.len(), 3);
    assert_eq!(topics[0].label, "IS-LM 妯″瀷");
    assert_eq!(topics[0].count, 1);
    assert_eq!(topics[1].label, "储鏀挎斂绛朻");
    assert_eq!(topics[1].count, 1);
    assert_eq!(topics[2].label, "璐㈡斂鏀跨瓥");
    assert_eq!(topics[2].count, 1);
}

#[test]
fn dashboard_overview_trims_and_counts_mistake_reasons_once_per_problem() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "reasons", "错因课程", "2026-07-01");
    for id in ["reason-a", "reason-b"] {
        insert_dashboard_problem(
            &connection,
            id,
            "reasons",
            "active",
            id,
            None,
            "2026-07-30T08:00:00",
            None,
        );
        insert_dashboard_field(&connection, id, "mistake_reason", "  蹇界暐杈归檯鏉′欢  ");
    }
    drop(connection);

    let reasons = database
        .dashboard_overview("2026-07-30")
        .expect("reason dashboard overview")
        .top_mistake_reasons;

    assert_eq!(reasons.len(), 1);
    assert_eq!(reasons[0].label, "蹇界暐杈归檯鏉′欢");
    assert_eq!(reasons[0].count, 2);
}

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

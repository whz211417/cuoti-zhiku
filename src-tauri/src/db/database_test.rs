use super::database::{apply_migration, Database, DatabaseError};
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
fn library_search_groups_material_chunks_before_applying_the_global_limit() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_library_course(
        &connection,
        "search-course",
        "Saturation topic course",
        "2026-07-28T08:00:00Z",
    );
    insert_dashboard_problem(
        &connection,
        "search-problem",
        "search-course",
        "active",
        "Saturation topic problem",
        None,
        "2026-07-29T08:00:00Z",
        None,
    );
    let repeated = (0..20)
        .map(|_| "Saturation topic repeated chunk")
        .collect::<Vec<_>>();
    insert_library_material(
        &connection,
        "dominant-material",
        "search-course",
        "dominant.md",
        "2026-07-31T08:00:00Z",
        &repeated,
    );
    insert_library_material(
        &connection,
        "other-material",
        "search-course",
        "other.md",
        "2026-07-30T08:00:00Z",
        &["Saturation topic from another material"],
    );
    drop(connection);

    let results = database
        .search_library("Saturation topic", 12)
        .expect("saturated library search");

    assert!(results
        .iter()
        .any(|result| result.id == "dominant-material"));
    assert!(results.iter().any(|result| result.id == "other-material"));
    assert!(results.iter().any(|result| result.id == "search-problem"));
    assert!(results.iter().any(|result| result.id == "search-course"));
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
fn course_last_updated_includes_its_latest_material_activity() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(
        &connection,
        "materials",
        "Material activity",
        "2026-07-01T00:00:00Z",
    );
    insert_library_material(
        &connection,
        "latest-material",
        "materials",
        "latest.md",
        "2026-07-31T03:04:05Z",
        &["latest course material"],
    );
    drop(connection);

    let overview = database
        .dashboard_overview("2026-07-31")
        .expect("dashboard with material activity");

    assert_eq!(
        overview.course_summaries[0].updated_at,
        "2026-07-31T03:04:05Z"
    );
}

#[test]
fn course_recency_normalizes_mixed_epoch_and_rfc3339_activity_before_ordering() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    let legacy_course_time = chrono::DateTime::parse_from_rfc3339("2026-07-31T06:00:00Z")
        .expect("legacy course timestamp")
        .timestamp_millis()
        .to_string();
    let legacy_material_time = chrono::DateTime::parse_from_rfc3339("2026-07-31T08:00:00Z")
        .expect("legacy material timestamp")
        .timestamp_millis()
        .to_string();
    insert_dashboard_course(
        &connection,
        "mixed-formats",
        "Mixed formats",
        &legacy_course_time,
    );
    insert_dashboard_problem(
        &connection,
        "mixed-problem",
        "mixed-formats",
        "active",
        "RFC problem",
        None,
        "2026-07-31T07:00:00Z",
        None,
    );
    insert_library_material(
        &connection,
        "legacy-material",
        "mixed-formats",
        "legacy.md",
        &legacy_material_time,
        &["newest mixed-format activity"],
    );
    insert_dashboard_course(&connection, "rfc-only", "RFC only", "2026-07-31T07:30:00Z");
    drop(connection);

    let overview = database
        .dashboard_overview("2026-07-31")
        .expect("mixed-format dashboard");

    assert_eq!(overview.course_summaries[0].id, "mixed-formats");
    assert_eq!(
        overview.course_summaries[0].updated_at,
        "2026-07-31T08:00:00.000Z"
    );
    assert_eq!(overview.course_summaries[1].id, "rfc-only");
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
fn dashboard_activity_uses_the_china_calendar_across_the_utc_midnight_boundary() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "activity", "China calendar", "2026-07-01");
    for (id, updated_at) in [
        ("before-china-midnight", "2026-07-29T15:59:59Z"),
        ("at-china-midnight", "2026-07-29T16:00:00Z"),
        ("china-early-morning", "2026-07-30T00:30:00Z"),
    ] {
        insert_dashboard_problem(
            &connection,
            id,
            "activity",
            "active",
            id,
            None,
            updated_at,
            None,
        );
    }
    drop(connection);

    let activity = database
        .dashboard_overview("2026-07-30")
        .expect("China-calendar dashboard activity")
        .activity_last_seven_days;

    let count_for = |date: &str| {
        activity
            .iter()
            .find(|day| day.date == date)
            .expect("requested activity date")
            .count
    };
    assert_eq!(count_for("2026-07-29"), 1);
    assert_eq!(count_for("2026-07-30"), 2);
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
fn dashboard_overview_caps_each_learning_signal_group_at_five() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "signals", "Signal course", "2026-07-01");
    for index in 0..6 {
        let id = format!("signal-{index}");
        insert_dashboard_problem(
            &connection,
            &id,
            "signals",
            "active",
            &id,
            None,
            "2026-07-30T08:00:00Z",
            None,
        );
        insert_dashboard_field(
            &connection,
            &id,
            "mistake_reason",
            &format!("Reason {index}"),
        );
    }
    drop(connection);

    let signals = database
        .dashboard_overview("2026-07-30")
        .expect("dashboard signals")
        .top_mistake_reasons;

    assert_eq!(signals.len(), 5);
}

#[test]
fn dashboard_and_archive_exclude_trashed_problems() {
    let (root, database) = dashboard_database();
    let connection = dashboard_connection(&root);
    insert_dashboard_course(&connection, "archive", "Archive course", "2026-07-01");
    insert_dashboard_problem(
        &connection,
        "kept-problem",
        "archive",
        "active",
        "Kept problem",
        None,
        "2026-07-30T08:00:00Z",
        None,
    );
    insert_dashboard_problem(
        &connection,
        "trashed-problem",
        "archive",
        "trash",
        "Trashed problem",
        None,
        "2026-07-31T08:00:00Z",
        None,
    );
    drop(connection);

    let overview = database
        .dashboard_overview("2026-07-31")
        .expect("dashboard without trash");
    let archive = database.list_all_problems().expect("problem archive");

    assert_eq!(overview.course_summaries[0].problem_count, 1);
    assert_eq!(overview.recent_problems.len(), 1);
    assert_eq!(overview.recent_problems[0].id, "kept-problem");
    assert_eq!(archive.len(), 1);
    assert_eq!(archive[0].id, "kept-problem");
}

fn seed_schema_version(root: &std::path::Path, version: i64) {
    let connection = Connection::open(root.join("library.sqlite3")).expect("seed database");
    connection
        .execute_batch(include_str!("../../migrations/0001_initial.sql"))
        .expect("schema version 1");
    if version >= 2 {
        connection
            .execute_batch(include_str!("../../migrations/0002_problem_fields.sql"))
            .expect("schema version 2 tables");
        connection
            .execute("UPDATE schema_meta SET version = 2", [])
            .expect("schema version 2");
    }
    if version >= 3 {
        connection
            .execute_batch(include_str!("../../migrations/0003_review_state.sql"))
            .expect("schema version 3 columns");
        connection
            .execute("UPDATE schema_meta SET version = 3", [])
            .expect("schema version 3");
    }
    if version >= 4 {
        connection
            .execute_batch(include_str!("../../migrations/0004_course_materials.sql"))
            .expect("schema version 4 tables");
        connection
            .execute("UPDATE schema_meta SET version = 4", [])
            .expect("schema version 4");
    }
    if version >= 5 {
        connection
            .execute_batch(include_str!("../../migrations/0005_problem_versions.sql"))
            .expect("schema version 5 columns");
        connection
            .execute("UPDATE schema_meta SET version = 5", [])
            .expect("schema version 5");
    }
}

fn seed_version_two_problem(root: &std::path::Path) {
    seed_schema_version(root, 2);
    let connection = Connection::open(root.join("library.sqlite3")).expect("version two database");
    connection
        .execute(
            "INSERT INTO courses(id, name, term, color, created_at, updated_at)
             VALUES ('legacy-course', 'Legacy course', '', '#CE8876', '2026-07-01', '2026-07-01')",
            [],
        )
        .expect("legacy course");
    connection
        .execute(
            "INSERT INTO problems(id, course_id, status, title, created_at, updated_at)
             VALUES ('legacy-problem', 'legacy-course', 'active', 'Preserved problem', '2026-07-01', '2026-07-01')",
            [],
        )
        .expect("legacy problem");
}

fn assert_recovered_review_schema(root: &std::path::Path, database: &Database) {
    assert_eq!(database.schema_version().expect("current schema"), 6);
    let connection = Connection::open(root.join("library.sqlite3")).expect("recovered database");
    let recovered: (String, i64, Option<String>) = connection
        .query_row(
            "SELECT title, review_interval_days, last_reviewed_at
             FROM problems WHERE id = 'legacy-problem'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("preserved legacy problem");
    assert_eq!(recovered, ("Preserved problem".into(), 1, None));
}

#[test]
fn migrates_supported_legacy_versions_to_the_current_schema() {
    for starting_version in [1, 2, 3, 4, 5] {
        let root = tempfile::tempdir().expect("legacy library root");
        seed_schema_version(root.path(), starting_version);
        let connection =
            Connection::open(root.path().join("library.sqlite3")).expect("legacy database");
        connection
            .execute(
                "INSERT INTO courses(id, name, term, color, created_at, updated_at)
                 VALUES ('legacy-course', 'Legacy course', '', '#CE8876', '2026-07-01', '2026-07-01')",
                [],
            )
            .expect("legacy course");
        drop(connection);

        let database = Database::open(root.path()).expect("migrate legacy library");

        assert_eq!(database.schema_version().expect("current schema"), 6);
        assert_eq!(
            database.list_courses().expect("course list")[0].kind,
            "school"
        );
    }
}

#[test]
fn open_recovers_version_one_with_only_schema_metadata_and_preserves_unrelated_data() {
    let root = tempfile::tempdir().expect("incomplete version one root");
    let connection = Connection::open(root.path().join("library.sqlite3")).expect("seed database");
    connection
        .execute_batch(
            "CREATE TABLE schema_meta(version INTEGER NOT NULL);
             INSERT INTO schema_meta(version) VALUES (1);
             CREATE TABLE legacy_marker(value TEXT NOT NULL);
             INSERT INTO legacy_marker(value) VALUES ('keep me');",
        )
        .expect("incomplete version one schema");
    drop(connection);

    let database = Database::open(root.path()).expect("recover incomplete version one schema");
    let connection =
        Connection::open(root.path().join("library.sqlite3")).expect("recovered database");
    let marker: String = connection
        .query_row("SELECT value FROM legacy_marker", [], |row| row.get(0))
        .expect("unrelated legacy row");
    let problems_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'problems')",
            [],
            |row| row.get(0),
        )
        .expect("problems table lookup");

    assert_eq!(database.schema_version().expect("current schema"), 6);
    assert_eq!(marker, "keep me");
    assert!(problems_exists);
}

#[test]
fn open_recovers_an_empty_schema_metadata_table_and_preserves_unrelated_data() {
    let root = tempfile::tempdir().expect("empty metadata root");
    let connection = Connection::open(root.path().join("library.sqlite3")).expect("seed database");
    connection
        .execute_batch(
            "CREATE TABLE schema_meta(version INTEGER NOT NULL);
             CREATE TABLE legacy_marker(value TEXT NOT NULL);
             INSERT INTO legacy_marker(value) VALUES ('keep empty-meta data');",
        )
        .expect("empty metadata schema");
    drop(connection);

    let database = Database::open(root.path()).expect("recover empty metadata schema");
    let connection =
        Connection::open(root.path().join("library.sqlite3")).expect("recovered database");
    let marker: String = connection
        .query_row("SELECT value FROM legacy_marker", [], |row| row.get(0))
        .expect("unrelated legacy row");

    assert_eq!(database.schema_version().expect("current schema"), 6);
    assert_eq!(marker, "keep empty-meta data");
}

#[test]
fn open_recovers_version_two_after_only_the_first_review_column_was_added() {
    let root = tempfile::tempdir().expect("partial review migration root");
    seed_version_two_problem(root.path());
    let connection =
        Connection::open(root.path().join("library.sqlite3")).expect("partial database");
    connection
        .execute(
            "ALTER TABLE problems ADD COLUMN review_interval_days INTEGER NOT NULL DEFAULT 1",
            [],
        )
        .expect("first review column");
    drop(connection);

    let database = Database::open(root.path()).expect("recover first review column");

    assert_recovered_review_schema(root.path(), &database);
}

#[test]
fn open_recovers_version_two_after_both_review_columns_were_added() {
    let root = tempfile::tempdir().expect("complete review ddl root");
    seed_version_two_problem(root.path());
    let connection =
        Connection::open(root.path().join("library.sqlite3")).expect("partial database");
    connection
        .execute_batch(include_str!("../../migrations/0003_review_state.sql"))
        .expect("review columns without metadata advance");
    drop(connection);

    let database = Database::open(root.path()).expect("recover completed review ddl");

    assert_recovered_review_schema(root.path(), &database);
}

#[test]
fn resumes_a_partially_applied_legacy_migration() {
    let root = tempfile::tempdir().expect("partial migration root");
    seed_schema_version(root.path(), 1);
    let connection =
        Connection::open(root.path().join("library.sqlite3")).expect("partial database");
    connection
        .execute_batch(
            "CREATE TABLE problem_fields (
               problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
               kind TEXT NOT NULL,
               value TEXT NOT NULL DEFAULT '',
               updated_at TEXT NOT NULL,
               PRIMARY KEY(problem_id, kind)
             );",
        )
        .expect("interrupted migration artifact");
    drop(connection);

    let database = Database::open(root.path()).expect("resume migration");
    let connection = dashboard_connection(&root);
    let field_revisions_exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'field_revisions'",
            [],
            |row| row.get(0),
        )
        .expect("field revisions table");

    assert_eq!(database.schema_version().expect("current schema"), 6);
    assert_eq!(field_revisions_exists, 1);
}

#[test]
fn rolls_back_schema_changes_and_version_when_a_migration_fails() {
    let root = tempfile::tempdir().expect("failed migration root");
    seed_schema_version(root.path(), 1);
    let mut connection = Connection::open(root.path().join("library.sqlite3")).expect("database");

    let result = apply_migration(
        &mut connection,
        "CREATE TABLE should_rollback(id INTEGER); INVALID SQL;",
        2,
    );
    let table_exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'",
            [],
            |row| row.get(0),
        )
        .expect("rolled back table lookup");
    let version: i64 = connection
        .query_row("SELECT version FROM schema_meta", [], |row| row.get(0))
        .expect("rolled back version");

    assert!(result.is_err());
    assert_eq!(table_exists, 0);
    assert_eq!(version, 1);
}

#[test]
fn opens_a_wal_database_with_foreign_keys_enabled() {
    let root = tempfile::tempdir().expect("temporary library root");
    let database = Database::open(root.path()).expect("open library database");

    assert!(database.foreign_keys_enabled().expect("foreign key status"));
    assert_eq!(database.journal_mode().expect("journal mode"), "wal");
    assert_eq!(database.schema_version().expect("schema version"), 6);
}

#[test]
fn migrates_existing_courses_to_school_kind() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();
    let course = database
        .create_course("微积分", "", "#7895A5", "school")
        .unwrap();
    assert_eq!(course.kind, "school");
    assert_eq!(database.schema_version().unwrap(), 6);
}

#[test]
fn reports_database_health_without_exposing_its_connection() {
    let root = tempfile::tempdir().expect("temporary library root");
    let database = Database::open(root.path()).expect("open library database");

    let health = database.health().expect("library health");

    assert_eq!(health.schema_version, 6);
    assert!(health.foreign_keys_enabled);
    assert_eq!(health.journal_mode, "wal");
}

#[test]
fn writes_a_consistent_backup_to_a_new_destination() {
    let root = tempfile::tempdir().expect("temporary library root");
    let destination = root.path().join("错题智库备份.sqlite3");
    let database = Database::open(root.path()).expect("open library database");
    database
        .create_course("宏观经济学", "", "#CE8876", "school")
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
        .create_course("旧课程", "", "#777777", "school")
        .expect("old course");
    let source = Database::open(source_root.path()).expect("source database");
    source
        .create_course("宏观经济学", "", "#4A78A8", "school")
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
fn restores_a_version_five_snapshot_after_migrating_it_to_the_current_schema() {
    let current_root = tempfile::tempdir().expect("current library root");
    let source_root = tempfile::tempdir().expect("source library root");
    let snapshot = source_root.path().join("library.sqlite3");
    let current = Database::open(current_root.path()).expect("current database");
    current
        .create_course("Current course", "", "#777777", "school")
        .expect("current course");
    seed_schema_version(source_root.path(), 5);
    let source = Connection::open(&snapshot).expect("version five snapshot");
    source
        .execute(
            "INSERT INTO courses(id, name, term, color, created_at, updated_at)
             VALUES ('legacy-course', 'Legacy course', '', '#CE8876', '2026-07-01', '2026-07-01')",
            [],
        )
        .expect("legacy course");
    drop(source);

    current
        .restore_from_snapshot(&snapshot)
        .expect("migrated snapshot restore");
    let courses = current.list_courses().expect("restored courses");

    assert_eq!(current.schema_version().expect("current schema"), 6);
    assert_eq!(courses.len(), 1);
    assert_eq!(courses[0].name, "Legacy course");
    assert_eq!(courses[0].kind, "school");
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

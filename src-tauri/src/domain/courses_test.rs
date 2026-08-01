use crate::db::database::Database;

#[test]
fn creates_and_lists_local_courses() {
    let root = tempfile::tempdir().expect("temporary library");
    let database = Database::open(root.path()).expect("database");

    let created = database
        .create_course("宏观经济学", "2026 春季", "#CE8876", "school")
        .expect("course");
    let courses = database.list_courses().expect("course list");

    assert_eq!(courses.len(), 1);
    assert_eq!(courses[0].id, created.id);
    assert_eq!(courses[0].name, "宏观经济学");
    assert_eq!(courses[0].kind, "school");
}

#[test]
fn rejects_unknown_course_kind() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();
    assert!(database
        .create_course("课程", "", "#7895A5", "unknown")
        .is_err());
}

#[test]
fn stores_and_searches_material_snippets_within_one_course() {
    let root = tempfile::tempdir().expect("temporary library");
    let database = Database::open(root.path()).expect("database");
    let course = database
        .create_course("宏观经济学", "2026 春季", "#CE8876", "school")
        .expect("course");

    let material = database
        .record_course_material(
            &course.id,
            "第六章 IS-LM 模型.md",
            "货币供给增加会使 LM 曲线向右移动。均衡利率下降，产出提高。",
        )
        .expect("material saved");
    let matches = database
        .search_course_material(&course.id, "LM 曲线", 4)
        .expect("material search");

    assert_eq!(material.filename, "第六章 IS-LM 模型.md");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].material_id, material.id);
    assert!(matches[0].excerpt.contains("LM 曲线向右移动"));
}

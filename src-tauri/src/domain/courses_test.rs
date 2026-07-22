use crate::db::database::Database;

#[test]
fn creates_and_lists_local_courses() {
    let root = tempfile::tempdir().expect("temporary library");
    let database = Database::open(root.path()).expect("database");

    let created = database.create_course("宏观经济学", "2026 春季", "#CE8876").expect("course");
    let courses = database.list_courses().expect("course list");

    assert_eq!(courses.len(), 1);
    assert_eq!(courses[0].id, created.id);
    assert_eq!(courses[0].name, "宏观经济学");
}

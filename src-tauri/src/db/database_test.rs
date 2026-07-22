use super::database::Database;

#[test]
fn opens_a_wal_database_with_foreign_keys_enabled() {
    let root = tempfile::tempdir().expect("temporary library root");
    let database = Database::open(root.path()).expect("open library database");

    assert!(database.foreign_keys_enabled().expect("foreign key status"));
    assert_eq!(database.journal_mode().expect("journal mode"), "wal");
    assert_eq!(database.schema_version().expect("schema version"), 1);
}

#[test]
fn reports_database_health_without_exposing_its_connection() {
    let root = tempfile::tempdir().expect("temporary library root");
    let database = Database::open(root.path()).expect("open library database");

    let health = database.health().expect("library health");

    assert_eq!(health.schema_version, 1);
    assert!(health.foreign_keys_enabled);
    assert_eq!(health.journal_mode, "wal");
}

use std::fs;

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

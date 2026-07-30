use std::fs;

use super::material::extract_material_text;

#[test]
fn reads_utf8_markdown_as_course_material() {
    let root = tempfile::tempdir().expect("temporary material root");
    let source = root.path().join("IS-LM 讲义.md");
    fs::write(&source, "货币供给增加会使 LM 曲线右移。").expect("write fixture");

    let extracted = extract_material_text(&source).expect("extract markdown");

    assert_eq!(extracted, "货币供给增加会使 LM 曲线右移。");
}

#[test]
fn rejects_binary_files_that_are_not_pdf() {
    let root = tempfile::tempdir().expect("temporary material root");
    let source = root.path().join("lecture.docx");
    fs::write(&source, b"not a supported document").expect("write fixture");

    let error = extract_material_text(&source).expect_err("unsupported file rejected");

    assert!(error.to_string().contains("PDF、Markdown 或纯文本"));
}

#[test]
fn reports_an_unreadable_pdf_without_saving_empty_text() {
    let root = tempfile::tempdir().expect("temporary material root");
    let source = root.path().join("damaged.pdf");
    fs::write(&source, b"%PDF-1.7\nthis is not a complete pdf").expect("write fixture");

    let error = extract_material_text(&source).expect_err("damaged pdf rejected");

    assert!(error.to_string().contains("PDF"));
}

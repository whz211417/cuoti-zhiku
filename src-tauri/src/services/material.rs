use std::{fmt, fs, path::Path};

#[derive(Debug)]
pub enum MaterialImportError {
    Io(std::io::Error),
    UnsupportedFormat,
    Pdf(String),
    EmptyText,
}

impl fmt::Display for MaterialImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法读取课程资料：{error}"),
            Self::UnsupportedFormat => {
                formatter.write_str("只支持 PDF、Markdown 或纯文本课程资料。")
            }
            Self::Pdf(error) => write!(formatter, "无法提取 PDF 中的文字：{error}"),
            Self::EmptyText => {
                formatter.write_str("这份资料没有可检索文字；扫描版 PDF 请先进行 OCR。")
            }
        }
    }
}

impl std::error::Error for MaterialImportError {}

impl From<std::io::Error> for MaterialImportError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

pub fn extract_material_text(path: &Path) -> Result<String, MaterialImportError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let text = match extension.as_str() {
        "md" | "markdown" | "txt" => fs::read_to_string(path)?,
        "pdf" => pdf_extract::extract_text(path)
            .map_err(|error| MaterialImportError::Pdf(error.to_string()))?,
        _ => return Err(MaterialImportError::UnsupportedFormat),
    };
    let text = text.trim().to_owned();
    if text.is_empty() {
        return Err(MaterialImportError::EmptyText);
    }
    Ok(text)
}

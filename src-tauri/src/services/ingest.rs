use std::{
    fs,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

#[derive(Debug, PartialEq, Eq)]
pub struct ImportedOriginal {
    pub sha256: String,
    pub relative_path: PathBuf,
    pub mime_type: String,
    pub byte_size: u64,
    pub duplicate: bool,
}

#[derive(Debug)]
pub enum IngestError {
    Io(std::io::Error),
    UnsupportedFile(PathBuf),
}

impl std::fmt::Display for IngestError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法保存原件：{error}"),
            Self::UnsupportedFile(path) => {
                write!(formatter, "暂不支持导入此文件：{}", path.display())
            }
        }
    }
}

impl std::error::Error for IngestError {}

impl From<std::io::Error> for IngestError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

pub fn import_original(
    source: &Path,
    originals_root: &Path,
) -> Result<ImportedOriginal, IngestError> {
    let (extension, mime_type) = supported_file_type(source)?;
    let bytes = fs::read(source)?;
    store_original_bytes(&bytes, &extension, &mime_type, originals_root)
}

pub fn import_original_bytes(
    bytes: &[u8],
    extension: &str,
    originals_root: &Path,
) -> Result<ImportedOriginal, IngestError> {
    let normalized = extension.trim_start_matches('.').to_ascii_lowercase();
    let mime_type = supported_extension(&normalized).ok_or_else(|| {
        IngestError::UnsupportedFile(PathBuf::from(format!("clipboard.{normalized}")))
    })?;
    store_original_bytes(bytes, &normalized, mime_type, originals_root)
}

fn store_original_bytes(
    bytes: &[u8],
    extension: &str,
    mime_type: &str,
    originals_root: &Path,
) -> Result<ImportedOriginal, IngestError> {
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let relative_path = PathBuf::from(&sha256[0..2])
        .join(&sha256[2..4])
        .join(format!("{sha256}.{extension}"));
    let destination = originals_root.join(&relative_path);

    if destination.is_file() {
        return Ok(ImportedOriginal {
            sha256,
            relative_path,
            mime_type: mime_type.to_owned(),
            byte_size: bytes.len() as u64,
            duplicate: true,
        });
    }

    let parent = destination
        .parent()
        .expect("content-addressed path has a parent");
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".{sha256}.{}.partial", std::process::id()));
    fs::write(&temporary, bytes)?;
    match fs::rename(&temporary, &destination) {
        Ok(()) => Ok(ImportedOriginal {
            sha256,
            relative_path,
            mime_type: mime_type.to_owned(),
            byte_size: fs::metadata(&destination)?.len(),
            duplicate: false,
        }),
        Err(_) if destination.is_file() => {
            let _ = fs::remove_file(&temporary);
            Ok(ImportedOriginal {
                sha256,
                relative_path,
                mime_type: mime_type.to_owned(),
                byte_size: fs::metadata(&destination)?.len(),
                duplicate: true,
            })
        }
        Err(error) => Err(IngestError::Io(error)),
    }
}

fn supported_file_type(source: &Path) -> Result<(String, String), IngestError> {
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mime_type = supported_extension(&extension)
        .ok_or_else(|| IngestError::UnsupportedFile(source.to_path_buf()))?;
    Ok((extension, mime_type.to_owned()))
}

fn supported_extension(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "pdf" => Some("application/pdf"),
        "md" | "markdown" => Some("text/markdown"),
        "txt" => Some("text/plain"),
        _ => None,
    }
}

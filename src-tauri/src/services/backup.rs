use std::{
    fs::{self, File},
    io::{BufReader, BufWriter, Read, Write},
    path::{Component, Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::db::database::Database;

const MAGIC: &[u8; 8] = b"CZKB001\n";
const MAX_MANIFEST_BYTES: u32 = 16 * 1024 * 1024;
const MAX_ENTRY_COUNT: usize = 100_000;
const MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompleteBackupReport {
    pub original_count: usize,
    pub total_bytes: u64,
}

#[derive(Debug)]
pub struct ExtractedBackup {
    pub database_path: PathBuf,
    pub originals_root: PathBuf,
}

#[derive(Debug)]
pub enum BackupError {
    Io(std::io::Error),
    Database(String),
    Invalid(String),
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法读写备份：{error}"),
            Self::Database(error) => formatter.write_str(error),
            Self::Invalid(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for BackupError {}

impl From<std::io::Error> for BackupError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format_version: u32,
    created_at: String,
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ManifestEntry {
    path: String,
    size: u64,
    sha256: String,
}

struct SourceEntry {
    manifest: ManifestEntry,
    source: PathBuf,
}

pub fn create_complete_backup(
    database: &Database,
    originals_root: &Path,
    destination: &Path,
) -> Result<CompleteBackupReport, BackupError> {
    if destination.exists() {
        return Err(BackupError::Invalid(
            "备份目标已存在，请选择一个新文件名。".to_owned(),
        ));
    }
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let nonce = format!("{}-{}", std::process::id(), Utc::now().timestamp_millis());
    let database_snapshot = parent.join(format!(".czkbackup-{nonce}.sqlite3"));
    let archive_temporary = parent.join(format!(".czkbackup-{nonce}.partial"));

    let result = (|| {
        database
            .create_backup(&database_snapshot)
            .map_err(|error| BackupError::Database(error.to_string()))?;
        let mut sources = vec![source_entry("library.sqlite3", &database_snapshot)?];
        if originals_root.exists() {
            collect_originals(originals_root, originals_root, &mut sources)?;
        }
        sources[1..].sort_by(|left, right| left.manifest.path.cmp(&right.manifest.path));
        if sources.len() > MAX_ENTRY_COUNT {
            return Err(BackupError::Invalid(
                "原件数量超出备份安全上限。".to_owned(),
            ));
        }
        let total_bytes = sources.iter().try_fold(0_u64, |total, entry| {
            total
                .checked_add(entry.manifest.size)
                .ok_or_else(|| BackupError::Invalid("备份体积超出安全上限。".to_owned()))
        })?;
        if total_bytes > MAX_TOTAL_BYTES {
            return Err(BackupError::Invalid(
                "备份体积超出 32 GB 安全上限。".to_owned(),
            ));
        }
        let manifest = Manifest {
            format_version: 1,
            created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            entries: sources
                .iter()
                .map(|entry| ManifestEntry {
                    path: entry.manifest.path.clone(),
                    size: entry.manifest.size,
                    sha256: entry.manifest.sha256.clone(),
                })
                .collect(),
        };
        let manifest_bytes = serde_json::to_vec(&manifest)
            .map_err(|error| BackupError::Invalid(format!("无法生成备份清单：{error}")))?;
        let manifest_size = u32::try_from(manifest_bytes.len())
            .map_err(|_| BackupError::Invalid("备份清单过大。".to_owned()))?;
        if manifest_size > MAX_MANIFEST_BYTES {
            return Err(BackupError::Invalid("备份清单过大。".to_owned()));
        }

        let file = File::create(&archive_temporary)?;
        let mut writer = BufWriter::new(file);
        writer.write_all(MAGIC)?;
        writer.write_all(&manifest_size.to_le_bytes())?;
        writer.write_all(&manifest_bytes)?;
        for entry in &sources {
            let mut source = BufReader::new(File::open(&entry.source)?);
            std::io::copy(&mut source, &mut writer)?;
        }
        writer.flush()?;
        writer.get_ref().sync_all()?;
        drop(writer);
        fs::rename(&archive_temporary, destination)?;
        Ok(CompleteBackupReport {
            original_count: sources.len().saturating_sub(1),
            total_bytes,
        })
    })();

    let _ = fs::remove_file(&database_snapshot);
    if result.is_err() {
        let _ = fs::remove_file(&archive_temporary);
    }
    result
}

pub fn extract_complete_backup(
    source: &Path,
    staging_root: &Path,
) -> Result<ExtractedBackup, BackupError> {
    let mut reader = BufReader::new(File::open(source)?);
    let mut magic = [0_u8; 8];
    reader.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(BackupError::Invalid(
            "选择的文件不是完整错题智库备份。".to_owned(),
        ));
    }
    let mut manifest_size = [0_u8; 4];
    reader.read_exact(&mut manifest_size)?;
    let manifest_size = u32::from_le_bytes(manifest_size);
    if manifest_size == 0 || manifest_size > MAX_MANIFEST_BYTES {
        return Err(BackupError::Invalid("备份清单无效或已损坏。".to_owned()));
    }
    let mut manifest_bytes = vec![0; manifest_size as usize];
    reader.read_exact(&mut manifest_bytes)?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| BackupError::Invalid("备份清单无效或已损坏。".to_owned()))?;
    if manifest.format_version != 1
        || manifest.entries.is_empty()
        || manifest.entries.len() > MAX_ENTRY_COUNT
    {
        return Err(BackupError::Invalid(
            "备份版本不兼容或清单无效。".to_owned(),
        ));
    }
    let total_bytes = manifest.entries.iter().try_fold(0_u64, |total, entry| {
        validate_entry(entry)?;
        total
            .checked_add(entry.size)
            .ok_or_else(|| BackupError::Invalid("备份体积超出安全上限。".to_owned()))
    })?;
    if total_bytes > MAX_TOTAL_BYTES {
        return Err(BackupError::Invalid(
            "备份体积超出 32 GB 安全上限。".to_owned(),
        ));
    }
    fs::create_dir_all(staging_root)?;
    let payload_root = staging_root.join("payload");
    if payload_root.exists() {
        return Err(BackupError::Invalid("恢复暂存目录不为空。".to_owned()));
    }
    fs::create_dir_all(&payload_root)?;

    for entry in &manifest.entries {
        let destination = payload_root.join(Path::new(&entry.path));
        let parent = destination.parent().expect("validated entry has a parent");
        fs::create_dir_all(parent)?;
        let temporary = parent.join(format!(
            ".{}.partial",
            destination
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("entry")
        ));
        let mut writer = BufWriter::new(File::create(&temporary)?);
        let mut hasher = Sha256::new();
        let mut remaining = entry.size;
        let mut buffer = [0_u8; 64 * 1024];
        while remaining > 0 {
            let chunk = usize::try_from(remaining.min(buffer.len() as u64)).expect("bounded chunk");
            reader
                .read_exact(&mut buffer[..chunk])
                .map_err(|_| BackupError::Invalid("备份内容不完整或已损坏。".to_owned()))?;
            writer.write_all(&buffer[..chunk])?;
            hasher.update(&buffer[..chunk]);
            remaining -= chunk as u64;
        }
        writer.flush()?;
        drop(writer);
        if format!("{:x}", hasher.finalize()) != entry.sha256 {
            let _ = fs::remove_file(&temporary);
            return Err(BackupError::Invalid(format!(
                "备份内容校验失败：{}",
                entry.path
            )));
        }
        fs::rename(temporary, destination)?;
    }
    let mut trailing = [0_u8; 1];
    if reader.read(&mut trailing)? != 0 {
        return Err(BackupError::Invalid("备份末尾包含未知内容。".to_owned()));
    }
    let database_path = payload_root.join("library.sqlite3");
    if !database_path.is_file() {
        return Err(BackupError::Invalid("备份中缺少本地资料库。".to_owned()));
    }
    Ok(ExtractedBackup {
        database_path,
        originals_root: payload_root.join("originals"),
    })
}

fn collect_originals(
    root: &Path,
    current: &Path,
    entries: &mut Vec<SourceEntry>,
) -> Result<(), BackupError> {
    let mut children = fs::read_dir(current)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|entry| entry.file_name());
    for child in children {
        let metadata = fs::symlink_metadata(child.path())?;
        if metadata.file_type().is_symlink() {
            return Err(BackupError::Invalid(
                "原件目录包含符号链接，已停止备份。".to_owned(),
            ));
        }
        if metadata.is_dir() {
            collect_originals(root, &child.path(), entries)?;
        } else if metadata.is_file() {
            let child_path = child.path();
            let relative = child_path
                .strip_prefix(root)
                .map_err(|_| BackupError::Invalid("原件路径无效。".to_owned()))?;
            let portable = relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            entries.push(source_entry(&format!("originals/{portable}"), &child_path)?);
        }
    }
    Ok(())
}

fn source_entry(path: &str, source: &Path) -> Result<SourceEntry, BackupError> {
    let mut file = BufReader::new(File::open(source)?);
    let mut hasher = Sha256::new();
    let size = std::io::copy(&mut file, &mut hasher)?;
    Ok(SourceEntry {
        manifest: ManifestEntry {
            path: path.to_owned(),
            size,
            sha256: format!("{:x}", hasher.finalize()),
        },
        source: source.to_path_buf(),
    })
}

fn validate_entry(entry: &ManifestEntry) -> Result<(), BackupError> {
    if entry.path.contains('\\')
        || entry.path.starts_with('/')
        || entry.sha256.len() != 64
        || !entry.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(BackupError::Invalid(
            "备份清单包含不安全的路径或摘要。".to_owned(),
        ));
    }
    let path = Path::new(&entry.path);
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(BackupError::Invalid(
            "备份清单包含不安全的路径。".to_owned(),
        ));
    }
    if entry.path != "library.sqlite3" && !entry.path.starts_with("originals/") {
        return Err(BackupError::Invalid("备份清单包含未知内容。".to_owned()));
    }
    Ok(())
}

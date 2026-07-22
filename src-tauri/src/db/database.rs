use std::{
    fmt,
    path::Path,
    sync::{atomic::{AtomicU64, Ordering}, Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, Transaction};
use serde::Serialize;

use crate::services::ingest::ImportedOriginal;

static NEXT_RECORD_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealth {
    pub schema_version: i64,
    pub foreign_keys_enabled: bool,
    pub journal_mode: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub id: String,
    pub attachment_id: String,
    pub filename: String,
    pub created_at: String,
}

#[derive(Debug)]
pub enum DatabaseError {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    LockPoisoned,
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法访问本地资料库：{error}"),
            Self::Sql(error) => write!(formatter, "本地资料库操作失败：{error}"),
            Self::LockPoisoned => write!(formatter, "本地资料库正在恢复，请稍后重试"),
        }
    }
}

impl std::error::Error for DatabaseError {}

impl From<std::io::Error> for DatabaseError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

pub type DatabaseResult<T> = Result<T, DatabaseError>;

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(root: &Path) -> DatabaseResult<Self> {
        std::fs::create_dir_all(root)?;
        let connection = Connection::open(root.join("library.sqlite3"))?;
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )?;
        connection.execute_batch(include_str!("../../migrations/0001_initial.sql"))?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn foreign_keys_enabled(&self) -> DatabaseResult<bool> {
        Ok(self.connection()?.query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))? == 1)
    }

    pub fn journal_mode(&self) -> DatabaseResult<String> {
        self.connection()?
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn schema_version(&self) -> DatabaseResult<i64> {
        self.connection()?
            .query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn health(&self) -> DatabaseResult<LibraryHealth> {
        Ok(LibraryHealth {
            schema_version: self.schema_version()?,
            foreign_keys_enabled: self.foreign_keys_enabled()?,
            journal_mode: self.journal_mode()?,
        })
    }

    pub fn record_inbox_item(
        &self,
        filename: &str,
        original: &ImportedOriginal,
        course_id: Option<&str>,
    ) -> DatabaseResult<InboxItem> {
        let created_at = timestamp();
        let attachment_id = format!("attachment-{}", original.sha256);
        let course_id = course_id.unwrap_or("inbox-unassigned");
        let problem_id = record_id("problem");
        let inbox_id = record_id("inbox");

        self.with_transaction(|transaction| {
            if course_id == "inbox-unassigned" {
                transaction.execute(
                    "INSERT OR IGNORE INTO courses(id, name, term, color, created_at, updated_at) VALUES (?1, ?2, '', ?3, ?4, ?4)",
                    params![course_id, "未分类", "#8B7046", created_at],
                )?;
            }
            transaction.execute(
                "INSERT OR IGNORE INTO attachments(id, sha256, relative_path, mime_type, byte_size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![attachment_id, original.sha256, original.relative_path.to_string_lossy(), original.mime_type, original.byte_size, created_at],
            )?;
            transaction.execute(
                "INSERT INTO problems(id, course_id, status, title, created_at, updated_at) VALUES (?1, ?2, 'inbox', '', ?3, ?3)",
                params![problem_id, course_id, created_at],
            )?;
            transaction.execute(
                "INSERT INTO inbox_items(id, problem_id, attachment_id, filename, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![inbox_id, problem_id, attachment_id, filename, created_at],
            )?;
            Ok(InboxItem { id: inbox_id, attachment_id, filename: filename.to_owned(), created_at })
        })
    }

    pub fn list_inbox_items(&self) -> DatabaseResult<Vec<InboxItem>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, attachment_id, filename, created_at
             FROM inbox_items
             ORDER BY created_at DESC, id DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                attachment_id: row.get(1)?,
                filename: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn with_transaction<T>(
        &self,
        work: impl FnOnce(&Transaction<'_>) -> DatabaseResult<T>,
    ) -> DatabaseResult<T> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let result = work(&transaction)?;
        transaction.commit()?;
        Ok(result)
    }

    fn connection(&self) -> DatabaseResult<MutexGuard<'_, Connection>> {
        self.connection.lock().map_err(|_| DatabaseError::LockPoisoned)
    }
}

fn record_id(prefix: &str) -> String {
    format!("{prefix}-{}-{}", timestamp(), NEXT_RECORD_ID.fetch_add(1, Ordering::Relaxed))
}

fn timestamp() -> String {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis().to_string()
}

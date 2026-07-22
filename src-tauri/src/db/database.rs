use std::{
    fmt,
    path::Path,
    sync::{atomic::{AtomicU64, Ordering}, Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, Transaction};
use serde::Serialize;

use crate::{domain::problems::{ProblemDocument, ProblemField, ProblemFieldKind, SavedProblemField}, services::ingest::ImportedOriginal};

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
    pub problem_id: String,
    pub attachment_id: String,
    pub filename: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub name: String,
    pub term: String,
    pub color: String,
}

#[derive(Debug)]
pub enum DatabaseError {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    LockPoisoned,
    Conflict(String),
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "无法访问本地资料库：{error}"),
            Self::Sql(error) => write!(formatter, "本地资料库操作失败：{error}"),
            Self::LockPoisoned => write!(formatter, "本地资料库正在恢复，请稍后重试"),
            Self::Conflict(message) => formatter.write_str(message),
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
        let schema_version = connection.query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| row.get::<_, i64>(0))?;
        if schema_version < 2 {
            connection.execute_batch(include_str!("../../migrations/0002_problem_fields.sql"))?;
            connection.execute("UPDATE schema_meta SET version = 2", [])?;
        }

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

    pub fn create_course(&self, name: &str, term: &str, color: &str) -> DatabaseResult<Course> {
        let course = Course {
            id: record_id("course"),
            name: name.trim().to_owned(),
            term: term.trim().to_owned(),
            color: color.to_owned(),
        };
        if course.name.is_empty() {
            return Err(DatabaseError::Conflict("课程名称不能为空。".to_owned()));
        }
        let created_at = timestamp();
        self.connection()?.execute(
            "INSERT INTO courses(id, name, term, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![&course.id, &course.name, &course.term, &course.color, created_at],
        )?;
        Ok(course)
    }

    pub fn list_courses(&self) -> DatabaseResult<Vec<Course>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, name, term, color FROM courses WHERE archived_at IS NULL ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(Course { id: row.get(0)?, name: row.get(1)?, term: row.get(2)?, color: row.get(3)? })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
            Ok(InboxItem { id: inbox_id, problem_id, attachment_id, filename: filename.to_owned(), created_at })
        })
    }

    pub fn list_inbox_items(&self) -> DatabaseResult<Vec<InboxItem>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, problem_id, attachment_id, filename, created_at
             FROM inbox_items
             ORDER BY created_at DESC, id DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                problem_id: row.get(1)?,
                attachment_id: row.get(2)?,
                filename: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    #[cfg(test)]
    pub fn problem_updated_at(&self, problem_id: &str) -> DatabaseResult<String> {
        self.connection()?
            .query_row("SELECT updated_at FROM problems WHERE id = ?1", [problem_id], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn save_problem_field(
        &self,
        problem_id: &str,
        kind: ProblemFieldKind,
        value: &str,
        expected_updated_at: &str,
    ) -> DatabaseResult<SavedProblemField> {
        let updated_at = record_id("version");
        self.with_transaction(|transaction| {
            let current: String = transaction.query_row(
                "SELECT updated_at FROM problems WHERE id = ?1",
                [problem_id],
                |row| row.get(0),
            )?;
            if current != expected_updated_at {
                return Err(DatabaseError::Conflict("题目已在另一处更新，请刷新后再保存。".to_owned()));
            }
            transaction.execute(
                "INSERT INTO problem_fields(problem_id, kind, value, updated_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(problem_id, kind) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![problem_id, kind.as_str(), value, updated_at],
            )?;
            transaction.execute(
                "INSERT INTO field_revisions(id, problem_id, kind, value, source, created_at) VALUES (?1, ?2, ?3, ?4, 'user', ?5)",
                params![record_id("revision"), problem_id, kind.as_str(), value, timestamp()],
            )?;
            transaction.execute("UPDATE problems SET updated_at = ?2 WHERE id = ?1", params![problem_id, updated_at])?;
            Ok(SavedProblemField {
                problem_id: problem_id.to_owned(),
                kind: kind.as_str().to_owned(),
                value: value.to_owned(),
                updated_at,
            })
        })
    }

    pub fn get_problem_document(&self, problem_id: &str) -> DatabaseResult<ProblemDocument> {
        let connection = self.connection()?;
        let (id, title, status, updated_at) = connection.query_row(
            "SELECT id, title, status, updated_at FROM problems WHERE id = ?1",
            [problem_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let mut statement = connection.prepare(
            "SELECT kind, value, updated_at FROM problem_fields WHERE problem_id = ?1
             ORDER BY CASE kind
               WHEN 'stem' THEN 1 WHEN 'own_answer' THEN 2 WHEN 'standard_answer' THEN 3
               WHEN 'explanation' THEN 4 WHEN 'mistake_reason' THEN 5 WHEN 'notes' THEN 6 END",
        )?;
        let fields = statement
            .query_map([problem_id], |row| {
                Ok(ProblemField { kind: row.get(0)?, value: row.get(1)?, updated_at: row.get(2)? })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ProblemDocument { id, title, status, updated_at, fields })
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

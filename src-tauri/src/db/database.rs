use std::{
    fmt,
    path::Path,
    sync::{Mutex, MutexGuard},
};

use rusqlite::{Connection, Transaction};
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealth {
    pub schema_version: i64,
    pub foreign_keys_enabled: bool,
    pub journal_mode: String,
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

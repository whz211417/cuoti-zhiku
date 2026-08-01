use std::{
    collections::{HashMap, HashSet},
    fmt,
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, MutexGuard,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::{Duration, NaiveDate, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;

use crate::{
    domain::{
        dashboard::{
            ActivityDay, CountedSignal, CourseSummary, DashboardOverview, LibrarySearchResult,
            RecentProblem,
        },
        problems::{ProblemDocument, ProblemField, ProblemFieldKind, SavedProblemField},
        review::{schedule_next, ReviewGrade, ReviewSchedule},
    },
    services::ingest::ImportedOriginal,
};

static NEXT_RECORD_ID: AtomicU64 = AtomicU64::new(1);
const CURRENT_SCHEMA_VERSION: i64 = 6;

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

#[derive(Debug, PartialEq, Eq)]
pub struct ProblemAttachment {
    pub relative_path: std::path::PathBuf,
    pub mime_type: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub name: String,
    pub term: String,
    pub color: String,
    pub kind: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewProblem {
    pub id: String,
    pub stem: String,
    pub own_answer: String,
    pub standard_answer: String,
    pub explanation: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProblemBook {
    pub markdown: String,
    pub problem_count: usize,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CourseMaterial {
    pub id: String,
    pub course_id: String,
    pub filename: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSnippet {
    pub material_id: String,
    pub filename: String,
    pub excerpt: String,
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

fn validate_course_kind(kind: &str) -> DatabaseResult<&str> {
    match kind {
        "school" | "exam" | "language" | "certificate" | "other" => Ok(kind),
        _ => Err(DatabaseError::Conflict("请选择有效的课程类型。".to_owned())),
    }
}

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(root: &Path) -> DatabaseResult<Self> {
        std::fs::create_dir_all(root)?;
        let mut connection = Connection::open(root.join("library.sqlite3"))?;
        configure_connection(&connection)?;
        migrate_to_current_schema(&mut connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn foreign_keys_enabled(&self) -> DatabaseResult<bool> {
        Ok(self
            .connection()?
            .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))?
            == 1)
    }

    pub fn journal_mode(&self) -> DatabaseResult<String> {
        self.connection()?
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn schema_version(&self) -> DatabaseResult<i64> {
        self.connection()?
            .query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
                row.get(0)
            })
            .map_err(Into::into)
    }

    pub fn health(&self) -> DatabaseResult<LibraryHealth> {
        Ok(LibraryHealth {
            schema_version: self.schema_version()?,
            foreign_keys_enabled: self.foreign_keys_enabled()?,
            journal_mode: self.journal_mode()?,
        })
    }

    pub fn dashboard_overview(&self, today: &str) -> DatabaseResult<DashboardOverview> {
        NaiveDate::parse_from_str(today, "%Y-%m-%d")
            .map_err(|_| DatabaseError::Conflict("today must use YYYY-MM-DD".into()))?;
        let connection = self.connection()?;

        Ok(DashboardOverview {
            due_review_count: query_scalar(
                &connection,
                "SELECT COUNT(*) FROM problems
                 WHERE status IN ('inbox', 'active')
                   AND next_review_at IS NOT NULL
                   AND next_review_at <= ?1",
                [today],
            )?,
            pending_inbox_count: query_scalar(
                &connection,
                "SELECT COUNT(*) FROM problems WHERE status = 'inbox'",
                [],
            )?,
            course_count: query_scalar(
                &connection,
                "SELECT COUNT(*) FROM courses WHERE archived_at IS NULL",
                [],
            )?,
            material_count: query_scalar(&connection, "SELECT COUNT(*) FROM course_materials", [])?,
            course_summaries: query_course_summaries(&connection, today)?,
            recent_problems: query_recent_problems(&connection)?,
            top_mistake_reasons: query_counted_fields(&connection, "mistake_reason", false)?,
            top_knowledge_topics: query_counted_fields(&connection, "notes", true)?,
            activity_last_seven_days: query_activity_days(&connection, today)?,
        })
    }

    pub fn search_library(
        &self,
        query: &str,
        limit: u32,
    ) -> DatabaseResult<Vec<LibrarySearchResult>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }

        let limit = limit.clamp(1, 12);
        let pattern = format!("%{}%", escape_like_pattern(query));
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            r#"WITH material_matches AS (
                  SELECT m.id,
                         m.course_id,
                         m.filename,
                         COALESCE(
                           (SELECT ch.content FROM material_chunks ch
                            WHERE ch.material_id = m.id AND ch.content LIKE ?1 ESCAPE '\'
                            ORDER BY ch.ordinal ASC LIMIT 1),
                           (SELECT ch.content FROM material_chunks ch
                            WHERE ch.material_id = m.id
                            ORDER BY ch.ordinal ASC LIMIT 1),
                           ''
                         ) AS snippet,
                         m.created_at AS updated_at
                  FROM course_materials m
                  WHERE m.filename LIKE ?1 ESCAPE '\'
                     OR EXISTS (
                       SELECT 1 FROM material_chunks ch
                       WHERE ch.material_id = m.id AND ch.content LIKE ?1 ESCAPE '\'
                     )
                )
                SELECT 'problem', p.id, COALESCE(p.course_id, ''),
                       COALESCE(NULLIF(stem.value, ''), NULLIF(p.title, ''), i.filename, '未命名题目'),
                       COALESCE(NULLIF(explanation.value, ''), NULLIF(stem.value, ''), ''),
                       p.updated_at
                FROM problems p
                LEFT JOIN (
                    SELECT problem_id, MAX(value) AS value
                    FROM problem_fields
                    WHERE kind = 'stem'
                    GROUP BY problem_id
                ) stem ON stem.problem_id = p.id
                LEFT JOIN (
                    SELECT problem_id, MAX(value) AS value
                    FROM problem_fields
                    WHERE kind = 'explanation'
                    GROUP BY problem_id
                ) explanation ON explanation.problem_id = p.id
                LEFT JOIN inbox_items i ON i.problem_id = p.id
                WHERE p.status != 'trash'
                  AND (p.title LIKE ?1 ESCAPE '\' OR EXISTS (
                    SELECT 1 FROM problem_fields f
                    WHERE f.problem_id = p.id AND f.value LIKE ?1 ESCAPE '\'
                  ))
                UNION ALL
                SELECT 'course', c.id, c.id, c.name, c.term, c.updated_at
                FROM courses c
                WHERE c.archived_at IS NULL
                  AND (c.name LIKE ?1 ESCAPE '\' OR c.term LIKE ?1 ESCAPE '\')
                UNION ALL
                SELECT 'material', id, course_id, filename, snippet, updated_at
                FROM material_matches
                ORDER BY updated_at DESC
                LIMIT ?2"#,
        )?;
        let rows = statement.query_map(params![pattern, i64::from(limit)], |row| {
            Ok(LibrarySearchResult {
                kind: row.get(0)?,
                id: row.get(1)?,
                course_id: row.get(2)?,
                title: row.get(3)?,
                snippet: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn create_backup(&self, destination: &Path) -> DatabaseResult<()> {
        if destination.exists() {
            return Err(DatabaseError::Conflict(
                "备份目标已存在，请选择一个新文件名。".to_owned(),
            ));
        }
        let destination = destination.to_string_lossy().into_owned();
        self.connection()?
            .execute("VACUUM INTO ?1", [destination])?;
        Ok(())
    }

    pub fn restore_from_snapshot(&self, source: &Path) -> DatabaseResult<()> {
        let source =
            Connection::open_with_flags(source, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|_| DatabaseError::Conflict("选择的备份无法打开或已损坏。".to_owned()))?;
        let integrity = source
            .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
            .map_err(|_| DatabaseError::Conflict("选择的备份未通过完整性检查。".to_owned()))?;
        if integrity != "ok" {
            return Err(DatabaseError::Conflict(
                "选择的备份未通过完整性检查。".to_owned(),
            ));
        }
        let version = source
            .query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|_| DatabaseError::Conflict("选择的文件不是错题智库备份。".to_owned()))?;
        if !(1..=CURRENT_SCHEMA_VERSION).contains(&version) {
            return Err(DatabaseError::Conflict(
                "备份版本与当前应用不兼容。".to_owned(),
            ));
        }

        let mut candidate = Connection::open_in_memory()?;
        {
            let backup = rusqlite::backup::Backup::new(&source, &mut candidate)?;
            backup.run_to_completion(64, std::time::Duration::from_millis(5), None)?;
        }
        configure_connection(&candidate)?;
        migrate_to_current_schema(&mut candidate)?;
        let candidate_integrity =
            candidate.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))?;
        if candidate_integrity != "ok" {
            return Err(DatabaseError::Conflict(
                "选择的备份未通过完整性检查。".to_owned(),
            ));
        }
        let candidate_version =
            candidate.query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
                row.get::<_, i64>(0)
            })?;
        if candidate_version != CURRENT_SCHEMA_VERSION {
            return Err(DatabaseError::Conflict(
                "备份版本与当前应用不兼容。".to_owned(),
            ));
        }

        let mut destination = self.connection()?;
        {
            let backup = rusqlite::backup::Backup::new(&candidate, &mut destination)?;
            backup.run_to_completion(64, std::time::Duration::from_millis(5), None)?;
        }
        configure_connection(&destination)?;
        Ok(())
    }

    pub fn create_course(
        &self,
        name: &str,
        term: &str,
        color: &str,
        kind: &str,
    ) -> DatabaseResult<Course> {
        let course = Course {
            id: record_id("course"),
            name: name.trim().to_owned(),
            term: term.trim().to_owned(),
            color: color.to_owned(),
            kind: validate_course_kind(kind)?.to_owned(),
        };
        if course.name.is_empty() {
            return Err(DatabaseError::Conflict("课程名称不能为空。".to_owned()));
        }
        let created_at = timestamp();
        self.connection()?.execute(
            "INSERT INTO courses(id, name, term, color, kind, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![&course.id, &course.name, &course.term, &course.color, &course.kind, created_at],
        )?;
        Ok(course)
    }

    pub fn list_courses(&self) -> DatabaseResult<Vec<Course>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, name, term, color, kind FROM courses WHERE archived_at IS NULL ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(Course {
                id: row.get(0)?,
                name: row.get(1)?,
                term: row.get(2)?,
                color: row.get(3)?,
                kind: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn record_course_material(
        &self,
        course_id: &str,
        filename: &str,
        content: &str,
    ) -> DatabaseResult<CourseMaterial> {
        let material = CourseMaterial {
            id: record_id("material"),
            course_id: course_id.to_owned(),
            filename: filename.trim().to_owned(),
        };
        let content = content.trim();
        if material.filename.is_empty() || content.is_empty() {
            return Err(DatabaseError::Conflict(
                "教材名称和可检索文本不能为空。".to_owned(),
            ));
        }
        let chunks = split_material_chunks(content, 800);
        self.with_transaction(|transaction| {
            transaction.execute(
                "INSERT INTO course_materials(id, course_id, filename, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![&material.id, &material.course_id, &material.filename, content, timestamp()],
            )?;
            for (ordinal, chunk) in chunks.iter().enumerate() {
                transaction.execute(
                    "INSERT INTO material_chunks(id, material_id, ordinal, content) VALUES (?1, ?2, ?3, ?4)",
                    params![record_id("chunk"), &material.id, ordinal, chunk],
                )?;
            }
            Ok(material)
        })
    }

    pub fn search_course_material(
        &self,
        course_id: &str,
        query: &str,
        limit: usize,
    ) -> DatabaseResult<Vec<MaterialSnippet>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT material.id, material.filename, chunk.content
             FROM material_chunks chunk
             JOIN course_materials material ON material.id = chunk.material_id
             WHERE material.course_id = ?1 AND instr(chunk.content, ?2) > 0
             ORDER BY material.created_at DESC, chunk.ordinal ASC
             LIMIT ?3",
        )?;
        let results =
            statement.query_map(params![course_id, query, limit.min(12) as i64], |row| {
                Ok(MaterialSnippet {
                    material_id: row.get(0)?,
                    filename: row.get(1)?,
                    excerpt: row.get(2)?,
                })
            })?;
        results.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
        let title = Path::new(filename)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or(filename)
            .trim();

        self.with_transaction(|transaction| {
            if course_id == "inbox-unassigned" {
                transaction.execute(
                    "INSERT OR IGNORE INTO courses(id, name, term, color, kind, created_at, updated_at) VALUES (?1, ?2, '', ?3, 'other', ?4, ?4)",
                    params![course_id, "未分类", "#8B7046", created_at],
                )?;
            }
            transaction.execute(
                "INSERT OR IGNORE INTO attachments(id, sha256, relative_path, mime_type, byte_size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![attachment_id, original.sha256, original.relative_path.to_string_lossy(), original.mime_type, original.byte_size, created_at],
            )?;
            transaction.execute(
                "INSERT INTO problems(id, course_id, status, title, created_at, updated_at, version) VALUES (?1, ?2, 'inbox', ?3, ?4, ?4, ?5)",
                params![problem_id, course_id, title, created_at, record_id("version")],
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

    pub fn problem_attachment(
        &self,
        problem_id: &str,
    ) -> DatabaseResult<Option<ProblemAttachment>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT attachment.relative_path, attachment.mime_type
             FROM inbox_items inbox
             JOIN attachments attachment ON attachment.id = inbox.attachment_id
             WHERE inbox.problem_id = ?1",
        )?;
        let mut rows = statement.query([problem_id])?;
        match rows.next()? {
            Some(row) => Ok(Some(ProblemAttachment {
                relative_path: std::path::PathBuf::from(row.get::<_, String>(0)?),
                mime_type: row.get(1)?,
            })),
            None => Ok(None),
        }
    }

    #[cfg(test)]
    pub fn problem_version(&self, problem_id: &str) -> DatabaseResult<String> {
        self.connection()?
            .query_row(
                "SELECT version FROM problems WHERE id = ?1",
                [problem_id],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn save_problem_field(
        &self,
        problem_id: &str,
        kind: ProblemFieldKind,
        value: &str,
        expected_version: &str,
    ) -> DatabaseResult<SavedProblemField> {
        let updated_at = timestamp();
        let version = record_id("version");
        self.with_transaction(|transaction| {
            let current: String = transaction.query_row(
                "SELECT version FROM problems WHERE id = ?1",
                [problem_id],
                |row| row.get(0),
            )?;
            if current != expected_version {
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
            transaction.execute(
                "UPDATE problems SET updated_at = ?2, version = ?3 WHERE id = ?1",
                params![problem_id, updated_at, version],
            )?;
            Ok(SavedProblemField {
                problem_id: problem_id.to_owned(),
                kind: kind.as_str().to_owned(),
                value: value.to_owned(),
                updated_at,
                version,
            })
        })
    }

    pub fn get_problem_document(&self, problem_id: &str) -> DatabaseResult<ProblemDocument> {
        let connection = self.connection()?;
        let (id, title, status, updated_at, version) = connection.query_row(
            "SELECT id, title, status, updated_at, version FROM problems WHERE id = ?1",
            [problem_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )?;
        let mut statement = connection.prepare(
            "SELECT kind, value, updated_at FROM problem_fields WHERE problem_id = ?1
             ORDER BY CASE kind
               WHEN 'stem' THEN 1 WHEN 'own_answer' THEN 2 WHEN 'standard_answer' THEN 3
               WHEN 'explanation' THEN 4 WHEN 'mistake_reason' THEN 5 WHEN 'notes' THEN 6 END",
        )?;
        let fields = statement
            .query_map([problem_id], |row| {
                Ok(ProblemField {
                    kind: row.get(0)?,
                    value: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ProblemDocument {
            id,
            title,
            status,
            updated_at,
            version,
            fields,
        })
    }

    pub fn complete_review(
        &self,
        problem_id: &str,
        grade: ReviewGrade,
        reviewed_on: &str,
    ) -> DatabaseResult<ReviewSchedule> {
        self.with_transaction(|transaction| {
            let interval: u32 = transaction.query_row("SELECT review_interval_days FROM problems WHERE id = ?1", [problem_id], |row| row.get(0))?;
            let schedule = schedule_next(interval, grade, reviewed_on).map_err(DatabaseError::Conflict)?;
            transaction.execute(
                "UPDATE problems SET review_interval_days = ?2, last_reviewed_at = ?3, next_review_at = ?4, status = 'active', updated_at = ?5, version = ?6 WHERE id = ?1",
                params![problem_id, schedule.interval_days, reviewed_on, schedule.next_review_on, timestamp(), record_id("version")],
            )?;
            Ok(schedule)
        })
    }

    pub fn list_all_problems(&self) -> DatabaseResult<Vec<RecentProblem>> {
        let connection = self.connection()?;
        query_problems(&connection, None)
    }

    pub fn list_due_review_problems(&self, today: &str) -> DatabaseResult<Vec<ReviewProblem>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT p.id, stem.value, COALESCE(own.value, ''), COALESCE(answer.value, ''), COALESCE(explanation.value, '')
             FROM problems p
             JOIN problem_fields stem ON stem.problem_id = p.id AND stem.kind = 'stem' AND trim(stem.value) <> ''
             LEFT JOIN problem_fields own ON own.problem_id = p.id AND own.kind = 'own_answer'
             LEFT JOIN problem_fields answer ON answer.problem_id = p.id AND answer.kind = 'standard_answer'
             LEFT JOIN problem_fields explanation ON explanation.problem_id = p.id AND explanation.kind = 'explanation'
             WHERE p.status IN ('inbox', 'active') AND (p.next_review_at IS NULL OR p.next_review_at <= ?1)
             ORDER BY COALESCE(p.next_review_at, '') ASC, p.created_at ASC",
        )?;
        let reviews = statement
            .query_map([today], |row| {
                Ok(ReviewProblem {
                    id: row.get(0)?,
                    stem: row.get(1)?,
                    own_answer: row.get(2)?,
                    standard_answer: row.get(3)?,
                    explanation: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(reviews)
    }

    pub fn export_problem_book(&self, include_answers: bool) -> DatabaseResult<ProblemBook> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT CASE WHEN trim(c.term) <> '' THEN c.name || ' · ' || c.term ELSE c.name END,
                    stem.value,
                    COALESCE(own.value, ''),
                    COALESCE(answer.value, ''),
                    COALESCE(explanation.value, ''),
                    COALESCE(mistake.value, ''),
                    COALESCE(notes.value, '')
             FROM problems p
             JOIN courses c ON c.id = p.course_id
             JOIN problem_fields stem ON stem.problem_id = p.id AND stem.kind = 'stem' AND trim(stem.value) <> ''
             LEFT JOIN problem_fields own ON own.problem_id = p.id AND own.kind = 'own_answer'
             LEFT JOIN problem_fields answer ON answer.problem_id = p.id AND answer.kind = 'standard_answer'
             LEFT JOIN problem_fields explanation ON explanation.problem_id = p.id AND explanation.kind = 'explanation'
             LEFT JOIN problem_fields mistake ON mistake.problem_id = p.id AND mistake.kind = 'mistake_reason'
             LEFT JOIN problem_fields notes ON notes.problem_id = p.id AND notes.kind = 'notes'
             WHERE p.status <> 'trash'
             ORDER BY c.name ASC, c.term ASC, p.created_at ASC",
        )?;
        let mut rows = statement.query([])?;
        let title = if include_answers {
            "答案解析册"
        } else {
            "题目册"
        };
        let mut markdown =
            format!("# 错题智库 · {title}\n\n> 由本地资料库生成；原件仍安全保存在本机。\n");
        let mut current_course = String::new();
        let mut problem_count = 0;

        while let Some(row) = rows.next()? {
            let course: String = row.get(0)?;
            let stem: String = row.get(1)?;
            let own_answer: String = row.get(2)?;
            let standard_answer: String = row.get(3)?;
            let explanation: String = row.get(4)?;
            let mistake_reason: String = row.get(5)?;
            let notes: String = row.get(6)?;

            if current_course != course {
                current_course = course;
                markdown.push_str(&format!("\n## {}\n", current_course));
            }
            problem_count += 1;
            markdown.push_str(&format!("\n### {problem_count}. {}\n", stem.trim()));
            if include_answers {
                append_markdown_section(&mut markdown, "我的作答", &own_answer);
                append_markdown_section(&mut markdown, "标准答案", &standard_answer);
                append_markdown_section(&mut markdown, "解析", &explanation);
                append_markdown_section(&mut markdown, "错因", &mistake_reason);
                append_markdown_section(&mut markdown, "补充笔记", &notes);
            }
        }

        if problem_count == 0 {
            markdown.push_str("\n暂无已补充题干的题目。\n");
        }
        Ok(ProblemBook {
            markdown,
            problem_count,
        })
    }

    pub fn write_problem_book(
        &self,
        destination: &Path,
        include_answers: bool,
    ) -> DatabaseResult<ProblemBook> {
        let book = self.export_problem_book(include_answers)?;
        let filename = destination
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| DatabaseError::Conflict("请选择有效的导出文件名。".to_owned()))?;
        let temporary =
            destination.with_file_name(format!(".{filename}.{}.partial", record_id("export")));

        std::fs::write(&temporary, book.markdown.as_bytes())?;
        std::fs::rename(temporary, destination)?;
        Ok(book)
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
        self.connection
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)
    }
}

pub(crate) fn apply_migration(
    connection: &mut Connection,
    sql: &str,
    target_version: i64,
) -> DatabaseResult<()> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(sql)?;
    transaction.execute("UPDATE schema_meta SET version = ?1", [target_version])?;
    transaction.commit()?;
    Ok(())
}

fn configure_connection(connection: &Connection) -> DatabaseResult<()> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    )?;
    Ok(())
}

fn migrate_to_current_schema(connection: &mut Connection) -> DatabaseResult<()> {
    let has_schema_meta = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta')",
        [],
        |row| row.get::<_, bool>(0),
    )?;
    if !has_schema_meta {
        apply_migration(
            connection,
            include_str!("../../migrations/0001_initial.sql"),
            1,
        )?;
    }
    let mut schema_version = connection
        .query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
            row.get::<_, i64>(0)
        })
        .optional()?
        .unwrap_or(1);
    if schema_version == 1 {
        apply_migration(
            connection,
            include_str!("../../migrations/0001_initial.sql"),
            1,
        )?;
    }
    if schema_version < 2 {
        apply_migration(
            connection,
            include_str!("../../migrations/0002_problem_fields.sql"),
            2,
        )?;
        schema_version = 2;
    }
    if schema_version < 3 {
        apply_review_state_migration(connection)?;
        schema_version = 3;
    }
    if schema_version < 4 {
        apply_migration(
            connection,
            include_str!("../../migrations/0004_course_materials.sql"),
            4,
        )?;
        schema_version = 4;
    }
    if schema_version < 5 {
        apply_migration(
            connection,
            include_str!("../../migrations/0005_problem_versions.sql"),
            5,
        )?;
        schema_version = 5;
    }
    if schema_version < CURRENT_SCHEMA_VERSION {
        apply_migration(
            connection,
            include_str!("../../migrations/0006_course_kind.sql"),
            CURRENT_SCHEMA_VERSION,
        )?;
    }
    Ok(())
}

fn apply_review_state_migration(connection: &mut Connection) -> DatabaseResult<()> {
    let has_interval = connection.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM pragma_table_info('problems')
             WHERE name = 'review_interval_days'
         )",
        [],
        |row| row.get::<_, bool>(0),
    )?;
    let has_last_reviewed = connection.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM pragma_table_info('problems')
             WHERE name = 'last_reviewed_at'
         )",
        [],
        |row| row.get::<_, bool>(0),
    )?;

    if !has_interval && !has_last_reviewed {
        return apply_migration(
            connection,
            include_str!("../../migrations/0003_review_state.sql"),
            3,
        );
    }

    let transaction = connection.transaction()?;
    if !has_interval {
        transaction.execute_batch(
            "ALTER TABLE problems
             ADD COLUMN review_interval_days INTEGER NOT NULL DEFAULT 1;",
        )?;
    }
    if !has_last_reviewed {
        transaction.execute_batch("ALTER TABLE problems ADD COLUMN last_reviewed_at TEXT;")?;
    }
    transaction.execute("UPDATE schema_meta SET version = 3", [])?;
    transaction.commit()?;
    Ok(())
}

fn record_id(prefix: &str) -> String {
    format!(
        "{prefix}-{}-{}",
        epoch_millis(),
        NEXT_RECORD_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn append_markdown_section(markdown: &mut String, title: &str, value: &str) {
    let value = value.trim();
    if !value.is_empty() {
        markdown.push_str(&format!("\n**{title}**\n\n{value}\n"));
    }
}

fn split_material_chunks(content: &str, maximum_characters: usize) -> Vec<String> {
    let characters = content.chars().collect::<Vec<_>>();
    characters
        .chunks(maximum_characters)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect()
}

fn escape_like_pattern(query: &str) -> String {
    let mut escaped = String::with_capacity(query.len());
    for character in query.chars() {
        if matches!(character, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

fn query_scalar<P: rusqlite::Params>(
    connection: &Connection,
    sql: &str,
    params: P,
) -> DatabaseResult<u32> {
    let count = connection.query_row(sql, params, |row| row.get::<_, i64>(0))?;
    Ok(u32::try_from(count).unwrap_or(u32::MAX))
}

fn query_course_summaries(
    connection: &Connection,
    today: &str,
) -> DatabaseResult<Vec<CourseSummary>> {
    let mut statement = connection.prepare(
        "WITH course_activity AS (
             SELECT id AS course_id, updated_at AS raw_updated_at FROM courses
             UNION ALL
             SELECT course_id, updated_at FROM problems WHERE status != 'trash'
             UNION ALL
             SELECT course_id, created_at FROM course_materials
         ),
         normalized_course_activity AS (
             SELECT course_id,
                    CASE
                        WHEN raw_updated_at NOT GLOB '*[^0-9]*'
                             AND CAST(raw_updated_at AS INTEGER) > 100000000000
                            THEN strftime(
                                '%Y-%m-%dT%H:%M:%fZ',
                                CAST(raw_updated_at AS INTEGER) / 1000,
                                'unixepoch'
                            )
                        ELSE raw_updated_at
                    END AS updated_at
             FROM course_activity
         ),
         latest_course_activity AS (
             SELECT course_id, MAX(updated_at) AS updated_at
             FROM normalized_course_activity
             GROUP BY course_id
         )
         SELECT c.id,
                c.name,
                c.color,
                (SELECT COUNT(*) FROM problems p WHERE p.course_id = c.id AND p.status != 'trash'),
                (SELECT COUNT(*) FROM problems p WHERE p.course_id = c.id AND p.status = 'inbox'),
                (SELECT COUNT(*) FROM problems p
                 WHERE p.course_id = c.id
                   AND p.status IN ('inbox', 'active')
                   AND p.next_review_at IS NOT NULL
                   AND p.next_review_at <= ?1),
                (SELECT COUNT(*) FROM course_materials m WHERE m.course_id = c.id),
                activity.updated_at AS aggregate_updated_at
         FROM courses c
         JOIN latest_course_activity activity ON activity.course_id = c.id
         WHERE c.archived_at IS NULL
         ORDER BY aggregate_updated_at DESC, c.created_at DESC",
    )?;
    let rows = statement.query_map([today], |row| {
        Ok(CourseSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            problem_count: row.get::<_, u32>(3)?,
            pending_count: row.get::<_, u32>(4)?,
            due_count: row.get::<_, u32>(5)?,
            material_count: row.get::<_, u32>(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_recent_problems(connection: &Connection) -> DatabaseResult<Vec<RecentProblem>> {
    query_problems(connection, Some(5))
}

fn query_problems(
    connection: &Connection,
    limit: Option<usize>,
) -> DatabaseResult<Vec<RecentProblem>> {
    let mut statement = connection.prepare(
        "SELECT p.id,
                p.course_id,
                c.name,
                p.title,
                COALESCE(i.filename, ''),
                p.status,
                p.updated_at
         FROM problems p
         JOIN courses c ON c.id = p.course_id
         LEFT JOIN inbox_items i ON i.problem_id = p.id
         WHERE p.status != 'trash'
         ORDER BY p.updated_at DESC",
    )?;
    let rows = statement.query_map([], |row| {
        let title: String = row.get(3)?;
        let fallback_filename: String = row.get(4)?;
        Ok(RecentProblem {
            id: row.get(0)?,
            course_id: row.get(1)?,
            course_name: row.get(2)?,
            title: problem_display_title(&title, &fallback_filename),
            fallback_filename,
            status: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    let mut problems = rows.collect::<Result<Vec<_>, _>>()?;
    if let Some(limit) = limit {
        problems.truncate(limit);
    }
    Ok(problems)
}

fn problem_display_title(title: &str, filename: &str) -> String {
    if !title.trim().is_empty() {
        return title.to_owned();
    }
    Path::new(filename)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .unwrap_or("未命名题目")
        .to_owned()
}

fn query_counted_fields(
    connection: &Connection,
    kind: &str,
    split_topics: bool,
) -> DatabaseResult<Vec<CountedSignal>> {
    let mut statement =
        connection.prepare("SELECT problem_id, value FROM problem_fields WHERE kind = ?1")?;
    let mut rows = statement.query([kind])?;
    let mut counts = HashMap::<String, u32>::new();
    let mut values_by_problem = HashMap::<String, HashSet<String>>::new();

    while let Some(row) = rows.next()? {
        let problem_id: String = row.get(0)?;
        let value: String = row.get(1)?;
        let values = if split_topics {
            split_knowledge_topics(&value)
        } else {
            vec![value.trim().to_owned()]
        };
        let seen_for_problem = values_by_problem.entry(problem_id).or_default();
        for value in values {
            if !value.is_empty() && seen_for_problem.insert(value.clone()) {
                *counts.entry(value).or_default() += 1;
            }
        }
    }

    let mut signals = counts
        .into_iter()
        .map(|(label, count)| CountedSignal { label, count })
        .collect::<Vec<_>>();
    signals.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.label.cmp(&right.label))
    });
    signals.truncate(5);
    Ok(signals)
}

fn split_knowledge_topics(value: &str) -> Vec<String> {
    let value = value.trim();
    let value = value
        .strip_prefix("鐭ヨ瘑鐐癸細")
        .or_else(|| value.strip_prefix("鐭ヨ瘑鐐筦"))
        .or_else(|| value.strip_prefix("知识点："))
        .unwrap_or(value)
        .trim();
    value
        .replace("銆佽", ";")
        .split(|character| {
            matches!(
                character,
                '，' | '。' | '；' | ';' | ',' | '?' | '\n' | '、' | '—' | '銆'
            )
        })
        .map(str::trim)
        .filter(|topic| !topic.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn query_activity_days(connection: &Connection, today: &str) -> DatabaseResult<Vec<ActivityDay>> {
    let today = NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map_err(|_| DatabaseError::Conflict("today must use YYYY-MM-DD".into()))?;
    let mut activity = Vec::with_capacity(7);
    for offset in (0..7).rev() {
        let date = (today - Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string();
        let count = query_scalar(
            connection,
            "SELECT COUNT(*) FROM (
                 SELECT id FROM problems
                 WHERE CASE
                     WHEN updated_at NOT LIKE '%-%' AND CAST(updated_at AS INTEGER) > 100000000000
                         THEN date(CAST(updated_at AS INTEGER) / 1000, 'unixepoch', '+8 hours')
                     ELSE date(updated_at, '+8 hours')
                 END = ?1
                 UNION
                 SELECT id FROM problems WHERE last_reviewed_at = ?1
             )",
            [&date],
        )?;
        activity.push(ActivityDay { date, count });
    }
    Ok(activity)
}

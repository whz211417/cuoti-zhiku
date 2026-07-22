CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER NOT NULL
);

INSERT INTO schema_meta(version)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM schema_meta);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  term TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#8B7046',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL CHECK(status IN ('inbox', 'active', 'trash')),
  title TEXT NOT NULL DEFAULT '',
  next_review_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY NOT NULL,
  problem_id TEXT NOT NULL UNIQUE REFERENCES problems(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL
);

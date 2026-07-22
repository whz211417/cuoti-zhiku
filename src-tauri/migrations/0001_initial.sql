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

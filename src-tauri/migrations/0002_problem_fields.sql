CREATE TABLE IF NOT EXISTS problem_fields (
  problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('stem', 'own_answer', 'standard_answer', 'explanation', 'mistake_reason', 'notes')),
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(problem_id, kind)
);

CREATE TABLE IF NOT EXISTS field_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('user', 'ai_accepted')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS field_revisions_problem_idx
ON field_revisions(problem_id, created_at DESC);

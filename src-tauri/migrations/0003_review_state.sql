ALTER TABLE problems ADD COLUMN review_interval_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE problems ADD COLUMN last_reviewed_at TEXT;

ALTER TABLE course_materials ADD COLUMN original_relative_path TEXT;
ALTER TABLE course_materials ADD COLUMN sha256 TEXT;
ALTER TABLE course_materials ADD COLUMN byte_size INTEGER;
ALTER TABLE course_materials ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS course_materials_live_course_idx
ON course_materials(course_id, deleted_at, created_at DESC);

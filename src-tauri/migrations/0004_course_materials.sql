CREATE TABLE IF NOT EXISTS course_materials (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS material_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  material_id TEXT NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL,
  UNIQUE(material_id, ordinal)
);

CREATE INDEX IF NOT EXISTS material_chunks_material_idx ON material_chunks(material_id, ordinal);

ALTER TABLE courses
ADD COLUMN kind TEXT NOT NULL DEFAULT 'school'
CHECK(kind IN ('school', 'exam', 'language', 'certificate', 'other'));

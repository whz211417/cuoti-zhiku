ALTER TABLE problems ADD COLUMN deleted_at TEXT;
ALTER TABLE problems ADD COLUMN status_before_trash TEXT
  CHECK(status_before_trash IN ('inbox', 'active'));

-- Recover the state of older databases that already contain a trash record.
UPDATE problems
SET deleted_at = updated_at,
    status_before_trash = CASE
      WHEN next_review_at IS NULL AND EXISTS (
        SELECT 1 FROM inbox_items WHERE problem_id = problems.id
      ) THEN 'inbox'
      ELSE 'active'
    END
WHERE status = 'trash';

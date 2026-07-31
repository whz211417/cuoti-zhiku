ALTER TABLE problems ADD COLUMN version TEXT NOT NULL DEFAULT '';

UPDATE problems
SET version = CASE
  WHEN updated_at LIKE 'version-%' THEN updated_at
  ELSE 'version-' || lower(hex(randomblob(16)))
END;

UPDATE problems
SET updated_at = CASE
  WHEN updated_at NOT GLOB '*[^0-9]*'
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(updated_at AS INTEGER) / 1000, 'unixepoch')
  WHEN updated_at LIKE 'version-%' AND created_at NOT GLOB '*[^0-9]*'
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(created_at AS INTEGER) / 1000, 'unixepoch')
  WHEN updated_at LIKE 'version-%' THEN created_at
  ELSE updated_at
END;

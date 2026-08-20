# Course Material Custody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve imported course-material originals locally and make accidental deletion recoverable for 30 days.

**Architecture:** Extend `course_materials` with managed-original metadata and a soft-delete timestamp. Reuse the existing SHA-256 atomic-write `services::ingest` path and `originals/` backup tree. Tauri exposes explicit current/trash/restore/purge commands; React has current and recent-deletions states.

**Tech Stack:** Tauri 2, Rust, rusqlite, React 19, TypeScript, Vitest.

## Global Constraints

- Never move, modify, or delete a selected source file.
- Parameterize and course-scope every material mutation.
- Normal listing, search, and AI context exclude `deleted_at IS NOT NULL`.
- Store managed bytes only in the existing content-addressed `originals/` tree so backups include them.
- Do not add OCR or any AI request in this slice.

---

### Task 1: Persist custody metadata and soft deletion

**Files:**
- Create: `src-tauri/migrations/0007_course_material_custody.sql`
- Modify: `src-tauri/src/db/database.rs`, `src-tauri/src/db/database_test.rs`

**Interfaces:** `CourseMaterial` gains nullable `original_relative_path`, `sha256`, `byte_size`, `deleted_at`; database gains `trash_course_material`, `restore_course_material`, and `purge_course_material`.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn trashed_material_is_hidden_from_search_and_restorable() {
    let (_root, database) = dashboard_database();
    let material = database.record_course_material("macro", "notes.md", "LM 曲线").unwrap();
    database.trash_course_material("macro", &material.id).unwrap();
    assert!(database.search_course_material("macro", "LM 曲线", 6).unwrap().is_empty());
    database.restore_course_material("macro", &material.id).unwrap();
    assert_eq!(database.search_course_material("macro", "LM 曲线", 6).unwrap().len(), 1);
}
```

- [ ] **Step 2: Verify RED**

Run `pnpm run test:rust -- database_test::trashed_material_is_hidden_from_search_and_restorable`; expect missing-method compilation failure.

- [ ] **Step 3: Implement the migration and minimal database methods**

```sql
ALTER TABLE course_materials ADD COLUMN original_relative_path TEXT;
ALTER TABLE course_materials ADD COLUMN sha256 TEXT;
ALTER TABLE course_materials ADD COLUMN byte_size INTEGER;
ALTER TABLE course_materials ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS course_materials_live_course_idx
ON course_materials(course_id, deleted_at, created_at DESC);
```

Filter live queries, update only the scoped active/trashed state, and return a conflict when the row is absent or cross-course.

- [ ] **Step 4: Verify GREEN and commit**

Run the same Rust test; then commit migration, database code, and tests as `feat: retain material custody metadata`.

### Task 2: Copy imported files through the trusted ingest service

**Files:**
- Modify: `src-tauri/src/commands/materials.rs`, `src-tauri/src/db/database.rs`, `src-tauri/src/services/ingest_test.rs`

**Interfaces:** `record_course_material_with_original(course_id, filename, content, original: Option<&ImportedOriginal>)`; `import_course_material_file` invokes it only after successful text extraction and content-addressed copy.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn imported_course_material_keeps_a_content_addressed_original_copy() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("notes.md");
    std::fs::write(&source, "LM 曲线").unwrap();
    let copied = import_original(&source, &root.path().join("originals")).unwrap();
    assert!(root.path().join("originals").join(copied.relative_path).is_file());
}
```

- [ ] **Step 2: Verify RED**

Run the targeted test before wiring material import; it must not yet prove the material command stores the copy.

- [ ] **Step 3: Implement minimal flow**

Extract text first. Then call `import_original(path, &state.originals_root)`, pass its metadata into one database transaction, and expose only a relative path in the DTO. Leave pasted text metadata null.

- [ ] **Step 4: Verify GREEN and commit**

Run `pnpm run test:rust -- ingest_test`; commit as `feat: preserve imported material originals`.

### Task 3: Expose the recovery workflow in the material library

**Files:**
- Modify: `src-tauri/src/commands/materials.rs`, `src-tauri/src/lib.rs`, `src/lib/tauri.ts`
- Modify: `src/features/materials/MaterialsLibrary.tsx`, `src/features/materials/MaterialsLibrary.test.tsx`, `src/styles/global.css`

**Interfaces:** `list_course_materials(course_id, include_deleted)`, `trash_course_material`, `restore_course_material`, `purge_course_material`.

- [ ] **Step 1: Write the failing UI test**

```tsx
test('moves a material to recent deletions and restores it', async () => {
  listCourseMaterials.mockResolvedValueOnce([{ id: 'm1', courseId: 'macro', filename: 'notes.pdf', deletedAt: null }]);
  render(<MaterialsLibrary courseId="macro" />);
  await user.click(screen.getByRole('button', { name: '移除 notes.pdf' }));
  await user.click(screen.getByRole('button', { name: '移入回收站' }));
  expect(trashCourseMaterial).toHaveBeenCalledWith('macro', 'm1');
});
```

- [ ] **Step 2: Verify RED**

Run `pnpm test -- src/features/materials/MaterialsLibrary.test.tsx`; expect missing command/control failures.

- [ ] **Step 3: Implement the two-state experience**

Current list uses “移入回收站”; a disclosure loads recent deletions with remaining days and actions for restore or separately-confirmed permanent purge. Use only a 180–220 ms transform/opacity entry for the occasional confirmation surface and preserve the reduced-motion fallback.

- [ ] **Step 4: Verify GREEN and commit**

Run targeted frontend tests; commit as `feat: recover deleted course materials`.

### Task 4: Verify migration, backup, and release safety

**Files:**
- Modify: `src-tauri/src/db/database_test.rs`, `src-tauri/src/services/backup_test.rs`

- [ ] **Step 1: Write failing migration and backup tests**

Cover a schema-v6 database migrating with nullable new fields and a complete backup manifest including a managed material original.

- [ ] **Step 2: Verify RED then implement compatibility**

Increase `CURRENT_SCHEMA_VERSION` to 7, register migration 0007, and rely on the existing backup collector for `originals/`.

- [ ] **Step 3: Full verification and commit**

Run `pnpm test`, `pnpm run test:rust`, and `pnpm run build`; commit test coverage as `test: cover material custody migration and backup`.

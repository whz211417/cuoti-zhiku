# Quiet Pointer and Learning Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global glow cursor with restrained native-pointer feedback and close the local ingest-organize-review loop.

**Architecture:** Keep pointer feedback CSS-only and local to controls. Add one narrow transactional Rust command for completing organization, enforce review eligibility in SQLite queries, and let React consume the returned document as the source of truth. Reuse existing import, export, review, and course state rather than creating new centers or stores.

**Tech Stack:** React 19, TypeScript 5.7, Vitest, Testing Library, Tauri 2, Rust, rusqlite, CSS custom properties.

## Global Constraints

- Preserve all existing uncommitted AI, credential, schema-generation, and Obsidian changes; stage only files listed by each task.
- The Windows system pointer must remain visible and semantically correct on text, drag, disabled, and resize targets.
- No global pointer tracking, large radial halo, per-frame layout read, `transition: all`, auto-running animation, or new dependency.
- AI remains optional and is never called by import or completion actions.
- Originals are saved before continuation; partial import success remains recoverable from the inbox.
- Each production behavior starts with a failing test and each task ends with a focused commit.

---

### Task 1: Replace global glow with quiet local feedback

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/components/material/DynamicControlSurface.tsx`
- Modify: `src/components/material/DynamicControlSurface.test.tsx`
- Modify: `src/styles/dynamicGlassStyle.test.ts`
- Modify: `src/styles/global.css`
- Delete: `src/components/cursor/ImmersiveCursor.tsx`
- Delete: `src/components/cursor/ImmersiveCursor.test.tsx`
- Delete: `src/components/cursor/cursorTarget.ts`
- Delete: `src/components/cursor/cursorTarget.test.ts`

**Interfaces:**
- Consumes: existing `DynamicControlSurface` wrapper and toolbar/sidebar class names.
- Produces: static navigation material; hover/active/focus-visible feedback remains CSS-only.

- [x] **Step 1: Write the failing material test**

Replace the pointer-coordinate contract with a test that renders a surface and verifies it does not install pointer-move handlers or inline `--glass-local-x`, `--glass-local-y`, and `--glass-active` values:

```tsx
render(<DynamicControlSurface as="header">Toolbar</DynamicControlSurface>);
const surface = screen.getByRole('banner');
expect(surface).not.toHaveStyle({ '--glass-local-x': expect.anything() });
fireEvent.pointerMove(surface, { clientX: 80, clientY: 40 });
expect(requestAnimationFrame).not.toHaveBeenCalled();
```

- [x] **Step 2: Run red test**

Run `npm.cmd test -- --run src/components/material/DynamicControlSurface.test.tsx`; expect failure because the current component tracks pointer coordinates and requests animation frames.

- [x] **Step 3: Implement the minimal static surface**

Reduce `DynamicControlSurface` to `createElement(as, { ...rest, className, data-material: 'navigation' }, children)`. Remove `ImmersiveCursor` import and render from `App`. Delete global `cursor: none`, `.immersive-cursor`, `.dynamic-glass-light`, and pointer-driven radial-gradient rules. Keep local controls on:

```css
.toolbar-button:hover,
.nav-item:hover {
  border-color: color-mix(in srgb, currentColor 18%, transparent);
  box-shadow: inset 0 1px rgb(255 255 255 / .16), 0 6px 18px rgb(0 0 0 / .08);
}
.toolbar-button:active,
.primary-action:active { transform: scale(.98); }
```

- [x] **Step 4: Verify and commit**

Run focused tests, `npm.cmd run typecheck`, and `npm.cmd run lint`. Stage only Task 1 files and commit `fix: replace global glow with quiet pointer feedback`.

### Task 2: Make organization completion transactional and restrict review eligibility

**Files:**
- Modify: `src-tauri/src/db/database.rs`
- Modify: `src-tauri/src/db/database_test.rs`
- Modify: `src-tauri/src/commands/problems.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/tauri.test.ts`

**Interfaces:**
- Produces Rust `Database::complete_problem_organization(problem_id, expected_version, today) -> ProblemDocument`.
- Produces Rust `Database::update_problem_course(problem_id, course_id, expected_version) -> ProblemDocument`.
- Produces Tauri wrappers `completeProblemOrganization(problemId, expectedVersion, today)` and `updateProblemCourse(problemId, courseId, expectedVersion)`, both returning `Promise<ProblemDocument>`.

- [x] **Step 1: Write failing Rust database tests**

Add tests that insert an inbox problem and assert:

```rust
let completed = database.complete_problem_organization("problem-1", &version, "2026-09-20").unwrap();
assert_eq!(completed.status, "active");
assert!(database.list_inbox_items().unwrap().is_empty());
assert_eq!(database.list_due_review_problems("2026-09-20").unwrap().len(), 1);
```

Also assert missing `stem`, missing `standard_answer`, and stale version each return `DatabaseError::Conflict` without changing status or inbox rows. Add an inbox problem with a stem and answer directly to the database and assert it is excluded from `list_due_review_problems` until completion.

- [x] **Step 2: Run red Rust tests**

Run the repository Rust test command filtered to the new test names; expect compilation failure because the method does not exist and review currently includes inbox rows.

- [x] **Step 3: Implement the transaction and queries**

Within `with_transaction`, load status/version/course plus trimmed stem and standard answer. Validate expected version and required fields, then execute:

```sql
UPDATE problems
SET status = 'active', next_review_at = ?2, updated_at = ?3, version = ?4
WHERE id = ?1;
DELETE FROM inbox_items WHERE problem_id = ?1;
```

Return `get_problem_document` after the transaction. Change dashboard and due-review queries from `status IN ('inbox', 'active')` to `status = 'active'`, and require an inner join to non-empty `standard_answer` in `list_due_review_problems`.

- [x] **Step 4: Add the narrow command and wrapper tests**

Register `commands::problems::complete_problem_organization` and `commands::problems::update_problem_course`. The course transaction must verify that the target course exists and is not archived, then update `course_id`, `updated_at`, and `version`. Expose the completion TypeScript wrapper using:

```ts
invoke<ProblemDocument>('complete_problem_organization', {
  problemId,
  expectedVersion,
  today,
});
```

First add a failing `src/lib/tauri.test.ts` assertion for the exact command name and payload, then implement it.

- [x] **Step 5: Verify and commit**

Run focused Rust tests, `npm.cmd test -- --run src/lib/tauri.test.ts`, and `npm.cmd run typecheck`. Stage only Task 2 files and commit `feat: complete organization before review`.

### Task 3: Add the completion action to the problem document

**Files:**
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/problems/problems.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- `ProblemDocument` gains `onOrganized?: (document: ProblemDocument) => void`.
- Consumes `completeProblemOrganization` and `localCalendarDate()`.

- [ ] **Step 1: Write failing UI tests**

For an inbox document with stem and standard answer, click `完成整理并加入复习` and assert the narrow wrapper receives document id/version/today, success copy appears, and `onOrganized` receives the returned active document. For missing fields, assert an accessible checklist names the missing field and the command is not called. For command rejection, assert the page remains open with a retry button. Render courses, change the course selector, and assert `updateProblemCourse` receives the current version and replaces the document with the returned version.

- [ ] **Step 2: Run red test**

Run `npm.cmd test -- --run src/features/problems/problems.test.tsx`; expect failure because no completion action exists.

- [ ] **Step 3: Implement minimal UI and refresh flow**

Derive `stemReady`, `answerReady`, and `canComplete` from the current field map. Render one footer action after document pages. On success replace local document with the returned value, call `onOrganized`, and keep the page readable with `已加入复习计划`. Pass existing courses to the document and render an accessible course selector in the header; use the narrow version-checked course command. In `App`, clear any queued inbox state, refresh dashboard/inbox data through existing callbacks, and keep the organized problem open.

- [ ] **Step 4: Verify and commit**

Run problems and App tests, typecheck, and lint. Stage only Task 3 files and commit `feat: close the organize to review loop`.

### Task 4: Continue directly after import and expose course destination

**Files:**
- Modify: `src/features/inbox/IngestDropzone.tsx`
- Modify: `src/features/inbox/inbox.test.tsx`
- Modify: `src/features/ingest/GlobalFileDrop.tsx`
- Modify: `src/features/ingest/GlobalFileDrop.test.tsx`
- Modify: `src/features/ingest/ClipboardImageCapture.tsx`
- Modify: `src/features/ingest/ClipboardImageCapture.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Successful import callbacks produce ordered `problemId[]` while preserving the existing refresh callback.
- `App` opens the first imported problem and tracks remaining ids only in memory.

- [ ] **Step 1: Write failing continuation tests**

Assert single-file import invokes `onOpenProblem(problemId)` immediately. Assert multiple results open the first successful item in source order and do not open failures. Assert toolbar copy includes `保存到：<selected course name>` or `保存到：未分类`.

- [ ] **Step 2: Run red tests**

Run inbox, global-drop, clipboard, and App test files; expect failures because current callbacks only navigate to the inbox.

- [ ] **Step 3: Implement ordered continuation**

After all import results settle, extract `results.flatMap(result => result.item ? [result.item.problemId] : [])`; refresh counts, then open the first id. Keep all results rendered in the inbox for recovery. Resolve the selected course name from existing `courses` state and place destination copy beside the ingest action.

- [ ] **Step 4: Verify and commit**

Run focused tests, typecheck, and lint. Stage only Task 4 files and commit `feat: continue directly from local import`.

### Task 5: Surface exits and reduce navigation weight

**Files:**
- Modify: `src/features/archive/ArchiveLibrary.tsx`
- Modify: `src/features/archive/ArchiveLibrary.test.tsx`
- Modify: `src/features/review/ReviewReader.tsx`
- Modify: `src/features/review/review.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/search/CommandPalette.tsx`
- Modify: `src/features/search/CommandPalette.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- `ArchiveLibrary` gains `onExport?: () => void`.
- `ReviewReader` gains `onDefer?: () => void` and `onEnd?: () => void`; defer never calls `onGrade`.

- [ ] **Step 1: Write failing discoverability and exit tests**

Assert the archive has a visible `导出题册` action without opening settings. Assert review exposes `稍后再看` and `结束本次`; both avoid grading. Assert clicking command-palette scrim closes it. Assert the mobile navigation does not render five equal top-level items.

- [ ] **Step 2: Run red tests**

Run archive, review, search, and App tests; expect failures for missing callbacks and scrim behavior.

- [ ] **Step 3: Implement the minimal exits and responsive grouping**

Reuse the existing export choice UI by opening it from the archive action. Defer rotates the current problem to the queue tail in memory; end displays the existing review summary for completed items. Add scrim click dismissal while stopping propagation inside the palette. At `max-width: 780px`, show overview/inbox/review plus one `更多` control containing knowledge/archive; keep 44px targets. Compress the persistent toolbar to 56–60px, move greeting copy into overview content, keep Today Focus to one primary action plus one supporting line, and style review grades as one segmented control with the `1–4` keycaps inside each option.

- [ ] **Step 4: Verify and commit**

Run focused tests, typecheck, lint, and production build. Stage only Task 5 files and commit `feat: make core learning exits discoverable`.

### Task 6: Full verification and documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-09-20-quiet-pointer-learning-flow.md`
- Modify: `CHANGELOG.md` if present, otherwise `docs/release/0.5.1.md`

- [ ] **Step 1: Run complete automated verification**

Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, and the repository Rust test command. All must exit 0 with no new warnings attributable to this work.

- [ ] **Step 2: Run visual verification**

Launch the Vite/Tauri UI and inspect 1440×900, 1024×768, and 780px-or-narrower views. Verify native cursor semantics, no halo, no mobile navigation wrap, completion feedback, import continuation, archive export, and review exits. Verify dark/light and reduced motion/transparency.

- [ ] **Step 3: Record completion**

Mark plan checkboxes, document user-visible changes and verification commands, review the staged diff for unrelated files and secrets, then commit `docs: record quiet learning flow verification`.

# Final whole-branch review fix report

Date: 2026-07-31
Branch: `feature/cuoti-zhiku-v1`
Reviewed base: `b56fc790bc991aa067f572c762cd12bbe3162df1`

## Commits

- `fbf1318` — `fix: grant main window dialog capabilities`
- `43f5d3f` — `fix: harden persistent dashboard read models`
- `de9e346` — `fix: complete resilient learning archive flows`

The branch is intentionally kept in its linked worktree for controller review and final installer generation.

## Implemented scope

1. Added `src-tauri/capabilities/main.json` for the `main` window with `core:default` and `dialog:default`. The local Tauri schema explicitly supports `dialog:default`, including open, save, and confirm. The generated capability map was refreshed and committed.
2. Added schema version 5 with a dedicated `problems.version` concurrency token. Persisted `updated_at` values are now RFC 3339 timestamps; record IDs retain epoch-based uniqueness independently. Imported problems receive the source file stem as their title, and old untitled rows receive a file-stem display fallback.
3. Replaced review date `toISOString()` calls with the shared `localCalendarDate` helper for both due retrieval and grading. The helper has an explicit Asia/Shanghai early-morning regression test.
4. Made grading non-reentrant using an immediate ref guard plus disabled controls. The queue advances only after persistence succeeds. Failures keep the same card visible and expose an accessible inline retry using the same failed grade.
5. Added caught initial/manual material-search failures, accessible retry UI, and preservation of the last successful results.
6. Moved material deduplication into a grouped SQL CTE before the global 12-result limit, so repeated chunks cannot starve other materials, problems, or courses.
7. Added a real all-problems archive read model and `ArchiveLibrary`. It loads every non-trashed problem, supports loading/empty/error/retry states, opens problem documents, returns to the archive context, and keeps the existing course-material workspace available.
8. Made every migration and its `schema_meta` update one transaction. Tests cover starting versions 1, 2, and 3, a partial legacy migration, and rollback of both DDL and metadata on failure.
9. Reused the latest successful dashboard aggregate for Spotlight recent-problem shortcuts, avoiding a second fetch.
10. Capped each learning-signal group at five.
11. Excluded trashed problems from course totals, recents, and the archive read model.
12. Added local time-based toolbar greetings and stable, readable per-course update dates. New archive/dashboard surfaces remain opaque under reduced transparency and have no required motion.

## Architecture and data decisions

- Optimistic concurrency now compares opaque `version` tokens; human-facing sorting, activity, and date rendering use parseable `updated_at` timestamps. Review completion advances both independently.
- Schema initialization checks for `schema_meta` before applying migration 1, then advances migrations sequentially through a shared transactional helper.
- Version-5 migration preserves an old `version-*` token as the new concurrency token. Because the previous implementation overwrote the true update time, those legacy rows use their parseable creation time as the safest recoverable timestamp; all subsequent updates are exact RFC 3339 values.
- Archive problem rows reuse the existing dashboard problem summary shape. The new native command is a narrow read model and excludes trash at the SQL boundary.
- The dashboard owns its fetch and reports the successful aggregate upward. App stores only `recentProblems` for Spotlight, so opening Spotlight does not trigger duplicate persistence reads.
- Search and review errors preserve the learner's last useful context rather than clearing data or advancing state.

## Files changed

### Tauri and Rust

- `src-tauri/capabilities/main.json`
- `src-tauri/gen/schemas/capabilities.json`
- `src-tauri/migrations/0005_problem_versions.sql`
- `src-tauri/src/commands/dashboard.rs`
- `src-tauri/src/commands/problems.rs`
- `src-tauri/src/db/database.rs`
- `src-tauri/src/db/database_test.rs`
- `src-tauri/src/domain/problems.rs`
- `src-tauri/src/domain/problems_test.rs`
- `src-tauri/src/lib.rs`

### Frontend

- `src/app/App.tsx`
- `src/app/App.test.tsx`
- `src/features/archive/ArchiveLibrary.tsx`
- `src/features/archive/ArchiveLibrary.test.tsx`
- `src/features/dashboard/CourseShelf.tsx`
- `src/features/dashboard/LearningDashboard.tsx`
- `src/features/dashboard/dashboard.test.tsx`
- `src/features/materials/MaterialsLibrary.tsx`
- `src/features/materials/MaterialsLibrary.test.tsx`
- `src/features/problems/ProblemDocument.tsx`
- `src/features/problems/problems.test.tsx`
- `src/features/review/ReviewReader.tsx`
- `src/features/review/review.test.tsx`
- `src/lib/dates.ts`
- `src/lib/dates.test.ts`
- `src/lib/tauri.ts`
- `src/styles/global.css`

## TDD evidence

- Baseline `pnpm test`: 17 files, 77 tests passed.
- Baseline GNU-host Rust test suite: 38 tests passed.
- Rust red run failed for the intended missing contracts: `apply_migration`, `list_all_problems`, and separate `ProblemDocument.version` / `SavedProblemField.version`.
- Frontend red run exposed the intended missing behavior: missing shared date/archive modules, disabled grading/retry, material-search rejection handling, dashboard aggregate sharing, readable course dates, and use of the new concurrency token. It also captured the pre-fix unhandled material-search rejection.
- Rust green run after implementation: 45 tests passed.
- Focused frontend green run:

  `pnpm exec vitest run src/lib/dates.test.ts src/features/review/review.test.tsx src/features/materials/MaterialsLibrary.test.tsx src/features/archive/ArchiveLibrary.test.tsx src/app/App.test.tsx src/features/dashboard/dashboard.test.tsx src/features/problems/problems.test.tsx`

  Result: 7 files, 56 tests passed.

## Complete verification matrix

All commands were run from the linked worktree.

- `pnpm test`
  - Exit 0; 19 test files and 94 tests passed.
- `pnpm lint`
  - Exit 0; ESLint completed with `--max-warnings=0`.
- `pnpm typecheck`
  - Exit 0; `tsc --noEmit` completed without diagnostics.
- `pnpm build`
  - Exit 0; TypeScript build plus Vite production build completed, 1610 modules transformed.
- `$env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; C:\tmp\cargo-home\bin\cargo.exe +stable-x86_64-pc-windows-gnu fmt --manifest-path src-tauri\Cargo.toml --check`
  - Exit 0; no formatting diff.
- `$toolBin='C:\tmp\w64devkit\w64devkit\bin'; $env:Path="$toolBin;$env:Path"; $env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; C:\tmp\cargo-home\bin\cargo.exe +stable-x86_64-pc-windows-gnu test --manifest-path src-tauri\Cargo.toml`
  - Exit 0; 45 Rust tests passed, plus zero-test main/doc targets passed.
- `$toolBin='C:\tmp\w64devkit\w64devkit\bin'; $env:Path="$toolBin;$env:Path"; $env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; C:\tmp\cargo-home\bin\cargo.exe +stable-x86_64-pc-windows-gnu clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings`
  - Exit 0; completed with warnings denied.
- `$toolBin='C:\tmp\w64devkit\w64devkit\bin'; $env:Path="$toolBin;$env:Path"; $env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; $env:RUSTUP_TOOLCHAIN='stable-x86_64-pc-windows-gnu'; pnpm tauri build --no-bundle --target x86_64-pc-windows-gnu`
  - Exit 0; capability/config validation, frontend production build, and Tauri release application build completed. Output application: `src-tauri/target/x86_64-pc-windows-gnu/release/cuoti-zhiku.exe`.
  - `--no-bundle` was used deliberately; no final installer was built.

## Environment and Git notes

- The managed sandbox initially blocked esbuild path canonicalization (`Cannot read directory "../../../../../..": Access is denied`). The exact same frontend commands passed when rerun with approved repository-path access.
- The default MSVC Rust host could not find `link.exe`. Systematic diagnosis found the already-installed `stable-x86_64-pc-windows-gnu` toolchain and `C:\tmp\w64devkit\w64devkit\bin`; all Rust gates were run successfully with that established toolchain.
- Initial staging commands failed because the linked worktree index is outside the normal writable sandbox:

  `git add src-tauri/capabilities/main.json; git commit -m "fix: grant main window dialog capabilities"; git add src-tauri/migrations/0005_problem_versions.sql src-tauri/src/db/database.rs src-tauri/src/db/database_test.rs src-tauri/src/domain/problems.rs src-tauri/src/domain/problems_test.rs src-tauri/src/commands/problems.rs src-tauri/src/commands/dashboard.rs src-tauri/src/lib.rs; git commit -m "fix: harden persistent dashboard read models"`

  Failure: `Unable to create .../.git/worktrees/cuoti-zhiku-v1/index.lock: Permission denied`.

  The same scoped add/commit operations succeeded with approved Git-index access. No reset or discard operation was used.

## Remaining risks / handoff

- The final NSIS installer still needs the controller's clean rebuild, as explicitly required by the brief.
- Legacy rows whose `updated_at` was already replaced by an opaque version token cannot reveal their historical last-save instant. Migration 5 uses the row's creation timestamp for a parseable fallback and becomes exact on the next save.
- Automated tests and a full no-bundle desktop build cover the changes; final installer launch/dialog smoke testing remains part of the controller's release pass.

## 2026-08-01 re-review addendum

Reviewed HEAD: `3d4a5be`

Implementation commits:

- `950de6f` — `fix: recover interrupted legacy migrations`
- `5aad5dd` — `fix: isolate resilient learning workflows`
- `45710fa` — `docs: remove trailing plan whitespace`

### Re-review fixes

1. `Database::open` now reconciles idempotent migration-1 DDL when metadata says version 1. Migration 3 detects its two known columns and transactionally applies only missing DDL before advancing metadata. Public-open tests preserve unrelated/version-2 problem data across metadata-only version 1, one-column partial migration 3, and both-column/no-metadata migration 3 states.
2. Material-search state is keyed by course and normalized query. Course changes invalidate requests and clear query/results/error before paint; request generations prevent older course/query responses from winning. Results survive a failed refresh only when they belong to the same active course/query.
3. Review-queue rejection has a distinct accessible alert and retry. It no longer renders the successful empty-queue message.
4. Initial problem-document load failure remains fatal, while field-save failure stays inside the editor, preserves the exact draft, and exposes explicit retry.
5. Course summary recency takes the maximum of course, non-trashed problem, and course-material activity.
6. Dashboard activity converts RFC 3339 and legacy epoch timestamps to the China calendar with SQLite `+8 hours`; local `last_reviewed_at` dates remain local-date values.
7. The settings inspector focuses its first control, traps forward/reverse Tab, closes on Escape, and restores the exact invoking element.
8. App behavior tests use the intentional reduced-motion branch so GSAP opacity timing cannot race visibility assertions. The App/archive grouped selection passed five fully observed consecutive runs without sleeps or weaker assertions.
9. Removed the extra EOF blank line from `docs/superpowers/plans/2026-07-22-ios26-motion-implementation.md`.

### TDD evidence

- Baseline frontend run reproduced the grouped App/archive visibility failure: 18 files passed, 1 failed; 93 tests passed, 1 failed.
- Baseline GNU Rust suite passed 45 tests.
- Migration recovery red run failed all three new public-open cases with `no such table: problems` or duplicate `review_interval_days`. Material recency and China-calendar boundary tests also failed with the old values.
- Frontend red run failed at all five intended boundaries: course clearing, stale response ordering, fatal save failure, missing review-load error, and missing modal focus behavior.
- Focused Rust green runs passed all three recovery tests plus both dashboard regression tests; the complete Rust suite grew to 50 tests.
- `pnpm exec vitest run src/features/materials/MaterialsLibrary.test.tsx src/features/problems/problems.test.tsx src/app/App.test.tsx` passed 3 files and 30 tests.
- `pnpm exec vitest run src/app/App.test.tsx src/features/archive/ArchiveLibrary.test.tsx --reporter=dot` passed 2 files and 18 tests in five fully observed consecutive runs.

### Fresh re-review verification matrix

- `pnpm test`
  - Exit 0; 19 test files and 97 tests passed.
- `pnpm lint`
  - Exit 0; ESLint completed with `--max-warnings=0`.
- `pnpm typecheck`
  - Exit 0; `tsc --noEmit` completed without diagnostics.
- `pnpm build`
  - The direct managed-sandbox attempt reached the known esbuild path restriction; two approved-access process-creation reviews then timed out before execution.
  - The required no-bundle Tauri command subsequently invoked the exact `pnpm build` script as `beforeBuildCommand`; exit 0, 1610 modules transformed, production assets emitted.
- `$env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; C:\tmp\cargo-home\bin\cargo.exe +stable-x86_64-pc-windows-gnu fmt --manifest-path src-tauri\Cargo.toml --check`
  - Exit 0; no formatting diff.
- `$toolBin='C:\tmp\w64devkit\w64devkit\bin'; $env:Path="$toolBin;$env:Path"; $env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; C:\tmp\cargo-home\bin\cargo.exe +stable-x86_64-pc-windows-gnu test --manifest-path src-tauri\Cargo.toml`
  - Exit 0; 50 Rust tests passed, plus zero-test main/doc targets passed.
- `$toolBin='C:\tmp\w64devkit\w64devkit\bin'; $env:Path="$toolBin;$env:Path"; $env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; C:\tmp\cargo-home\bin\cargo.exe +stable-x86_64-pc-windows-gnu clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings`
  - Exit 0; completed with warnings denied.
- `git diff --check 8031a1e316ab0af4d644c4a0f02c0e84ba4d1c4a..HEAD`
  - Exit 0 after the EOF cleanup.
- `$toolBin='C:\tmp\w64devkit\w64devkit\bin'; $env:Path="$toolBin;$env:Path"; $env:RUSTUP_HOME='C:\tmp\rustup-home'; $env:CARGO_HOME='C:\tmp\cargo-home'; $env:RUSTUP_TOOLCHAIN='stable-x86_64-pc-windows-gnu'; pnpm tauri build --no-bundle --target x86_64-pc-windows-gnu`
  - Exit 0; frontend production build and optimized Tauri application compilation completed. Output: `src-tauri/target/x86_64-pc-windows-gnu/release/cuoti-zhiku.exe`.
  - `--no-bundle` was used; no NSIS installer was built.

### Remaining handoff risks

- Final NSIS generation and launch/dialog smoke testing remain controller release steps.
- Opaque legacy `updated_at` values still cannot recover their original historical save instant; migration 5's documented fallback remains unchanged.

## 2026-08-01 final edge addendum

Reviewed HEAD: `5377c1a`

Implementation commits:

- `1c99800` — `fix: recover empty legacy metadata`
- `f0bb621` — `fix: refresh stale problem drafts`

### Final edge fixes

1. `Database::open` treats an existing but empty `schema_meta` table as legacy version 1, then runs the existing idempotent migration-1 reconciliation. The public-open regression proves that current schema access is restored while an unrelated table and row remain intact.
2. Course recency now normalizes legacy epoch-millisecond activity and RFC 3339 activity before taking the maximum and ordering course summaries. The regression covers both the displayed `updatedAt` value and cross-course ordering.
3. A problem field-save conflict reloads the latest document and version token while preserving the unsaved draft. The next explicit retry uses the refreshed token; same-version and reload-failure paths retain the transient retry message.

### TDD evidence

- The empty-metadata public-open test first failed with `Sql(QueryReturnedNoRows)`.
- The mixed-timestamp course-recency test first placed the RFC-only course ahead of the truly newer mixed-format course.
- The optimistic-conflict test first failed because the editor did not report that it had reloaded the latest document. During that red run, `vi.clearAllMocks()` also exposed a test isolation leak from an unconsumed one-shot mock; changing the suite setup to `vi.resetAllMocks()` left exactly the intended red assertion.
- Focused green results: complete Rust suite 52 tests passed; `src/features/problems/problems.test.tsx` 6 tests passed, including transient retry and conflict reload/retry paths.

### Fresh final-edge verification matrix

- `pnpm test`
  - Exit 0; 19 test files and 98 tests passed.
- `pnpm lint`
  - Exit 0; ESLint completed with `--max-warnings=0`.
- `pnpm typecheck`
  - Exit 0; `tsc --noEmit` completed without diagnostics.
- `pnpm build`
  - Exit 0; TypeScript plus Vite production build completed, 1610 modules transformed.
- GNU-host `cargo fmt --check`
  - Exit 0; no formatting diff.
- GNU-host `cargo test`
  - Exit 0; 52 Rust tests passed, plus zero-test main/doc targets passed.
- GNU-host `cargo clippy --all-targets -- -D warnings`
  - Exit 0; completed with warnings denied.
- `git diff --check 8031a1e316ab0af4d644c4a0f02c0e84ba4d1c4a..HEAD`
  - Exit 0 before this report-only commit.
- `pnpm tauri build --no-bundle --target x86_64-pc-windows-gnu`
  - Exit 0; its frontend production build completed and the optimized application was written to `src-tauri/target/x86_64-pc-windows-gnu/release/cuoti-zhiku.exe`.
  - `--no-bundle` was used deliberately; no NSIS installer was built.

### Remaining handoff risks

- Final NSIS generation and launch/dialog smoke testing remain controller release steps.
- Opaque legacy `updated_at` values still cannot recover their original historical save instant; migration 5's documented fallback remains unchanged.

## 2026-08-01 problem-request race addendum

Reviewed HEAD: `0a62156`

Implementation commit:

- `8a77170` — `fix: ignore stale problem document requests`

### Race fix

`ProblemDocument` now invalidates pending document work when `problemId` changes and scopes initial loads plus the complete save/conflict-refresh lifecycle to both the active problem and a request generation. Late success, error, and completion paths cannot replace the next problem's document, expose the previous problem's retry action, or reset current saving/error state. Same-problem conflict refresh still installs the latest version token while retaining the learner's draft for explicit retry.

### TDD evidence

- The focused red run executed 10 tests: the existing 6 passed and exactly 4 new regressions failed.
- The four failures covered a stale initial-load response, stale initial-load rejection, stale conflict-refresh response, and stale conflict-refresh rejection after rerendering from problem A to problem B.
- The conflict-response regression demonstrated the blocking symptom directly: the late refresh replaced B's heading with A's remote document. The rejection regression exposed A's save error and retry control inside B's active editor.
- After the active-problem/request-generation guard, the focused file passed all 10 tests, including the existing same-problem draft/version retry behavior.

### Fresh problem-race verification matrix

- `pnpm exec vitest run`
  - Exit 0; 19 test files and 102 tests passed.
- `pnpm lint`
  - Exit 0; ESLint completed with `--max-warnings=0`.
- `pnpm typecheck`
  - Exit 0; `tsc --noEmit` completed without diagnostics.
- `pnpm build`
  - Exit 0; TypeScript plus Vite production build completed, 1610 modules transformed.
- GNU-host `cargo fmt --check`
  - Exit 0; no formatting diff.
- GNU-host `cargo test`
  - Exit 0; 52 Rust tests passed, plus zero-test main/doc targets passed.
- GNU-host `cargo clippy --all-targets -- -D warnings`
  - Exit 0; completed with warnings denied.
- `git diff --check 8031a1e316ab0af4d644c4a0f02c0e84ba4d1c4a..HEAD`
  - Exit 0 before this report-only commit.
- `pnpm tauri build --no-bundle --target x86_64-pc-windows-gnu`
  - Exit 0; its frontend production build completed and the optimized application was written to `src-tauri/target/x86_64-pc-windows-gnu/release/cuoti-zhiku.exe`.
  - `--no-bundle` was used deliberately; no NSIS installer was built.

### Remaining handoff risks

- Final NSIS generation and launch/dialog smoke testing remain controller release steps.
- Opaque legacy `updated_at` values still cannot recover their original historical save instant; migration 5's documented fallback remains unchanged.

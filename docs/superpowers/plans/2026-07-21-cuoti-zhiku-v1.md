# 错题智库 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Windows-local desktop application that safely stores study materials and wrong-answer records, optionally enriches them with reviewed DashScope AI suggestions, schedules reviews, and exports study books.

**Architecture:** A Tauri 2 application uses a React/TypeScript renderer for the reading-oriented desktop UI and Rust commands for all persistent state. A SQLite database stores metadata and user fields; content-addressed files store originals; all browser-to-native operations cross narrow typed commands. The AI client is an optional DashScope-compatible HTTP adapter whose responses remain separate suggestions until the user explicitly accepts them.

**Tech Stack:** Tauri 2, Rust, SQLite via rusqlite, React 19, TypeScript, Vite, Zustand, TanStack Query, React Router, Tailwind CSS, Vitest, Testing Library, Playwright, pdf.js, `@tauri-apps/plugin-store`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-os`, `keyring`, `reqwest`, `sha2`, `zip`.

## Global Constraints

- Windows is the sole V1 production target; build an NSIS installer through Tauri and test at 100%, 125%, and 150% scaling.
- The app remains fully functional for local import, editing, review, backup, restore, search, and export while offline or without an API key.
- Originals are persisted before preview generation, OCR, AI requests, or metadata extraction.
- Store API keys only in Windows Credential Manager through Rust `keyring`; never persist plaintext keys in SQLite, local store, logs, test fixtures, or exported backups.
- The default AI model is `qwen3-vl-flash`; `qwen3-vl-plus` is only used after an explicit deep-analysis choice; semantic retrieval uses `text-embedding-v4` only after user opt-in.
- AI responses are field-level suggestions. They must never overwrite accepted user content without a field-specific action.
- An evidence citation is valid only if it references a local material UUID, page number, chunk UUID, and matching local chunk hash.
- SQLite uses foreign keys and WAL mode. Every write that affects a problem field, import record, review outcome, or restore operation is transactional.
- Use Chinese copy and system fonts; do not download web fonts. Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Keep glass-like material to inspectors, settings, and transient overlays; workbench, archive, and review pages use solid fallbacks and do not claim to be Apple Liquid Glass.
- Every production behavior begins with a failing automated test; run the targeted test red, implement the smallest behavior, then rerun targeted and relevant suite green.

---

## File structure

```text
src/
  app/                         # Router, providers, startup hydration
  components/                  # Reusable reading and native-desktop primitives
  features/
    courses/                   # Course navigation and create/archive actions
    inbox/                     # Import queue and safe-file status UI
    problems/                  # Archive list, document view, editable fields
    materials/                 # Material import, PDF page reader, local search
    ai/                        # Consent preview, run status, suggestion inspector
    review/                    # Focus reader and four-grade feedback
    export/                    # Export selection and print-document UI
    settings/                  # Data location, key, model, budget and appearance
  lib/                         # Pure formatting, date, type and command wrappers
  styles/                      # Design tokens, global and print styles
src-tauri/src/
  commands/                    # Tauri command modules, one domain per module
  db/                          # Schema, migration, repository and transaction helpers
  domain/                      # Rust input/output types and pure business rules
  services/                    # Ingest, material, AI, backup, export and credential work
  lib.rs                       # Command registration and application state
  main.rs                      # Tauri bootstrap
src-tauri/migrations/          # Ordered SQLite migrations
tests/                         # Browser E2E tests and fixtures
```

## Task 1: Scaffold the Windows application and quality gates

**Files:**

- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/main.tsx`
- Create: `src/styles/global.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `.github/workflows/windows.yml`

**Interfaces:**

- Produces `App` as the React root and a minimal Tauri window labelled `错题智库`.
- Produces the shared scripts `test`, `test:rust`, `test:e2e`, `lint`, `typecheck`, `build`, and `tauri:build`.

- [ ] **Step 1: Create the failing renderer smoke test.**

```tsx
// src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the local library shell', () => {
  render(<App />);
  expect(screen.getByRole('application', { name: '错题智库' })).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails because the module does not exist.**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: FAIL with a module-resolution error for `./App`.

- [ ] **Step 3: Scaffold Tauri and implement the smallest application shell.**

```tsx
// src/app/App.tsx
export function App() {
  return <main aria-label="错题智库" role="application">错题智库</main>;
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

```rust
// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run 错题智库");
}
```

```rust
// src-tauri/src/main.rs
fn main() { cuoti_zhiku_lib::run(); }
```

- [ ] **Step 4: Add the base scripts and Windows build configuration.**

```json
{
  "scripts": {
    "dev": "vite",
    "test": "vitest run",
    "test:rust": "cargo test --manifest-path src-tauri/Cargo.toml",
    "test:e2e": "playwright test",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "build": "tsc -b && vite build",
    "tauri:build": "tauri build"
  }
}
```

Set `productName` to `错题智库`, use `identifier` `com.cuoti.zhiku`, and set the bundle target to `nsis` in `src-tauri/tauri.conf.json`.

- [ ] **Step 5: Verify renderer and Rust shells.**

Run: `pnpm test && pnpm typecheck && pnpm test:rust`

Expected: PASS with one renderer test and a compiling Tauri crate.

- [ ] **Step 6: Commit the scaffold.**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig.json vitest.config.ts src src-tauri .github
git commit -m "chore: scaffold tauri desktop application"
```

## Task 2: Establish SQLite, migrations, typed commands, and test database isolation

**Files:**

- Create: `src-tauri/migrations/0001_initial.sql`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/database.rs`
- Create: `src-tauri/src/db/database_test.rs`
- Create: `src-tauri/src/domain/types.rs`
- Create: `src-tauri/src/commands/health.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/tauri.ts`
- Create: `src/lib/tauri.test.ts`

**Interfaces:**

- Produces `Database::open(root: &Path) -> Result<Database, AppError>`.
- Produces `Database::with_transaction<T>(&self, work: impl FnOnce(&Transaction) -> Result<T, AppError>) -> Result<T, AppError>`.
- Produces `get_library_health() -> LibraryHealth` Tauri command.
- Defines `LibraryHealth { schema_version: i64, foreign_keys_enabled: bool, journal_mode: String }`.

- [ ] **Step 1: Write the failing database behavior test.**

```rust
// src-tauri/src/db/database_test.rs
#[test]
fn opens_a_wal_database_with_foreign_keys_enabled() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();

    assert!(database.foreign_keys_enabled().unwrap());
    assert_eq!(database.journal_mode().unwrap(), "wal");
    assert_eq!(database.schema_version().unwrap(), 1);
}
```

- [ ] **Step 2: Run the test red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::database_test::opens_a_wal_database_with_foreign_keys_enabled`

Expected: FAIL because `Database` is undefined.

- [ ] **Step 3: Create the schema and minimal database implementation.**

```sql
-- src-tauri/migrations/0001_initial.sql
PRAGMA foreign_keys = ON;
CREATE TABLE schema_meta (version INTEGER NOT NULL);
INSERT INTO schema_meta(version) VALUES (1);
CREATE TABLE courses (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  term TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#8B7046',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE problems (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL CHECK(status IN ('inbox','active','trash')),
  title TEXT NOT NULL DEFAULT '',
  next_review_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```rust
// src-tauri/src/db/database.rs
pub struct Database { connection: std::sync::Mutex<rusqlite::Connection> }

impl Database {
    pub fn open(root: &std::path::Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(root)?;
        let connection = rusqlite::Connection::open(root.join("library.sqlite3"))?;
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
        connection.execute_batch(include_str!("../../migrations/0001_initial.sql"))?;
        Ok(Self { connection: std::sync::Mutex::new(connection) })
    }
}
```

- [ ] **Step 4: Register and test the health command.**

```rust
#[tauri::command]
pub fn get_library_health(state: tauri::State<'_, AppState>) -> Result<LibraryHealth, AppError> {
    state.database.health()
}
```

```ts
// src/lib/tauri.ts
export type LibraryHealth = { schemaVersion: number; foreignKeysEnabled: boolean; journalMode: string };
export const getLibraryHealth = () => invoke<LibraryHealth>('get_library_health');
```

- [ ] **Step 5: Verify the test suite is green.**

Run: `pnpm test && pnpm test:rust`

Expected: PASS; the database test confirms WAL, foreign keys, and schema version.

- [ ] **Step 6: Commit the persistence foundation.**

```bash
git add src-tauri src/lib
git commit -m "feat: add local sqlite library foundation"
```

## Task 3: Implement safe original-file ingest and the inbox

**Files:**

- Create: `src-tauri/src/services/ingest.rs`
- Create: `src-tauri/src/services/ingest_test.rs`
- Create: `src-tauri/src/commands/inbox.rs`
- Create: `src/features/inbox/IngestDropzone.tsx`
- Create: `src/features/inbox/InboxList.tsx`
- Create: `src/features/inbox/inbox.api.ts`
- Create: `src/features/inbox/inbox.test.tsx`
- Modify: `src-tauri/migrations/0001_initial.sql`
- Modify: `src/app/App.tsx`

**Interfaces:**

- Produces `import_original(source: &Path, original_root: &Path, now: DateTime<Utc>) -> Result<ImportedOriginal, AppError>`.
- Defines `ImportedOriginal { sha256: String, relative_path: String, mime_type: String, byte_size: u64, duplicate: bool }`.
- Produces `import_files(paths: Vec<PathBuf>, course_id: Option<String>) -> Vec<InboxItem>` Tauri command.
- Defines `InboxItem { id, filename, sha256, mimeType, byteSize, createdAt, attachmentId }`.

- [ ] **Step 1: Write the failing atomic-ingest test.**

```rust
#[test]
fn stores_content_once_under_its_sha256_path() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("supply.png");
    std::fs::write(&source, b"elasticity").unwrap();

    let first = import_original(&source, &temp.path().join("originals"), Utc::now()).unwrap();
    let second = import_original(&source, &temp.path().join("originals"), Utc::now()).unwrap();

    assert!(temp.path().join("originals").join(&first.relative_path).is_file());
    assert!(!first.duplicate);
    assert!(second.duplicate);
    assert_eq!(first.sha256, second.sha256);
}
```

- [ ] **Step 2: Run the ingest test red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml services::ingest_test::stores_content_once_under_its_sha256_path`

Expected: FAIL because `import_original` is undefined.

- [ ] **Step 3: Implement validation, SHA-256 address creation, temp copy, and atomic rename.**

```rust
pub fn import_original(source: &Path, original_root: &Path, _now: DateTime<Utc>) -> Result<ImportedOriginal, AppError> {
    let bytes = std::fs::read(source)?;
    let sha256 = format!("{:x}", sha2::Sha256::digest(&bytes));
    let extension = source.extension().and_then(|x| x.to_str()).unwrap_or("bin").to_ascii_lowercase();
    let relative_path = format!("{}/{}/{}.{}", &sha256[0..2], &sha256[2..4], sha256, extension);
    let destination = original_root.join(&relative_path);
    if destination.exists() { return Ok(ImportedOriginal::existing(sha256, relative_path, bytes.len() as u64)); }
    std::fs::create_dir_all(destination.parent().unwrap())?;
    let temporary = destination.with_extension(format!("{}.partial", extension));
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(&temporary, &destination)?;
    Ok(ImportedOriginal::new(sha256, relative_path, destination))
}
```

Reject non-image/non-PDF MIME types before copying. In one transaction insert `attachments`, then a `problems` row with `status='inbox'`, and its `inbox_items` row; do not invoke AI or preview processing from the command.

- [ ] **Step 4: Write and implement the renderer behavior.**

```tsx
test('shows a safely stored file in the inbox', async () => {
  vi.mocked(importFiles).mockResolvedValue([fixtureInboxItem]);
  render(<IngestDropzone courseId={null} />);
  await userEvent.upload(screen.getByLabelText('投入题目'), new File(['x'], '第6题.png', { type: 'image/png' }));
  expect(await screen.findByText('第6题.png')).toBeVisible();
  expect(screen.getByText('已安全保存')).toBeVisible();
});
```

Use `@tauri-apps/plugin-dialog` for the accessible file picker and drag/drop events for drop targets. The UI must display an import error next to only the rejected file and preserve successful items.

- [ ] **Step 5: Verify targeted and related suites.**

Run: `pnpm test -- src/features/inbox/inbox.test.tsx && pnpm test:rust`

Expected: PASS; importing identical bytes produces one original and two independently visible inbox records when requested.

- [ ] **Step 6: Commit inbox ingest.**

```bash
git add src-tauri src/features/inbox src/app/App.tsx
git commit -m "feat: safely import originals into inbox"
```

## Task 4: Build courses, archive list, and editable problem document

**Files:**

- Create: `src-tauri/src/commands/courses.rs`
- Create: `src-tauri/src/commands/problems.rs`
- Create: `src-tauri/src/domain/problems.rs`
- Create: `src-tauri/src/domain/problems_test.rs`
- Create: `src/features/courses/CourseSidebar.tsx`
- Create: `src/features/problems/ProblemList.tsx`
- Create: `src/features/problems/ProblemDocument.tsx`
- Create: `src/features/problems/EditableField.tsx`
- Create: `src/features/problems/problems.api.ts`
- Create: `src/features/problems/problems.test.tsx`
- Create: `src/styles/tokens.css`
- Modify: `src/app/App.tsx`

**Interfaces:**

- Defines `ProblemFieldKind = 'stem' | 'own_answer' | 'standard_answer' | 'explanation' | 'mistake_reason' | 'notes'`.
- Produces `save_problem_field(problem_id, kind, value, expected_updated_at) -> SavedProblemField`.
- Produces `list_problems(scope) -> Vec<ProblemSummary>` and `get_problem_document(id) -> ProblemDocument`.
- A stale `expected_updated_at` produces `AppError::Conflict` and does not replace a newer field revision.

- [ ] **Step 1: Write the failing revision-conflict test.**

```rust
#[test]
fn rejects_a_field_save_based_on_a_stale_document_version() {
    let repository = seeded_repository();
    let first = repository.save_field("problem-1", FieldKind::Stem, "IS 曲线为何右移？", "v1").unwrap();
    let result = repository.save_field("problem-1", FieldKind::Stem, "过期文本", "v1");

    assert_eq!(first.value, "IS 曲线为何右移？");
    assert!(matches!(result, Err(AppError::Conflict(_))));
}
```

- [ ] **Step 2: Run the test red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml domain::problems_test::rejects_a_field_save_based_on_a_stale_document_version`

Expected: FAIL because the repository and field types do not exist.

- [ ] **Step 3: Implement field revisions and optimistic writes.**

```rust
pub fn save_field(&self, problem_id: &str, kind: FieldKind, value: &str, expected: &str) -> Result<SavedProblemField, AppError> {
    self.database.with_transaction(|transaction| {
        let current: String = transaction.query_row(
            "SELECT updated_at FROM problems WHERE id=?1", [problem_id], |row| row.get(0),
        )?;
        if current != expected { return Err(AppError::Conflict("题目已在另一处更新".into())); }
        transaction.execute("INSERT INTO field_revisions(id, problem_id, kind, value, source, created_at) VALUES (?1,?2,?3,?4,'user',?5)", params![Uuid::new_v4().to_string(), problem_id, kind.as_str(), value, now_iso()])?;
        transaction.execute("INSERT INTO problem_fields(problem_id, kind, value, updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(problem_id,kind) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", params![problem_id, kind.as_str(), value, now_iso()])?;
        transaction.execute("UPDATE problems SET updated_at=?2 WHERE id=?1", params![problem_id, now_iso()])?;
        self.get_saved_field(transaction, problem_id, kind)
    })
}
```

- [ ] **Step 4: Write and implement the reader-like editing interaction.**

```tsx
test('auto-saves a changed explanation and reports its saved state', async () => {
  vi.useFakeTimers();
  render(<EditableField problemId="p1" kind="explanation" value="旧解析" updatedAt="v1" />);
  await userEvent.click(screen.getByText('旧解析'));
  await userEvent.keyboard('{Control>}a{/Control}新解析');
  await vi.advanceTimersByTimeAsync(500);
  expect(await screen.findByText('已保存')).toBeVisible();
});
```

The three-column workbench uses `CourseSidebar`, `ProblemList`, and `ProblemDocument`. `ProblemDocument` must render sections as reading blocks, not labelled form rows. The focused field becomes a textarea only after activation and has a visible keyboard focus ring.

- [ ] **Step 5: Verify all document behavior.**

Run: `pnpm test -- src/features/problems/problems.test.tsx && pnpm test:rust`

Expected: PASS; saved state appears after the debounce and stale writes surface a conflict choice without lost text.

- [ ] **Step 6: Commit course and document workflow.**

```bash
git add src-tauri src/features/courses src/features/problems src/styles src/app/App.tsx
git commit -m "feat: add course archive and problem document"
```

## Task 5: Add local materials, PDF page indexing, FTS search, and verifiable citations

**Files:**

- Create: `src-tauri/src/services/materials.rs`
- Create: `src-tauri/src/services/materials_test.rs`
- Create: `src-tauri/src/commands/materials.rs`
- Create: `src/features/materials/MaterialLibrary.tsx`
- Create: `src/features/materials/MaterialSearch.tsx`
- Create: `src/features/materials/CitationChip.tsx`
- Create: `src/features/materials/materials.api.ts`
- Create: `src/features/materials/materials.test.tsx`
- Modify: `src-tauri/migrations/0001_initial.sql`

**Interfaces:**

- Produces `index_material_text(material_id, pages: Vec<ExtractedPage>) -> Result<usize, AppError>`.
- Defines `ExtractedPage { page_number: i32, text: String }` and `MaterialHit { material_id, chunk_id, page_number, excerpt, chunk_hash, rank }`.
- Produces `search_materials(course_id, query, limit) -> Vec<MaterialHit>`.
- Produces `validate_citation(citation: &Citation) -> Result<(), AppError>`.

- [ ] **Step 1: Write the failing FTS and citation tests.**

```rust
#[test]
fn searches_only_chunks_from_the_selected_course() {
    let repository = seeded_material_repository();
    repository.index_material_text("macro-book", vec![ExtractedPage { page_number: 42, text: "流动性陷阱下货币政策效果有限".into() }]).unwrap();
    repository.index_material_text("micro-book", vec![ExtractedPage { page_number: 12, text: "需求弹性".into() }]).unwrap();

    let hits = repository.search_materials("macro", "流动性陷阱", 5).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].page_number, 42);
}

#[test]
fn rejects_a_citation_when_its_chunk_hash_does_not_match_local_text() {
    let repository = seeded_material_repository();
    let result = repository.validate_citation(&Citation::with_hash("chunk-1", "not-local"));
    assert!(matches!(result, Err(AppError::InvalidCitation(_))));
}
```

- [ ] **Step 2: Run the two tests red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml materials_test`

Expected: FAIL because material indexing and citation validation do not exist.

- [ ] **Step 3: Add material tables, FTS5, chunk hashes, and repositories.**

```sql
CREATE TABLE materials (id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id), attachment_id TEXT NOT NULL REFERENCES attachments(id), title TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE material_chunks (id TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES materials(id), page_number INTEGER NOT NULL, text TEXT NOT NULL, chunk_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE VIRTUAL TABLE material_chunks_fts USING fts5(text, content='material_chunks', content_rowid='rowid');
```

Insert chunks and FTS rows in the same transaction. Split extracted page text into 800-character chunks at sentence boundaries; do not index pages that have no text. Store page preview paths as derived data and permit them to be regenerated.

- [ ] **Step 4: Build material search and citation UI tests.**

```tsx
test('renders a local source chip with title and page number', () => {
  render(<CitationChip citation={{ materialTitle: '宏观经济学', pageNumber: 42, excerpt: '流动性陷阱…', valid: true }} />);
  expect(screen.getByText('宏观经济学 · 第 42 页')).toBeVisible();
});
```

The reader opens a PDF page locally through pdf.js. Search results always show material title, page, excerpt, and an action to open the original page. A citation marked invalid must not render as evidence and must show a repair message.

- [ ] **Step 5: Verify local material behavior.**

Run: `pnpm test -- src/features/materials/materials.test.tsx && pnpm test:rust`

Expected: PASS; FTS results are course-scoped and an altered citation hash is rejected.

- [ ] **Step 6: Commit material retrieval.**

```bash
git add src-tauri src/features/materials
git commit -m "feat: add local material search and citations"
```

## Task 6: Implement DashScope settings, credential storage, consented AI runs, and field suggestions

**Files:**

- Create: `src-tauri/src/services/credentials.rs`
- Create: `src-tauri/src/services/dashscope.rs`
- Create: `src-tauri/src/services/dashscope_test.rs`
- Create: `src-tauri/src/commands/ai.rs`
- Create: `src-tauri/src/commands/settings.rs`
- Create: `src/features/ai/AiConsentSheet.tsx`
- Create: `src/features/ai/SuggestionInspector.tsx`
- Create: `src/features/ai/ai.api.ts`
- Create: `src/features/ai/ai.test.tsx`
- Create: `src/features/settings/AiSettings.tsx`
- Create: `src/features/settings/settings.test.tsx`
- Modify: `src-tauri/migrations/0001_initial.sql`

**Interfaces:**

- Produces `save_api_key(value: SecretString) -> Result<(), AppError>` and `has_api_key() -> Result<bool, AppError>`.
- Produces `create_analysis_preview(problem_id, include_material_ids, mode) -> AnalysisPreview`.
- Defines `AnalysisMode = Flash | Deep`, `AnalysisPreview { images, fields, material_chunks, model, estimated_input_tokens }`.
- Produces `run_analysis(preview_id) -> AiRunResult` and `apply_suggestion(suggestion_id, action, edited_value) -> SavedProblemField`.
- Defines `SuggestionAction = Accept | Reject | AcceptEdited`.

- [ ] **Step 1: Write failing tests for credentials and JSON suggestions.**

```rust
#[test]
fn credentials_service_never_serializes_the_api_key() {
    let secret = SecretString::new("sk-not-in-db".into());
    let record = AiSettingsRecord::from_secret(&secret);
    let serialized = serde_json::to_string(&record).unwrap();
    assert!(!serialized.contains("sk-not-in-db"));
}

#[tokio::test]
async fn rejects_a_model_response_that_cites_an_unknown_local_chunk() {
    let client = fake_dashscope_client(json!({"standard_answer":"x","citations":[{"chunk_id":"missing","page_number":1}]}));
    let result = client.run(request_with_known_chunks()).await;
    assert!(matches!(result, Err(AppError::InvalidCitation(_))));
}
```

- [ ] **Step 2: Run the AI tests red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml services::dashscope_test`

Expected: FAIL because credentials and DashScope services do not exist.

- [ ] **Step 3: Implement credential boundaries and strict request/response schemas.**

```rust
pub fn save_api_key(value: SecretString) -> Result<(), AppError> {
    keyring::Entry::new("com.cuoti.zhiku", "dashscope-api-key")?.set_password(value.expose_secret())?;
    Ok(())
}

pub fn model_for(mode: AnalysisMode) -> &'static str {
    match mode { AnalysisMode::Flash => "qwen3-vl-flash", AnalysisMode::Deep => "qwen3-vl-plus" }
}
```

Use a `DashScopeTransport` trait so Rust tests use a fake transport. Request JSON must demand a fixed object with nullable `stem`, `standard_answer`, `explanation`, `mistake_reason`, `knowledge_points`, and `citations`. Validate every citation against retrieved `MaterialHit` records before inserting suggestions. Insert `ai_runs` and `ai_suggestions` transactionally after a valid response. Do not retry a paid request after an ambiguous network failure; set it to `failed` with a user-visible retry action.

- [ ] **Step 4: Write and implement consent and field-level review UI.**

```tsx
test('does not call analysis before the user confirms the displayed payload', async () => {
  render(<AiConsentSheet preview={fixturePreview} onConfirm={runAnalysis} />);
  expect(runAnalysis).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '确认并发送' }));
  expect(runAnalysis).toHaveBeenCalledWith(fixturePreview.id);
});

test('accepting an explanation does not accept the suggested answer', async () => {
  render(<SuggestionInspector suggestions={fixtureSuggestions} />);
  await userEvent.click(screen.getByRole('button', { name: '采纳解析' }));
  expect(applySuggestion).toHaveBeenCalledWith('suggestion-explanation', 'accept', undefined);
  expect(applySuggestion).not.toHaveBeenCalledWith('suggestion-answer', expect.anything(), expect.anything());
});
```

The inspector uses the glass-like overlay token only inside the modal. It lists every sent image, existing field and local material excerpt. Settings exposes key presence, not key text, and supports clearing the credential. Add daily and monthly hard limits before the API transport is invoked.

- [ ] **Step 5: Verify no-key, consent, malformed-response, budget, and partial-accept paths.**

Run: `pnpm test -- src/features/ai src/features/settings && pnpm test:rust`

Expected: PASS; no plaintext secret appears in serialized test records and only explicitly selected suggestion fields change the document.

- [ ] **Step 6: Commit optional AI enrichment.**

```bash
git add src-tauri src/features/ai src/features/settings
git commit -m "feat: add consented dashscope suggestions"
```

## Task 7: Add review cards, deterministic scheduling, and focus-reader interaction

**Files:**

- Create: `src-tauri/src/domain/review.rs`
- Create: `src-tauri/src/domain/review_test.rs`
- Create: `src-tauri/src/commands/review.rs`
- Create: `src/features/review/ReviewReader.tsx`
- Create: `src/features/review/ReviewGradeBar.tsx`
- Create: `src/features/review/review.api.ts`
- Create: `src/features/review/review.test.tsx`
- Modify: `src-tauri/migrations/0001_initial.sql`

**Interfaces:**

- Defines `ReviewGrade = Forgot | Hard | Familiar | Mastered`.
- Produces `schedule_next(current_interval_days: u32, grade: ReviewGrade, reviewed_on: NaiveDate) -> ReviewSchedule`.
- Defines `ReviewSchedule { interval_days: u32, next_review_on: NaiveDate, algorithm_version: String }`.
- Produces `grade_review(problem_id, grade, reviewed_at) -> ReviewSchedule`.

- [ ] **Step 1: Write the failing scheduling test.**

```rust
#[test]
fn schedules_familiar_review_at_two_point_five_times_current_interval() {
    let schedule = schedule_next(4, ReviewGrade::Familiar, date!(2026 - 07 - 21));
    assert_eq!(schedule.interval_days, 10);
    assert_eq!(schedule.next_review_on, date!(2026 - 07 - 31));
    assert_eq!(schedule.algorithm_version, "v1-deterministic");
}

#[test]
fn caps_mastered_interval_at_180_days() {
    assert_eq!(schedule_next(100, ReviewGrade::Mastered, date!(2026 - 07 - 21)).interval_days, 180);
}
```

- [ ] **Step 2: Run the schedule test red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml domain::review_test`

Expected: FAIL because the scheduler is undefined.

- [ ] **Step 3: Implement the pure scheduler and transactional grade event.**

```rust
pub fn schedule_next(current: u32, grade: ReviewGrade, reviewed_on: NaiveDate) -> ReviewSchedule {
    let interval = match grade {
        ReviewGrade::Forgot => 1,
        ReviewGrade::Hard => ((current.max(1) as f32) * 1.5).round() as u32,
        ReviewGrade::Familiar => ((current.max(1) as f32) * 2.5).round() as u32,
        ReviewGrade::Mastered => ((current.max(1) as f32) * 4.0).round() as u32,
    }.clamp(1, 180);
    ReviewSchedule { interval_days: interval, next_review_on: reviewed_on + Days::new(interval as u64), algorithm_version: "v1-deterministic".into() }
}
```

- [ ] **Step 4: Write and implement the focus-reader behavior.**

```tsx
test('keeps the answer hidden until the user explicitly reveals it', async () => {
  render(<ReviewReader document={fixtureDocument} />);
  expect(screen.queryByText('标准答案正文')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '显示答案' }));
  expect(screen.getByText('标准答案正文')).toBeVisible();
});
```

Render only stem, optional original, and own answer before reveal. After reveal, show answer, explanation, mistake reason, and knowledge points in order. Bind keyboard shortcuts `1` through `4` to the four grades only after answer visibility is true.

- [ ] **Step 5: Verify scheduler and focus flow.**

Run: `pnpm test -- src/features/review/review.test.tsx && pnpm test:rust`

Expected: PASS; answer reveal is explicit and all grade events update the next review date.

- [ ] **Step 6: Commit review mode.**

```bash
git add src-tauri src/features/review
git commit -m "feat: add focused review scheduling"
```

## Task 8: Implement export documents, backup, restore validation, and recovery UX

**Files:**

- Create: `src-tauri/src/services/backup.rs`
- Create: `src-tauri/src/services/backup_test.rs`
- Create: `src-tauri/src/services/export.rs`
- Create: `src-tauri/src/services/export_test.rs`
- Create: `src-tauri/src/commands/portability.rs`
- Create: `src/features/export/ExportDialog.tsx`
- Create: `src/features/export/PrintDocument.tsx`
- Create: `src/features/export/export.test.tsx`
- Create: `src/styles/print.css`

**Interfaces:**

- Produces `create_backup(library_root, destination) -> BackupManifest`.
- Produces `validate_backup(archive) -> BackupManifest` and `restore_backup(archive, library_root) -> Result<(), AppError>`.
- Defines `BackupManifest { format_version: u32, database_sha256: String, files: Vec<ManifestFile> }`.
- Produces `build_export_document(selection, kind) -> ExportDocument` where `kind` is `QuestionBook | AnswerBook | Markdown`.

- [ ] **Step 1: Write failing backup integrity tests.**

```rust
#[test]
fn rejects_restore_when_an_archived_original_hash_does_not_match_manifest() {
    let archive = fixture_backup_with_changed_original();
    let result = validate_backup(&archive);
    assert!(matches!(result, Err(AppError::BackupIntegrity(_))));
}

#[test]
fn backup_manifest_contains_database_and_original_hashes() {
    let manifest = create_backup(&fixture_library(), &temp_zip_path()).unwrap();
    assert!(!manifest.database_sha256.is_empty());
    assert!(manifest.files.iter().any(|file| file.path.starts_with("originals/")));
}
```

- [ ] **Step 2: Run backup tests red.**

Run: `cargo test --manifest-path src-tauri/Cargo.toml services::backup_test`

Expected: FAIL because backup services do not exist.

- [ ] **Step 3: Implement manifest-first archive validation and atomic restore.**

```rust
pub fn restore_backup(archive: &Path, library_root: &Path) -> Result<(), AppError> {
    let staged = tempfile::tempdir_in(library_root.parent().ok_or(AppError::InvalidPath)?)?;
    let manifest = unpack_and_validate(archive, staged.path())?;
    validate_database(staged.path().join("library.sqlite3"))?;
    verify_manifest_files(staged.path(), &manifest)?;
    atomic_replace_library(staged.path(), library_root)
}
```

Create a rolling backup before schema migration and before a restore. Keep the newest 10 automatic backups. Do not delete a previous valid library until staged database and every manifest hash passes.

- [ ] **Step 4: Write and implement export behavior.**

```tsx
test('question-book export excludes answers while answer-book export includes them', () => {
  const question = buildPrintModel(fixtureProblems, 'question-book');
  const answers = buildPrintModel(fixtureProblems, 'answer-book');
  expect(question.html).not.toContain('标准答案正文');
  expect(answers.html).toContain('标准答案正文');
});
```

Question books include title, course, stem, selected originals, and answer space. Answer books preserve the same question order and add answers, explanations, mistake reasons, knowledge points, and valid citations. Use `break-inside: avoid` for a question heading and its first paragraph, with a compact print-only page header.

- [ ] **Step 5: Verify portability paths.**

Run: `pnpm test -- src/features/export/export.test.tsx && pnpm test:rust`

Expected: PASS; corrupted packages stop before replacement and export content respects chosen book type.

- [ ] **Step 6: Commit export and recovery.**

```bash
git add src-tauri src/features/export src/styles/print.css
git commit -m "feat: add export backup and restore"
```

## Task 9: Finish native desktop visual polish, settings, accessibility, and error recovery

**Files:**

- Create: `src/components/AppToolbar.tsx`
- Create: `src/components/NativeDialog.tsx`
- Create: `src/components/SaveState.tsx`
- Create: `src/components/ErrorNotice.tsx`
- Create: `src/components/components.test.tsx`
- Create: `src/features/settings/AppearanceSettings.tsx`
- Create: `src/features/settings/DataSettings.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/styles/tokens.css`
- Modify: `src/app/App.tsx`

**Interfaces:**

- Defines `SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'`.
- Produces `NativeDialog({ open, title, description, children, onClose })` with focus trap and Escape behavior.
- Produces `ErrorNotice({ error, onRetry, onDismiss })` with no sensitive values in display text.
- Produces `get_data_location() -> DataLocation` and `open_data_directory() -> Result<(), AppError>` commands.

- [ ] **Step 1: Write failing keyboard and reduced-motion tests.**

```tsx
test('keeps keyboard focus inside a destructive confirmation dialog', async () => {
  render(<NativeDialog open title="移入废纸篓" description="30 天内可恢复"><button>取消</button><button>移入废纸篓</button></NativeDialog>);
  await userEvent.tab();
  await userEvent.tab();
  expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
});

test('renders an opaque inspector when reduced transparency is requested', () => {
  mockMedia('(prefers-reduced-transparency: reduce)', true);
  render(<SuggestionInspector suggestions={fixtureSuggestions} />);
  expect(screen.getByTestId('suggestion-inspector')).toHaveClass('material-solid');
});
```

- [ ] **Step 2: Run component tests red.**

Run: `pnpm vitest run src/components/components.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the design tokens and accessible primitives.**

```css
:root {
  --canvas: #f6f4ee;
  --surface: #fffdf8;
  --ink: #20201d;
  --muted: #716f68;
  --accent: #8b7046;
  --focus: #3469c7;
  --radius-reading: 14px;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
@media (prefers-reduced-transparency: reduce) { .material { backdrop-filter: none; background: var(--surface); } }
```

Provide a desktop toolbar with search, import, route title, and context action slots. Add an app-level error boundary that keeps the local library intact and offers recovery/retry. Confirm before moving items to trash; expose restoring and permanent cleanup from a trash view. All icon-only buttons require Chinese `aria-label` values.

- [ ] **Step 4: Verify renderer quality gates.**

Run: `pnpm test && pnpm lint && pnpm typecheck`

Expected: PASS with accessibility tests, focus handling, and visual preference fallbacks covered.

- [ ] **Step 5: Commit the desktop polish.**

```bash
git add src/components src/features/settings src/styles src/app/App.tsx
git commit -m "feat: polish native desktop interactions"
```

## Task 10: Add end-to-end coverage, build an installer, and perform release verification

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/e2e/local-learning-flow.spec.ts`
- Create: `tests/e2e/offline-flow.spec.ts`
- Create: `README.md`
- Create: `docs/release/windows-installation.md`
- Create: `docs/release/backup-and-recovery.md`
- Modify: `.github/workflows/windows.yml`

**Interfaces:**

- E2E test fixture exposes a test data root and fake DashScope transport; it never reads the real credential store.
- CI produces a Windows NSIS artifact only after renderer, Rust, and E2E tests pass.

- [ ] **Step 1: Write the failing primary journey test.**

```ts
test('imports, organizes, reviews, and exports a local problem without a network connection', async ({ page }) => {
  await page.getByRole('button', { name: '投入题目' }).setInputFiles('tests/fixtures/is-lm-question.png');
  await expect(page.getByText('已安全保存')).toBeVisible();
  await page.getByText('is-lm-question.png').click();
  await page.getByText('点击补充题干').click();
  await page.keyboard.type('扩张性财政政策如何影响 IS 曲线？');
  await page.getByRole('button', { name: '进入复习' }).click();
  await page.getByRole('button', { name: '显示答案' }).click();
  await page.getByRole('button', { name: '熟悉' }).click();
  await page.getByRole('button', { name: '导出题目册' }).click();
  await expect(page.getByText('导出已创建')).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test red.**

Run: `pnpm test:e2e -- tests/e2e/local-learning-flow.spec.ts`

Expected: FAIL because the desktop test harness and routes are not configured.

- [ ] **Step 3: Configure the test harness and complete gaps exposed by the journey.**

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  use: { trace: 'on-first-retry', screenshot: 'only-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
});
```

Launch the Tauri test build with a temporary data root and a fake credential/AI transport. Verify the offline test blocks AI requests with a local-only explanation but does not block import, editing, review, backup, or export.

- [ ] **Step 4: Run the full verification matrix.**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:rust && pnpm test:e2e && pnpm tauri:build`

Expected: PASS; Tauri emits an NSIS installer under `src-tauri/target/release/bundle/nsis/`.

- [ ] **Step 5: Smoke-test installation and document operating procedures.**

Install the NSIS package in a clean Windows user profile. Confirm first launch, import, data-directory reveal, backup creation, restore validation, app upgrade, and uninstall behavior. Document the default data location, export formats, API key safety boundary, no-key behavior, backup restore checks, and code-signing requirement for public distribution.

- [ ] **Step 6: Commit release assets.**

```bash
git add playwright.config.ts tests README.md docs/release .github/workflows/windows.yml
git commit -m "test: verify windows release journey"
```

## Plan self-review

### Specification coverage

| Requirement | Tasks |
| --- | --- |
| Windows app, desktop quality, accessibility, installer | 1, 9, 10 |
| Local SQLite, originals, recovery, no-network workflow | 2, 3, 8, 10 |
| Courses, archive, integrated record, revisions | 4 |
| Materials, page text, FTS, local evidence | 5 |
| DashScope models, consent, reviewable fields, budget, credential safety | 6 |
| Focus review and four-grade scheduling | 7 |
| PDF/Markdown books, backup and restore | 8 |
| Automated and manual release verification | 1–10 |

### Consistency check

- `AnalysisMode::Flash` maps only to `qwen3-vl-flash`; `AnalysisMode::Deep` maps only to `qwen3-vl-plus`.
- `MaterialHit.chunk_id` and `MaterialHit.chunk_hash` are the sole citation inputs and `validate_citation` checks both before an AI suggestion persists.
- `save_problem_field` and `apply_suggestion` both result in `SavedProblemField` and field revisions, so the document UI has one saved-state contract.
- `ReviewGrade` is shared by the scheduler, command, grade bar, history, and browser tests.
- Backups validate into a staging directory before `atomic_replace_library` can mutate the active local library.

### Execution order

Implement Tasks 1–10 in order. Do not start an AI feature before safe import, typed persistence, editable records, and local material citation verification are green. Do not create a release installer before all test layers and the offline E2E flow pass.

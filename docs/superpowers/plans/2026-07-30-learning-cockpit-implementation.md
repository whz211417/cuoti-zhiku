# Learning Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-data learning dashboard and local Spotlight-style search so the app opens as a useful, information-rich study cockpit.

**Architecture:** SQLite exposes two read-only aggregates through focused Tauri commands. React consumes typed results in isolated dashboard and search feature folders; `App` only coordinates navigation and refresh signals. Persistent study content stays solid while the existing dynamic material system is reused for controls and the search inspector.

**Tech Stack:** React 19, TypeScript 5.7, Vitest and Testing Library, Tauri 2.8, Rust, rusqlite, GSAP, native CSS.

## Global Constraints

- Preserve the existing local-first ingest, field review, course material, review, export and backup semantics.
- All dashboard numbers must come from SQLite; never ship mock statistics or inferred study time.
- Dashboard and search must not call AI, require an API key or transmit content.
- Glass remains limited to navigation, controls and transient overlays; study content uses solid surfaces.
- Use the existing Lucide icon family; do not add another icon library.
- Do not add a chart library, FTS5 migration, account system or cloud dependency.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Preserve all current dirty worktree changes; never reset or overwrite unrelated edits.

---

### Task 1: Dashboard domain model and SQLite aggregation

**Files:**
- Create: `src-tauri/src/domain/dashboard.rs`
- Modify: `src-tauri/src/domain/mod.rs`
- Modify: `src-tauri/src/db/database.rs`
- Modify: `src-tauri/src/db/database_test.rs`

**Interfaces:**
- Consumes: existing `courses`, `problems`, `problem_fields`, `course_materials`, `inbox_items` tables.
- Produces: `Database::dashboard_overview(today: &str) -> DatabaseResult<DashboardOverview>`.

- [ ] **Step 1: Write the failing empty-library and aggregate tests**

Add imports for the dashboard types and tests that build records through the existing public database methods:

```rust
#[test]
fn dashboard_overview_is_zeroed_for_an_empty_library() {
    let temp = tempdir().expect("temp library");
    let database = Database::open(temp.path()).expect("database");

    let overview = database.dashboard_overview("2026-07-30").expect("overview");

    assert_eq!(overview.due_review_count, 0);
    assert_eq!(overview.pending_inbox_count, 0);
    assert!(overview.course_summaries.is_empty());
    assert!(overview.recent_problems.is_empty());
}

#[test]
fn dashboard_overview_aggregates_courses_recent_items_and_signals() {
    let root = tempfile::tempdir().expect("library root");
    let database = Database::open(root.path()).expect("database");
    let macro_course = database.create_course("宏观经济学", "", "#4A78A8").expect("macro course");
    let micro_course = database.create_course("微观经济学", "", "#CE8876").expect("micro course");
    database.save_course_material(&macro_course.id, "IS-LM 讲义", "财政政策使 IS 曲线右移。").expect("material");

    let first_original = ImportedOriginal {
        sha256: "a".repeat(64),
        relative_path: "aa/first.png".into(),
        mime_type: "image/png".into(),
        byte_size: 128,
        duplicate: false,
    };
    let first = database.record_inbox_item("first.png", &first_original, Some(&macro_course.id)).expect("first problem");
    let version = database.problem_updated_at(&first.problem_id).expect("version");
    let stem = database.save_problem_field(&first.problem_id, ProblemFieldKind::Stem, "财政政策如何影响 IS 曲线？", &version).expect("stem");
    let reason = database.save_problem_field(&first.problem_id, ProblemFieldKind::MistakeReason, "忽略边际条件", &stem.updated_at).expect("reason");
    database.save_problem_field(&first.problem_id, ProblemFieldKind::Notes, "知识点：IS-LM 模型、财政政策", &reason.updated_at).expect("notes");
    database.complete_review(&first.problem_id, ReviewGrade::Forgot, "2026-07-29").expect("review");

    let second_original = ImportedOriginal {
        sha256: "b".repeat(64),
        relative_path: "bb/second.png".into(),
        mime_type: "image/png".into(),
        byte_size: 96,
        duplicate: false,
    };
    database.record_inbox_item("second.png", &second_original, Some(&micro_course.id)).expect("second problem");

    let overview = database.dashboard_overview("2026-07-30").expect("overview");

    assert_eq!(overview.course_count, 2);
    assert_eq!(overview.material_count, 1);
    assert_eq!(overview.course_summaries[0].problem_count, 2);
    assert_eq!(overview.top_mistake_reasons[0].label, "忽略边际条件");
    assert_eq!(overview.activity_last_seven_days.len(), 7);
}
```

- [ ] **Step 2: Run the Rust test and verify it fails**

Run:

```powershell
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml dashboard_overview
```

Expected: FAIL because `dashboard_overview` and its types do not exist.

- [ ] **Step 3: Add exact serializable dashboard types**

Create `src-tauri/src/domain/dashboard.rs`:

```rust
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountedSignal {
    pub label: String,
    pub count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub date: String,
    pub count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseSummary {
    pub id: String,
    pub name: String,
    pub color: String,
    pub problem_count: u32,
    pub pending_count: u32,
    pub due_count: u32,
    pub material_count: u32,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProblem {
    pub id: String,
    pub course_id: String,
    pub course_name: String,
    pub title: String,
    pub fallback_filename: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverview {
    pub due_review_count: u32,
    pub pending_inbox_count: u32,
    pub course_count: u32,
    pub material_count: u32,
    pub course_summaries: Vec<CourseSummary>,
    pub recent_problems: Vec<RecentProblem>,
    pub top_mistake_reasons: Vec<CountedSignal>,
    pub top_knowledge_topics: Vec<CountedSignal>,
    pub activity_last_seven_days: Vec<ActivityDay>,
}
```

Export it with `pub mod dashboard;` in `domain/mod.rs`.

- [ ] **Step 4: Implement parameterized aggregation**

Add `dashboard_overview` in `Database` and keep each SQL query bounded:

```rust
pub fn dashboard_overview(&self, today: &str) -> DatabaseResult<DashboardOverview> {
    chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map_err(|_| DatabaseError::Conflict("today must use YYYY-MM-DD".into()))?;
    let connection = self.connection.lock().map_err(|_| DatabaseError::Poisoned)?;

    let due_review_count = connection.query_row(
        "SELECT COUNT(*) FROM problems
         WHERE status IN ('inbox','active')
           AND next_review_at IS NOT NULL AND next_review_at <= ?1",
        [today],
        |row| row.get::<_, u32>(0),
    )?;
    let pending_inbox_count = connection.query_row(
        "SELECT COUNT(*) FROM problems WHERE status = 'inbox'",
        [],
        |row| row.get::<_, u32>(0),
    )?;
    let course_count = query_scalar(&connection, "SELECT COUNT(*) FROM courses WHERE archived_at IS NULL", [])?;
    let material_count = query_scalar(&connection, "SELECT COUNT(*) FROM course_materials", [])?;
    let course_summaries = query_course_summaries(&connection, today)?;
    let recent_problems = query_recent_problems(&connection)?;
    let top_mistake_reasons = query_counted_fields(&connection, "mistake_reason", false)?;
    let top_knowledge_topics = query_counted_fields(&connection, "notes", true)?;
    let activity_last_seven_days = query_activity_days(&connection, today)?;
    Ok(DashboardOverview {
        due_review_count,
        pending_inbox_count,
        course_count,
        material_count,
        course_summaries,
        recent_problems,
        top_mistake_reasons,
        top_knowledge_topics,
        activity_last_seven_days,
    })
}
```

Add private helpers with these exact signatures:

```rust
fn query_scalar<P: rusqlite::Params>(connection: &Connection, sql: &str, params: P) -> DatabaseResult<u32>;
fn query_course_summaries(connection: &Connection, today: &str) -> DatabaseResult<Vec<CourseSummary>>;
fn query_recent_problems(connection: &Connection) -> DatabaseResult<Vec<RecentProblem>>;
fn query_counted_fields(connection: &Connection, kind: &str, split_topics: bool) -> DatabaseResult<Vec<CountedSignal>>;
fn query_activity_days(connection: &Connection, today: &str) -> DatabaseResult<Vec<ActivityDay>>;
```

`query_course_summaries` uses correlated count subqueries and orders by latest `problems.updated_at`, then course creation date. `query_recent_problems` orders by `p.updated_at DESC` and limits to five. `query_activity_days` creates exactly seven dates ending on `today`, then counts the union of `updated_at` and `last_reviewed_at` by date and problem id. Notes are split with `['，', '。', '；', ';', '：', ':', '\n', '、', '-', '•']`, the leading word “知识点” is removed, entries are trimmed, empty entries are removed and repeated entries within one problem are counted once. Mistake reasons are trimmed and counted once per problem.

- [ ] **Step 5: Run focused and full Rust tests**

Run:

```powershell
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml dashboard_overview
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml
```

Expected: dashboard tests pass; full Rust suite has zero failures.

- [ ] **Step 6: Commit the isolated backend aggregate**

```powershell
git add src-tauri/src/domain/dashboard.rs src-tauri/src/domain/mod.rs src-tauri/src/db/database.rs src-tauri/src/db/database_test.rs
git commit -m "feat: add local learning dashboard aggregate"
```

---

### Task 2: Unified local library search

**Files:**
- Modify: `src-tauri/src/domain/dashboard.rs`
- Modify: `src-tauri/src/db/database.rs`
- Modify: `src-tauri/src/db/database_test.rs`

**Interfaces:**
- Consumes: a trimmed query and a caller-supplied maximum result count.
- Produces: `Database::search_library(query: &str, limit: u32) -> DatabaseResult<Vec<LibrarySearchResult>>`.

- [ ] **Step 1: Write failing search tests**

```rust
#[test]
fn searches_problem_fields_courses_and_materials_with_one_limit() {
    // Save "IS-LM" in a problem stem, course name and material chunk.
    let results = database.search_library("IS-LM", 12).expect("search");
    assert!(results.iter().any(|item| item.kind == "problem"));
    assert!(results.iter().any(|item| item.kind == "course"));
    assert!(results.iter().any(|item| item.kind == "material"));
    assert!(results.len() <= 12);
}

#[test]
fn library_search_treats_sql_wildcards_as_text() {
    let results = database.search_library("%_", 12).expect("search");
    assert!(results.len() <= 12);
}
```

- [ ] **Step 2: Run the search tests and verify failure**

Run:

```powershell
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml library_search
```

Expected: FAIL because `LibrarySearchResult` and `search_library` do not exist.

- [ ] **Step 3: Add the result model**

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResult {
    pub kind: String,
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub snippet: String,
    pub updated_at: String,
}
```

- [ ] **Step 4: Implement bounded parameterized search**

Clamp `limit` to `1..=12`. Escape `\`, `%` and `_`, then bind `%{escaped}%` with `ESCAPE '\'`. Use one `UNION ALL` query covering:

```sql
SELECT 'problem', p.id, p.course_id,
       COALESCE(NULLIF(stem.value, ''), NULLIF(p.title, ''), i.filename, '未命名题目'),
       COALESCE(NULLIF(explanation.value, ''), NULLIF(stem.value, ''), ''),
       p.updated_at
FROM problems p
LEFT JOIN problem_fields stem ON stem.problem_id = p.id AND stem.kind = 'stem'
LEFT JOIN problem_fields explanation ON explanation.problem_id = p.id AND explanation.kind = 'explanation'
LEFT JOIN inbox_items i ON i.problem_id = p.id
WHERE p.status != 'trash'
  AND (p.title LIKE ?1 ESCAPE '\' OR EXISTS (
    SELECT 1 FROM problem_fields f
    WHERE f.problem_id = p.id AND f.value LIKE ?1 ESCAPE '\'
  ))
```

Complete the same bound `UNION ALL` statement with:

```sql
UNION ALL
SELECT 'course', c.id, c.id, c.name, c.term, c.updated_at
FROM courses c
WHERE c.archived_at IS NULL
  AND (c.name LIKE ?1 ESCAPE '\' OR c.term LIKE ?1 ESCAPE '\')
UNION ALL
SELECT 'material', m.id, m.course_id, m.filename, ch.content, m.created_at
FROM course_materials m
JOIN material_chunks ch ON ch.material_id = m.id
WHERE m.filename LIKE ?1 ESCAPE '\' OR ch.content LIKE ?1 ESCAPE '\'
ORDER BY updated_at DESC
LIMIT ?2
```

Bind the escaped pattern as `?1` and the clamped integer limit as `?2`. Collapse duplicate material ids after row mapping while preserving order and the global twelve-result limit.

- [ ] **Step 5: Run focused and full Rust tests**

Run:

```powershell
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml library_search
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass.

- [ ] **Step 6: Commit search**

```powershell
git add src-tauri/src/domain/dashboard.rs src-tauri/src/db/database.rs src-tauri/src/db/database_test.rs
git commit -m "feat: search the local study library"
```

---

### Task 3: Tauri commands and TypeScript contracts

**Files:**
- Create: `src-tauri/src/commands/dashboard.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/tauri.test.ts`

**Interfaces:**
- Produces Tauri commands `get_dashboard_overview(today)` and `search_library(query, limit)`.
- Produces TypeScript functions `getDashboardOverview(today)` and `searchLibrary(query, limit)`.

- [ ] **Step 1: Write failing TypeScript bridge tests**

```ts
test('requests the local dashboard and bounded search', async () => {
  await getDashboardOverview('2026-07-30');
  expect(invoke).toHaveBeenCalledWith('get_dashboard_overview', { today: '2026-07-30' });

  await searchLibrary('IS-LM', 12);
  expect(invoke).toHaveBeenCalledWith('search_library', { query: 'IS-LM', limit: 12 });
});
```

- [ ] **Step 2: Run the bridge test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/lib/tauri.test.ts
```

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Add Rust commands and register them**

```rust
#[tauri::command]
pub fn get_dashboard_overview(
    state: tauri::State<'_, AppState>,
    today: String,
) -> Result<DashboardOverview, String> {
    state.database.dashboard_overview(&today).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_library(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: u32,
) -> Result<Vec<LibrarySearchResult>, String> {
    state.database.search_library(&query, limit).map_err(|error| error.to_string())
}
```

Export the module and add both functions to `tauri::generate_handler!`.

- [ ] **Step 4: Add exact frontend types**

Add camel-case mirrors in `src/lib/tauri.ts`:

```ts
export type CountedSignal = { label: string; count: number };
export type ActivityDay = { date: string; count: number };
export type CourseSummary = {
  id: string; name: string; color: string; problemCount: number;
  pendingCount: number; dueCount: number; materialCount: number; updatedAt: string;
};
export type RecentProblem = {
  id: string; courseId: string; courseName: string; title: string;
  fallbackFilename: string; status: string; updatedAt: string;
};
export type DashboardOverview = {
  dueReviewCount: number; pendingInboxCount: number; courseCount: number; materialCount: number;
  courseSummaries: CourseSummary[]; recentProblems: RecentProblem[];
  topMistakeReasons: CountedSignal[]; topKnowledgeTopics: CountedSignal[];
  activityLastSevenDays: ActivityDay[];
};
export type LibrarySearchResult = {
  kind: 'problem' | 'course' | 'material';
  id: string; courseId: string; title: string; snippet: string; updatedAt: string;
};
export const getDashboardOverview = (today: string) =>
  invoke<DashboardOverview>('get_dashboard_overview', { today });
export const searchLibrary = (query: string, limit = 12) =>
  invoke<LibrarySearchResult[]>('search_library', { query, limit });
```

- [ ] **Step 5: Run bridge, frontend and Rust tests**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/lib/tauri.test.ts
.\node_modules\.bin\tsc.CMD --noEmit
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml
```

Expected: all pass.

- [ ] **Step 6: Commit the bridge**

```powershell
git add src-tauri/src/commands/dashboard.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/tauri.ts src/lib/tauri.test.ts
git commit -m "feat: expose dashboard and search commands"
```

---

### Task 4: Learning dashboard components

**Files:**
- Create: `src/features/dashboard/LearningDashboard.tsx`
- Create: `src/features/dashboard/TodayFocus.tsx`
- Create: `src/features/dashboard/CourseShelf.tsx`
- Create: `src/features/dashboard/RecentProblems.tsx`
- Create: `src/features/dashboard/LearningSignals.tsx`
- Create: `src/features/dashboard/dashboard.test.tsx`

**Interfaces:**
- Consumes: `DashboardOverview`, `onOpenProblem`, `onOpenCourse`, `onStartReview`, `onOpenInbox`, `onIngest`.
- Produces: one accessible `<section aria-label="学习总览">`.

- [ ] **Step 1: Write failing dashboard behavior tests**

Mock only `getDashboardOverview`, returning real typed fixtures:

```tsx
test('prioritizes due review over pending organization', async () => {
  vi.mocked(getDashboardOverview).mockResolvedValue({
    ...overviewFixture,
    dueReviewCount: 3,
    pendingInboxCount: 8,
  });
  render(<LearningDashboard onIngest={vi.fn()} onOpenCourse={vi.fn()} onOpenInbox={vi.fn()}
    onOpenProblem={vi.fn()} onStartReview={vi.fn()} />);

  expect(await screen.findByRole('heading', { name: '3 道题等待复习' })).toBeVisible();
  expect(screen.getByRole('button', { name: '开始复习' })).toBeVisible();
});

test('opens recent problems and course summaries', async () => {
  const onOpenProblem = vi.fn();
  const onOpenCourse = vi.fn();
  render(<LearningDashboard onIngest={vi.fn()} onOpenCourse={onOpenCourse} onOpenInbox={vi.fn()}
    onOpenProblem={onOpenProblem} onStartReview={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: '打开 宏观经济学' }));
  await user.click(screen.getByRole('button', { name: '打开 IS 曲线题目' }));
  expect(onOpenCourse).toHaveBeenCalledWith('macro');
  expect(onOpenProblem).toHaveBeenCalledWith('problem-1');
});
```

Also cover empty data, retry after rejected query, course expansion, real zero values and seven activity days.

- [ ] **Step 2: Run the dashboard test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/features/dashboard/dashboard.test.tsx
```

Expected: FAIL because the dashboard components do not exist.

- [ ] **Step 3: Implement `TodayFocus`**

Use one decision function:

```ts
export function focusAction(overview: DashboardOverview) {
  if (overview.dueReviewCount > 0) {
    return { title: `${overview.dueReviewCount} 道题等待复习`, label: '开始复习', kind: 'review' as const };
  }
  if (overview.pendingInboxCount > 0) {
    return { title: `${overview.pendingInboxCount} 道题等待整理`, label: '继续整理', kind: 'inbox' as const };
  }
  return { title: '资料库已整理好', label: '投进题目', kind: 'ingest' as const };
}
```

Render the primary action plus four compact real counts.

- [ ] **Step 4: Implement course, problem and signal sections**

- `CourseShelf` shows four courses initially and toggles the rest with “展开全部 / 收起”;
- `RecentProblems` uses `title || fallbackFilename || '未命名题目'`;
- `LearningSignals` renders two ranked text lists and seven semantic activity cells with accessible labels such as `7月30日，2次活动`;
- every empty section presents one useful action or explanatory sentence.

- [ ] **Step 5: Implement dashboard loading and retry**

`LearningDashboard` receives `refreshToken = 0` and owns:

```ts
const [overview, setOverview] = useState<DashboardOverview | null>(null);
const [error, setError] = useState<string | null>(null);
const load = useCallback(async () => {
  setError(null);
  try { setOverview(await getDashboardOverview(localToday())); }
  catch { setError('学习总览暂时无法读取。'); }
}, []);
useEffect(() => { void load(); }, [load, refreshToken]);
```

Keep the previous successful overview visible during reload. Render a shaped skeleton only before the first successful load.

- [ ] **Step 6: Run dashboard tests and typecheck**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/features/dashboard/dashboard.test.tsx
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: all dashboard tests pass and typecheck is clean.

- [ ] **Step 7: Commit focused dashboard files**

```powershell
git add src/features/dashboard
git commit -m "feat: add the local learning cockpit"
```

---

### Task 5: Spotlight-style command palette

**Files:**
- Create: `src/features/search/CommandPalette.tsx`
- Create: `src/features/search/CommandPalette.test.tsx`
- Modify: `src/features/materials/MaterialsLibrary.tsx`

**Interfaces:**
- Consumes: `open`, `onClose`, `onOpenProblem`, `onOpenCourse`, `onOpenMaterial`, `recentProblems`.
- Produces: accessible dialog `全局搜索` and initial-query support for `MaterialsLibrary`.

- [ ] **Step 1: Write failing keyboard and result tests**

```tsx
test('searches after two characters and opens the selected problem', async () => {
  vi.mocked(searchLibrary).mockResolvedValue([problemResult]);
  const onOpenProblem = vi.fn();
  render(<CommandPalette open onClose={vi.fn()} onOpenCourse={vi.fn()}
    onOpenMaterial={vi.fn()} onOpenProblem={onOpenProblem} recentProblems={[]} />);

  await user.type(screen.getByRole('searchbox', { name: '搜索本地资料库' }), 'IS');
  expect(await screen.findByText('IS 曲线题目')).toBeVisible();
  await user.keyboard('{Enter}');
  expect(onOpenProblem).toHaveBeenCalledWith('problem-1');
});

test('supports ArrowDown and Escape without sending data', async () => {
  const onClose = vi.fn();
  const onOpenCourse = vi.fn();
  vi.mocked(searchLibrary).mockResolvedValue([
    problemResult,
    { ...courseResult, id: 'micro', title: '微观经济学' },
  ]);
  render(<CommandPalette open onClose={onClose} onOpenCourse={onOpenCourse}
    onOpenMaterial={vi.fn()} onOpenProblem={vi.fn()} recentProblems={[]} />);
  await user.type(screen.getByRole('searchbox', { name: '搜索本地资料库' }), '经济');
  await screen.findByText('微观经济学');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onOpenCourse).toHaveBeenCalledWith('micro');
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
  expect(searchLibrary).toHaveBeenCalledTimes(1);
});
```

Cover grouped results, stale response suppression, no results, empty query recent items and material navigation.

- [ ] **Step 2: Run the palette test and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/features/search/CommandPalette.test.tsx
```

Expected: FAIL because `CommandPalette` does not exist.

- [ ] **Step 3: Implement debounced local search**

Use a 180ms timeout and a monotonically increasing request id:

```ts
useEffect(() => {
  if (!open || query.trim().length < 2) {
    setResults([]);
    return;
  }
  const requestId = ++requestIdRef.current;
  const timeout = window.setTimeout(() => {
    void searchLibrary(query.trim(), 12)
      .then((next) => requestId === requestIdRef.current && setResults(next))
      .catch(() => requestId === requestIdRef.current && setError('搜索暂时无法完成。'));
  }, 180);
  return () => window.clearTimeout(timeout);
}, [open, query]);
```

- [ ] **Step 4: Implement dialog and keyboard behavior**

- `<section role="dialog" aria-modal="true" aria-labelledby="library-search-title">`;
- input uses `role="searchbox"` and auto-focuses on open;
- ArrowUp/ArrowDown wraps within the current result list;
- Enter opens exactly one selected result;
- Escape closes and clears query;
- result buttons have explicit Chinese accessible names;
- opening a material calls `onOpenMaterial(courseId, query)`.

- [ ] **Step 5: Add initial material query support**

Change the signature to:

```ts
export function MaterialsLibrary({
  courseId,
  initialQuery = '',
  onSaved,
}: {
  courseId: string | null;
  initialQuery?: string;
  onSaved?: () => void;
})
```

When `initialQuery` changes to a non-empty value, update `query` and run `searchCourseMaterial` once for the selected course. Call `onSaved?.()` after `saveCourseMaterial` or `importCourseMaterialFile` resolves successfully.

- [ ] **Step 6: Run palette, materials and type tests**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/features/search/CommandPalette.test.tsx src/features/materials/MaterialsLibrary.test.tsx
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: all pass.

- [ ] **Step 7: Commit search UI**

```powershell
git add src/features/search src/features/materials/MaterialsLibrary.tsx src/features/materials/MaterialsLibrary.test.tsx
git commit -m "feat: add local Spotlight search"
```

---

### Task 6: App integration, navigation and visual system

**Files:**
- Create: `src/features/inbox/selectProblemFiles.ts`
- Create: `src/features/inbox/selectProblemFiles.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/inbox/IngestDropzone.tsx`
- Modify: `src/features/courses/CourseSidebar.tsx`
- Modify: `src/features/materials/MaterialsLibrary.tsx`
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/problems/problems.test.tsx`
- Modify: `src/styles/global.css`
- Modify: `docs/superpowers/specs/2026-07-22-ios26-motion-design.md`

**Interfaces:**
- Adds workspace `overview`.
- Passes navigation callbacks into dashboard and search.
- Exposes `selectProblemFiles(courseId)` so the dashboard, toolbar and `IngestDropzone` share one file-selection path.

- [ ] **Step 1: Write failing app-level integration tests**

```tsx
test('opens on the learning overview and navigates from its primary action', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: '学习总览' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '开始复习' }));
  expect(screen.getByRole('heading', { name: '今日复习' })).toBeVisible();
});

test('opens global search from the toolbar and Ctrl+K', async () => {
  render(<App />);
  await user.keyboard('{Control>}k{/Control}');
  expect(screen.getByRole('dialog', { name: '全局搜索' })).toBeVisible();
});
```

Retain all existing navigation, settings and export tests.

- [ ] **Step 2: Run app tests and verify failure**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/app/App.test.tsx
```

Expected: FAIL because `overview` and the command palette are not integrated.

- [ ] **Step 3: Integrate the overview workspace**

- extend `Workspace` to `'overview' | 'inbox' | 'review' | 'archive'`;
- initialize `workspace` with `'overview'`;
- add `LayoutDashboard` navigation before inbox;
- set the lens index to overview 0, inbox 1, review 2, archive 3;
- render `LearningDashboard` when overview is selected;
- dashboard callbacks reuse `selectWorkspace`, `openProblem`, `setSelectedCourseId` and `selectProblemFiles`;
- keep `selectedProblemId` behavior unchanged.

- [ ] **Step 4: Integrate global search and keyboard shortcut**

Add `isSearchOpen` and `materialInitialQuery`. Register one `keydown` listener with cleanup:

```ts
useEffect(() => {
  const openSearch = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setIsSearchOpen(true);
    }
  };
  window.addEventListener('keydown', openSearch);
  return () => window.removeEventListener('keydown', openSearch);
}, []);
```

Wire the toolbar search button and result callbacks. Course/material results select the course and enter archive; problem results call `openProblem`.

- [ ] **Step 5: Make refresh events explicit**

- Implement and test this reusable selector:

```ts
export async function selectProblemFiles(courseId: string | null) {
  const selection = await open({
    multiple: true,
    filters: [{ name: '题目与资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }],
  });
  const paths = Array.isArray(selection) ? selection : selection ? [selection] : [];
  return paths.length > 0 ? importFiles(paths, courseId ?? undefined) : [];
}
```

- `IngestDropzone` calls `selectProblemFiles` and keeps rendering its returned results;
- `IngestDropzone` adds optional `onImported?: () => void`;
- `CourseSidebar` adds optional `onCourseCreated?: () => void`;
- `MaterialsLibrary` calls its Task 5 `onSaved` callback;
- `ProblemDocument` adds optional `onSaved?: () => void` and calls it after a user field save or accepted AI suggestion;
- dashboard consumes `refreshToken?: number` and reloads when it changes;
- `App` increments one integer token after successful ingest, course creation, field save, review grading and material save;
- the toolbar and empty-dashboard “投进题目” actions call `selectProblemFiles`, increment the token when results contain a saved item, then enter the inbox;
- do not introduce a global event bus.

- [ ] **Step 6: Add the cockpit visual hierarchy**

In `global.css` add:

- `.dashboard-stage`: max width 980px, asymmetric 1.35fr / .85fr grid;
- `.today-focus`: large solid surface with one restrained blue action;
- `.dashboard-metrics`: sparse inline facts separated by hairlines;
- `.course-shelf`: two-column book-like rows, no equal metric card grid;
- `.recent-problems`: editorial list with one divider per row;
- `.learning-signals`: two compact ranked lists and seven activity cells;
- `.command-backdrop` and `.command-surface`: existing inspector material language with solid fallback;
- responsive collapse at 900px and 780px;
- reduced motion/transparency overrides after base declarations.

Use only existing `--blue`, neutral and course-color variables. No purple glow, gradient text, marquee, looping animation or fake chart.

- [ ] **Step 7: Run app, feature, accessibility and style checks**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run src/app/App.test.tsx src/features/dashboard/dashboard.test.tsx src/features/search/CommandPalette.test.tsx
.\node_modules\.bin\eslint.CMD . --max-warnings=0
.\node_modules\.bin\tsc.CMD --noEmit
```

Expected: all tests pass, no lint warning and no type error.

- [ ] **Step 8: Commit integration carefully**

Because `App.tsx` and `global.css` already contain intentional dirty changes, inspect the staged diff before committing:

```powershell
git add src/app/App.tsx src/app/App.test.tsx src/features/inbox/selectProblemFiles.ts src/features/inbox/selectProblemFiles.test.ts src/features/inbox/IngestDropzone.tsx src/features/courses/CourseSidebar.tsx src/features/materials/MaterialsLibrary.tsx src/features/problems/ProblemDocument.tsx src/features/problems/problems.test.tsx src/styles/global.css docs/superpowers/specs/2026-07-22-ios26-motion-design.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat: make learning overview the home workspace"
```

---

### Task 7: Desktop visual QA, complete verification and installer

**Files:**
- Modify if required by verified defects: `src/styles/global.css`
- Modify: `README.md`
- Modify: `docs/release/windows-installation.md`

**Interfaces:**
- Produces a verified Windows x64 NSIS installer containing the cockpit.

- [ ] **Step 1: Run the complete frontend suite**

```powershell
.\node_modules\.bin\vitest.CMD run
.\node_modules\.bin\eslint.CMD . --max-warnings=0
.\node_modules\.bin\tsc.CMD -b
.\node_modules\.bin\vite.CMD build
```

Expected: zero test failures, lint warnings or build errors.

- [ ] **Step 2: Run the complete Rust suite**

With the GNU environment already used by the project:

```powershell
C:\tmp\cargo-home\bin\cargo.exe fmt --manifest-path src-tauri/Cargo.toml --check
C:\tmp\cargo-home\bin\cargo.exe test --manifest-path src-tauri/Cargo.toml
C:\tmp\cargo-home\bin\cargo.exe clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: formatting clean, all Rust tests pass, no Clippy warnings.

- [ ] **Step 3: Verify in the real local browser**

At `http://127.0.0.1:4173/` verify:

- overview is the default workspace;
- 1280×720 shows today focus, recent problems and part of the course shelf without horizontal scrolling;
- 1440×900 shows the complete first dashboard composition;
- sidebar lens aligns for all four workspaces;
- course and problem callbacks navigate correctly;
- `Ctrl+K`, mouse search, Arrow keys, Enter and Escape work;
- search dialog is centered and clickable;
- browser console has no errors;
- pointer light updates CSS variables without React pointer state.

- [ ] **Step 4: Verify accessibility fallbacks**

Use test/browser media emulation or CSS inspection to verify:

- reduced motion removes dashboard entry movement and command scaling;
- reduced transparency makes toolbar, search surface and lens opaque;
- every icon-only button has a Chinese accessible name;
- keyboard focus remains visible at 200% zoom.

- [ ] **Step 5: Update delivery documentation**

Document the new default overview and `Ctrl+K` local search in README and Windows installation notes. Keep the existing honest limits for OCR, Markdown export, originals backup and unsigned packaging.

- [ ] **Step 6: Build the installer**

Run:

```powershell
.\node_modules\.bin\tauri.CMD build --target x86_64-pc-windows-gnu
```

Expected installer:

```text
src-tauri\target\x86_64-pc-windows-gnu\release\bundle\nsis\错题智库_0.1.0_x64-setup.exe
```

- [ ] **Step 7: Record fresh artifact evidence**

```powershell
Get-Item -LiteralPath 'src-tauri\target\x86_64-pc-windows-gnu\release\bundle\nsis\错题智库_0.1.0_x64-setup.exe'
Get-FileHash -Algorithm SHA256 -LiteralPath 'src-tauri\target\x86_64-pc-windows-gnu\release\bundle\nsis\错题智库_0.1.0_x64-setup.exe'
```

Record exact byte size, modified time, SHA-256 and unsigned status in the final handoff.

- [ ] **Step 8: Final review**

Request code review for the complete diff. Fix every Critical and Important issue, rerun the affected focused test, then rerun the full verification commands before claiming completion.

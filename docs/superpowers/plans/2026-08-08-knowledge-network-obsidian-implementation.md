# Knowledge Network and Obsidian Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native course knowledge map backed by accepted local records and a safe, optional one-way export to Obsidian Markdown and JSON Canvas.

**Architecture:** Rust performs deterministic aggregation and filesystem export; React renders a read-only interactive map and inspector. The graph is derived from saved `notes` fields, so the existing database stays authoritative and no schema migration is required. Obsidian export writes only to a dedicated managed folder and records checksums in a manifest to avoid overwriting user edits.

**Tech Stack:** Rust, rusqlite, serde/serde_json, Tauri 2 commands, React 19, TypeScript, GSAP, Vitest, Testing Library, CSS.

## Global Constraints

- 错题智库是唯一可靠主库；Obsidian 是可选单向出口。
- 图谱节点只来自用户已保存或已采纳的知识点文本。
- 不依赖 Obsidian 社区插件，不实现双向同步。
- 导出不得删除清单外文件；发现用户修改时生成冲突副本。
- 常规动画只改变 `transform` 与 `opacity`；必须尊重 `prefers-reduced-motion` 与 `prefers-reduced-transparency`。
- 不修改已有未提交文件 `src-tauri/gen/schemas/capabilities.json`。

---

### Task 1: Rust knowledge graph domain and aggregation

**Files:**
- Create: `src-tauri/src/domain/knowledge.rs`
- Modify: `src-tauri/src/domain/mod.rs`
- Modify: `src-tauri/src/db/database.rs`
- Test: `src-tauri/src/db/database_test.rs`

**Interfaces:**
- Produces: `KnowledgeGraph { courses: Vec<KnowledgeCourse>, topics: Vec<KnowledgeTopic>, edges: Vec<KnowledgeEdge> }`.
- Produces: `Database::knowledge_graph(course_id: Option<&str>, today: &str) -> DatabaseResult<KnowledgeGraph>`.

- [ ] **Step 1: Write failing aggregation tests**

Add fixtures with two courses, repeated `知识点：IS 曲线、LM 曲线`, review events, due dates, and mistake reasons. Assert course isolation, topic de-duplication, problem IDs, due counts, and stable IDs:

```rust
let graph = database.knowledge_graph(Some("macro"), "2026-08-08").unwrap();
assert_eq!(graph.courses.len(), 1);
assert_eq!(graph.topics.iter().map(|item| item.name.as_str()).collect::<Vec<_>>(), vec!["IS 曲线", "LM 曲线"]);
assert_eq!(graph.topics[0].id, "topic-macro-is-曲线");
assert_eq!(graph.topics[0].problem_count, 2);
assert_eq!(graph.topics[0].due_count, 1);
assert!(graph.edges.iter().any(|edge| edge.kind == "course_topic"));
```

- [ ] **Step 2: Run the focused Rust test and confirm failure**

Run: `pnpm test:rust knowledge_graph`

Expected: compile failure because `knowledge_graph` and domain types do not exist.

- [ ] **Step 3: Add serializable domain types**

Define camelCase DTOs:

```rust
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeTopic {
    pub id: String,
    pub course_id: String,
    pub name: String,
    pub problem_count: usize,
    pub due_count: usize,
    pub mastery_score: u8,
    pub mistake_reasons: Vec<String>,
    pub problem_ids: Vec<String>,
}
```

Define matching `KnowledgeCourse`, `KnowledgeEdge`, and `KnowledgeGraph`. Edge kinds are exactly `course_topic` and `topic_problem`.

- [ ] **Step 4: Implement deterministic aggregation**

Query course/problem/field/review data, feed every saved notes value through the existing `split_knowledge_topics`, normalize surrounding whitespace, preserve first-seen display spelling, and generate stable IDs from course ID plus a lowercase safe slug. Compute mastery as `100 - min(80, due_count * 25 + forgotten_or_hard_count * 15)` with a floor of 20 for topics that have problems; document this transparent display rule next to the function.

- [ ] **Step 5: Run database tests**

Run: `pnpm test:rust database_test`

Expected: all database tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/domain/knowledge.rs src-tauri/src/domain/mod.rs src-tauri/src/db/database.rs src-tauri/src/db/database_test.rs
git commit -m "feat: aggregate local course knowledge graph"
```

### Task 2: Tauri graph command and TypeScript contract

**Files:**
- Create: `src-tauri/src/commands/knowledge.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`
- Test: `src/lib/tauri.test.ts`

**Interfaces:**
- Consumes: `Database::knowledge_graph` from Task 1.
- Produces: Tauri command `get_knowledge_graph`.
- Produces: TypeScript `KnowledgeGraph`, `KnowledgeTopic`, `KnowledgeEdge`, `getKnowledgeGraph(courseId, today)`.

- [ ] **Step 1: Write a failing frontend bridge test**

```ts
await getKnowledgeGraph('macro', '2026-08-08');
expect(invoke).toHaveBeenCalledWith('get_knowledge_graph', {
  courseId: 'macro', today: '2026-08-08',
});
```

- [ ] **Step 2: Run the bridge test and confirm failure**

Run: `pnpm test -- src/lib/tauri.test.ts`

Expected: FAIL because `getKnowledgeGraph` is not exported.

- [ ] **Step 3: Implement and register the command**

```rust
#[tauri::command]
pub fn get_knowledge_graph(
    state: State<'_, AppState>,
    course_id: Option<String>,
    today: String,
) -> Result<KnowledgeGraph, String> {
    state.database.knowledge_graph(course_id.as_deref(), &today)
        .map_err(|error| error.to_string())
}
```

Register it in `generate_handler!` and mirror the Rust DTO shape exactly in TypeScript.

- [ ] **Step 4: Run frontend and Rust tests**

Run: `pnpm test -- src/lib/tauri.test.ts`

Run: `pnpm test:rust knowledge`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/commands/knowledge.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/tauri.ts src/lib/tauri.test.ts
git commit -m "feat: expose knowledge graph to desktop UI"
```

### Task 3: Native knowledge network workspace

**Files:**
- Create: `src/features/knowledge/KnowledgeNetwork.tsx`
- Create: `src/features/knowledge/KnowledgeCanvas.tsx`
- Create: `src/features/knowledge/knowledgeLayout.ts`
- Create: `src/features/knowledge/KnowledgeInspector.tsx`
- Create: `src/features/knowledge/KnowledgeNetwork.test.tsx`
- Create: `src/features/knowledge/knowledgeLayout.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `getKnowledgeGraph`, `KnowledgeGraph`, `KnowledgeTopic` from Task 2.
- Produces: `KnowledgeNetwork({ courseId, onOpenProblem })`.

- [ ] **Step 1: Write failing layout and interaction tests**

Assert deterministic course/topic placement, empty state, error retry, course filtering, topic selection, inspector content, and problem opening:

```ts
expect(layoutKnowledgeGraph(graph).nodes.find((node) => node.id === 'topic-macro-is')?.x).toBe(360);
await user.click(screen.getByRole('button', { name: /IS 曲线/ }));
expect(screen.getByRole('complementary', { name: '知识点摘要' })).toHaveTextContent('2 道关联题');
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm test -- src/features/knowledge`

Expected: FAIL because the feature files do not exist.

- [ ] **Step 3: Implement deterministic radial-column layout**

Place the selected course at `x=72`; place topics in two vertical columns beginning at `x=360`, with 88px vertical rhythm. Return SVG path endpoints separately so layout can be unit tested without the DOM.

- [ ] **Step 4: Implement the workspace**

Render edges in a non-interactive SVG layer and nodes as semantic buttons in an absolutely positioned layer. Provide filters `全部 / 薄弱 / 待复习`; treat mastery below 60 as weak. Selecting a topic opens the reading-style inspector and its problem buttons call `onOpenProblem`.

- [ ] **Step 5: Integrate navigation**

Extend `Workspace` with `knowledge`, add the sidebar item between review and archive, set `workspaceTitles.knowledge`, and render `KnowledgeNetwork`. Keep the current course sidebar selection as the graph filter.

- [ ] **Step 6: Add motion and fallback CSS**

Use CSS transitions and GSAP only for initial node entrance and inspector selection. Use `transform`/`opacity`, max duration 360ms, and disable translation under reduced motion. Use solid `var(--surface-*)` fallback under reduced transparency.

- [ ] **Step 7: Run tests, lint, and build**

Run: `pnpm test -- src/features/knowledge src/app/App.test.tsx`

Run: `pnpm lint`

Run: `pnpm build`

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add src/features/knowledge src/app/App.tsx src/app/App.test.tsx src/styles/global.css
git commit -m "feat: add native course knowledge network"
```

### Task 4: Safe Obsidian export service

**Files:**
- Create: `src-tauri/src/services/obsidian.rs`
- Create: `src-tauri/src/services/obsidian_test.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/db/database.rs`

**Interfaces:**
- Consumes: graph DTOs and read-only problem export records.
- Produces: `export_to_obsidian(database, destination, course_id) -> Result<ObsidianExportReport, ObsidianExportError>`.
- Produces: report fields `written`, `unchanged`, `conflicts`, `failed`, `course_canvas_path`.

- [ ] **Step 1: Write failing exporter tests**

Cover clean export, filename sanitization, Markdown/YAML, valid JSON Canvas, unchanged re-export, modified managed file conflict, preservation of unmanaged files, and destination escape rejection.

```rust
let report = export_to_obsidian(&database, root.path(), Some("macro")).unwrap();
assert!(root.path().join("错题智库/宏观经济学/课程知识图谱.canvas").exists());
assert_eq!(report.conflicts, 0);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm test:rust obsidian`

Expected: compile failure because the service is missing.

- [ ] **Step 3: Implement a stable export snapshot**

Add `Database::obsidian_export_snapshot(course_id)` returning course metadata, exported problem fields, attachment relative paths, and the knowledge graph in one locked read sequence. Do not expose API provider settings or credential metadata.

- [ ] **Step 4: Implement Markdown and JSON Canvas builders**

Use YAML scalar escaping, plain Markdown links with forward slashes, and JSON Canvas nodes of type `file`. Assign stable node IDs derived from record IDs; create `course_topic` and `topic_problem` edges with labels `包含` and `涉及`.

- [ ] **Step 5: Implement managed-file conflict protection**

Write `_同步清单.json` containing relative path plus SHA-256. Before replacing an existing managed file, compare its current hash with the prior manifest. On mismatch, write `filename.错题智库冲突-YYYYMMDD-HHMMSS.ext` and count a conflict. Never remove a path absent from the prior manifest.

- [ ] **Step 6: Run exporter and full Rust tests**

Run: `pnpm test:rust obsidian`

Run: `pnpm test:rust`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/services/obsidian.rs src-tauri/src/services/obsidian_test.rs src-tauri/src/services/mod.rs src-tauri/src/db/database.rs
git commit -m "feat: export managed Obsidian knowledge vault"
```

### Task 5: Obsidian export command and settings workflow

**Files:**
- Modify: `src-tauri/src/commands/knowledge.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`
- Create: `src/features/knowledge/exportObsidian.ts`
- Create: `src/features/knowledge/exportObsidian.test.ts`
- Create: `src/features/settings/ObsidianSettings.tsx`
- Create: `src/features/settings/ObsidianSettings.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: exporter from Task 4.
- Produces: Tauri command `export_obsidian_vault` and frontend function `exportObsidianVault(destination, courseId)`.
- Produces: settings workflow with directory picker, course scope, progress, report, and “在 Obsidian 打开”.

- [ ] **Step 1: Write failing bridge and UI tests**

Assert cancel is a no-op, directory selection invokes one export, report renders conflicts distinctly, and open action uses the returned Canvas path.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm test -- src/features/knowledge/exportObsidian.test.ts src/features/settings/ObsidianSettings.test.tsx`

Expected: FAIL because the workflow is missing.

- [ ] **Step 3: Add the native command**

```rust
#[tauri::command]
pub fn export_obsidian_vault(
    state: State<'_, AppState>, destination: String, course_id: Option<String>
) -> Result<ObsidianExportReport, String> {
    services::obsidian::export_to_obsidian(
        &state.database, Path::new(&destination), course_id.as_deref()
    ).map_err(|error| error.to_string())
}
```

- [ ] **Step 4: Implement directory selection and URI opening**

Use Tauri dialog `open({ directory: true, multiple: false })`. Open the returned absolute Canvas path through a properly encoded `obsidian://open?path=...` URI; failure produces a local notice and keeps the export report visible.

- [ ] **Step 5: Add the settings section**

Place it after export and before backup. Copy must state “单向导出，不会读取或覆盖你在 Obsidian 中修改过的文件”. Provide scope `当前课程 / 全部课程` when a course is selected.

- [ ] **Step 6: Run tests, lint, and build**

Run: `pnpm test -- src/features/knowledge src/features/settings/ObsidianSettings.test.tsx src/app/App.test.tsx`

Run: `pnpm lint`

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/commands/knowledge.rs src-tauri/src/lib.rs src/lib/tauri.ts src/features/knowledge src/features/settings/ObsidianSettings.tsx src/features/settings/ObsidianSettings.test.tsx src/app/App.tsx src/styles/global.css
git commit -m "feat: add safe Obsidian export workflow"
```

### Task 6: Documentation and release checkpoint

**Files:**
- Modify: `README.md`
- Create: `docs/verification/2026-08-08-knowledge-network-obsidian.md`

**Interfaces:**
- Consumes: completed native graph and Obsidian export.
- Produces: user-facing behavior, boundaries, test evidence, and known limitations.

- [ ] **Step 1: Update user documentation**

Document the knowledge network filters, derivation from accepted notes, export directory structure, conflict-copy behavior, optional Obsidian URI, and absence of two-way sync.

- [ ] **Step 2: Run the complete verification suite**

Run: `pnpm test`

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm test:rust`

Expected: all commands exit 0.

- [ ] **Step 3: Record exact evidence**

Write command, date, test count, and result into the verification document. Record any environment limitation without converting it into a success claim.

- [ ] **Step 4: Commit**

```powershell
git add README.md docs/verification/2026-08-08-knowledge-network-obsidian.md
git commit -m "docs: verify knowledge network and Obsidian bridge"
```

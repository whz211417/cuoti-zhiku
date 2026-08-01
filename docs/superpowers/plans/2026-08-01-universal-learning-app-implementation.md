# 错题智库通用学习应用升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Windows 本地错题应用升级为支持全窗口文件拖放、通用课程类型、多 AI Provider/模型和更精致空状态的可安装通用学习应用，同时保持离线核心、旧数据、备份和逐字段审核流程不变。

**Architecture:** 保持 React 19 + Tauri 2 + Rust + SQLite 的本地优先结构。窗口拖放由 Tauri 窗口事件进入统一导入命令；AI 的非敏感 Provider 配置由 Tauri Store 保存，Key 由 Windows Credential Manager 按 Provider 隔离，所有网络请求仍只在 Rust 后端发生。升级按可独立验收的数据库、导入、AI、界面与发布阶段推进。

**Tech Stack:** React 19、TypeScript 5.7、Vitest/Testing Library、GSAP 3、Tauri 2.8、Rust 2021、rusqlite 0.32、reqwest 0.12、keyring 4.1、SQLite migrations、NSIS。

## Global Constraints

- 没有配置 AI 时，导入、编辑、搜索、复习、导出和备份必须完整可用。
- 全窗口拖入始终进入“待整理”，不根据落点或文件名猜测类型；当前有选中课程时归入该课程，否则归入“未分类”。
- 支持 PNG、JPG、JPEG、WebP、PDF、Markdown、MD、TXT；单个失败不回滚其他成功文件。
- API Key 只存 Windows Credential Manager，不写入 SQLite、Tauri Store、日志、备份或导出文件，也不返回 WebView。
- 自定义 Provider 默认只允许 HTTPS；HTTP 只允许用户明确确认后的 `localhost` 或 `127.0.0.1`。
- AI 不静默切换 Provider 或模型，不自动覆盖任何本地字段，每次发送前继续显示并要求确认。
- 只把近似 VisionOS 材质用于拖放、AI、设置和短暂浮层；主工作台保持稳定的原生桌面层级，详情与复习保持阅读页质感。
- 动效只使用 `transform`、`opacity` 和合成层滤镜；尊重 `prefers-reduced-motion` 与 `prefers-reduced-transparency`。
- 1280×720 与 1440×900 必须无关键布局溢出；正文与关键图标达到 WCAG AA 对比度。
- 不新增账户、云同步、协作、Provider 市场、本地 OCR、自动更新器或商业签名。

## File Structure

- `src-tauri/migrations/0006_course_kind.sql`：给课程增加稳定的通用类型字段。
- `src-tauri/src/db/database.rs`：执行 v6 迁移并在课程读写中携带 `kind`。
- `src-tauri/src/services/ingest.rs`：验证并保存新增文本格式。
- `src/features/ingest/windowFileDrop.ts`：隔离 Tauri 窗口拖放订阅，便于单元测试。
- `src/features/ingest/GlobalFileDrop.tsx`：全窗口拖放状态机和可访问覆盖层。
- `src/features/ingest/ImportProgress.tsx`：批量导入成功/失败结果浮层。
- `src/features/onboarding/EmptyLibraryStart.tsx`：真实空资料库的三个上下文入口。
- `src/features/settings/aiProviderCatalog.ts`：内置 Provider、推荐模型和能力声明。
- `src/features/settings/aiProviderStore.ts`：Tauri Store 中的非敏感配置与当前 Provider。
- `src/features/settings/AiProviderSettings.tsx`：Provider 列表、模型、Key 和连接测试界面。
- `src-tauri/src/services/ai/providers.rs`：Provider DTO、端点验证和请求参数校验。
- `src-tauri/src/services/ai/client.rs`：OpenAI-compatible 请求、响应及错误分类。
- `src-tauri/src/services/credentials.rs`：按 Provider 隔离 Key，并迁移旧 DashScope Key。
- `src-tauri/src/commands/ai.rs`：Key、连接测试与分析命令边界。
- `src/lib/tauri.ts`：前后端 DTO 与 invoke 包装。
- `src/app/App.tsx`：挂载全局拖放、空状态入口和刷新动作。
- `src/features/problems/ProblemDocument.tsx`：在现有 AI 发送确认中显示 Provider、模型、文本、图片和资料范围。
- `src/styles/global.css`：拖放、Provider 设置、空状态、深浅主题和降级材质。

---

### Task 1: 通用课程类型与无损数据库迁移

**Files:**
- Create: `src-tauri/migrations/0006_course_kind.sql`
- Modify: `src-tauri/src/db/database.rs`
- Modify: `src-tauri/src/commands/courses.rs`
- Modify: `src/lib/tauri.ts`
- Modify: `src/features/courses/CourseSidebar.tsx`
- Test: `src-tauri/src/db/database_test.rs`
- Test: `src-tauri/src/domain/courses_test.rs`
- Test: `src/features/courses/CourseSidebar.test.tsx`

**Interfaces:**
- Produces: Rust `Course { id, name, term, color, kind }` and TypeScript `CourseKind = 'school' | 'exam' | 'language' | 'certificate' | 'other'`.
- Produces: `createCourse(name, term, color, kind): Promise<Course>`.

- [ ] **Step 1: Write the failing migration and course creation tests**

```rust
#[test]
fn migrates_existing_courses_to_school_kind() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();
    let course = database.create_course("微积分", "", "#7895A5", "school").unwrap();
    assert_eq!(course.kind, "school");
    assert_eq!(database.schema_version().unwrap(), 6);
}

#[test]
fn rejects_unknown_course_kind() {
    let root = tempfile::tempdir().unwrap();
    let database = Database::open(root.path()).unwrap();
    assert!(database.create_course("课程", "", "#7895A5", "unknown").is_err());
}
```

```tsx
test('creates a language course with an explicit kind', async () => {
  createCourse.mockResolvedValue({ id: 'c1', name: '日语 N2', term: '', color: '#7895A5', kind: 'language' });
  render(<CourseSidebar onSelectCourse={vi.fn()} selectedCourseId={null} />);
  await userEvent.click(screen.getByRole('button', { name: '新建课程' }));
  await userEvent.type(screen.getByLabelText('课程名称'), '日语 N2');
  await userEvent.selectOptions(screen.getByLabelText('课程类型'), 'language');
  await userEvent.click(screen.getByRole('button', { name: '添加' }));
  expect(createCourse).toHaveBeenCalledWith('日语 N2', '', '#7895A5', 'language');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/features/courses/CourseSidebar.test.tsx`
Expected: FAIL because the type selector and fourth `createCourse` argument do not exist.

Run: `npm run test:rust -- domain::courses_test db::database_test`
Expected: FAIL because schema version 6 and `Course.kind` do not exist.

- [ ] **Step 3: Add migration and exact type validation**

```sql
ALTER TABLE courses
ADD COLUMN kind TEXT NOT NULL DEFAULT 'school'
CHECK(kind IN ('school', 'exam', 'language', 'certificate', 'other'));
```

Add v6 application after v5 in `Database::open`, include `kind` in course SELECT/INSERT statements, and validate before the transaction:

```rust
fn validate_course_kind(kind: &str) -> DatabaseResult<&str> {
    match kind {
        "school" | "exam" | "language" | "certificate" | "other" => Ok(kind),
        _ => Err(DatabaseError::Conflict("请选择有效的课程类型。".to_owned())),
    }
}
```

Update frontend DTOs and the course form:

```ts
export type CourseKind = 'school' | 'exam' | 'language' | 'certificate' | 'other';
export type Course = { id: string; name: string; term: string; color: string; kind: CourseKind };
export const createCourse = (name: string, term: string, color: string, kind: CourseKind) =>
  invoke<Course>('create_course', { name, term, color, kind });
```

- [ ] **Step 4: Run focused tests and full migration regression**

Run: `npm test -- src/features/courses/CourseSidebar.test.tsx && npm run test:rust`
Expected: course tests PASS; all existing Rust tests PASS; restored v1-v5 databases report schema version 6 and old courses report `kind = school`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/0006_course_kind.sql src-tauri/src/db/database.rs src-tauri/src/commands/courses.rs src-tauri/src/db/database_test.rs src-tauri/src/domain/courses_test.rs src/lib/tauri.ts src/features/courses/CourseSidebar.tsx src/features/courses/CourseSidebar.test.tsx
git commit -m "feat: add universal course types"
```

### Task 2: 文本原件支持与统一批量导入边界

**Files:**
- Modify: `src-tauri/src/services/ingest.rs`
- Modify: `src-tauri/src/services/ingest_test.rs`
- Modify: `src/features/inbox/selectProblemFiles.ts`
- Modify: `src/features/inbox/selectProblemFiles.test.ts`
- Test: `src-tauri/src/services/ingest_test.rs`

**Interfaces:**
- Consumes: existing `importFiles(paths, courseId)` command.
- Produces: `SUPPORTED_PROBLEM_EXTENSIONS` used by manual picker and drag UI copy.

- [ ] **Step 1: Add failing supported-format tests**

```rust
#[test]
fn stores_markdown_and_text_originals() {
    let temp = tempfile::tempdir().unwrap();
    for (name, expected) in [("notes.md", "text/markdown"), ("outline.markdown", "text/markdown"), ("question.txt", "text/plain")] {
        let source = temp.path().join(name);
        fs::write(&source, "学习内容").unwrap();
        let imported = import_original(&source, &temp.path().join("originals")).unwrap();
        assert_eq!(imported.mime_type, expected);
    }
}
```

```ts
test('manual picker exposes every supported original type', async () => {
  await selectProblemFiles(null);
  expect(open).toHaveBeenCalledWith(expect.objectContaining({
    filters: [{ name: '题目与资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'markdown', 'md', 'txt'] }],
  }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/features/inbox/selectProblemFiles.test.ts && npm run test:rust -- services::ingest_test`
Expected: FAIL for the three new extensions.

- [ ] **Step 3: Extend the single backend allowlist and picker**

```rust
let mime_type = match extension.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "pdf" => "application/pdf",
    "md" | "markdown" => "text/markdown",
    "txt" => "text/plain",
    _ => return Err(IngestError::UnsupportedFile(source.to_path_buf())),
};
```

```ts
export const SUPPORTED_PROBLEM_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'markdown', 'md', 'txt'] as const;
```

- [ ] **Step 4: Verify focused tests**

Run: `npm test -- src/features/inbox/selectProblemFiles.test.ts && npm run test:rust -- services::ingest_test`
Expected: PASS, including duplicate SHA-256 behavior.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/ingest.rs src-tauri/src/services/ingest_test.rs src/features/inbox/selectProblemFiles.ts src/features/inbox/selectProblemFiles.test.ts
git commit -m "feat: accept text learning originals"
```

### Task 3: Tauri 全窗口拖放状态机

**Files:**
- Create: `src/features/ingest/windowFileDrop.ts`
- Create: `src/features/ingest/windowFileDrop.test.ts`
- Create: `src/features/ingest/GlobalFileDrop.tsx`
- Create: `src/features/ingest/GlobalFileDrop.test.tsx`
- Create: `src/features/ingest/ImportProgress.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `subscribeToWindowFileDrop(listener): Promise<UnlistenFn>` where listener receives `{ type: 'enter' | 'over' | 'drop' | 'leave'; paths: string[] }`.
- Produces: `<GlobalFileDrop courseId onImported onOpenInbox />`.
- Consumes: `importFiles(paths, courseId)`.

- [ ] **Step 1: Write failing event-adapter and component tests**

```ts
test('normalizes Tauri drop events and unregisters the listener', async () => {
  const listener = vi.fn();
  const unlisten = vi.fn();
  onDragDropEvent.mockImplementation(async (handler) => {
    handler({ payload: { type: 'drop', paths: ['C:\\题图.png'], position: { x: 10, y: 20 } } });
    return unlisten;
  });
  const stop = await subscribeToWindowFileDrop(listener);
  expect(listener).toHaveBeenCalledWith({ type: 'drop', paths: ['C:\\题图.png'] });
  stop();
  expect(unlisten).toHaveBeenCalled();
});
```

```tsx
test('shows drop guidance then preserves partial import results', async () => {
  importFiles.mockResolvedValue([
    { sourcePath: 'C:\\a.png', item: { id: 'i1', problemId: 'p1', attachmentId: 'a1', filename: 'a.png', createdAt: 'now' }, error: null },
    { sourcePath: 'C:\\bad.exe', item: null, error: '暂不支持此文件' },
  ]);
  render(<GlobalFileDrop courseId={null} onImported={vi.fn()} onOpenInbox={vi.fn()} />);
  emitDrop({ type: 'enter', paths: ['C:\\a.png', 'C:\\bad.exe'] });
  expect(screen.getByText('松手即可保存到待整理')).toBeVisible();
  emitDrop({ type: 'drop', paths: ['C:\\a.png', 'C:\\bad.exe'] });
  expect(await screen.findByText('已保存 1 个，1 个未导入')).toBeVisible();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/features/ingest/windowFileDrop.test.ts src/features/ingest/GlobalFileDrop.test.tsx src/app/App.test.tsx`
Expected: FAIL because new modules and global mount do not exist.

- [ ] **Step 3: Implement adapter and non-reentrant state machine**

```ts
import { getCurrentWindow } from '@tauri-apps/api/window';
export type WindowFileDrop = { type: 'enter' | 'over' | 'drop' | 'leave'; paths: string[] };
export async function subscribeToWindowFileDrop(listener: (event: WindowFileDrop) => void) {
  return getCurrentWindow().onDragDropEvent(({ payload }) => {
    listener({ type: payload.type, paths: 'paths' in payload ? payload.paths : [] });
  });
}
```

`GlobalFileDrop` must keep `phase: 'idle' | 'ready' | 'importing' | 'complete'`, ignore a second `drop` while importing, capture the current `courseId` at drop time, call `onImported` once if any result succeeds, and leave the result visible until dismiss or “查看待整理”. Cleanup must always call the Tauri unlisten function.

- [ ] **Step 4: Add overlay/progress styling with reduced-motion and opaque fallback**

```css
.global-file-drop { position: fixed; inset: 14px; z-index: 90; display: grid; place-items: center; opacity: 0; pointer-events: none; transform: scale(.985); transition: opacity 180ms ease-out, transform 240ms cubic-bezier(.2,.8,.2,1); }
.global-file-drop.is-visible { opacity: 1; transform: scale(1); }
.global-file-drop__surface { background: rgba(248,248,250,.78); border: 1px solid rgba(255,255,255,.72); box-shadow: 0 24px 70px rgba(28,32,40,.2), inset 0 1px rgba(255,255,255,.76); backdrop-filter: blur(28px) saturate(1.18); }
@media (prefers-reduced-motion: reduce) { .global-file-drop { transform: none; transition: opacity 100ms ease-out; } }
@media (prefers-reduced-transparency: reduce) { .global-file-drop__surface { background: #f5f5f7; backdrop-filter: none; } }
```

- [ ] **Step 5: Mount at app root and verify behavior**

Mount immediately inside `.app-shell`, pass `selectedCourseId ?? undefined`, refresh overview on success, and make “查看待整理” select the inbox workspace. Run:

`npm test -- src/features/ingest/windowFileDrop.test.ts src/features/ingest/GlobalFileDrop.test.tsx src/app/App.test.tsx`

Expected: PASS for enter/over/leave/drop, partial failure, duplicate drops, unmount cleanup, course capture and inbox navigation.

- [ ] **Step 6: Commit**

```bash
git add src/features/ingest src/app/App.tsx src/app/App.test.tsx src/styles/global.css
git commit -m "feat: add whole-window file drop"
```

### Task 4: 真实空资料库起步入口与通用文案

**Files:**
- Create: `src/features/onboarding/EmptyLibraryStart.tsx`
- Create: `src/features/onboarding/EmptyLibraryStart.test.tsx`
- Create: `src/features/materials/selectCourseMaterialFile.ts`
- Create: `src/features/materials/selectCourseMaterialFile.test.ts`
- Modify: `src/features/dashboard/LearningDashboard.tsx`
- Modify: `src/features/dashboard/dashboard.test.tsx`
- Modify: `src/features/inbox/IngestDropzone.tsx`
- Modify: `src/features/courses/CourseSidebar.tsx`
- Modify: `src/features/courses/CourseSidebar.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `<EmptyLibraryStart onImportProblem onImportMaterial onCreateCourse />`.
- Consumes: dashboard counts; no fake/demo records.
- Produces: `selectCourseMaterialFile(): Promise<string | null>` using a PDF/Markdown/TXT file picker.
- Changes: `CourseSidebar` receives `openCreateToken?: number` and calls `onCourseCreated?(course: Course)` so a pending material import can resume after its course is created.

- [ ] **Step 1: Write failing empty-state tests**

```tsx
test('shows three real actions only for an empty library', async () => {
  getDashboardOverview.mockResolvedValue({ ...emptyOverview, courseCount: 0, pendingInboxCount: 0, materialCount: 0, recentProblems: [] });
  render(<LearningDashboard
    onCreateCourse={onCreateCourse}
    onImportMaterial={onImportMaterial}
    onIngest={onIngest}
    onOpenCourse={vi.fn()}
    onOpenInbox={vi.fn()}
    onOpenProblem={vi.fn()}
    onStartReview={vi.fn()}
  />);
  expect(await screen.findByRole('button', { name: '拖入题目或题图' })).toBeVisible();
  expect(screen.getByRole('button', { name: '导入学习资料' })).toBeVisible();
  expect(screen.getByRole('button', { name: '新建课程' })).toBeVisible();
  expect(screen.queryByText(/本周已学习 12/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- src/features/onboarding/EmptyLibraryStart.test.tsx src/features/dashboard/dashboard.test.tsx`
Expected: FAIL because the contextual empty start component is missing.

- [ ] **Step 3: Implement empty library predicate and actions**

```ts
export function isLibraryEmpty(overview: DashboardOverview) {
  return overview.courseCount === 0
    && overview.pendingInboxCount === 0
    && overview.materialCount === 0
    && overview.recentProblems.length === 0;
}
```

Use semantic buttons with copy “拖入题目或题图 / 导入学习资料 / 新建课程”. The first action opens the existing picker as a keyboard-accessible fallback. The material action immediately opens `selectCourseMaterialFile`; if a course is selected, import into it; otherwise retain the chosen path in `pendingMaterialPathRef`, increment `courseCreateRequestToken`, and import into the exact `Course.id` returned by `onCourseCreated`. Cancellation clears the pending path. The third action only increments `courseCreateRequestToken`. Rename visible “收件箱” copy to “待整理” and “教材依据” to “学习资料” without renaming persisted table or field identifiers.

- [ ] **Step 4: Verify contextual actions and non-empty dashboard**

Run: `npm test -- src/features/onboarding/EmptyLibraryStart.test.tsx src/features/materials/selectCourseMaterialFile.test.ts src/features/dashboard/dashboard.test.tsx src/features/inbox/inbox.test.tsx src/features/courses/CourseSidebar.test.tsx src/app/App.test.tsx`
Expected: PASS; a selected course imports immediately, an empty library resumes after course creation, cancellation imports nothing, and non-empty users retain TodayFocus, course shelf, recent problems and learning signals.

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding src/features/materials/selectCourseMaterialFile.ts src/features/materials/selectCourseMaterialFile.test.ts src/features/dashboard src/features/inbox/IngestDropzone.tsx src/features/courses/CourseSidebar.tsx src/features/courses/CourseSidebar.test.tsx src/app/App.tsx src/app/App.test.tsx src/styles/global.css
git commit -m "feat: add honest first-run learning start"
```

### Task 5: Provider 目录与 Tauri Store 配置

**Files:**
- Create: `src/features/settings/aiProviderCatalog.ts`
- Create: `src/features/settings/aiProviderCatalog.test.ts`
- Create: `src/features/settings/aiProviderStore.ts`
- Create: `src/features/settings/aiProviderStore.test.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src-tauri/capabilities/main.json`

**Interfaces:**
- Produces: `AiProviderId`, `AiProviderConfig`, `AiModelOption`, `AI_PROVIDER_PRESETS`.
- Produces: `loadAiProviderState(): Promise<AiProviderState>` and `saveAiProviderState(state): Promise<void>` using `ai-providers.json`.
- Preset IDs: `bailian`, `deepseek`, `zhipu`, `moonshot`, `openai`; custom IDs start with `custom-`.

- [ ] **Step 1: Write failing catalog/store tests**

```ts
test('ships five presets plus safe custom defaults', () => {
  expect(AI_PROVIDER_PRESETS.map((item) => item.id)).toEqual(['bailian', 'deepseek', 'zhipu', 'moonshot', 'openai']);
  expect(createCustomProvider().baseUrl).toBe('https://');
  expect(createCustomProvider().id).toMatch(/^custom-/);
});

test('repairs an invalid active provider without inventing a key', async () => {
  storeGet.mockResolvedValue({ providers: [bailianConfig], activeProviderId: 'missing' });
  expect(await loadAiProviderState()).toEqual({ providers: [bailianConfig], activeProviderId: 'bailian' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/features/settings/aiProviderCatalog.test.ts src/features/settings/aiProviderStore.test.ts`
Expected: FAIL because catalog and store modules do not exist.

- [ ] **Step 3: Implement exact DTOs and defaults**

```ts
export type AiProviderConfig = {
  id: string;
  displayName: string;
  baseUrl: string;
  selectedModel: string;
  visionModel: string | null;
  supportsVision: boolean;
  requestTimeoutSeconds: number;
  isEnabled: boolean;
  preset: 'bailian' | 'deepseek' | 'zhipu' | 'moonshot' | 'openai' | 'custom';
  allowInsecureLocalhost: boolean;
};
export type AiProviderState = { providers: AiProviderConfig[]; activeProviderId: string | null };
```

Use these compatible base URLs and verified model presets:

- 百炼: `https://dashscope.aliyuncs.com/compatible-mode/v1`; fast/vision `qwen3.6-flash`, quality/vision `qwen3.7-plus`.
- DeepSeek: `https://api.deepseek.com`; fast `deepseek-v4-flash`, quality `deepseek-v4-pro`, no declared image capability.
- 智谱: `https://open.bigmodel.cn/api/paas/v4`; text `glm-5.2`, vision `glm-4.5v`.
- 月之暗面: `https://api.moonshot.cn/v1`; text `kimi-k3`, vision `kimi-k2.6`.
- OpenAI: `https://api.openai.com/v1`; efficient/vision `gpt-5.6-luna`, balanced/vision `gpt-5.6-terra`.

These IDs were checked against official provider documentation on 2026-08-01. The UI labels them as editable recommendations, so a provider-side change can be handled by entering a current model ID without shipping a new app. Store no credential or credential-presence boolean. Add `store:default` to `src-tauri/capabilities/main.json`; no broader filesystem or network WebView permission is added.

- [ ] **Step 4: Verify store corruption recovery and key absence**

Run: `npm test -- src/features/settings/aiProviderCatalog.test.ts src/features/settings/aiProviderStore.test.ts`
Expected: PASS; serialized state contains no `apiKey`, `key`, or `secret` property.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/aiProviderCatalog.ts src/features/settings/aiProviderCatalog.test.ts src/features/settings/aiProviderStore.ts src/features/settings/aiProviderStore.test.ts src/lib/tauri.ts src-tauri/capabilities/main.json
git commit -m "feat: add local AI provider catalog"
```

### Task 6: Provider 隔离凭据与旧 DashScope Key 迁移

**Files:**
- Modify: `src-tauri/src/services/credentials.rs`
- Create: `src-tauri/src/services/credentials_test.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`

**Interfaces:**
- Produces: `save_provider_key(provider_id, value)`, `read_provider_key(provider_id)`, `has_provider_key(provider_id)`, `clear_provider_key(provider_id)`.
- Produces commands: `has_ai_provider_key`, `save_ai_provider_key`, `clear_ai_provider_key`.
- Migration rule: copy legacy account `dashscope-api-key` to `ai-provider:bailian`, verify read-back, then delete legacy.

- [ ] **Step 1: Write failing isolated-key and migration tests using an injected credential backend**

```rust
#[test]
fn isolates_keys_by_provider_and_migrates_legacy_bailian_key() {
    let backend = MemoryCredentialBackend::default();
    backend.set("dashscope-api-key", "legacy").unwrap();
    migrate_legacy_dashscope_key(&backend).unwrap();
    assert_eq!(backend.get("ai-provider:bailian").unwrap(), "legacy");
    assert!(backend.get("dashscope-api-key").is_err());
    backend.set("ai-provider:deepseek", "deepseek-key").unwrap();
    assert_eq!(backend.get("ai-provider:bailian").unwrap(), "legacy");
}
```

- [ ] **Step 2: Run Rust tests and verify failure**

Run: `npm run test:rust -- services::credentials_test`
Expected: FAIL because provider-scoped operations and injectable backend are missing.

- [ ] **Step 3: Implement provider ID validation and safe errors**

```rust
fn account(provider_id: &str) -> Result<String, String> {
    if provider_id.is_empty() || !provider_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("AI 平台标识无效。".to_owned());
    }
    Ok(format!("ai-provider:{provider_id}"))
}
```

Never include password values in `Display`, `Debug`, command errors or test snapshots. Treat missing key as `Ok(false)` for `has`, while `clear` of a missing key is idempotent.

- [ ] **Step 4: Register new commands and keep compatibility during migration**

```ts
export const hasAiProviderKey = (providerId: string) => invoke<boolean>('has_ai_provider_key', { providerId });
export const saveAiProviderKey = (providerId: string, apiKey: string) => invoke<void>('save_ai_provider_key', { providerId, apiKey });
export const clearAiProviderKey = (providerId: string) => invoke<void>('clear_ai_provider_key', { providerId });
```

- [ ] **Step 5: Verify and commit**

Run: `npm run test:rust && npm test -- src/lib/tauri.test.ts`
Expected: all Rust and invoke wrapper tests PASS.

```bash
git add src-tauri/src/services/credentials.rs src-tauri/src/services/credentials_test.rs src-tauri/src/services/mod.rs src-tauri/src/commands/ai.rs src-tauri/src/lib.rs src/lib/tauri.ts src/lib/tauri.test.ts
git commit -m "feat: isolate AI provider credentials"
```

### Task 7: Rust OpenAI-compatible Provider 客户端与连接测试

**Files:**
- Replace: `src-tauri/src/services/ai.rs` with module folder `src-tauri/src/services/ai/mod.rs`
- Create: `src-tauri/src/services/ai/providers.rs`
- Create: `src-tauri/src/services/ai/client.rs`
- Move/Modify: `src-tauri/src/services/ai_test.rs` to `src-tauri/src/services/ai/tests.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`

**Interfaces:**
- Produces Rust `AiProviderConfig`, `AiRequest`, `AiResponse`, `AiProviderClient`, `AiErrorKind`.
- Produces commands `test_ai_provider(config)` and `run_problem_analysis(problem_id, mode, config)`.
- Consumes credentials by `config.id`; never accepts an API Key inside `AiProviderConfig`.

- [ ] **Step 1: Write failing endpoint-validation, request snapshot and error-classification tests**

```rust
#[test]
fn rejects_remote_http_but_allows_confirmed_loopback() {
    assert!(validate_base_url("http://api.example.com/v1", false).is_err());
    assert!(validate_base_url("http://localhost:11434/v1", false).is_err());
    assert!(validate_base_url("http://localhost:11434/v1", true).is_ok());
    assert!(validate_base_url("http://127.0.0.1:11434/v1", true).is_ok());
}

#[test]
fn builds_generic_request_without_provider_branches_or_economics_copy() {
    let body = build_request_body("model-x", "题干", &[], &[]);
    assert_eq!(body["model"], "model-x");
    assert!(body.to_string().contains("中文学习题目整理助手"));
    assert!(!body.to_string().contains("经济学"));
}

#[test]
fn classifies_auth_quota_rate_limit_model_and_format_errors() {
    assert_eq!(classify_status(401, ""), AiErrorKind::Authentication);
    assert_eq!(classify_status(402, "insufficient balance"), AiErrorKind::Quota);
    assert_eq!(classify_status(429, "rate limit"), AiErrorKind::RateLimit);
    assert_eq!(classify_status(404, "model not found"), AiErrorKind::ModelNotFound);
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:rust -- services::ai`
Expected: FAIL because generic config, endpoint validation and classified errors do not exist.

- [ ] **Step 3: Implement exact config validation**

```rust
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub display_name: String,
    pub base_url: String,
    pub selected_model: String,
    pub vision_model: Option<String>,
    pub supports_vision: bool,
    pub request_timeout_seconds: u64,
    pub allow_insecure_localhost: bool,
}
```

Normalize exactly one `/chat/completions` suffix, require timeout 10–180 seconds, require non-empty model, reject URLs containing credentials/fragments, and allow HTTP only for confirmed loopback hostnames.

- [ ] **Step 4: Implement generic request and minimum connection probe**

`test_ai_provider` sends one text-only user message “只回复 OK” with `max_completion_tokens: 8`, no local material or image, and returns:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionResult {
    pub authenticated: bool,
    pub model_available: bool,
    pub vision_declared: bool,
}
```

The analysis path uses `selected_model` for text-only requests and selects `vision_model` only when images are included and `supports_vision` is true; otherwise it returns an actionable capability error and never silently removes the image or changes model. `AnalysisMode::Flash | Deep` changes the analysis instruction and output budget only; it never selects a different model behind the user's back.

- [ ] **Step 5: Verify request snapshots and response parsing**

Run: `npm run test:rust -- services::ai`
Expected: PASS for all preset base URLs, custom HTTPS, confirmed loopback HTTP, text/image boundaries, safe error strings and JSON field parsing.

- [ ] **Step 6: Register commands and run full Rust suite**

Run: `npm run test:rust`
Expected: all Rust tests PASS; legacy analysis tests now pass through the generic client.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/ai src-tauri/src/services/mod.rs src-tauri/src/commands/ai.rs src-tauri/src/lib.rs src/lib/tauri.ts src/lib/tauri.test.ts
git commit -m "feat: add multi-provider AI client"
```

### Task 8: 多 Provider 设置界面

**Files:**
- Create: `src/features/settings/AiProviderSettings.tsx`
- Create: `src/features/settings/AiProviderSettings.test.tsx`
- Create: `src/features/settings/AiProviderEditor.tsx`
- Remove: `src/features/settings/AiSettings.tsx`
- Remove: `src/features/settings/AiSettings.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: catalog/store from Task 5; key and test commands from Tasks 6–7.
- Produces: current Provider selection persisted only after validation; editor never receives a stored Key value.

- [ ] **Step 1: Write failing provider settings tests**

```tsx
test('selects a preset, saves a model and never echoes the key', async () => {
  render(<AiProviderSettings />);
  await userEvent.click(await screen.findByRole('button', { name: /DeepSeek/ }));
  await userEvent.type(screen.getByLabelText('API Key'), 'secret-value');
  await userEvent.click(screen.getByRole('button', { name: '安全保存 Key' }));
  expect(saveAiProviderKey).toHaveBeenCalledWith('deepseek', 'secret-value');
  expect(screen.queryByDisplayValue('secret-value')).not.toBeInTheDocument();
});

test('does not replace the last usable config when connection test fails', async () => {
  testAiProvider.mockRejectedValue('模型不存在');
  render(<AiProviderSettings />);
  await userEvent.click(await screen.findByRole('button', { name: '测试连接' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('模型不存在');
  expect(saveAiProviderState).not.toHaveBeenCalledWith(expect.objectContaining({ activeProviderId: 'broken' }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/features/settings/AiProviderSettings.test.tsx src/app/App.test.tsx`
Expected: FAIL because provider list/editor do not exist.

- [ ] **Step 3: Implement list and editor states**

The list shows display name, configured/unconfigured badge and active checkmark. The editor exposes `baseUrl` only for custom providers, a recommended-model select plus advanced model ID input, an image capability declaration, timeout, masked key input, “测试连接”, “设为当前” and “移除 Key”. Disable “设为当前” until the current form has a successful connection result or represents the previously saved active config.

For localhost HTTP, display a dedicated confirmation containing the full origin and require a checked box before setting `allowInsecureLocalhost: true`. Never permit remote HTTP.

- [ ] **Step 4: Add compact inspector material and accessibility**

Use one stable opaque settings sheet with a translucent toolbar strip, not nested glass cards. Provide labels for every input, `role=status` for connection progress, `role=alert` for failure, a visible focus ring, 44px actions, Escape close via the existing settings dialog, and opaque/reduced-motion CSS fallbacks.

- [ ] **Step 5: Verify UI tests**

Run: `npm test -- src/features/settings/AiProviderSettings.test.tsx src/app/App.test.tsx`
Expected: PASS for preset selection, custom endpoint validation, model editing, key save/remove, connection success/failure, current Provider persistence and no key echo.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings src/app/App.tsx src/app/App.test.tsx src/styles/global.css
git commit -m "feat: add multi-provider AI settings"
```

### Task 9: 将当前 Provider 接入逐字段 AI 审核

**Files:**
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/problems/problems.test.tsx`
- Modify: `src/lib/tauri.ts`
- Modify: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/services/ai/mod.rs`
- Modify: `src-tauri/src/db/database.rs`
- Modify: `src-tauri/src/db/database_test.rs`
- Modify: `src-tauri/src/commands/materials.rs`
- Modify: `src/features/materials/MaterialsLibrary.test.tsx`

**Interfaces:**
- Consumes: `loadAiProviderState()` and active `AiProviderConfig`.
- Changes: `ProblemDocument` DTO includes `courseId`; `MaterialSnippet` includes `chunkId`.
- Changes: `runProblemAnalysis(problemId, mode, config, materialChunkIds)` where at most three IDs are accepted.
- Produces: `Database::material_context_for_problem(problem_id, chunk_ids)` which verifies every selected chunk belongs to the same course as the problem.
- Changes: `<ProblemDocument onOpenAiSettings>` lets missing-provider guidance open the existing settings inspector.
- Preserves: existing edit/accept/reject behavior and optimistic version checks.

- [ ] **Step 1: Write failing consent and stale-response tests**

```tsx
test('shows provider model and payload scope before sending', async () => {
  loadAiProviderState.mockResolvedValue({ providers: [deepseekConfig], activeProviderId: 'deepseek' });
  render(<ProblemDocument problemId="problem-ai" />);
  await userEvent.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  expect(screen.getByText('DeepSeek · deepseek-v4-flash')).toBeVisible();
  expect(screen.getByText('将发送题目文字')).toBeVisible();
  expect(screen.getByText('学习资料片段：0 个')).toBeVisible();
  expect(screen.getByRole('button', { name: '仅本次发送' })).toBeVisible();
  expect(runProblemAnalysis).not.toHaveBeenCalled();
});

test('sends only the three explicitly selected same-course material chunks', async () => {
  searchCourseMaterial.mockResolvedValue([
    { chunkId: 'm1-c1', materialId: 'm1', filename: '第一章.pdf', excerpt: '片段一' },
    { chunkId: 'm1-c2', materialId: 'm1', filename: '第一章.pdf', excerpt: '片段二' },
    { chunkId: 'm2-c1', materialId: 'm2', filename: '讲义.md', excerpt: '片段三' },
  ]);
  render(<ProblemDocument problemId="problem-ai" />);
  await openConsentAndSearchMaterials('需求弹性');
  for (const name of ['片段一', '片段二', '片段三']) await userEvent.click(screen.getByRole('checkbox', { name }));
  await userEvent.click(screen.getByRole('button', { name: '仅本次发送' }));
  expect(runProblemAnalysis).toHaveBeenCalledWith('problem-ai', 'flash', deepseekConfig, ['m1-c1', 'm1-c2', 'm2-c1']);
});

test('ignores a late response after provider or problem changes', async () => {
  const deferred = createDeferred<AiFieldSuggestion[]>();
  runProblemAnalysis.mockReturnValue(deferred.promise);
  const { rerender } = render(<ProblemDocument problemId="p1" />);
  await startConfirmedAnalysis();
  rerender(<ProblemDocument problemId="p2" />);
  deferred.resolve([{ kind: 'stem', value: '旧响应' }]);
  expect(screen.queryByDisplayValue('旧响应')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/features/problems/problems.test.tsx`
Expected: FAIL because consent does not show the active Provider/model and invoke lacks config.

- [ ] **Step 3: Pass validated config and isolate request generations**

Use a monotonically increasing `aiRequestRef`. Capture `{ problemId, providerId, model, generation }` before awaiting; only publish suggestions if all still match. Consent displays exact provider/model, whether original image is included, the current text fields, and the number/source of allowed local material snippets. Keep the button label “仅本次发送”.

Add an optional “从本课程学习资料中查找” search field. It uses `searchCourseMaterial(document.courseId, query)`, shows source filename plus excerpt, and allows zero to three checked chunks. Default is zero. The Rust command calls `material_context_for_problem`; that query joins `material_chunks`, `course_materials` and `problems`, requires `material.course_id = problem.course_id`, rejects more than three IDs, preserves the requested order, and passes only the verified filename/excerpt pairs to the prompt. Unknown or cross-course IDs fail before any network request.

If no active Provider or no key exists, call `onOpenAiSettings` without changing the local document. Error messages distinguish authentication, quota, rate limit, missing model, unsupported image, invalid response and network failure.

- [ ] **Step 4: Verify existing per-field review remains intact**

Run: `npm test -- src/features/problems/problems.test.tsx src/features/materials/MaterialsLibrary.test.tsx && npm run test:rust`
Expected: PASS for explicit consent, zero-fragment default, maximum three verified same-course fragments, cross-course rejection before networking, flash/deep analysis depth, edit suggestion, accept one field, reject one field, missing key settings handoff and stale response isolation.

- [ ] **Step 5: Commit**

```bash
git add src/features/problems/ProblemDocument.tsx src/features/problems/problems.test.tsx src/features/materials/MaterialsLibrary.test.tsx src/lib/tauri.ts src/lib/tauri.test.ts src-tauri/src/commands/ai.rs src-tauri/src/commands/materials.rs src-tauri/src/services/ai/mod.rs src-tauri/src/db/database.rs src-tauri/src/db/database_test.rs
git commit -m "feat: route AI review through active provider"
```

### Task 10: 主工作台视觉统一、主题与动效验收

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/components/material/DynamicControlSurface.tsx`
- Modify: `src/components/material/DynamicControlSurface.test.tsx`
- Modify: `src/components/material/InspectorSurface.tsx`
- Modify: `src/components/material/InspectorSurface.test.tsx`
- Modify: `src/features/dashboard/TodayFocus.tsx`
- Modify: `src/features/dashboard/CourseShelf.tsx`
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/review/ReviewReader.tsx`

**Interfaces:**
- Consumes: existing `getMotionPreferences()`.
- Produces: consistent CSS tokens for navigation float, paper surface and transient material; no new animation dependency.

- [ ] **Step 1: Add failing material semantics tests**

```tsx
test('marks transient material for opaque transparency fallback', () => {
  render(<InspectorSurface><span>内容</span></InspectorSurface>);
  expect(screen.getByText('内容').parentElement).toHaveAttribute('data-material', 'transient');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/components/material/DynamicControlSurface.test.tsx src/components/material/InspectorSurface.test.tsx`
Expected: FAIL until material semantics are explicit.

- [ ] **Step 3: Consolidate visual tokens and restrained surfaces**

Define `--surface-sidebar`, `--surface-paper`, `--surface-transient`, `--shadow-navigation`, `--shadow-paper`, `--shadow-transient`, `--accent`, `--text-primary`, `--text-secondary`, and dark-theme counterparts. Remove repeated full-card borders from dashboard sections; keep glass only on toolbar/inspector/drop overlay. Course colors remain small dots/book spines. Ensure main reading column is 62–76 characters wide where prose dominates.

- [ ] **Step 4: Standardize natural motion**

Use GSAP `power3.out` or damped spring-like cubic curves for 220–320ms workspace transitions, 180–240ms drop entry, faster exits, and 0.985–1 press scale. Do not animate width/height/top/left, add looped glow, particles, elastic overshoot or linear easing. With reduced motion, retain only 100ms opacity changes.

- [ ] **Step 5: Run frontend quality gates**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all Vitest tests PASS; TypeScript and ESLint exit 0; Vite production build succeeds with no missing asset warnings.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/components/material src/features/dashboard src/features/problems/ProblemDocument.tsx src/features/review/ReviewReader.tsx
git commit -m "style: refine universal learning workspace"
```

### Task 11: 备份回归、桌面实测与可安装交付

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Create: `docs/verification/2026-08-01-universal-learning-release.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces a versioned NSIS installer and verification record with SHA-256.

- [ ] **Step 1: Run complete automated regression before packaging**

Set the application version to `0.2.0` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, then verify all three values match before testing.

Run: `npm test`
Expected: every frontend test PASS.

Run: `npm run test:rust`
Expected: every Rust test PASS, including v1–v6 migration, backup/restore, duplicate originals and AI credential isolation.

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all exit 0.

- [ ] **Step 2: Build the Windows installer**

Run: `npm run tauri:build -- --target x86_64-pc-windows-gnu`
Expected: release executable and NSIS setup are created under `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/`.

- [ ] **Step 3: Install and execute the packaged app**

Install the new NSIS package over v0.1.0, launch the installed executable, and verify the existing library opens without reset. Test Explorer drag/drop with PNG, PDF, MD and TXT; a mixed supported/unsupported batch; selected and unclassified courses; manual picker fallback; create every course kind; empty state on a clean profile; light/dark mode; reduced motion/transparency; settings focus trap; two domestic Provider connection tests supplied by the user; one custom compatible endpoint; AI consent; per-field accept/edit/reject; question and answer book export; backup and restore.

- [ ] **Step 4: Capture exact verification evidence**

Write `docs/verification/2026-08-01-universal-learning-release.md` with test counts, build command, installed executable path, installer path, installer byte size, SHA-256, schema version 6, and each manual acceptance result. Do not record API Keys or provider response bodies.

- [ ] **Step 5: Commit release evidence**

```bash
git add README.md package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json docs/verification/2026-08-01-universal-learning-release.md
git commit -m "docs: verify universal learning release"
```

- [ ] **Step 6: Final clean-tree check**

Run: `git status --short && git log -12 --oneline`
Expected: no uncommitted product files; commits show each independently testable upgrade stage.

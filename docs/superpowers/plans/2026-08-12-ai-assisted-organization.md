# AI Assisted Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense AI confirmation panel with a progressive two-stage workflow that starts quickly, keeps every send explicit, and safely batch-applies only suggestions for empty fields.

**Architecture:** Keep document ownership, request-generation guards, and provider security checks in `ProblemDocument`. Extract the AI inspector's visual states into `AiReviewInspector`, and centralize sequential version-aware persistence in a small tested helper shared by single and batch acceptance. No backend contract or credential boundary changes.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tauri 2, existing CSS material system, GSAP/CSS spring tokens already in the project.

## Global Constraints

- Every AI request still requires the user to click “开始整理”.
- Question images and course materials remain off by default and require explicit per-request selection.
- At most three same-course material snippets may be sent.
- AI suggestions never write automatically; batch acceptance is limited to currently empty fields.
- Existing fields require an individual “替换{字段}” action.
- Do not add dependencies or change the native AI request shape.
- Preserve Escape dismissal, focus trapping, focus restoration, reduced motion, reduced transparency, and stale-response guards.
- Verify 375×667, 760×520, 1024×600, and 1366×768 without horizontal overflow.

---

### Task 1: Version-aware sequential suggestion persistence

**Files:**
- Create: `src/features/problems/saveAiSuggestionsSequentially.ts`
- Create: `src/features/problems/saveAiSuggestionsSequentially.test.ts`

**Interfaces:**
- Consumes: `AiFieldSuggestion` from `src/lib/tauri.ts`.
- Produces: `saveAiSuggestionsSequentially(suggestions, initialVersion, persist, onSaved)` returning `{ savedSuggestions, remainingSuggestions, error }`.

- [ ] **Step 1: Write failing tests for version advancement and partial failure**

```ts
test('passes each returned version into the next save', async () => {
  const persist = vi.fn()
    .mockResolvedValueOnce({ kind: 'standard_answer', value: '答案', version: 'v2', updatedAt: 't2' })
    .mockResolvedValueOnce({ kind: 'explanation', value: '解析', version: 'v3', updatedAt: 't3' })
  const result = await saveAiSuggestionsSequentially(suggestions, 'v1', persist, vi.fn())
  expect(persist).toHaveBeenNthCalledWith(1, suggestions[0], 'v1')
  expect(persist).toHaveBeenNthCalledWith(2, suggestions[1], 'v2')
  expect(result.remainingSuggestions).toEqual([])
})

test('returns completed and remaining suggestions after the first failure', async () => {
  const persist = vi.fn()
    .mockResolvedValueOnce({ kind: 'standard_answer', value: '答案', version: 'v2', updatedAt: 't2' })
    .mockRejectedValueOnce(new Error('conflict'))
  const result = await saveAiSuggestionsSequentially(suggestions, 'v1', persist, vi.fn())
  expect(result.savedSuggestions).toEqual([suggestions[0]])
  expect(result.remainingSuggestions).toEqual([suggestions[1]])
  expect(result.error).toBeInstanceOf(Error)
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `.\node_modules\.bin\vitest.cmd run src/features/problems/saveAiSuggestionsSequentially.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the sequential helper**

```ts
export async function saveAiSuggestionsSequentially(
  suggestions: AiFieldSuggestion[],
  initialVersion: string,
  persist: (suggestion: AiFieldSuggestion, expectedVersion: string) => Promise<SavedSuggestionField>,
  onSaved: (field: SavedSuggestionField) => void,
): Promise<SaveSuggestionsResult> {
  const savedSuggestions: AiFieldSuggestion[] = []
  let version = initialVersion
  for (let index = 0; index < suggestions.length; index += 1) {
    try {
      const saved = await persist(suggestions[index], version)
      version = saved.version
      savedSuggestions.push(suggestions[index])
      onSaved(saved)
    } catch (error) {
      return { error, remainingSuggestions: suggestions.slice(index), savedSuggestions }
    }
  }
  return { error: null, remainingSuggestions: [], savedSuggestions }
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run src/features/problems/saveAiSuggestionsSequentially.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the helper**

```powershell
git add -- src/features/problems/saveAiSuggestionsSequentially.ts src/features/problems/saveAiSuggestionsSequentially.test.ts
git commit -m "feat: add safe AI suggestion batch persistence"
```

### Task 2: Progressive AI setup and provider readiness states

**Files:**
- Create: `src/features/problems/AiReviewInspector.tsx`
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/problems/problems.test.tsx`

**Interfaces:**
- Produces: `AiReviewStage = 'checking' | 'needs_setup' | 'setup' | 'loading' | 'suggestions'`.
- `AiReviewInspector` is presentational: it receives current stage, provider/model labels, request-scope values, suggestions, error/saving flags, and event callbacks; it performs no Tauri calls.

- [ ] **Step 1: Add failing integration tests for the compact first screen**

```ts
test('opens a compact setup before any AI request', async () => {
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }))
  expect(await screen.findByRole('heading', { name: '整理这道题' })).toBeVisible()
  expect(screen.getByText('题目文字 · 不含题图 · 0 段教材')).toBeVisible()
  expect(screen.getByRole('button', { name: '开始整理' })).toBeEnabled()
  expect(screen.queryByRole('searchbox', { name: '搜索本课程学习资料' })).not.toBeVisible()
  expect(runProblemAnalysis).not.toHaveBeenCalled()
})

test('explains missing setup before the learner chooses to open settings', async () => {
  loadAiProviderState.mockResolvedValue({ providers: [], activeProviderId: null })
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }))
  expect(await screen.findByText('需要先连接 AI')).toBeVisible()
  expect(onOpenAiSettings).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '前往 AI 设置' }))
  expect(onOpenAiSettings).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run the targeted problem tests and verify RED**

Run: `.\node_modules\.bin\vitest.cmd run src/features/problems/problems.test.tsx`

Expected: new copy and readiness assertions fail against the current consent panel.

- [ ] **Step 3: Add the presentational inspector and checking/setup states**

Implement the component shell with the following state-specific output:

```tsx
{stage === 'checking' ? <AiCheckingState /> : null}
{stage === 'needs_setup' ? (
  <AiNeedsSetupState error={error} onOpenSettings={onOpenSettings} onRetry={onRetry} />
) : null}
{stage === 'setup' || stage === 'loading' ? (
  <AiSetupState
    disabled={stage === 'loading'}
    sendSummary={sendSummary}
    onStart={onStart}
    {...setupProps}
  />
) : null}
{stage === 'suggestions' ? <AiSuggestionsState {...suggestionProps} /> : null}
```

In `openAiReview`, set `checking` before loading local provider state. Replace automatic settings navigation with `needs_setup`. Rename the primary action from “仅本次发送” to “开始整理”.

- [ ] **Step 4: Add progressive disclosure for optional evidence**

```tsx
<details className="ai-evidence" open={!hasQuestionText}>
  <summary>添加依据 <span>{evidenceSummary}</span></summary>
  {hasImageAttachment ? <AiImageConsent /> : null}
  <AiMaterialSearch />
  <dl className="ai-scope-details">
    <div><dt>平台</dt><dd>{providerLabel}</dd></div>
    <div><dt>模型</dt><dd>{modelLabel}</dd></div>
    <div><dt>写回方式</dt><dd>生成后逐字段审核</dd></div>
  </dl>
</details>
```

Disable “开始整理” when neither question text nor an explicitly authorized supported image is available. Do not render the complete question text in the default setup screen.

- [ ] **Step 5: Update existing request tests to click “开始整理” and verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run src/features/problems/problems.test.tsx`

Expected: all problem tests pass; native request argument expectations remain unchanged.

- [ ] **Step 6: Commit the progressive setup**

```powershell
git add -- src/features/problems/AiReviewInspector.tsx src/features/problems/ProblemDocument.tsx src/features/problems/problems.test.tsx
git commit -m "feat: streamline AI organization setup"
```

### Task 3: Safe result review and batch acceptance

**Files:**
- Modify: `src/features/problems/AiReviewInspector.tsx`
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/problems/problems.test.tsx`
- Use: `src/features/problems/saveAiSuggestionsSequentially.ts`

**Interfaces:**
- Consumes: sequential persistence helper from Task 1.
- Produces: `acceptSuggestions(targets: AiFieldSuggestion[])`, shared by individual and batch actions.

- [ ] **Step 1: Add failing behavior tests**

```ts
test('batch accepts only suggestions for empty fields', async () => {
  getProblemDocument.mockResolvedValue(documentWithExistingExplanation)
  runProblemAnalysis.mockResolvedValue([
    { kind: 'standard_answer', value: '答案' },
    { kind: 'explanation', value: '新解析' },
  ])
  await openAndRunAi(user)
  await user.click(await screen.findByRole('button', { name: '采纳全部空白字段' }))
  expect(saveProblemField).toHaveBeenCalledTimes(1)
  expect(saveProblemField).toHaveBeenCalledWith(document.id, 'standard_answer', '答案', 'v1')
  expect(screen.getByRole('button', { name: '替换解析' })).toBeVisible()
})

test('keeps unsaved suggestions after a partial batch failure', async () => {
  saveProblemField.mockResolvedValueOnce(savedAnswer).mockRejectedValueOnce(new Error('conflict'))
  await openAndRunAi(user)
  await user.click(await screen.findByRole('button', { name: '采纳全部空白字段' }))
  expect(await screen.findByText('已写入 1 项，剩余 1 项仍保留。')).toBeVisible()
  expect(screen.queryByDisplayValue('答案')).not.toBeInTheDocument()
  expect(screen.getByDisplayValue('解析')).toBeVisible()
})
```

- [ ] **Step 2: Run the problem tests and verify RED**

Run: `.\node_modules\.bin\vitest.cmd run src/features/problems/problems.test.tsx`

Expected: batch action and existing-content labels are missing.

- [ ] **Step 3: Implement shared single/batch acceptance**

```ts
const acceptSuggestions = async (targets: AiFieldSuggestion[]) => {
  setIsSaving(true)
  const result = await saveAiSuggestionsSequentially(
    targets,
    document.version,
    (suggestion, version) => saveProblemField(document.id, suggestion.kind, suggestion.value, version),
    mergeSavedFieldIntoDocument,
  )
  const savedKinds = new Set(result.savedSuggestions.map(({ kind }) => kind))
  setAiSuggestions((current) => current.filter(({ kind }) => !savedKinds.has(kind)))
  if (result.error) setAiError(`已写入 ${result.savedSuggestions.length} 项，剩余 ${result.remainingSuggestions.length} 项仍保留。`)
  setIsSaving(false)
}
```

The batch target is `aiSuggestions.filter(({ kind }) => !fields.get(kind)?.value.trim())`. Individual buttons call the same function with one suggestion. Existing fields use “替换{label}”; empty fields use “采纳{label}”. “拒绝” becomes “忽略”.

- [ ] **Step 4: Add regenerate and completion behavior**

“重新生成” returns to `setup` without clearing mode, image consent, selected material snippets, or search results. When no suggestions remain after a successful save, close the inspector and show `已写入 N 项 AI 建议` beside the trigger.

- [ ] **Step 5: Run the focused helper and problem suites**

Run: `.\node_modules\.bin\vitest.cmd run src/features/problems/saveAiSuggestionsSequentially.test.ts src/features/problems/problems.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Commit result review**

```powershell
git add -- src/features/problems/AiReviewInspector.tsx src/features/problems/ProblemDocument.tsx src/features/problems/problems.test.tsx
git commit -m "feat: add safe batch AI review actions"
```

### Task 4: Visual hierarchy, motion, and compact-window behavior

**Files:**
- Modify: `src/styles/global.css`
- Create: `src/styles/aiReviewStyle.test.ts`

**Interfaces:**
- Consumes: class names from `AiReviewInspector`.
- Produces: responsive single-column setup/results styling and reduced-motion/transparency fallbacks.

- [ ] **Step 1: Write failing CSS contract tests**

```ts
expect(styles).toMatch(/\.ai-send-summary\s*\{[^}]*display:\s*flex/s)
expect(styles).toMatch(/\.ai-evidence\s*>\s*summary\s*\{[^}]*min-height:\s*44px/s)
expect(styles).toMatch(/\.ai-review-loading\s*\{[^}]*min-height:/s)
expect(styles).toMatch(/@media\s*\(max-width:\s*650px\)[\s\S]*\.ai-result-toolbar\s*\{[^}]*grid-template-columns:\s*1fr/s)
expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.ai-review-state/s)
```

- [ ] **Step 2: Run the style test and verify RED**

Run: `.\node_modules\.bin\vitest.cmd run src/styles/aiReviewStyle.test.ts`

Expected: new class contracts are absent.

- [ ] **Step 3: Implement the visual system**

Use one editorial surface with separators rather than nested cards. Add:

- `.ai-send-summary` for the compact scope line.
- `.ai-evidence` for the disclosure group and 44px summary target.
- `.ai-review-loading` for a stable, honest loading state.
- `.ai-result-toolbar` for result count, regenerate, and batch action.
- `.ai-suggestion.has-existing-value` for the overwrite warning.
- `.ai-review-state` with 180–260ms opacity/translate transition using `var(--motion-spring)`.

At 650px and below, stack result actions and mode choices to one column. Preserve the shared dynamic viewport scroll owner from 0.3.2.

- [ ] **Step 4: Add reduced-preference fallbacks**

```css
@media (prefers-reduced-motion: reduce) {
  .ai-review-state { animation: none !important; transform: none !important; }
}

@media (prefers-reduced-transparency: reduce) {
  .ai-evidence, .ai-send-summary { background: var(--paper-muted); backdrop-filter: none; }
}
```

- [ ] **Step 5: Run style and component suites**

Run: `.\node_modules\.bin\vitest.cmd run src/styles/aiReviewStyle.test.ts src/features/problems/problems.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Commit styling**

```powershell
git add -- src/styles/global.css src/styles/aiReviewStyle.test.ts
git commit -m "style: refine AI organization inspector"
```

### Task 5: Full verification and Windows 0.3.3 delivery

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`
- Create: `docs/release/0.3.3.md`
- Create: `docs/verification/2026-08-12-0.3.3-release.md`

**Interfaces:**
- Produces: `release/错题智库_0.3.3_x64-setup.exe` and installed ProductVersion `0.3.3`.

- [ ] **Step 1: Run complete frontend verification**

Run in parallel: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

Expected: zero failures, zero lint warnings, typecheck exit 0, production build exit 0.

- [ ] **Step 2: Run native verification**

Run the existing GNU toolchain command for `cargo test --manifest-path src-tauri/Cargo.toml`.

Expected: all Rust tests pass.

- [ ] **Step 3: Verify the interaction at four viewports**

Open the AI setup and results fixtures or a real local problem and verify 375×667, 760×520, 1024×600, and 1366×768. Confirm the primary action, disclosure, close button, result toolbar, final suggestion, and vertical scrollbar are reachable with no document-level horizontal overflow.

- [ ] **Step 4: Bump version and write release evidence**

Set all application version sources to `0.3.3`. Document the exact test counts, viewport results, installer size, and SHA-256 after the artifact is generated.

- [ ] **Step 5: Build, copy, and hash the installer**

Run: `pnpm tauri build` with the existing GNU environment.

Expected artifact: `src-tauri/target/release/bundle/nsis/错题智库_0.3.3_x64-setup.exe`.

Copy it to both the worktree and main repository `release` directories, then run `Get-FileHash -Algorithm SHA256`.

- [ ] **Step 6: Install and launch-check 0.3.3**

Run the NSIS installer with `/S`. Verify registry DisplayVersion, installed executable ProductVersion/FileVersion, colocated `WebView2Loader.dll`, desktop shortcut target, window title “错题智库”, and a responding process after launch.

- [ ] **Step 7: Commit the release**

Stage only feature and release files; preserve `src-tauri/gen/schemas/capabilities.json` as the user's unrelated change.

```powershell
git commit -m "release: ship AI organization flow 0.3.3"
```

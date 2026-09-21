# README Current Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incomplete README gallery with eight privacy-safe screenshots rendered from the current v0.5.2 application components.

**Architecture:** A Node/Playwright capture script starts Vite, injects deterministic Tauri IPC responses before the page loads, and drives the real UI through its accessible controls. Repository presentation tests enforce the scene inventory, image dimensions, uniqueness, README references, and privacy rules.

**Tech Stack:** React 19, Vite 6, Tauri 2 API bridge, Playwright, Vitest, PNG assets, GitHub Markdown.

## Global Constraints

- Generate exactly eight named 1440×900 PNG screenshots.
- Use only fictional economics course, problem, review, material, and AI configuration data.
- Never read the local SQLite database, Windows Credential Manager, imported files, or API keys.
- Render current production components and styles rather than drawing substitute mockups.
- Preserve the existing release, installation, local-first, security, and promotion copy.

---

### Task 1: Lock the repository presentation contract

**Files:**
- Modify: `src/lib/repositoryPresentation.test.ts`
- Create: `scripts/readme-screenshot-scenes.mjs`

**Interfaces:**
- Produces: `readmeScreenshotScenes`, an ordered array of `{ id, filename, label }` objects consumed by the capture script and tests.

- [ ] **Step 1: Write the failing repository test**

Add assertions for this exact ordered filename list:

```ts
const expected = [
  'overview.png', 'inbox.png', 'problem-detail.png', 'ai-review.png',
  'review.png', 'knowledge.png', 'materials.png', 'ai-settings.png',
];
expect(readmeScreenshotScenes.map(({ filename }) => filename)).toEqual(expected);
for (const filename of expected) {
  expect(readme).toContain(`docs/assets/readme/${filename}`);
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run src/lib/repositoryPresentation.test.ts`
Expected: FAIL because the scene module and new assets do not exist.

- [ ] **Step 3: Add the scene manifest**

Create the ordered array with IDs `overview`, `inbox`, `problem-detail`, `ai-review`, `review`, `knowledge`, `materials`, and `ai-settings`; labels must describe each screen in Chinese without marketing superlatives.

- [ ] **Step 4: Run the manifest assertions**

Run: `pnpm vitest run src/lib/repositoryPresentation.test.ts`
Expected: only the missing README references/assets remain failing.

### Task 2: Build a deterministic current-version capture harness

**Files:**
- Create: `scripts/capture-readme-screenshots.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `readmeScreenshotScenes`.
- Produces: `pnpm capture:readme`, which rewrites all eight PNG files under `docs/assets/readme/`.

- [ ] **Step 1: Add the capture command**

```json
"capture:readme": "node scripts/capture-readme-screenshots.mjs"
```

- [ ] **Step 2: Implement deterministic demo IPC**

Before navigation, install `window.__TAURI_INTERNALS__` with `invoke`, callback registration, metadata, and file URL conversion. `invoke` must return fixed values for courses, dashboard overview, inbox items, problem document, review queue, knowledge graph, materials, material search, provider state, credential presence, AI suggestions, event listeners, updater checks, and plugin store calls; unknown commands must resolve safely without external I/O.

- [ ] **Step 3: Drive the real UI for every scene**

Start Vite on `127.0.0.1` with an automatically selected free port, launch Microsoft Edge at 1440×900, set dark color scheme and reduced motion, then use accessible button/link names to open the required workspaces and dialogs. Capture each scene after its primary heading or region is visible.

- [ ] **Step 4: Generate the assets**

Run: `pnpm capture:readme`
Expected: eight PNG files, each reported as written with width 1440 and height 900.

### Task 3: Rebuild the README visual story

**Files:**
- Modify: `README.md`
- Modify: `docs/marketing/launch-playbook.md`

**Interfaces:**
- Consumes: all eight screenshot filenames.
- Produces: a README gallery ordered by the end-to-end learning workflow.

- [ ] **Step 1: Replace the hero**

Reference `overview.png` once at the top with alt text explaining that it is the populated learning overview.

- [ ] **Step 2: Replace the four-image gallery**

Create four two-column rows: inbox/problem detail, AI review/review reader, knowledge/materials, and AI settings/overview detail. Do not reuse any screenshot elsewhere in the README.

- [ ] **Step 3: Update promotion guidance**

Change the launch checklist to use the eight current screenshots and name the exact workflow order used for launch posts.

- [ ] **Step 4: Run the focused presentation test**

Run: `pnpm vitest run src/lib/repositoryPresentation.test.ts`
Expected: PASS.

### Task 4: Verify every asset and publish

**Files:**
- Verify: `docs/assets/readme/*.png`
- Verify: `README.md`

**Interfaces:**
- Produces: a reviewable Git commit and GitHub pull request.

- [ ] **Step 1: Verify dimensions, uniqueness, and privacy strings**

Run the repository presentation test and compare SHA-256 hashes for all eight PNG files; every hash must be unique. Search README, scripts, and generated image metadata for `C:\\Users`, `api_key`, and `sk-`.

- [ ] **Step 2: Inspect the images visually**

Create a contact sheet and inspect every screenshot for clipping, blank panels, obstructive dialogs, illegible text, inconsistent viewport size, or unexpected personal content.

- [ ] **Step 3: Run the full quality gate**

Run: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
Expected: all commands exit 0.

- [ ] **Step 4: Commit, push, and open a PR**

Commit only the scene manifest, capture script, generated PNGs, README, marketing guide, tests, design, and plan. Push `codex/readme-current-screenshots`, create a pull request to `main`, wait for CI, and merge only after the quality gate passes.

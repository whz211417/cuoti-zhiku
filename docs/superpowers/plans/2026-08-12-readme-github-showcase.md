# README and GitHub Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the public GitHub repository immediately understandable and credible by adding product screenshots, a user-first README, a formal download path, licensing, topics, and a polished v0.3.3 release.

**Architecture:** Keep application code unchanged. Add a small, sanitized screenshot set under `docs/assets/readme/`, restructure `README.md` around user onboarding before developer details, add a root `LICENSE`, and update the existing GitHub repository metadata and Release through `gh`.

**Tech Stack:** Markdown, PNG screenshots captured from the local Vite/Tauri UI, GitHub CLI, Git.

## Global Constraints

- Never include user data, API keys, local database files, or credentials in screenshots or commits.
- Keep the Windows installer as a GitHub Release asset; do not add the binary to normal Git history.
- Preserve the existing `src-tauri/gen/schemas/capabilities.json` user change and do not stage it.
- Keep the repository public and use MIT licensing for the source code.

### Task 1: Capture sanitized product screenshots

**Files:**
- Create: `docs/assets/readme/overview.png`
- Create: `docs/assets/readme/problem-document.png`
- Create: `docs/assets/readme/review.png`
- Create: `docs/assets/readme/knowledge-network.png`
- Create: `docs/assets/readme/ai-review.png`

- [ ] Start a local preview and inspect the actual application UI.
- [ ] Capture only empty/demo-safe views with no personal records or credentials.
- [ ] Verify each image is readable at GitHub README width and has no unrelated desktop content.

### Task 2: Make the README user-first

**Files:**
- Modify: `README.md`

- [ ] Add a one-line product promise, screenshot strip, and Windows Release download button near the top.
- [ ] Add sections for “为什么是本地优先”, “核心流程”, “功能截图”, “下载安装”, and “隐私与安全”.
- [ ] Move developer setup, architecture, validation, and release boundaries below the user-facing sections.
- [ ] Link the v0.3.3 Release and exact SHA-256 without presenting the installer as a source file.

### Task 3: Add license and repository metadata

**Files:**
- Create: `LICENSE`

- [ ] Add the standard MIT license with the project copyright holder set to `whz211417` and year `2026`.
- [ ] Set GitHub topics: `tauri`, `react`, `typescript`, `rust`, `education`, `spaced-repetition`, `local-first`, `obsidian`, `windows`.
- [ ] Update the v0.3.3 Release notes to link back to the user-facing README and document the installer asset.

### Task 4: Validate and publish

- [ ] Check all README image and release links, `git diff --check`, and repository status.
- [ ] Commit only the showcase changes and exclude the unrelated capabilities file.
- [ ] Push `main`, create a `v0.3.4` documentation release only if a new release asset is needed; otherwise update the existing repository and v0.3.3 notes without creating a fake binary release.
- [ ] Verify the public repository, topics, license, README, and Release asset through GitHub API.

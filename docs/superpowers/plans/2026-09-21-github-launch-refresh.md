# GitHub Launch Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public repository into a user-first product page and add a practical, truthful promotion playbook for the Windows release.

**Architecture:** Keep application code and release binaries unchanged. Tighten the repository presentation contract in its existing test, rebuild `README.md` around user conversion and trust, add one focused marketing document, then update GitHub repository metadata through `gh` after the documentation PR is merged.

**Tech Stack:** Markdown, Vitest, GitHub CLI, GitHub Releases.

## Global Constraints

- Use only sanitized screenshots already tracked in `docs/assets/readme/`.
- Link downloads through `https://github.com/whz211417/cuoti-zhiku/releases/latest`.
- Do not claim OCR, mobile support, cloud sync, Windows Authenticode signing, user counts, or download counts.
- Do not post to external communities or message people on the user's behalf.
- Do not modify application code, package versions, release assets, or user data.

---

### Task 1: Strengthen the repository presentation contract

**Files:**
- Modify: `src/lib/repositoryPresentation.test.ts`

**Interfaces:**
- Consumes: repository root `README.md` and `docs/marketing/launch-playbook.md`.
- Produces: automated requirements for the hero image, latest download path, trust language, and promotion playbook.

- [ ] **Step 1: Add failing assertions**

Add assertions that `README.md` contains `docs/assets/readme/local-materials.png`, `拖进来，先保存`, `AI 只做建议`, `releases/latest`, and a link to `docs/marketing/launch-playbook.md`. Assert that the playbook exists and contains `小红书`, `B 站`, `V2EX`, `校园种子用户`, and `Release 下载量`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run src/lib/repositoryPresentation.test.ts`

Expected: FAIL because the refreshed copy and promotion playbook do not exist yet.

- [ ] **Step 3: Commit the red contract with the implementation**

Keep the failing test uncommitted until Tasks 2 and 3 satisfy it, so the branch never contains a deliberately broken commit.

### Task 2: Rebuild the README as a product page

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the verified Latest Release URL and sanitized screenshots under `docs/assets/readme/`.
- Produces: a product-first README that serves students, contributors, and recruiters without duplicating detailed development docs.

- [ ] **Step 1: Rewrite the first viewport**

Place the product name, bilingual one-line promise, prominent latest-download link, release/CI/license badges, and `local-materials.png` hero before long explanations.

- [ ] **Step 2: Add the three product differentiators**

Explain the local-first ingest guarantee, field-by-field AI review, and review/knowledge-network loop in compact prose and tables.

- [ ] **Step 3: Preserve trust boundaries and user routing**

Keep SmartScreen, OCR, AI scope, backup, issue, contribution, and security limitations explicit. Link developers to `docs/development.md` and promoters to `docs/marketing/launch-playbook.md`.

### Task 3: Add the promotion playbook

**Files:**
- Create: `docs/marketing/launch-playbook.md`

**Interfaces:**
- Consumes: the verified v0.5.2 feature set and public GitHub URLs.
- Produces: four-week rollout schedule, ready-to-adapt copy for three platforms, campus beta method, measurement table, and anti-spam rules.

- [ ] **Step 1: Write the four-week launch sequence**

Week 1 recruits 10–20 campus seed users; week 2 publishes one workflow demo; week 3 publishes technical/product retrospectives; week 4 reviews metrics and decides whether to expand.

- [ ] **Step 2: Add platform-specific drafts**

Provide a Xiaohongshu carousel outline, a 60–90 second Bilibili script, and a V2EX builder-story draft. Every draft must lead with the user problem and end with the Latest Release link plus a feedback request.

- [ ] **Step 3: Define honest metrics**

Track unique visitors, release-page clicks, installer downloads, stars, issues, completed first imports, and week-one retention through opt-in user interviews rather than hidden analytics.

### Task 4: Verify, publish, and align GitHub metadata

**Files:**
- Verify: `README.md`
- Verify: `docs/marketing/launch-playbook.md`
- Verify: `src/lib/repositoryPresentation.test.ts`

**Interfaces:**
- Consumes: completed documentation changes.
- Produces: merged PR and matching public repository description, Homepage, and Topics.

- [ ] **Step 1: Run focused and full verification**

Run:

```powershell
pnpm vitest run src/lib/repositoryPresentation.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands exit 0; Vitest reports 259 or more passing tests.

- [ ] **Step 2: Review and commit**

Review for correctness, readability, security, truthful claims, and external-link accuracy. Commit only the README, playbook, presentation test, design, and plan.

- [ ] **Step 3: Push and merge through a PR**

Push `codex/github-showcase`, create a focused documentation PR, wait for CI, review the final diff, and merge only after green checks.

- [ ] **Step 4: Update public repository metadata**

Run `gh repo edit whz211417/cuoti-zhiku` with the approved description, Homepage set to the Latest Release, Issues enabled, and the existing accurate Topics preserved. Read the metadata back through `gh repo view` and compare it with the README.

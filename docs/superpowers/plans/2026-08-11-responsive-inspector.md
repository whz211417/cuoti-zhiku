# Responsive Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every long Inspector dialog vertically reachable and readable at desktop, short-window, and narrow-window sizes.

**Architecture:** Keep `InspectorSurface` as the shared transient material wrapper, but remove third-party layout padding so CSS owns geometry. Make each dialog the single scroll container and apply narrow/short viewport rules in the existing global stylesheet.

**Tech Stack:** React 19, TypeScript, Vitest, CSS, liquid-glass-react, Tauri 2.

## Global Constraints

- Preserve the existing glass look, reduced-transparency fallback, focus trap, Escape dismissal, and 44×44px close target.
- Do not change AI, credential, database, course, or export behavior.
- Do not add dependencies.
- Do not stage `src-tauri/gen/schemas/capabilities.json`.

---

### Task 1: Lock the glass wrapper to application-owned geometry

**Files:**
- Modify: `src/components/material/InspectorSurface.test.tsx`
- Modify: `src/components/material/InspectorSurface.tsx`

**Interfaces:**
- Consumes: `LiquidGlass` property `padding: string`.
- Produces: `InspectorSurface` with zero third-party padding in transparent mode and unchanged solid fallback.

- [ ] **Step 1: Write the failing component test**

Mock `liquid-glass-react`, render `InspectorSurface`, and assert the transparent wrapper receives `padding="0"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run src/components/material/InspectorSurface.test.tsx`

Expected: FAIL because `padding` is missing.

- [ ] **Step 3: Implement the minimal wrapper fix**

Pass `padding="0"` to `LiquidGlass` without changing its visual parameters.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run src/components/material/InspectorSurface.test.tsx`

Expected: both solid fallback and transparent geometry tests pass.

### Task 2: Give long dialogs one bounded scroll owner

**Files:**
- Create: `src/styles/responsiveInspectorStyle.test.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `.inspector-backdrop`, `.inspector-glass`, `.inspector-surface`, `.preferences-inspector`, `.ai-review-inspector`.
- Produces: viewport-bounded dialog geometry and narrow/short responsive rules.

- [ ] **Step 1: Write failing CSS contract tests**

Assert that the stylesheet uses `100dvh`, `overflow-y: auto`, `overscroll-behavior: contain`, `min-width: 0`, a sticky dialog header, and narrow-window single-column rules.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run src/styles/responsiveInspectorStyle.test.ts`

Expected: FAIL because the shared responsive contract is absent.

- [ ] **Step 3: Implement the minimal CSS fix**

Bound the glass wrapper and solid fallback to `calc(100dvh - safe gaps)`, make the dialog section the only vertical scroller, remove horizontal overflow, and add narrow/short viewport rules for padding, sticky header, fields, mode picker, and actions.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run src/styles/responsiveInspectorStyle.test.ts src/components/material/InspectorSurface.test.tsx`

Expected: all responsive Inspector tests pass.

### Task 3: Verify behavior and package the fix

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`
- Create: `docs/release/0.3.2.md`
- Create: `docs/verification/2026-08-11-0.3.2-release.md`

**Interfaces:**
- Consumes: the completed responsive Inspector implementation.
- Produces: tested Windows x64 installer `release/错题智库_0.3.2_x64-setup.exe`.

- [ ] **Step 1: Run full verification**

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the existing GNU/MinGW Rust test command. Expected: zero failures.

- [ ] **Step 2: Perform visual viewport verification**

Open both dialogs and verify 1366×768, 1024×600, 640×720, and 375×667 viewport behavior. Confirm no horizontal clipping and that the final control is reachable.

- [ ] **Step 3: Bump and build version 0.3.2**

Update the four version sources, build the NSIS target with the existing GNU/MinGW environment, and calculate file size and SHA-256.

- [ ] **Step 4: Install and launch the built application**

Install 0.3.2, confirm `cuoti-zhiku.exe` and `WebView2Loader.dll` exist, then launch and verify a responsive “错题智库” window.

- [ ] **Step 5: Commit without user-owned generated changes**

Stage only the responsive fix, tests, release metadata, design and plan. Leave `src-tauri/gen/schemas/capabilities.json` untouched.

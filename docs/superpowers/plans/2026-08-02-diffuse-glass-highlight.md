# Diffuse Glass Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible elliptical pointer spotlight with a restrained, two-layer diffuse reflection that has no recognizable geometric outline.

**Architecture:** Preserve the tested local-pixel pointer pipeline in `DynamicControlSurface` and change only the CSS rendering contract. A focused CSS source regression test locks the two-circle diffuse stack, removal of surface-specific ellipses, lowered maximum opacity, and accessibility fallbacks before the production stylesheet is changed.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Vitest, Vite, Tauri 2

## Global Constraints

- Preserve `--glass-local-x`, `--glass-local-y`, per-frame layout reads, and `requestAnimationFrame` batching.
- Use two offset circular radial gradients with long transparent falloff and blur; no ellipse may remain in sidebar or toolbar pointer-highlight rules.
- Keep the highlight layer at `inset: 0`; do not restore negative inset.
- Cap active navigation-highlight opacity at `0.20`.
- Keep the highlight invisible for `prefers-reduced-motion` and hidden for `prefers-reduced-transparency`.
- Add no runtime dependency and keep application version `0.2.0`.

---

## File Structure

- `src/styles/dynamicGlassStyle.test.ts`: source-level regression contract for the visual CSS rules.
- `src/styles/global.css`: production diffuse-reflection rendering.
- `README.md`: rebuilt installer size and SHA-256.
- `docs/verification/2026-08-02-universal-learning-release.md`: updated test count, visual verification, and artifact evidence.

### Task 1: Lock the diffuse reflection contract

**Files:**
- Create: `src/styles/dynamicGlassStyle.test.ts`
- Test: `src/styles/dynamicGlassStyle.test.ts`

**Interfaces:**
- Consumes: UTF-8 source text from `src/styles/global.css`.
- Produces: regression assertions for two circular layers, no surface ellipses, `inset: 0`, opacity `0.20`, blur, and reduced-motion fallback.

- [ ] **Step 1: Write the failing style test**

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const styles = readFileSync(new URL('./global.css', import.meta.url), 'utf8');
const ruleBody = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};

test('uses a two-layer outline-free diffuse highlight', () => {
  const base = ruleBody('.dynamic-glass-light');
  const navigation = ruleBody('.dynamic-control-surface[data-material="navigation"] .dynamic-glass-light');

  expect(base.match(/radial-gradient\(circle/g)).toHaveLength(2);
  expect(base).toContain('filter: blur(14px)');
  expect(base).toContain('inset: 0');
  expect(navigation).toContain('opacity: calc(var(--glass-active) * .2)');
});

test('does not draw surface-specific ellipse spotlights', () => {
  expect(ruleBody('.sidebar .dynamic-glass-light')).not.toContain('ellipse');
  expect(ruleBody('.toolbar .dynamic-glass-light')).not.toContain('ellipse');
});

test('keeps the pointer highlight hidden for reduced motion', () => {
  expect(styles).toMatch(/prefers-reduced-motion:[\s\S]*?dynamic-glass-light[^}]*opacity:\s*0\s*!important/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/styles/dynamicGlassStyle.test.ts`

Expected: FAIL because the current base rule has one circle, the sidebar and toolbar contain ellipses, blur is absent, and active opacity is `0.32`.

### Task 2: Implement the selected diffuse material

**Files:**
- Modify: `src/styles/global.css`
- Test: `src/styles/dynamicGlassStyle.test.ts`

**Interfaces:**
- Consumes: `--glass-local-x`, `--glass-local-y`, and `--glass-active` from `DynamicControlSurface`.
- Produces: two overlapping blurred circular gradients centered near the local pointer.

- [ ] **Step 1: Replace the base spotlight rule**

```css
.dynamic-glass-light {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: calc(var(--glass-active) * .18);
  background:
    radial-gradient(circle 54px at calc(var(--glass-local-x) - 16px) calc(var(--glass-local-y) - 12px), rgb(255 255 255 / .34), rgb(255 255 255 / .08) 42%, transparent 82%),
    radial-gradient(circle 96px at calc(var(--glass-local-x) + 22px) calc(var(--glass-local-y) + 14px), rgb(135 188 255 / .13), rgb(153 202 255 / .045) 48%, transparent 84%);
  filter: blur(14px) saturate(118%);
  transition: opacity 240ms var(--motion-spring);
  will-change: opacity;
}
```

- [ ] **Step 2: Unify sidebar and toolbar rendering**

```css
.sidebar .dynamic-glass-light { opacity: calc(var(--glass-active) * .16); }
.toolbar .dynamic-glass-light { opacity: calc(var(--glass-active) * .2); }
```

Keep the later navigation selector at `opacity: calc(var(--glass-active) * .2)` only if needed for cascade consistency; it must not replace the two-layer background. Preserve both accessibility media-query fallbacks at opacity `0`.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/styles/dynamicGlassStyle.test.ts src/components/material/DynamicControlSurface.test.tsx`

Expected: 7 tests pass across 2 files.

- [ ] **Step 4: Run static checks**

Run:

```powershell
rg -n "\.sidebar \.dynamic-glass-light.*ellipse|\.toolbar \.dynamic-glass-light.*ellipse" src/styles/global.css
git diff --check
```

Expected: `rg` returns no matches; `git diff --check` reports no whitespace errors.

### Task 3: Full verification and Windows delivery

**Files:**
- Modify: `README.md`
- Modify: `docs/verification/2026-08-02-universal-learning-release.md`

**Interfaces:**
- Consumes: verified diffuse highlight source and unchanged Tauri backend.
- Produces: rebuilt `release/错题智库_0.2.0_x64-setup.exe` and exact release evidence.

- [ ] **Step 1: Run full frontend verification**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: all commands exit 0; total frontend test count increases by three.

- [ ] **Step 2: Verify the live local page**

Move the pointer across sidebar and toolbar in the local browser preview. Read computed styles and capture a screenshot. Confirm the host and highlight layers have matching dimensions, two circular gradients are present, the active opacity is no greater than `0.20`, and no geometric boundary is visually recognizable.

- [ ] **Step 3: Build and fingerprint the Windows installer**

Run:

```powershell
$env:RUSTUP_HOME='C:\tmp\rustup-home'
$env:CARGO_HOME='C:\tmp\cargo-home'
$env:RUSTUP_TOOLCHAIN='stable-x86_64-pc-windows-gnu'
$env:Path='C:\tmp\w64devkit\w64devkit\bin;' + $env:Path
npm.cmd run tauri:build -- --target x86_64-pc-windows-gnu
Copy-Item -LiteralPath 'src-tauri\target\x86_64-pc-windows-gnu\release\bundle\nsis\错题智库_0.2.0_x64-setup.exe' -Destination 'release\错题智库_0.2.0_x64-setup.exe' -Force
Get-Item -LiteralPath 'release\错题智库_0.2.0_x64-setup.exe' | Select-Object Length
Get-FileHash -LiteralPath 'release\错题智库_0.2.0_x64-setup.exe' -Algorithm SHA256
```

Expected: NSIS build succeeds and the copied artifact reports a non-zero size and SHA-256.

- [ ] **Step 4: Update evidence and commit**

Record the exact new test count, visual verification, installer byte size, and SHA-256 in `README.md` and `docs/verification/2026-08-02-universal-learning-release.md`.

Run:

```powershell
git add docs/superpowers/plans/2026-08-02-diffuse-glass-highlight.md src/styles/dynamicGlassStyle.test.ts src/styles/global.css README.md docs/verification/2026-08-02-universal-learning-release.md
git commit -m "fix: soften pointer highlight into diffuse glass light"
```

Expected: commit succeeds; the pre-existing generated `src-tauri/gen/schemas/capabilities.json` modification remains unstaged.

## Self-Review

- Spec coverage: visual outline, unified optical language, opacity cap, coordinate preservation, performance, accessibility, tests, live verification, and packaging are all mapped to tasks.
- Placeholder scan: no deferred placeholders or ambiguous implementation instructions remain.
- Type consistency: CSS variable names remain `--glass-local-x`, `--glass-local-y`, and `--glass-active` throughout.

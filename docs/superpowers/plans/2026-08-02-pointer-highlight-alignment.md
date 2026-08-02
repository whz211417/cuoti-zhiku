# Pointer Highlight Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the navigation glass highlight centered under the pointer without producing an oversized vertical light band.

**Architecture:** Convert viewport pointer coordinates into clamped local pixel coordinates once per animation frame and write them directly to CSS custom properties. Render the highlight on a same-size overlay with fixed pixel radii that vary by host surface, while retaining static reduced-motion and reduced-transparency fallbacks.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Vitest, Testing Library, Tauri 2

## Global Constraints

- Do not change navigation layout, study workflows, AI behavior, or persisted data.
- Keep one `requestAnimationFrame` update for a burst of pointer events.
- Re-read `getBoundingClientRect()` on every executed animation frame so scrolling, resizing, and layout changes cannot leave stale coordinates.
- Respect reduced motion and reduced transparency preferences.
- Preserve the existing Tauri app version `0.2.0` and rebuild its Windows NSIS installer.

---

## File Structure

- `src/components/material/dynamicControlMath.ts`: pure viewport-to-local coordinate conversion.
- `src/components/material/DynamicControlSurface.tsx`: animation-frame scheduling and CSS variable updates.
- `src/components/material/DynamicControlSurface.test.tsx`: coordinate, batching, stale-layout, leave, and accessibility-preference regression coverage.
- `src/styles/global.css`: same-size spotlight rendering and surface-specific light shapes.
- `README.md`: installer checksum and size after packaging.
- `docs/verification/2026-08-02-universal-learning-release.md`: release verification evidence for the rebuilt artifact.

### Task 1: Local pixel coordinate contract

**Files:**
- Modify: `src/components/material/dynamicControlMath.ts`
- Modify: `src/components/material/DynamicControlSurface.test.tsx`

**Interfaces:**
- Consumes: `{ left, top, width, height }`, `clientX`, and `clientY`.
- Produces: `localPointerPosition(rect, clientX, clientY): { x: number; y: number }`, clamped to surface pixel bounds.

- [ ] **Step 1: Write the failing coordinate tests**

```tsx
expect(localPointerPosition({ left: 20, top: 10, width: 200, height: 100 }, 120, 60))
  .toEqual({ x: 100, y: 50 });
expect(localPointerPosition({ left: 20, top: 10, width: 200, height: 100 }, -50, 500))
  .toEqual({ x: 0, y: 100 });
expect(localPointerPosition({ left: 20, top: 10, width: 0, height: 0 }, 120, 60))
  .toEqual({ x: 0, y: 0 });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/components/material/DynamicControlSurface.test.tsx`

Expected: FAIL because `localPointerPosition` is not exported.

- [ ] **Step 3: Implement the local pixel helper**

```ts
type PointerRect = Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;

export function localPointerPosition(rect: PointerRect, clientX: number, clientY: number) {
  const clamp = (value: number, maximum: number) => Math.min(maximum, Math.max(0, value));
  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    x: rect.width > 0 ? round(clamp(clientX - rect.left, rect.width)) : 0,
    y: rect.height > 0 ? round(clamp(clientY - rect.top, rect.height)) : 0,
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/components/material/DynamicControlSurface.test.tsx`

Expected: coordinate tests pass; component assertions may remain red until Task 2.

### Task 2: Frame-accurate material updates

**Files:**
- Modify: `src/components/material/DynamicControlSurface.tsx`
- Modify: `src/components/material/DynamicControlSurface.test.tsx`

**Interfaces:**
- Consumes: `localPointerPosition` and the latest pointer event stored in `pointerRef`.
- Produces: `--glass-local-x`, `--glass-local-y`, and `--glass-active` on the host element.

- [ ] **Step 1: Write failing component tests**

```tsx
expect(surface.style.getPropertyValue('--glass-local-x')).toBe('100px');
expect(surface.style.getPropertyValue('--glass-local-y')).toBe('50px');

rectSpy.mockReturnValueOnce(firstRect).mockReturnValueOnce(secondRect);
fireEvent.pointerMove(surface, { clientX: 100, clientY: 50 });
pendingFrame?.(0);
fireEvent.pointerMove(surface, { clientX: 140, clientY: 70 });
pendingFrame?.(16);
expect(rectSpy).toHaveBeenCalledTimes(2);
expect(surface.style.getPropertyValue('--glass-local-x')).toBe('40px');
expect(surface.style.getPropertyValue('--glass-local-y')).toBe('20px');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/components/material/DynamicControlSurface.test.tsx`

Expected: FAIL because the component still writes percentage and shift variables and reuses a cached rectangle.

- [ ] **Step 3: Implement local pixel CSS variables**

```tsx
type MaterialStyle = CSSProperties & {
  '--glass-active': number;
  '--glass-local-x': string;
  '--glass-local-y': string;
};

const centerMaterialStyle: MaterialStyle = {
  '--glass-active': 0,
  '--glass-local-x': '50%',
  '--glass-local-y': '0px',
};

const updateMaterial = (x: number | string, y: number | string, active: number) => {
  const surface = surfaceRef.current;
  if (!surface) return;
  surface.style.setProperty('--glass-local-x', typeof x === 'number' ? `${x}px` : x);
  surface.style.setProperty('--glass-local-y', typeof y === 'number' ? `${y}px` : y);
  surface.style.setProperty('--glass-active', `${active}`);
};
```

Inside each executed animation frame, call `pointer.target.getBoundingClientRect()` directly, convert with `localPointerPosition`, and call `updateMaterial(point.x, point.y, 1)`. Remove `rectRef` and all shift variables. On leave call `updateMaterial('50%', '0px', 0)`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/components/material/DynamicControlSurface.test.tsx`

Expected: all coordinate, batching, fresh-rectangle, leave, and static-preference tests pass.

### Task 3: Same-size restrained spotlight

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `--glass-local-x`, `--glass-local-y`, and `--glass-active`.
- Produces: a clipped local spotlight that is wide and shallow in the toolbar and narrower in the sidebar.

- [ ] **Step 1: Replace enlarged light layers**

```css
.dynamic-glass-light {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: calc(var(--glass-active) * .28);
  background: radial-gradient(circle 110px at var(--glass-local-x) var(--glass-local-y), rgb(255 255 255 / .82), rgb(196 224 255 / .15) 45%, transparent 74%);
  transition: opacity 220ms var(--motion-spring);
  will-change: opacity;
}

.sidebar .dynamic-glass-light {
  inset: 0;
  background: radial-gradient(ellipse 90px 150px at var(--glass-local-x) var(--glass-local-y), rgb(255 255 255 / .72), rgb(190 220 255 / .14) 45%, transparent 74%);
}

.toolbar .dynamic-glass-light {
  inset: 0;
  background: radial-gradient(ellipse 180px 74px at var(--glass-local-x) var(--glass-local-y), rgb(255 255 255 / .84), rgb(190 222 255 / .16) 44%, transparent 74%);
}
```

Update the later navigation-material override so it controls opacity and transition only and does not replace the surface-specific gradient. In reduced-motion mode, keep the light invisible unless the component is active; in reduced-transparency mode, continue hiding it.

- [ ] **Step 2: Search for obsolete CSS variables**

Run: `rg "glass-(x|y|shift)" src`

Expected: no matches.

### Task 4: Verification and Windows artifact

**Files:**
- Modify: `README.md`
- Modify: `docs/verification/2026-08-02-universal-learning-release.md`

**Interfaces:**
- Consumes: verified production frontend and Tauri project.
- Produces: updated `release/错题智库_0.2.0_x64-setup.exe` with recorded size and SHA-256.

- [ ] **Step 1: Run focused and full frontend verification**

Run:

```powershell
npm.cmd test -- src/components/material/DynamicControlSurface.test.tsx
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: every command exits 0.

- [ ] **Step 2: Build the Windows installer**

Run:

```powershell
$env:RUSTUP_HOME='C:\tmp\rustup-home'
$env:CARGO_HOME='C:\tmp\cargo-home'
$env:RUSTUP_TOOLCHAIN='stable-x86_64-pc-windows-gnu'
$env:Path='C:\tmp\w64devkit\w64devkit\bin;' + $env:Path
npm.cmd run tauri:build -- --target x86_64-pc-windows-gnu
```

Expected: Tauri produces an NSIS installer for version `0.2.0`.

- [ ] **Step 3: Copy and fingerprint the installer**

Run:

```powershell
Copy-Item -LiteralPath 'src-tauri\target\x86_64-pc-windows-gnu\release\bundle\nsis\错题智库_0.2.0_x64-setup.exe' -Destination 'release\错题智库_0.2.0_x64-setup.exe' -Force
Get-Item 'release\错题智库_0.2.0_x64-setup.exe' | Select-Object Length
Get-FileHash 'release\错题智库_0.2.0_x64-setup.exe' -Algorithm SHA256
```

Expected: file exists, has a non-zero size, and reports a SHA-256 digest.

- [ ] **Step 4: Record evidence and commit**

Update `README.md` and `docs/verification/2026-08-02-universal-learning-release.md` with the exact new byte size, checksum, commands, and pass totals. Stage only the intended source, test, CSS, plan, README, and verification files; do not stage generated `src-tauri/gen/schemas/capabilities.json`.

Run:

```powershell
git add docs/superpowers/plans/2026-08-02-pointer-highlight-alignment.md src/components/material/dynamicControlMath.ts src/components/material/DynamicControlSurface.tsx src/components/material/DynamicControlSurface.test.tsx src/styles/global.css README.md docs/verification/2026-08-02-universal-learning-release.md
git commit -m "fix: align dynamic glass highlight with pointer"
```

Expected: commit succeeds and `git status --short` shows only the pre-existing generated capability schema modification.

## Self-Review

- Spec coverage: local pixels, clamping, zero size, latest pointer batching, fresh rectangle per frame, leave reset, surface-specific spotlights, accessibility fallbacks, full verification, and installer rebuild are all mapped above.
- Placeholder scan: no deferred placeholders or unspecified error-handling steps remain.
- Type consistency: `localPointerPosition`, `--glass-local-x`, and `--glass-local-y` use the same names in tests, implementation, and CSS.

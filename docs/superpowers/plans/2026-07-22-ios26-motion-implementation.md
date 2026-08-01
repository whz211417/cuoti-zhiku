# iOS 26 风格动态材质 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为错题智库加入受约束的动态材质、空间切换与辅助功能降级，同时维持学习内容页的静态可读性。

**Architecture:** `App` 管理工作区与浮层状态。新增可复用的材质偏好检测和浮层表面组件；GSAP 只编排工作区级别的进出场，CSS 管理微交互和媒体查询降级。

**Tech Stack:** React 19、TypeScript、GSAP + `@gsap/react`、`liquid-glass-react`、Vitest、CSS media queries。

## Global Constraints

- 主学习内容层必须保持实色；玻璃仅可用于控制、导航和短暂浮层。
- 动画只使用 opacity、transform 或 filter，时长为 150–300ms。
- 透明度降低时必须呈现实色；动态效果降低时不能有位移、缩放、弹性或连续鼠标跟随。
- 图标按钮必须保留中文可访问名称、可见键盘焦点和关闭路径。
- 禁止彩虹色散、循环漂浮、全屏玻璃和布局属性动画。

---

### Task 1: Extract accessibility-aware material preferences

**Files:**
- Create: `src/lib/preferences.ts`
- Create: `src/lib/preferences.test.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `getMotionPreferences(): { reduceMotion: boolean; reduceTransparency: boolean }`
- Consumes: browser `matchMedia`; tests without it receive both values as `false`.

- [ ] **Step 1: Write the failing test**

```ts
import { getMotionPreferences } from './preferences';

test('reads accessibility media preferences when matchMedia is available', () => {
  window.matchMedia = vi.fn((query) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
  expect(getMotionPreferences()).toEqual({ reduceMotion: true, reduceTransparency: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\node_modules\.bin\vitest.CMD run src/lib/preferences.test.ts`

Expected: FAIL because `preferences.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type MotionPreferences = { reduceMotion: boolean; reduceTransparency: boolean };

export function getMotionPreferences(): MotionPreferences {
  const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;
  return { reduceMotion: matches('(prefers-reduced-motion: reduce)'), reduceTransparency: matches('(prefers-reduced-transparency: reduce)') };
}
```

- [ ] **Step 4: Use the helper in `App.tsx`**

Replace inline `matchMedia` checks in `InspectorSurface` and the GSAP transition with `getMotionPreferences()`. The material component renders a solid `.inspector-surface.is-solid` when `reduceTransparency` is true, and GSAP returns before creating a tween when `reduceMotion` is true.

- [ ] **Step 5: Run test to verify it passes**

Run: `.\node_modules\.bin\vitest.CMD run src/lib/preferences.test.ts src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/preferences.ts src/lib/preferences.test.ts src/app/App.tsx
git commit -m "feat: respect motion and transparency preferences"
```

### Task 2: Add a single visual material boundary for transient inspectors

**Files:**
- Create: `src/components/material/InspectorSurface.tsx`
- Create: `src/components/material/InspectorSurface.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `InspectorSurface({ children }: { children: ReactNode }): JSX.Element`
- Consumes: `getMotionPreferences()` from `src/lib/preferences.ts` and default `LiquidGlass` export from `liquid-glass-react`.

- [ ] **Step 1: Write the failing test**

```tsx
test('uses a solid surface when transparency is reduced', () => {
  vi.mock('../../lib/preferences', () => ({ getMotionPreferences: () => ({ reduceMotion: false, reduceTransparency: true }) }));
  render(<InspectorSurface><p>内容</p></InspectorSurface>);
  expect(screen.getByText('内容').parentElement).toHaveClass('is-solid');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\node_modules\.bin\vitest.CMD run src/components/material/InspectorSurface.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function InspectorSurface({ children }: { children: ReactNode }) {
  if (getMotionPreferences().reduceTransparency) return <div className="inspector-surface is-solid">{children}</div>;
  return <LiquidGlass aberrationIntensity={0} blurAmount={0.055} cornerRadius={20} displacementScale={18} elasticity={0.09} mode="standard" overLight saturation={108}><div className="inspector-surface">{children}</div></LiquidGlass>;
}
```

- [ ] **Step 4: Move the existing inline surface from `App.tsx`**

Import `InspectorSurface` in `App.tsx`; delete its local definition. Preserve the preferences dialog role, title and close button unchanged.

- [ ] **Step 5: Restrict CSS to the material boundary**

Keep `backdrop-filter` only on `.inspector-backdrop`; keep `.inspector-surface` as the sole liquid-glass child. Ensure the `prefers-reduced-transparency` media query removes backdrop blur and makes that surface `var(--paper)`.

- [ ] **Step 6: Run tests and build**

Run: `pnpm test; pnpm build; pnpm lint`

Expected: all tests pass, TypeScript build succeeds, ESLint produces no warnings.

- [ ] **Step 7: Commit**

```powershell
git add src/components/material/InspectorSurface.tsx src/components/material/InspectorSurface.test.tsx src/app/App.tsx src/styles/global.css
git commit -m "feat: isolate transient glass material"
```

### Task 3: Refine workspace transition choreography

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `getMotionPreferences()` and existing `workspace` / `selectedProblemId` state.
- Produces: no new public API; the workbench content container transitions on workspace or selected-problem changes.

- [ ] **Step 1: Write the failing test**

```tsx
test('returns to the inbox from the focused review workspace', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '今日复习' }));
  await user.click(screen.getByRole('button', { name: '收件箱 本地' }));
  expect(screen.getByRole('heading', { name: '收件箱' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\node_modules\.bin\vitest.CMD run src/app/App.test.tsx`

Expected: FAIL if the navigation control name or workspace reset behavior is not yet preserved.

- [ ] **Step 3: Implement the bounded GSAP transition**

Use `useGSAP` with dependencies `[workspace, selectedProblemId]`. When motion is enabled, animate the content container from `{ opacity: 0, y: 5 }` to `{ opacity: 1, y: 0 }` with `duration: 0.3`, `ease: 'power3.out'`, `clearProps: 'transform'`, and `revertOnUpdate: true`. Do not add pointer tracking or looping animations.

- [ ] **Step 4: Tighten micro-interaction CSS**

Keep press feedback as `scale(.98)`, add no positional hover movement to navigation rows, and use 150ms transitions for color/background. Keep `.primary-action` and `.toolbar-button` as explicit pressable surfaces.

- [ ] **Step 5: Run verification**

Run: `pnpm test; pnpm build; pnpm lint`

Expected: all tests pass; build produces `dist/` successfully; lint exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/app/App.tsx src/app/App.test.tsx src/styles/global.css
git commit -m "feat: refine restrained workspace motion"
```

# 沉浸式指针 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不牺牲可访问性或输入体验的前提下，为桌面应用提供主题自适应的自定义指针和聚光。

**Architecture:** App 挂载一个独立的 `ImmersiveCursor`。它使用 pointer 事件和 requestAnimationFrame 写入自身 CSS variables；样式负责主题色、控件形态和 reduced-motion fallback。现有局部材质继续独立工作。

**Tech Stack:** React 19、TypeScript、CSS、Vitest、Testing Library。

## Global Constraints

- 不引入新依赖。
- 仅在 `(hover: hover) and (pointer: fine)` 的环境启用。
- 只使用 transform、opacity 与 CSS variables 作为高频动画属性。
- 自定义指针不得覆盖文本输入、焦点或系统窗口控制。

---

### Task 1: 建立可测试的指针目标判定

**Files:**
- Create: `src/components/cursor/cursorTarget.ts`
- Create: `src/components/cursor/cursorTarget.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
expect(cursorModeForTarget(button)).toBe('control');
expect(cursorModeForTarget(input)).toBe('native');
```

- [ ] **Step 2: 运行失败测试**

Run: `npm.cmd test -- --run src/components/cursor/cursorTarget.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 3: 实现最小判定函数**

```ts
export type CursorMode = 'default' | 'control' | 'native';
export function cursorModeForTarget(target: EventTarget | null): CursorMode { /* closest-based classification */ }
```

- [ ] **Step 4: 运行通过测试**

Run: `npm.cmd test -- --run src/components/cursor/cursorTarget.test.ts`
Expected: PASS.

### Task 2: 实现全局指针层

**Files:**
- Create: `src/components/cursor/ImmersiveCursor.tsx`
- Create: `src/components/cursor/ImmersiveCursor.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
render(<ImmersiveCursor />);
fireEvent.pointerMove(window, { clientX: 120, clientY: 64, pointerType: 'mouse' });
expect(screen.getByTestId('immersive-cursor')).toHaveStyle('--cursor-x: 120px');
```

- [ ] **Step 2: 运行失败测试**

Run: `npm.cmd test -- --run src/components/cursor/ImmersiveCursor.test.tsx`
Expected: FAIL because component does not exist.

- [ ] **Step 3: 实现 rAF 指针层并挂载**

```tsx
<div aria-hidden="true" className="immersive-cursor" data-testid="immersive-cursor" />
```

处理 `pointermove`、`pointerdown`、`pointerleave`，按 mode 设置 data attribute，并在 disabled preference 下不写样式。

- [ ] **Step 4: 运行通过测试**

Run: `npm.cmd test -- --run src/components/cursor/ImmersiveCursor.test.tsx`
Expected: PASS.

### Task 3: 编写主题、输入回退与动效样式

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/styles/dynamicGlassStyle.test.ts`

- [ ] **Step 1: 写失败样式测试**

```ts
expect(styles).toContain('.immersive-cursor');
expect(styles).toMatch(/prefers-color-scheme: dark[\s\S]*--cursor-halo/);
expect(styles).toMatch(/prefers-reduced-motion[\s\S]*immersive-cursor[^}]*display:\s*none/);
```

- [ ] **Step 2: 运行失败测试**

Run: `npm.cmd test -- --run src/styles/dynamicGlassStyle.test.ts`
Expected: FAIL because global cursor rules are absent.

- [ ] **Step 3: 实现 CSS**

为 `.immersive-cursor` 添加固定层、主题变量、control 形态和按下回馈；使用 media query 隐藏层并恢复原生 cursor；为局部玻璃高光建立浅/深主题变量。

- [ ] **Step 4: 运行通过测试**

Run: `npm.cmd test -- --run src/styles/dynamicGlassStyle.test.ts`
Expected: PASS.

### Task 4: 回归验证与 Windows 打包

**Files:**
- Verify: `src/components/cursor/*.test.tsx`
- Verify: `src/styles/dynamicGlassStyle.test.ts`
- Verify: `src/app/App.test.tsx`

- [ ] **Step 1: 运行完整验证**

Run: `npm.cmd run typecheck; npm.cmd test; npm.cmd run build`
Expected: exit 0.

- [ ] **Step 2: 运行 Rust 编译验证**

Run: `npm.cmd run test:rust`
Expected: exit 0.

- [ ] **Step 3: 生成安装包**

Run: `node_modules\\.bin\\tauri.CMD build --target x86_64-pc-windows-gnu`
Expected: `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/` 中产生安装包。

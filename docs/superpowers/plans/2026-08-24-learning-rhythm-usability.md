# 学习节奏与操作效率 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让总览提供唯一、可继续的学习下一步，并让复习页通过安全快捷键与会话进度减少鼠标操作。

**Architecture:** 仅派生现有前端状态，不新增 Rust 命令、数据库字段或网络请求。`TodayFocus` 从 `DashboardOverview` 生成路径；`ReviewReader` 显示进度并处理受保护键盘操作；`App` 传递已有复习会话位置。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Tauri 2、现有 CSS 自定义属性。

## Global Constraints

- 不修改 `src-tauri/`、数据库迁移、间隔重复算法或 AI 请求范围。
- 题目必须先主动揭示答案；评分保存中或失败时不得通过键盘推进。
- 快捷键只在非可编辑目标、无修饰键、非重复按键时触发。
- 复用现有 `--motion-fast`、`--motion-spring` 和 reduced-motion fallback，不增加依赖。
- 仅暂存本计划列出的文件，不提交工作区已有 AI/Obsidian 改动。

---

### Task 1: 今日路径派生与总览入口

**Files:**
- Modify: `src/features/dashboard/TodayFocus.tsx`
- Modify: `src/features/dashboard/LearningDashboard.tsx`
- Modify: `src/features/dashboard/dashboard.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `DashboardOverview.dueReviewCount`、`pendingInboxCount`、`recentProblems`。
- Produces: `buildTodayPath(overview)`，返回唯一主操作 `review | inbox | resume | ingest` 与三项展示步骤。

- [x] 写测试：无待复习、无待整理、有 `recentProblems[0]` 时，总览显示“继续上次题目”，点击后调用 `onOpenProblem(problem.id)`；无最近题目时保持“投进题目”；渲染 `aria-label="今日路径"` 的列表。
- [x] 运行 `npm.cmd test -- --run src/features/dashboard/dashboard.test.tsx`，预期因没有 resume 动作与路径列表失败。
- [x] 实现 `buildTodayPath` 纯函数。优先级固定为到期复习、待整理、最近题目、投进题目；每项输出 `label`、`detail`、`state: 'ready' | 'waiting' | 'done'`。`TodayFocus` 接收 `onOpenProblem`，resume 只打开第一条最近题目。
- [x] 为 `.dashboard-learning-path` 添加三段低对比度路径：用图标、数量和文本而非单纯颜色表达；宽屏三列、窄屏单列；路径条目不移动，主按钮沿用现有轻量 hover。
- [x] 再运行同一测试，预期 PASS；执行 `git add src/features/dashboard/TodayFocus.tsx src/features/dashboard/LearningDashboard.tsx src/features/dashboard/dashboard.test.tsx src/styles/global.css` 与 `git commit -m "feat: clarify the next learning action"`。

### Task 2: 专注复习进度与安全键盘操作

**Files:**
- Modify: `src/features/review/ReviewReader.tsx`
- Modify: `src/features/review/review.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: 新增可选 `ReviewReaderProps.position?: number`、`total?: number`；`App` 现有 `reviewSession.initialCount`、`completed`。
- Produces: 进度文字/`role="progressbar"` 与键盘等价操作；原有 `onGrade` 不变。

- [x] 写测试：`position={2}`、`total={6}` 时显示“第 2 / 6 道”；`Space` 揭示答案，随后 `3` 调用 `onGrade('familiar')`。输入元素聚焦、Ctrl/Meta/Alt、重复按键、`isGrading` 与卸载后均不得触发动作。
- [x] 运行 `npm.cmd test -- --run src/features/review/review.test.tsx`，预期因无进度和 `keydown` 监听失败。
- [x] 实现 `isEditableTarget`，覆盖 input、textarea、select、contenteditable。通过 refs 保存最新答案可见状态、保存状态和评分回调；单个 effect 注册/清理 `window` 监听。仅 `event.code === 'Space' && !visible` 时 reveal；仅 visible、非保存时映射 `1/2/3/4` 至 forgot/hard/familiar/mastered；每次命中均 `preventDefault()`。
- [x] 在 `App.tsx` 向 `ReviewReader` 传 `position={reviewSession ? reviewSession.completed + 1 : undefined}` 与 `total={reviewSession?.initialCount}`。在 CSS 中添加低对比度进度条与快捷键提示；在 `prefers-reduced-motion: reduce` 下禁用进度条过渡。
- [x] 运行 `npm.cmd test -- --run src/features/review/review.test.tsx src/app/App.test.tsx`，预期 PASS；执行 `git add src/features/review/ReviewReader.tsx src/features/review/review.test.tsx src/app/App.tsx src/styles/global.css` 与 `git commit -m "feat: streamline focused review controls"`。

### Task 3: 整体验证与记录

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-learning-rhythm-usability.md`

- [x] 运行 `npm.cmd run lint`、`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`；全部必须以 exit code 0 结束。
- [x] 复查小屏 CSS 和 reduced-motion 分支；确认没有新增 backdrop-filter、无限动画、自动播放或全局快捷键。
- [x] 把本计划复选框标为 `[x]`，执行 `git add docs/superpowers/plans/2026-08-24-learning-rhythm-usability.md` 与 `git commit -m "docs: record learning rhythm verification"`。

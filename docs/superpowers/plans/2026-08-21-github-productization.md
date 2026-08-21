# GitHub 产品化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把错题智库仓库升级为可下载、可理解、可反馈的公开产品入口。

**Architecture:** README 承担用户转化；`docs/` 承担维护细节；`.github/` 提供反馈与持续验证；GitHub Release 承担唯一正式安装包分发。

**Tech Stack:** Markdown、GitHub Actions、GitHub Releases、pnpm、Vitest。

## Global Constraints

- 只描述已经实现并验证的 Windows、本地优先、可审核 AI 与 Obsidian 功能。
- 不提交 `release/*.exe`、API Key、数据库或测试资料。
- Release 安装包必须给出 SHA-256，并与标签 `v0.4.0` 匹配。

---

### Task 1: 重写用户 README 与版本文档

**Files:**
- Modify: `README.md`
- Modify: `docs/release/windows-installation.md`
- Create: `docs/release/0.4.0.md`

- [ ] 写出产品优先 README，保留四张真实截图、下载按钮、隐私边界、功能矩阵与开发者链接。
- [ ] 将安装文件名、大小、SHA-256 与发布标签升级至 `v0.4.0`。
- [ ] 运行 `pnpm test -- --run src/lib/releasePackaging.test.ts`，确认发布约束未回归。

### Task 2: 建立贡献与验证入口

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/workflows/verify.yml`

- [ ] 使用结构化模板收集可复现信息，并明确不得附带题目原件或 API Key。
- [ ] CI 在 push/PR 执行 `pnpm install --frozen-lockfile`、lint、test、build；不假装 Windows 安装包在 Linux CI 中已验证。
- [ ] 运行 YAML/Markdown 的本地结构检查与完整前端验证。

### Task 3: 发布 GitHub 远端状态

**Files:**
- Verify: `release/错题智库_0.4.0_x64-setup.exe`

- [ ] 推送当前已验证提交到 `feature/cuoti-zhiku-v1`。
- [ ] 用 GitHub API 更新 description、topics 与 Issues 设置。
- [ ] 创建 `v0.4.0` Release、上传安装包、写入校验值和用户可读版本说明。
- [ ] 只读复查仓库 metadata、Release 资产和 README 链接。

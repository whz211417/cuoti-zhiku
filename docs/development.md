# 开发与架构

这份文档面向希望阅读、构建或扩展错题智库的开发者。普通用户请先看项目根目录的 [README](../README.md)。

## 技术栈

- 桌面壳层：Tauri 2
- 前端：React + TypeScript + Vite
- 本地后端：Rust
- 数据库：SQLite
- 凭据：Windows Credential Manager
- 知识网络：JSON Canvas，可导入 Obsidian

## 数据边界

应用默认把结构化记录写入 `%LOCALAPPDATA%\\com.cuoti.zhiku\\library.sqlite3`，原件放在 `originals/`，恢复前救援备份放在 `backups/`。API Key 不进入数据库、备份或导出文件。

AI 请求由本地 Rust 服务统一校验：平台、模型、超时、目标地址和授权教材片段必须与当前配置一致；题图和教材片段默认不发送，只有用户在当前题目审核器中明确授权才会进入请求。

## 主要目录

```text
src/
  app/                 应用壳层、导航与全局刷新
  features/problems/   题目档案、AI 审核与安全写回
  features/review/     间隔复习流程
  features/knowledge/  课程知识网络
  features/materials/  本地课程资料与检索
  features/settings/   AI 平台与偏好设置
src-tauri/
  src/db/               SQLite 迁移、备份与恢复
  src/domain/           题目、课程、复习领域逻辑
  src/services/ai/      AI 请求边界与引用校验
  src/services/obsidian/Obsidian Markdown/Canvas 导出
docs/
  release/              Windows 发布说明
  verification/         发布验证记录
  assets/readme/        README 展示截图
```

## 本地开发

```powershell
pnpm install
pnpm dev
```

## 验证命令

```powershell
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test:rust
```

当前 `v0.3.3` 发布验证结果：前端 207 项测试、Rust 101 项测试、Lint、TypeScript 类型检查、Vite 构建和 Windows x64 NSIS 打包全部通过。

## 发布

Windows 安装包使用 Tauri NSIS 目标生成，正式文件只上传到 [GitHub Release v0.3.3](https://github.com/whz211417/cuoti-zhiku/releases/tag/v0.3.3)，不进入普通 Git 历史。完整安装校验和边界见 [发布校验记录](verification/2026-08-12-0.3.3-release.md)。

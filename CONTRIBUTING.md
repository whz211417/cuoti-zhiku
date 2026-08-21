# 贡献指南

感谢你愿意改进错题智库。这个项目首先是一款本地优先的学习工具：任何改动都不应以牺牲题目原件、课程资料、备份可恢复性或用户对 AI 的知情控制为代价。

## 开始之前

1. 先搜索已有 Issue；较大的功能先开 Issue 说明问题、边界与验证方式。
2. 不要把真实题目、教材、数据库、备份文件或 API Key 提交到仓库或 Issue。
3. 一个 Pull Request 聚焦一个目标，说明用户可感知的变化和验证结果。

## 本地开发

需要 Node.js、pnpm、Rust stable 与 Windows WebView2 Runtime。安装依赖后运行：

```powershell
pnpm install --frozen-lockfile
pnpm run lint
pnpm test
pnpm run typecheck
pnpm run build
pnpm tauri dev
```

修改 Rust、数据库迁移、文件托管、备份恢复、AI 数据范围或导出时，请一并运行 `pnpm run test:rust`，并补充相应测试。

## 产品约束

- 本地流程必须在没有 AI、没有网络和没有 API Key 时仍然可用。
- AI 输出只能作为可审核建议；不得静默改写用户内容，也不得伪造教材依据。
- 删除操作必须明确作用对象、可恢复范围与不可恢复范围；绝不删除用户最初导入的原文件。
- 新增数据结构要考虑升级、备份、恢复和旧资料兼容性。
- 尊重系统“减少动态效果”设置；动效用于反馈与理解，不用于吸引注意力。

## 提交前检查

- 运行受影响的测试，再运行完整前端检查：`pnpm run lint`、`pnpm test`、`pnpm run typecheck`、`pnpm run build`。
- 手动确认小窗口、滚动区域、键盘操作和浅/深色外观没有明显退化。
- 不提交 `release/*.exe`、构建产物、个人资料库或任何密钥。

安全问题请勿公开开 Issue，改用 [安全策略](SECURITY.md) 中的渠道。

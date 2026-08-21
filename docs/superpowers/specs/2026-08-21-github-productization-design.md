# GitHub 产品化设计

## 目标

将公开仓库转化为可信的产品入口：学生能快速下载，开源访客能理解边界与技术实现，潜在贡献者有清晰反馈路径。

## 决策

- README 使用产品优先的信息架构，首屏必须有最新 Windows 下载、版本、定位与截图；开发细节下沉至 `docs/`。
- 继续使用 MIT；开启 Issues，但不启用 Discussions，避免创建当前无人维护的多入口社区。
- 使用两类 Issue 模板（Bug、功能建议）、`CONTRIBUTING.md`、`SECURITY.md` 和仅验证前端的 GitHub Actions，避免承诺当前 CI 环境不能稳定执行的 Windows 打包。
- 发布 `v0.4.0`：上传已验证 NSIS 安装包并发布 SHA-256；Release 说明只陈述真实交付内容。
- 远端 metadata 使用准确描述和可检索 Topics：`ai-study`、`knowledge-management`、`chinese`、`study-tools`、`desktop-app`。

## 非目标

- 不虚构 Star、下载量、OCR、自动更新、代码签名或跨平台版本。
- 不创建网站主页或空的 Discussions。
- 不将 Windows 凭据、测试数据、构建产物或 API Key 写入 Git 历史。

## 验收

- README 全部下载与文档链接指向 `v0.4.0` 或长期稳定入口。
- 本地 Markdown 链接、前端 lint/test/build 可通过。
- GitHub 发布后，Release 含安装包、哈希、准确的版本说明；Issues 已启用且 Topics 可检索。

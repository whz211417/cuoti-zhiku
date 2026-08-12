# 错题智库

> 一款为中文大学生设计的 Windows 本地错题学习应用：把题目、教材、知识点和复习记录放进同一份可恢复的学习档案。

<p>
  <a href="https://github.com/whz211417/cuoti-zhiku/releases/tag/v0.3.3"><strong>下载 Windows 版</strong></a>
  ·
  <a href="https://github.com/whz211417/cuoti-zhiku/releases">查看全部版本</a>
  ·
  <a href="docs/development.md">开发与架构</a>
</p>

![Windows](https://img.shields.io/badge/Windows-x64-1f6feb?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-TypeScript-61dafb?style=flat-square&logo=react&logoColor=111827)
![Rust](https://img.shields.io/badge/Rust-backend-000000?style=flat-square&logo=rust)
![License](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)

## 先看它长什么样

<p align="center">
  <img src="docs/assets/readme/overview.png" alt="错题智库档案总览" width="49%" />
  <img src="docs/assets/readme/ai-review.png" alt="错题智库题目档案与 AI 审核" width="49%" />
</p>
<p align="center">
  <img src="docs/assets/readme/ai-settings.png" alt="错题智库 AI 引擎设置" width="49%" />
  <img src="docs/assets/readme/local-materials.png" alt="错题智库本地课程资料依据" width="49%" />
</p>

截图使用无个人题目和无 API Key 的界面状态，仅用于展示产品结构与交互方向。

## 它解决什么问题？

把“题目文档”和“答案文档”合成一份可以持续复习的本地记录：

```text
拖入题目 / 题图 / PDF
  → 原件安全保存为待整理
  → 补充题干与个人作答
  → 可选 AI 生成待审核建议
  → 按字段采纳、编辑或拒绝
  → 进入今日复习与知识网络
  → 导出题目册、答案解析册或 Obsidian
```

## 为什么是本地优先？

- 题目原件、SQLite 资料库、课程材料和复习记录默认只保存在这台 Windows 电脑上。
- AI 是可选增强：没有网络、没有 API Key 或 AI 请求失败时，收题、整理、检索、复习、备份和导出仍然可用。
- API Key 按平台与目标地址隔离保存到 Windows 凭据管理器，不进入 SQLite、备份或导出文件。
- 完整备份包含数据库与原件；恢复前自动创建救援副本，避免一次操作破坏资料。

## 核心功能

### 收题与整理

- 从资源管理器直接拖入 PNG、JPG、WebP、PDF、Markdown 或 TXT，也支持粘贴截图。
- 原件先按 SHA-256 内容地址安全落盘，再创建待整理记录，避免导入失败导致原件丢失。
- 题目详情将题干、个人作答、标准答案、解析、错因、知识点笔记放在同一份阅读式档案中。

### 复习与知识网络

- 今日复习默认先隐藏答案，主动揭示后按“忘记、吃力、熟悉、掌握”安排下次复习。
- 按课程浏览“课程—知识点—题目”关系，可筛选薄弱点并回到相关题目。
- 可将课程 Markdown、附件和 JSON Canvas 知识网络导出到 Obsidian；检测到用户修改时写冲突副本，不覆盖原文。

### 可选 AI 整理

- 兼容阿里云百炼、DeepSeek、智谱 AI、月之暗面和 OpenAI 兼容 HTTPS 平台。
- 每次请求先展示实际平台、模型、题目文字、题图授权和最多三段教材片段。
- AI 输出只进入逐字段审核层；已有内容不会被批量覆盖，版本冲突会自动恢复并保留未写入建议。
- 教材引用只接受本次明确授权片段中的可验证原文，不伪造教材依据。

## 安装 Windows 版

前往 [GitHub Releases](https://github.com/whz211417/cuoti-zhiku/releases/tag/v0.3.3)，下载 `错题智库_0.3.3_x64-setup.exe` 并运行。

当前正式安装包：

- 大小：7,727,201 字节
- SHA-256：`CA26577494449D8D0A1B1CBCBA8DA0E24CCDBE1272144F1E1927640AF03093A5`
- 安装范围：当前 Windows 用户
- 代码签名：未购买商业签名，SmartScreen 可能要求确认来源

PowerShell 校验：

```powershell
Get-FileHash -Algorithm SHA256 .\错题智库_0.3.3_x64-setup.exe
```

## 隐私与当前边界

- 当前版本不内置 OCR；扫描版 PDF 需要先 OCR 或手动补充题干。
- 题目 PDF 会安全保存，但 AI 不会默认发送 PDF 全文；只有用户明确授权的内容才会进入请求范围。
- `.czkbackup` 不包含 Windows 凭据管理器中的 API Key，迁移后需重新配置 AI。
- 可打印 HTML 可在浏览器中打印或保存 PDF；应用本身不内置 PDF 排版引擎。

## 开发者入口

开发环境、数据模型、AI 安全边界、Obsidian 格式、测试命令和发布流程见 [docs/development.md](docs/development.md)。

## 许可证

本项目使用 [MIT License](LICENSE)。

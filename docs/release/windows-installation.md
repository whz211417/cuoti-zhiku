# Windows 安装与首启

## 安装

1. 运行 `错题智库_0.1.0_x64-setup.exe`。
2. 当前测试包没有商业代码签名。若 Windows SmartScreen 显示提示，请先核对安装包来源与 SHA-256，再决定是否继续。
3. 安装模式为当前 Windows 用户，不要求把资料上传到云端。

## 首次使用

1. 打开应用后默认进入“学习总览”。其中课程、资料、待整理、待复习、最近题目和学习信号均读取这台电脑上的真实资料库；新资料库会显示空状态，不会填入演示数字。
2. 新建课程或使用“未分类”，再点击“投进题目”，选择 PNG、JPG、JPEG、WebP 或 PDF。
3. 看到收件箱记录后即可打开题目档案，补充题干、作答、答案、解析与错因。
4. 点击工具栏搜索按钮或按 `Ctrl+K` 可搜索本机题目、课程和已导入资料。去除首尾空白后至少输入两个字符才会查询，单次最多显示 12 条结果；搜索数据与查询词不会发送到网络。
5. 不配置 API Key 也能使用全部本地核心流程。如需 AI，可在设置中填写 DashScope API Key；Key 由 Windows 凭据管理器保存，且每次 AI 请求仍需确认数据范围。

## 数据目录

默认目录：

```text
%LOCALAPPDATA%\com.cuoti.zhiku
```

升级应用不会主动删除此目录。卸载或迁移电脑前，先关闭应用并复制整个目录。

## 校验安装包

发布方应同时提供与安装包对应的文件大小和 SHA-256。下载后可在 PowerShell 中校验；不要沿用其他构建或旧版本的哈希值。

```powershell
Get-Item -LiteralPath '.\错题智库_0.1.0_x64-setup.exe' |
  Select-Object Name, Length, LastWriteTime
Get-FileHash -LiteralPath '.\错题智库_0.1.0_x64-setup.exe' -Algorithm SHA256
```

## 当前发布边界

- 未提供自动在线更新。
- 未签名安装包只适合可信来源下的个人测试与本地使用。
- 当前版本不内置 OCR；课程扫描 PDF 需要先使用其他工具 OCR，已有文本层的 PDF 可直接导入检索。题目 PDF 可保存并手动补充题干，AI/OCR 都不是本地核心流程的前提。
- 当前只导出 Markdown 题目册与答案解析册；如需 PDF，可使用 Word、Typora 或浏览器打印转换。
- 内置备份只包含 SQLite 数据库一致性快照，不包含 `originals` 原件目录。卸载、迁移或整机备份时应复制整个 `%LOCALAPPDATA%\com.cuoti.zhiku` 目录。

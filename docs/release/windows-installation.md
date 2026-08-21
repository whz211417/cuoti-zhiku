# Windows 安装与首启

## 下载与校验

从 [v0.4.0 Release](https://github.com/whz211417/cuoti-zhiku/releases/tag/v0.4.0) 下载 `Cuoti-Zhiku-0.4.0-x64-setup.exe`。请只从项目 Release 页面下载。

| 项目 | 值 |
| --- | --- |
| 文件大小 | 7,745,159 字节 |
| SHA-256 | `09B0EE82B23A94CBD08AC5D168F8202B62CD1FB63CB6EB3F7E8BC9B1CE18C772` |
| 安装范围 | 当前 Windows 用户 |
| 平台 | Windows x64 |

下载后，在安装包所在文件夹运行：

```powershell
Get-Item -LiteralPath '.\Cuoti-Zhiku-0.4.0-x64-setup.exe' |
  Select-Object Name, Length, LastWriteTime
Get-FileHash -LiteralPath '.\Cuoti-Zhiku-0.4.0-x64-setup.exe' -Algorithm SHA256
```

输出的 `Length` 与 `Hash` 必须分别与上表一致。当前安装包没有商业代码签名；若 Windows SmartScreen 提示，请先核对下载来源和 SHA-256，再自行决定是否继续。

## 安装

1. 运行 `Cuoti-Zhiku-0.4.0-x64-setup.exe`。
2. 按安装向导完成当前用户安装。
3. 从开始菜单启动“错题智库”。启动后不应再出现额外的黑色控制台窗口。

## 首次使用

1. 默认会进入“学习总览”。新资料库显示真实的空状态，不会填入演示数字。
2. 新建课程或使用“未分类”，点击“投进题目”；也可以把文件拖进窗口，或在非编辑区域粘贴截图。
3. 打开待整理题目，补充题干、作答、答案、解析和错因。
4. 使用搜索按钮或 `Ctrl+K` 搜索本机题目、课程和已导入资料。去除首尾空白后至少输入两个字符才会查询，单次最多显示 12 条结果；查询词不会发送到网络。
5. 不配置 API Key 也能完成所有本地核心流程。如需 AI，在设置中选择平台或兼容接口；Key 由 Windows 凭据管理器保存，且每次 AI 请求仍需确认数据范围。

## 数据与迁移

默认数据目录：

```text
%LOCALAPPDATA%\com.cuoti.zhiku
```

升级应用不会主动删除此目录。卸载或迁移电脑前，建议在应用内创建完整备份；也可先关闭应用，再复制整个目录。

## 当前发布边界

- 未提供自动在线更新。
- 未签名安装包只适合可信来源下的个人测试与本地使用。
- 当前不内置 OCR；课程扫描 PDF 需要先使用其他工具 OCR，已有文本层的 PDF 可直接导入检索。题目 PDF 可保存并手动补充题干。
- 可导出 Markdown 或 A4 打印版 HTML；打印版可由浏览器保存为 PDF。
- `.czkbackup` 完整备份包含 SQLite 与应用保存的原件，不包含 API Key。

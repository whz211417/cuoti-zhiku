# 错题智库 0.2.0 发布验证

验证日期：2026-08-02

目标平台：Windows x64

数据库 Schema：6

## 已验证

- `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 与 `src-tauri/tauri.conf.json` 版本均为 `0.2.0`。
- `npm.cmd test`：26 个测试文件、182 项测试全部通过，0 failed。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run build`：通过；Vite 转换 1623 个模块。
- `git diff --check`：通过。
- Rust GNU target：93 passed，0 failed。
- AI 安全复审：Critical 0、Important 0、Minor 0。
- 数据库迁移、备份恢复、重复原件、课程资料片段、逐字段保存、复习计划、AI Provider 地址与凭据隔离均包含在上述 Rust 回归中。
- 动态导航材质与临时浮层具有显式 `data-material` 语义；减少动态、减少透明度和系统深色外观均有 CSS 降级。
- 鼠标高光使用宿主内局部像素坐标；每个动画帧重新读取布局矩形，侧栏与工具栏高光层均与宿主同尺寸，浏览器实测定位与鼠标一致。
- 动态高光使用两层错位圆形漫反射、14px 模糊与 0.20 总透明度上限；侧栏和工具栏不再包含椭圆光斑，浏览器截图验收未发现可辨认的几何轮廓。

## 发布产物

- 构建命令：`npm.cmd run tauri:build -- --target x86_64-pc-windows-gnu`
- Tauri CLI：`2.11.4`；Rust `tauri` crate：`2.11.5`
- 安装包：`release/错题智库_0.2.0_x64-setup.exe`
- 字节数：`7,827,512`
- SHA-256：`B91A3257D1B41DFDDB6B29A07BB8A8BAB97950BC4B7DA99A2AB3F7982132D0C8`
- 安装器文件版本：`0.2.0`
- 安装命令退出码：`0`
- Windows 已登记版本：`0.2.0`
- 安装后的可执行文件：`C:\Users\whz21\AppData\Local\Programs\cuoti-zhiku\cuoti-zhiku.exe`
- 安装后可执行文件产品版本：`0.2.0`

深层 target 目录中的历史 `0.1.0` 安装包不属于本次发布；对外只交付上述 `release` 目录中的 `0.2.0` 文件。

## 桌面验收清单

- [x] NSIS 当前用户安装完成，注册表与安装文件版本均为 0.2.0
- [ ] 启动已安装程序并确认主窗口响应
- [ ] 覆盖安装后旧资料库无需重置即可打开
- [ ] PNG、PDF、Markdown、TXT 从资源管理器拖入窗口
- [ ] 混合支持/不支持格式时给出准确结果
- [ ] 未分类与已选课程收题
- [ ] 课程资料导入和课程内片段检索
- [ ] 浅色、深色、减少动态、减少透明度
- [ ] 设置与 AI 审核浮层的 Tab、Shift+Tab、Escape 与焦点恢复
- [ ] 多 Provider 保存、测试、启用、替换 Key 与失败回滚
- [ ] AI 数据范围确认、原图授权、最多三段教材授权
- [ ] AI 建议逐字段编辑、采纳、拒绝与教材依据验证
- [ ] 题目册和答案解析册导出
- [ ] 备份与恢复

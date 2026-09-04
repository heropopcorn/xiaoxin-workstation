# Xiaoxin Workstation 问题与复测记录

仓库：`D:\project\xiaoxin-workstation`。  
这里记两类东西：本机打过的 **bug / 复测**，以及开发中拍板过的 **产品节点**（不是缺陷，避免以后把两条主线拧在一起）。不替代 GitHub issue。

更早的 Overlay 框选提问（开关弹回、热键、Enter、XML、状态条、截图芯片、闪蓝框）见：

- [docs/overlay-typed-submit-fix.md](../overlay-typed-submit-fix.md)

## 怎么记

每条记录用同一套标题：

- **状态**：`已修待复测` / `观察中` / `支线进行中` / `产品节点` / `已关闭`
- **现象**：用户看到什么，尽量写可复现步骤
- **原因**：查到的代码或日志，没有就写「未证实」
- **当前处理**：改了什么、没改什么
- **复测**：下次怎么确认；失败时看哪份日志
- **相关文件**

主进程（`electron/`、`apps/interpreter-overlay/electron/`）改完必须杀掉 `pnpm dev` 再开。已安装的 `Xiaoxin Workstation.exe` 和源码共用 `%USERPROFILE%\.openinterpreter` 与 `127.0.0.1:19988`，调试前先托盘退出安装版。

## 索引

| 日期 | 记录 | 状态 |
| --- | --- | --- |
| 2026-09-03 | [Overlay 框选提问](../overlay-typed-submit-fix.md) | 已修，用户确认框选可用 |
| 2026-09-04 | [Office 内嵌引擎与桌面点击穿透](./2026-09-04-office-viewer-and-desktop-clicks.md) | 多条：Office 支线 + 点击穿透观察中 |
| 2026-09-04 | [桌面 Station 与网页主线交叉](./2026-09-04-desktop-and-web-mainlines.md) | 产品节点，不是 bug |

## What's New 首页五项（2026-09-04 进度）

来源：`server/handlers/topNotices.ts`，一共 5 条。

| 项 | 测法 | 进度 |
| --- | --- | --- |
| Use Interpreter from anywhere | Overlay / 框选截图 | 通过 |
| Office documents | 工作区对话改 `.xlsx` / `.docx`；点文件预览是另一条路 | 对话路径未收口；预览见 09-04 记录 |
| Desktop form filling | Try it：`Show me which desktop apps are open...` | 未测 |
| Browser control | 扩展版本必须和本机 relay 对齐 | 初步测过 |
| Record a skill | Try it：`Help me record a reusable skill...` | 未测 |

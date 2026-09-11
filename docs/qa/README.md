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
| 2026-09-07 | [功能交接（测试进度与未 push 项）](./2026-09-07-feature-handoff.md) | 总览；桌面列举待复测、待 push |
| 2026-09-07 | [后续功能详细用例（填表 / 录 skill / 改表 / 预览 / 浏览器）](./2026-09-07-remaining-manual-tests.md) | 当前要测的 |
| 2026-09-07 | [已测项简表](./2026-09-07-manual-test-cases.md) | Overlay / 读表等已测，不必再走 |
| 2026-09-08 | [OIX 工具分流与工具面精简 TODO](./2026-09-08-oix-tool-routing-todo.md) | 待优化；先做工具组/命名空间过滤 |
| 2026-09-08 | [OIX provider 工具注入与真实请求审计交接](./2026-09-08-oix-provider-tool-audit-handoff.md) | 已定位配置、提示词与日志语义矛盾；待 OIX 网络出口审计 |
| 2026-09-11 | [OIX 自建验证与 wire 级工具注入证据](./2026-09-11-oix-selfbuild-and-wire-evidence.md) | 根因已确认（`tools` 里 0 个 CUA）；OIX 自建已验证可行；待实施工具注入 |

## What's New 首页五项（2026-09-07 进度）

来源：`server/handlers/topNotices.ts`，一共 5 条。总览见 [功能交接](./2026-09-07-feature-handoff.md)。

| 项 | 测法 | 进度 |
| --- | --- | --- |
| Use Interpreter from anywhere | Overlay / 框选截图 | 通过 |
| Office documents | 工作区对话改 `.xlsx` / `.docx`；点文件预览是另一条路 | 读表通过；改/预览未收口 |
| Desktop form filling | Try it：`Show me which desktop apps are open...` | 待复测；禁止正则预调 `list_apps` |
| Browser control | 扩展版本必须和本机 relay 对齐 | 待复测；读页 assist 已拆 |
| Record a skill | Try it：`Help me record a reusable skill...` | 未测 |

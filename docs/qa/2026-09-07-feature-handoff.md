# Xiaoxin Station 功能交接（2026-09-03 ~ 09-07）

日期：2026-09-07  
仓库：`D:\project\xiaoxin-workstation`  
分支：`xiaoxin/main`  
远程：`https://github.com/heropopcorn/xiaoxin-workstation.git`

这是给下一手测试 / 调试 / 接力开发用的总览。细的复现和日志在下面的专题记录里，不要在这里再抄一遍。

---

## 先分两条线

| 线 | 仓库 | 怎么测 |
| --- | --- | --- |
| 桌面 Station | 本仓库，Electron 窗口 | Overlay、工作区文件、oo-editors、浏览器扩展、CUA |
| 网页小忻 | `xiaoxin_web`；线上如 `https://xiaoxin.jenshin.cn/login` | 登录、SupplyChain 对话 |

Station 的 Vite 开发页（常见 `5173`–`5175`）在 Chrome 里看起来像桌面，但没有 Electron IPC。标签是 `Interpreter :xxxx`、点 Excel 报 `OfficeExtension IPC not available` 时，那是开发页，不是小忻 Web。详见 [桌面与网页主线](./2026-09-04-desktop-and-web-mainlines.md)。

---

## 已经做成的能力

### 1. Overlay 框选提问

本地就能用，不依赖 hosted overlay 服务。本机热键是 **`Ctrl+Alt+Space`**（中文输入法常抢 `Ctrl+Space`）。

修过：开关弹回、没 hosted API 不注册热键、框选 Cursor 后 Enter 中断、用户气泡里的 XML、截图变成文件条、提交后闪蓝框、状态条点不进窗口。

用户已确认框选可用。细节：[docs/overlay-typed-submit-fix.md](../overlay-typed-submit-fix.md)

已推：`ea55ed4`

### 2. Office 文档（两条路）

不要混：

- **聊天改文档**（What's New 说的）：工作区 `.xlsx` / `.docx` + `openpyxl` / `python-docx`。不装 oo-editors 也能走。
- **侧栏点开预览**：本机 `oo-editors`（ONLYOFFICE 内核，AGPL，可选下载，没打进安装包）。

为预览做了：`product.json` 指向 `openinterpreter/oo-editors`；GitHub API 限流时走直链 zip；**Install from local file** 在 Windows 上能选 zip。安装目录：`%APPDATA%\interpreter\document-engine`（当前 `pnpm dev` 用社区用户目录名 `interpreter`）。

读 `Expense Tracker.xlsx` 已通过。中间若出现 Excel COM（`Excel.Application` / `80040154`）红字，是模型误走本机微软 Excel，不影响 `openpyxl` 读成功。本机可以不装 Microsoft Excel。

改表保存、公式重算、用 `receipt.jpg` 填第 9 行、侧栏预览安装，都还没收口。细节：[Office 与点击穿透](./2026-09-04-office-viewer-and-desktop-clicks.md)

已推：`c0c3134`

### 3. Overlay 闲置时不再挡桌面点击

Windows 上旧的 overlay `hide()` 其实是全屏透明置顶窗，点击穿透不稳，其他应用会点不动。已改成真正 hide，并停到屏幕外。

2026-09-04 16:00 暂时没复现，**观察中**。再出现时先别挪 Station 窗口，看 `logs/session-*.log` 里 Overlay hide / send。

已推：`c0c3134`

### 4. 浏览器读页

读页必须由模型自己调浏览器工具。正则匹配「当前页面是什么」再预 inspect、把快照塞进 context，已整段删除（`browserPageReadAssist` / `browserPageReadRequest`）。

Chrome 扩展必须和本机 relay 对齐（见过 `browser-extension-relay\0.0.123`）。

### 5. 桌面窗口 / 应用列举

正确路径是模型自己调 CUA `list_apps`。正则匹配问句再预调 `list_apps` 的辅助已整段删除（`desktopWindowListAssist` / `desktopWindowListRequest`）。发送后立刻弹列窗口权限，就是这类预执行，禁止补回。

---

## What's New 五项进度

来源：`server/handlers/topNotices.ts`。首页一共 5 条。

| 项 | 进度 | 怎么测 |
| --- | --- | --- |
| Use Interpreter from anywhere | **通过** | Overlay 框选 + 提问 |
| Office documents | **读表通过**；改/预览未收口 | 聊天改文件；点文件是另一条路 |
| Desktop form filling | **待复测（禁止正则预调工具）** | Try it：`Show me which desktop apps are open...` 或「我当前电脑有哪些窗口」。应看到模型自己调 `builtin-cua-driver__list_apps`，不应秒弹权限。 |
| Browser control | **待复测（读页辅助已拆）** | 扩展对齐后问「当前页面是什么」。应看到模型自己读页，不应秒弹 inspect。 |
| Record a skill | **未测** | Try it：`Help me record a reusable skill for a workflow I do often.` |

---

## 本机怎么跑

```text
D:\project\xiaoxin-workstation
托盘退出已安装的 Xiaoxin Workstation.exe
$env:PATH = "C:\nvm4w\nodejs\node_modules\bun\bin;" + $env:PATH
pnpm dev
```

- bun：`C:\nvm4w\nodejs\node_modules\bun\bin`
- 安装版和源码共用 `%USERPROFILE%\.openinterpreter` 与 `127.0.0.1:19988`
- Electron 主进程 / `server/` / overlay electron 改完必须杀掉 `pnpm dev` 再开，Vite HMR 救不了
- Overlay 热键：`Ctrl+Alt+Space`
- Vite 被占时会递增（测过 5173 / 5174 / 5175）。测小忻 Web 时先不要让 Station 占 5174
- 日志：`logs/session-*.log`

不要用浏览器打开 `http://localhost:517x` 去验收 Overlay / Office IPC / CUA。

---

## 关键文件（按能力）

| 能力 | 文件 |
| --- | --- |
| Overlay 提交 / 隐藏 | `apps/interpreter-overlay/electron/service.ts`、`overlay-window.ts`、`renderer/overlay.tsx` |
| Office 引擎 / 本地 zip | `electron/services/office-extension.ts`、`office-extension-source.ts`、`src/components/OfficeExtensionViewer.tsx`、`product.json`、`distribution/product.xiaoxin.json` |
| 浏览器读页 | 模型自己调 `builtin-interpreter` 浏览器工具；不要再加读页 assist |
| 桌面窗口列举 | 模型自己调 `builtin-cua-driver__list_apps`；不要再加窗口列举 assist |
| 主 agent 提示 | `server/utils/mainAgentPrompt.ts` |
| 首页五项 | `server/handlers/topNotices.ts` |

模型面对的工具面是 **CLI / `interpreter-app`**，不要再做一套平行 MCP。

---

## 下一手建议顺序

1. 复测「我当前电脑有哪些窗口」：模型必须自己调 `list_apps`。发送后立刻弹权限即失败。
2. 复测「当前页面是什么」：模型必须自己读页。发送后立刻弹 inspect 即失败。
3. 再走 Desktop form filling 的填表，不只是列举。
4. Office：改表保存；Demo `receipt.jpg` 填第 9 行；本地 zip 装 oo-editors 后点开预览。
5. Browser control 按首页 Try it 再走一遍。
6. Record a skill。
7. Overlay 挡点击若再出现，按 09-04 记录复测，先别挪窗口。

新问题按 [docs/qa/README.md](./README.md) 的标题补一条。不要把「网页也能预览 Office」做回本机 zip 安装器。

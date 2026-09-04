# 2026-09-04 Office 预览支线与桌面点击穿透

日期：2026-09-04  
范围：What's New「Office documents」测试中分出的内嵌预览，以及 Overlay 挡住其他 Windows 窗口点击。  
仓库：`D:\project\xiaoxin-workstation`

两条路不要混：

1. **聊天改文档**（What's New 正文说的能力）：工作区里的 `.xlsx` / `.docx`，对话 + `openpyxl` / `python-docx`。不装 oo-editors 也能走。首页这项没有 Try it，要自己打字。
2. **侧栏点文件预览/编辑**：要兼容文档引擎（官方实现是 `oo-editors`）。Xiaoxin 原先没配下载源。

---

## 1. 点 Demo 的 Word/Excel 出现 Install，一点就报未配置

**状态**：已修待复测（发行配置已接官方仓库；本机 GitHub 下载仍不稳，见第 2、3 条）

### 现象

工作区 `Documents / My Workspace (1)` → `Demos/Fill PDF Form` → `Vendor Information.docx`。中间卡片：

- Compatible document engine required
- Install oo-editors

点安装后：

> Unable to load this file  
> No compatible document engine is configured for this distribution. Configure one in product.json or use code-and-skills document workflows.

### 原因

`installOoEditors()` 看到 `distribution.documentEngine.releaseRepository` 为空就直接抛上述错误，不会去 GitHub。  
Xiaoxin / 社区 `product.json` 故意留空；`scripts/verify-xiaoxin-distribution.mjs` 也曾断言必须为空。  
界面仍画了 Install 按钮，所以看起来像下载失败。

### 当前处理

为了能在窗口里查看/编辑，已把仓库指到官方源：

- `product.json` 与 `distribution/product.xiaoxin.json`：`releaseRepository` = `openinterpreter/oo-editors`
- `installDirectoryName` 仍是 `document-engine`（Xiaoxin 用户目录，不和官方 Interpreter 的 `oo-editors` 混）
- 校验改为断言上述仓库名

`oo-editors` 是 AGPL-3.0。这是可选本机下载，没有打进安装包。对外发行前要单独看法务。

相关文件：`distribution/product.xiaoxin.json`、`product.json`、`scripts/verify-xiaoxin-distribution.mjs`、`electron/services/office-extension.ts`

### 复测

1. 源码 `pnpm dev`（安装包不会吃到未打包的配置）。
2. 再点 `.docx` / `.xlsx`。
3. 若未安装：不应再立刻出现「No compatible document engine is configured」。
4. 点 Install 应开始找 GitHub release（成功或变成限流/断线，见下条）。

---

## 2. Install oo-editors 报网络错误：其实是限流 + 大包被掐

**状态**：已修待复测（直链回退已加；大包仍可能断）

### 现象

界面：

> GitHub release unavailable (transient -- rate limit or network), try again later

连点 Try again 几乎必现。

### 原因（日志已核实）

不是整网不能上网。

1. **下载中途断线**（`logs/session-2026-09-04T06-19-38.log`、`06-23-54.log`）：API 已找到 `v1.0.40`，开始拉 `oo-editors-windows-x64.zip`（约 136MB），302 → 200 后约十几秒 `read ECONNRESET`。安装器无断点续传。
2. **GitHub API 未登录额度**（60 次/小时/IP）：反复点 Try again + 启动时的更新检查，`core.remaining` 到 0。日志：`GitHub API rate limited (403)`。界面把 403 和网络写成同一句。
3. 额度大约整点后一小时窗口重置（当天本机约 14:47）。

### 当前处理

- API 不可用时改为直链：  
  `https://github.com/openinterpreter/oo-editors/releases/download/v1.0.40/oo-editors-windows-x64.zip`  
  不再因为 403 立刻放弃。
- 大文件仍可能 `ECONNRESET`。更稳的是浏览器先下，再走第 3 条本地安装。

相关文件：`electron/services/office-extension.ts`、`electron/services/office-extension-source.ts`

### 复测

1. 浏览器打开上面的直链，确认能下完。
2. 软件内 Install：额度未用尽时应能开始下载；到 CDN 仍可能断。
3. 查日志关键字：`GitHub API rate limited`、`Downloading oo-editors-windows-x64.zip`、`read ECONNRESET`。
4. 不要连点 Try again 把额度点光后再判断「网络不行」。

---

## 3. 本地 zip 安装；Windows 对话框选不到 zip

**状态**：已修待复测

### 现象

需要「从别的地方下载或本地安装」。加上 **Install from local file** 后，点开只能选文件夹，选不了 `.zip`。

### 原因

`openPathDialog({ type: 'both' })` 在 Windows 上会变成文件夹选择器（`openFile` + `openDirectory`）。

### 当前处理

- `install({ archivePath })`：zip 或已解压且含 `server.js` + `package.json` 的目录。
- 未安装页和报错页都有 **Install from local file**。
- 对话框改为 `type: 'file'`，默认筛 `.zip`，另有 All files。
- zip 若带一层目录（如 `oo-editors-windows-x64/server.js`）也能识别。

相关文件：`electron/services/office-extension.ts`、`src/components/OfficeExtensionViewer.tsx`、`electron/ipc/handlers.ts`

### 复测

1. 浏览器下载 `oo-editors-windows-x64.zip`（见第 2 条直链）。
2. 点 Office 文件 → **Install from local file** → 选该 zip。
3. 右下角类型若是空列表，改成 All files。
4. 装完应能在窗口里打开 Word/Excel；改完保存应写回工作区文件。
5. 安装目录：`%APPDATA%\interpreter\document-engine`（当前 `pnpm dev` 用社区 `userData` 名 `interpreter`）。

---

## 4. Workstation 开着时，其他 Windows 窗口经常点不动

**状态**：观察中（2026-09-04 16:00 用户说暂时没复现；若再出现用本条对照）

### 现象（未百分之百，概率高）

只要 Workstation **进程还在**：

- 主窗口被挡住或最小化，也不影响。
- 其他应用（Chrome、资源管理器等）鼠标点击经常没反应，像上面盖着一层 Workstation 界面。
- **退出软件**，或 **把 Workstation 窗口挪到别处**，大概率恢复。
- 不是每次都中。

### 原因（代码路径，与现象吻合）

不是主窗口本身。Overlay 开启后，Windows 上会留一层：

- 全屏（`display.bounds`）
- `alwaysOnTop: 'screen-saver'`
- 透明、`opacity: 0`
- 仍 `showInactive()`，并没有真 hide

启动时 `activateRuntime()` 就会 `overlay.hide()`。旧的 `hide()` 在 win32 上就是「全屏 + 透明 + 继续显示」。  
点击穿透用 `setIgnoreMouseEvents(true, { forward: true })`。Electron 在 Windows 上这个 `forward` 不稳定，穿透失败时所有其他窗口都点不到。  
挪主窗口会搅动 z-order / 再次 apply ignore，所以有时「好了」；退出则销毁这层窗口。

日志线索：`[OverlayWindow] hide`、`[InterpreterOverlay] send` 且 `mode: 'idle'`、`setFocusable { focusable: false }`。

### 当前处理

- Windows / Linux：`hide()` 改为真正 `hide()`，取消置顶，点忽略鼠标且不要 `forward`，窗口停到 `(-20000,-20000)` 的 1×1。macOS 仍用 0 透明度预热，避免第一次热键很慢。
- `send()`：idle 且没有桌面 dashboard 时也 `hide()`，避免用完热键后全屏窗还留着。
- `showOnDisplay()` 再显示时恢复 `alwaysOnTop: 'screen-saver'`。

相关文件：`apps/interpreter-overlay/electron/overlay-window.ts`、`apps/interpreter-overlay/electron/service.ts`  
单测：`overlay-window.test.ts`、`overlay-click-through-contract.test.ts`、`text-controller-routing-contract.test.ts`

### 复测（即使这次没复现也要过一遍）

1. 托盘退出安装版，只留源码 `pnpm dev`。
2. Overlay 保持开启（本机热键 `Ctrl+Alt+Space`）。
3. Workstation 开着，去点 Chrome / 资源管理器 / 记事本，连点标题栏、链接、按钮。
4. 把 Workstation 最小化，再点其他软件。
5. `Ctrl+Alt+Space` 打开再关掉（Esc 或提交），再点其他软件。
6. 框选一次再关掉，再点其他软件。

若再出现：

- 不要先挪窗口。记下：主窗口是否最小化、刚是否用过 Overlay、死区是整屏还是一块。
- 看最新 `logs/session-*.log` 里 Overlay hide / send / setFocusable。
- 对照：旧 hide 是否又变成全屏 `showInactive`；`forward: true` 是否在 idle 时又加上了。

---

## 5. 浏览器用的扩展版本（对照，不是这次修的）

**状态**：已知约束

浏览器控制走 CLI / `interpreter-app`，不是另做一套 MCP。  
本机托管的 relay 必须和 Workstation 打包版本一致。曾见过 `C:\Users\65153\AppData\Roaming\interpreter\browser-extension-relay\0.0.123`。  
Chrome 里装错版本会连不上。详见 `docs/browser-extension.md`、`scripts/ensure-browser-extension-relay-assets.mjs`。

---

网页里预览「服务端每人一份目录」不是这条桌面引擎的后续，见 [桌面 Station 与网页主线交叉](./2026-09-04-desktop-and-web-mainlines.md)。

## 本机调试备忘

- 源码入口：`D:\project\xiaoxin-workstation` 下 `pnpm dev`。需要 bun：`C:\nvm4w\nodejs\node_modules\bun\bin`。
- Vite 端口常见 `5173`。
- Overlay 热键本机为 `Control+Alt+Space`（中文输入法常抢 `Ctrl+Space`）。
- Office 引擎未装时点文件会看到 Install；聊天改文档不要用这个当失败标准。

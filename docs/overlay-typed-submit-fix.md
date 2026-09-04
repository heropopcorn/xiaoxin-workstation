# Overlay 框选提问：问题记录与修复过程

后续问题和复测索引：[docs/qa/README.md](./qa/README.md)。

日期：2026-09-03  
范围：Xiaoxin / Interpreter Overlay 在 Windows 上的本地 typed submit  
仓库：`D:\project\xiaoxin-workstation`（`xiaoxin/main`）

用户期望：打开 Overlay → 框选区域 → 输入问题 → Enter → 主窗口出现正常对话，并看到框选截图。  
实际路径：社区发行版没有 hosted overlay server；框选落在 Cursor 等「inspect = ask」的应用上时，会走 headed workstation agent，而不是附着目标的 CUA 控制环。

Electron 主进程不支持 HMR。`service.ts` 的改动必须杀掉 `pnpm dev` 再重启才生效。已安装的 `Xiaoxin Workstation.exe` 和源码 `pnpm dev` 共用 `%USERPROFILE%\.openinterpreter` 和 `127.0.0.1:19988`，调试前要先从托盘退出安装版。

---

## 1. Overlay 开关无法保持打开

### 现象

设置里打开 Overlay 后，开关马上弹回关闭。

### 原因

`resolveOverlaySettingsForCurrentAccount` 把 `accountUserId: null`（未登录的本地 overlay）当成「账号不匹配」，强制写成 `enabled: false`。

### 修复

只在「已保存账号」和「当前会话账号」真的不一致时关闭。未登录的 `null` / `null` 保持开启。

相关文件：`apps/interpreter-overlay/electron/access.ts`

---

## 2. 打开开关后快捷键没有反应

### 现象

开关能保持打开，但 `Ctrl+Space` / `Ctrl+Alt+Space` 仍不弹出输入框。

### 原因

`applySettings` 在 `!this.baseUrl` 时强制关掉 overlay。社区 `product.json` 的 `hostedApiBaseUrl` 为空，本地运行时永远不会注册热键。  
另外 Windows 中文输入法常抢走 `Ctrl+Space`。本机已保存快捷键是 `Control+Alt+Space`。

### 修复

- 去掉「必须有 hosted overlay server」才能启用的门闩。本地 text-controller / CUA / workstation 工具即可运行。
- 设置页在 Windows 且快捷键仍是 `Control+Space` 时提示改键。
- 没有 hosted API 时隐藏「overlay 使用我们服务器」的隐私说明。

相关文件：`apps/interpreter-overlay/electron/service.ts`、`src/components/settings/OverlaySection.tsx`、`shared/locales/*.json`

---

## 3. 按 Enter 看起来没提交

### 现象

输入后按 Enter，浮层还停在输入态，没有新对话。

### 原因

Enter 其实已经提交。`ensureExecutableContextForTarget` 在框选区域没有 browser / native CUA refs 时 **抛错**，提交路径没有接住。Cursor 的 inspect 策略是 `ask`，不会自动加载 native CUA refs，所以每次都炸。

连按 Enter 还会重复提交。

### 修复

- 没有可执行 refs 时改为警告并继续，走 headed workstation agent。
- `canControlSelectedTarget` 为假时启动可见 agent，而不是中止。
- 主进程 `overlaySubmitInFlight` 防重入；渲染层忽略 `event.repeat`，并对提交做 250ms 去抖。

相关文件：`apps/interpreter-overlay/electron/service.ts`、`apps/interpreter-overlay/renderer/overlay.tsx`、`apps/interpreter-overlay/renderer/InputPanel.tsx`

---

## 4. 用户气泡里出现大段 overlay XML

### 现象

对话里用户消息是整包 context packet + tools + 原文，而不是只问的那句话。

### 原因

降级启动把 `effectivePrompt`（完整 XML 上下文）当作 `startAgentTask` 的 `message`。

### 修复

新增 `buildOverlayHeadedAgentLaunchParts`：

- `message`：用户原文
- `system`：截图范围、整机状态等隐藏工作上下文
- headed 启动不再把 tool catalog 塞进用户可见消息

相关文件：`apps/interpreter-overlay/shared/text-controller.ts`

---

## 5. 状态条点不进对话

### 现象

回答时桌面上出现状态条；点击后 overlay 还挡着，必须从任务栏点主窗口。

### 原因

headed 降级用 `{ background: true }` 创建窗口（`show: false`、`skipTaskbar: true`）。  
`requestAgentWindowReveal` 只广播 `workstation:focus-tab`，没有 `show()` / `focus()`。Overlay 窗口 always-on-top，对话被压在下面。

### 修复

- `revealOverlayAgentWindow` / 托盘 / 通知点击：隐藏 overlay，`setSkipTaskbar(false)`，restore + show + focus 真正的 BrowserWindow。
- 提交后自动聚焦这次启动的窗口。
- `suppressDesktopAgentDashboard` 阻止 300ms dashboard 轮询把全屏 overlay 再拉回来。

相关文件：`apps/interpreter-overlay/electron/service.ts`

---

## 6. 截图变成文件条，不是预览图

### 现象

用户消息右侧是 `Viewed image > overlay-scope-...` 或「Target region」文件芯片，没有真图。

### 原因

截图写到 `%TEMP%\interpreter-overlay\overlay-scope-*.png`，再以 `@[Target region](<tmp path>)` 塞进用户消息。聊天的 FileSystemProxy 预览不了临时文件；模型再 `view_image`，界面就只剩工具结果条。  
`UserMessageBubble` 也把带 `dataUrl` 的附件当成 `pasted-text` 芯片画掉。

### 修复

- `captureOverlayScreenshotAttachment` 产出带 `dataUrl` 的 `StreamImageAttachment`。
- headed 启动用 `startupAttachments`，不再把文件 mention 写进用户消息。
- `buildNormalAgentAttachmentsFromContextItems` 包含 target 区域预览，不只是 `role === 'reference'`。
- `UserMessageBubble` 有 `dataUrl` 时直接 `<img>`。

相关文件：`apps/interpreter-overlay/electron/overlay-headed-launch-attachments.ts`、`apps/interpreter-overlay/electron/service.ts`、`agent/components/prompt-kit/thread-messages.tsx`

---

## 7. Enter 后选框不消失，蓝框在别的窗口上闪

### 现象

输入条没了，但「Target region」框还在。Cursor 侧栏、聊天区、状态栏上出现大量浅蓝色矩形，并且一直闪。

### 原因（日志已核实）

提交后主进程先 `send({ mode: 'working' })`。`send()` 只要 mode 不是 idle 就会 `showOverlayOnInteractionDisplay()`，全屏 always-on-top 窗口保持 **opacity 1**。

随后 `ensureExecutableContextForTarget` 再次写入 `this.scopeBounds`，并 `loadSelectionElementsForTargetBounds`。`working` 模式允许这次 hydration 提交。日志里出现：

```text
mode: 'working'
selectableElementCount: 244
```

这 244 个 AX/UI 框画在 Cursor 上，CSS 是：

```css
.scope-selection-spark {
  animation: scopeSelectionRipple 1200ms ... infinite;
}
```

颜色 `#2f7cff`，所以是闪蓝框。

更早的「提交后再 dismiss」太晚：hydration 和 `startAgentTask` 期间框已经在闪。  
`send()` 从 input 切到 idle 时，如果 `runStartedAt !== null`，还会把上一轮的 `selectableElements` / `scopeBounds` 留住。  
Windows 上 `OverlayWindow.hide()` 只把 opacity 设为 0，窗口仍 `isVisible()`；keepalive / `showOnDisplay` 随时能把它再亮起来。

`waitForPendingHotkeyContext(..., awaitTargetHydration: true)` 把「有 target region」当成可控，框选 Cursor 也会空等 hydration。

### 修复

提交顺序改为：

1. 先 snapshot `contextItems`（截图、范围、用户原文），再清现场 overlay 状态。
2. 立刻 `dismissOverlayPresentationAfterSubmit()`：`suppressDesktopAgentDashboard = true`，unpin world overlay，`resetOverlaySelectionState()`（递增 `selectionRequestId`），`send(DEFAULT_OVERLAY_STATE)`，`overlay.hide()`。
3. 请求用 snapshot 组装，不再读已清空的 live state。
4. `awaitTargetHydration: false`；`ensureExecutableContextForTarget(..., { presentSelection: false })` 不再把选框画回去。
5. `send()` 在 suppress 期间只 hide，不再 `showOnDisplay`。
6. idle 保活分支在 suppress 时不得复活 spark frames。
7. 只有真正可控制的附着目标路径，才在 pin world overlay 前恢复 `scopeBounds`。

相关文件：`apps/interpreter-overlay/electron/service.ts`

---

## 验证

源码侧已注册 `Control+Alt+Space`，日志：`Registered Control+Alt+Space`。

请在本机确认：

1. 托盘退出安装版 Xiaoxin，只留这一份 `pnpm dev`。
2. `Ctrl+Alt+Space` 打开输入框。
3. 在 Cursor 或其他窗口上框选，输入问题，Enter。
4. 灰层、选框、闪蓝框应马上消失。
5. 主窗口出现新对话；用户气泡是原文 + 截图预览，不是 XML，也不是 `overlay-scope-...` 文件条。
6. 若还有状态条，点击应打开同一条会话并收起 overlay。

单测：`apps/interpreter-overlay/electron/text-controller-routing-contract.test.ts` 等 overlay 合同测试；`tsc -p tsconfig.electron.json --noEmit` 已通过。主进程改动不能只靠 typecheck 宣称 overlay 可用。

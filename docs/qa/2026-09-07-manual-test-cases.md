# Xiaoxin Station 手工测试用例（2026-09-07）

**后面还没测的详细步骤**见 [2026-09-07-remaining-manual-tests.md](./2026-09-07-remaining-manual-tests.md)。本文只留已测项和观察项，避免再走一遍。

你自己点窗口即可。每条做完在结果栏打 `通过` / `失败` / `跳过`，失败时截一张图，并记下最新 `logs/session-*.log` 文件名。

测的是 **Electron 窗口**（标题 `Interpreter`，任务栏 Electron 图标）。不要用 Cursor 里的 `Interpreter :5174` / `localhost:517x` 页——那没有 IPC，Office / Overlay / CUA 都会假失败。

---

## 开始前

1. 托盘退出已安装的 `Xiaoxin Workstation.exe`（和源码抢 `19988`）。
2. 源码已用 `pnpm dev` 拉起（当前常见 Vite **5175**）。主进程改过必须先杀再开。
3. 点窗口标题栏的 **+ / 新代理**，每条用例尽量用新对话，避免旧会话里「缺少 CUA」带偏模型。
4. Overlay 热键本机是 **`Ctrl+Alt+Space`**。
5. 工作区默认：`Documents / My Workspace (1)`。

---

## TC-01  桌面：列出当前窗口 / 应用（优先）

首页 What's New → **Desktop form filling** → **Try it**  
或自己打：`我当前电脑有哪些窗口`

| | |
| --- | --- |
| 期望 | 可能先弹出「是否允许列出正在运行的应用和窗口」，点允许。回答里应出现本机真实应用（如 Cursor、Chrome、Interpreter），而不是让你开任务管理器。工具记录里应有 `list_apps` / `builtin-cua-driver`，不要先打一串 `Get-Process` / `EnumWindows`。 |
| 失败样例 | 「沙箱权限受限」「缺少桌面控制工具」「请按 Ctrl+Shift+Esc」。 |
| 结果 | |

补充（同一对话即可）：再问 `建议一个你能帮我填的桌面表单`。能指出一个已打开的窗口并准备填，算这项的后半；只列应用也先记「列举通过」。

---

## TC-02  Overlay 框选提问（回归）

1. 确认 Overlay 已开。按 `Ctrl+Alt+Space`。
2. 在任意窗口（建议 Cursor 或记事本）拖一个框，输入一句短问题，Enter。
3. 灰层、选框、闪蓝框应马上消失。
4. 主窗口新对话：用户气泡是原文 + 截图预览，不是大段 XML，也不是 `overlay-scope-...` 文件条。

| 结果 | |

---

## TC-03  Overlay 闲置时其他窗口能点（观察）

Workstation **不要关**。主窗口可最小化。

依次：点 Chrome / 资源管理器 / 记事本的标题栏和按钮 → 热键打开 Overlay 再 Esc 关掉 → 再点其他软件 → 框选一次再关掉 → 再点。

| | |
| --- | --- |
| 期望 | 其他窗口点击正常。 |
| 失败 | 像盖着一层透明窗。出现时 **先别挪 Station 窗口**，记下：是否刚用过 Overlay、死区是整屏还是一块。 |
| 结果 | |

---

## TC-04  Office：聊天读表（回归）

工作区 `Demos / Expense Tracker / Expense Tracker.xlsx`，新对话问：`Expense Tracker.xlsx 这个表格内容是啥`

| | |
| --- | --- |
| 期望 | 能说出 2025 年 10 月费用表大意（Adobe / LinkedIn 等）。中间若出现 Excel COM / `80040154` 红字，只要最后读出来了，仍算通过。 |
| 失败 | 最终说读不了，或只靠猜、没读到文件。 |
| 结果 | |

---

## TC-05  Office：聊天改表并保存

同一 Demo。请它用 `receipt.jpg` 填第 9 行，或自己说：`根据 receipt.jpg 填写第 9 行费用并保存`

| | |
| --- | --- |
| 期望 | 用 `openpyxl`（或等价 Python）改文件并写回。侧栏再打开 xlsx，第 9 行有新数据。不要求装微软 Excel。 |
| 失败 | 只改口说没写盘；或坚持走 Excel COM 然后失败收场。 |
| 结果 | |

---

## TC-06  Office：侧栏点开预览（和聊天不是一条路）

点一个 `.xlsx` 或 `.docx`（可用 `Vendor Information.docx` 或 Expense Tracker）。

| | |
| --- | --- |
| 期望 | 未装引擎时出现 Install，**不应**立刻报「No compatible document engine is configured」。可用 **Install from local file** 选已下载的 `oo-editors-windows-x64.zip`。装完能在窗口里打开。目录：`%APPDATA%\interpreter\document-engine`。 |
| 注意 | 不要连点 GitHub Install 把额度点光。Chrome 里打开 Station 开发页点文件报 IPC，不算本条失败。 |
| 结果 | |

---

## TC-07  浏览器：读当前页面

1. Chrome 扩展版本与本机 relay 一致（见过 `...\interpreter\browser-extension-relay\0.0.123`）。
2. 打开一个已登录或内容明确的标签，回到 Station。
3. 新对话问：`当前浏览器页面是什么内容`  
   或首页 **Browser control** → Try it（需先连上扩展）。

| | |
| --- | --- |
| 期望 | 根据页面内容回答，不是只念标题/URL。不要说「没有读页工具」「请你自己截图」。 |
| 失败 | 只复述标签名；或说 MCP 工具列表里没有读页。 |
| 结果 | |

---

## TC-08  录一条 skill

首页 **Record a skill** → **Try it**  
（`Help me record a reusable skill for a workflow I do often.`）

或自己说：`帮我把「打开费用表并读出合计」收成一条可再用的 skill`。

| | |
| --- | --- |
| 期望 | 引导记录流程，最后能在 Skills 里看到新 skill，或明确给出 skill 文件路径。 |
| 结果 | |

---

## 不要当成 Station 失败的情况

- Cursor 内嵌浏览器打开 `localhost:517x`，点 Excel 报 `OfficeExtension IPC not available`。
- 模型流断开（阿里云 `stream disconnected`）——先 Retry / 新对话，不要判功能坏了。
- 旧对话里已经说过「没有 CUA」——换 **新代理** 再测 TC-01。

---

## 记结果

把上表结果抄到这里或发我即可：

```text
TC-01 桌面列举：
TC-02 Overlay 框选：
TC-03 点击穿透：
TC-04 读表：
TC-05 改表：
TC-06 预览安装：
TC-07 读网页：
TC-08 录 skill：
失败截图 / 日志：
```

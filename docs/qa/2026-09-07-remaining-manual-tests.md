# 后续功能手工测试（详细操作）

日期：2026-09-07  
只测 **还没收口** 的能力。下面这些不要再走：Overlay 框选、读 `Expense Tracker.xlsx`、中间 Excel COM 红字。那些已经过了。

窗口必须是任务栏里的 **Electron / Interpreter**，标题是 `Interpreter`。不要用 Cursor 里的 `Interpreter :5174` 标签。

每条用 **新代理**：标题栏标签右侧的 **+**（或 `New agent`）。旧对话里如果出现过「缺少桌面控制工具 / 沙箱读不到窗口」，不要接着问。

---

## 开始前（只做一次）

1. 托盘退出已安装的 `Xiaoxin Workstation.exe`。
2. 确认源码 Station 已开（`pnpm dev`）。当前开发页一般是 `http://localhost:5175/`，但你测的是窗口，不是浏览器。
3. 左侧工作区应是 `... / Documents / My Workspace (1)`。不是的话点左侧文件夹面包屑切回去。
4. 如果首页没有 **What's new in Interpreter** 那张卡片：点左下角 **Settings**，或直接按下面「自己打字」的备用句。卡片右上角 **Dismiss** 关过之后，Try it 就没了。

---

## 用例 A — 桌面填表（What's New 第 3 项）

测的是：批准屏幕权限后，**真的去操作另一个 Windows 窗口**，不是只报应用名单。

### 准备一个靶窗口

1. 打开 **记事本**（开始菜单搜 `记事本`）。
2. 新建空白页，窗口标题应是 `无标题 - 记事本` 或 `Untitled - Notepad`。
3. **不要最大化挡住 Interpreter**。两个窗口并排：左边记事本，右边 Interpreter。
4. 记事本里先手打一行：`靶窗口已就绪`，方便你对照它有没有被改。

（你已经开着 WPS 空表也可以，把下面「记事本」换成「WPS 工作簿1」。一次只用一个靶。）

### 在 Station 里发起

1. 点 Interpreter 标题栏右侧 **+**，等到中间出现「下午好，小忻。」
2. 在 **What's new** 卡片里找到 **Desktop form filling**（「Interpreter can inspect desktop apps...」那一行）。
3. 点这一行右边的 **Try it**。
4. 输入框应自动填入并发送：  
   `Show me which desktop apps are open and suggest a form or repetitive task you can help with.`

### 批准权限（可能连弹 2 次）

1. 若出现 **Let Interpreter list your running apps and windows?**（列出正在运行的应用和窗口）→ 点允许 / Allow。
2. 若随后出现 **Let Interpreter inspect "Notepad"?** 或类似带应用名的框 → 再点允许。  
   控制（点击、打字）还可能再要一次 **control** 批准，同样允许。
3. 点拒绝则本条直接失败，换新代理重来。

### 看第一轮回答

通过（列举）：回答里能看到记事本 / Notepad、Interpreter、Chrome 等真实名字。

失败（到此停，把截图发我）：

- 「沙箱权限受限」
- 「缺少 Computer Use / CUA」
- 「请按 Ctrl+Shift+Esc 打开任务管理器」
- 工具记录里只有 `Get-Process` / `EnumWindows` / `tasklist`，没有 `list_apps`

### 第二轮：真的填

第一轮若只建议了任务、还没动手，在**同一对话**输入（整段复制）：

```text
请操作刚才看到的记事本：先列出它当前窗口里的文字，然后在末尾换行追加「Station桌面填表测试 2026-09-07」，不要另存为新文件。
```

若靶是 WPS：

```text
请操作当前打开的 WPS 工作簿：在 A1 写入「项目」，B1 写入「金额」，A2 写入「文具」，B2 写入 12.5。写完告诉我你改了哪一格。
```

### 你自己核对

1. 用鼠标点回记事本 / WPS，看内容是否真的变了。
2. Interpreter 对话里应有 `get_app_state` / `type_text` / `set_value` 一类 CUA 步骤，而不是让你自己去复制粘贴。

| 结果 | 列举：　　　填表：　　　|

---

## 用例 B — 录一条 skill（What's New 第 5 项）

测的是：把一段重复流程收成可再用的 skill，并在**新对话**里能被找到。

### 发起

1. 再点标题栏 **+**，新首页。
2. What's new 里找到 **Record a skill**（「Turn a repeated workflow...」）。
3. 点 **Try it**。应发送：  
   `Help me record a reusable skill for a workflow I do often.`
4. 等它问你要录什么时，**整段回复**：

```text
请把这个流程收成一条 skill，名字用 expense-total-read：
打开工作区 Demos/Expense Tracker/Expense Tracker.xlsx，用 openpyxl 读出费用金额列的合计，用中文告诉我合计是多少。
skill 建在当前工作区 .agents/skills/ 下，不要只口头说步骤。
建好后告诉我 SKILL.md 的完整路径。
```

### 过程中你要盯的

1. 它应去读或创建 `skill-creator`，然后**真的写文件**，不是只输出一段 Markdown 让你自己保存。
2. 左侧文件树点到工作区根，看有没有 `.agents`（没有就点刷新或切一下文件夹再回来）。
3. 展开应类似：

```text
My Workspace (1)
  .agents
    skills
      expense-total-read
        SKILL.md
```

4. 点开 `SKILL.md`，开头应有 `name:`、`description:`。

### 第二轮：新对话调用

1. 再点 **+** 开第三个新代理（不要接着上一条聊）。
2. 输入：`用 expense-total-read 读一下费用合计`
3. 通过：它按 skill 去读 xlsx，并给出一个数字合计。  
   失败：完全不认这条 skill，或又从零编一套无关步骤。

4. 也可打开左侧 **Skills**，看列表里有没有 `expense-total-read`。

| 结果 | 写出文件：　　　新对话能用：　　　路径： |

---

## 用例 C — Office：改表并保存（What's New 第 2 项后半）

读表已经过了。这里只测 **改盘 + 保存**。正文还写了保存前重算公式。

### 不要走的弯路

- 不要接着那条「QA-20260907 + npm install exceljs」的失败对话。
- 不要让它用 WPS / 微软 Excel COM 去改。失败标志是 `Excel.Application` / `80040154`。
- Demo 提示在表的第 11–13 行：用 `receipt.jpg` 填第 9 行。

### 操作

1. 标题栏 **+** 新代理。
2. 左侧展开 `Demos` → `Expense Tracker`，确认能看到：
   - `Expense Tracker.xlsx`
   - `receipt.jpg`
3. **先不要点开 xlsx 预览**（预览是用例 D）。底部输入框粘贴：

```text
打开 Demos/Expense Tracker/Expense Tracker.xlsx。
根据同一文件夹里的 receipt.jpg，用 openpyxl 填写第 9 行费用（日期、供应商、描述、类别、金额、支付方式、收据、备注）。
保存回原文件。如果有合计公式，保存前按你的表格规则重算或核对 SUM。
不要启动 Excel.exe 或 Excel COM。做完告诉我第 9 行每一列写了什么，以及文件路径。
```

4. 等它跑完（可能要装 `openpyxl`，这可以）。看工具是不是 Python / `openpyxl`。

### 你自己核对

1. 用资源管理器打开：  
   `C:\Users\65153\Documents\My Workspace (1)\Demos\Expense Tracker\Expense Tracker.xlsx`
2. 用 WPS 打开该文件（这次是你自己看，不是让模型开 COM）。
3. 第 9 行应有新数据；第 8 行及以前不应被清空。
4. 若合计还是空/错，记下来（公式里中英文「公司卡 / Corporate Card」本来就不一致，合计错要单独记，只要第 9 行写上了仍算「写入通过」。）

| 结果 | 第 9 行已写入：　　　原文件路径：　　　合计是否合理： |

---

## 用例 D — Office：侧栏点开预览（装 oo-editors）

和用例 C 不是一条路。C 是聊天改文件；D 是窗口里像 Word/Excel 那样打开。

### 先在浏览器把安装包下完（推荐）

1. 用 Chrome 打开：  
   `https://github.com/openinterpreter/oo-editors/releases/download/v1.0.40/oo-editors-windows-x64.zip`
2. 等约 136MB 下完。记住下载目录（一般是 `C:\Users\65153\Downloads`）。
3. **不要**在 Station 里连点 **Install oo-editors**（GitHub 未登录每小时 60 次，点光就全是限流）。

### 在 Station 里打开文件

1. 左侧点 `Demos` → `Expense Tracker` → **单击** `Expense Tracker.xlsx`（或 `Fill PDF Form` 里的 `Vendor Information.docx`）。
2. 中间主区应出现卡片：
   - 标题：**Compatible document engine required**
   - 按钮：**Install oo-editors**
   - 按钮：**Install from local file**
3. 若立刻出现 `No compatible document engine is configured` → 失败，截图。
4. 点 **Install from local file**（不要点上面那个 GitHub Install）。
5. Windows 文件框：
   - 右下角类型选 **zip** 或 **All files**（空列表时改 All files）。
   - 选刚下的 `oo-editors-windows-x64.zip`。
   - 确定。
6. 中间应进入 Installing / Preparing / Opening。装完应看到表格或 Word，而不是那张 Install 卡片。
7. 在预览里改一个无关紧要的格子（例如空白备注），用编辑器自己的保存（若有）。
8. 关掉预览标签，再用 WPS 打开同一文件，看改动是否写回。

安装目录（可用资源管理器核对）：`%APPDATA%\interpreter\document-engine`

| 结果 | 能选到 zip：　　　能打开：　　　保存写回：　　　|

---

## 用例 E — 浏览器控制（正式按首页走一遍）

扩展你之前初步连过。这里按首页按钮收口。

### 准备

1. Chrome 已装 Interpreter 扩展，版本和本机 relay 一致（见过  
   `C:\Users\65153\AppData\Roaming\interpreter\browser-extension-relay\0.0.123`）。
2. Chrome 打开一个内容明确的页，例如已打开的知乎或任意文章页，保持在前台标签。
3. Station 里 **+** 新代理。

### 点首页按钮

1. What's new 里找到 **Browser control**。
2. 按钮可能是三种之一：
   - **Set up browser**：还没连上扩展。点完应出现 **Connect browser access** 说明，按它去装/开扩展，然后 **Got it**。连上后再看按钮会不会变成 **Try it** 或 **Open browser**。
   - **Open browser**：扩展在但控制未就绪。点完按弹窗做。
   - **Try it**：已连上。点它应发送：  
     `Use the browser-control skill on the active Chrome extension browser-control tab. ...`
3. 若 Try it 发出后它还在问「请打开页面 / 请批准」，在 Chrome 里批准页面访问，回到 Station 回一句：`已经打开并批准了，继续读当前页`。

### 再补一句（同一对话）

```text
当前浏览器页面是什么内容？不要只念标题。
```

通过：能讲页面正文要点。  
失败：只复述标签标题；或说没有读页工具、请你自己截图。

| 结果 | 按钮当时是：　　　读到正文：　　　|

---

## 记结果（只填后面这几条）

```text
A 桌面填表  列举：        真写入靶窗口：
B 录 skill  写出 SKILL.md：        新对话能用：        路径：
C 改费用表第9行：        合计备注：
D 本地 zip 预览：        打开：        写回：
E 浏览器首页路径：        读到正文：
失败时的标签名 / 截图 / logs/session- 文件名：
```

失败先换 **新代理** 再试一次同一条；两次都一样再发我。

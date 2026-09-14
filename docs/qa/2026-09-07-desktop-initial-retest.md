# 桌面基础功能首次接手复测（2026-09-07）

## 状态

观察中。已确认可直接操作本仓库运行的 Electron 窗口；完成一条窗口列举 UI 用例，其他功能尚未复测。

## 现象

- `git rev-parse --show-toplevel` 返回 `D:/project/xiaoxin-workstation`。
- 当前 Interpreter 窗口所属程序位于本仓库 `node_modules/.pnpm/electron@42.5.1/node_modules/electron/dist/electron.exe`，不是 Chrome 中的 Vite 页。
- 通过桌面 UI 输入并发送：`基础功能 QA 复测：我当前电脑有哪些窗口？请使用桌面窗口列举能力获取实时结果，不要复用上一次回答。只列应用名称和窗口数量，不要读取窗口内容，也不要操作其他应用。`
- Qwen3.7 Plus 返回应用/窗口数量表，合计 18 个应用、22 个窗口，没有要求打开任务管理器。表中包含 Chrome、Firefox、Cursor、WPS 等实际运行应用。
- 相比已有回答，新增了 `codex-computer-use`（2 个窗口），与本次开启桌面测试工具的情境一致。但尚未逐项核验全部窗口，也未证明底层快照来源。
- 当前会话此前的 WPS 日历请求只显示“我来创建……”回复；本次没有核查文件，不能据此判断成功或失败。

## 原因

窗口列举响应符合交接文档预期的用户侧行为。是否经过自动 `list_apps` 上下文注入，尚未从日志完整追溯。

## 当前处理

只执行 UI 复测并补充本记录；保留现有代码及未提交改动，没有提交或 push。

## 复测

- 本次日志 `logs/session-2026-09-07T06-28-16.log` 在 `2026-09-07T06:46:43.007Z` 记录流完成，`durationMs: 8273`、`hadError: false`、`toolCallCount: 0`。零模型工具调用不证明前置辅助未调用 CUA。
- 后续继续确认底层清单来源、桌面实际填表、Office 改表保存/公式/预览、浏览器读页、Record a skill，以及 Overlay 回归。
- 本轮没有运行自动化测试套件，不代表全功能验收通过。

## 相关文件

- [功能交接](./2026-09-07-feature-handoff.md)
- 窗口列举 assist 已删除；后续复测看模型是否自己调用 `builtin-cua-driver__list_apps`

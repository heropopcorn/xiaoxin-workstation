# 小忻声称缺少桌面控制工具

## 状态

观察中；用户要求暂停修复，先继续其他基础功能测试。

## 现象

用户让小忻通过 CUA 激活 WPS、新建空白表格，在 A1/B1/A2 输入测试值并截图验证。小忻直接报告缺少 screenshot、click、type、focus 能力，没有执行桌面操作。用户提供的截图为本条证据。窗口列举曾成功，不能据此认定点击和输入已打通。

## 原因

未证实。仓库已有 `builtin-cua-driver` 和 `interpreter-app` CLI 指引；可能存在技能加载或工具入口识别问题，尚未追溯实际调用链。模型自述不能证明驱动确实缺失。

## 当前处理

已阅读相关工具指引与提示词代码；没有实施修复。按用户要求暂停。

## 复测

恢复排查时检查当前运行时技能加载、CLI 可用性及真实驱动调用结果，再重复 WPS 新建表格/输入/截图用例。必须验证实际单元格内容，不能将计划性回复当作完成。

## 相关文件

- `server/utils/mainAgentPrompt.ts`
- `server/utils/codexRuntime.ts`
- `resources/codex-skills/computer-use/SKILL.win32.md`
- [功能交接](./2026-09-07-feature-handoff.md)

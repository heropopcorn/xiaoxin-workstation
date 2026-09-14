# TODO：OIX 工具分流与工具面精简

**状态**：待优化  
**归属**：OIX 运行时 / harness；Workstation 负责提供复现、配置接入与验收  
**优先级**：中高

## 背景

在 Windows 桌面控制复测中，`qwen3.7-plus` 和 `qwen3.7-max` 没有稳定选择
Computer Use。工具链和 `builtin-cua-driver` 本身可用，但模型会优先使用通用
Shell，随后通过 `Get-Process`、`Start-Process`、`SendKeys` 或截图脚本尝试控制
GUI，并把这些旁路的失败误判成“桌面能力不可用”。

当前 Workstation 的规范边界是：模型通过 `interpreter-app` CLI 使用应用工具；
provider/model discovery、harness 选择、agent 执行和工具呈现属于 OIX。Workstation
不应为了提高命中率再创建一套 direct-MCP 工具面。

已经完成的止血处理：

- 删除在模型运行前通过正则或关键词预调用工具的 assist 路径。
- 提示和 `computer-use` skill 统一到真实的 `interpreter-app tools
  builtin-cua-driver ...` 调用方式。
- 明确禁止把 PowerShell/Win32 脚本当成 Computer Use 的 GUI 控制替代方案。
- 保留普通 Shell 能力；限制仅针对 GUI 发现与控制旁路。

这些修改解决了提示与运行配置冲突，但没有从根本上降低模型的工具选择难度。

## 待解决问题

OIX 需要提供原生的工具分流或工具面精简机制，使模型在桌面任务中不必从大量
无关工具和一个万能 Shell 之间自行猜测正确路径。

第一阶段建议做中等规模改造：

1. 在 OIX 中支持按会话配置工具组或命名空间 allowlist。
2. 提供精简的 Computer Use 工具组，只包含 Shell、CUA 和完成任务所需的少量
   基础能力。
3. 保留 Shell 用于代码、文件、构建和调用 `interpreter-app`，但不要把 Shell
   GUI 脚本作为桌面控制的等价路径。
4. 由显式工作模式、harness 配置或模型原生工具搜索选择工具组，不使用
   Workstation 侧正则、关键词门闩或预执行。
5. 在该方案证明有效前，不扩大为全自动的逐轮动态路由。

后续如果第一阶段仍不足，再评估较大的 OIX 改造：让模型通过原生 tool search
按需展开工具命名空间，并处理会话连续性、审批关联、日志、provider 兼容与失败
恢复。

## 禁止方案

- 禁止根据用户文本正则或关键词，在模型运行前调用 `list_apps`、
  `get_app_state`、`type_text` 或浏览器 inspect。
- 禁止把工具执行结果预先塞入上下文后告诉模型“操作已完成”。
- 禁止用 `if (user == ...)`、硬编码返回或更多措辞匹配提高演示通过率。
- 禁止在 Workstation 中复制 OIX 的 provider catalog、harness 或第二套模型工具
  协议。
- 禁止以隐藏或破坏正常 Shell 能力来换取 Computer Use 命中率。

## 验收标准

至少使用一个中档模型和一个高档模型重复验证以下真实路径：

1. 询问“当前打开了哪些窗口”：模型自己调用 Computer Use，发送后不存在模型
   运行前的秒触发权限请求。
2. 在已经打开的记事本中追加文本：模型使用 CUA 读取、操作并再次读取验证；
   不修改工作区 `Welcome.md`，不新开替代窗口。
3. 操作已经打开的 WPS 窗口：不使用 `Get-Process.MainWindowHandle`、
   `Start-Process`、`CopyFromScreen` 或 `SendKeys` 旁路。
4. 普通 Shell 回归：Git、构建、测试、文件搜索和普通命令执行仍可用。
5. 日志可以区分模型发起的工具调用和任何应用内部调用，并记录每轮提供给模型的
   工具数量与名称。
6. 连续多次运行达到约定成功率；不能以单次演示成功作为完成依据。

验收时按照 [Computer Use Verification](../cua-verification.md) 执行。直接调用
CLI 的 smoke 只证明驱动和权限链路，最终必须由 agent E2E 证明模型自主选择正确
工具并改变真实窗口状态。

## 相关代码

- `server/utils/codexRuntime.ts`：OIX 会话配置与模型工具通道。
- `server/utils/mainAgentPrompt.ts`：Workstation 开发者提示。
- `resources/codex-skills/computer-use/SKILL.md`
- `resources/codex-skills/computer-use/SKILL.win32.md`
- OIX app-server/harness：后续实现工具组与动态工具发现的主要位置。


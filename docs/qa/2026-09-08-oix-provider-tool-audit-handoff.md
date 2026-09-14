# OIX provider 工具注入与真实请求审计交接

日期：2026-09-08  
状态：Workstation 契约与日志语义已修复；OIX 网络出口审计待跨仓库完成  
范围：Workstation 主 Agent、OIX app-server、Alibaba Coding Plan / Qwen3.7 Max、Computer Use（CUA）

## 问题摘要

用户要求 Agent 读取已打开的 Windows 记事本，并在末尾追加文本。任务本应通过 `builtin-cua-driver` 完成，但 Agent 连续调用 Shell、PowerShell、Win32 API、UIAutomation 和 Python，运行二十多分钟仍未完成。

调查一度根据 Agent 事件日志中的 `transcript type="tools"` 判断“模型已收到 65 个工具，其中有 19 个 CUA 工具”。代码检查已经推翻该结论：该日志来自 `interpreter-app` CLI 的工具枚举，不是实际发送给模型 API 的函数工具目录。

## 用户可见现象与日志事实

原始测试请求：

> 请读取当前已经打开的记事本，在末尾换行追加“Station桌面控制测试”，不要打开新的记事本。

- Agent 连续执行 `command_execution`，尝试 PowerShell、C# Win32、UIAutomation、SendKeys、进程及端口探测。
- Shell 位于 `WinSta0\\CodexSandboxDesktop-*`，无法直接访问用户 `WinSta0\\Default` 桌面的记事本。
- 停滞后运行时注入过一次自动续跑消息，延长了错误路线。
- 强制要求“只调用 `builtin-cua-driver__list_apps`”时，Agent 没有产生标准工具调用。
- Agent 声称调用失败并收到 `missing field 'command'`，但事件日志没有对应工具调用或真实错误；该轮为 `toolCallCount: 0`。
- 当前实际模型为 `qwen3.7-max`，provider 为 Workstation 管理的 Alibaba Coding Plan provider。

## 已确认的关键断点

### 1. 运行配置明确关闭 direct MCP

`server/utils/codexRuntime.ts` 会删除调用方提供的 `mcp_servers`，随后在线程配置中强制设置：

```ts
mcp_servers: {} as unknown as JsonValue
```

`src/lib/codex/app-server-client.ts` 的 `withRequiredThreadConfig()` 同样强制使用：

```ts
mcp_servers: {}
```

启动 app-server 时还会传入：

```text
-c mcp_servers={}
```

当前架构注释明确表示：应用工具默认通过 Shell 可见的 `interpreter-app` CLI 使用，不提供第二套顶层 direct-MCP 工具表面。因此不能声称 `builtin-cua-driver__*` 已经作为顶层函数工具注入模型。

### 2. 提示词与真实配置矛盾

故障版本的 `buildCodexDeveloperInstructions()` 使用：

```ts
injectAppToolsAsMcp: true
```

由此生成的提示词告诉模型：本轮已经注入顶层 `builtin-cua-driver__*`，可以直接调用，且不得声称缺失。但实际线程配置仍是 `mcp_servers: {}`。

这会诱导模型调用不存在的顶层函数，或在无法调用后编造工具列表与错误解释。

### 3. `transcript type="tools"` 记录的不是模型工具

`server/utils/codexRuntime.ts` 的 `logAgentTurnContext()` 调用：

- `listInterpreterCliTools()`；
- `listInterpreterCliServerTools()`。

随后把 CLI 枚举结果传给 `agentLogging.logTools()`。这生成了包含约 65 个工具、19 个 CUA 工具的 `transcript type="tools"` 事件。

该列表的真实含义是“当前调用者通过 `interpreter-app` CLI 可以发现的应用工具”，不是 OIX 最终发给模型 API 的 `tools`。这是此前误判“模型能力差”的直接原因。

## 已确认与尚未确认

已确认：

- Workstation 能通过 CLI 枚举 CUA 工具。
- 主 Agent 线程配置清空了 `mcp_servers`。
- 提示词错误声称 direct CUA 已注入。
- 当前工具日志把 CLI 目录误标为模型工具目录。
- Shell 桌面隔离是正常安全边界，不能用提高 Shell 权限修复。

尚未确认：

- OIX 最终发送给 Alibaba 的 HTTP 请求体是否包含动态 `tools`。
- 工具名称和 JSON Schema 在协议转换后是否保持完整。
- Alibaba endpoint 是否过滤、截断、重命名或忽略工具。
- provider 原始响应是否包含未被 OIX 正确解析的 `tool_calls`。
- Qwen3.7 Max 在只提供一个 CUA 工具时是否能稳定调用。

因此，当前不能把故障归因于 Qwen3.7 Max 能力不足。

## 必须实现的 provider 网络出口审计

用户要求日志客观反映实际发给大模型的信息，中间不能留下不可观测断点。日志必须位于 OIX provider HTTP 客户端的最后发送出口和响应最前入口，不能只放在 Workstation 的请求准备阶段。

### `provider_request_prepared`

- correlation ID；
- thread ID、turn ID、attempt ID；
- provider ID、model ID；
- 最终 URL、wire API（`chat` / `responses` / `messages`）及 HTTP 方法；
- 最终请求 headers，移除认证、Cookie、签名等敏感字段；
- 最终序列化请求体；
- 请求体字节长度及 SHA-256；
- `tools` 数量和按发送顺序排列的完整工具名；
- 每个工具最终发送的名称、描述和 JSON Schema；
- `tool_choice`、parallel tool calls 等相关参数。

### `provider_request_sent`

- 相同 correlation ID；
- 实际写入 HTTP body stream 的字节长度和 SHA-256；
- 连接目标及发送结果。

`prepared` 与 `sent` 的长度和 SHA-256 必须一致；不一致必须显式报错。

### `provider_response_received`

- correlation ID、HTTP 状态码；
- 脱敏后的响应 headers；
- 可重放的原始响应流或原始响应体；
- 响应字节长度及 SHA-256；
- provider 返回的原始 `tool_calls` / function call 字段；
- OIX 解析后的工具名称与参数；
- 解析失败原因。

### 安全边界

- 永远不得记录 API Key、Bearer token、Cookie、签名或账号凭据。
- 完整消息正文可能包含隐私。完整 wire body 由显式诊断开关启用并写入本地受限文件；普通日志默认记录正文结构、长度、哈希及完整工具信息。
- 日志必须明确区分 `model_wire_tools`、`interpreter_cli_catalog` 和 `executed_tool_calls`。
- 客户端只能证明字节已交给连接并收到 provider 响应。若需要证明 provider 内部没有再次改写，必须结合 provider 侧日志或官方请求回显能力。

## Workstation 侧同步修复

1. 修正 `logAgentTurnContext()`：不要再把 CLI 目录记录成通用模型 `tools`；改为明确的 `interpreter_cli_catalog` 事件，或停止输出。
2. 修正提示词和配置矛盾：
   - 若维持 CLI-only 架构，把 `injectAppToolsAsMcp` 恢复为 `false`，指导模型通过 `interpreter-app` 调用 CUA；
   - 若开展 direct-MCP 实验，必须真正配置 OIX MCP server，并由最终 wire 日志证明工具进入模型请求，不能只修改提示词。
3. 保留 Shell 沙箱，不要让 Shell 进入用户 `Default` 桌面，也不要提升其桌面权限。
4. 增加调用次数、总时长和无进展熔断；自动续跑前检查是否只是在重复失败路线。

### 2026-09-09 实施进度

- 已将主 Agent 的 `injectAppToolsAsMcp` 恢复为 `false`，使提示词与 `mcp_servers: {}` 的 CLI-only 运行配置一致。
- 已调整 bundled `computer-use` 技能，明确通过 `interpreter-app tools builtin-cua-driver ...` 使用 CUA，不再优先推荐不存在的顶层 `builtin-cua-driver__*`。
- 已停止把 CLI 枚举结果写入模型 `transcript type="tools"`；该目录改为独立的 `diagnostic / interpreter_cli_catalog` 事件，并明确标记 `modelFacingTransport: "cli"`。
- OIX 最终 provider wire request/response 审计仍需在 OIX 源码仓库实现；本仓库不包含 provider HTTP 客户端源码，不能用 Workstation 侧日志替代。
- 针对性测试通过：`server/utils/codexRuntime.test.ts`、`server/utils/mainAgentPrompt.test.ts`、`src/lib/codex/bundled-skills.test.ts`，共 92 项。
- 两套 TypeScript 编译检查通过，Vitest 75 个文件、319 项测试全部通过。
- 完整 Bun 单元集运行到慢速 OIX 集成段后停止；停止前出现的失败为既有的文件监听时序、telemetry 测试状态和 OIX 清理超时，与本次修改文件无关。仓库总入口 `pnpm typecheck` 另被 `verify:xiaoxin-distribution` 中已有的 PowerShell 语法错误提前阻断。

## 验证顺序

1. 在 OIX provider 出口实现审计日志及自动化测试。
2. 使用本地伪 provider 捕获实际 HTTP body，断言审计日志的长度、哈希和工具数组与捕获内容完全一致。
3. 修复 Workstation 工具日志语义和提示词矛盾。（已完成）
4. 新建干净会话，仅向模型提供 `builtin-cua-driver__list_apps`。
5. 核对 Workstation 请求、OIX wire request、provider 接收、原始响应、OIX 解析、CUA 执行和桌面状态变化。
6. 单工具通过后逐步加入 `get_app_state`、`type_text` 等工具。
7. 最后恢复完整工具集合，比较工具数量增加前后的调用准确率。

## 验收标准

只有同时满足以下条件，才能声称“CUA 工具已经发送给模型并可用”：

- OIX 最终 wire request 的 `tools` 中存在目标工具；
- `provider_request_prepared` 和 `provider_request_sent` 的请求体哈希一致；
- provider 返回成功响应；
- 原始响应包含目标工具调用；
- OIX 将其解析为同名工具调用；
- Workstation 调用真实 CUA 驱动；
- 用户桌面目标窗口发生预期变化；
- 验证读取确认结果，而非只依据聊天文本声明成功。

## 禁止的修复方式

- 不用关键词、正则或硬编码请求预先替模型执行 CUA。
- 不继续添加“你已经拥有 CUA”的提示词，除非 wire request 能证明这一点。
- 不通过提高 Shell 权限或关闭桌面隔离解决。
- 不把类型检查、CLI 工具枚举或本地注册成功当作端到端验证。
- 不相信模型自述的工具列表、调用结果或错误；以 wire 日志和真实状态为准。

## 相关文件和记录

- `server/utils/codexRuntime.ts`
- `server/utils/mainAgentPrompt.ts`
- `src/lib/codex/app-server-client.ts`
- `resources/codex-skills/computer-use/SKILL.md`
- `resources/codex-skills/computer-use/SKILL.win32.md`
- `docs/qa/2026-09-08-oix-tool-routing-todo.md`
- `logs/session-2026-09-08T07-58-52.log`
- `logs/session-2026-09-08T07-58-52.agent-events.jsonl`

## 交接结论

故障版本同时存在三种矛盾状态：运行配置为 CLI-only，提示词声称 direct-MCP 已启用，日志又把 CLI 工具目录标记成模型工具目录。Workstation 侧前两项矛盾和误导日志现已修复；尚未完成的是 OIX provider 网络出口级审计。

后续应先恢复观测真实性，再决定维持 CLI-only 或实现真正的 direct-MCP。任何端到端结论都必须由 OIX provider 网络出口日志、provider 原始响应和实际桌面状态共同证明。

### 2026-09-09 更正：OIX provider 出口审计已内置，不需要跨仓库改动

上面"尚未完成的是 OIX provider 网络出口级审计"和"本仓库不包含 provider HTTP 客户端源码，不能用 Workstation 侧日志替代"两条结论已过时，需要更正。

实测发现：OIX（`openinterpreter/openinterpreter`，Workstation 当前 pin 的 `rust-v0.0.34`）自带一套诊断功能 `codex-rs/rollout-trace`，用环境变量 `CODEX_ROLLOUT_TRACE_ROOT=<目录>` 即可开启，**不需要重新编译 OIX、不需要改 OIX 源码**：

- 开启后，被 spawn 的 `interpreter` 进程每个新的根 thread 都会在该目录下写一个 trace bundle：`manifest.json` + `trace.jsonl`（按 `seq` 排序的原始事件，含 `inference_started` / `inference_completed` / `inference_failed`）+ `payloads/*.json`（每次尝试的完整原始请求体、以及成功/失败响应，含 `upstream_request_id` 和 token usage）。
- 已用 Workstation 当前打包的真实二进制（`resources/oix/win32-x64/bin/interpreter.exe`）跑通验证：`payloads/N.json` 里就是那次请求的完整 body——完整 system prompt、全部工具 JSON Schema（`exec`/`wait`/`request_user_input`/`collaboration.*` 等）、skills 列表、AGENTS.md 内容、environment_context、用户消息，一字不差；请求失败（如 401）时错误详情、`upstream_request_id`、部分响应也一并记录。
- 配套命令 `interpreter debug trace-reduce <bundle目录>` 能把原始事件归约成结构化 `state.json`，该子命令在 pinned 二进制里已确认存在。
- 已知局限：`record_started` 记录的是 codex-core 内部构建的"逻辑请求"对象。对走 Responses API 的路径这基本等于最终 wire body；但对走 `stream_chat_completions_compat`（chat-completions 兼容层，Alibaba/Qwen 等 provider 可能走这条路）的请求，记录的可能是转换前的形态，尚未针对 Alibaba provider 实测确认字节级一致性，需要单独验证再作为"确凿证据"使用。

已落地的 Workstation 侧改动（零 OIX 源码修改）：

- `src/lib/codex/app-server-client.ts` 新增 `resolveRolloutTraceRoot()` 与 `buildCodexSpawnEnv()` 的 `rolloutTraceRoot` 参数：仅当宿主进程环境变量 `WORKSTATION_ROLLOUT_TRACE=1` 时，才把 `<codeHome>/rollout-traces` 作为 `CODEX_ROLLOUT_TRACE_ROOT` 传给被 spawn 的 OIX 进程；默认不设置，也会主动清除从 `baseEnv` 继承来的同名变量，避免诊断开关意外泄漏成默认行为。
- app-server 长驻进程与 `runCodexCli` 一次性调用两个 spawn 点都已接入。
- 单测：`src/lib/codex/app-server-client.test.ts` 新增 4 个用例覆盖"未开启时不设置该变量 / 显式传入时正确转发 / 开关默认关闭 / 开启后路径拼接正确"。

结论：验收标准里"OIX 最终 wire request 的 `tools` 中存在目标工具"和"provider 返回的原始响应"这两项证据，现在可以直接通过开启 `WORKSTATION_ROLLOUT_TRACE=1` 跑一次真实会话、读取 `<codeHome>/rollout-traces/trace-*/payloads/*.json` 获得，不再是阻塞项。下一步排查 CUA 工具未注入问题时，应优先用这个开关抓一次真实请求，而不是继续依赖模型自述或 CLI 工具枚举。

### 2026-09-09 二次更正：真实 Alibaba/Qwen（chat-completions-compat）会话未产生任何 inference 级 payload——上面"已内置"的结论对当前默认 provider 不成立

用户在真机上按上面步骤开启 `WORKSTATION_ROLLOUT_TRACE=1`、用当前默认 profile（`Qwen3.7 Max`，`provider_name=interpreter-app-alibaba-coding-plan-8c125cfa`，`wire_api=chat`，走 `stream_chat_completions_compat`，非 Responses API）发了一句"你好"做验证。结果：

- bundle 确实生成了（`manifest.json` + `trace.jsonl` + 4 个 `payloads/*.json`），证明 Workstation 侧的 `WORKSTATION_ROLLOUT_TRACE=1` → `CODEX_ROLLOUT_TRACE_ROOT` → OIX 写 bundle 这条链路本身是通的。
- 但 `trace.jsonl` 里全部 7 条事件只有 `rollout_started` / `thread_started` / `session_configured`(protocol event) / `codex_turn_started` / `turn_started`(protocol event) / `codex_turn_ended` / `turn_complete`(protocol event)，**一条 `inference_started` / `inference_completed` / `inference_failed` 都没有**。4 个 `payloads/*.json` 对应的分别是 session_metadata、session_configured、task_started、task_complete，没有任何一个包含发给模型的 `messages`/`tools` 或模型的原始响应体。`payloads/4.json`(`task_complete`) 只有 `last_agent_message` 这一句最终文本和耗时统计，没有中间的请求/响应。

也就是说，上一条更正里"OIX 内置的 rollout-trace 已经解决 provider 出口审计"这个结论，**只在走 Responses API 的路径下（之前用默认 OpenAI profile 跑 `interpreter exec` 验证的那条路）成立，对本项目实际在用的 Alibaba/Qwen chat-completions-compat 路径不成立**——尽管读取本地 `codex-rs/core/src/client.rs` 源码（`rust-v0.0.34` tag）能看到 `stream_chat_completions_compat` 函数里明确调用了 `inference_trace.start_attempt()` 和 `record_started(&request)`，实际打包二进制跑出来的结果里这条路径完全没有留下任何 inference 级痕迹。这中间的落差还没查清楚，可能是：

- pin 的发布二进制（`rust-v0.0.34` release 产物）和本地 clone 的 `rust-v0.0.34` tag 源码之间存在未知差异（例如 release 分支 cherry-pick 顺序、私有构建配置差异）；
- 或者 `inference_trace_context()`/`start_attempt()` 内部还有一层没读到的启用条件（比如按 provider 类型或 API key 来源做的静默降级）；
- 或者 trace writer 在这条路径上真的尝试写了但被某个更早的 early-return 跳过（需要在源码里对 `ChatCompletionsCompatClient` 和 `map_response_stream` 的调用链继续往下追，而不是只看到调用点就假设它一定执行到)。

**结论更新**：`WORKSTATION_ROLLOUT_TRACE=1` 这个开关本身按预期工作（Workstation 侧改动不需要再动），但它目前**不能**作为本项目默认 provider（Alibaba Coding Plan / Qwen3.7 Max）的 wire-level 证据来源。CUA 工具是否被注入给 Qwen 这个问题，仍然拿不到"最终 wire request 里 tools 数组"这一实锤证据——这条路径需要继续往 OIX 源码里挖，或者退回到之前讨论过的 MITM 代理方案，才能拿到 Alibaba/Qwen 这条链路上的真实请求体。

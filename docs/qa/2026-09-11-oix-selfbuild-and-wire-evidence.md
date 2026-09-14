# OIX 自建验证与 wire 级工具注入证据

日期：2026-09-11
状态：根因已用 wire 证据确认；OIX 源码自建已验证可行；替换 `interpreter.exe` 的正确入口已定位
范围：Workstation 主 Agent 工具面、OIX 运行时源码构建、技术路线可行性

## 结论摘要

1. **模型不调 Computer Use 的原因已经用实锤证据确认：CUA 工具从来没有进入发给模型的 `tools` 数组。** 不是模型能力问题，不是被截断或改名，是根本没注入。
2. **harness 劫持问题已经真正修掉了。** wire request 里的系统提示词是 Workstation 自己的，不是 Qwen-CLI 人格。这条老怀疑可以结案。
3. **缺陷在 Workstation 侧，不在 OIX。** 是本仓库三处写死的 `mcp_servers: {}` 把 CUA 挡在模型工具表之外，OIX 只是照配置执行。
4. **OIX 源码可以自建出能替换在发二进制的产物，已实测通过。** 因此"因为上游所以
   改不了"这个约束不成立。
5. **依赖闭包裁剪的上限是 25%，不是"大部分"**，而且只有换掉发布入口才拿得到。

## 一、wire 级证据：`tools` 数组里没有 CUA

此前 `docs/qa/2026-09-08-oix-provider-tool-audit-handoff.md` 的结论是：要拿到 Alibaba/Qwen（`stream_chat_completions_compat`）链路的真实请求体，OIX 内置的 `CODEX_ROLLOUT_TRACE_ROOT` 不产生 inference 级 payload，只能退回 MITM 代理方案。

**该代理已经存在**：SupplyChain 的 LLM 网关会把每次调用的完整请求体落盘到
`SupplyChain/supply-chain-supply/logs/llm-gateway/call-<时间>-<id>/request.json`。

解析 `call-20260911-094204-d2d4ef52`（`qwen3.7-plus`，streaming）：

| 项 | 值 |
|---|---|
| `tools` 数量 | 13 |
| 其中 CUA 工具 | **0** |
| `tool_choice` | `"auto"` |
| system 消息 | 10,940 字 |
| user 消息 1 | 36,617 字（App Tools 说明 + skills 目录） |
| user 消息 2 | 945 字（`<environment_context>`） |
| user 消息 3 | 48 字（真实用户输入） |
| user 消息 4 | 6,282 字（`computer-use` SKILL.md 全文） |

实际发送的 13 个工具：

```
shell_command                    <- 唯一能操作操作系统的
update_plan
request_user_input
view_image
multi_agent_v1_close_agent
multi_agent_v1_resume_agent
multi_agent_v1_send_input
multi_agent_v1_spawn_agent       <- 描述 5,058 字
multi_agent_v1_wait_agent
get_goal
create_goal
update_goal
web_search
```

也就是说：**模型要控制桌面，唯一路径是在 `shell_command` 里拼对一条命令行**，而提示词用四万多字教它怎么拼。

对照 `call-20260910-154943-4ca96069`（48 条消息的真实会话）的行为，完全吻合：

```
[5]  assistant -> shell_command
[7]  assistant -> shell_command
[9]  assistant -> shell_command
...  连续 21 次，全程只有 shell_command，没有出现过第二种工具
```

这解释了 `docs/qa/2026-09-08-oix-tool-routing-todo.md` 记录的现象（模型优先用通用 Shell，再用 `Get-Process` / `Start-Process` / `SendKeys` 试图控制 GUI）：模型没有跑偏，它手里只有一把锤子。

### 附带结论：harness 劫持已修复

system 消息开头是 `## Core behavior / You are Interpreter, a desktop agent`，即 Workstation 自己的 developer prompt。不是 `default_harness_for_provider_model` 按模型名匹配换上的 Qwen-CLI 人格。客户端把 `harness` 序列化为 `""`（`Harness::Native`）的处理是有效的。

那条 36,617 字的消息是 Workstation 自己的 skills 目录注入，不是 harness 塞进来的固定文档。此前把两者混为一谈的判断需要更正。

## 二、根因：CLI-only 架构

`tools` 数组由 OIX 依据线程配置组装。本仓库在三处强制清空 MCP server：

- `src/lib/codex/app-server-client.ts` 的 `withRequiredThreadConfig()`：`mcp_servers: {}`
- `server/utils/codexRuntime.ts` 的线程配置
- 启动 app-server 时的 `-c mcp_servers={}`

因此 `server/utils/codexRuntime.ts` 里的 `injectAppToolsAsMcp: false` 是**正确的**——提示词不能声称注入了实际不存在的顶层工具。2026-09-09 有人把它改成 `true` 又改回，原因正是只改提示词会让提示词撒谎。

这是上游 Workstation 的架构选择：模型可见的应用工具只走 `interpreter-app` CLI（见 `docs/overlay-architecture.md`：“The shared runtime starts app turns with `mcp_servers: {}`”）。对写代码的 agent 合理；对以桌面控制为核心能力的产品是致命的。

机制本身是现成的，缺的只是接线：

| 需要的零件 | 现状 |
|---|---|
| 暴露全部工具（含 CUA）的 MCP server | `server/routes/mcp.ts`（Streamable HTTP，原本给外部 MCP 客户端用） |
| 只放指定工具的白名单 | `server/utils/toolScope.ts` 的 `createAllowedToolSet` / `matchesAllowedToolScope` |
| OIX 侧消费 MCP server | `src/lib/codex/mcp.integration.test.ts` 有 HTTP transport 用例 |
| 提示词的 direct-tools 分支 | `server/utils/mainAgentPrompt.ts` 的 `injectAppToolsAsMcp: true` 分支 |
| wire 级验收证据 | SupplyChain 网关日志 |

**待决策**：打通这条路要覆盖 `AGENTS.md` 中继承自上游的约束
“Model-facing Workstation tools use the `interpreter-app` CLI surface. Do not
introduce a parallel direct-MCP tool surface for the model.”
该约束保护的是上游 CLI-only 架构，不是安全边界。是否在本产品线覆盖它需要显式决定，不得静默绕过。

## 三、OIX 源码自建验证

### 源码位置

见 `docs/xiaoxin-upstream.md` 的 `## OIX runtime source`。要点：源码在
`D:\project\openinterpreter-oix`，tag `rust-v0.0.34`，commit
`52a31019714294add53cafbc5268e1467b471263`，与 `resources/oix/VERSION` 一致。
它在本仓库和编辑器 workspace 之外，仓库级搜索搜不到——不要因此判断源码不存在。

### 构建实测结果

```
cargo build --release -p codex-app-server     EXIT=0      24 分 42 秒    296,898,560 字节
cargo build --release -p codex-cli            EXIT=0     约 95 分钟      359,813,120 字节
对照 在发的 interpreter.exe                                              359,823,872 字节
```

`codex-cli` 的产物与在发二进制只差 10,752 字节，**且已验证可以直接替换**（见下）。

### 五个构建障碍与解法

| 障碍 | 原因 | 解法 |
|---|---|---|
| 无 Rust 工具链 | — | 装 1.95.0（`codex-rs/rust-toolchain.toml` 钉定） |
| `cargo` 无法拉取 git 依赖 | 系统代理在 `localhost:15236`（WinINET），**git/libgit2 不读该配置** | 为构建进程设置 `HTTP_PROXY`/`HTTPS_PROXY` + `CARGO_NET_GIT_FETCH_WITH_CLI=true`；不要改全局 git 配置 |
| `v8-149.2.0` build script 创建符号链接失败（错误码 1314） | Windows 需要 `SeCreateSymbolicLinkPrivilege` | 提权执行构建。**开发者模式对此无效**，因为 Rust std 的 `symlink_dir` 不传 `ALLOW_UNPRIVILEGED_CREATE` |
| V8 预编译静态库下载失败 | build script 的 Python/curl 未走通代理 | 预先下载到它的缓存路径 `%USERPROFILE%\.cargo\.rusty_v8\https___github_com_denoland_rusty_v8_releases_download_v149_2_0_rusty_v8_release_x86_64_pc_windows_msvc_lib_gz`（38,882,282 字节） |
| `codex-app-server` 编译失败：`queries overflow the depth limit` | **上游疏漏**：`app-server/src/main.rs` 缺 `#![recursion_limit = "256"]` | 加该属性 |

最后一条值得单独记录。`cli/src/main.rs:1`、`code-mode-host/src/main.rs:1`、
`windows-sandbox-rs` 的两个 bin、以及 `app-server/src/lib.rs:1` 都有这个属性，
只有 `app-server/src/main.rs` 没有。上游只发 `codex-cli`，从未直接构建
`codex-app-server` 这个二进制，所以该缺陷一直存在。这是“源码在手”带来的第一个
实际收益：一行修复，不需要等上游。

补充事实：`codex-app-server` 依赖 V8 引擎，这是二进制体积的主要来源；即使砍掉
TUI，体积也只从 343 MB 降到 283 MB。另外自建仍然依赖 denoland 提供的预编译 V8
静态库（除非从源码构建 V8，那是另一个量级的工程）。

### `codex-app-server` 不能直接替换 `interpreter.exe`

实测替换后应用降级启动，报：

```
[oix-runtime] No valid bundled Open Interpreter runtime was found.
Checked packages: ..., D:\project\xiaoxin-workstation\resources\oix\win32-x64, ...
```

拒绝点是 `server/utils/oixRuntime.ts` 的 `resolveOrInstallOixRuntime()` 第 809 行
`if (!(await probeBinary(bundledBinary))) continue;`。`defaultProbeBinary()`
要求两条同时成立：

```ts
/\binterpreter\s+\d+\.\d+\.\d+/i.test(`${versionOut}\n${versionErr}`) &&
/--listen\b/.test(`${helpOut}\n${helpErr}`)   // 来自 `<bin> app-server --help`
```

自建的 app-server 两条都不过：`--version` 输出 `codex-app-server 0.0.34`（无
`interpreter` 词），且它没有 `app-server` 子命令（它本身就是 app-server）。

**这不是校验太严，是真实不兼容。** Workstation 依赖的是 CLI 多路复用器：

- `app-server`（`server/handlers/codexServer.ts:45` 的 `spawn(codex_path, ['app-server'])`）
- `mcp list --json` / `mcp logout <name>`（`src/lib/codex/app-server-client.ts:2611`、`:2625`）
- `interpreter-app tools ...`（模型可见的应用工具通道）
- `debug trace-reduce`

因此正确的自建入口是 `codex-cli`。**禁止**通过放宽 `defaultProbeBinary` 的正则来
让不兼容的二进制通过校验——那是掩盖问题，不是解决问题。

### `codex-cli` 自建产物已验证可直接替换

```
自建 codex.exe                --version -> codex 0.0.34          门槛1 不过
同一文件改名 interpreter.exe  --version -> interpreter 0.0.34    门槛1 通过
                              app-server --help 含 --listen      门槛2 通过
子命令 mcp / tools / debug / app-server                          齐全
```

品牌不是编译期开关，而是**按可执行文件名做的运行时判定**：
`codex_product_info::Product::current()` 决定 `--version` 的名字、配置目录
（`~/.codex` 对 `~/.openinterpreter`）、项目级配置目录（`.codex/` 对
`.openinterpreter/`）以及 `request_user_input` 等默认特性开关。对应测试是
`codex-rs/cli/tests/product_identity.rs`。

所以自建流程是：`cargo build --release -p codex-cli` 之后把 `codex.exe` 改名为
`interpreter.exe` 即可，不需要改任何 Workstation 代码，也不需要动校验正则。

## 四、依赖闭包裁剪测算

用本地 Cargo.toml 静态求闭包（排除 dev-dependencies，无需联网；脚本见
`D:\project\openinterpreter-oix\_closure.mjs`）。`codex-rs` 下解析到 135 个包，
workspace 显式成员 129 个。

| 发布入口 | 闭包内（保留） | 闭包外（可删） | 可删占比 |
|---|---|---|---|
| `codex-cli`（当前做法） | 122 个 / 1,160,887 行 | 13 个 / 17,621 行 | **1.5%** |
| `codex-app-server` | 99 个 / 881,542 行 | 36 个 / 296,966 行 | **25.2%** |
| `app-server` + `mcp-server` + `code-mode-host` | 101 个 / 887,777 行 | 34 个 / 290,731 行 | 24.7% |

可删部分的 74% 是单个 crate：`codex-tui`，219,472 行。其余为 `cli`、`exec`、
`cloud-tasks`、`acp-server`、`mcp-server`、`ollama`、`lmstudio`、
`responses-api-proxy` 等本产品线不使用的组件。

剩余 88 万行不可删，因为那是 app-server 的真实依赖（会话、工具、provider、
沙箱都在 `core`）。**“一百多万行大部分用不到”不成立；用不到的是四分之一。**

由此得到的可行形态：既然源码在手，可以构建 `codex-cli` 保持入口兼容，同时从
`cli/Cargo.toml` 摘掉 `codex-tui`（第 61 行 `codex-tui = { workspace = true }`）
并移除 TUI 子命令，兼得入口兼容与 25% 裁剪。此形态尚未实施。

## 五、路线判断

- 继续当前形态（吃上游 release 二进制）：可行但不可控，且已被证明会遇到修不了的
  上游缺陷。
- 自建 OIX（fork + 钉住 + 自己构建）：**已验证技术可行，产物可直接替换**。代价是
  构建基建（代理、提权、V8 预编译库、343 MB 产物的存放）与 Rust 维护能力。
  fork 在 <https://github.com/heropopcorn/xiaoxin-oix>，分支
  `xiaoxin/rust-v0.0.34`。
- 重写 app-server（自己实现协议服务端）：本次未推进。补充测量：事件流消费端
  `src/lib/codex/event-mapper.ts` 只有 314 行且以 `.otherwise(() => [])` 收尾，
  未识别的通知被静默忽略，因此协议保真的风险低于先前估计。协议规模见
  `src/lib/codex/protocol.ts`：33 个客户端方法、26 个服务端通知、7 个服务端请求。

**当前证据指向的下一步不是换底座，是先修本仓库的工具注入。** 已暴露的缺陷不在
OIX 里。

## 六、未完成事项

1. 自建二进制**尚未实际装进应用跑过**。`defaultProbeBinary` 两道门已验证通过，
   但还没有替换 `resources/oix/win32-x64/bin/interpreter.exe` 并完整启动一次
   Workstation 做端到端确认。
2. CUA 工具注入未实施。验收必须以网关 `request.json` 的 `tools` 数组为准。
3. 自建产物没有分发通道。约 343 MB 的二进制不能进 git，`scripts/download-oix.mjs`
   目前取的是上游 release。要把自建产物变成默认，需要先有存放处。
4. fork 尚未转成 submodule。现在只是并列的本地 checkout，`docs/xiaoxin-upstream.md`
   记的是路径而不是钉定 commit（可参照 `submodules/interpreter-cua` 的形态）。
5. `pnpm typecheck` 仍被 `verify:xiaoxin-distribution` 中既有的 PowerShell 语法
   错误提前阻断（`Unexpected token 'off'`）。直接运行 `npx tsc --noEmit` 与
   `npx tsc -p tsconfig.electron.json --noEmit` 可通过。
6. 本次为验证替换而做的环境改动：已开启 Windows 开发者模式注册表项
   `AllowDevelopmentWithoutDevLicense=1`；`resources/oix` 与已安装的 standalone
   包中各留有 `interpreter.exe.orig-cli` 备份（359,823,872 字节），二进制已还原为
   原始 CLI。

## 七、禁止的做法（重申并补充）

沿用 `docs/qa/2026-09-08-oix-provider-tool-audit-handoff.md` 的禁令，并补充：

- 不得放宽 `defaultProbeBinary` 的校验正则去接纳不兼容的二进制。
- 不得只翻 `injectAppToolsAsMcp` 为 `true` 而不真正配置 MCP server；提示词必须与
  线程配置一致。
- 不得用关键词、正则或硬编码在模型之前代跑 CUA。
- 端到端结论必须由 wire request 的 `tools` 数组、模型原始响应中的 tool_call、以及
  真实桌面状态变化共同证明，不得依据聊天文本或 CLI 工具枚举。

## 相关文件

- `src/lib/codex/app-server-client.ts`（`withRequiredThreadConfig`、`runCodexCli`）
- `server/utils/codexRuntime.ts`（`injectAppToolsAsMcp`、线程配置）
- `server/utils/oixRuntime.ts`（`defaultProbeBinary`、`resolveOrInstallOixRuntime`）
- `server/utils/mainAgentPrompt.ts`（CLI-only 与 direct-MCP 两套提示词分支）
- `server/routes/mcp.ts`、`server/utils/toolScope.ts`
- `src/lib/codex/event-mapper.ts`、`src/lib/codex/protocol.ts`
- `docs/xiaoxin-upstream.md`（OIX 源码位置与构建复现悬案）
- `docs/qa/2026-09-08-oix-provider-tool-audit-handoff.md`
- `docs/qa/2026-09-08-oix-tool-routing-todo.md`

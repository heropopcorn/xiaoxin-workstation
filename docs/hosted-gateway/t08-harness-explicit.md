# T08 · harness 显式化（禁止 OIX 按模型名猜 harness）

状态：**代码已改并已用真机验证主路径；待补单测与本地模型侧复测**
日期：2026-09-10

## 目标

客户端下发给 OIX 的每个 profile 都**显式**声明 harness，不再留空让 OIX 按模型名猜。
做完后可观察的变化：模型名里带 "qwen" 的 profile（云端 `qwen3.7-max`、本地 `qwen3:32b`）
不再被替换成 "Qwen Code" 固定人格，Workstation 自己的 developer instructions 与工具面能正常送达模型。

## 现状（动手前核实到的事实，均带行号）

问题链路是一条从客户端一路穿到 OIX 内部的完整链：

1. `C:\Users\65153\.openinterpreter\config.toml` 里**没有任何 profile 设置过 `harness` 字段**（实测 grep 无命中）。
2. `codex-rs/core/src/config/mod.rs:3587-3591`
   ```rust
   let harness = cfg.harness.clone().or_else(|| {
       default_harness_for_provider_model(&model_provider_id, &model_provider, model.as_deref())
   });
   ```
   没配 `harness` 就交给"猜"函数。
3. `codex-rs/model-provider-info/src/lib.rs:199-210`（函数从 `:162` 起）：模型名只要**包含 `"qwen"`**
   （或 provider id/name 命中 qwen/dashscope，或 baseURL 是 dashscope），直接返回 `"qwen-code"`。
   注意第一个条件 `model.contains("qwen")` 是**只看模型名**的，provider 类型和 baseURL 根本不参与判断。
4. `codex-rs/core/src/harness/routing.rs:90-91`：命中后走 `ChatHarnessRoute::QwenCode`，
   一条与正常 `ChatCompletionsCompat` 完全不同的分支。
5. `codex-rs/core/src/harness/request.rs:167` → `build_qwen_code_request(...)`
   （`codex-rs/core/src/harness/qwen_code.rs:11-12`）：system prompt 是编译期内联的固定文件
   `QWEN_CODE_SYSTEM_PROMPT = include_str!("qwen_code_prompt.md")`，并硬编码 `QWEN_CODE_DEFAULT_MAX_TOKENS = 8_000`。
6. `codex-rs/core/src/client.rs:1799`：这条分支里 `InferenceTraceAttempt::disabled()` 是**硬编码**的，
   所以 `WORKSTATION_ROLLOUT_TRACE=1` 在这条路径上永远抓不到 inference 级 trace
   —— 这解释了 `docs/qa/2026-09-08-oix-provider-tool-audit-handoff.md` 里那条一直没查清的"落差"。

### 字节级实证

用网关抓到的真实请求 `logs/llm-gateway/call-20260910-094533-acde4d3e/request.json`：

- `messages[0].role == "system"`，长度 **24354 字符**
- `qwen_code_prompt.md` 文件长度 **24355 字节**（差的 1 字节是被 `qwen_code.rs:226` 的 `trim_end_matches('\n')` 去掉的尾换行）

两者严丝合缝对上，且全文 grep `builtin-cua-driver` / `interpreter-app` / `AGENTS.md` / `computer-use` **零命中**。
即：Workstation 的开发者指令一个字都没拼进去，system prompt 就是那份固定人格的原样内容。

## 方案

改客户端配置生成，不碰 OIX 源码（遵守 `docs/xiaoxin-upstream.md`："Do not patch OIX behavior in this repository"）。

有个**必须踩准的坑**：不能简单传 `harness: null`。
`codex-rs/config/src/config_toml.rs:164` 里 `pub harness: Option<String>`，JSON/TOML 的 `null` 会反序列化成 `None`，
而 `None` 在上面第 2 步的 `.or_else()` 里**照样会触发猜测**，等于没设。
只有 `codex-rs/tools/src/harness.rs:23-25`（`from_config_name`）：

```rust
match name {
    None | Some("") => Self::Native,
```

`Some("")`（显式空字符串）才会稳定解析成 `Harness::Native`。
所以 TS 层用 `null` 表达"要 native"，在**发给 OIX 的边界上转成 `""`**。

没选的替代方案：
- 改 OIX 的 `build_system_prompt()` 让它把 developer instructions 拼进去 —— 属于改别人的 harness 实现，风险高且治标：
  就算拼进去，"你是 Qwen Code，一个命令行编程工具" 这个开场定性 + 8000 token 上限本身就不适配桌面 agent 场景。

## 改动清单

- `src/lib/codex/profiles.ts`
  - 重写 `Profile.harness` 的文档注释：讲清自动探测的触发条件、危害，以及 `null` 必须序列化成 `""` 的原因（原注释"Null explicitly requests native Codex"是错的，会误导人直接下发 `null`）。
  - `buildProfileFromPreset()` 返回对象新增 `harness: null`，覆盖所有 preset 路径（Ollama / LM Studio / 各类自定义 preset）。
- `server/utils/codexRuntime.ts`
  - `codexProfileFromStoredProfile()` 自定义 profile 分支：`harness: profile.harness` → `harness: profile.harness ?? null`（保留用户显式指定的 harness）。
  - `runCodexAgentTurn()` 的 `threadConfig`：`{ harness: profile.harness }` → `{ harness: profile.harness ?? '' }`，在 wire 边界把 `null` 归一成 `""`。

## 验收

已完成：

- `pnpm exec tsc --noEmit -p tsconfig.json` 通过；`pnpm exec tsc -p tsconfig.electron.json --noEmit` 通过。
- 真机复测（云端 `Qwen3.7 Max` 经网关）：用户确认对话恢复正常。

- **单测已解锁并跑过**（2026-09-10 补）：装上 bun 1.4.2 后 `pnpm run test:unit` 可运行。
  注意 Windows 上 npm 全局装的 bun 只在 PATH 上留了 `bun.cmd` shim，
  而 `scripts/run-unit-tests.mjs` 用 `execFileSync('bun')` 起进程、不解析 `.cmd`，
  需要把 `C:\nvm4w\nodejs\node_modules\bun\bin`（真实 `bun.exe` 所在目录）加进 PATH。
  全量结果 4081 通过 / 4 跳过 / 55 失败；失败集中在并行跑的 `.integration.test.ts`（争抢真实 app-server 与二进制资源），
  单独跑同一文件即通过，与本次改动无关。
- **两条针对性单测已补**（2026-09-10 补）：
  - `src/lib/codex/profiles.test.ts`："every preset requests the native harness rather than leaving it unset" ——
    遍历 `CUSTOM_PRESETS`，断言 `buildProfileFromPreset()` 产出的 `harness` 严格等于 `null`。
  - `server/utils/codexRuntime.test.ts`："sends a native harness request as the empty string, never as null" ——
    断言 wire 边界把 `harness: null` 序列化成 `''` 而非 `null`，用的模型 id 带 "qwen"（正是会触发自动探测的那种）。
  两个文件合计 98 项全过。

未完成 / 已知限制：

- **本地 Ollama 侧未复测**：本地 `qwen3:32b` 走的是同一处修复，但尚未真机验证过工具调用行为。
- **`pnpm typecheck` 总入口仍被既有问题阻断**：`verify:xiaoxin-distribution` 里的 PowerShell 语法错误（既有问题，非本次引入），
  见总任务书 T10。

## 结论

根因是 OIX 的 harness 自动探测按**模型名字符串匹配**决定人格，与实际 provider 无关；客户端从不显式声明 harness，等于把这个决定权交了出去。
改法是在客户端侧把 harness 显式化，并在 wire 边界用空字符串表达 native。
主路径已由真机确认恢复，但单测与本地模型侧复测尚未完成，**不能声称本项已完整通过**。

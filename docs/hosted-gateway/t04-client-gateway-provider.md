# T04 · 客户端接入网关 provider

状态：**已完成（数据层）** —— 端点注入、provider profile、模型清单取数链路均已落地并真机验证；
UI 渲染归 T05，生产网关主机名待定
日期：2026-09-10
落地仓库：`D:\project\xiaoxin-workstation`

## 目标

客户端默认指向我方网关，不在源码里硬编码端点，并且不被 OIX 的 harness 自动探测污染。

## 已完成的改动

- **`shared/productConfig.ts`**：`DistributionProductConfig` 新增 `modelGatewayBaseUrl`。
  文档注释写明它与 `hostedApiBaseUrl` 的区别（后者派生 `{base}/v0/openrouter` 且走 Responses，
  我们的网关是普通 Chat Completions base，并且自己拥有模型目录）。
  没有在这里加 `hasModelGateway()`：那样会出现一个不认环境变量覆盖的判定函数，与运行时真正用的 URL 不一致。
- **`product.json` / `distribution/product.official.json` / `distribution/product.xiaoxin.json`**：
  三处都加上 `modelGatewayBaseUrl`，当前**值都为空**。
  小新 overlay 之所以还没填，是因为生产网关主机名还没定；
  `scripts/verify-xiaoxin-distribution.mjs` 目前断言该 overlay 的托管端点全为空，填值时要同步更新那份边界断言。
- **新增 `shared/modelGateway.ts`**：`getModelGatewayBaseUrl()` / `hasModelGateway()`，
  支持环境变量 `INTERPRETER_MODEL_GATEWAY_BASE_URL` 覆盖（开发期指向本机网关，不用改发行版 overlay）。
- **`src/lib/codex/profile-options.ts`**：新增 profile id `model-gateway`，标签 "Online models"。
- **`src/lib/codex/profiles.ts`**：新增 `MODEL_GATEWAY_PROFILE`，`wire_api: "chat"`、`harness: null`（native）、
  **不带 `model`**（模型由服务端目录决定，客户端不钉死）。`getProfile()` 每次读取时重算 `base_url`，
  因为环境变量覆盖是进程状态而不是构建状态。

运行时链路已经通：`codexProfileFromStoredProfile` → `codexProfileFromExplicitId('model-gateway')` →
`getCodexProfile('model-gateway')`（`model-gateway` 不是 CustomPreset，所以走非 preset 分支），
provider 由 `service.ts` 的 `provisionProvider()` 写入 `model_providers.model-gateway`，
每轮对话还会随 `runConfig.model_providers` 再带一次。用户选的模型经 `requestedModel` 覆盖生效。

类型检查：`tsc -p tsconfig.json` 与 `tsc -p tsconfig.electron.json` 均通过。
`bun test server/utils/codexRuntime.test.ts shared/hostedApi.test.ts` 77 通过 0 失败；
`profiles/protocol/bundled-skills` 41 通过 0 失败。

## 关键发现（真机探测，推翻了总任务书的决策 D1）

用真实 OIX 二进制（`~/.openinterpreter/packages/standalone/releases/0.0.34-.../interpreter.exe`）
配上真实运行中的网关做了三轮探测，结论如下。

### 发现一：`configValueWrite` 写入的 provider，模型清单看不见

第一轮：连上 app-server 后用 `configValueWrite('model_providers.model-gateway', ...)` 注册，
再调 `interpreter/model/list` → **返回 0 个模型，网关侧无任何请求**。

原因：`catalog_processor.rs:190-205` 的 `interpreter_model_list` 用的是 `self.config`，
即 **app-server 启动时的配置快照**；`supported_models_for_provider`（`app-server/src/models.rs:36-38`）
第一步就是 `config.model_providers.get(provider_id)`，取不到直接 `return Vec::new()`，连网络都不会发。

**含义**：provider 必须在 app-server 启动前就存在于 config.toml，否则模型清单永远是空的，而且不报错。

### 发现二：没有 `auth` 的 provider，OIX 根本不去拉模型清单

第二轮：启动前把 provider 写进 config.toml → 返回 7 个模型，但**全是 OIX 内置的 OpenAI 模型**
（gpt-5.6-sol / gpt-5.5 …），网关侧仍然**没有收到任何请求**。

原因是这道闸门（`models-manager/src/manager.rs:456-458`）：

```rust
async fn should_refresh_models(&self) -> bool {
    self.endpoint_client.uses_codex_backend().await || self.endpoint_client.has_command_auth()
}
```

`has_command_auth()` 就是 `self.auth.is_some()`（`model-provider-info/src/lib.rs:520-522`），
指的是**命令式 bearer token 配置**（`ModelProviderAuthInfo`：command / args / timeout_ms / refresh_interval_ms / cwd）。
注意 `experimental_bearer_token`（静态令牌）**不算**，不会让这道闸门放行。

闸门关闭时走 `try_load_cache()` 后直接返回，最终回落到内置目录。

### 发现三：配上 `auth` 后确实会拉，但结果会和 OIX 内置目录**合并**

第三轮：给 provider 加上 `auth = { command = "cmd", args = ["/c","echo probe-token"] }` →
网关日志出现新的 `GET /models` 请求，返回 **18 个可见模型**：
我们的 11 个（`千问3.8-Max（推荐·强推理·支持图片）`、`豆包 Seed 2.0 Pro` … 中文展示名完整）
**加上** OIX 自带的 7 个 OpenAI 模型。`qwen-vl-max` 正确隐藏（含隐藏共 20 个）。

合并来自 `apply_remote_models`（manager.rs:465-484）：只有当
`auth_mode().is_some_and(AuthMode::has_chatgpt_account)` 时才「只用远端模型」，
否则一律 `merged_provider_catalog_models(models)`。我们不是 ChatGPT 账号，所以必然合并。

**顺带确认**：T01 里靠读源码推导的可见性规则（`supported_parameters` 含 `tools` → List，否则 Hide）
在真机上完全成立，中文展示名与 input modalities 也都正确传递。
OIX 会给 description 加上 `Tool calling • ` / `Reasoning • ` 前缀。

## 由此产生的岔路（待拍板）

目标是"用户只能看到并选择我们下发的模型"。发现三意味着走 OIX 目录这条路，
**一定会混进 OIX 内置的 OpenAI 模型**，而那些模型发到我们网关只会 404。

- **方案 A：继续用 OIX 目录 + 命令式 auth**
  需要给客户端配一个能输出令牌的命令（本仓库已有 `interpreter-app` CLI 面，理论上可承担）。
  好处是 OIX 会按 `refresh_interval_ms` 自动重跑命令拿新令牌，天然解决 T03 的 JWT 过期问题。
  坏处是要多维护一个可执行入口和一条安全通路，**而且仍然要在 UI 侧把混进来的内置模型过滤掉**——
  过滤这步做了，方案 A 相对方案 B 的额外收益就只剩令牌刷新了。

- **方案 B：客户端自己拉 `/models` 渲染选择器**
  Workstation 直接带用户 JWT 请求 `GET {gateway}/models`，用返回结果渲染模型选择器；
  OIX 侧的 provider 只用静态 `experimental_bearer_token` 负责对话。
  展示内容完全可控、没有合并污染、不需要额外可执行文件。
  代价是令牌刷新要自己处理（归入 T03），且不再复用 OIX 的目录缓存。

**倾向方案 B**：方案 A 并不能省掉过滤这步，却要额外引入一个令牌命令进程；
而"用户只能看到我们的模型"是硬性产品要求，控制权必须在我们手里。

**用户拍板：方案 B。**

## 方案 B 的落地

按 `docs/agent-ipc.md` 的三层约定（业务逻辑在 `server/handlers/*`、路由只做转发、前端只走 `@/ipc`）：

- **新增 `server/handlers/modelGateway.ts`**：`listModelGatewayModels()` 请求 `GET {base}/models`
  并归一成选择器用的 `SupportedOpenAIOAuthModel` 形状（附带 `description`）。
  - **无内置兜底**：网关是"用户能选哪些模型"的唯一真源，失败就抛错，由调用方决定怎么提示。
  - **过滤掉不支持工具调用的模型**：桌面智能体拿不能调工具的模型只会跑出"看起来成功、实际啥也没干"的一轮。
    这条规则和 OIX 对 provider 目录的处理一致（`supported_parameters` 不含 `tools` 就隐藏），两条模型通路行为统一。
    更理想的位置是网关侧就不下发（记为 T02 的跟进项）。
  - **默认模型只认网关的显式标记**（`is_default`），客户端不会把"第一个"偷偷提升为默认。
    网关目前还没下发这个字段，所以当前没有模型自称默认——这是有意的，等网关补上即可，客户端无需再改。
  - **"本发行版没配网关"作为数据返回而不是抛错**（`configured: false`）。
    原因：端点覆盖是主进程的环境变量，renderer 读不到 `process.env`；
    最初我在 hook 里用 `hasModelGateway()` 做短路，那会导致只设环境变量时前端直接不发请求。
    抛错也不行——那与"网关挂了"无法区分。
- **`server/routes/ipc.ts`**：`providers.listModelGatewayModels` 薄转发。
- **`src/ipc.ts`**：`ProvidersIpc` 增加方法签名。
- **`src/demo/marketingDemo.ts`**：demo mock 返回 `configured: false`，不编造模型清单。
- **新增 `src/hooks/use-model-gateway-catalog.ts`**：沿用 `use-hosted-model-catalog.ts` 的
  loading/error/refresh 形状与请求竞态处理。
- 未在 provider 上配置命令式 `auth`：方案 B 不依赖 OIX 拉取，配上只会把内置目录合并进来。

## 验收

| 项 | 结果 |
| --- | --- |
| `tsc -p tsconfig.json` | 通过 |
| `tsc -p tsconfig.electron.json` | 通过 |
| 新增 `server/handlers/modelGateway.test.ts` | 6 项全过（起本地 HTTP 服务喂真实响应形状） |
| 既有相关测试回归 | `codexRuntime` + `profiles` + `hostedApi` 共 100 项全过 |
| **真实网关取数** | `INTERPRETER_MODEL_GATEWAY_BASE_URL=http://localhost:8080/llm-gateway/v1` 下直连真实运行中的网关，返回 **11 个模型**，中文展示名与描述完整，**没有 OIX 内置模型混入** |

真实网关输出（截取）：

```
模型数: 11
 - qwen3.8-max | 千问3.8-Max（推荐·强推理·支持图片） | 图片理解 · 工具调用 · 联网搜索
 - doubao-seed-2-0-pro | 豆包 Seed 2.0 Pro | 图片理解 · 工具调用 · 联网搜索
 - claude-sonnet-4.6 | Claude Sonnet 4.6 | 图片理解 · 工具调用
```

单测覆盖的行为：请求路径正确、非 ASCII 展示名不被破坏、无 tools 的模型被丢弃、
默认标记只认显式字段、网关报错时抛错而不兜底、清单为空时抛错、未配置时返回 `configured: false`。

## 未完成

- 生产网关主机名未定（用户拍板暂不填），三个 product.json 的 `modelGatewayBaseUrl` 仍为空，
  开发期用 `INTERPRETER_MODEL_GATEWAY_BASE_URL` 覆盖。填值时要同步更新
  `scripts/verify-xiaoxin-distribution.mjs` 的边界断言。
- 模型选择 UI 尚未接这个 hook（属于 T05）。
- 尚未在真实 app 里跑通一轮对话（属于 T09）。
- provider 尚未带鉴权令牌（属于 T03）。

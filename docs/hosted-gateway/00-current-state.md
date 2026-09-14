# T00 · 现状核实与契约冻结

状态：进行中
日期：2026-09-10

动手改架构之前，先把"现在到底是怎么跑的"钉死。本文只写**核实过**的事实，每条带文件路径 + 行号；
推测一律标注"未证实"。后续所有子任务的方案都以本文为准。

---

## A. OIX 侧：模型与 provider 的目录契约（已核实）

这是本次架构的关键——**OIX 本来就有一套完整的 provider/模型目录 RPC，而且会联网拉取模型清单。**

### A1. 对外 RPC 契约

`codex-rs/app-server-protocol/src/protocol/v2/interpreter.rs`：

| 行号 | 类型 | 说明 |
| --- | --- | --- |
| `:20-33` | `InterpreterProvider` | `id` / `name` / `description` / `isCurrent` / `baseUrl?` / `wireApi?` / `envKey?` / `configured` / `isDefault` |
| `:49-59` | `InterpreterProviderList{Params,Response}` | 参数只有 `includeUnconfigured?` |
| `:64-76` | `InterpreterModelList{Params,Response}` | 参数 `modelProvider?` / `includeHidden?`，返回 `Vec<Model>` |
| `:81-92` | `InterpreterHarnessList{Params,Response}` | 参数 `providerId` + `model?` |
| `:97-137` | `InterpreterProviderSet` / `InterpreterModelSet` / `InterpreterHarnessSet` | 写侧；`HarnessSet.harness` 是 `Option<String>` |

### A2. 模型清单是**联网拉取**的，不是写死的

`codex-rs/app-server/src/models.rs:29-50`：

```rust
pub async fn supported_models_for_provider(..., provider_id: &str, ...) -> Vec<Model> {
    let Some(provider) = config.model_providers.get(provider_id).cloned() else { return Vec::new(); };
    // ...
    provider_config.codex_home = config.codex_home.join("models-cache").join(provider_id);
    let models_manager = build_models_manager(&provider_config, auth_manager);
    models_from_presets(
        models_manager.list_models(RefreshStrategy::OnlineIfUncached, http_client_factory).await,
        include_hidden,
    )
}
```

- `RefreshStrategy::OnlineIfUncached` —— 未缓存就**走网络**去问 provider 要模型清单。
- 缓存落在 `<codex_home>/models-cache/<provider_id>/`。
- 调用入口：`codex-rs/app-server/src/request_processors/catalog_processor.rs:338-399` 的 `list_models()`，
  由 `interpreter_model_list()`（`:190`）和 `model_list()`（`:156`）复用。

**这条对我们意味着什么**：只要客户端里配一个指向我方网关的 provider，
网关把模型清单从自己的 `/v1/models` 吐出来，客户端的模型下拉框就自动由服务端驱动了。
不需要在 Workstation 里另写一条"拉模型清单"的通道。这就是总任务书里的决策 D1。

### A2b. 拉取的确切 wire 契约（已核实）

**请求**：`GET <provider.base_url>/models`（`codex-rs/model-provider/src/models_endpoint.rs:39` 的
`MODELS_ENDPOINT = "/models"`，注释明确写着 "Provider-owned OpenAI-compatible `/models` endpoint"，
即对**每个 provider** 都适用，不是 Codex 后端专属）。
URL 由 `ModelsClient::request_url()` 拼出（`codex-rs/codex-api/src/endpoint/models.rs:159`），会附加 client version 查询参数。
OIX 集成测试断言路径就是 `/v1/models`（`codex-rs/core/tests/suite/remote_models.rs:545`）。
超时常量 `MODELS_REFRESH_TIMEOUT` 在 `models_endpoint.rs`。

**响应**：`codex-api/src/endpoint/models.rs:196-216` 按顺序尝试三种结构，谁先解析成功用谁：

| 顺序 | 结构 | 效果 |
| --- | --- | --- |
| 1 | OIX 原生 `{"models": [ModelInfo, ...]}` | **完全控制**每个模型的展示与行为 |
| 2 | Anthropic `{"data": [...]}` | 走 `anthropic_model_info_from_capabilities()` |
| 3 | OpenAI 标准 `{"data": [{"id": ...}]}` | 走 `openai_compatible_model_info_from_id()`，其余字段由 OIX 内置 catalog + 默认值补齐 |

**这对 T01 是个好消息**：网关可以**先**返回标准 OpenAI 形状（最省事，立刻能用），
**再**升级到 OIX 原生形状换取完整控制权。两者是平滑演进关系，不是二选一。

### A2c. `/models` 端点还下发 `base_instructions`（重要）

`ModelInfo`（`codex-rs/protocol/src/openai_models.rs:397-480`）里有一个字段：

```rust
pub base_instructions: String,
```

也就是说**模型的基础系统指令是由 `/models` 端点下发的**，不是客户端写死的。
这给了我们一个此前没意识到的架构杠杆：服务端可以统一控制基础指令，不需要客户端发版。
与 T09（CUA 工具跑通）直接相关，T01 定方案时要一并考虑。

其他影响 UI 的关键字段：
- `visibility: "list" | "hide" | "none"` —— 决定是否出现在模型选择器（`show_in_picker = visibility == List`）
- `priority: i32` —— 决定默认模型（`catalog_processor.rs` 注释："default is the highest priority available model"）
- `context_window` / `max_context_window` / `auto_compact_token_limit` —— 影响自动压缩时机
- `supports_parallel_tool_calls`、`experimental_supported_tools` —— 与工具行为相关

无 serde 默认值、**必须出现**的字段（用原生形状时不能漏）：
`slug`、`display_name`、`description`、`supported_reasoning_levels`、`shell_type`、`visibility`、
`supported_in_api`、`priority`、`availability_nux`、`upgrade`、`base_instructions`、
`supports_reasoning_summaries`、`support_verbosity`、`default_verbosity`、`apply_patch_tool_type`、
`truncation_policy`、`supports_parallel_tool_calls`、`experimental_supported_tools`。

**未证实（T01 开工时验证）**：
- 拉取失败/超时的降级行为（返回空列表？回落到内置 bundled preset？）——决定 T05 里"网关不可用时 UI 显示什么"。
  线索：`codex-models-manager` 里有 `bundled_models_response`，疑似有内置兜底，但未确认触发条件。
- 缓存失效条件（`<codex_home>/models-cache/<provider_id>/`，另见 `core/tests/suite/models_cache_ttl.rs`），
  决定"服务端改了清单，客户端多久能看到"。
- `/models` 请求带的鉴权头形式，与 T03 网关鉴权设计必须对齐。

### A3. harness 自动探测（已定位并已修）

详见 [t08-harness-explicit.md](./t08-harness-explicit.md)。结论：
模型名含 "qwen" 就会被 OIX 换成 qwen-code 固定人格，且该分支硬编码关闭 inference trace。
客户端侧已改为显式下发 harness。

> 这条对新架构有直接约束：**网关暴露给客户端的模型 id，本身会参与 OIX 的行为判定。**
> 即使我们已显式设了 harness，模型 id 的命名也可能在别处触发类似的字符串启发式。
> T01 定模型 id 命名时要考虑这一点。

---

## B. 客户端侧：模型配置链路现状

### B0. 既有 hosted 托管模式：能复用一半，另一半不能

`src/lib/codex/profiles.ts:188-198`：

```ts
const INTERPRETER_HOSTED_PROFILE: Profile = {
  id: "interpreter",
  modelProvider: "interpreter",
  model: "interpreter-smart",
  providerConfig: {
    base_url: getInterpreterBaseUrl(),   // = {hostedApiBaseUrl}/v0/openrouter
    requires_openai_auth: false,
    wire_api: "responses",
  },
};
```

端点派生链（`shared/hostedApi.ts:28-71`），优先级从高到低：
`INTERPRETER_HOSTED_API_BASE_URL` 环境变量 → `USE_LOCAL_API=true` 走 localhost → `product.json` 的 `distribution.hostedApiBaseUrl`。
推理端点固定拼成 `{base}/v0/openrouter`。
`server/utils/codexRuntime.ts:537-539`：app 侧 `provider === 'hosted'` 的 profile 映射到这个 codex profile。

**两个不能照搬的地方（关键）**：

1. **`wire_api: "responses"`**。托管路径走的是 OpenAI **Responses API**，
   而我们的网关目前只实现了 chat/completions。要么网关实现 Responses 协议，要么我们的 provider 用 `wire_api: "chat"`。
2. **托管模型清单根本不问服务器**。`src/hooks/use-hosted-model-catalog.ts:7-10`：

   ```ts
   // The hosted picker browses OpenRouter slug models. The runtime is the source of
   // truth via `interpreter/model/list` for the `openrouter` provider, which lists
   // the bundled OpenRouter catalog without a key or network call.
   const HOSTED_OPENROUTER_PROVIDER_ID = 'openrouter';
   ```

   provider id 是**写死的 `'openrouter'`**，拿的是 OIX **内置** catalog，注释明确写了"不需要 key、不发网络请求"。
   而且 hosted 的 `interpreter-smart/fast` **不在** `interpreterProviderList` / `interpreterModelList` 返回里，是 app 侧合成的
   （`src/lib/providers/interpreterProviderMenu.ts:274-319`，集成测试 `interpreter-models.integration.test.ts:67-78` 证实 `builtin:hosted` 返回空数组）。

> **这一条修正了总任务书初稿里的决策 D1。**
> A 节证明的"OIX 会联网拉 provider 的模型清单"依然成立，但**托管这条路走不到它**——
> 托管选择器被硬编码到了 `openrouter` provider 的内置目录上。
> 因此正确做法是：**注册我们自己的 provider（不是复用 hosted 合成项），
> 让模型选择器对这个 provider id 调 `interpreter/model/list`，从而真正打到网关的 `/models`。**

### B1. overlay 机制与当前取值

`scripts/with-distribution-config.mjs:5-18`：构建时把 `distribution/product.<id>.json` 深度 merge 进根 `product.json`
（同名 key 递归合并，数组整体替换），构建完再还原。入口是 `package.json` 的 `build:official` / `build:xiaoxin`。
运行时读取入口 `shared/productConfig.ts`，其中 `hasHostedApi()` 判断 `hostedApiBaseUrl` 是否非空。

对比两个 overlay：

| 字段 | `product.xiaoxin.json` | `product.official.json` |
| --- | --- | --- |
| `distribution.hostedApiBaseUrl` | `""` | `https://oi-new-api.fly.dev` |
| `distribution.auth.provider` | `"none"` | supabase |

**没有**独立的"hosted 模型端点"字段，推理端点是从 `hostedApiBaseUrl` 派生的。
**也没有**任何发行版级别的"禁用本地模型"开关——T06 需要新增（可参照 `hasHostedApi()` 的写法）。

当前 `hasHostedApi()` 为 false 导致：onboarding 不展示 Interpreter 推荐卡（`ModelSetupScreen.tsx:89,1413`），
但 Settings 里 hosted preset 仍无条件合成（`buildAppSpecialProviderEntries`）。

### B2. 模型选择 UI 的构成

| 文件 | 角色 | 数据来源 |
| --- | --- | --- |
| `src/components/ProfileManager.tsx` | Settings Models 主 UI + 下拉列表 | `useInterpreterProviders()` → `buildVisibleProfilePresets()` |
| `src/components/ModelSelectorPopoverPanel.tsx` | 聊天区模型下拉 | 内嵌 ProfileManager compact 模式 |
| `src/components/ProfileProviderConfig.tsx` | 单 profile 的 provider/model 编辑面板 | `useHostedModelCatalog()` / `useInterpreterModels()` / 本地探测 |
| `src/components/HostedModelPicker.tsx` | 托管模型选择器 | props 传入 catalog |
| `src/components/onboarding/screens/ModelSetupScreen.tsx` | 首启模型选择 | `useInterpreterProviders()` + `hasHostedApi()` gating |
| `src/lib/providers/interpreterProviderMenu.ts` | OIX provider 列表与 app 侧合成项的合并层 | `listInterpreterProviders` |

客户端侧的三个目录 RPC（`src/lib/codex/protocol.ts`，实现在 `app-server-client.ts:2377-2410`）：
`interpreter/provider/list`、`interpreter/model/list`、`interpreter/harness/list`，各有配对的 `set`。

### B3. 本地 Ollama / LM Studio 的入口清单（T06 的工作面）

UI 层：
1. `src/lib/codex/profiles.ts:68-95` — `CUSTOM_PRESETS` 里的 ollama / lmstudio 默认 baseURL
2. `src/lib/codex/profile-options.ts` — ProfileId 枚举含 `ollama` / `lmstudio`
3. `src/lib/providers/interpreterProviderMenu.ts:169-174` — OIX 的 ollama/lmstudio → `appProviderType: 'local'`
4. `src/components/ProfileManager.tsx:263-271` — `PRESET_SCAFFOLDING.local` 预设卡
5. `src/components/ProfileManager.tsx:518-519` — `presetKeyFromMenuEntry` 映射
6. `src/components/ProfileManager.tsx:172` — `MODEL_OVERRIDE_PROVIDERS` 含 `local`
7. `src/components/ProfileProviderConfig.tsx:137-141` — Provider tab "Local"
8. `src/components/ProfileProviderConfig.tsx:513-599` — 本地模型探测与拉取 UI

Onboarding：
9. `src/components/onboarding/screens/ModelSetupScreen.tsx:1254-1331` — `local:ollama` / `local:lmstudio` 卡片
10. `src/components/onboarding/screens/localRuntimeOnboarding.ts` — `buildOllamaPack` / `buildLmStudioPack`
11. `shared/types/modelDefaults.ts:34-38` — `ONBOARDING_OPTIONAL_MODEL_PACK_ORDER`
12. `ModelSetupScreen.tsx:579-580` — 自动探测本地运行时并加入 `detectedPackIds`

后端与探测：
13. `shared/types/provider.ts:614-619` — `BUILTIN_PROVIDERS` 的 `builtin:local`
14. `src/api.ts:459-592` — `getOllamaStatus` / `pullOllamaModel` / `getLmStudioStatus` / `downloadLmStudioModel`
15. `server/routes/agent.ts` — REST `/api/agent/ollama/*`、`/api/agent/lmstudio/*`
16. `server/handlers/providers.ts:1000+` — localhost HTTP 探测实现

**注意**：只改 onboarding 不够——Settings 的 Local tab 仍能建 profile。
另外 Local preset 是否出现还取决于 OIX 的 `listInterpreterProviders` 是否返回这两个 built-in provider（通常总会返回），
所以过滤必须发生在客户端合并层，不能指望 OIX 不返回。

### B1. 已核实：overlay 里已有 `hostedApiBaseUrl` 字段，当前是空的

`distribution/product.xiaoxin.json:28-42`：

```json
"distribution": {
  "id": "xiaoxin",
  "hostedApiBaseUrl": "",
  "auth": { "provider": "none", "url": "", "anonKey": "", "storageKey": "xiaoxin-workstation-auth-token" },
  ...
  "billingApiBaseUrl": "",
}
```

即托管服务端点的注入位**已经存在**，小新发行版只是没填。T04 很可能不需要新增机制，
只需要填这个字段 + 确认它真的驱动了模型请求路径。

**未证实**：`hostedApiBaseUrl` 具体驱动哪些行为（是否包含模型 provider 的 baseURL，还是只管账号/额度类接口）。
这是 T04 开工前的第一件事。`auth.provider` 目前是 `"none"`，与 T03 的鉴权设计直接相关。

### B2. 已核实：本地模型的 tool-use 预检会拦在 OIX 之前

`server/handlers/providers.ts`：`resolveLocalModelToolUseSupport()`（`:881`）→
`resolveOllamaModelToolUseSupport()` → `probeOllamaShow()` → `buildOllamaManagementUrl(baseURL, '/api/show')`。

这条预检打的是 **Ollama 原生端点**（`/api/tags`、`/api/show`、`/api/version`、`/api/pull`），
不是 OpenAI 兼容端点。失败时在客户端就把这一轮对话拦下，报
`"could not be verified for tool use"`（`:922-938`），**OIX 根本不会被调用**。

这解释了此前"本地 Ollama profile 指到网关后完全不走网关"的现象：不是路由问题，
是 Workstation 自己的预检先失败了。属于诊断环境产物，不是产品缺陷；但 T06 隐藏本地入口后这条链路也应一并处理。

---

## C. 网关侧现状

仓库 `D:\project\xiaoxin\SupplyChain`，服务端口 8080，无额外 context-path。

### C0. 网关现状：诊断用的透明代理

`supply-chain-supply/src/main/java/com/supplychain/ai/llmgateway/`，`@RequestMapping("/llm-gateway/v1")`（Controller:71）：

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/llm-gateway/v1/models` | 透传上游 `GET {upstream}/models`，**不落盘** |
| POST | `/llm-gateway/v1/chat/completions` | 透传上游，逐 chunk 写 `HttpServletResponse` 并 flush（不破坏 SSE），请求响应都落盘 |

`enabled=false` 时两个端点都返回 404（Controller:110-112、169-171）。
HTTP 客户端是 `WebClient`（reactive，在 Servlet 线程上 `block()`）。
转发请求头是白名单，不是整包复制（Controller:74-76）：`authorization` / `content-type` / `accept` / `user-agent` / `x-request-id`。

配置项（`application.yml:654-659`）：

```yaml
llm-gateway:
  enabled: true
  upstream-base-url: https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
  log-dir: logs/llm-gateway
  max-logged-response-chars: 2000000
  upstream-timeout-ms: 120000
```

日志落在 `{logDir}/index.jsonl` + `call-{时间}-{短id}/{request,response}.json`，Authorization 已脱敏（保留前 6 后 6）。

**鉴权：网关自己完全不鉴权**，而且被加进了 JWT 白名单（`application.yml:434-436`），
原注释是："Authorization 头是客户端发给真实 provider 的凭证（例如 DashScope key），不是本系统签发的 JWT，必须放行"。
也就是说**当前形态下，客户端必须自己持有上游 provider 的真实密钥**——这与本次改造的目标（密钥只存在于服务端）正好相反。
T03 必须把这条白名单去掉，并让网关**自己注入**上游密钥，而不是转发客户端的。

### C1. 网关当前是单上游透传

上游地址是进程级单值。2026-09-10 实测：把它指到 Ollama 后，云端模型请求得到
`404 model 'qwen3.7-max' not found`——因为整个网关只有一个上游。
生产化后必须支持**按模型路由到不同上游**，这是 T01/T02 的硬需求。

### C2. 重要：后端已有完整的模型注册表和按用户授权（T01 应复用而非另建）

这是本次调查最有价值的发现——"服务端下发模型清单"这件事，后端**已经有了**，只是没接到网关上。

**三层结构：**

1. **代码注册表 `ModelRegistry`**（`...\supply\service\ModelRegistry.java:50-197`，`@PostConstruct` 注册）
   当前 12 个 modelId，含默认模型 `qwen3.8-max`，并有**别名映射**（:36-44，例如 `qwen3.7-max` → `qwen3.8-max`）：

   | modelId | 供应商 |
   | --- | --- |
   | `qwen3.7-plus` / `qwen3.8-max` / `qwen-vl-plus` / `qwen-vl-max` | DASHSCOPE |
   | `doubao-seed-2-0-pro` | DOUBAO |
   | `gemini-3.1-pro-preview` / `gpt-5.3-chat` / `claude-sonnet-4.6` / `claude-opus-4.6-fast` / `openai/gpt-5.6-*` | OPENROUTER |

   供应商枚举 `ModelProvider`：DASHSCOPE / DOUBAO / OPENROUTER / OTHER。

2. **用户级权限**：表 `ai_user_model_config`（字段 `available_models` 逗号分隔、`default_model_id`），
   启动时 `UserModelConfigLoader` 全量同步到 Redis，运行时 `ModelRegistry.resolveForUser(modelId, userId)` 过滤。

3. **已有的对外清单 API**：
   - `GET /ai/models/availableList` — 当前用户可用模型 + `modelSelectable` 标志
   - `GET /ai/models/list` — 全部已注册模型（不过滤用户）

   （SQL 里还有个 `ai_available_model` 元数据表，但 Java 代码无引用，以 `ModelRegistry` 为准。）

**对 T01 的直接含义**：网关的 `/v1/models` 不应该再透传上游，而应该由 `ModelRegistry` + `ai_user_model_config`
按**当前登录用户**生成清单。这同时天然满足了"按用户授权可见模型"这个后端已有的产品能力。

### C3. 现有主聊天与鉴权（T03 的复用对象）

主入口 `POST /ai/qwenmm/streamChat`（`AiController.java:571-572`，SSE），
请求体 `ChatRequest` 里已有 `modelId` 字段（`ChatRequest.java:113-118`，空则用 `ModelRegistry.getDefault()`），
链路走 `ReactAgentChatService`。底层通过 Spring AI 的 `ChatModel` 抽象接不同供应商
（DashScope SDK / `OpenAiChatModel` 接 OpenRouter / 火山 Ark SDK / Ollama），
Bean 注册在 `CustomLLMConfiguration.java`，运行时由 `ModelBeanResolver` 解析。

**鉴权机制**：Servlet Filter `JwtAuthenticationFilter`
（`supply-chain-auth/.../filter/JwtAuthenticationFilter.java`）：
请求头 `Authorization: Bearer <token>` → `TokenVerifier.verify()`（先查 Redis OAuth2 token，再验本系统 JWT）
→ 成功写 `UserUtil` ThreadLocal，失败 401，请求结束清理 ThreadLocal（:110-113）。
白名单在 `application.yml` 的 `jwt.whitelist`，目前包含 `/ai/xiaoxin/**` 和 `/llm-gateway/v1/**`。
主聊天 `/ai/qwenmm/streamChat` **不在**白名单，必须带 JWT。

这正是用户拍板要复用的那套。T03 = 把 `/llm-gateway/v1/**` 移出白名单 + 网关侧自行注入上游密钥。

上游地址来自启动参数 `--llm-gateway.upstream-base-url=...`，进程级单值。
2026-09-10 实测：把它指向 Ollama 后，云端模型请求会得到
`404 model 'qwen3.7-max' not found`——因为整个网关只有一个上游。
生产化后必须支持**按模型路由到不同上游**，这是 T01/T02 的硬需求。

---

## 契约冻结

以下为后续所有子任务的共同输入。改动此节需要在总任务书的决策记录里留痕。

### F1. OIX provider 身份

**注册一个我们自己的 provider，不复用 `interpreter`（hosted）也不复用 `openrouter`。**

| 项 | 取值 | 理由 |
| --- | --- | --- |
| provider id | `xiaoxin`（暂定，T04 定稿） | 必须是独立 id，模型选择器才能对它调 `interpreter/model/list` 走到真实网络拉取（见 B0） |
| `base_url` | `{gatewayOrigin}/llm-gateway/v1` | OIX 会在其后拼 `/models` 与 `/chat/completions`，正好命中网关现有两个端点（C0） |
| `wire_api` | `"chat"` | 网关说的是 OpenAI chat/completions；hosted 那条路的 `"responses"` 不适用（B0） |
| `harness` | 显式 `""`（native） | 见 [t08](./t08-harness-explicit.md)，不能留空 |

### F2. 鉴权

`Authorization: Bearer <SupplyChain JWT>`，复用 `JwtAuthenticationFilter`（C3）。

- 网关**校验**该 JWT，解析出 userId；
- 网关**不再转发**客户端的 Authorization 到上游，改为**服务端注入**真实上游密钥；
- `/llm-gateway/v1/**` 必须从 `jwt.whitelist` 移除。

**未决（T03 必须解决，先记下来）**：OIX provider 配置里的密钥是静态值，而 JWT 会过期。
需要确定令牌生命周期方案（长效令牌 / 刷新写回 provider 配置 / 网关侧宽松校验），
这是 T03 的核心设计点，不能默认"填上就行"。

### F3. 模型清单

端点 `GET /llm-gateway/v1/models`，两阶段演进（依据 A2b，OIX 解析器按序兼容）：

- **阶段一**：返回 OpenAI 标准 `{"data": [{"id": "..."}]}`，最快跑通。
- **阶段二**：返回 OIX 原生 `{"models": [ModelInfo]}`，换取 `display_name` / `description` /
  `visibility` / `priority` / `context_window` / `base_instructions` 的完整控制权。

清单内容**由 `ModelRegistry` + `ai_user_model_config` 按当前登录用户生成**（C2），不透传上游。

### F4. 错误语义（T02 落实）

| 场景 | HTTP | 要求 |
| --- | --- | --- |
| 无 / 无效 JWT | 401 | 客户端要能区分"未登录"和"服务异常" |
| 用户无该模型权限 | 403 | 不能退化成 404 |
| 模型不存在于注册表 | 404 | 消息里给出模型 id |
| 上游不可用 / 超时 | 502 / 504 | 不泄露上游地址与密钥 |
| 上游限流 | 429 | 透传 retry 信息 |

### F5. 安全红线

- 上游密钥、上游真实地址**永不下发**到客户端，也不出现在返回给客户端的错误信息里。
- 网关日志继续脱敏 Authorization；开启生产日志前需复核请求体是否含敏感业务数据。

# 托管网关化改造 · 总任务书

状态：进行中（2026-09-10 立项）
负责仓库：`D:\project\xiaoxin-workstation`（客户端） + `D:\project\xiaoxin\SupplyChain`（网关）

本目录是这项改造的唯一记录处。总任务书（本文）只放**目标、架构决策、任务索引、验收口径**；
每个子任务有自己的文档，做完一项就在该子任务文档里写结论，并回到本文索引表更新状态。

## 一、要达成什么

一句话：**客户端不再自己配置模型，所有模型请求默认走我们自己的网关，模型清单由服务端下发。**

拆成四条可验收的产品要求：

1. 客户端安装后，用户**看不到也填不了** baseURL / apiKey / 自定义 provider 表单。
2. 用户能选的模型，来自**服务端下发的清单**；清单变了客户端就跟着变，不需要发版。
3. 客户端**不会**因为用户本机装了 Ollama / LM Studio 就把请求发到本地模型；这两个入口对客户隐藏。
4. 真实上游供应商（阿里云等）的端点与密钥**只存在于网关侧**，客户端全程不可见。

## 二、目标架构

```
Workstation 客户端
      │  ① 取模型清单（不含任何上游端点/密钥）
      │  ② 发对话请求
      ▼
SupplyChain 网关 (LlmGatewayController → 生产化)
      │  按服务端配置路由到真实上游
      ▼
阿里云 Qwen / 后续其他供应商
```

关键设计决策（已由源码核实，见 [00-current-state.md](./00-current-state.md)）：

- **D1｜模型清单走网关 `/models`，不另造通道，但必须用我们自己的 provider id。**
  OIX 的 `supported_models_for_provider()` 用 `RefreshStrategy::OnlineIfUncached` **在线拉取** provider 的
  `GET {base_url}/models` 并缓存，再通过 `interpreter/model/list` RPC 交给客户端
  （`codex-rs/app-server/src/models.rs:29`、`app-server/src/request_processors/catalog_processor.rs:338`）。
  **修正（2026-09-10，调查后）**：不能复用既有的 hosted 托管路径——
  `use-hosted-model-catalog.ts:10` 把 provider id 硬编码成了 `'openrouter'`，拿的是 OIX 内置目录，
  注释明写"不需要 key、不发网络请求"；hosted 的模型项本身也是 app 侧合成、不在 OIX 目录里。
  正确做法是注册**独立的 provider**，详见 00-current-state.md 的 F1。
  **二次修正（2026-09-10，T04 真机探测后）**：D1 的前半句"清单走 OIX 在线拉取"也站不住。
  实测证明 OIX 只在 provider 配了**命令式 auth** 时才会去拉（`should_refresh_models()`），
  且拉回来的清单会与 OIX 内置的 OpenAI 目录**强制合并**（非 ChatGPT 账号无法只用远端清单）。
  证据与两条备选方案见 [t04-client-gateway-provider.md](./t04-client-gateway-provider.md)。
- **D2｜客户端只保留一个我方 provider，端点通过 `product.json` overlay 注入。**
  符合本仓库 `AGENTS.md`：发行版专属端点通过 product.json overlay 注入，不为某个发行版分叉应用行为。
  注意 overlay 现有的 `hostedApiBaseUrl` 会被派生成 `{base}/v0/openrouter` 且走 Responses 协议，
  与我方网关的路径和协议都不同，T04 需要确认是复用该字段还是新增字段。
- **D3｜不改 OIX 源码。**
  按 `docs/xiaoxin-upstream.md`：运行时改动属于独立的 OIX fork 并单独 pin。本改造全部在客户端配置层 + 网关侧完成。
- **D4｜`harness` 必须显式下发，不能留空让 OIX 猜。**
  留空会命中 OIX 按模型名猜 harness 的启发式（模型名含 "qwen" 就被换成 qwen-code 人格），
  导致系统提示词被整段替换、CUA 说明丢失。详见 [t08-harness-explicit.md](./t08-harness-explicit.md)。

## 三、贯穿全程的硬规矩

- **不许造假式修复。** 见 `AGENTS.md` 的 "Forbidden: fake agent fixes"。禁止用正则/关键词/硬编码在模型之前代跑工具或伪造成功。
- **端到端结论必须有 wire 级证据。** 模型自述、CLI 工具枚举、类型检查通过，都不算验收通过。以网关抓到的真实请求体、真实响应、以及真实桌面状态变化为准。
- **每项任务都要能单独验收。** 索引表里每项都写明"怎么算过"，用户按项验收。
- **不确定就写"未证实"。** 不要把推测写成结论——这次立项前的排查已经吃过两次亏。

## 四、任务索引

| 编号 | 任务 | 落地仓库 | 状态 | 怎么算过 |
| --- | --- | --- | --- | --- |
| T00 | 现状核实与契约冻结 | 两侧 | **已完成**（[文档](./00-current-state.md)） | 三侧现状均有行号级证据，契约 F1–F5 已冻结 |
| T01 | 网关 `/models` 生产化 | SupplyChain | **网关侧已完成**（[文档](./t01-gateway-models.md)） | 清单由 `ModelRegistry` + `ai_user_model_config` 生成（不透传上游）✔；客户端能解析并拿到 11 个可选模型 ✔（T04 真机验证）；按用户过滤（待 T03）。跟进项：网关补 `is_default` 标记；不可用于工具调用的模型建议网关侧就不下发 |
| T02 | 网关 `/chat/completions` 生产化 | SupplyChain | 未开始 | 按模型路由到不同上游；流式稳定；F4 错误语义逐条可复现；密钥与上游地址不外泄 |
| T03 | 网关鉴权与身份（含令牌生命周期） | SupplyChain | 未开始 | 客户端凭 SupplyChain JWT 访问；`/llm-gateway/v1/**` 移出白名单；上游密钥由服务端注入；**令牌过期有明确方案且验证过** |
| T04 | 客户端注入托管网关端点（product.json overlay） | Workstation | **数据层已完成**（[文档](./t04-client-gateway-provider.md)） | 端点字段 + provider profile + 清单取数链路已落地，真机拉到 11 个模型且无内置模型混入 ✔；UI 渲染归 T05；生产主机名待定 |
| T05 | 模型选择 UI 改造为服务端清单 | Workstation | **组件、装配层与持久化已完成**（[文档](./t05-model-selection-ui.md)） | 选项内容来自服务端 ✔；网关不可用时渲染明确错误 + 重试而非空白 ✔；网关 profile 存盘后能原样读回 ✔（均有测试覆盖）。未做：真实 app 内目视确认；onboarding 首次启动无网关入口（→ T07）；主聊天紧凑选择器仍列 profile 而非直接列模型（→ T06/T07） |
| T06 | 隐藏本地 Ollama / LM Studio 入口 | Workstation | 未开始 | Settings 与 onboarding 均无本地模型入口；已有本地 profile 不再被选中 |
| T07 | 收敛自定义 provider 写入路径与存量配置迁移 | Workstation | 未开始 | 客户端不再写用户自建 profile；老用户配置有明确迁移或失效策略 |
| T08 | `harness` 显式化 | Workstation | **已完成**（[文档](./t08-harness-explicit.md)） | 网关抓到的请求里 system prompt 不再是 qwen-code 固定人格 ✔（真机复测）；两条针对性单测已补并通过 ✔。遗留：本地 Ollama 侧未复测 |
| T09 | 端到端：CUA 工具在网关路径上跑通 | 两侧 | 未开始 | 模型自己调用了正确的 CUA 工具，且真实桌面窗口发生预期变化 |
| T10 | 回归与发布门禁 | 两侧 | 未开始 | typecheck + 单测 + Playwright 相关项通过；`verify:xiaoxin-distribution` 阻断问题一并处理 |

## 五、子任务文档规范

每个子任务一份文档，文件名 `tNN-短名.md`，固定用这几个小节：

- **目标**：这项做完，产品行为有什么可观察的变化
- **现状**：动手前核实到的事实，带文件路径 + 行号
- **方案**：打算怎么改，以及为什么不选别的做法
- **改动清单**：实际改了哪些文件
- **验收**：怎么证明它真的成了（要能被别人独立复现）
- **结论**：做完后写，包含没做到的部分和已知限制

## 六、决策与变更记录

| 日期 | 决策 | 依据 |
| --- | --- | --- |
| 2026-09-10 | 立项：客户端只走线上模型，模型清单服务端下发，网关生产化 | 用户产品决策 |
| 2026-09-10 | 模型清单复用 OIX 既有在线拉取能力，不另造通道（D1） | OIX 源码核实，见 00-current-state.md |
| 2026-09-10 | 隐藏本地 Ollama / LM Studio 入口，不保留高级用户开关 | 用户选择"直接隐藏/禁用" |
| 2026-09-10 | 今天写的 `LlmGatewayController` 升级为正式生产网关 | 用户选择"升级成正式生产网关" |
| 2026-09-10 | 本任务书目录固定在 `xiaoxin-workstation/docs/hosted-gateway/`，网关侧子任务在文档内标注落在 SupplyChain | 用户拍板 |
| 2026-09-10 | 执行顺序：T00 收口后**先做网关 T01**，客户端 UI 依赖它作为数据真源 | 用户拍板 |
| 2026-09-10 | T03 鉴权**复用 SupplyChain 现有登录 token**（`/api/auth/login` 那套），不另发设备密钥 | 用户拍板 |
| 2026-09-10 | 模型清单响应先用 OpenAI 标准形状跑通，再演进到 OIX 原生 `ModelsResponse` 形状换取完整控制 | OIX 解析器按序兼容三种形状，见 00-current-state.md A2b |
| 2026-09-10 | **修正 D1**：不复用 hosted 托管路径，注册独立 provider（`wire_api: "chat"`） | hosted 模型目录硬编码 `openrouter` 内置目录且走 Responses 协议，见 00-current-state.md B0 |
| 2026-09-10 | 模型清单复用后端已有的 `ModelRegistry` + `ai_user_model_config` 按用户授权生成，不另建一套 | 后端已有该能力，见 00-current-state.md C2 |
| 2026-09-10 | 网关不再转发客户端 Authorization 到上游，改为服务端注入上游密钥 | 现状与"密钥只在服务端"目标相反，见 00-current-state.md C0 |
| 2026-09-10 | 契约 F1–F5 冻结（provider 身份 / 鉴权 / 模型清单 / 错误语义 / 安全红线） | 见 00-current-state.md 契约冻结节 |
| 2026-09-10 | 发行版新增 `distribution.modelGatewayBaseUrl` 字段，不复用 `hostedApiBaseUrl` | 后者派生 `/v0/openrouter` 且走 Responses 协议，与网关不同，见 t04 文档 |
| 2026-09-10 | 客户端 profile id 定为 `model-gateway`（非用户可配），`wire_api: "chat"` + `harness: null` | 见 t04 文档"已完成的改动" |
| 2026-09-10 | **二次修正 D1**：OIX 只在配了命令式 auth 时才拉 `/models`，且必然与内置 OpenAI 目录合并 | 真机三轮探测，见 t04 文档"关键发现" |
| 2026-09-10 | 装上 bun 1.4.2，单测套件解锁（4081 通过 / 55 失败，失败集中在并行跑的集成测试，单独跑通过） | 解开 T08 与 T10 的前置阻塞 |
| 2026-09-10 | **模型清单走方案 B**：客户端自己请求网关 `/models` 渲染选择器，OIX 只负责对话 | 用户拍板；方案 A 无法避免与 OIX 内置目录合并，见 t04 文档 |
| 2026-09-10 | 生产网关主机名暂不填入 overlay，开发期用 `INTERPRETER_MODEL_GATEWAY_BASE_URL` 覆盖 | 用户拍板 |
| 2026-09-10 | 不支持工具调用的模型在客户端过滤掉（与 OIX 对目录的处理一致）；更理想位置是网关侧不下发 | 桌面智能体拿不能调工具的模型只会跑出假成功，见 t04 文档 |
| 2026-09-10 | 网关做成第一类 provider lane（`ModelProvider`/`ProviderType` 新增 `'gateway'`），不复用 `api` lane | `api` lane 会渲染端点与密钥输入框，复用就要到处写例外，见 t05 文档 |
| 2026-09-10 | 网关卡片的可见性由主进程回报的 `catalog.configured` 决定，不在 renderer 同步判断 | renderer 读不到 `process.env`，同步判断会与实际使用的端点不一致 |
| 2026-09-10 | 不复用 `HostedModelPicker`，另写 `ModelGatewayPicker` | 前者围绕 OpenRouter 目录形状（分组/搜索/硬编码推荐位），适配层比重写更长，见 t05 文档 |
| 2026-09-10 | 网关 preset 不参与运行时元数据合并（与 `custom-api` / `local` 同列豁免） | 否则合成 id `__app:model-gateway` 会被写进 profile 的 `codexProfileId` 并外传给 app-server，见 t05 文档 |
| 2026-09-11 | 新增 provider 类型必须同时补齐 4 个 `switch`（`isProfileValid` / `repairProfile` / `isNestedModelValid` / `repairNestedModel`）与 2 个运行时解析器 | 这些 `switch` 都有 `default`，漏补不报错但会导致 profile 在下次启动被删并替换成 hosted 兜底，见 t05 文档 |
| 2026-09-11 | onboarding 网关入口与"无 profile 兜底改为网关"归入 T07 | 新用户走 model pack 而非 preset picker，兜底目前是 `getOnboardingModelPack('hosted')` |

# T01 · 网关 `/models` 生产化

状态：**网关侧已完成并真机验证；客户端渲染验证阻塞在 T04**
日期：2026-09-10
落地仓库：`D:\project\xiaoxin\SupplyChain`

## 目标

`GET /llm-gateway/v1/models` 不再透传上游，改为按当前登录用户返回我方授权的模型清单，
成为客户端模型选择器的唯一数据源。

## 现状（动手前）

见 [00-current-state.md](./00-current-state.md) C0 / C2。要点：

- 原实现是纯透传，把上游 `GET {upstream}/models` 的响应原样写回。加它的初衷只是让 OIX 的探测请求不吃 404。
- 后端**已有**完整的模型清单能力：`ModelRegistry`（12 个模型 + 别名 + 全局默认）
  和用户授权表 `ai_user_model_config`（经 Redis 缓存，`listAvailableForUser(userId)` 过滤）。
  这套此前完全没有接到网关上。

## 方案

不新建模型清单，直接把已有的 `ModelRegistry.listAvailableForUser(userId)` 转成 OIX 能消费的形状。

选 **OpenAI 标准形状**（`{"object":"list","data":[...]}`），因为 OIX 的解析器按序兼容三种结构
（00-current-state.md A2b），这条最省事且能立刻跑通。

### 一条差点踩空的 OIX 规则

`codex-rs/codex-api/src/endpoint/models.rs:557-575` 的 `compatible_picker_visibility`：

```rust
if tools_support_is_known(supported_parameters) && !supports_tool_parameter(supported_parameters) {
    return ModelVisibility::Hide;
}
if tools_support_is_known(supported_parameters) {
    return ModelVisibility::List;
}
catalog_entry.map(|entry| entry.visibility).unwrap_or(ModelVisibility::Hide)
```

而 `tools_support_is_known` 就是 `!supported_parameters.is_empty()`（:597-599）。

**即：如果不输出 `supported_parameters`，我们的模型会全部落到最后一行的 `unwrap_or(Hide)`
——因为我们的模型 id 不在 OIX 内置 catalog 里——整个下拉框会是空的，而且没有任何报错。**
所以网关必须为每个模型显式输出非空的 `supported_parameters`。

顺带影响排序（`compatible_model_priority`，:577-591）：含 `reasoning_effort` → 40，含 `tools` → 50，否则 90。

### 由此产生的一条产品语义

含 `tools` 才可见，那么**不支持工具调用的模型会被 OIX 隐藏**。
当前 12 个模型里 `qwen-vl-max` 没有 `TOOLS` capability，因此不可见。

这是**有意为之**：桌面智能体的核心是驱动桌面操作，不能调工具的模型列出来只会误导用户。
已在代码注释里写明，不是遗漏。若将来要让纯视觉模型可选，需要单独设计（它无法参与 agent 循环）。

### 阶段一的已知能力边界

OpenAI 兼容形状经 `openai_compatible_model_info_from_id`（:333-393）转换时：

- `base_instructions` 被硬设为 `String::new()` —— **阶段一拿不到基础指令下发能力**，
  那是 OIX 原生形状（阶段二）才有的。
- `supports_parallel_tool_calls` 只来自 OIX 内置 catalog，我们的模型 id 匹配不上 → false。
- `context_window` 未输出 → None，OIX 自动压缩会退回 128k 的保守假设。

这三条都是阶段二要解决的，现在记下来，不算缺陷。

## 改动清单

- **新增** `supply-chain-supply/src/main/java/com/supplychain/ai/llmgateway/LlmGatewayModelCatalog.java`
  把 `ModelDescriptor` 转成 OpenAI 兼容条目：`id` / `object` / `owned_by` / `name`（→ OIX 的 display_name）
  / `description` / `supported_parameters` / `architecture.input_modalities`。
  `owned_by` 统一署名 `xiaoxin`，不暴露真实上游渠道构成。
  能力映射：`TOOLS` → `tools` + `tool_choice`；`IMAGE`/`AUDIO`/`VIDEO` → 对应 input modality。
- **改** `LlmGatewayController.listModels()`
  删掉上游透传（连同 `forwardModelsResponse`），改为调用上面的 catalog。
  新增 `resolveCurrentUserId()`：现在就读 `UserUtil`，这样 T03 把白名单移除后自动按用户过滤，不用再改这里。
  响应显式带 `;charset=UTF-8`（见下）。
- **改** `LlmGatewayController` 类注释：定位从"纯调试工具"改为"正在生产化的网关"，
  并逐项列出已改造 / 未改造 / 未接鉴权的现状，避免下一个人误判成熟度。

## 验收

**已验证（真机，非推理）**：

停掉旧进程 → `mvn -o -pl supply-chain-supply -am package -DskipTests`（exit 0）→ 重启 → 真实 HTTP 请求：

```
HTTP 200  Content-Type: application/json;charset=UTF-8
object: list, count: 12
qwen3.8-max -> name "千问3.8-Max（推荐·强推理·支持图片）", desc "图片理解 · 工具调用 · 联网搜索"
             supported_parameters ["temperature","top_p","stream","tools","tool_choice"]
             architecture.input_modalities ["text","image"]
含 tools 的模型 11 / 12（qwen-vl-max 无 TOOLS，按设计隐藏）
```

**过程中发现并修掉的一个真问题**：最初响应是 `Content-Type: application/json`，不带 charset。
原始字节其实是正确 UTF-8（`e58d83` = 千），但不带 charset 时部分客户端会按 ISO-8859-1 解码，
中文展示名变成 `åé®3.8-Max`。JSON 默认 UTF-8 只是规范约定，显式声明成本为零，已改。

**未验证（阻塞在 T04）**：

- OIX 是否真的把这 12 条渲染进模型选择器。目前没有任何 provider 指向网关，客户端根本不会来拉。
  可见性规则是**读 OIX 源码推导**的，不是观察到的——这个区别很重要，T04 接通后必须实测确认。
- 「改服务端配置后客户端能看到变化」同样未验证，还涉及 OIX 的 `models-cache` 失效策略（A2c 未决项）。
- 按用户过滤未验证：本端点仍在 `jwt.whitelist` 中，没有用户上下文，走的是 `userId=null`
  → 返回全部已注册模型的分支。真实过滤要等 T03。

## 结论

网关侧改完了，HTTP 契约在真机上验证通过，并顺手修掉一个字符集缺陷。
最有价值的产出是发现了 `supported_parameters` 为空会导致整个模型列表静默消失——
这个坑不读 OIX 源码根本发现不了，踩上去会表现为"下拉框是空的但没有任何错误"。

**但不能说 T01 完整通过**：客户端能否正确渲染、按用户过滤是否生效，都还没被观察到。
这两条分别记在 T04 和 T03 的验收里。

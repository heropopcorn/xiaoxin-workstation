# T05 · 模型选择 UI 改为服务端下发清单

状态：**已完成（组件与装配层）** —— 真实 app 内的目视验证未做，见"未完成"
日期：2026-09-10
落地仓库：`D:\project\xiaoxin-workstation`

## 目标

用户在界面上看到并选择的，是网关下发的模型；网关不可用时给出明确提示而不是空白下拉框。

## 现状（改动前）

主聊天里的模型选择器不是独立组件：`ModelSelectorPopoverPanel.tsx:66` 直接以 `compact` 模式渲染
`ProfileManager`。也就是说**「选模型」在这个产品里等于「选 profile」**，
每个 AppProfile 自带 `provider` + `modelId`。

新建 profile 的入口由 `ProfileManager.buildVisibleProfilePresets()`（`ProfileManager.tsx:394`）决定，
它的数据源是 `buildProviderMenuEntries(runtimeProviders)`——即 OIX 的 provider 列表，
外加三条 app 侧合成条目（hosted、CLI terminal、custom endpoint），
在 `interpreterProviderMenu.ts:301` 的 `buildAppSpecialProviderEntries()` 里，
每条都标了 `isDocumentedFallback` 与「何时可以删掉」的说明。

单个 profile 的编辑面板是 `ProfileProviderConfig.tsx`，按 provider 分成若干 tab lane，
各自用不同的 hook 取模型列表（hosted 用 `useHostedModelCatalog`，api 用 `useInterpreterModels`，等等）。

## 方案

把网关做成**第一类 provider lane**，而不是塞进现有的 `api` lane。
理由：`api` lane 会渲染端点与密钥输入框，而网关的端点和凭据都归运营方所有，
用 `api` 就得到处写「这个 lane 要隐藏那几个字段」的例外，是典型的把复杂度摊到各处。

### 改动清单

- **`shared/types/model.ts`**：`ModelProvider` 增加 `'gateway'`。
- **`shared/types/provider.ts`**：`ProviderType` 增加 `'gateway'`。
- **`src/components/ProfileProviderConfig.tsx`**：这里还有**第三份**同名局部 `ProviderType`（`:98`），
  也要同步加，否则类型检查不会报错但 lane 就漏了。三份并存是既有问题，本次没有合并它们。
- **`src/lib/providers/interpreterProviderMenu.ts`**：
  - `APP_SPECIAL_PROVIDER_IDS.MODEL_GATEWAY = '__app:model-gateway'`
  - `buildAppSpecialProviderEntries({ includeModelGateway })` 按需合入网关条目。
    注释里明确写了**它不是 GAP**：运营方网关按定义就不可能被运行时枚举
    （端点来自 product overlay，目录由运营方下发），所以没有"将来可删除"的触发条件。
  - `buildProviderMenuEntries(providers, options)` 透传开关。
- **`src/components/ProfileManager.tsx`**：新增 `model-gateway` preset（`recommended` 组，排在最前），
  不带 baseURL、不带密钥、不带默认 modelId；`presetKeyFromMenuEntry` 增加 `case 'gateway'`。
- **新增 `src/components/ModelGatewayPicker.tsx`**：网关专用的模型列表。
- **`src/components/ProfileProviderConfig.tsx`**：新增 `gateway` lane 与对应面板。
- **`shared/utils/profileValidation.ts`**：`gateway` 与 hosted 同列——**只要求 modelId**，
  不要 baseURL、不要 apiKey。此前 `switch` 没有 default 分支，新成员会静默落空、
  导致没选模型的 profile 也被判为"完整"，而实际运行时会抛 `Model is required.`。
- **`server/utils/codexRuntime.ts`**：显式处理 `provider === 'gateway'` → `getCodexProfile('model-gateway')`。
  （`codexProfileId` 那条分支本来也能命中，但显式一条不依赖 profile 上恰好写了 `codexProfileId`。）
- **`shared/element-ids.ts`** + 7 个语言文件：新增 4 个 UI 文案键。

### 为什么没复用 `HostedModelPicker`

它是围绕 OpenRouter 目录形状写的：按 provider 分组、硬编码的推荐位网格（`RECOMMENDED_MODELS`）、
搜索、贵价模型徽章。我们的清单只有 11 项、由运营方策展、自带展示名和描述，
套上去要先把 `ModelGatewayModel[]` 硬塞成 `OpenRouterModel[]`，再逐个关掉它的特性。
新写的组件约 130 行，比适配层更短也更直白。

### 装配期抓到的一个真 bug

`buildVisibleProfilePresets` 在拼装 preset 时会把运行时菜单条目的元数据合并进来：

```
oixProviderId: entry.oixProviderId,
```

而 `buildProfileFromPreset`（`ProfileManager.tsx:1383`）随后有一句
`if (preset.oixProviderId) baseProfile.codexProfileId = preset.oixProviderId;`。

于是网关 preset 的 `codexProfileId` 会被覆盖成 `'__app:model-gateway'`——
一个仓库里明确注明「**must never be passed back to the app-server**」的合成 id。
原因是那段合并只对 `isDocumentedFallback` 的条目和 `custom-api` / `local` 做了豁免，
而网关条目我故意没标 `isDocumentedFallback`（它不是 GAP），所以掉进了合并分支。

修法：把 `model-gateway` 也加进豁免条件——网关没有值得合并的运行时元数据。

这个 bug 用「卡片渲染出来了」的测试是抓不到的，所以补了一条走完
**卡片 → 选模型 → 创建**的测试，断言落库的 profile 是
`{ provider: 'gateway', modelId: 'qwen3.8-max', codexProfileId: 'model-gateway' }`
且 `baseURL` / `apiKey` 均为 undefined。撤掉修复后该测试确实失败：
`expected '__app:model-gateway' to be 'model-gateway'`。

### 更严重的一个：网关 profile 会在下次启动时被删掉

这条是「UI 测试全绿但产品是坏的」的典型。配置加载走
`recoverLoadedModelConfigState`（`server/modelConfigTomlStore.ts:823`），
它对每个 profile 先 `isProfileValid`，不通过再 `repairProfile`，两者都失败就删掉；
**若删完一个不剩，还会用 `createHostedFallbackModelConfigState()`
换上两个 Interpreter hosted profile**。

这两个函数都是 `switch (profile.provider)` 且 `default` 分别返回 `false` / `null`。
新加的 `'gateway'` 没有分支，于是：

> 用户选好网关模型 → 创建 profile → 重启 → profile 不见了，
> 变成 Interpreter hosted 的 Smart / Fast。

TypeScript 完全不会报错，因为两个 `switch` 都有 `default`。
同一文件里 `isNestedModelValid` / `repairNestedModel`（管 `visionModel` / `fastModel`）
有一模一样的结构，所以四处一起补了。

`repairProfile` 的 `gateway` 分支把 profile 归一化成：
`providerId: undefined`（网关不是 app 的 builtin provider）、
`codexProfileId: MODEL_GATEWAY_PROVIDER_ID`、
`baseURL` / `apiKey` / `apiFormat` / `providerConfig` / `wireApi` / `useResponsesApi` 全部 undefined。

验收方式：新增两条测试（存盘能原样读回、没选模型的网关 profile 应被丢弃而不是凭空补一个模型）。
**注意单独撤掉任何一处修复测试仍然通过**——两处各自都足以救回来；
只有同时撤掉两处才复现原始 bug，实测报
`Expected: false / Received: true`（即被判为需要修复并替换）。

### 运行时解析器有两个，只改一个会埋雷

`codexProfileFromStoredProfile` 和 `resolveCodexProfileFromModelConfig`
是两条并行的解析路径，**真实对话走的是后者**（输入是 `profileToModelConfig` 产出的
`AgentModelConfig`）。后者原本没有 `gateway` 分支，`codexProfileId` 一旦缺失
（`buildProviderChange` 会清掉它，见 `shared/types/profile.ts:152`）就会抛
`Provider "gateway" is not supported by the Codex runtime`。两处都补了。

顺带核实过一个看着像 bug 的地方：`profileToModelConfig` 会给 gateway 填
`wireApi: 'responses'`（因为它只对 `api` / `local` 特判）。
实际无害——`resolveCodexProfileFromModelConfig` 命中
`isProfileId('model-gateway')` 分支后直接返回 `MODEL_GATEWAY_PROFILE`，
其 `providerConfig.wire_api` 是 `'chat'`，那个 `'responses'` 不参与请求构造。
没有去改它，避免为了「看起来对」而动一个无人读取的值。

### 网关是否存在，为什么要异步问

`hasModelGateway()` 这类同步判断在 renderer 里不可靠：端点允许被环境变量覆盖，
而 renderer 读不到 `process.env`。所以可见性由主进程回报的 `catalog.configured` 决定，
`ProfilePresetPicker` 调 `useModelGatewayCatalog()` 拿到后再传给 `buildVisibleProfilePresets`。
社区版没有网关时，这张卡片根本不出现。

## 验收

| 项 | 结果 |
| --- | --- |
| `tsc -p tsconfig.json` | 通过 |
| `interpreterProviderMenu.test.ts` | 6 项全过（含 2 条新增：无网关时不出现该条目；`__app:` id 不会当成运行时 provider 传出去） |
| `ProfileProviderConfig.ui.test.tsx`（vitest） | 17 项全过（15 既有 + 2 新增） |
| `ProfileManager.ui.test.tsx`（vitest） | 14 项全过（12 既有 + 2 新增） |
| 全量 `pnpm run test:vitest` | 75 文件 / 322 项全过 |
| `locales/__tests__/completeness.test.ts` | 33 项全过（7 语言键严格对齐，无占位译文） |
| `modelConfigTomlStore` / `profileValidation` / `codexRuntime` / `profiles` / `interpreterProviderMenu` / `modelGateway` | 130 项全过 |

新增测试覆盖的行为：

- 网关下发的模型渲染成可选项，点击后回调带上 `modelId` 与展示名；**页面上没有端点输入框**。
- 网关 502 时渲染明确的错误块 + 重试按钮，**选项数为 0 而不是静默空列表**；
  点重试后拉到模型并且错误块消失。
- 社区版（`configured: false`）不出现"Online models"卡片；配了网关才出现。
- 走完卡片 → 选模型 → 创建，落库 profile 是 `codexProfileId: 'model-gateway'`，
  不是合成 id，且不带 baseURL / apiKey。

## 未完成

- **未在真实 app 里目视确认**。上面是组件级与装配级证据，不等于把应用跑起来看过一眼。
- **首次启动（onboarding）不提供网关入口**。新用户走的是
  `ModelSetupScreen.tsx` 的 model pack 选择（hosted / local / api 三类），
  而不是设置里的 preset picker，所以全新用户看不到"Online models"卡片。
  hosted 那张卡由 `hasHostedApi()` 门控（`ModelSetupScreen.tsx:1412`），
  网关需要一个对称的门控 + 自己的 model pack。归入 T07。
- **无 profile 时的兜底仍然是 Interpreter hosted**
  （`createHostedFallbackModelConfigState()`，来自 `getOnboardingModelPack('hosted')`）。
  我们的发行版应该兜底到网关而不是 Interpreter 托管服务。归入 T07。
- 主聊天的紧凑选择器仍然列的是"已创建的 profile"，不是直接列模型。
  要做到"打开就是一串模型"，需要自动创建网关 profile + 收敛其他入口，那属于 T06 / T07。
- 网关 profile 目前不带鉴权令牌，`/models` 也还没按用户过滤（T03）。
- 三份并存的 `ProviderType` / `ModelProvider` 定义没有合并，属于既有技术债。
- `src/lib/codex` 下的集成测试（真实 app-server 二进制、Ollama、LM Studio、MCP）
  在本机是 `beforeAll` 超时失败，与本次改动无关，但也因此**没有**被用作本任务的证据。

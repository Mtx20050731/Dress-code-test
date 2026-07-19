# 真实数据接入契约 V1

本契约定义浏览器、业务服务、图片存储与视觉分析供应商之间的稳定边界。产品流程默认仍使用确定性 Mock；开发环境现已增加服务端 OpenAI Provider 验证入口，但尚未接入云存储或生产 API 路由。

契约版本：`2026-07-15`

## 设计结论

真实视觉模型只负责“看见并提出候选观察”，不能直接生成 `EvidenceRef`、`TasteStatement`、`coreTaste` 或最终 `StyleSystemOutput`。

```text
用户图片与意图
  → 私有图片资产
  → 异步视觉分析任务
  → 运行时契约校验
  → pending 观察候选
  → 用户确认 / 否认 / 修改
  → EvidenceRef
  → 本地确定性证据引擎
  → StyleSystemOutput
```

这条边界确保模型升级、供应商切换或提示词变化不会绕过用户纠正，也不会直接改写稳定画像。

## 文件位置

- `src/contracts/real-data.ts`：请求、响应、任务、媒体、错误和模型溯源类型。
- `src/contracts/real-data-validation.ts`：外部返回值运行时校验及领域映射。
- `src/contracts/image-analysis-schema.ts`：版本化单图分析结果的 Zod Schema、受控词表和运行时校验。
- `src/features/image-analysis/candidate-observations.ts`：模型结果到 pending 候选观察及复核后证据的转换。
- `src/services/ai/image-analysis-provider.ts`：单图分析供应商接口。
- `src/services/ai/mock-image-analysis-provider.ts`：确定性单图分析 Mock。
- `src/services/ai/openai-image-analysis-provider.ts`：服务端真实视觉 Provider、有限重试与一次结构修复。
- `src/services/integration/real-data-gateway.ts`：供应商无关网关与 HTTP 适配器。
- `src/services/integration/mock-real-data-gateway.ts`：确定性本地实现。
- `tests/real-data-contract.test.ts`：契约边界测试。
- `tests/image-analysis-contract.test.ts`：单图 Schema、失败降级与复核门禁测试。

## 接口清单

| 操作 | 建议路由 | 用途 |
| --- | --- | --- |
| 创建上传凭证 | `POST /v1/media/uploads` | 校验文件元数据并获得短期私有上传地址 |
| 确认上传完成 | `POST /v1/media/:assetId/complete` | 校验哈希、大小和图片尺寸，生成 `MediaAsset` |
| 删除媒体 | `POST /v1/media/:assetId/delete` | 用户删除、会话到期或替换图片 |
| 启动收藏解剖 | `POST /v1/analyses/archive-decode` | 创建异步视觉分析任务 |
| 读取任务 | `POST /v1/analysis-jobs/:jobId/read` | 读取排队、处理中、完成或失败状态 |

HTTP 路由只是推荐实现；页面依赖的是 `RealDataGateway`，因此可更换后端或供应商。

## 通用请求元数据

每次请求必须携带：

- `contractVersion`：拒绝不兼容的客户端或服务端版本。
- `requestId`：串联前端日志、服务端日志和供应商调用。
- `sessionId`：限定数据归属，服务端不能接受跨会话资产引用。
- `idempotencyKey`：上传、启动任务和删除重试时不能产生重复副作用。
- `submittedAt`、`locale`、`timezone`：用于审计与本地化，不参与风格推断。

## 图片与隐私

`MediaAsset` 固定为 `access: "private"`。上传前必须记录 `DataConsent`：

- 同意记录 ID 和隐私政策版本；
- 允许使用的图片用途；
- 同意时间；
- 是否允许用于模型训练，默认产品实现应为 `false`。

服务端实现还应满足：

- 只接受 JPEG、PNG、WebP；
- 校验文件大小、MIME、实际解码格式、尺寸和 SHA-256；
- 原图 URL 不写入分析事件 payload；
- 日志不记录上传签名地址；
- 删除资产时同步清除缩略图、派生图与未完成任务；
- 到期策略由服务端执行，不能只依赖浏览器清理。

## 单图分析输入

`ImageAnalysisInput` 只包含：

- `imageId`：图片资产的稳定 ID；
- `imageUrl`：供应商可访问的短期私有地址；
- `sourceType`：用户收藏、视觉采样、单品或近期穿搭；
- `expectedContent`：完整穿搭、单件服装、局部或未知。

供应商不能根据 URL 猜测图片归属。返回的 `imageId` 必须与输入一致，完整穿搭标记为 completed 时必须检测到人物，单品标记为 completed 时必须检测到服装。

## 单图分析输出 Schema

`ImageAnalysisResult` 强制包含：

- 检测到的人数及每个人物的区域和置信度；
- 检测到的服装及其人物归属和区域；
- 每件服装的类别、颜色、廓形和材质观察；
- 整套穿搭的比例和搭配关系；
- 遮挡、低清晰度、类别模糊等不确定内容；
- 每条观察的图片区域、置信度、依据和复核状态；
- 完整供应商与模型溯源。

区域坐标统一使用 0 到 1 的归一化值。观察不能引用不存在的区域，人物数量必须与人物检测列表一致。

运行时入口：

```ts
const result = ImageAnalysisResultSchema.safeParse(rawOutput);

if (!result.success) {
  // 记录 CONTRACT_MISMATCH，禁止写入用户会话。
}
```

针对当前输入还必须调用 `safeParseImageAnalysisForInput()`，检查返回图片 ID 和预期内容。

## Provider 接口

所有视觉供应商实现统一接口：

```ts
interface ImageAnalysisProvider {
  analyze(input: ImageAnalysisInput): Promise<ImageAnalysisResult>;
}
```

供应商适配器负责把原始厂商响应转换为 `ImageAnalysisResult`。业务层不依赖厂商字段、模型名称或 SDK。

## 视觉模型输出

模型只能返回：

- `ArchiveClusterProposal`：哪些图片可能有重复视觉线索；
- `ArchiveObservationProposal`：颜色、廓形、材质、比例、装饰、搭配关系、配饰和气质的候选观察；
- `AttributeCandidate`：受控属性键、来源图片、来源局部、解释与 `extractionConfidence`；
- `ProviderTrace`：供应商、模型、模型版本、提示词版本、耗时和完成时间。

`extractionConfidence` 只表示模型对“画面中是否出现该属性”的把握，不表示用户喜欢它，也不能转换为产品中的 emerging / supported / stable。

## 强制校验规则

外部返回在进入会话前必须通过 `validateArchiveDecodeResult()`：

1. 返回任务类型和输入图片集合必须与请求完全一致；
2. 所有图片引用必须属于当前任务；
3. 属性键必须存在于当前受控属性词表；
4. 固定风格类别不能作为属性键；
5. 机器提取可信度必须在 0 到 1 之间；
6. 每个候选必须有来源图片和可读依据；
7. 所有观察必须显式为 `requiresUserReview: true`；
8. 必须保留完整模型溯源信息。

任一关键字段失败时拒绝整个结果并记录 `CONTRACT_MISMATCH`，不能“尽量解析”后悄悄写入画像。

## 领域映射规则

校验通过后，`mapArchiveDecodeResultToDomain()` 只生成：

- `ArchiveCluster`；
- `ArchiveObservation`，且 `verdict` 必须为 `pending`。

映射过程会丢弃机器的 `extractionConfidence`，防止它污染用户置信状态。只有后续用户确认、否认或修改观察，`collectArchiveEvidence()` 才能生成对应证据。

单图分析通过 `mapImageAnalysisResultToArchiveObservations()` 映射后，同样只能生成 `pending` 收藏观察。复核规则为：

- `pending`：不生成观察确认权重；
- `confirmed`：生成用户主动确认的高权重正向证据；
- `rejected`：不再产生正向作用，并保留拒绝审计记录；
- `modified`：删除原观察作用，只让用户修改后的属性生成高权重条件证据。

模型原始输出如果把观察标成 confirmed、rejected 或 modified，Schema 会拒绝整个结果。

## 异步任务和重试

视觉分析统一使用 `queued | processing | completed | partial | needs-review | failed`。客户端遵守服务端返回的 `pollAfterMs`，并按错误中的 `retryable` 决定是否重试。

- `partial`：已有可用观察，但必须同时说明缺失或不确定内容；
- `needs-review`：不能自动判断输入内容，必须先交给用户复核；
- `failed`：没有可消费的分析结果，不能伪装成空的 completed。

- 相同 `idempotencyKey` 必须返回相同资源或任务；
- `RATE_LIMITED`、`PROVIDER_UNAVAILABLE` 可重试；
- `INVALID_REQUEST`、`CONTRACT_MISMATCH` 不应原样重试；
- 供应商超时不能伪装成空分析结果；
- 部分图片失败时通过 `warnings` 明示，不能静默删除来源。

## 错误契约

失败响应统一返回 `ContractFailure`：稳定错误码、安全说明、是否可重试、可选字段位置与结构化详情，以及与请求一致的 `requestId` 和契约版本。前端不得展示供应商原始堆栈、内部地址或密钥信息。

## 接入真实服务的实施顺序

1. 实现私有对象存储和上传完成校验；
2. 实现 `/v1` 服务端路由与会话归属校验；
3. 接入一个视觉供应商，并将原始响应映射为本契约；
4. 在服务端和客户端各做一次运行时校验；
5. 用匿名测试图片做影子流量，对比 Mock 与真实候选，不写用户画像；
6. 开放小流量收藏解剖，保留一键回退到 Mock；
7. 最后再接入单品分析、近期穿搭回访和去背景能力。

当前阶段没有执行生产连接，只完成了可替换、可校验、可测试的边界。

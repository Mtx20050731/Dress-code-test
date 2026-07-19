# 真实视觉模型小规模验证 V1

本阶段只验证“图片中可见的服装属性能否被可靠地结构化提取”。模型不是造型师，不判断用户喜欢什么，不生成个人风格，也不直接写入 `coreTaste`。

## 最小闭环

```text
开发者上传单张图片
  → 服务端 ImageAnalysisProvider
  → Qwen/OpenAI 真实视觉API或确定性 Mock
  → ImageAnalysisResultV1Schema 严格校验
  → pending CandidateObservation
  → 开发者模拟确认 / 否认 / 修改
  → EvidenceRef 预览
  → 现有本地证据引擎重新计算
```

开发页不会把结果写入 `StyleSession`。这使真实模型验证与正式用户画像保持隔离。

## Provider 实现

- `ImageAnalysisProvider` 是供应商无关接口。
- `MockImageAnalysisProvider` 提供确定性、无网络、无随机数的回退结果。
- `QwenImageAnalysisProvider` 通过阿里云百炼国内节点调用 `qwen3-vl-flash` JSON mode，并继续接受本地Zod严格校验。
- `OpenAIImageAnalysisProvider` 只在服务端调用 OpenAI Responses API。
- 页面只传 `requestedProvider`，不包含模型名或密钥。
- `OPENAI_VISION_MODEL` 决定真实模型；页面和提示词中均不硬编码模型。
- 同一进行中请求按图片与输入参数去重；图片 Data URL 不进入日志，也不作为明文缓存键保存。

## Schema 与提示词版本

- Schema：`image-analysis-result-v1`
- Prompt：`image-analysis-prompt-v1`
- Prompt 文件：`src/features/image-analysis/prompts/image-analysis-prompt-v1.ts`
- Zod Schema：`src/contracts/image-analysis-schema.ts`

成功结果必须通过真实 Zod 运行时校验。Schema 使用受控词表、严格对象和跨字段校验；额外自由字段会被拒绝。模型首次返回结构不合格时只允许一次修复请求，修复仍失败则返回统一 `schema-validation`，不会产生候选观察或写入会话。

视觉近似材质只能是：`cotton-like`、`denim-like`、`knit-like`、`wool-like`、`leather-like`、`silk-like`、`sheer-like`、`technical-like`、`unknown`。这些词不代表真实纤维成分。

## 环境变量

复制 `.env.example` 为 `.env.local`，默认配置无需密钥。国内真实验证使用：

```dotenv
IMAGE_ANALYSIS_PROVIDER=qwen
DASHSCOPE_API_KEY=你的阿里云百炼服务端密钥
QWEN_VISION_MODEL=qwen3-vl-flash
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

如需保留OpenAI验证，可设置：

```dotenv
IMAGE_ANALYSIS_PROVIDER=openai
OPENAI_API_KEY=你的服务端密钥
OPENAI_VISION_MODEL=你选择的、支持图片输入和结构化输出的模型名
```

不要给任何密钥添加 `NEXT_PUBLIC_` 前缀。若真实 Provider 缺少密钥或模型名，工厂会安全回退到 Mock，开发页会显示实际 Provider 和回退原因。运行 `npm run image-analysis:configure:qwen` 可通过隐藏输入窗口安全写入百炼密钥。

成本估算不硬编码易过期的模型价格。若填写两个 `*_COST_PER_1M`，Provider 会结合响应 token 用量估算单张成本；不填则报告 `n/a`。

## 开发测试页面

1. 启动开发服务：`pnpm dev`。
2. 打开 `http://localhost:3000/dev/image-analysis`。
3. 上传一张不超过 8 MB 的 JPEG、PNG 或 WebP。
4. 选择 Mock、Qwen（国内）或 OpenAI，设置预期内容后开始分析。
5. 检查 Schema、结构化结果、候选观察、Provider 元数据与延迟。
6. 模拟确认、否认或修改观察，并选择图片意图。
7. 查看转换后的 `EvidenceRef` 和本地置信状态重算。
8. 使用“删除”清除本地图片预览与分析缓存。

该页面和 API Route 在 `NODE_ENV=production` 下均返回不可用，不会出现在正式产品流程中。原始结构化模型输出只在这个开发入口显示。

## 用户复核门禁

- 所有 AI 观察固定以 `reviewStatus: "pending"` 进入候选层。
- pending、rejected、unknown、uncertain 不生成偏好证据。
- confirmed 只表示图片观察被认可；证据方向仍由用户的图片意图决定。
- modified 仅使用用户修正后的标准属性，并产生 conditional 证据。
- `borrow-element` 只转换用户勾选的属性。
- 模型的视觉 confidence 只留在候选上下文，不用作偏好置信权重。
- 单张图片的多条标签共享独立性键，不会被当成多条独立稳定证据。

## 离线评估集

目录：`src/evals/image-analysis/`

- `types.ts`：HumanAnnotation Zod Schema、运行记录与报告类型。
- `annotations/index.ts`：40 个待人工准备的评估槽位。
- `fixtures/`：仅放项目方确认可用于内部测试的图片。
- `dataset.ts`：9类图片的固定构成manifest。
- `annotation-validator.ts`：标注字段、unknown冲突和遮挡过度标注检查。
- `run-eval.ts`：运行 Provider 并保存逐图结果。
- `compare-results.ts`、`metrics.ts`：颜色family别名、not-comparable、分项指标和安全克制指标。
- `generate-report.ts`：输出JSON、Markdown、HTML和逐图差异，不生成综合准确率。

先把已获授权的图片放到 `src/evals/image-analysis/fixtures/01.jpg` 至 `40.jpg`，并在 `annotations/index.ts` 填写对应人工标注。完整规则见 `docs/image-analysis-annotation-guide.md`。然后运行：

```bash
npm run eval:validate-annotations
npm run eval:image-analysis -- --concurrency=2
npm run eval:image-analysis:report
```

`eval:image-analysis` 默认使用 Qwen；仍可用 `eval:image-analysis:openai` 或 `eval:image-analysis:mock` 显式切换。

结果写入：

- `src/evals/image-analysis/reports/latest-run.json`
- `src/evals/image-analysis/reports/results/*.json`
- `src/evals/image-analysis/reports/report.json`
- `src/evals/image-analysis/reports/report.md`
- `src/evals/image-analysis/reports/report.html`

未准备的槽位会明确标为 skipped，不会进入指标分母。真实命令缺少Key或模型时会阻止运行，不会回退Mock冒充真实结果。运行支持断点续跑、`--force`、受控并发、指定模型和Prompt版本。开发环境可在 `/dev/image-analysis-eval` 查看报告和逐图差异。

## 错误、重试与回退

所有错误统一为 `ImageAnalysisError`，UI 只显示安全中文消息：

| 情况 | 行为 |
| --- | --- |
| 缺少 Key / 模型名 | 自动切换 Mock，并显示开发提示 |
| 超时、连接错误 | 有限重试，指数退避 |
| 429、500/502/503/504 | 有限重试，指数退避 |
| 401、403、400/422 | 不盲目重试 |
| 图片超过 8 MB、格式不支持 | 在开发 API 入口直接拒绝 |
| 空结果、refusal | 不做结构修复，不写入数据 |
| Schema 失败 | 最多一次结构修复；仍失败则拒绝 |
| 重复请求 | 复用进行中的 Promise 和路由缓存 |

日志白名单只有 `analysisId`、`imageId`、provider、model、promptVersion、status、latency 和错误类型，不包含 API Key、图片 Base64、原始图片 URL或内部堆栈。

## 暂不可靠、需重点评估的属性

- 材质只能做视觉近似，尤其混纺、涂层、细密纹理和远景图片。
- 结构强度、松紧、体积和曲线强调容易受姿势、镜头和遮挡影响。
- 黑色或低照度下的叠穿层次、装饰和服装边界。
- 多人物、镜像、裁切、局部图和服装互相遮挡时的主人物归属。
- 相近色温、饱和度与明暗等级在滤镜或复杂光源下的稳定性。
- 搭配比例只能描述画面可见关系，不能推断真实尺码、面料或穿着体验。

这些维度应该通过 30—50 张人工标注图片逐项验证，而不是靠少量漂亮示例判断。

## 尚未接入正式 Style System

- `/explore/archive-decode` 尚未调用真实 Provider；当前仍保持原有 Mock 产品流。
- 开发页的确认/否认/修改只生成本地预览，不持久化正式会话。
- 没有后台队列、对象存储、删除审计、用户授权记录或生产级媒体生命周期。
- 没有把真实观察接入最终 `StyleSystemOutput`。
- 没有真实用户行为数据，也没有完成 30—50 张人工评估集。

进入 5—10 名真实用户测试之前，应先完成评估集、检查禁止推断为零、确认 Schema 有效率和复核可理解性，并对材质、结构、遮挡与多人物失败样本做人工审查。

# 本地证据推断系统 / Evidence Engine V1

本阶段仍然使用确定性的本地 Mock 数据与规则，不接入真实 AI，不使用随机结论，也不输出风格分类或精确百分比。

## 证据契约

每个 `EvidenceRef` 只描述一个属性上的一次证据作用：

- `source`：视觉采样、收藏图片、收藏确认、风格实验或真实穿搭回访。
- `targetType`：图片、局部、整套造型、属性或观察。
- `attributeKey`：颜色、廓形、材质、比例、装饰、搭配关系、配饰或气质的标准属性键。
- `direction`：positive、negative、neutral、aspirational 或 conditional。
- `intent`：want-to-wear、admire-only、borrow-element、uninterested 或 reject。
- `weight`：用于识别同等强度冲突，不直接转换为百分比。
- `relatedEntityId` 与 `independenceKey`：确保同一图片或同一造型的多个标签不会伪装成多条独立证据。

## 纯函数推断流水线

```text
collectVisualEvidence
collectArchiveEvidence
collectLabEvidence
        ↓
groupEvidenceByAttribute
        ↓
calculateConfidence
detectContradictions
        ↓
generateTasteStatements
generateStyleTensions
generateUnresolvedQuestions
        ↓
generateStyleSystemOutput
```

所有函数位于 `src/features/exploration/mock-engine.ts`，输入和输出均有 TypeScript 类型，不修改传入会话，并使用确定性排序与 ID。

## 意图隔离

- `want-to-wear`：可以支持 `coreTaste`。
- `admire-only`：优先进入 `aspirationalTaste`，不能单独进入 `coreTaste`。
- `borrow-element`：只作用于用户选中的属性，并作为 conditional 证据。
- `uninterested`：neutral，不形成正向或反向偏好。
- `reject`：negative，用于边界和冲突识别。

收藏中的“理想自我”和“图片氛围”映射为 aspirational；收藏中的“只喜欢元素”必须依赖局部标记。

## 置信状态

### emerging

- 至少 2 条独立同向证据；
- 但来源仍单一，或缺少确认/真实穿着验证。

### supported

- 至少 3 条独立同向证据且来自至少 2 种来源；
- 或存在一条用户主动确认的收藏观察。

### stable

- 至少 4 条独立同向证据；
- 跨至少 2 个阶段；
- 包含 `want-to-wear` 或真实穿着回访；
- 反向独立权重低于正向权重的 75%。

### unresolved

- 正反权重接近；
- 只有 `admire-only`；
- 用户否认或修改过主要观察；
- 或独立有效证据不足。

## 冲突处理

- 同一属性正反并存：保留冲突，不平均为中间值。
- 高彩度欣赏 + 低饱和现实穿着：分别进入 aspirational 和 core，并生成“色彩表达 × 日常安全感”。
- 中低结构正向 + 戏剧化结构拒绝：保留结构偏好，只把高强度结构写入边界。
- 单个元素替换后意愿转正：把限制归因到该元素和限制因素，不否定整套造型。

## 收藏纠正

- confirmed：生成用户确认的正向证据。
- denied：原观察不再产生正向证据，保留零权重否认记录供 Inspector 查看。
- modified：删除原观察的正向作用，只为用户选择的新属性生成 conditional 证据。
- 如果风格系统已经生成，收藏修正会立即重新计算本地结果。

## Style Lab 意愿转变

`recordWearingIntentChange()` 保存每次 pending / hesitant / reject / want-to-wear 变化。

只有以下顺序生成 `BoundaryTransition`：

```text
hesitant 或 reject
→ 替换一个元素
→ want-to-wear
```

边界记录包含修改维度、具体元素、修改前后属性、限制因素和可读解释。

## Evidence Inspector

运行开发服务器后访问 `/explore/style-system`：

```bash
pnpm dev
```

页面底部会出现 `EVIDENCE INSPECTOR / DEV ONLY`，可展开查看：

- 每条 TasteStatement 的分类原因和置信原因；
- positive、negative、aspirational、conditional 证据；
- 被用户否认的观察；
- unresolved 问题与建议验证步骤；
- styleTensions；
- 本地分析事件日志。

生产构建中该组件返回 `null`，不会渲染。

## 本地事件日志

事件保存在浏览器 `localStorage` 的 `undefined-style-analysis-events-v1`，不发送给第三方服务。事件 ID 按当前日志长度确定性生成。

## 单元测试

```bash
pnpm test
```

测试文件为 `tests/mock-engine.test.ts`，当前覆盖 12 个规则场景。

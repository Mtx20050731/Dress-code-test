import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareEvaluationRun } from "./compare-results";
import { calculateEvaluationMetrics } from "./metrics";
import type { EvaluationRun } from "./types";

function formatRate(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character] ?? character,
  );
}

export function generateEvaluationReport(run: EvaluationRun) {
  const differences = compareEvaluationRun(run.items);
  const metrics = calculateEvaluationMetrics(run, differences);
  const datasetComposition = Object.fromEntries(
    [...new Set(run.items.map((item) => item.manifest.datasetCategory))].map((category) => [
      category,
      run.items.filter((item) => item.manifest.datasetCategory === category).length,
    ]),
  );
  const failedSamples = differences
    .filter(
      (difference) =>
        difference.status === "failed"
        || difference.fields.some((field) => field.status === "mismatch")
        || difference.errorTags.length,
    )
    .map((difference) => {
      const item = run.items.find((candidate) => candidate.imageId === difference.imageId)!;
      return {
        imageId: difference.imageId,
        datasetCategory: difference.datasetCategory,
        annotation: item.annotation,
        aiResult: item.result ?? null,
        difference,
      };
    });

  return {
    reportVersion: "image-analysis-eval-report-v3",
    generatedAt: new Date().toISOString(),
    provider: run.effectiveProvider,
    requestedProvider: run.requestedProvider,
    model: run.model,
    promptVersion: run.promptVersion,
    schemaVersion: run.schemaVersion,
    datasetComposition,
    metrics,
    annotationReview: {
      humanReviewedImages: metrics.technical.humanReviewedImages,
      completedImages: metrics.technical.completedImages,
      requirement: "用户测试决策要求所有参与评估的标注均由项目方人工复核；Codex 辅助草稿不计入。",
    },
    failedSamples,
    differences,
  };
}

export function reportToMarkdown(report: ReturnType<typeof generateEvaluationReport>) {
  const { metrics } = report;
  const thresholdRows = metrics.thresholds
    .map((item) => `| ${item.kind} | ${item.label} | ${item.comparator} ${item.target} | ${item.actual ?? "n/a"} | ${item.status} |`)
    .join("\n");
  const capabilityRows = Object.entries(metrics.capabilities)
    .map(([attribute, level]) => `| ${attribute} | ${level} |`)
    .join("\n");
  const categoryRows = Object.entries(metrics.byCategory)
    .map(([category, value]) => `| ${category} | ${value.attempted} | ${value.failed} | ${formatRate(value.failureRate)} |`)
    .join("\n");
  const errorRows = metrics.topErrors.length
    ? metrics.topErrors.map((item) => `- ${item.error}: ${item.count}`).join("\n")
    : "- 无真实评估数据，尚不能判断常见错误。";
  const failureRows = report.failedSamples.length
    ? report.failedSamples.map((sample) => {
        const fieldRows = sample.difference.fields
          .filter((field) => field.status !== "match")
          .map((field) => `- ${field.attribute}: 人工=${String(field.expected)}，AI=${String(field.actual)}，${field.status}`)
          .join("\n") || "- 无字段差异";
        return `### ${sample.imageId} · ${sample.datasetCategory}\n\n错误标签：${sample.difference.errorTags.join(", ") || "无"}\n\n字段差异：\n${fieldRows}`;
      }).join("\n\n")
    : "尚无真实失败样本。";
  const decisionEligibility = metrics.decision.eligibleForDecision
    ? "有"
    : "无（至少需要 30 张真实 Provider 成功结果，且所有对应标注均由项目方人工复核）";

  return `# 视觉模型人工评估报告

> 这些门槛是本项目 MVP 第一阶段决策标准，不是通用行业标准。

## 运行信息

- Provider: ${report.provider}
- Model: ${report.model}
- Prompt: ${report.promptVersion}
- Schema: ${report.schemaVersion}
- 完成图片: ${metrics.technical.completedImages}/${metrics.technical.totalImages}
- 人工复核标注: ${metrics.technical.humanReviewedImages}/${metrics.technical.completedImages}
- 决策资格: ${decisionEligibility}
- 建议: ${metrics.decision.recommendation}

## 技术指标

- Schema 有效率: ${formatRate(metrics.technical.schemaValidRate)}
- Schema 修复率: ${formatRate(metrics.technical.schemaRepairRate)}
- 失败率: ${formatRate(metrics.technical.failureRate)}
- 平均延迟: ${metrics.technical.averageLatencyMs ?? "n/a"} ms
- 重试统计: ${JSON.stringify(metrics.technical.retryCountByType)}

## 视觉指标

- 可分析性: ${formatRate(metrics.visual.analyzabilityAccuracy.rate)}
- 主人物: ${formatRate(metrics.visual.primarySubjectAccuracy.rate)}
- 服装类别: ${formatRate(metrics.visual.garmentCategoryMatchRate.rate)}
- 主色大色系: ${formatRate(metrics.visual.primaryColorFamilyMatchRate.rate)}
- 饱和度: ${formatRate(metrics.visual.saturationMatchRate.rate)}
- 明暗: ${formatRate(metrics.visual.brightnessMatchRate.rate)}
- 松紧/fit: ${formatRate(metrics.visual.silhouetteFitMatchRate.rate)}
- 结构: ${formatRate(metrics.visual.structureMatchRate.rate)}
- 体积: ${formatRate(metrics.visual.volumeMatchRate.rate)}
- 材质近似: ${formatRate(metrics.visual.materialApproximationMatchRate.rate)}
- 可见性问题: ${formatRate(metrics.visual.visibilityIssueDetectionRate.rate)}
- 多人物: ${formatRate(metrics.visual.multiPersonHandlingRate.rate)}

## 安全与克制

- 材质过度断言: ${metrics.safety.materialOverclaimCount}
- 不可见属性猜测: ${metrics.safety.invisibleAttributeGuessCount}
- 禁止推断: ${metrics.safety.forbiddenInferenceCount}
- 应为 unknown 但被断言: ${metrics.safety.unknownExpectedButAssertedCount}
- 低置信度却确定表达: ${metrics.safety.lowConfidencePresentedAsCertainCount}
- 未复核观察进入偏好证据: ${metrics.safety.unreviewedPreferenceEvidenceCount}
- Key/Base64 日志泄漏: ${metrics.safety.sensitiveLogLeakCount}

## 不确定性

- 合理 unknown 率: ${formatRate(metrics.uncertainty.appropriateUnknownRate)}
- 不必要 unknown 率: ${formatRate(metrics.uncertainty.unnecessaryUnknownRate)}
- uncertain 按属性: ${JSON.stringify(metrics.uncertainty.uncertainObservationCountByAttribute)}

## 门槛

| 类型 | 指标 | 门槛 | 实际 | 状态 |
| --- | --- | --- | --- | --- |
${thresholdRows}

## 按图片类型失败率

| 类别 | 已运行 | 失败 | 失败率 |
| --- | ---: | ---: | ---: |
${categoryRows}

## 最常见五种错误

${errorRows}

## 属性能力分级

| 属性 | 建议 |
| --- | --- |
${capabilityRows}

## 失败样本差异

${failureRows}

本报告不提供单一综合准确率。
`;
}

export function reportToHtml(report: ReturnType<typeof generateEvaluationReport>, markdown: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Image Analysis Eval</title><style>body{font:14px/1.6 system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#171717}pre{white-space:pre-wrap;background:#f5f5f5;padding:24px;border:1px solid #ddd}</style></head><body><h1>视觉模型人工评估报告</h1><p>${escapeHtml(`${report.provider} · ${report.model} · ${report.promptVersion}`)}</p><pre>${escapeHtml(markdown)}</pre></body></html>`;
}

export function generateReportCli() {
  const directory = resolve(process.cwd(), "src/evals/image-analysis/reports");
  const runPath = resolve(directory, "latest-run.json");
  if (!existsSync(runPath)) {
    throw new Error("没有真实评估运行记录。请先运行 npm run eval:image-analysis；不会使用 Mock 或空数据伪造报告。");
  }
  const run = JSON.parse(readFileSync(runPath, "utf8")) as EvaluationRun;
  const report = generateEvaluationReport(run);
  const markdown = reportToMarkdown(report);
  writeFileSync(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(directory, "report.md"), markdown);
  writeFileSync(resolve(directory, "report.html"), reportToHtml(report, markdown));
  process.stdout.write(markdown);
  return report;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/generate-report.js")) {
  try {
    generateReportCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "报告生成失败"}\n`);
    process.exitCode = 1;
  }
}

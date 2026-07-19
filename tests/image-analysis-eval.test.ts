import test from "node:test";
import assert from "node:assert/strict";
import { MockImageAnalysisProvider } from "../src/services/ai/mock-image-analysis-provider";
import type { ImageAnalysisProvider } from "../src/services/ai/image-analysis-provider";
import type { ImageAnalysisResultV1 } from "../src/contracts/image-analysis-schema";
import { HumanAnnotationSchema, type EvaluationManifestEntry, type EvaluationRun, type HumanAnnotation } from "../src/evals/image-analysis/types";
import { validateHumanAnnotation } from "../src/evals/image-analysis/annotation-validator";
import { compareEvaluationItem, containsForbiddenInference, normalizeColorFamily } from "../src/evals/image-analysis/compare-results";
import { executeEvaluation } from "../src/evals/image-analysis/run-eval";
import { generateEvaluationReport } from "../src/evals/image-analysis/generate-report";
import { isDevImageAnalysisEnabled } from "../src/features/image-analysis/dev-access";

const imageUrl = "data:image/jpeg;base64,dGVzdA==";
const baseInput = { imageId: "eval-test-1", imageUrl, sourceType: "user-archive" as const, expectedContent: "full-outfit" as const };

async function fixtureResult(imageId = "eval-test-1") {
  return new MockImageAnalysisProvider().analyze({ ...baseInput, imageId });
}

function annotationFromResult(result: ImageAnalysisResultV1, overrides: Partial<HumanAnnotation> = {}): HumanAnnotation {
  const garment = result.analysis.garments[0];
  return {
    imageId: result.imageId,
    filename: `${result.imageId}.jpg`,
    datasetCategory: "clear-single-person",
    expectedContent: "full-outfit",
    analyzable: result.analysis.analyzable,
    imageIssues: ["none"],
    primarySubject: { peopleCount: result.analysis.peopleCount, primarySubjectId: result.analysis.primaryPersonId ? "subject-1" : null, primarySubjectVisible: true },
    garments: [{
      id: "g-human-1", subjectId: "subject-1", category: garment.category.value,
      primaryColorFamily: garment.colorFamily.value, saturation: garment.saturation.value,
      brightness: garment.lightness.value, temperature: garment.temperature.value,
      fit: garment.fit.value, structure: garment.structure.value, volume: garment.volume.value,
      visibility: "full", materialApproximation: garment.visualMaterial.value, fieldsThatAreUncertain: [],
    }],
    outfitObservations: { layering: result.analysis.outfit.layering.value, proportion: result.analysis.outfit.proportion.value, notes: "" },
    attributesThatMustRemainUnknown: [], forbiddenInferences: ["personality", "occupation"],
    annotationNotes: "test", annotatedBy: "test-annotator", annotatedAt: "2026-07-15T00:00:00.000Z", annotationVersion: "human-annotation-v1",
    ...overrides,
  };
}

function entry(annotation: HumanAnnotation): EvaluationManifestEntry {
  return { imageId: annotation.imageId, filename: annotation.filename, fixturePath: `fixtures/${annotation.filename}`, datasetCategory: annotation.datasetCategory, expectedContent: annotation.expectedContent, annotation };
}

function runItem(result: ImageAnalysisResultV1, annotation: HumanAnnotation) {
  const manifestEntry = entry(annotation);
  const { annotation: _annotation, ...manifest } = manifestEntry;
  void _annotation;
  return { imageId: result.imageId, manifest, annotation, status: "completed" as const, schemaValid: true, schemaIssues: [], result, latencyMs: result.providerMetadata.latencyMs, retryCountByType: {}, resumed: false, completedAt: "2026-07-15T00:00:00.000Z" };
}

test("forbiddenInference 使用完整词匹配并忽略视觉属性短语", () => {
  assert.equal(containsForbiddenInference("average brightness", "age"), false);
  assert.equal(containsForbiddenInference("warm temperature preference", "preference"), false);
  assert.equal(containsForbiddenInference("This reveals the user's age and preference", "age"), true);
  assert.equal(containsForbiddenInference("This reveals the user's age and preference", "preference"), true);
});

test("1. HumanAnnotation Schema 接受完整人工标注", async () => {
  const result = await fixtureResult();
  assert.equal(HumanAnnotationSchema.safeParse(annotationFromResult(result)).success, true);
});

test("2. unknown 字段不会被强制填充", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  annotation.garments[0] = { ...annotation.garments[0], primaryColorFamily: "unknown", saturation: "unknown", brightness: "unknown", temperature: "unknown", fit: "unknown", structure: "unknown", volume: "unknown", materialApproximation: "unknown" };
  assert.equal(HumanAnnotationSchema.safeParse(annotation).success, true);
  assert.equal(validateHumanAnnotation(annotation).filter((issue) => issue.severity === "error").length, 0);
});

test("3. forbiddenInference 会从模型判断依据中被检测", async () => {
  const result = structuredClone(await fixtureResult());
  result.analysis.garments[0].category.rationale = "This reveals personality";
  const difference = compareEvaluationItem(runItem(result, annotationFromResult(result)));
  assert.equal(difference.forbiddenInferenceCount, 1);
});

test("4. 对人工unknown材质作确定断言会计为overclaim", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  annotation.garments[0].materialApproximation = "unknown";
  annotation.attributesThatMustRemainUnknown = ["garments.g-human-1.materialApproximation"];
  const difference = compareEvaluationItem(runItem(result, annotation));
  assert.equal(difference.materialOverclaimCount, 1);
});

test("5. 严重遮挡下断言不可见属性会被计数", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  annotation.garments[0].visibility = "heavily-occluded";
  annotation.garments[0].fit = "unknown";
  annotation.garments[0].structure = "unknown";
  annotation.garments[0].volume = "unknown";
  annotation.garments[0].temperature = "unknown";
  annotation.garments[0].materialApproximation = "unknown";
  assert.ok(compareEvaluationItem(runItem(result, annotation)).invisibleAttributeGuessCount >= 1);
});

test("6. 颜色大色系别名正确匹配", async () => {
  const result = structuredClone(await fixtureResult());
  result.analysis.garments[0].colorFamily.value = "gray";
  const annotation = annotationFromResult(result);
  annotation.garments[0].primaryColorFamily = "charcoal";
  const field = compareEvaluationItem(runItem(result, annotation)).fields.find((item) => item.attribute === "primaryColorFamily");
  assert.equal(normalizeColorFamily("charcoal"), "gray");
  assert.equal(field?.status, "match");
});

test("7. not-comparable 不会被误计为错误", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  annotation.garments[0].fit = "unknown";
  const difference = compareEvaluationItem(runItem(result, annotation));
  const field = difference.fields.find((item) => item.attribute === "fit");
  assert.equal(field?.status, "not-comparable");
  assert.equal(difference.errorTags.includes("fit-mismatch"), false);
});

test("8. 已成功图片默认断点续跑", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  let calls = 0;
  const provider: ImageAnalysisProvider = { analyze: async () => { calls += 1; return result; } };
  const options = { dataset: [entry(annotation)], provider, requestedProvider: "mock" as const, effectiveProvider: "mock" as const, model: "mock-image-analysis-v1", promptVersion: "image-analysis-prompt-v1", fallbackReason: null, concurrency: 1, force: false, readFixture: async () => imageUrl, now: () => new Date("2026-07-15T00:00:00.000Z") };
  const first = await executeEvaluation(options);
  const second = await executeEvaluation({ ...options, previousRun: first });
  assert.equal(calls, 1);
  assert.equal(second.items[0].resumed, true);
});

test("9. --force语义会重新请求成功图片", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  let calls = 0;
  const provider: ImageAnalysisProvider = { analyze: async () => { calls += 1; return result; } };
  const base = { dataset: [entry(annotation)], provider, requestedProvider: "mock" as const, effectiveProvider: "mock" as const, model: "mock-image-analysis-v1", promptVersion: "image-analysis-prompt-v1", fallbackReason: null, concurrency: 1, force: false, readFixture: async () => imageUrl };
  const first = await executeEvaluation(base);
  await executeEvaluation({ ...base, previousRun: first, force: true });
  assert.equal(calls, 2);
});

test("10. 单张失败不会中断后续图片", async () => {
  const firstResult = await fixtureResult("eval-fail");
  const secondResult = await fixtureResult("eval-ok");
  const firstAnnotation = annotationFromResult(firstResult);
  const secondAnnotation = annotationFromResult(secondResult);
  const provider: ImageAnalysisProvider = { analyze: async (input) => { if (input.imageId === "eval-fail") throw new TypeError("network"); return secondResult; } };
  const run = await executeEvaluation({ dataset: [entry(firstAnnotation), entry(secondAnnotation)], provider, requestedProvider: "mock", effectiveProvider: "mock", model: "mock-image-analysis-v1", promptVersion: "image-analysis-prompt-v1", fallbackReason: null, concurrency: 2, force: false, readFixture: async () => imageUrl });
  assert.deepEqual(run.items.map((item) => item.status), ["failed", "completed"]);
});

test("11. 报告按图片类别统计且Mock不具备决策资格", async () => {
  const result = await fixtureResult();
  const annotation = annotationFromResult(result);
  const item = runItem(result, annotation);
  const run: EvaluationRun = { runVersion: "image-analysis-eval-run-v2", runId: "run-test", requestedProvider: "mock", effectiveProvider: "mock", model: "mock-image-analysis-v1", promptVersion: "image-analysis-prompt-v1", schemaVersion: "image-analysis-result-v1", fallbackReason: null, startedAt: "2026-07-15T00:00:00.000Z", completedAt: "2026-07-15T00:00:01.000Z", force: false, concurrency: 1, items: [item] };
  const report = generateEvaluationReport(run);
  assert.equal(report.metrics.byCategory["clear-single-person"].attempted, 1);
  assert.equal(report.metrics.decision.eligibleForDecision, false);
});

test("12. 开发评估页在生产环境不可访问", () => {
  assert.equal(isDevImageAnalysisEnabled("production"), false);
  assert.equal(isDevImageAnalysisEnabled("development"), true);
});

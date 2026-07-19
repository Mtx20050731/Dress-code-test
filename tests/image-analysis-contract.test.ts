import test from "node:test";
import assert from "node:assert/strict";
import {
  ImageAnalysisResultV1Schema,
  safeParseImageAnalysisForInput,
  type ImageAnalysisResultV1,
} from "../src/contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "../src/contracts/real-data";
import {
  buildCandidateObservations,
  candidateObservationsToEvidence,
  reviewCandidateObservation,
} from "../src/features/image-analysis/candidate-observations";
import { MockImageAnalysisProvider } from "../src/services/ai/mock-image-analysis-provider";
import { buildArchiveReviewModel } from "../src/features/image-analysis/archive-analysis";
import { normalizeImageAnalysisModelOutput } from "../src/features/image-analysis/model-output-normalizer";

const input: ImageAnalysisInput = {
  imageId: "image-1",
  imageUrl: "data:image/jpeg;base64,dGVzdA==",
  sourceType: "user-archive",
  expectedContent: "full-outfit",
};

async function validResult(): Promise<ImageAnalysisResultV1> {
  return new MockImageAnalysisProvider().analyze(input);
}

test("低依据材质会被压回 unknown 并进入不确定项", () => {
  const raw = {
    garments: [{
      id: "g1",
      regionId: "r1",
      visualMaterial: { id: "m1", value: "silk-like", confidence: 0.98, regionIds: ["r1"], rationale: "看起来有光泽", reviewStatus: "confirmed" },
      ornaments: [],
    }],
    uncertainObservations: [],
  };
  const normalized = normalizeImageAnalysisModelOutput(raw) as typeof raw;
  assert.equal(normalized.garments[0].visualMaterial.value, "unknown");
  assert.equal(normalized.garments[0].visualMaterial.reviewStatus, "pending");
  assert.equal(normalized.uncertainObservations.length, 1);
});

test("正式收藏聚合后的模型观察始终保持 pending", async () => {
  const result = await validResult();
  const candidates = buildCandidateObservations(result).map((item) => ({ ...item, reviewStatus: "confirmed" as const }));
  const review = buildArchiveReviewModel([{ imageId: input.imageId, status: "completed", requestedProvider: "mock", effectiveProvider: "mock", candidates }]);
  assert.ok(review.observations.length > 0);
  assert.equal(review.observations.every((item) => item.verdict === "pending"), true);
});

test("单图分析结果包含人物、服装、区域和可复核观察", async () => {
  const parsed = ImageAnalysisResultV1Schema.safeParse(await validResult());
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.analysis.peopleCount, 1);
  assert.equal(parsed.data.analysis.garments.length, 1);
  assert.equal(parsed.data.analysis.garments[0].colorFamily.reviewStatus, "pending");
  assert.equal(parsed.data.analysis.garments[0].colorFamily.regionIds.length > 0, true);
});

test("缺少有效区域引用时 Schema 校验失败", async () => {
  const raw = structuredClone(await validResult());
  raw.analysis.garments[0].visualMaterial.regionIds = ["missing-region"];
  assert.equal(ImageAnalysisResultV1Schema.safeParse(raw).success, false);
});

test("观察置信度超出 0 到 1 时 Schema 校验失败", async () => {
  const raw = structuredClone(await validResult());
  raw.analysis.garments[0].colorFamily.confidence = 1.2;
  assert.equal(ImageAnalysisResultV1Schema.safeParse(raw).success, false);
});

test("人物数量与人物列表不一致时 Schema 校验失败", async () => {
  const raw = structuredClone(await validResult());
  raw.analysis.peopleCount = 2;
  assert.equal(ImageAnalysisResultV1Schema.safeParse(raw).success, false);
});

test("AI 不能把新观察直接标记为 confirmed", async () => {
  const raw = structuredClone(await validResult()) as unknown as Record<string, unknown>;
  const analysis = raw.analysis as Record<string, unknown>;
  const garment = (analysis.garments as Array<Record<string, unknown>>)[0];
  (garment.silhouette as Record<string, unknown>).reviewStatus = "confirmed";
  assert.equal(ImageAnalysisResultV1Schema.safeParse(raw).success, false);
});

test("partial 和 needs-review 必须列出不确定内容", async () => {
  const raw = structuredClone(await validResult());
  raw.analysis.status = "partial";
  raw.analysis.uncertainObservations = [];
  assert.equal(ImageAnalysisResultV1Schema.safeParse(raw).success, false);
});

test("返回的 imageId 必须与输入一致", async () => {
  const raw = structuredClone(await validResult());
  raw.imageId = "another-image";
  assert.equal(safeParseImageAnalysisForInput(raw, input).success, false);
});

test("AI 候选默认 pending，未经复核不生成偏好证据", async () => {
  const candidates = buildCandidateObservations(await validResult());
  assert.equal(candidates.every((item) => item.reviewStatus === "pending"), true);
  assert.equal(candidateObservationsToEvidence({ observations: candidates, intent: "want-to-wear", createdAt: "2026-07-15T00:00:00.000Z" }).length, 0);
});

test("用户确认后按图片意图生成 EvidenceRef", async () => {
  const candidate = buildCandidateObservations(await validResult()).find((item) => item.attributeKey)!;
  const confirmed = reviewCandidateObservation(candidate, { status: "confirmed" });
  const evidence = candidateObservationsToEvidence({ observations: [confirmed], intent: "want-to-wear", createdAt: "2026-07-15T00:00:00.000Z" });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].direction, "positive");
  assert.equal(evidence[0].weight, 1.1);
});

test("用户否认后不生成正向 EvidenceRef", async () => {
  const candidate = buildCandidateObservations(await validResult()).find((item) => item.attributeKey)!;
  const rejected = reviewCandidateObservation(candidate, { status: "rejected" });
  assert.equal(candidateObservationsToEvidence({ observations: [rejected], intent: "want-to-wear", createdAt: "2026-07-15T00:00:00.000Z" }).length, 0);
});

test("用户修改后只使用修正后的属性", async () => {
  const candidate = buildCandidateObservations(await validResult()).find((item) => item.attributeKey)!;
  const modified = reviewCandidateObservation(candidate, { status: "modified", editedValue: "流动感", editedAttributeKey: "material-fluid" });
  const evidence = candidateObservationsToEvidence({ observations: [modified], intent: "want-to-wear", createdAt: "2026-07-15T00:00:00.000Z" });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].attributeKey, "material-fluid");
  assert.equal(evidence[0].direction, "conditional");
});

test("unknown 和 uncertain 属性不会转换为稳定偏好证据", async () => {
  const result = await new MockImageAnalysisProvider().analyze({ ...input, expectedContent: "unknown" });
  const candidates = buildCandidateObservations(result).map((item) => reviewCandidateObservation(item, { status: "confirmed" }));
  assert.equal(result.analysis.uncertainObservations.length > 0, true);
  assert.equal(candidateObservationsToEvidence({ observations: candidates, intent: "want-to-wear", createdAt: "2026-07-15T00:00:00.000Z" }).length, 0);
});

test("禁止的自由字段不能进入严格 Schema", async () => {
  const raw = structuredClone(await validResult()) as unknown as Record<string, unknown>;
  const analysis = raw.analysis as Record<string, unknown>;
  analysis.userPersonality = "introvert";
  assert.equal(ImageAnalysisResultV1Schema.safeParse(raw).success, false);
});

test("borrow-element 只为用户选中的候选生成证据", async () => {
  const candidates = buildCandidateObservations(await validResult()).filter((item) => item.attributeKey).slice(0, 2).map((item) => reviewCandidateObservation(item, { status: "confirmed" }));
  const evidence = candidateObservationsToEvidence({ observations: candidates, intent: "borrow-element", selectedCandidateIds: [candidates[0].id], createdAt: "2026-07-15T00:00:00.000Z" });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].relatedEntityId, input.imageId);
});

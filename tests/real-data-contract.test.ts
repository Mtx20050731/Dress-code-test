import test from "node:test";
import assert from "node:assert/strict";
import { attributeTokens } from "../src/data/style-exploration-mock";
import { mapArchiveDecodeResultToDomain, validateArchiveDecodeResult } from "../src/contracts/real-data-validation";
import {
  REAL_DATA_CONTRACT_VERSION,
  type ArchiveDecodeResult,
  type ContractMeta,
  type StartArchiveDecodeRequest,
} from "../src/contracts/real-data";
import { MockRealDataGateway } from "../src/services/integration/mock-real-data-gateway";

const now = "2026-07-15T00:00:00.000Z";
const knownAttributeKeys = new Set(attributeTokens.map((item) => item.id));

const validResult: ArchiveDecodeResult = {
  kind: "archive-decode",
  jobId: "job-1",
  inputAssetIds: ["asset-1", "asset-2"],
  clusters: [{
    id: "cluster-1",
    title: "重复色彩",
    sourceAssetIds: ["asset-1", "asset-2"],
    candidates: [{
      attributeKey: "color-neutral-low",
      dimension: "color",
      extractionConfidence: 0.8,
      sourceAssetIds: ["asset-1", "asset-2"],
      sourceRegionIds: [],
      rationale: "多张图片出现低饱和中性色。",
    }],
  }],
  observations: [{
    id: "observation-1",
    dimension: "color",
    title: "中性色重复出现",
    description: "等待用户确认是否喜欢颜色本身。",
    sourceAssetIds: ["asset-1", "asset-2"],
    candidates: [{
      attributeKey: "color-neutral-low",
      dimension: "color",
      extractionConfidence: 0.8,
      sourceAssetIds: ["asset-1", "asset-2"],
      sourceRegionIds: [],
      rationale: "多张图片出现低饱和中性色。",
    }],
    requiresUserReview: true,
  }],
  warnings: [],
  providerTrace: {
    provider: "test-provider",
    model: "vision-model",
    modelVersion: "1",
    promptVersion: "archive-v1",
    completedAt: now,
    processingMs: 120,
  },
};

test("真实返回通过校验后，观察仍保持 pending", () => {
  const validated = validateArchiveDecodeResult(validResult, ["asset-1", "asset-2"], knownAttributeKeys);
  assert.equal(validated.valid, true);
  if (!validated.valid) return;
  const domain = mapArchiveDecodeResultToDomain(validated.value);
  assert.equal(domain.observations[0].verdict, "pending");
  assert.equal("extractionConfidence" in domain.observations[0], false);
});

test("未知属性键不能进入领域模型", () => {
  const invalid = structuredClone(validResult);
  invalid.observations[0].candidates[0].attributeKey = "style-old-money";
  assert.equal(validateArchiveDecodeResult(invalid, ["asset-1", "asset-2"], knownAttributeKeys).valid, false);
});

test("返回引用任务外图片时拒绝整个结果", () => {
  const invalid = structuredClone(validResult);
  invalid.clusters[0].candidates[0].sourceAssetIds = ["asset-foreign"];
  assert.equal(validateArchiveDecodeResult(invalid, ["asset-1", "asset-2"], knownAttributeKeys).valid, false);
});

test("AI 观察不能跳过用户复核", () => {
  const invalid = structuredClone(validResult) as unknown as Record<string, unknown>;
  const observations = invalid.observations as Array<Record<string, unknown>>;
  observations[0].requiresUserReview = false;
  assert.equal(validateArchiveDecodeResult(invalid, ["asset-1", "asset-2"], knownAttributeKeys).valid, false);
});

test("Mock 网关按幂等键返回同一任务，且结果可通过契约校验", async () => {
  const gateway = new MockRealDataGateway();
  const meta: ContractMeta = {
    contractVersion: REAL_DATA_CONTRACT_VERSION,
    requestId: "request-1",
    sessionId: "session-1",
    idempotencyKey: "decode-1",
    submittedAt: now,
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
  };
  const request: StartArchiveDecodeRequest = {
    meta,
    consentReceiptId: "consent-1",
    images: [
      { assetId: "asset-1", intent: "want-to-wear", selectedRegions: [] },
      { assetId: "asset-2", intent: "ideal-self", selectedRegions: [] },
    ],
    requestedDimensions: ["color", "silhouette"],
  };
  const first = await gateway.startArchiveDecode(request);
  const second = await gateway.startArchiveDecode({ ...request, meta: { ...meta, requestId: "request-2" } });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.data.jobId, second.data.jobId);

  const job = await gateway.getArchiveDecodeJob({ meta, jobId: first.data.jobId });
  assert.equal(job.ok, true);
  if (!job.ok || !job.data.result) return;
  assert.equal(validateArchiveDecodeResult(job.data.result, ["asset-1", "asset-2"], knownAttributeKeys).valid, true);
});

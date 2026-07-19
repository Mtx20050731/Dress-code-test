import type {
  ArchiveDecodeResult,
  AttributeCandidate,
} from "./real-data";
import type { ArchiveCluster, ArchiveObservation, AttributeDimension } from "../types/style";

export type ContractValidationIssue = {
  path: string;
  message: string;
};

export type ContractValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; issues: ContractValidationIssue[] };

const dimensions = new Set<AttributeDimension>([
  "color",
  "silhouette",
  "material",
  "proportion",
  "ornament",
  "stylingRelation",
  "accessory",
  "mood",
]);

const forbiddenCategoryFragments = ["french", "old-money", "korean", "minimalist-style", "法式", "老钱", "韩系"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCandidate(
  value: unknown,
  path: string,
  allowedAssetIds: Set<string>,
  knownAttributeKeys: Set<string>,
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) return [{ path, message: "必须是对象" }];

  if (!nonEmptyString(value.attributeKey)) {
    issues.push({ path: `${path}.attributeKey`, message: "缺少标准属性键" });
  } else {
    const attributeKey = value.attributeKey;
    if (!knownAttributeKeys.has(attributeKey)) {
      issues.push({ path: `${path}.attributeKey`, message: "属性键不在当前受控词表中" });
    }
    if (forbiddenCategoryFragments.some((fragment) => attributeKey.toLowerCase().includes(fragment))) {
      issues.push({ path: `${path}.attributeKey`, message: "固定风格类别不能作为底层属性" });
    }
  }

  if (!nonEmptyString(value.dimension) || !dimensions.has(value.dimension as AttributeDimension)) {
    issues.push({ path: `${path}.dimension`, message: "维度无效" });
  }
  if (typeof value.extractionConfidence !== "number" || value.extractionConfidence < 0 || value.extractionConfidence > 1) {
    issues.push({ path: `${path}.extractionConfidence`, message: "机器提取可信度必须在 0 到 1 之间" });
  }
  if (!Array.isArray(value.sourceAssetIds) || value.sourceAssetIds.length === 0) {
    issues.push({ path: `${path}.sourceAssetIds`, message: "至少需要一张来源图片" });
  } else {
    value.sourceAssetIds.forEach((id, index) => {
      if (!nonEmptyString(id) || !allowedAssetIds.has(id)) {
        issues.push({ path: `${path}.sourceAssetIds.${index}`, message: "引用了本次任务之外的图片" });
      }
    });
  }
  if (!Array.isArray(value.sourceRegionIds)) {
    issues.push({ path: `${path}.sourceRegionIds`, message: "局部来源必须是数组" });
  }
  if (!nonEmptyString(value.rationale)) {
    issues.push({ path: `${path}.rationale`, message: "必须说明机器观察依据" });
  }
  return issues;
}

export function validateArchiveDecodeResult(
  value: unknown,
  expectedAssetIds: string[],
  knownAttributeKeys: Set<string>,
): ContractValidationResult<ArchiveDecodeResult> {
  if (!isRecord(value)) return { valid: false, issues: [{ path: "$", message: "返回值必须是对象" }] };
  const issues: ContractValidationIssue[] = [];
  const allowedAssetIds = new Set(expectedAssetIds);

  if (value.kind !== "archive-decode") issues.push({ path: "kind", message: "任务类型不匹配" });
  if (!nonEmptyString(value.jobId)) issues.push({ path: "jobId", message: "缺少任务 ID" });
  if (!Array.isArray(value.inputAssetIds)) {
    issues.push({ path: "inputAssetIds", message: "输入图片列表无效" });
  } else {
    const actual = [...value.inputAssetIds].sort().join("|");
    const expected = [...expectedAssetIds].sort().join("|");
    if (actual !== expected) issues.push({ path: "inputAssetIds", message: "返回图片集合与请求不一致" });
  }

  for (const collectionName of ["clusters", "observations"] as const) {
    const collection = value[collectionName];
    if (!Array.isArray(collection)) {
      issues.push({ path: collectionName, message: "必须是数组" });
      continue;
    }
    collection.forEach((item, itemIndex) => {
      const itemPath = `${collectionName}.${itemIndex}`;
      if (!isRecord(item)) {
        issues.push({ path: itemPath, message: "必须是对象" });
        return;
      }
      if (!nonEmptyString(item.id)) issues.push({ path: `${itemPath}.id`, message: "缺少 ID" });
      if (!nonEmptyString(item.title)) issues.push({ path: `${itemPath}.title`, message: "缺少标题" });
      if (collectionName === "observations") {
        if (!nonEmptyString(item.description)) issues.push({ path: `${itemPath}.description`, message: "缺少说明" });
        if (item.requiresUserReview !== true) issues.push({ path: `${itemPath}.requiresUserReview`, message: "AI 观察必须经过用户复核" });
        if (!nonEmptyString(item.dimension) || !dimensions.has(item.dimension as AttributeDimension)) {
          issues.push({ path: `${itemPath}.dimension`, message: "观察维度无效" });
        }
      }
      if (!Array.isArray(item.sourceAssetIds) || item.sourceAssetIds.some((id) => !nonEmptyString(id) || !allowedAssetIds.has(id))) {
        issues.push({ path: `${itemPath}.sourceAssetIds`, message: "来源图片引用无效" });
      }
      if (!Array.isArray(item.candidates) || item.candidates.length === 0) {
        issues.push({ path: `${itemPath}.candidates`, message: "至少需要一个属性候选" });
      } else {
        item.candidates.forEach((candidate, candidateIndex) => {
          issues.push(...validateCandidate(candidate, `${itemPath}.candidates.${candidateIndex}`, allowedAssetIds, knownAttributeKeys));
        });
      }
    });
  }

  if (!Array.isArray(value.warnings)) issues.push({ path: "warnings", message: "warnings 必须是数组" });
  if (!isRecord(value.providerTrace)) {
    issues.push({ path: "providerTrace", message: "缺少模型溯源信息" });
  } else {
    for (const key of ["provider", "model", "modelVersion", "promptVersion", "completedAt"] as const) {
      if (!nonEmptyString(value.providerTrace[key])) {
        issues.push({ path: `providerTrace.${key}`, message: "模型溯源字段不能为空" });
      }
    }
    if (typeof value.providerTrace.processingMs !== "number" || value.providerTrace.processingMs < 0) {
      issues.push({ path: "providerTrace.processingMs", message: "处理耗时无效" });
    }
  }

  return issues.length > 0
    ? { valid: false, issues }
    : { valid: true, value: value as ArchiveDecodeResult };
}

export function mapArchiveDecodeResultToDomain(result: ArchiveDecodeResult): {
  clusters: ArchiveCluster[];
  observations: ArchiveObservation[];
} {
  const uniqueKeys = (candidates: AttributeCandidate[]) => [...new Set(candidates.map((item) => item.attributeKey))];
  return {
    clusters: result.clusters.map((cluster) => ({
      id: cluster.id,
      title: cluster.title,
      imageIds: [...cluster.sourceAssetIds],
      attributeIds: uniqueKeys(cluster.candidates),
    })),
    observations: result.observations.map((observation) => ({
      id: observation.id,
      dimension: observation.dimension,
      title: observation.title,
      description: observation.description,
      attributeIds: uniqueKeys(observation.candidates),
      imageIds: [...observation.sourceAssetIds],
      verdict: "pending",
    })),
  };
}

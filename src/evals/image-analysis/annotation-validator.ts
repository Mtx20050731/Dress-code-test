import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { HumanAnnotationSchema, type AnnotationValidationIssue, type EvaluationManifestEntry, type HumanAnnotation } from "./types";
import { expectedDatasetComposition, imageAnalysisEvalDataset } from "./dataset";

const hiddenSensitiveFields = ["fit", "structure", "volume", "materialApproximation", "temperature"] as const;

function determinedValueAtPath(annotation: HumanAnnotation, path: string): unknown {
  const parts = path.split(".");
  if (parts[0] === "garments" && parts.length === 3) {
    const garment = annotation.garments.find((item) => item.id === parts[1]);
    return garment?.[parts[2] as keyof typeof garment];
  }
  if (parts[0] === "outfitObservations" && parts.length === 2) {
    return annotation.outfitObservations[parts[1] as keyof typeof annotation.outfitObservations];
  }
  if (parts[0] === "primarySubject" && parts.length === 2) {
    return annotation.primarySubject[parts[1] as keyof typeof annotation.primarySubject];
  }
  return undefined;
}

function isUnknownValue(value: unknown): boolean {
  return value === "unknown" || value === null || value === undefined;
}

export function validateHumanAnnotation(raw: unknown, expected?: Omit<EvaluationManifestEntry, "annotation">): AnnotationValidationIssue[] {
  const imageId = typeof raw === "object" && raw !== null && "imageId" in raw ? String((raw as { imageId: unknown }).imageId) : expected?.imageId ?? "unknown";
  const parsed = HumanAnnotationSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({ severity: "error", imageId, path: issue.path.join("."), message: issue.message }));
  }
  const annotation = parsed.data;
  const issues: AnnotationValidationIssue[] = [];
  const add = (severity: AnnotationValidationIssue["severity"], path: string, message: string) => issues.push({ severity, imageId: annotation.imageId, path, message });

  if (expected) {
    if (annotation.imageId !== expected.imageId) add("error", "imageId", "标注 imageId 与 manifest 不一致");
    if (annotation.filename !== expected.filename) add("error", "filename", "标注文件名与 manifest 不一致");
    if (annotation.datasetCategory !== expected.datasetCategory) add("error", "datasetCategory", "标注图片类别与 manifest 不一致");
    if (annotation.expectedContent !== expected.expectedContent) add("error", "expectedContent", "标注内容类型与 manifest 不一致");
  }
  if (annotation.analyzable && annotation.garments.length === 0) add("error", "garments", "可分析图片至少需要一条人工服装标注");
  if (!annotation.annotationVersion.trim()) add("error", "annotationVersion", "标注版本不能为空");
  if (annotation.annotationVersion.includes("draft") || annotation.annotatedBy.includes("codex-assisted")) {
    add("warning", "annotationVersion", "当前是Codex辅助标注初稿，进入用户测试决策前必须由项目方人工复核");
  }
  if (annotation.forbiddenInferences.length === 0) add("error", "forbiddenInferences", "禁止推断清单不能为空");

  annotation.garments.forEach((garment, index) => {
    if (garment.visibility !== "heavily-occluded") return;
    hiddenSensitiveFields.forEach((field) => {
      const value = garment[field];
      if (!isUnknownValue(value) && !garment.fieldsThatAreUncertain.includes(field)) {
        add("error", `garments.${index}.${field}`, `严重遮挡时 ${field} 不得在没有 uncertain 标记的情况下填写具体值`);
      }
    });
  });

  annotation.attributesThatMustRemainUnknown.forEach((path, index) => {
    const value = determinedValueAtPath(annotation, path);
    if (value === undefined) {
      add("warning", `attributesThatMustRemainUnknown.${index}`, `unknown 路径无法定位：${path}`);
    } else if (!isUnknownValue(value)) {
      add("error", `attributesThatMustRemainUnknown.${index}`, `${path} 被要求保持 unknown，但人工标注给出了确定值 ${String(value)}`);
    }
  });
  return issues;
}

export function validateAnnotationDataset(dataset: EvaluationManifestEntry[] = imageAnalysisEvalDataset, checkFiles = true): AnnotationValidationIssue[] {
  const issues: AnnotationValidationIssue[] = [];
  if (dataset.length !== 40) issues.push({ severity: "error", imageId: "manifest", path: "length", message: `第一批评估集必须恰好40张，当前${dataset.length}张` });
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  dataset.forEach((entry) => {
    if (ids.has(entry.imageId)) issues.push({ severity: "error", imageId: entry.imageId, path: "imageId", message: "manifest imageId 重复" });
    ids.add(entry.imageId);
    counts.set(entry.datasetCategory, (counts.get(entry.datasetCategory) ?? 0) + 1);
    if (!entry.annotation) {
      issues.push({ severity: "pending", imageId: entry.imageId, path: "annotation", message: "等待项目方放入已授权图片并完成人工标注" });
    } else {
      const { annotation: _annotation, ...expected } = entry;
      void _annotation;
      issues.push(...validateHumanAnnotation(entry.annotation, expected));
    }
    if (checkFiles && !existsSync(resolve(process.cwd(), entry.fixturePath))) {
      issues.push({ severity: "pending", imageId: entry.imageId, path: "fixturePath", message: `缺少评估图片：${entry.fixturePath}` });
    }
  });
  Object.entries(expectedDatasetComposition).forEach(([category, expected]) => {
    const actual = counts.get(category) ?? 0;
    if (actual !== expected) issues.push({ severity: "error", imageId: "manifest", path: category, message: `${category} 应有${expected}张，当前${actual}张` });
  });
  return issues;
}

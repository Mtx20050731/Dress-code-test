import { z } from "zod";
import type { ImageAnalysisInput } from "./real-data";

export const IMAGE_ANALYSIS_SCHEMA_VERSION = "image-analysis-result-v1" as const;

export const ImageAnalysisInputSchema = z.object({
  imageId: z.string().min(1),
  imageUrl: z.string().min(1),
  sourceType: z.enum(["user-archive", "visual-sampling", "garment-item", "outfit-check-in"]),
  expectedContent: z.enum(["full-outfit", "single-garment", "detail", "unknown"]),
}).strict();

const normalizedRegionSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).strict();

function observationSchema<T extends readonly [string, ...string[]]>(values: T) {
  return z.object({
    id: z.string().min(1),
    value: z.enum(values),
    confidence: z.number().min(0).max(1),
    regionIds: z.array(z.string().min(1)).min(1),
    rationale: z.string().min(1).max(500),
    reviewStatus: z.literal("pending"),
  }).strict();
}

export const GARMENT_CATEGORIES = [
  "outerwear", "top", "shirt", "knitwear", "dress", "skirt", "trousers",
  "shorts", "denim", "jumpsuit", "footwear", "bag", "accessory", "unknown",
] as const;
export const COLOR_FAMILIES = [
  "black", "white", "gray", "beige", "brown", "red", "orange", "yellow",
  "green", "blue", "purple", "pink", "metallic", "multicolor", "unknown",
] as const;
export const SATURATION_LEVELS = ["low", "medium", "high", "unknown"] as const;
export const LIGHTNESS_LEVELS = ["dark", "medium", "light", "unknown"] as const;
export const COLOR_TEMPERATURES = ["warm", "neutral", "cool", "unknown"] as const;
export const SILHOUETTES = [
  "straight", "fitted", "oversized", "a-line", "cropped", "longline",
  "voluminous", "asymmetric", "soft-draped", "unknown",
] as const;
export const FIT_LEVELS = ["tight", "fitted", "regular", "relaxed", "oversized", "unknown"] as const;
export const STRUCTURE_LEVELS = ["soft", "low", "medium", "strong", "unknown"] as const;
export const VOLUME_LEVELS = ["low", "medium", "high", "unknown"] as const;
export const CURVE_EMPHASIS_LEVELS = ["low", "medium", "high", "unknown"] as const;
export const VISUAL_MATERIALS = [
  "cotton-like", "denim-like", "knit-like", "wool-like", "leather-like",
  "silk-like", "sheer-like", "technical-like", "unknown",
] as const;
export const ORNAMENTS = [
  "plain", "print", "embroidery", "ruffle", "pleat", "hardware", "fringe",
  "lace", "cutout", "contrast-stitching", "unknown",
] as const;
export const LAYERING_LEVELS = ["single", "light-layering", "multi-layered", "unknown"] as const;
export const OUTFIT_PROPORTIONS = [
  "balanced", "top-heavy", "bottom-heavy", "short-over-long", "long-over-short",
  "waist-emphasis", "vertical-elongation", "unknown",
] as const;
export const STYLING_RELATIONS = [
  "tonal", "high-contrast", "single-focus", "mixed-texture", "repeated-color",
  "soft-hard-contrast", "unknown",
] as const;

const personSchema = z.object({
  id: z.string().min(1),
  regionId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  isPrimary: z.boolean(),
}).strict();

const garmentSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1).nullable(),
  regionId: z.string().min(1),
  category: observationSchema(GARMENT_CATEGORIES),
  colorFamily: observationSchema(COLOR_FAMILIES),
  saturation: observationSchema(SATURATION_LEVELS),
  lightness: observationSchema(LIGHTNESS_LEVELS),
  temperature: observationSchema(COLOR_TEMPERATURES),
  silhouette: observationSchema(SILHOUETTES),
  fit: observationSchema(FIT_LEVELS),
  structure: observationSchema(STRUCTURE_LEVELS),
  volume: observationSchema(VOLUME_LEVELS),
  curveEmphasis: observationSchema(CURVE_EMPHASIS_LEVELS),
  visualMaterial: observationSchema(VISUAL_MATERIALS),
  ornaments: z.array(observationSchema(ORNAMENTS)),
}).strict();

const uncertainObservationSchema = z.object({
  id: z.string().min(1),
  attribute: z.enum([
    "analyzability", "person-count", "garment-category", "color-family", "saturation",
    "lightness", "temperature", "silhouette", "fit", "structure", "volume",
    "curve-emphasis", "visual-material", "ornament", "layering", "outfit-proportion",
    "styling-relation", "unknown",
  ]),
  reason: z.enum([
    "occluded", "low-resolution", "blur", "cropped", "ambiguous", "out-of-frame",
    "multiple-people", "not-visible", "unsupported-content", "other",
  ]),
  description: z.string().min(1).max(500),
  garmentId: z.string().min(1).nullable(),
  regionIds: z.array(z.string().min(1)),
}).strict();

export const ImageAnalysisModelOutputV1Schema = z.object({
  status: z.enum(["completed", "partial", "needs-review"]),
  analyzable: z.boolean(),
  qualityIssues: z.array(z.enum([
    "low-resolution", "blur", "occluded", "cropped", "poor-lighting", "multiple-people",
    "unsupported-content", "none",
  ])),
  regions: z.array(normalizedRegionSchema),
  peopleCount: z.number().int().nonnegative(),
  people: z.array(personSchema),
  primaryPersonId: z.string().min(1).nullable(),
  garments: z.array(garmentSchema),
  outfit: z.object({
    layering: observationSchema(LAYERING_LEVELS),
    proportion: observationSchema(OUTFIT_PROPORTIONS),
    stylingRelation: observationSchema(STYLING_RELATIONS),
  }).strict(),
  uncertainObservations: z.array(uncertainObservationSchema),
}).strict().superRefine((value, context) => {
  const regionIds = new Set(value.regions.map((region) => region.id));
  const personIds = new Set(value.people.map((person) => person.id));
  const garmentIds = new Set(value.garments.map((garment) => garment.id));
  const observationIds = new Set<string>();

  if (value.peopleCount !== value.people.length) {
    context.addIssue({ code: "custom", path: ["peopleCount"], message: "人物数量必须与人物列表一致" });
  }
  if (value.primaryPersonId !== null && !personIds.has(value.primaryPersonId)) {
    context.addIssue({ code: "custom", path: ["primaryPersonId"], message: "主要人物引用无效" });
  }
  if ((value.status === "partial" || value.status === "needs-review") && value.uncertainObservations.length === 0) {
    context.addIssue({ code: "custom", path: ["uncertainObservations"], message: "降级结果必须说明不确定内容" });
  }
  if (!value.analyzable && value.status === "completed") {
    context.addIssue({ code: "custom", path: ["status"], message: "不可分析图片不能标记 completed" });
  }

  const checkRegion = (regionId: string, path: Array<string | number>) => {
    if (!regionIds.has(regionId)) context.addIssue({ code: "custom", path, message: "引用了不存在的图片区域" });
  };
  const checkObservation = (observation: { id: string; regionIds: string[] }, path: Array<string | number>) => {
    if (observationIds.has(observation.id)) context.addIssue({ code: "custom", path: [...path, "id"], message: "观察 ID 不能重复" });
    observationIds.add(observation.id);
    observation.regionIds.forEach((regionId, index) => checkRegion(regionId, [...path, "regionIds", index]));
  };

  value.people.forEach((person, index) => checkRegion(person.regionId, ["people", index, "regionId"]));
  value.garments.forEach((garment, index) => {
    checkRegion(garment.regionId, ["garments", index, "regionId"]);
    if (garment.personId !== null && !personIds.has(garment.personId)) {
      context.addIssue({ code: "custom", path: ["garments", index, "personId"], message: "服装关联人物无效" });
    }
    const base = ["garments", index] as Array<string | number>;
    checkObservation(garment.category, [...base, "category"]);
    checkObservation(garment.colorFamily, [...base, "colorFamily"]);
    checkObservation(garment.saturation, [...base, "saturation"]);
    checkObservation(garment.lightness, [...base, "lightness"]);
    checkObservation(garment.temperature, [...base, "temperature"]);
    checkObservation(garment.silhouette, [...base, "silhouette"]);
    checkObservation(garment.fit, [...base, "fit"]);
    checkObservation(garment.structure, [...base, "structure"]);
    checkObservation(garment.volume, [...base, "volume"]);
    checkObservation(garment.curveEmphasis, [...base, "curveEmphasis"]);
    checkObservation(garment.visualMaterial, [...base, "visualMaterial"]);
    garment.ornaments.forEach((observation, ornamentIndex) => checkObservation(observation, [...base, "ornaments", ornamentIndex]));
  });
  checkObservation(value.outfit.layering, ["outfit", "layering"]);
  checkObservation(value.outfit.proportion, ["outfit", "proportion"]);
  checkObservation(value.outfit.stylingRelation, ["outfit", "stylingRelation"]);
  value.uncertainObservations.forEach((uncertain, index) => {
    if (uncertain.garmentId !== null && !garmentIds.has(uncertain.garmentId)) {
      context.addIssue({ code: "custom", path: ["uncertainObservations", index, "garmentId"], message: "不确定项关联服装无效" });
    }
    uncertain.regionIds.forEach((regionId, regionIndex) => checkRegion(regionId, ["uncertainObservations", index, "regionIds", regionIndex]));
  });
  value.regions.forEach((region, index) => {
    if (region.x + region.width > 1 || region.y + region.height > 1) {
      context.addIssue({ code: "custom", path: ["regions", index], message: "区域范围超出图片" });
    }
  });
});

export const ProviderMetadataV1Schema = z.object({
  provider: z.enum(["openai", "qwen", "mock"]),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  responseId: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  repairAttempted: z.boolean(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
  }).strict(),
}).strict();

export const ImageAnalysisResultV1Schema = z.object({
  schemaVersion: z.literal(IMAGE_ANALYSIS_SCHEMA_VERSION),
  analysisId: z.string().min(1),
  imageId: z.string().min(1),
  analysis: ImageAnalysisModelOutputV1Schema,
  providerMetadata: ProviderMetadataV1Schema,
}).strict();

export type ImageAnalysisModelOutputV1 = z.infer<typeof ImageAnalysisModelOutputV1Schema>;
export type ImageAnalysisResultV1 = z.infer<typeof ImageAnalysisResultV1Schema>;
export type ImageAttributeObservationV1 = z.infer<ReturnType<typeof observationSchema>>;

export type InputBoundParseResult =
  | { success: true; data: ImageAnalysisResultV1 }
  | { success: false; error: z.ZodError };

export function safeParseImageAnalysisForInput(rawOutput: unknown, input: ImageAnalysisInput): InputBoundParseResult {
  const parsed = ImageAnalysisResultV1Schema.safeParse(rawOutput);
  if (!parsed.success) return parsed;
  const issues: z.core.$ZodIssue[] = [];
  if (parsed.data.imageId !== input.imageId) {
    issues.push({ code: "custom", path: ["imageId"], message: "返回结果不属于当前输入图片", input: parsed.data.imageId });
  }
  if (parsed.data.analysis.status === "completed" && input.expectedContent === "full-outfit" && parsed.data.analysis.peopleCount === 0) {
    issues.push({ code: "custom", path: ["analysis", "peopleCount"], message: "完整穿搭未检测到人物时不能标记 completed", input: 0 });
  }
  if (parsed.data.analysis.status === "completed" && input.expectedContent === "single-garment" && parsed.data.analysis.garments.length === 0) {
    issues.push({ code: "custom", path: ["analysis", "garments"], message: "单品图片未检测到服装时不能标记 completed", input: [] });
  }
  return issues.length ? { success: false, error: new z.ZodError(issues) } : parsed;
}

export const IMAGE_ANALYSIS_MODEL_JSON_SCHEMA = z.toJSONSchema(ImageAnalysisModelOutputV1Schema, {
  target: "draft-7",
  unrepresentable: "any",
});

// Backward-compatible export name used by the existing contract tests.
export const ImageAnalysisResultSchema = ImageAnalysisResultV1Schema;

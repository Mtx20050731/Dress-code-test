import { z } from "zod";
import {
  COLOR_TEMPERATURES,
  FIT_LEVELS,
  GARMENT_CATEGORIES,
  LIGHTNESS_LEVELS,
  SATURATION_LEVELS,
  STRUCTURE_LEVELS,
  VISUAL_MATERIALS,
  VOLUME_LEVELS,
  type ImageAnalysisResultV1,
} from "../../contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "../../contracts/real-data";

export const DATASET_CATEGORIES = [
  "clear-single-person",
  "single-garment-product",
  "street-complex-background",
  "dark-low-light",
  "occluded-cropped",
  "multiple-people",
  "complex-layering",
  "filtered-special-light",
  "difficult-material",
] as const;

export const IMAGE_ISSUES = [
  "none", "low-resolution", "blur", "heavily-occluded", "partially-occluded",
  "cropped", "poor-lighting", "multiple-people", "filter-color-shift",
  "special-lighting", "complex-background", "collage", "unsupported-content",
] as const;

export const HUMAN_COLOR_FAMILIES = [
  "black", "white", "gray", "charcoal", "beige", "cream", "camel", "brown",
  "red", "burgundy", "orange", "yellow", "green", "olive", "blue", "navy",
  "purple", "pink", "metallic", "multicolor", "unknown",
] as const;

export const GARMENT_VISIBILITY = ["full", "partial", "heavily-occluded", "out-of-frame", "unknown"] as const;
export const HUMAN_GARMENT_FIELDS = [
  "category", "primaryColorFamily", "saturation", "brightness", "temperature",
  "fit", "structure", "volume", "visibility", "materialApproximation",
] as const;

export const HumanGarmentAnnotationSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1).nullable(),
  category: z.enum(GARMENT_CATEGORIES),
  primaryColorFamily: z.enum(HUMAN_COLOR_FAMILIES),
  saturation: z.enum(SATURATION_LEVELS),
  brightness: z.enum(LIGHTNESS_LEVELS),
  temperature: z.enum(COLOR_TEMPERATURES),
  fit: z.enum(FIT_LEVELS),
  structure: z.enum(STRUCTURE_LEVELS),
  volume: z.enum(VOLUME_LEVELS),
  visibility: z.enum(GARMENT_VISIBILITY),
  materialApproximation: z.enum(VISUAL_MATERIALS),
  fieldsThatAreUncertain: z.array(z.enum(HUMAN_GARMENT_FIELDS)),
}).strict();

export const HumanAnnotationSchema = z.object({
  imageId: z.string().min(1),
  filename: z.string().min(1),
  datasetCategory: z.enum(DATASET_CATEGORIES),
  expectedContent: z.enum(["full-outfit", "single-garment", "detail", "unknown"]),
  analyzable: z.boolean(),
  imageIssues: z.array(z.enum(IMAGE_ISSUES)).min(1),
  primarySubject: z.object({
    peopleCount: z.number().int().nonnegative().nullable(),
    primarySubjectId: z.string().min(1).nullable(),
    primarySubjectVisible: z.boolean().nullable(),
  }).strict(),
  garments: z.array(HumanGarmentAnnotationSchema),
  outfitObservations: z.object({
    layering: z.enum(["single", "light-layering", "multi-layered", "unknown"]),
    proportion: z.enum([
      "balanced", "top-heavy", "bottom-heavy", "short-over-long", "long-over-short",
      "waist-emphasis", "vertical-elongation", "unknown",
    ]),
    notes: z.string(),
  }).strict(),
  attributesThatMustRemainUnknown: z.array(z.string().min(1)),
  forbiddenInferences: z.array(z.string().min(1)).min(1),
  annotationNotes: z.string(),
  annotatedBy: z.string().min(1),
  annotatedAt: z.string().datetime({ offset: true }),
  annotationVersion: z.string().min(1),
}).strict();

export type DatasetCategory = z.infer<typeof HumanAnnotationSchema>["datasetCategory"];
export type HumanAnnotation = z.infer<typeof HumanAnnotationSchema>;
export type HumanGarmentAnnotation = z.infer<typeof HumanGarmentAnnotationSchema>;
export type HumanGarmentField = z.infer<typeof HumanGarmentAnnotationSchema>["fieldsThatAreUncertain"][number];

export type EvaluationManifestEntry = {
  imageId: string;
  filename: string;
  fixturePath: string;
  datasetCategory: DatasetCategory;
  expectedContent: ImageAnalysisInput["expectedContent"];
  annotation: HumanAnnotation | null;
};

export type AnnotationValidationIssue = {
  severity: "error" | "warning" | "pending";
  imageId: string;
  path: string;
  message: string;
};

export type RetryCountByType = Record<string, number>;

export type EvaluationRunItem = {
  imageId: string;
  manifest: Omit<EvaluationManifestEntry, "annotation">;
  annotation: HumanAnnotation | null;
  status: "completed" | "failed" | "skipped";
  schemaValid: boolean;
  schemaIssues: string[];
  result?: ImageAnalysisResultV1;
  errorType?: string;
  latencyMs: number | null;
  retryCountByType: RetryCountByType;
  resumed: boolean;
  completedAt: string | null;
};

export type EvaluationRun = {
  runVersion: "image-analysis-eval-run-v2";
  runId: string;
  requestedProvider: "openai" | "qwen" | "mock";
  effectiveProvider: "openai" | "qwen" | "mock";
  model: string;
  promptVersion: string;
  schemaVersion: string;
  fallbackReason: string | null;
  startedAt: string;
  completedAt: string;
  force: boolean;
  concurrency: number;
  items: EvaluationRunItem[];
};

export type MetricCounter = {
  correct: number;
  incorrect: number;
  notComparable: number;
  rate: number | null;
};

export type FieldDifference = {
  garmentId: string | null;
  attribute: string;
  expected: string | number | boolean | null;
  actual: string | number | boolean | null;
  status: "match" | "mismatch" | "not-comparable";
  detail?: string;
};

export type ImageEvaluationDifference = {
  imageId: string;
  datasetCategory: DatasetCategory;
  status: EvaluationRunItem["status"];
  schemaValid: boolean;
  fields: FieldDifference[];
  errorTags: string[];
  materialOverclaimCount: number;
  invisibleAttributeGuessCount: number;
  forbiddenInferenceCount: number;
  unknownExpectedButAssertedCount: number;
  lowConfidencePresentedAsCertainCount: number;
  appropriateUnknownCount: number;
  expectedUnknownCount: number;
  unnecessaryUnknownCount: number;
  expectedKnownCount: number;
  uncertainObservationCountByAttribute: Record<string, number>;
  unreviewedPreferenceEvidenceCount: number;
  latencyMs: number | null;
  retryCountByType: RetryCountByType;
};

export type CapabilityLevel = "auto-candidate" | "low-confidence-candidate" | "user-required" | "unsupported";

export type EvaluationThreshold = {
  key: string;
  label: string;
  kind: "hard" | "recommended";
  comparator: ">=" | "<=" | "===";
  target: number;
  actual: number | null;
  status: "pass" | "fail" | "not-evaluated";
};

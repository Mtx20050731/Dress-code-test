import type { EvidenceDirection, EvidenceRef, ImageAnalysisCandidate, UserIntent } from "../../types/style";
import type { ImageAnalysisResultV1, ImageAttributeObservationV1 } from "../../contracts/image-analysis-schema";
import type { ReviewStatus } from "../../contracts/real-data";

export type CandidateObservation = ImageAnalysisCandidate;

const neutralColors = new Set(["black", "white", "gray", "beige", "brown"]);
const accentColors = new Set(["red", "orange", "yellow", "green", "blue", "purple", "pink", "metallic", "multicolor"]);

function mapAttributeKey(attributeName: string, value: string): string | null {
  if (value === "unknown") return null;
  if (attributeName === "colorFamily") return neutralColors.has(value) ? "color-neutral-low" : accentColors.has(value) ? "color-accent" : null;
  if (attributeName === "saturation") return value === "low" ? "color-neutral-low" : value === "high" ? "color-high-saturation" : null;
  if (attributeName === "silhouette") {
    if (["straight", "cropped", "longline"].includes(value)) return "silhouette-clean";
    if (value === "fitted") return "silhouette-fitted";
    if (["oversized", "voluminous"].includes(value)) return "silhouette-volume";
    if (["a-line", "soft-draped"].includes(value)) return "silhouette-soft";
  }
  if (attributeName === "fit") {
    if (["tight", "fitted"].includes(value)) return "silhouette-fitted";
    if (["relaxed", "oversized"].includes(value)) return "silhouette-volume";
    if (value === "regular") return "silhouette-clean";
  }
  if (attributeName === "structure") {
    if (["soft", "low"].includes(value)) return "silhouette-soft";
    if (value === "medium") return "silhouette-structured-medium";
    if (value === "strong") return "silhouette-dramatic-structure";
  }
  if (attributeName === "volume") return value === "high" ? "silhouette-volume" : value === "low" ? "silhouette-clean" : null;
  if (attributeName === "curveEmphasis") return value === "high" ? "silhouette-fitted" : null;
  if (attributeName === "visualMaterial") {
    if (["knit-like", "wool-like", "leather-like", "denim-like"].includes(value)) return "material-textured";
    if (["silk-like", "sheer-like"].includes(value)) return "material-fluid";
    if (value === "technical-like") return "material-technical";
    if (value === "cotton-like") return "material-crisp";
  }
  if (attributeName === "ornament") return value === "plain" ? "ornament-reduced" : "ornament-crafted";
  if (attributeName === "layering") return value === "single" ? "styling-one-focus" : value === "light-layering" || value === "multi-layered" ? "styling-layered" : null;
  if (attributeName === "proportion") {
    if (value === "balanced") return "proportion-balanced";
    if (value === "short-over-long") return "proportion-short-long";
    if (["long-over-short", "vertical-elongation"].includes(value)) return "proportion-long";
  }
  if (attributeName === "stylingRelation") {
    if (["tonal", "single-focus", "repeated-color"].includes(value)) return "styling-one-focus";
    if (["high-contrast", "soft-hard-contrast"].includes(value)) return "styling-contrast";
    if (value === "mixed-texture") return "styling-layered";
  }
  return null;
}

function candidate(
  analysis: ImageAnalysisResultV1,
  observation: ImageAttributeObservationV1,
  attributeName: string,
  dimension: CandidateObservation["dimension"],
  garmentId: string | null,
): CandidateObservation {
  const value = observation.value;
  return {
    id: `candidate:${analysis.analysisId}:${observation.id}`,
    imageId: analysis.imageId,
    garmentId,
    attributeName,
    dimension,
    value,
    attributeKey: mapAttributeKey(attributeName, value),
    confidence: observation.confidence,
    regionIds: [...observation.regionIds],
    rationale: observation.rationale,
    reviewStatus: "pending",
    isUncertain: value === "unknown",
  };
}

export function buildCandidateObservations(analysis: ImageAnalysisResultV1): CandidateObservation[] {
  const observations: CandidateObservation[] = [];
  analysis.analysis.garments.forEach((garment) => {
    observations.push(candidate(analysis, garment.category, "category", "garmentCategory", garment.id));
    observations.push(candidate(analysis, garment.colorFamily, "colorFamily", "color", garment.id));
    observations.push(candidate(analysis, garment.saturation, "saturation", "color", garment.id));
    observations.push(candidate(analysis, garment.lightness, "lightness", "color", garment.id));
    observations.push(candidate(analysis, garment.temperature, "temperature", "color", garment.id));
    observations.push(candidate(analysis, garment.silhouette, "silhouette", "silhouette", garment.id));
    observations.push(candidate(analysis, garment.fit, "fit", "silhouette", garment.id));
    observations.push(candidate(analysis, garment.structure, "structure", "silhouette", garment.id));
    observations.push(candidate(analysis, garment.volume, "volume", "silhouette", garment.id));
    observations.push(candidate(analysis, garment.curveEmphasis, "curveEmphasis", "silhouette", garment.id));
    observations.push(candidate(analysis, garment.visualMaterial, "visualMaterial", "material", garment.id));
    garment.ornaments.forEach((item) => observations.push(candidate(analysis, item, "ornament", "ornament", garment.id)));
  });
  observations.push(candidate(analysis, analysis.analysis.outfit.layering, "layering", "stylingRelation", null));
  observations.push(candidate(analysis, analysis.analysis.outfit.proportion, "proportion", "proportion", null));
  observations.push(candidate(analysis, analysis.analysis.outfit.stylingRelation, "stylingRelation", "stylingRelation", null));
  return observations.sort((left, right) => left.id.localeCompare(right.id));
}

export function reviewCandidateObservation(
  observation: CandidateObservation,
  review: { status: ReviewStatus; editedValue?: string; editedAttributeKey?: string },
): CandidateObservation {
  if (review.status !== "modified") {
    return { ...observation, reviewStatus: review.status, editedValue: undefined, editedAttributeKey: undefined };
  }
  return {
    ...observation,
    reviewStatus: "modified",
    editedValue: review.editedValue,
    editedAttributeKey: review.editedAttributeKey,
    isUncertain: !review.editedAttributeKey,
  };
}

function intentDirection(intent: UserIntent, modified: boolean): EvidenceDirection | null {
  if (intent === "uninterested") return null;
  if (intent === "reject") return "negative";
  if (modified || intent === "borrow-element") return "conditional";
  if (intent === "admire-only") return "aspirational";
  return "positive";
}

export function candidateObservationsToEvidence(options: {
  observations: CandidateObservation[];
  intent: UserIntent;
  selectedCandidateIds?: string[];
  createdAt: string;
}): EvidenceRef[] {
  const selectedIds = new Set(options.selectedCandidateIds ?? []);
  return options.observations.flatMap((observation): EvidenceRef[] => {
    if (observation.reviewStatus === "pending" || observation.reviewStatus === "rejected" || observation.isUncertain) return [];
    if (options.intent === "borrow-element" && !selectedIds.has(observation.id)) return [];
    const attributeKey = observation.reviewStatus === "modified" ? observation.editedAttributeKey : observation.attributeKey;
    if (!attributeKey || observation.dimension === "garmentCategory") return [];
    const direction = intentDirection(options.intent, observation.reviewStatus === "modified");
    if (!direction) return [];
    return [{
      id: `image-review:${observation.id}:${observation.reviewStatus}:${attributeKey}`,
      source: "archive-confirmation",
      targetType: observation.regionIds.length ? "region" : "image",
      attributeKey,
      direction,
      intent: options.intent,
      weight: 1.1,
      relatedEntityId: observation.imageId,
      context: `用户复核图片观察；模型提取置信度 ${observation.confidence.toFixed(2)} 仅作溯源，不参与偏好权重。`,
      createdAt: options.createdAt,
      independenceKey: `image-analysis:${observation.imageId}`,
      userConfirmed: true,
    }];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

type UnknownRecord = Record<string, unknown>;

const aliases: Record<string, Record<string, string>> = {
  category: {
    coat: "outerwear", jacket: "outerwear", blazer: "outerwear", hoodie: "top", blouse: "top", "t-shirt": "top", tee: "top",
    pants: "trousers", jeans: "denim", shoe: "footwear", shoes: "footwear", sneaker: "footwear", sneakers: "footwear",
  },
  silhouette: { bodycon: "fitted", tailored: "straight", boxy: "straight", draped: "soft-draped", flared: "a-line" },
  ornament: { pattern: "print", printed: "print", buttons: "hardware", button: "hardware", zipper: "hardware", zip: "hardware", sequins: "hardware" },
};

const distinctMaterialCues: Record<string, RegExp> = {
  "denim-like": /denim|twill|indigo|斜纹|牛仔/i,
  "knit-like": /knit|rib|loop|针织|罗纹|编织/i,
  "leather-like": /grain|leather-like|皮革纹|皮面纹/i,
  "sheer-like": /sheer|transparent|see-through|透明|透视/i,
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeObservation(value: unknown, attribute: string, fallbackRegionId?: string): void {
  if (!isRecord(value)) return;
  if (typeof value.value === "string") value.value = aliases[attribute]?.[value.value.toLowerCase()] ?? value.value;
  value.reviewStatus = "pending";
  if (!Array.isArray(value.regionIds) || value.regionIds.length === 0) value.regionIds = fallbackRegionId ? [fallbackRegionId] : [];
}

function materialShouldRemainAsserted(observation: UnknownRecord): boolean {
  if (observation.value === "unknown") return true;
  const value = String(observation.value);
  const confidence = typeof observation.confidence === "number" ? observation.confidence : 0;
  const rationale = typeof observation.rationale === "string" ? observation.rationale : "";
  return confidence >= 0.92 && distinctMaterialCues[value]?.test(rationale) === true;
}

export function normalizeImageAnalysisModelOutput(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const normalized = structuredClone(raw) as UnknownRecord;
  const uncertain = Array.isArray(normalized.uncertainObservations) ? normalized.uncertainObservations as unknown[] : [];
  const garments = Array.isArray(normalized.garments) ? normalized.garments.slice(0, 8) : [];
  garments.forEach((item, garmentIndex) => {
    if (!isRecord(item)) return;
    const regionId = typeof item.regionId === "string" ? item.regionId : undefined;
    const scalarAttributes = ["category", "colorFamily", "saturation", "lightness", "temperature", "silhouette", "fit", "structure", "volume", "curveEmphasis"];
    scalarAttributes.forEach((attribute) => normalizeObservation(item[attribute], attribute, regionId));
    normalizeObservation(item.visualMaterial, "visualMaterial", regionId);
    if (isRecord(item.visualMaterial) && !materialShouldRemainAsserted(item.visualMaterial)) {
      item.visualMaterial.value = "unknown";
      item.visualMaterial.confidence = Math.min(typeof item.visualMaterial.confidence === "number" ? item.visualMaterial.confidence : 0.49, 0.49);
      item.visualMaterial.rationale = "图片不足以可靠区分视觉近似材质。";
      uncertain.push({
        id: `normalized-material-uncertain-${garmentIndex + 1}`,
        attribute: "visual-material",
        reason: "ambiguous",
        description: "表面细节不足，材质保持 unknown。",
        garmentId: typeof item.id === "string" ? item.id : null,
        regionIds: regionId ? [regionId] : [],
      });
    }
    if (!Array.isArray(item.ornaments)) item.ornaments = [];
    (item.ornaments as unknown[]).forEach((observation) => normalizeObservation(observation, "ornament", regionId));
  });
  normalized.garments = garments;
  if (isRecord(normalized.outfit)) {
    normalizeObservation(normalized.outfit.layering, "layering");
    normalizeObservation(normalized.outfit.proportion, "proportion");
    normalizeObservation(normalized.outfit.stylingRelation, "stylingRelation");
  }
  normalized.uncertainObservations = uncertain;
  return normalized;
}

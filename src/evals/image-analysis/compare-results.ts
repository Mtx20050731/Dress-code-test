import type { ImageAnalysisResultV1 } from "../../contracts/image-analysis-schema";
import type {
  EvaluationRunItem,
  FieldDifference,
  HumanGarmentAnnotation,
  ImageEvaluationDifference,
} from "./types";

const colorAliases: Record<string, string> = {
  charcoal: "gray",
  burgundy: "red",
  navy: "blue",
  cream: "beige",
  camel: "brown",
  olive: "green",
};

const issueAliases: Record<string, string> = {
  "heavily-occluded": "occluded",
  "partially-occluded": "occluded",
  "filter-color-shift": "poor-lighting",
  "special-lighting": "poor-lighting",
  "complex-background": "none",
  collage: "multiple-people",
};

const garmentFieldMap = {
  category: "category",
  primaryColorFamily: "colorFamily",
  saturation: "saturation",
  brightness: "lightness",
  temperature: "temperature",
  fit: "fit",
  structure: "structure",
  volume: "volume",
  materialApproximation: "visualMaterial",
} as const;

type ActualGarment = ImageAnalysisResultV1["analysis"]["garments"][number];

export function normalizeColorFamily(value: string): string {
  return colorAliases[value] ?? value;
}

export function compareScalar(expected: string | number | boolean | null, actual: string | number | boolean | null, comparable = true): FieldDifference["status"] {
  if (!comparable || expected === "unknown" || expected === null) return "not-comparable";
  return expected === actual ? "match" : "mismatch";
}

function uncertainFor(result: ImageAnalysisResultV1, garmentId: string | null, attribute: string): boolean {
  return result.analysis.uncertainObservations.some((item) => item.garmentId === garmentId && item.attribute === attribute);
}

function modelAttributeName(humanField: keyof typeof garmentFieldMap): string {
  return ({
    category: "garment-category",
    primaryColorFamily: "color-family",
    saturation: "saturation",
    brightness: "lightness",
    temperature: "temperature",
    fit: "fit",
    structure: "structure",
    volume: "volume",
    materialApproximation: "visual-material",
  } as const)[humanField];
}

function matchGarments(expected: HumanGarmentAnnotation[], actual: ActualGarment[]): Array<{ expected: HumanGarmentAnnotation; actual: ActualGarment | null }> {
  const unused = new Set(actual.map((_, index) => index));
  return expected.map((garment) => {
    let match = [...unused].find((index) => garment.category !== "unknown" && actual[index].category.value === garment.category);
    if (match === undefined) match = [...unused][0];
    if (match === undefined) return { expected: garment, actual: null };
    unused.delete(match);
    return { expected: garment, actual: actual[match] };
  });
}

function allRationales(result: ImageAnalysisResultV1): string {
  const garmentText = result.analysis.garments.flatMap((garment) => [
    garment.category, garment.colorFamily, garment.saturation, garment.lightness, garment.temperature,
    garment.silhouette, garment.fit, garment.structure, garment.volume, garment.curveEmphasis,
    garment.visualMaterial, ...garment.ornaments,
  ]).map((item) => item.rationale);
  return [...garmentText, result.analysis.outfit.layering.rationale, result.analysis.outfit.proportion.rationale, result.analysis.outfit.stylingRelation.rationale].join(" ").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsForbiddenInference(text: string, term: string): boolean {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) return false;

  let searchableText = text.toLowerCase();
  if (normalizedTerm === "preference") {
    searchableText = searchableText.replace(
      /\b(?:color|colour|temperature|warmth|coolness|visual)\s+preference\b/g,
      "",
    );
  }

  if (/^[a-z0-9-]+$/i.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, "i").test(searchableText);
  }

  return searchableText.includes(normalizedTerm);
}

export function compareEvaluationItem(item: EvaluationRunItem): ImageEvaluationDifference {
  const base: ImageEvaluationDifference = {
    imageId: item.imageId,
    datasetCategory: item.manifest.datasetCategory,
    status: item.status,
    schemaValid: item.schemaValid,
    fields: [],
    errorTags: item.errorType ? [item.errorType] : [],
    materialOverclaimCount: 0,
    invisibleAttributeGuessCount: 0,
    forbiddenInferenceCount: 0,
    unknownExpectedButAssertedCount: 0,
    lowConfidencePresentedAsCertainCount: 0,
    appropriateUnknownCount: 0,
    expectedUnknownCount: 0,
    unnecessaryUnknownCount: 0,
    expectedKnownCount: 0,
    uncertainObservationCountByAttribute: {},
    unreviewedPreferenceEvidenceCount: 0,
    latencyMs: item.latencyMs,
    retryCountByType: item.retryCountByType,
  };
  if (!item.result || !item.annotation) return base;

  const { result, annotation } = item;
  const addField = (field: FieldDifference) => {
    base.fields.push(field);
    if (field.status === "mismatch") base.errorTags.push(`${field.attribute}-mismatch`);
  };

  addField({ garmentId: null, attribute: "analyzable", expected: annotation.analyzable, actual: result.analysis.analyzable, status: compareScalar(annotation.analyzable, result.analysis.analyzable) });
  const expectedPeople = annotation.primarySubject.peopleCount;
  addField({ garmentId: null, attribute: "peopleCount", expected: expectedPeople, actual: result.analysis.peopleCount, status: compareScalar(expectedPeople, result.analysis.peopleCount, expectedPeople !== null) });
  const expectedPrimary = expectedPeople === null ? null : annotation.primarySubject.primarySubjectId !== null;
  const actualPrimary = result.analysis.primaryPersonId !== null;
  addField({ garmentId: null, attribute: "primarySubject", expected: expectedPrimary, actual: actualPrimary, status: compareScalar(expectedPrimary, actualPrimary, expectedPeople !== null) });

  annotation.imageIssues.filter((issue) => issue !== "none" && issueAliases[issue] !== "none").forEach((issue) => {
    const normalized = issueAliases[issue] ?? issue;
    const detected = result.analysis.qualityIssues.includes(normalized as typeof result.analysis.qualityIssues[number]);
    addField({ garmentId: null, attribute: "visibilityIssue", expected: issue, actual: detected ? normalized : null, status: detected ? "match" : "mismatch" });
  });

  const pairs = matchGarments(annotation.garments, result.analysis.garments);
  pairs.forEach(({ expected, actual }) => {
    (Object.keys(garmentFieldMap) as Array<keyof typeof garmentFieldMap>).forEach((humanField) => {
      const expectedValue = expected[humanField] as string;
      const actualObservation = actual?.[garmentFieldMap[humanField]];
      const actualValue = actualObservation?.value ?? null;
      const uncertain = expected.fieldsThatAreUncertain.includes(humanField);
      const normalizedExpected = humanField === "primaryColorFamily" ? normalizeColorFamily(expectedValue) : expectedValue;
      const normalizedActual = humanField === "primaryColorFamily" && typeof actualValue === "string" ? normalizeColorFamily(actualValue) : actualValue;
      const status = actual === null
        ? (expectedValue === "unknown" || uncertain ? "not-comparable" : "mismatch")
        : compareScalar(normalizedExpected, normalizedActual, !uncertain);
      addField({ garmentId: expected.id, attribute: humanField, expected: expectedValue, actual: actualValue, status, detail: normalizedExpected !== expectedValue ? `family=${normalizedExpected}` : undefined });

      const modelUncertain = actual ? uncertainFor(result, actual.id, modelAttributeName(humanField)) : false;
      if (expectedValue === "unknown" || uncertain) {
        base.expectedUnknownCount += 1;
        if (actualValue === "unknown" || modelUncertain) base.appropriateUnknownCount += 1;
        if (actualValue !== null && actualValue !== "unknown" && !modelUncertain) {
          base.unknownExpectedButAssertedCount += 1;
          base.errorTags.push(`unknown-${humanField}-asserted`);
        }
      } else {
        base.expectedKnownCount += 1;
        if (actualValue === "unknown") base.unnecessaryUnknownCount += 1;
      }
      if (humanField === "materialApproximation" && (expectedValue === "unknown" || uncertain) && actualValue !== null && actualValue !== "unknown" && !modelUncertain) {
        base.materialOverclaimCount += 1;
        base.errorTags.push("material-overclaim");
      }
      if (actualObservation && actualObservation.value !== "unknown" && actualObservation.confidence < 0.5 && !modelUncertain) {
        base.lowConfidencePresentedAsCertainCount += 1;
        base.errorTags.push(`low-confidence-${humanField}-asserted`);
      }
    });

    if (actual && (expected.visibility === "heavily-occluded" || expected.visibility === "out-of-frame")) {
      (["fit", "structure", "volume", "temperature", "materialApproximation"] as const).forEach((humanField) => {
        const observation = actual[garmentFieldMap[humanField]];
        if (observation.value !== "unknown" && !uncertainFor(result, actual.id, modelAttributeName(humanField))) {
          base.invisibleAttributeGuessCount += 1;
          base.errorTags.push(`invisible-${humanField}-guess`);
        }
      });
    }
  });

  result.analysis.uncertainObservations.forEach((item) => {
    base.uncertainObservationCountByAttribute[item.attribute] = (base.uncertainObservationCountByAttribute[item.attribute] ?? 0) + 1;
  });
  const rationaleText = allRationales(result);
  annotation.forbiddenInferences.forEach((term) => {
    if (containsForbiddenInference(rationaleText, term)) {
      base.forbiddenInferenceCount += 1;
      base.errorTags.push(`forbidden:${term}`);
    }
  });
  base.errorTags = [...new Set(base.errorTags)].sort();
  return base;
}

export function compareEvaluationRun(items: EvaluationRunItem[]): ImageEvaluationDifference[] {
  return items.map(compareEvaluationItem);
}

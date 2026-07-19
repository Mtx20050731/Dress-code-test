import {
  IMAGE_ANALYSIS_SCHEMA_VERSION,
  ImageAnalysisResultV1Schema,
  type ImageAnalysisResultV1,
} from "../../contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "../../contracts/real-data";
import { IMAGE_ANALYSIS_PROMPT_VERSION } from "../../features/image-analysis/prompts/image-analysis-prompt-v1";
import type { ImageAnalysisProvider } from "./image-analysis-provider";

function observation<TValue extends string>(id: string, value: TValue, regionId: string, rationale: string) {
  return { id, value, confidence: 0.72, regionIds: [regionId], rationale, reviewStatus: "pending" as const };
}

export class MockImageAnalysisProvider implements ImageAnalysisProvider {
  private readonly cache = new Map<string, Promise<ImageAnalysisResultV1>>();

  analyze(input: ImageAnalysisInput): Promise<ImageAnalysisResultV1> {
    const existing = this.cache.get(input.imageId);
    if (existing) return existing;
    const promise = Promise.resolve(this.createResult(input));
    this.cache.set(input.imageId, promise);
    return promise;
  }

  clear(imageId?: string): void {
    if (imageId) this.cache.delete(imageId);
    else this.cache.clear();
  }

  getDiagnostics() {
    return { retryCountByType: {} };
  }

  private createResult(input: ImageAnalysisInput): ImageAnalysisResultV1 {
    const fullRegionId = `${input.imageId}-region-full`;
    const personId = `${input.imageId}-person-1`;
    const garmentId = `${input.imageId}-garment-1`;
    const hasPerson = input.expectedContent === "full-outfit";
    const hasGarment = input.expectedContent !== "unknown";
    const analyzable = input.expectedContent !== "unknown";
    const commonRationale = "确定性 Mock 视觉观察，仅用于开发流程验证。";

    return ImageAnalysisResultV1Schema.parse({
      schemaVersion: IMAGE_ANALYSIS_SCHEMA_VERSION,
      analysisId: `mock-analysis-${input.imageId}`,
      imageId: input.imageId,
      analysis: {
        status: analyzable ? "completed" : "needs-review",
        analyzable,
        qualityIssues: analyzable ? ["none"] : ["unsupported-content"],
        regions: [{ id: fullRegionId, x: 0, y: 0, width: 1, height: 1 }],
        peopleCount: hasPerson ? 1 : 0,
        people: hasPerson ? [{ id: personId, regionId: fullRegionId, confidence: 0.9, isPrimary: true }] : [],
        primaryPersonId: hasPerson ? personId : null,
        garments: hasGarment ? [{
          id: garmentId,
          personId: hasPerson ? personId : null,
          regionId: fullRegionId,
          category: observation(`${garmentId}-category`, "top", fullRegionId, commonRationale),
          colorFamily: observation(`${garmentId}-color-family`, "gray", fullRegionId, commonRationale),
          saturation: observation(`${garmentId}-saturation`, "low", fullRegionId, commonRationale),
          lightness: observation(`${garmentId}-lightness`, "medium", fullRegionId, commonRationale),
          temperature: observation(`${garmentId}-temperature`, "neutral", fullRegionId, commonRationale),
          silhouette: observation(`${garmentId}-silhouette`, "straight", fullRegionId, commonRationale),
          fit: observation(`${garmentId}-fit`, "regular", fullRegionId, commonRationale),
          structure: observation(`${garmentId}-structure`, "medium", fullRegionId, commonRationale),
          volume: observation(`${garmentId}-volume`, "medium", fullRegionId, commonRationale),
          curveEmphasis: observation(`${garmentId}-curve`, "low", fullRegionId, commonRationale),
          visualMaterial: observation(`${garmentId}-material`, "cotton-like", fullRegionId, commonRationale),
          ornaments: [observation(`${garmentId}-ornament`, "plain", fullRegionId, commonRationale)],
        }] : [],
        outfit: {
          layering: observation(`${input.imageId}-layering`, hasPerson ? "light-layering" : "unknown", fullRegionId, commonRationale),
          proportion: observation(`${input.imageId}-proportion`, hasPerson ? "balanced" : "unknown", fullRegionId, commonRationale),
          stylingRelation: observation(`${input.imageId}-relation`, hasPerson ? "single-focus" : "unknown", fullRegionId, commonRationale),
        },
        uncertainObservations: analyzable ? [] : [{
          id: `${input.imageId}-uncertain-content`,
          attribute: "analyzability",
          reason: "unsupported-content",
          description: "输入未说明预期内容，Mock 将其保留为待复核。",
          garmentId: null,
          regionIds: [fullRegionId],
        }],
      },
      providerMetadata: {
        provider: "mock",
        model: "deterministic-image-fixture",
        modelVersion: "1",
        promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION,
        responseId: `mock-response-${input.imageId}`,
        latencyMs: 0,
        repairAttempted: false,
        usage: { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null },
      },
    });
  }
}

export const mockImageAnalysisProvider: ImageAnalysisProvider = new MockImageAnalysisProvider();

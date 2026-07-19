import type { ImageAnalysisResultV1 } from "../../contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "../../contracts/real-data";

export interface ImageAnalysisProvider {
  analyze(input: ImageAnalysisInput): Promise<ImageAnalysisResultV1>;
  clear?(imageId?: string): void;
  getDiagnostics?(imageId: string): { retryCountByType: Record<string, number> } | undefined;
}

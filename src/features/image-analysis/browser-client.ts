import type { ImageAnalysisInput } from "@/contracts/real-data";
import type { ArchiveImageAnalysis, ImageAnalysisCandidate } from "@/types/style";

type AnalysisApiResponse = {
  ok: boolean;
  result?: {
    schemaVersion: string;
    analysis: { status: "completed" | "partial" | "needs-review" };
    providerMetadata: {
      provider: "openai" | "qwen" | "mock";
      model: string;
      promptVersion: string;
      latencyMs: number;
    };
  };
  candidateObservations?: ImageAnalysisCandidate[];
  providerSelection?: {
    requestedProvider: "openai" | "qwen" | "mock";
    effectiveProvider: "openai" | "qwen" | "mock";
    fallbackReason: "missing-api-key" | "missing-model" | null;
  };
  error?: { code: string; message: string; retryable: boolean };
};

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function analyzeImageInBrowser(options: {
  imageId: string;
  blob: Blob;
  sourceType: ImageAnalysisInput["sourceType"];
  expectedContent: ImageAnalysisInput["expectedContent"];
  useMock?: boolean;
  force?: boolean;
}): Promise<ArchiveImageAnalysis> {
  const imageUrl = await blobToDataUrl(options.blob);
  const requestedProvider = options.useMock ? "mock" : "qwen";
  const response = await fetch("/api/image-analysis", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `${options.imageId}:${requestedProvider}`,
    },
    body: JSON.stringify({
      input: {
        imageId: options.imageId,
        imageUrl,
        sourceType: options.sourceType,
        expectedContent: options.expectedContent,
      },
      useMock: options.useMock === true,
      force: options.force === true,
    }),
  });
  const payload = await response.json() as AnalysisApiResponse;
  const selection = payload.providerSelection;
  if (!payload.ok || !payload.result) {
    const error = payload.error ?? { code: "analysis-failed", message: "图片分析暂时失败，请稍后重试。", retryable: true };
    return {
      imageId: options.imageId,
      status: "failed",
      requestedProvider,
      effectiveProvider: selection?.effectiveProvider,
      fallbackReason: selection?.fallbackReason,
      candidates: [],
      error,
      analyzedAt: new Date().toISOString(),
    };
  }
  return {
    imageId: options.imageId,
    status: payload.result.analysis.status,
    requestedProvider,
    effectiveProvider: selection?.effectiveProvider ?? payload.result.providerMetadata.provider,
    fallbackReason: selection?.fallbackReason,
    schemaVersion: payload.result.schemaVersion,
    model: payload.result.providerMetadata.model,
    promptVersion: payload.result.providerMetadata.promptVersion,
    latencyMs: payload.result.providerMetadata.latencyMs,
    candidates: (payload.candidateObservations ?? []).map((candidate) => ({ ...candidate, reviewStatus: "pending" as const })),
    analyzedAt: new Date().toISOString(),
  };
}

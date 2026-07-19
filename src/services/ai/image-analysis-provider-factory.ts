import type { ImageAnalysisProvider } from "./image-analysis-provider";
import { MockImageAnalysisProvider } from "./mock-image-analysis-provider";
import { OpenAIImageAnalysisProvider } from "./openai-image-analysis-provider";
import { QwenImageAnalysisProvider } from "./qwen-image-analysis-provider";

export type ImageAnalysisProviderName = "openai" | "qwen" | "mock";

export type ProviderSelection = {
  provider: ImageAnalysisProvider;
  requestedProvider: ImageAnalysisProviderName;
  effectiveProvider: ImageAnalysisProviderName;
  fallbackReason: "missing-api-key" | "missing-model" | null;
};

export type ProviderFactoryOptions = {
  requestedProvider?: ImageAnalysisProviderName;
  env?: Record<string, string | undefined>;
  mockProvider?: ImageAnalysisProvider;
  createOpenAIProvider?: (options: {
    apiKey: string;
    model: string;
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
  }) => ImageAnalysisProvider;
  createQwenProvider?: (options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
  }) => ImageAnalysisProvider;
};

function optionalNonNegativeNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function createImageAnalysisProvider(options: ProviderFactoryOptions = {}): ProviderSelection {
  const env = options.env ?? process.env;
  const configured = env.IMAGE_ANALYSIS_PROVIDER === "openai"
    ? "openai"
    : env.IMAGE_ANALYSIS_PROVIDER === "qwen" ? "qwen" : "mock";
  const requestedProvider = options.requestedProvider ?? configured;
  const mockProvider = options.mockProvider ?? new MockImageAnalysisProvider();

  if (requestedProvider === "mock") {
    return { provider: mockProvider, requestedProvider, effectiveProvider: "mock", fallbackReason: null };
  }
  const apiKey = requestedProvider === "qwen" ? env.DASHSCOPE_API_KEY : env.OPENAI_API_KEY;
  const model = requestedProvider === "qwen" ? env.QWEN_VISION_MODEL : env.OPENAI_VISION_MODEL;
  if (!apiKey) {
    return { provider: mockProvider, requestedProvider, effectiveProvider: "mock", fallbackReason: "missing-api-key" };
  }
  if (!model) {
    return { provider: mockProvider, requestedProvider, effectiveProvider: "mock", fallbackReason: "missing-model" };
  }

  const providerOptions = {
    apiKey,
    model,
    inputCostPerMillion: optionalNonNegativeNumber(requestedProvider === "qwen" ? env.QWEN_VISION_INPUT_COST_PER_1M : env.OPENAI_VISION_INPUT_COST_PER_1M),
    outputCostPerMillion: optionalNonNegativeNumber(requestedProvider === "qwen" ? env.QWEN_VISION_OUTPUT_COST_PER_1M : env.OPENAI_VISION_OUTPUT_COST_PER_1M),
  };
  if (requestedProvider === "qwen") {
    const qwenOptions = { ...providerOptions, baseUrl: env.QWEN_BASE_URL };
    const provider = options.createQwenProvider
      ? options.createQwenProvider(qwenOptions)
      : new QwenImageAnalysisProvider(qwenOptions);
    return { provider, requestedProvider, effectiveProvider: "qwen", fallbackReason: null };
  }
  const provider = options.createOpenAIProvider
    ? options.createOpenAIProvider(providerOptions)
    : new OpenAIImageAnalysisProvider(providerOptions);
  return { provider, requestedProvider, effectiveProvider: "openai", fallbackReason: null };
}

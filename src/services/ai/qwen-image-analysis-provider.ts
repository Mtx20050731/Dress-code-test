import {
  IMAGE_ANALYSIS_MODEL_JSON_SCHEMA,
  IMAGE_ANALYSIS_SCHEMA_VERSION,
  ImageAnalysisModelOutputV1Schema,
  ImageAnalysisResultV1Schema,
  type ImageAnalysisResultV1,
} from "../../contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "../../contracts/real-data";
import {
  IMAGE_ANALYSIS_PROMPT_VERSION_V2,
  IMAGE_ANALYSIS_SYSTEM_PROMPT_V2,
  buildImageAnalysisUserPromptV2,
} from "../../features/image-analysis/prompts/image-analysis-prompt-v2";
import { normalizeImageAnalysisModelOutput } from "../../features/image-analysis/model-output-normalizer";
import { ImageAnalysisError, normalizeImageAnalysisError } from "./image-analysis-error";
import type { ImageAnalysisProvider } from "./image-analysis-provider";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

type QwenResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type QwenErrorResponse = {
  error?: {
    code?: string;
    type?: string;
  };
};

export type SanitizedQwenAnalysisLog = {
  analysisId: string;
  imageId: string;
  provider: "qwen";
  model: string;
  promptVersion: string;
  status: string;
  latencyMs: number;
  errorType?: string;
};

export type QwenImageAnalysisProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
  maxTransientRetries?: number;
  sleep?: Sleep;
  now?: () => number;
  logger?: (entry: SanitizedQwenAnalysisLog) => void;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
};

function stableKey(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

function schemaIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractStructuredText(response: QwenResponse): string {
  const choice = response.choices?.[0];
  if (choice?.finish_reason === "content_filter") throw new ImageAnalysisError("refusal", false);
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content.map((item) => item.text ?? "").join("").trim();
    if (text) return text;
  }
  throw new ImageAnalysisError("empty-result", false);
}

function httpError(status: number, providerCode?: string): ImageAnalysisError {
  if (providerCode === "Arrearage" || providerCode === "InsufficientBalance") {
    return new ImageAnalysisError("billing", false, { status });
  }
  if (status === 401) return new ImageAnalysisError("authentication", false, { status });
  if (status === 403) return new ImageAnalysisError("permission", false, { status });
  if (status === 413) return new ImageAnalysisError("image-too-large", false, { status });
  if (status === 415) return new ImageAnalysisError("unsupported-format", false, { status });
  if (status === 429) return new ImageAnalysisError("rate-limit", true, { status });
  if ([500, 502, 503, 504].includes(status)) return new ImageAnalysisError("server-error", true, { status });
  if (status === 400 || status === 422) return new ImageAnalysisError("invalid-image", false, { status });
  return new ImageAnalysisError("unknown", false, { status });
}

export class QwenImageAnalysisProvider implements ImageAnalysisProvider {
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxTransientRetries: number;
  private readonly sleep: Sleep;
  private readonly now: () => number;
  private readonly endpoint: string;
  private readonly cache = new Map<string, Promise<ImageAnalysisResultV1>>();
  private readonly diagnostics = new Map<string, { retryCountByType: Record<string, number> }>();

  constructor(private readonly options: QwenImageAnalysisProviderOptions) {
    if (!options.apiKey) throw new ImageAnalysisError("missing-api-key", false);
    if (!options.model) throw new ImageAnalysisError("missing-model", false);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxTransientRetries = options.maxTransientRetries ?? 2;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
    this.endpoint = `${normalizeBaseUrl(options.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1")}/chat/completions`;
  }

  analyze(input: ImageAnalysisInput): Promise<ImageAnalysisResultV1> {
    const key = `${input.imageId}|${stableKey(input.imageUrl)}|${input.sourceType}|${input.expectedContent}`;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const promise = this.analyzeUncached(input).catch((error) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, promise);
    return promise;
  }

  clear(imageId?: string): void {
    if (!imageId) {
      this.cache.clear();
      this.diagnostics.clear();
      return;
    }
    for (const key of this.cache.keys()) if (key.startsWith(`${imageId}|`)) this.cache.delete(key);
    this.diagnostics.delete(imageId);
  }

  getDiagnostics(imageId: string) {
    return this.diagnostics.get(imageId);
  }

  private async analyzeUncached(input: ImageAnalysisInput): Promise<ImageAnalysisResultV1> {
    const startedAt = this.now();
    const analysisId = `analysis-${input.imageId}-${stableKey(`${input.imageUrl}|${input.expectedContent}`)}`;
    let repairAttempted = false;
    const retryCountByType: Record<string, number> = {};
    try {
      let response = await this.requestWithRetry(input, [], retryCountByType);
      let parsed = this.parseModelOutput(response);
      if (!parsed.success) {
        repairAttempted = true;
        response = await this.requestWithRetry(input, schemaIssues(parsed.error), retryCountByType);
        parsed = this.parseModelOutput(response);
      }
      if (!parsed.success) throw new ImageAnalysisError("schema-validation", false, { details: schemaIssues(parsed.error) });

      const latencyMs = Math.max(0, this.now() - startedAt);
      const inputTokens = response.usage?.prompt_tokens ?? null;
      const outputTokens = response.usage?.completion_tokens ?? null;
      const estimatedCostUsd = inputTokens !== null
        && outputTokens !== null
        && this.options.inputCostPerMillion !== undefined
        && this.options.outputCostPerMillion !== undefined
        ? ((inputTokens * this.options.inputCostPerMillion) + (outputTokens * this.options.outputCostPerMillion)) / 1_000_000
        : null;
      const result = {
        schemaVersion: IMAGE_ANALYSIS_SCHEMA_VERSION,
        analysisId,
        imageId: input.imageId,
        analysis: parsed.data,
        providerMetadata: {
          provider: "qwen" as const,
          model: this.options.model,
          modelVersion: response.model ?? this.options.model,
          promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION_V2,
          responseId: response.id ?? `qwen-response-${stableKey(analysisId)}`,
          latencyMs,
          repairAttempted,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: response.usage?.total_tokens ?? null,
            estimatedCostUsd,
          },
        },
      };
      const validated = ImageAnalysisResultV1Schema.safeParse(result);
      if (!validated.success) throw new ImageAnalysisError("schema-validation", false, { details: schemaIssues(validated.error) });
      this.diagnostics.set(input.imageId, { retryCountByType: { ...retryCountByType } });
      this.log({ analysisId, imageId: input.imageId, provider: "qwen", model: this.options.model, promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION_V2, status: validated.data.analysis.status, latencyMs });
      return validated.data;
    } catch (error) {
      const normalized = normalizeImageAnalysisError(error);
      this.diagnostics.set(input.imageId, { retryCountByType: { ...retryCountByType } });
      const latencyMs = Math.max(0, this.now() - startedAt);
      this.log({ analysisId, imageId: input.imageId, provider: "qwen", model: this.options.model, promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION_V2, status: "failed", latencyMs, errorType: normalized.code });
      throw normalized;
    }
  }

  private parseModelOutput(response: QwenResponse) {
    try {
      const text = extractStructuredText(response).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
      return ImageAnalysisModelOutputV1Schema.safeParse(normalizeImageAnalysisModelOutput(JSON.parse(json)));
    } catch (error) {
      if (error instanceof ImageAnalysisError) throw error;
      return ImageAnalysisModelOutputV1Schema.safeParse({ invalidJson: true });
    }
  }

  private async requestWithRetry(input: ImageAnalysisInput, repairIssues: string[], retryCountByType: Record<string, number>): Promise<QwenResponse> {
    let attempt = 0;
    while (true) {
      try {
        return await this.requestOnce(input, repairIssues);
      } catch (error) {
        const normalized = normalizeImageAnalysisError(error);
        if (!normalized.retryable || attempt >= this.maxTransientRetries) throw normalized;
        retryCountByType[normalized.code] = (retryCountByType[normalized.code] ?? 0) + 1;
        await this.sleep(500 * (2 ** attempt));
        attempt += 1;
      }
    }
  }

  private async requestOnce(input: ImageAnalysisInput, repairIssues: string[]): Promise<QwenResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const schemaPrompt = `\nReturn JSON only. It must validate against this JSON Schema:\n${JSON.stringify(IMAGE_ANALYSIS_MODEL_JSON_SCHEMA)}`;
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: `${IMAGE_ANALYSIS_SYSTEM_PROMPT_V2}\nOutput valid JSON only.` },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: input.imageUrl } },
                { type: "text", text: `${buildImageAnalysisUserPromptV2(input, repairIssues)}${schemaPrompt}` },
              ],
            },
          ],
          response_format: { type: "json_object" },
          enable_thinking: false,
          temperature: 0,
          max_tokens: 7_000,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as QwenErrorResponse;
        throw httpError(response.status, errorBody.error?.code ?? errorBody.error?.type);
      }
      const body = await response.json() as QwenResponse;
      if (!body || typeof body !== "object") throw new ImageAnalysisError("empty-result", false);
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  private log(entry: SanitizedQwenAnalysisLog): void {
    if (this.options.logger) this.options.logger(entry);
  }
}

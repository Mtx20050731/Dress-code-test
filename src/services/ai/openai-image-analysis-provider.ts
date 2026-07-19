import {
  IMAGE_ANALYSIS_MODEL_JSON_SCHEMA,
  IMAGE_ANALYSIS_SCHEMA_VERSION,
  ImageAnalysisModelOutputV1Schema,
  ImageAnalysisResultV1Schema,
  type ImageAnalysisResultV1,
} from "../../contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "../../contracts/real-data";
import {
  IMAGE_ANALYSIS_PROMPT_VERSION,
  IMAGE_ANALYSIS_SYSTEM_PROMPT_V1,
  buildImageAnalysisUserPromptV1,
} from "../../features/image-analysis/prompts/image-analysis-prompt-v1";
import { ImageAnalysisError, normalizeImageAnalysisError } from "./image-analysis-error";
import type { ImageAnalysisProvider } from "./image-analysis-provider";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

type OpenAIResponse = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

export type SanitizedAnalysisLog = {
  analysisId: string;
  imageId: string;
  provider: "openai";
  model: string;
  promptVersion: string;
  status: string;
  latencyMs: number;
  errorType?: string;
};

export type OpenAIImageAnalysisProviderOptions = {
  apiKey: string;
  model: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
  maxTransientRetries?: number;
  sleep?: Sleep;
  now?: () => number;
  logger?: (entry: SanitizedAnalysisLog) => void;
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

function extractStructuredText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "refusal") throw new ImageAnalysisError("refusal", false);
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  throw new ImageAnalysisError("empty-result", false);
}

function httpError(status: number): ImageAnalysisError {
  if (status === 401) return new ImageAnalysisError("authentication", false, { status });
  if (status === 403) return new ImageAnalysisError("permission", false, { status });
  if (status === 413) return new ImageAnalysisError("image-too-large", false, { status });
  if (status === 415) return new ImageAnalysisError("unsupported-format", false, { status });
  if (status === 429) return new ImageAnalysisError("rate-limit", true, { status });
  if ([500, 502, 503, 504].includes(status)) return new ImageAnalysisError("server-error", true, { status });
  if (status === 400 || status === 422) return new ImageAnalysisError("invalid-image", false, { status });
  return new ImageAnalysisError("unknown", false, { status });
}

export class OpenAIImageAnalysisProvider implements ImageAnalysisProvider {
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxTransientRetries: number;
  private readonly sleep: Sleep;
  private readonly now: () => number;
  private readonly cache = new Map<string, Promise<ImageAnalysisResultV1>>();
  private readonly diagnostics = new Map<string, { retryCountByType: Record<string, number> }>();

  constructor(private readonly options: OpenAIImageAnalysisProviderOptions) {
    if (!options.apiKey) throw new ImageAnalysisError("missing-api-key", false);
    if (!options.model) throw new ImageAnalysisError("missing-model", false);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 25_000;
    this.maxTransientRetries = options.maxTransientRetries ?? 2;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
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
      let response = await this.requestWithRetry(input, analysisId, [], retryCountByType);
      let parsed = this.parseModelOutput(response);
      if (!parsed.success) {
        repairAttempted = true;
        response = await this.requestWithRetry(input, analysisId, schemaIssues(parsed.error), retryCountByType);
        parsed = this.parseModelOutput(response);
      }
      if (!parsed.success) {
        throw new ImageAnalysisError("schema-validation", false, { details: schemaIssues(parsed.error) });
      }

      const latencyMs = Math.max(0, this.now() - startedAt);
      const inputTokens = response.usage?.input_tokens ?? null;
      const outputTokens = response.usage?.output_tokens ?? null;
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
          provider: "openai" as const,
          model: this.options.model,
          modelVersion: response.model ?? this.options.model,
          promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION,
          responseId: response.id ?? `response-${stableKey(analysisId)}`,
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
      this.log({ analysisId, imageId: input.imageId, provider: "openai", model: this.options.model, promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION, status: validated.data.analysis.status, latencyMs });
      return validated.data;
    } catch (error) {
      const normalized = normalizeImageAnalysisError(error);
      this.diagnostics.set(input.imageId, { retryCountByType: { ...retryCountByType } });
      const latencyMs = Math.max(0, this.now() - startedAt);
      this.log({ analysisId, imageId: input.imageId, provider: "openai", model: this.options.model, promptVersion: IMAGE_ANALYSIS_PROMPT_VERSION, status: "failed", latencyMs, errorType: normalized.code });
      throw normalized;
    }
  }

  private parseModelOutput(response: OpenAIResponse) {
    try {
      const text = extractStructuredText(response);
      return ImageAnalysisModelOutputV1Schema.safeParse(JSON.parse(text));
    } catch (error) {
      if (error instanceof ImageAnalysisError) throw error;
      return ImageAnalysisModelOutputV1Schema.safeParse({ invalidJson: true });
    }
  }

  private async requestWithRetry(input: ImageAnalysisInput, analysisId: string, repairIssues: string[], retryCountByType: Record<string, number>): Promise<OpenAIResponse> {
    let attempt = 0;
    while (true) {
      try {
        return await this.requestOnce(input, analysisId, repairIssues);
      } catch (error) {
        const normalized = normalizeImageAnalysisError(error);
        if (!normalized.retryable || attempt >= this.maxTransientRetries) throw normalized;
        retryCountByType[normalized.code] = (retryCountByType[normalized.code] ?? 0) + 1;
        await this.sleep(250 * (2 ** attempt));
        attempt += 1;
      }
    }
  }

  private async requestOnce(input: ImageAnalysisInput, analysisId: string, repairIssues: string[]): Promise<OpenAIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const { $schema: _schemaMarker, ...strictSchema } = IMAGE_ANALYSIS_MODEL_JSON_SCHEMA as Record<string, unknown>;
    void _schemaMarker;
    try {
      const response = await this.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": `${analysisId}:${repairIssues.length ? "repair" : "initial"}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.options.model,
          store: false,
          max_output_tokens: 6_000,
          input: [
            { role: "system", content: IMAGE_ANALYSIS_SYSTEM_PROMPT_V1 },
            {
              role: "user",
              content: [
                { type: "input_text", text: buildImageAnalysisUserPromptV1(input, repairIssues) },
                { type: "input_image", image_url: input.imageUrl, detail: "high" },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "image_analysis_result_v1",
              strict: true,
              schema: strictSchema,
            },
          },
        }),
      });
      if (!response.ok) throw httpError(response.status);
      const body = await response.json() as OpenAIResponse;
      if (!body || typeof body !== "object") throw new ImageAnalysisError("empty-result", false);
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  private log(entry: SanitizedAnalysisLog): void {
    if (this.options.logger) this.options.logger(entry);
  }
}

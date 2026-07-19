import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { IMAGE_ANALYSIS_SCHEMA_VERSION, ImageAnalysisResultV1Schema } from "../../contracts/image-analysis-schema";
import { IMAGE_ANALYSIS_PROMPT_VERSION } from "../../features/image-analysis/prompts/image-analysis-prompt-v1";
import { normalizeImageAnalysisError } from "../../services/ai/image-analysis-error";
import type { ImageAnalysisProvider } from "../../services/ai/image-analysis-provider";
import { createImageAnalysisProvider, type ImageAnalysisProviderName } from "../../services/ai/image-analysis-provider-factory";
import { validateAnnotationDataset } from "./annotation-validator";
import { imageAnalysisEvalDataset } from "./dataset";
import { loadLocalEnv } from "./load-local-env";
import type { EvaluationManifestEntry, EvaluationRun, EvaluationRunItem } from "./types";

type EvaluationExecutionOptions = {
  dataset: EvaluationManifestEntry[];
  provider: ImageAnalysisProvider;
  requestedProvider: ImageAnalysisProviderName;
  effectiveProvider: ImageAnalysisProviderName;
  model: string;
  promptVersion: string;
  fallbackReason: string | null;
  concurrency: number;
  force: boolean;
  previousRun?: EvaluationRun | null;
  readFixture: (entry: EvaluationManifestEntry) => Promise<string | null>;
  onItem?: (item: EvaluationRunItem) => void | Promise<void>;
  now?: () => Date;
};

function schemaIssueMessages(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`);
}

function canResume(previous: EvaluationRun | null | undefined, options: EvaluationExecutionOptions): boolean {
  return Boolean(previous
    && previous.effectiveProvider === options.effectiveProvider
    && previous.model === options.model
    && previous.promptVersion === options.promptVersion
    && previous.schemaVersion === IMAGE_ANALYSIS_SCHEMA_VERSION);
}

export async function executeEvaluation(options: EvaluationExecutionOptions): Promise<EvaluationRun> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const previousItems = canResume(options.previousRun, options)
    ? new Map(options.previousRun!.items.filter((item) => item.status === "completed" && item.schemaValid).map((item) => [item.imageId, item]))
    : new Map<string, EvaluationRunItem>();
  const items = new Array<EvaluationRunItem>(options.dataset.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= options.dataset.length) return;
      const entry = options.dataset[index];
      const { annotation: _annotation, ...manifest } = entry;
      void _annotation;
      const resumed = !options.force ? previousItems.get(entry.imageId) : undefined;
      if (resumed) {
        const item = { ...resumed, manifest, annotation: entry.annotation, resumed: true };
        items[index] = item;
        await options.onItem?.(item);
        continue;
      }
      if (!entry.annotation) {
        const item: EvaluationRunItem = { imageId: entry.imageId, manifest, annotation: null, status: "skipped", schemaValid: false, schemaIssues: [], errorType: "annotation-not-ready", latencyMs: null, retryCountByType: {}, resumed: false, completedAt: null };
        items[index] = item;
        await options.onItem?.(item);
        continue;
      }
      const imageUrl = await options.readFixture(entry);
      if (!imageUrl) {
        const item: EvaluationRunItem = { imageId: entry.imageId, manifest, annotation: entry.annotation, status: "skipped", schemaValid: false, schemaIssues: [], errorType: "missing-image", latencyMs: null, retryCountByType: {}, resumed: false, completedAt: null };
        items[index] = item;
        await options.onItem?.(item);
        continue;
      }
      const requestStarted = Date.now();
      try {
        const result = await options.provider.analyze({ imageId: entry.imageId, imageUrl, sourceType: "user-archive", expectedContent: entry.expectedContent });
        const parsed = ImageAnalysisResultV1Schema.safeParse(result);
        const promptMatches = parsed.success && parsed.data.providerMetadata.promptVersion === options.promptVersion;
        const item: EvaluationRunItem = parsed.success && promptMatches
          ? { imageId: entry.imageId, manifest, annotation: entry.annotation, status: "completed", schemaValid: true, schemaIssues: [], result: parsed.data, latencyMs: parsed.data.providerMetadata.latencyMs, retryCountByType: options.provider.getDiagnostics?.(entry.imageId)?.retryCountByType ?? {}, resumed: false, completedAt: now().toISOString() }
          : { imageId: entry.imageId, manifest, annotation: entry.annotation, status: "failed", schemaValid: false, schemaIssues: parsed.success ? ["providerMetadata.promptVersion 与请求版本不一致"] : schemaIssueMessages(parsed.error), errorType: parsed.success ? "prompt-version-mismatch" : "schema-validation", latencyMs: Date.now() - requestStarted, retryCountByType: options.provider.getDiagnostics?.(entry.imageId)?.retryCountByType ?? {}, resumed: false, completedAt: now().toISOString() };
        items[index] = item;
        await options.onItem?.(item);
      } catch (error) {
        const normalized = normalizeImageAnalysisError(error);
        const item: EvaluationRunItem = { imageId: entry.imageId, manifest, annotation: entry.annotation, status: "failed", schemaValid: false, schemaIssues: normalized.details ?? [], errorType: normalized.code, latencyMs: Date.now() - requestStarted, retryCountByType: options.provider.getDiagnostics?.(entry.imageId)?.retryCountByType ?? {}, resumed: false, completedAt: now().toISOString() };
        items[index] = item;
        await options.onItem?.(item);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, options.dataset.length || 1)) }, worker));
  const completedAt = now().toISOString();
  return {
    runVersion: "image-analysis-eval-run-v2",
    runId: `eval-${startedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    requestedProvider: options.requestedProvider,
    effectiveProvider: options.effectiveProvider,
    model: options.model,
    promptVersion: options.promptVersion,
    schemaVersion: IMAGE_ANALYSIS_SCHEMA_VERSION,
    fallbackReason: options.fallbackReason,
    startedAt,
    completedAt,
    force: options.force,
    concurrency: options.concurrency,
    items,
  };
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function mimeType(path: string) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function readPrevious(path: string): EvaluationRun | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")) as EvaluationRun; } catch { return null; }
}

export async function runEvaluationCli() {
  loadLocalEnv();
  const providerArgument = argument("provider");
  const requestedProvider = (providerArgument === "mock" ? "mock" : providerArgument === "openai" ? "openai" : "qwen") satisfies ImageAnalysisProviderName;
  const promptVersion = argument("promptVersion") ?? IMAGE_ANALYSIS_PROMPT_VERSION;
  const modelOverride = argument("model");
  const force = process.argv.includes("--force");
  const concurrency = Math.max(1, Math.min(5, Number(argument("concurrency") ?? "2") || 2));
  const requestedLimit = Number(argument("limit"));
  const dataset = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? imageAnalysisEvalDataset.slice(0, requestedLimit)
    : imageAnalysisEvalDataset;
  if (promptVersion !== IMAGE_ANALYSIS_PROMPT_VERSION) throw new Error(`当前代码只包含 ${IMAGE_ANALYSIS_PROMPT_VERSION}，不能运行 ${promptVersion}`);
  const annotationErrors = validateAnnotationDataset().filter((issue) => issue.severity === "error");
  if (annotationErrors.length) throw new Error(`人工标注存在 ${annotationErrors.length} 个错误，请先运行 eval:validate-annotations`);
  const env = {
    ...process.env,
    IMAGE_ANALYSIS_PROVIDER: requestedProvider,
    OPENAI_VISION_MODEL: requestedProvider === "openai" ? modelOverride ?? process.env.OPENAI_VISION_MODEL : process.env.OPENAI_VISION_MODEL,
    QWEN_VISION_MODEL: requestedProvider === "qwen" ? modelOverride ?? process.env.QWEN_VISION_MODEL : process.env.QWEN_VISION_MODEL,
  };
  const selection = createImageAnalysisProvider({ requestedProvider, env });
  if (requestedProvider !== "mock" && selection.effectiveProvider !== requestedProvider) {
    const keyName = requestedProvider === "qwen" ? "DASHSCOPE_API_KEY" : "OPENAI_API_KEY";
    const modelName = requestedProvider === "qwen" ? "QWEN_VISION_MODEL" : "OPENAI_VISION_MODEL";
    throw new Error(`真实评估未运行：${selection.fallbackReason === "missing-api-key" ? `缺少 ${keyName}` : `缺少 ${modelName}`}。不会用 Mock 冒充真实评估。`);
  }
  const reportsDirectory = resolve(process.cwd(), "src/evals/image-analysis/reports");
  const resultsDirectory = resolve(reportsDirectory, "results");
  mkdirSync(resultsDirectory, { recursive: true });
  const latestRunPath = resolve(reportsDirectory, "latest-run.json");
  const previousRun = readPrevious(latestRunPath);
  const model = modelOverride
    ?? (requestedProvider === "qwen" ? process.env.QWEN_VISION_MODEL : requestedProvider === "openai" ? process.env.OPENAI_VISION_MODEL : undefined)
    ?? "mock-image-analysis-v1";
  const run = await executeEvaluation({
    dataset,
    provider: selection.provider,
    requestedProvider,
    effectiveProvider: selection.effectiveProvider,
    model,
    promptVersion,
    fallbackReason: selection.fallbackReason,
    concurrency,
    force,
    previousRun,
    readFixture: async (entry) => {
      const path = resolve(process.cwd(), entry.fixturePath);
      return existsSync(path) ? `data:${mimeType(path)};base64,${readFileSync(path).toString("base64")}` : null;
    },
    onItem: (item) => {
      writeFileSync(resolve(resultsDirectory, `${item.imageId}.json`), JSON.stringify(item, null, 2));
      process.stdout.write(`${item.imageId}: ${item.resumed ? "resumed" : item.status}${item.errorType ? ` (${item.errorType})` : ""}\n`);
    },
  });
  writeFileSync(latestRunPath, JSON.stringify(run, null, 2));
  process.stdout.write(`评估运行结束：${run.items.filter((item) => item.status === "completed").length} 完成，${run.items.filter((item) => item.status === "failed").length} 失败，${run.items.filter((item) => item.status === "skipped").length} 未准备。\n`);
  return run;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/run-eval.js")) {
  void runEvaluationCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "评估运行失败"}\n`);
    process.exitCode = 1;
  });
}

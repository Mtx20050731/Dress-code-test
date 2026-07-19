import { NextResponse } from "next/server";
import {
  ImageAnalysisInputSchema,
  safeParseImageAnalysisForInput,
} from "@/contracts/image-analysis-schema";
import { buildCandidateObservations } from "@/features/image-analysis/candidate-observations";
import { isDevImageAnalysisEnabled } from "@/features/image-analysis/dev-access";
import { normalizeImageAnalysisError } from "@/services/ai/image-analysis-error";
import {
  createImageAnalysisProvider,
  type ImageAnalysisProviderName,
} from "@/services/ai/image-analysis-provider-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedDataUrl = /^data:image\/(jpeg|png|webp);base64,/i;
const requests = new Map<string, Promise<unknown>>();

function estimateDataUrlBytes(value: string): number {
  const comma = value.indexOf(",");
  if (comma < 0) return Number.POSITIVE_INFINITY;
  return Math.floor((value.length - comma - 1) * 0.75);
}

function unavailable() {
  return new NextResponse(null, { status: 404 });
}

export async function POST(request: Request) {
  if (!isDevImageAnalysisEnabled(process.env.NODE_ENV)) return unavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid-image", message: "请求内容无法读取。", retryable: false } }, { status: 400 });
  }
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const parsedInput = ImageAnalysisInputSchema.safeParse(record.input);
  if (!parsedInput.success) {
    return NextResponse.json({ ok: false, error: { code: "invalid-image", message: "图片分析输入不符合契约。", retryable: false }, validation: parsedInput.error.issues }, { status: 400 });
  }
  if (!allowedDataUrl.test(parsedInput.data.imageUrl)) {
    return NextResponse.json({ ok: false, error: { code: "unsupported-format", message: "开发入口只接受 JPEG、PNG 或 WebP。", retryable: false } }, { status: 415 });
  }
  if (estimateDataUrlBytes(parsedInput.data.imageUrl) > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: { code: "image-too-large", message: "图片超过 8 MB，请压缩后重试。", retryable: false } }, { status: 413 });
  }

  const requestedProvider: ImageAnalysisProviderName = record.requestedProvider === "openai"
    ? "openai"
    : record.requestedProvider === "qwen" ? "qwen" : "mock";
  const idempotencyHeader = request.headers.get("idempotency-key") ?? parsedInput.data.imageId;
  const requestKey = `${requestedProvider}|${parsedInput.data.imageId}|${idempotencyHeader}`;
  if (record.force === true) requests.delete(requestKey);
  const existing = requests.get(requestKey);
  if (existing) return NextResponse.json(await existing);

  const task = (async () => {
    const selection = createImageAnalysisProvider({ requestedProvider });
    try {
      if (record.force === true) selection.provider.clear?.(parsedInput.data.imageId);
      const result = await selection.provider.analyze(parsedInput.data);
      const validated = safeParseImageAnalysisForInput(result, parsedInput.data);
      if (!validated.success) {
        return {
          ok: false,
          error: { code: "schema-validation", message: "模型返回格式未通过严格校验，没有写入用户数据。", retryable: false },
          validation: validated.error.issues,
          providerSelection: {
            requestedProvider: selection.requestedProvider,
            effectiveProvider: selection.effectiveProvider,
            fallbackReason: selection.fallbackReason,
          },
        };
      }
      return {
        ok: true,
        result: validated.data,
        schemaValidation: { success: true, schemaVersion: validated.data.schemaVersion },
        candidateObservations: buildCandidateObservations(validated.data),
        providerSelection: {
          requestedProvider: selection.requestedProvider,
          effectiveProvider: selection.effectiveProvider,
          fallbackReason: selection.fallbackReason,
        },
      };
    } catch (error) {
      const normalized = normalizeImageAnalysisError(error);
      return {
        ok: false,
        error: normalized.toPublicJSON(),
        providerSelection: {
          requestedProvider: selection.requestedProvider,
          effectiveProvider: selection.effectiveProvider,
          fallbackReason: selection.fallbackReason,
        },
      };
    }
  })();
  requests.set(requestKey, task);
  const result = await task;
  if (typeof result === "object" && result !== null && (result as { ok?: boolean }).ok === false) requests.delete(requestKey);
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  if (!isDevImageAnalysisEnabled(process.env.NODE_ENV)) return unavailable();
  const imageId = new URL(request.url).searchParams.get("imageId");
  if (imageId) {
    for (const key of requests.keys()) if (key.includes(`|${imageId}|`)) requests.delete(key);
  } else {
    requests.clear();
  }
  return NextResponse.json({ ok: true, deleted: imageId ?? "all" });
}

import { NextResponse } from "next/server";
import { ImageAnalysisInputSchema, safeParseImageAnalysisForInput } from "@/contracts/image-analysis-schema";
import { buildCandidateObservations } from "@/features/image-analysis/candidate-observations";
import { normalizeImageAnalysisError } from "@/services/ai/image-analysis-error";
import { createImageAnalysisProvider } from "@/services/ai/image-analysis-provider-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedDataUrl = /^data:image\/(jpeg|png|webp);base64,/i;
const requests = new Map<string, Promise<unknown>>();

function estimateDataUrlBytes(value: string): number {
  const comma = value.indexOf(",");
  return comma < 0 ? Number.POSITIVE_INFINITY : Math.floor((value.length - comma - 1) * 0.75);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid-image", message: "图片请求无法读取。", retryable: false } }, { status: 400 });
  }
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const parsedInput = ImageAnalysisInputSchema.safeParse(record.input);
  if (!parsedInput.success) {
    return NextResponse.json({ ok: false, error: { code: "invalid-image", message: "图片信息不完整，请重新选择图片。", retryable: false } }, { status: 400 });
  }
  if (!allowedDataUrl.test(parsedInput.data.imageUrl)) {
    return NextResponse.json({ ok: false, error: { code: "unsupported-format", message: "目前只支持 JPEG、PNG 或 WebP 图片。", retryable: false } }, { status: 415 });
  }
  if (estimateDataUrlBytes(parsedInput.data.imageUrl) > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: { code: "image-too-large", message: "图片超过 8 MB，请压缩后重试。", retryable: false } }, { status: 413 });
  }

  const requestedProvider = record.useMock === true ? "mock" as const : undefined;
  const requestKey = `${requestedProvider ?? "configured"}|${parsedInput.data.imageId}|${request.headers.get("idempotency-key") ?? parsedInput.data.imageId}`;
  if (record.force === true) requests.delete(requestKey);
  const existing = requests.get(requestKey);
  if (existing) return NextResponse.json(await existing);

  const task = (async () => {
    const selection = createImageAnalysisProvider({ requestedProvider });
    const providerSelection = {
      requestedProvider: selection.requestedProvider,
      effectiveProvider: selection.effectiveProvider,
      fallbackReason: selection.fallbackReason,
    };
    try {
      if (record.force === true) selection.provider.clear?.(parsedInput.data.imageId);
      const providerInput = selection.effectiveProvider === "mock" && parsedInput.data.expectedContent === "unknown"
        ? { ...parsedInput.data, expectedContent: "full-outfit" as const }
        : parsedInput.data;
      const result = await selection.provider.analyze(providerInput);
      const validated = safeParseImageAnalysisForInput(result, providerInput);
      if (!validated.success) {
        return { ok: false, error: { code: "schema-validation", message: "分析结果格式不完整，未写入你的收藏。", retryable: false }, providerSelection };
      }
      return {
        ok: true,
        result: validated.data,
        candidateObservations: buildCandidateObservations(validated.data),
        providerSelection,
      };
    } catch (error) {
      return { ok: false, error: normalizeImageAnalysisError(error).toPublicJSON(), providerSelection };
    }
  })();
  requests.set(requestKey, task);
  const result = await task;
  if (typeof result === "object" && result !== null && (result as { ok?: boolean }).ok === false) requests.delete(requestKey);
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const imageId = new URL(request.url).searchParams.get("imageId");
  if (imageId) for (const key of requests.keys()) if (key.includes(`|${imageId}|`)) requests.delete(key);
  else requests.clear();
  return NextResponse.json({ ok: true });
}

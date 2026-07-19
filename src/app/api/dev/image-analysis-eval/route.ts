import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { NextResponse } from "next/server";
import { ImageAnalysisResultV1Schema } from "@/contracts/image-analysis-schema";
import { isDevImageAnalysisEnabled } from "@/features/image-analysis/dev-access";
import { normalizeImageAnalysisError } from "@/services/ai/image-analysis-error";
import { createImageAnalysisProvider, type ImageAnalysisProviderName } from "@/services/ai/image-analysis-provider-factory";
import { compareEvaluationItem } from "@/evals/image-analysis/compare-results";
import { imageAnalysisEvalDataset } from "@/evals/image-analysis/dataset";
import type { EvaluationRunItem } from "@/evals/image-analysis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() { return new NextResponse(null, { status: 404 }); }
function mimeType(path: string) { const extension = extname(path).toLowerCase(); return extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg"; }
const fixtureRoot = resolve(process.cwd(), "src", "evals", "image-analysis", "fixtures");

export async function GET(request: Request) {
  if (!isDevImageAnalysisEnabled(process.env.NODE_ENV)) return unavailable();
  const imageId = new URL(request.url).searchParams.get("imageId");
  const entry = imageAnalysisEvalDataset.find((item) => item.imageId === imageId);
  if (!entry) return unavailable();
  const path = resolve(fixtureRoot, entry.filename);
  if (!existsSync(path)) return unavailable();
  return new NextResponse(readFileSync(path), { headers: { "content-type": mimeType(path), "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!isDevImageAnalysisEnabled(process.env.NODE_ENV)) return unavailable();
  const body = await request.json().catch(() => null) as { imageId?: string; provider?: ImageAnalysisProviderName } | null;
  const entry = imageAnalysisEvalDataset.find((item) => item.imageId === body?.imageId);
  if (!entry) return NextResponse.json({ ok: false, error: "评估图片不存在" }, { status: 404 });
  if (!entry.annotation) return NextResponse.json({ ok: false, error: "该图片尚未完成人工标注" }, { status: 409 });
  const path = resolve(fixtureRoot, entry.filename);
  if (!existsSync(path)) return NextResponse.json({ ok: false, error: "评估图片文件尚未放入 fixtures" }, { status: 404 });
  const requestedProvider: ImageAnalysisProviderName = body?.provider === "mock"
    ? "mock"
    : body?.provider === "openai" ? "openai" : "qwen";
  const selection = createImageAnalysisProvider({ requestedProvider });
  if (requestedProvider !== "mock" && selection.effectiveProvider !== requestedProvider) return NextResponse.json({ ok: false, error: `真实Provider不可用：${selection.fallbackReason}` }, { status: 503 });
  const imageUrl = `data:${mimeType(path)};base64,${readFileSync(path).toString("base64")}`;
  const started = Date.now();
  try {
    selection.provider.clear?.(entry.imageId);
    const result = await selection.provider.analyze({ imageId: entry.imageId, imageUrl, sourceType: "user-archive", expectedContent: entry.expectedContent });
    const parsed = ImageAnalysisResultV1Schema.safeParse(result);
    const { annotation: _annotation, ...manifest } = entry;
    void _annotation;
    const item: EvaluationRunItem = { imageId: entry.imageId, manifest, annotation: entry.annotation, status: parsed.success ? "completed" : "failed", schemaValid: parsed.success, schemaIssues: parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), result: parsed.success ? parsed.data : undefined, errorType: parsed.success ? undefined : "schema-validation", latencyMs: parsed.success ? parsed.data.providerMetadata.latencyMs : Date.now() - started, retryCountByType: selection.provider.getDiagnostics?.(entry.imageId)?.retryCountByType ?? {}, resumed: false, completedAt: new Date().toISOString() };
    return NextResponse.json({ ok: parsed.success, item, difference: compareEvaluationItem(item), providerSelection: { requestedProvider, effectiveProvider: selection.effectiveProvider } });
  } catch (error) {
    const normalized = normalizeImageAnalysisError(error);
    return NextResponse.json({ ok: false, error: normalized.toPublicJSON() }, { status: normalized.retryable ? 503 : 400 });
  }
}

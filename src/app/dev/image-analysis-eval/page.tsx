import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { notFound } from "next/navigation";
import { DevImageAnalysisEvalExperience } from "@/components/exploration/dev-image-analysis-eval-experience";
import { isDevImageAnalysisEnabled } from "@/features/image-analysis/dev-access";
import { imageAnalysisEvalDataset } from "@/evals/image-analysis/dataset";
import type { EvaluationRun } from "@/evals/image-analysis/types";
import { generateEvaluationReport } from "@/evals/image-analysis/generate-report";

export const dynamic = "force-dynamic";

export default function ImageAnalysisEvalPage() {
  if (!isDevImageAnalysisEnabled(process.env.NODE_ENV)) notFound();
  const runPath = resolve(process.cwd(), "src/evals/image-analysis/reports/latest-run.json");
  const run = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8")) as EvaluationRun : null;
  const report = run ? generateEvaluationReport(run) : null;
  const fixtureRoot = resolve(process.cwd(), "src", "evals", "image-analysis", "fixtures");
  const entries = imageAnalysisEvalDataset.map((entry) => ({ imageId: entry.imageId, filename: entry.filename, datasetCategory: entry.datasetCategory, annotation: entry.annotation, imageAvailable: existsSync(resolve(fixtureRoot, entry.filename)), item: run?.items.find((item) => item.imageId === entry.imageId) ?? null, difference: report?.differences.find((item) => item.imageId === entry.imageId) ?? null }));
  return <DevImageAnalysisEvalExperience report={report} entries={entries} />;
}

import { humanAnnotations } from "./annotations";
import type { DatasetCategory, EvaluationManifestEntry } from "./types";

const composition: Array<{ category: DatasetCategory; count: number; expectedContent: EvaluationManifestEntry["expectedContent"] }> = [
  { category: "clear-single-person", count: 8, expectedContent: "full-outfit" },
  { category: "single-garment-product", count: 4, expectedContent: "unknown" },
  { category: "street-complex-background", count: 5, expectedContent: "full-outfit" },
  { category: "dark-low-light", count: 4, expectedContent: "full-outfit" },
  { category: "occluded-cropped", count: 4, expectedContent: "full-outfit" },
  { category: "multiple-people", count: 4, expectedContent: "full-outfit" },
  { category: "complex-layering", count: 4, expectedContent: "full-outfit" },
  { category: "filtered-special-light", count: 3, expectedContent: "full-outfit" },
  { category: "difficult-material", count: 4, expectedContent: "full-outfit" },
];

let sequence = 0;
export const imageAnalysisEvalDataset: EvaluationManifestEntry[] = composition.flatMap(({ category, count, expectedContent }) =>
  Array.from({ length: count }, () => {
    sequence += 1;
    const number = String(sequence).padStart(2, "0");
    const imageId = `fashion-eval-${number}`;
    const filename = `${number}.png`;
    return {
      imageId,
      filename,
      fixturePath: `src/evals/image-analysis/fixtures/${filename}`,
      datasetCategory: category,
      expectedContent,
      annotation: humanAnnotations[imageId] ?? null,
    };
  }),
);

export const expectedDatasetComposition = Object.fromEntries(composition.map((item) => [item.category, item.count])) as Record<DatasetCategory, number>;

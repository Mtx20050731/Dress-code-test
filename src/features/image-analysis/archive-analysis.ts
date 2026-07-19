import { attributeTokens, dimensionLabels } from "../../data/style-exploration-mock";
import type { ArchiveCluster, ArchiveImageAnalysis, ArchiveObservation, AttributeDimension } from "../../types/style";

const dimensions: AttributeDimension[] = ["color", "silhouette", "material", "proportion", "ornament", "stylingRelation", "accessory", "mood"];

export function buildArchiveReviewModel(analyses: ArchiveImageAnalysis[]): {
  clusters: ArchiveCluster[];
  observations: ArchiveObservation[];
} {
  const eligible = analyses.flatMap((analysis) => analysis.candidates
    .filter((candidate) => !candidate.isUncertain && candidate.attributeKey && candidate.dimension !== "garmentCategory")
    .map((candidate) => ({ analysis, candidate })));
  const byAttribute = new Map<string, typeof eligible>();
  eligible.forEach((item) => {
    const key = item.candidate.attributeKey!;
    byAttribute.set(key, [...(byAttribute.get(key) ?? []), item]);
  });

  const observations = [...byAttribute.entries()].map(([attributeKey, entries]) => {
    const token = attributeTokens.find((item) => item.id === attributeKey);
    const dimension = token?.dimension ?? entries[0].candidate.dimension as AttributeDimension;
    const imageIds = [...new Set(entries.map((item) => item.candidate.imageId))].sort();
    const source = entries.some((item) => item.analysis.effectiveProvider === "mock") ? "mock" as const : "ai" as const;
    return {
      id: `analysis-observation:${attributeKey}`,
      dimension,
      title: `${token?.label ?? attributeKey}在收藏中出现`,
      description: `系统在 ${imageIds.length} 张图片中看到了与“${token?.label ?? attributeKey}”相关的可见线索。这只是图片观察，确认前不会成为你的偏好。`,
      attributeIds: [attributeKey],
      imageIds,
      verdict: "pending" as const,
      source,
      candidateIds: entries.map((item) => item.candidate.id).sort(),
    };
  }).sort((left, right) => right.imageIds.length - left.imageIds.length || left.id.localeCompare(right.id));

  const clusters = dimensions.flatMap((dimension): ArchiveCluster[] => {
    const matching = observations.filter((item) => item.dimension === dimension);
    if (!matching.length) return [];
    return [{
      id: `analysis-cluster:${dimension}`,
      title: `${dimensionLabels[dimension]}线索`,
      imageIds: [...new Set(matching.flatMap((item) => item.imageIds))].sort(),
      attributeIds: matching.flatMap((item) => item.attributeIds),
    }];
  });
  return { clusters, observations };
}

export function replaceAnalysisRecord(records: ArchiveImageAnalysis[], next: ArchiveImageAnalysis): ArchiveImageAnalysis[] {
  return [...records.filter((item) => item.imageId !== next.imageId), next]
    .sort((left, right) => left.imageId.localeCompare(right.imageId));
}

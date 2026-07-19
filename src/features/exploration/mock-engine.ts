import { attributeTokens, mockStyleDirections, trendThemes } from "../../data/style-exploration-mock";
import type {
  ArchiveCorrectionImpact,
  ArchiveDecodeState,
  ArchiveObservation,
  AttributeDimension,
  ConfidenceLevel,
  ConfidenceResult,
  ContinuousToolRecord,
  CuriosityStatement,
  EvidenceContradiction,
  EvidenceGroup,
  EvidenceRef,
  ExplorationQuestion,
  LabEditEvent,
  StyleLabState,
  StyleDirection,
  StyleSession,
  StyleStatementCorrection,
  StyleSystemOutput,
  StyleTension,
  SwapOption,
  TasteStatement,
  TrendLook,
  UserIntent,
  VisualResponse,
  VisualSamplingState,
  WearingIntent,
} from "../../types/style";

type ConfidencePurpose = "core" | "aspirational" | "boundary" | "curiosity";
type TasteStatementGroups = Pick<StyleSystemOutput, "coreTaste" | "aspirationalTaste" | "wearabilityBoundary" | "currentCuriosity">;

const tokenById = new Map(attributeTokens.map((token) => [token.id, token]));
const positiveAdaptiveIntents = new Set<UserIntent>(["want-to-wear", "borrow-element", "admire-only"]);

const evidenceStage = (source: EvidenceRef["source"]) => {
  if (source === "visual-sampling") return "visual-sampling";
  if (source === "archive-image" || source === "archive-confirmation") return "archive-decode";
  if (source === "style-lab") return "style-lab";
  if (source === "result-feedback") return "style-system";
  return "outfit-check-in";
};

const independenceKey = (evidence: EvidenceRef) => evidence.independenceKey ?? `${evidence.source}:${evidence.relatedEntityId}`;
const uniqueCount = (evidence: EvidenceRef[]) => new Set(evidence.map(independenceKey)).size;
const uniqueWeight = (evidence: EvidenceRef[]) => {
  const weights = new Map<string, number>();
  evidence.forEach((item) => weights.set(independenceKey(item), Math.max(weights.get(independenceKey(item)) ?? 0, item.weight)));
  return [...weights.values()].reduce((total, weight) => total + weight, 0);
};
const uniqueSources = (evidence: EvidenceRef[]) => new Set(evidence.map((item) => item.source)).size;
const uniqueStages = (evidence: EvidenceRef[]) => new Set(evidence.map((item) => evidenceStage(item.source))).size;
const byCreatedAt = (left: EvidenceRef, right: EvidenceRef) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);

function visualAttributeKey(response: VisualResponse, attributeKey: string) {
  if (response.themeId === "quiet-structure" && attributeKey === "silhouette-clean") {
    return response.intensity === "experimental" ? "silhouette-dramatic-structure" : "silhouette-structured-medium";
  }
  if (response.themeId === "retro-color" && attributeKey === "color-accent") {
    return response.intensity === "experimental" ? "color-high-saturation" : "color-accent";
  }
  return attributeKey;
}

function visualDirection(intent: UserIntent): EvidenceRef["direction"] {
  if (intent === "want-to-wear") return "positive";
  if (intent === "admire-only") return "aspirational";
  if (intent === "borrow-element") return "conditional";
  if (intent === "reject") return "negative";
  return "neutral";
}

function visualWeight(intent: UserIntent) {
  if (intent === "want-to-wear" || intent === "reject") return 1;
  if (intent === "borrow-element") return 0.8;
  if (intent === "admire-only") return 0.65;
  return 0.15;
}

export function collectVisualEvidence(state: VisualSamplingState): EvidenceRef[] {
  const lookMap = new Map(trendThemes.flatMap((theme) => theme.looks).map((look) => [look.id, look]));
  const responseEvidence = state.responses.flatMap((response) => {
    const look = lookMap.get(response.lookId);
    return response.attributeIds.map((rawAttributeKey, index) => {
      const attributeKey = visualAttributeKey(response, rawAttributeKey);
      return {
        id: `visual:${response.lookId}:${attributeKey}:${index}`,
        source: "visual-sampling" as const,
        targetType: "outfit" as const,
        attributeKey,
        direction: visualDirection(response.reaction),
        intent: response.reaction,
        weight: visualWeight(response.reaction),
        relatedEntityId: response.lookId,
        context: `${response.intensity}；${response.reaction}${response.borrowedElements.length ? `；只借用 ${response.borrowedElements.join(" / ")}` : ""}`,
        createdAt: response.createdAt,
        imageSrc: look?.imageSrc,
        independenceKey: `visual:${response.lookId}`,
      } satisfies EvidenceRef;
    });
  });
  const rejectedClues = state.rejectedClueAttributeKeys.map((attributeKey, index) => ({
    id: `visual:rejected-clue:${attributeKey}:${index}`,
    source: "visual-sampling" as const,
    targetType: "attribute" as const,
    attributeKey,
    direction: "neutral" as const,
    intent: "uninterested" as const,
    weight: 0,
    relatedEntityId: `rejected-clue-${attributeKey}`,
    context: "用户主动否认了系统提出的稳定线索",
    createdAt: state.responses.at(-1)?.createdAt ?? "1970-01-01T00:00:00.000Z",
    independenceKey: `visual:rejected-clue:${attributeKey}`,
    userConfirmed: true,
  }));
  return [...responseEvidence, ...rejectedClues].sort((left, right) => left.id.localeCompare(right.id));
}

export function collectArchiveEvidence(state: ArchiveDecodeState): EvidenceRef[] {
  const imageEvidence = state.images.flatMap((image) => {
    // A model-detected whole-image attribute is never a preference by itself.
    // Archive evidence is created only from explicit region marks or reviewed observations.
    const regions = image.focusMarks.flatMap((mark) => {
      const selectedKeys = mark.attributeKeys.length
        ? mark.attributeKeys
        : image.attributeIds.filter((attributeKey) => mark.element !== "item" && tokenById.get(attributeKey)?.dimension === mark.element);
      return selectedKeys.map((attributeKey, index) => ({
        id: `archive-region:${mark.id}:${attributeKey}:${index}`,
        source: "archive-image" as const,
        targetType: "region" as const,
        attributeKey,
        direction: "conditional" as const,
        intent: "borrow-element" as const,
        weight: 0.85,
        relatedEntityId: image.id,
        context: `用户只标记了图片中的${mark.element}${mark.note ? `：${mark.note}` : ""}`,
        createdAt: image.createdAt,
        imageSrc: image.previewSrc,
        independenceKey: `archive-image:${image.id}`,
      } satisfies EvidenceRef));
    });
    return regions;
  });

  const observationEvidence = state.observations.flatMap<EvidenceRef>((observation) => {
    if (observation.verdict === "pending") return [];
    const attributeKeys = observation.verdict === "modified"
      ? observation.editedAttributeIds ?? []
      : observation.attributeIds;
    if (observation.verdict === "denied") {
      return observation.attributeIds.map((attributeKey, index) => ({
        id: `archive-observation:${observation.id}:denied:${attributeKey}:${index}`,
        source: "archive-confirmation" as const,
        targetType: "observation" as const,
        attributeKey,
        direction: "neutral" as const,
        intent: "uninterested" as const,
        weight: 0,
        relatedEntityId: observation.id,
        context: `用户否认：${observation.title}`,
        createdAt: observation.reviewedAt ?? "1970-01-01T00:00:00.000Z",
        independenceKey: `archive-observation:${observation.id}`,
        userConfirmed: true,
        observationVerdict: "denied" as const,
      } satisfies EvidenceRef));
    }
    const relatedImages = observation.imageIds
      .map((imageId) => state.images.find((image) => image.id === imageId))
      .filter(Boolean) as ArchiveDecodeState["images"];
    const sources = relatedImages.length ? relatedImages : [null];
    return attributeKeys.flatMap((attributeKey, attributeIndex) => sources.map((image, imageIndex) => {
      const confirmedMapping = image?.intent === "want-to-wear"
        ? { direction: "positive" as const, intent: "want-to-wear" as const }
        : image?.intent === "borrow-element"
          ? { direction: "conditional" as const, intent: "borrow-element" as const }
          : image
            ? { direction: "aspirational" as const, intent: "admire-only" as const }
            : { direction: "positive" as const, intent: "borrow-element" as const };
      const mapping = observation.verdict === "modified"
        ? { direction: "conditional" as const, intent: "borrow-element" as const }
        : confirmedMapping;
      return {
        id: `archive-observation:${observation.id}:${observation.verdict}:${attributeKey}:${attributeIndex}:${imageIndex}`,
        source: "archive-confirmation" as const,
        targetType: image ? "image" as const : "observation" as const,
        attributeKey,
        direction: mapping.direction,
        intent: mapping.intent,
        weight: 1.1,
        relatedEntityId: image?.id ?? observation.id,
        context: observation.verdict === "confirmed" ? `用户确认：${observation.title}` : `用户修改为：${observation.editedTitle ?? "条件性偏好"}`,
        createdAt: observation.reviewedAt ?? "1970-01-01T00:00:00.000Z",
        imageSrc: image?.previewSrc,
        independenceKey: image ? `archive-image:${image.id}` : `archive-observation:${observation.id}`,
        userConfirmed: true,
        observationVerdict: observation.verdict,
      } satisfies EvidenceRef;
    }));
  });
  return [...imageEvidence, ...observationEvidence].sort((left, right) => left.id.localeCompare(right.id));
}

function wearingIntentDirection(intent: WearingIntent): { direction: EvidenceRef["direction"]; userIntent: UserIntent; weight: number } | null {
  if (intent === "want-to-wear") return { direction: "positive", userIntent: "want-to-wear", weight: 1 };
  if (intent === "reject") return { direction: "negative", userIntent: "reject", weight: 1 };
  if (intent === "hesitant") return { direction: "conditional", userIntent: "uninterested", weight: 0.65 };
  return null;
}

export function collectLabEvidence(state: StyleLabState): EvidenceRef[] {
  const intentEvidence = state.wearingIntentEvents.flatMap((event) => {
    const mapping = wearingIntentDirection(event.to);
    if (!mapping) return [];
    const transition = state.boundaryTransitions.find((item) => item.variantId === event.variantId);
    const attributeKeys = mapping.direction === "negative" && transition ? [transition.fromAttributeKey] : event.attributeKeys;
    return [...new Set(attributeKeys)].map((attributeKey, index) => ({
      id: `lab-intent:${event.id}:${attributeKey}:${index}`,
      source: "style-lab" as const,
      targetType: "outfit" as const,
      attributeKey,
      direction: mapping.direction,
      intent: mapping.userIntent,
      weight: mapping.weight,
      relatedEntityId: event.variantId,
      context: `${event.from} → ${event.to}`,
      createdAt: event.createdAt,
      independenceKey: `style-lab:${event.variantId}`,
    } satisfies EvidenceRef));
  });
  const transitionEvidence = state.boundaryTransitions.flatMap((transition, index) => [
    {
      id: `lab-transition:${transition.id}:from:${index}`,
      source: "style-lab" as const,
      targetType: "attribute" as const,
      attributeKey: transition.fromAttributeKey,
      direction: "conditional" as const,
      intent: "reject" as const,
      weight: 1.1,
      relatedEntityId: transition.variantId,
      context: `boundary-transition:${transition.limitingFactor}；${transition.interpretation}`,
      createdAt: state.editEvents.find((event) => `lab-${event.id}` === transition.evidenceId)?.createdAt ?? "1970-01-01T00:00:00.000Z",
      independenceKey: `style-lab-transition:${transition.id}`,
      userConfirmed: true,
    },
    {
      id: `lab-transition:${transition.id}:to:${index}`,
      source: "style-lab" as const,
      targetType: "attribute" as const,
      attributeKey: transition.toAttributeKey,
      direction: "conditional" as const,
      intent: "want-to-wear" as const,
      weight: 1.2,
      relatedEntityId: transition.variantId,
      context: `boundary-transition:${transition.limitingFactor}；替换后愿意穿`,
      createdAt: state.editEvents.find((event) => `lab-${event.id}` === transition.evidenceId)?.createdAt ?? "1970-01-01T00:00:00.000Z",
      independenceKey: `style-lab-transition:${transition.id}`,
      userConfirmed: true,
    },
  ] satisfies EvidenceRef[]);
  return [...intentEvidence, ...transitionEvidence].sort((left, right) => left.id.localeCompare(right.id));
}

export function collectContinuousEvidence(records: ContinuousToolRecord[]): EvidenceRef[] {
  return records.flatMap((record) => record.attributeKeys.map((attributeKey, index) => ({
    id: `continuous:${record.id}:${attributeKey}:${index}`,
    source: "outfit-check-in" as const,
    targetType: record.imageId ? "image" as const : "attribute" as const,
    attributeKey,
    direction: visualDirection(record.intent),
    intent: record.intent,
    weight: record.intent === "want-to-wear" || record.intent === "reject" ? 1.2 : record.intent === "borrow-element" ? 0.9 : 0.65,
    relatedEntityId: record.id,
    context: `${record.tool}：${record.subject}${record.note ? `；${record.note}` : ""}`,
    createdAt: record.createdAt,
    imageSrc: record.imageSrc,
    independenceKey: `continuous:${record.id}`,
    userConfirmed: true,
  } satisfies EvidenceRef))).sort((left, right) => left.id.localeCompare(right.id));
}

export function collectResultCorrectionEvidence(corrections: StyleStatementCorrection[]): EvidenceRef[] {
  return corrections.flatMap((correction) => {
    const removed = correction.originalAttributeIds.map((attributeKey, index) => ({
      id: `result-feedback:${correction.id}:removed:${attributeKey}:${index}`,
      source: "result-feedback" as const,
      targetType: "observation" as const,
      attributeKey,
      direction: "neutral" as const,
      intent: "uninterested" as const,
      weight: 0,
      relatedEntityId: correction.statementId,
      context: correction.verdict === "denied" ? "用户否认了这条结果判断" : "用户修改了这条结果判断，原判断不再生效",
      createdAt: correction.createdAt,
      independenceKey: `result-feedback:${correction.id}`,
      userConfirmed: true,
      observationVerdict: "denied" as const,
    } satisfies EvidenceRef));
    const replacements = correction.verdict === "modified" ? correction.replacementAttributeIds.map((attributeKey, index) => ({
      id: `result-feedback:${correction.id}:replacement:${attributeKey}:${index}`,
      source: "result-feedback" as const,
      targetType: "attribute" as const,
      attributeKey,
      direction: "conditional" as const,
      intent: "borrow-element" as const,
      weight: 1.25,
      relatedEntityId: correction.statementId,
      context: `用户把结果修改为：${correction.editedTitle ?? tokenById.get(attributeKey)?.label ?? attributeKey}`,
      createdAt: correction.createdAt,
      independenceKey: `result-feedback:${correction.id}`,
      userConfirmed: true,
      observationVerdict: "modified" as const,
    } satisfies EvidenceRef)) : [];
    return [...removed, ...replacements];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function groupEvidenceByAttribute(evidence: EvidenceRef[]): EvidenceGroup[] {
  const grouped = new Map<string, EvidenceRef[]>();
  evidence.forEach((item) => grouped.set(item.attributeKey, [...(grouped.get(item.attributeKey) ?? []), item]));
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([attributeKey, items]) => {
    const sorted = [...items].sort((left, right) => left.id.localeCompare(right.id));
    const positive = sorted.filter((item) => item.direction === "positive");
    const negative = sorted.filter((item) => item.direction === "negative");
    return {
      attributeKey,
      evidence: sorted,
      positive,
      negative,
      neutral: sorted.filter((item) => item.direction === "neutral"),
      aspirational: sorted.filter((item) => item.direction === "aspirational"),
      conditional: sorted.filter((item) => item.direction === "conditional"),
      independentPositiveCount: uniqueCount(positive),
      independentNegativeCount: uniqueCount(negative),
      sourceCount: uniqueSources([...positive, ...negative]),
      stageCount: uniqueStages([...positive, ...negative]),
    };
  });
}

export function calculateConfidence(group: EvidenceGroup, purpose: ConfidencePurpose = "core"): ConfidenceResult {
  const forward = purpose === "core"
    ? group.positive
    : purpose === "aspirational"
      ? group.aspirational
      : purpose === "boundary"
        ? [...group.negative, ...group.conditional]
        : [...group.positive, ...group.conditional, ...group.aspirational];
  const reverse = purpose === "boundary" ? group.positive : group.negative;
  const independentPositiveCount = uniqueCount(forward);
  const independentNegativeCount = uniqueCount(reverse);
  const positiveWeight = uniqueWeight(forward);
  const negativeWeight = uniqueWeight(reverse);
  const sourceCount = uniqueSources(forward);
  const stageCount = uniqueStages(forward);
  const reasons: string[] = [];
  const hasWearEvidence = forward.some((item) => item.intent === "want-to-wear" || item.source === "outfit-check-in");
  const hasConfirmedObservation = forward.some((item) => item.source === "archive-confirmation" && item.userConfirmed && item.observationVerdict === "confirmed");
  const hasDeniedOrModifiedObservation = group.evidence.some((item) => item.observationVerdict === "denied" || item.observationVerdict === "modified");
  const onlyAspirational = group.aspirational.length > 0 && group.positive.length === 0 && group.conditional.every((item) => item.intent !== "want-to-wear");
  const weightsAreClose = positiveWeight > 0 && negativeWeight > 0 && Math.abs(positiveWeight - negativeWeight) <= Math.max(0.75, Math.max(positiveWeight, negativeWeight) * 0.3);

  let confidence: ConfidenceLevel = "unresolved";
  if (purpose === "core" && onlyAspirational) reasons.push("证据只来自 admire-only，不能进入稳定审美");
  if (hasDeniedOrModifiedObservation) reasons.push("用户否认或修改过这一属性的主要观察");
  if (weightsAreClose) reasons.push("正向与反向独立证据权重接近");

  if (!reasons.length && purpose !== "aspirational" && purpose !== "curiosity" && independentPositiveCount >= 4 && stageCount >= 2 && hasWearEvidence && negativeWeight < positiveWeight * 0.75) {
    confidence = "stable";
    reasons.push("至少四条独立同向证据，跨两个阶段，包含真实穿着意愿，且没有同等强度反证");
  } else if (!reasons.length && (hasConfirmedObservation || (independentPositiveCount >= 3 && sourceCount >= 2))) {
    confidence = "supported";
    reasons.push(hasConfirmedObservation ? "包含一条用户主动确认的收藏观察" : "至少三条独立同向证据，来自至少两种来源");
  } else if (!reasons.length && independentPositiveCount >= 2) {
    confidence = "emerging";
    reasons.push(sourceCount === 1 ? "至少两条同向证据，但目前只来自一种来源" : "至少两条同向证据，仍需用户确认或真实穿着验证");
  } else if (!reasons.length) {
    reasons.push(independentPositiveCount ? "有效独立证据不足" : "没有足够的同向有效证据");
  }

  return { confidence, reasons, positiveWeight, negativeWeight, independentPositiveCount, independentNegativeCount, sourceCount, stageCount };
}

const contrastRules = [
  {
    id: "color-expression-safety",
    sideAKeys: ["color-high-saturation", "color-accent"],
    sideBKeys: ["color-neutral-low", "color-earth"],
    kind: "aspiration-versus-wear" as const,
    title: "色彩表达 × 日常安全感",
    interpretation: "高彩度主要出现在欣赏证据中，而现实穿着更稳定地选择低饱和色。",
    practicalTranslation: "保留低饱和主体，把高彩度限制在可替换的小面积元素。",
  },
  {
    id: "structure-intensity-boundary",
    sideAKeys: ["silhouette-structured-medium", "silhouette-clean"],
    sideBKeys: ["silhouette-dramatic-structure"],
    kind: "intensity-boundary" as const,
    title: "结构感 × 戏剧化强度",
    interpretation: "用户偏好中低强度结构，但拒绝高强度强肩；反证只限制强度，不否定结构本身。",
    practicalTranslation: "优先清晰肩线和直线剪裁，避开夸张垫肩或舞台化体积。",
  },
];

export function detectContradictions(groups: EvidenceGroup[]): EvidenceContradiction[] {
  const groupMap = new Map(groups.map((group) => [group.attributeKey, group]));
  const direct = groups.filter((group) => group.positive.length && group.negative.length).map((group) => ({
    id: `direct:${group.attributeKey}`,
    kind: "direct" as const,
    title: `${tokenById.get(group.attributeKey)?.label ?? group.attributeKey}：吸引力 × 排斥`,
    attributeKeys: [group.attributeKey],
    positiveEvidenceIds: group.positive.map((item) => item.id),
    negativeEvidenceIds: group.negative.map((item) => item.id),
    aspirationalEvidenceIds: group.aspirational.map((item) => item.id),
    conditionalEvidenceIds: group.conditional.map((item) => item.id),
    interpretation: "同一属性同时出现正向与反向独立证据，不能用平均分抹平。",
    practicalTranslation: "保留为待探索，并通过真实穿着或单变量替换继续验证。",
  }));
  const semantic = contrastRules.flatMap((rule) => {
    const sideA = rule.sideAKeys.map((key) => groupMap.get(key)).filter(Boolean) as EvidenceGroup[];
    const sideB = rule.sideBKeys.map((key) => groupMap.get(key)).filter(Boolean) as EvidenceGroup[];
    const sideAAspirational = sideA.flatMap((group) => group.aspirational);
    const sideAPositive = sideA.flatMap((group) => group.positive);
    const sideANegative = sideA.flatMap((group) => group.negative);
    const sideBPositive = sideB.flatMap((group) => group.positive);
    const sideBNegative = sideB.flatMap((group) => group.negative);
    const matchesColor = rule.kind === "aspiration-versus-wear" && sideAAspirational.length > 0 && sideBPositive.some((item) => item.intent === "want-to-wear");
    const matchesIntensity = rule.kind === "intensity-boundary" && sideAPositive.length > 0 && sideBNegative.length > 0;
    if (!matchesColor && !matchesIntensity) return [];
    return [{
      id: rule.id,
      kind: rule.kind,
      title: rule.title,
      attributeKeys: [...sideA.map((group) => group.attributeKey), ...sideB.map((group) => group.attributeKey)],
      positiveEvidenceIds: [...sideAPositive, ...sideBPositive].map((item) => item.id),
      negativeEvidenceIds: [...sideANegative, ...sideBNegative].map((item) => item.id),
      aspirationalEvidenceIds: sideAAspirational.map((item) => item.id),
      conditionalEvidenceIds: [...sideA, ...sideB].flatMap((group) => group.conditional).map((item) => item.id),
      interpretation: rule.interpretation,
      practicalTranslation: rule.practicalTranslation,
    } satisfies EvidenceContradiction];
  });
  const conditional = groups.flatMap((group) => group.conditional.filter((item) => item.context?.startsWith("boundary-transition:")).map((item) => ({
    id: `conditional:${item.id}`,
    kind: "conditional-boundary" as const,
    title: `${tokenById.get(group.attributeKey)?.label ?? group.attributeKey}的条件边界`,
    attributeKeys: [group.attributeKey],
    positiveEvidenceIds: [],
    negativeEvidenceIds: [],
    aspirationalEvidenceIds: [],
    conditionalEvidenceIds: [item.id],
    interpretation: item.context?.replace("boundary-transition:", "") ?? "单个元素改变了整套造型的穿着意愿。",
    practicalTranslation: "把限制因素归因到被替换的元素，不否定整套造型方向。",
  })));
  return [...direct, ...semantic, ...conditional].sort((left, right) => left.id.localeCompare(right.id));
}

function statementFromGroup(group: EvidenceGroup, purpose: ConfidencePurpose, idPrefix: string): TasteStatement {
  const token = tokenById.get(group.attributeKey);
  const result = calculateConfidence(group, purpose);
  const classificationReason = purpose === "core"
    ? "进入稳定审美：证据包含实际穿着偏好或用户确认，不依赖趋势母题名称。"
    : purpose === "aspirational"
      ? "进入欣赏偏好：证据主要来自 admire-only 或理想自我，不直接进入 coreTaste。"
      : purpose === "boundary"
        ? "进入现实边界：存在明确拒绝、犹豫或单变量替换后的意愿转变。"
        : "进入当前兴趣：线索近期出现，但独立性、跨阶段验证或穿着证据仍不足。";
  const forward = purpose === "aspirational" ? group.aspirational : purpose === "boundary" ? [...group.negative, ...group.conditional] : group.positive;
  return {
    id: `${idPrefix}:${group.attributeKey}`,
    dimension: token?.dimension ?? "mood",
    title: token?.label ?? group.attributeKey,
    summary: purpose === "core"
      ? `你在不同环节里都选到了“${token?.label ?? group.attributeKey}”，而且更接近真正愿意穿的状态。`
      : purpose === "aspirational"
        ? `“${token?.label ?? group.attributeKey}”会让你心动，但目前更像欣赏，还不代表你每天会这样穿。`
        : purpose === "boundary"
          ? `遇到“${token?.label ?? group.attributeKey}”时，你更容易犹豫或拒绝。问题可能只在这个细节，不代表你不喜欢整套方向。`
          : `你最近开始注意“${token?.label ?? group.attributeKey}”，但还需要更多真实选择，才能知道它会不会留下来。`,
    attributeIds: [group.attributeKey],
    confidence: result.confidence,
    evidenceIds: forward.map((item) => item.id),
    positiveEvidenceIds: group.positive.map((item) => item.id),
    negativeEvidenceIds: group.negative.map((item) => item.id),
    aspirationalEvidenceIds: group.aspirational.map((item) => item.id),
    conditionalEvidenceIds: group.conditional.map((item) => item.id),
    state: result.confidence === "unresolved" ? "to-explore" : "active",
    classificationReason,
    confidenceReasons: result.reasons,
  };
}

export function generateTasteStatements(groups: EvidenceGroup[], generatedAt = "1970-01-01T00:00:00.000Z"): TasteStatementGroups {
  const coreTaste: TasteStatement[] = [];
  const aspirationalTaste: TasteStatement[] = [];
  const wearabilityBoundary: TasteStatement[] = [];
  const currentCuriosity: CuriosityStatement[] = [];

  groups.forEach((group) => {
    const coreConfidence = calculateConfidence(group, "core");
    if (coreConfidence.confidence === "supported" || coreConfidence.confidence === "stable") coreTaste.push(statementFromGroup(group, "core", "core"));
    if (group.aspirational.length) aspirationalTaste.push(statementFromGroup(group, "aspirational", "aspirational"));
    if (group.negative.length || group.conditional.some((item) => item.context?.startsWith("boundary-transition:"))) wearabilityBoundary.push(statementFromGroup(group, "boundary", "boundary"));

    const alreadyCore = coreTaste.some((statement) => statement.attributeIds.includes(group.attributeKey));
    const curiosityConfidence = calculateConfidence(group, "curiosity");
    const shouldBeCuriosity = !alreadyCore && (group.positive.length > 0 || group.conditional.length > 0 || curiosityConfidence.confidence === "unresolved");
    if (shouldBeCuriosity) {
      const base = statementFromGroup(group, "curiosity", "curiosity");
      const relevant = [...group.positive, ...group.conditional, ...group.aspirational].sort(byCreatedAt);
      currentCuriosity.push({
        ...base,
        firstSeenAt: relevant[0]?.createdAt ?? generatedAt,
        lastReinforcedAt: relevant.at(-1)?.createdAt ?? generatedAt,
        reinforcementCount: uniqueCount(relevant),
      });
    }
  });
  return { coreTaste, aspirationalTaste, wearabilityBoundary, currentCuriosity };
}

function findStatement(statements: TasteStatement[], attributeKeys: string[]) {
  return statements.find((statement) => statement.attributeIds.some((attributeKey) => attributeKeys.includes(attributeKey)));
}

export function generateStyleTensions(groups: EvidenceGroup[], statements: TasteStatementGroups, contradictions = detectContradictions(groups)): StyleTension[] {
  const groupMap = new Map(groups.map((group) => [group.attributeKey, group]));
  return contradictions.map((contradiction) => {
    const aspirational = findStatement(statements.aspirationalTaste, contradiction.attributeKeys);
    const core = findStatement(statements.coreTaste, contradiction.attributeKeys);
    const boundary = findStatement(statements.wearabilityBoundary, contradiction.attributeKeys);
    const firstGroup = contradiction.attributeKeys.map((key) => groupMap.get(key)).find(Boolean)!;
    const secondGroup = contradiction.attributeKeys.map((key) => groupMap.get(key)).filter(Boolean).at(-1) ?? firstGroup;
    const sideA = aspirational ?? core ?? statementFromGroup(firstGroup, "curiosity", `tension-a:${contradiction.id}`);
    const sideB = core && core.id !== sideA.id ? core : boundary ?? statementFromGroup(secondGroup, "boundary", `tension-b:${contradiction.id}`);
    return {
      id: `tension:${contradiction.id}`,
      title: contradiction.title,
      sideA,
      sideB,
      interpretation: contradiction.interpretation,
      practicalTranslation: contradiction.practicalTranslation,
      evidenceIds: [...new Set([...contradiction.positiveEvidenceIds, ...contradiction.negativeEvidenceIds, ...contradiction.aspirationalEvidenceIds, ...contradiction.conditionalEvidenceIds])],
    };
  });
}

export function generateUnresolvedQuestions(groups: EvidenceGroup[], contradictions = detectContradictions(groups)): ExplorationQuestion[] {
  const contradictionKeys = new Set(contradictions.flatMap((item) => item.attributeKeys));
  return groups.flatMap((group) => {
    const result = calculateConfidence(group, "core");
    if (result.confidence !== "unresolved" && !contradictionKeys.has(group.attributeKey)) return [];
    const token = tokenById.get(group.attributeKey);
    const denied = group.evidence.some((item) => item.observationVerdict === "denied" || item.observationVerdict === "modified");
    const onlyAdmire = group.aspirational.length > 0 && group.positive.length === 0;
    const conflict = group.positive.length > 0 && group.negative.length > 0;
    const reason = conflict ? "正反证据接近" : denied ? "用户否认或修改过主要观察" : onlyAdmire ? "目前只有欣赏证据" : "独立证据不足";
    return [{
      id: `question:${group.attributeKey}`,
      attributeKey: group.attributeKey,
      question: `“${token?.label ?? group.attributeKey}”在真实穿着中会让你更自在，还是只在图片里吸引你？`,
      reason,
      evidenceIds: group.evidence.map((item) => item.id),
      suggestedNextStep: conflict ? "outfit-check-in" as const : denied ? "archive-decode" as const : onlyAdmire ? "style-lab" as const : "visual-sampling" as const,
    }];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function generateStyleSystemOutput(session: StyleSession): StyleSystemOutput {
  const evidence = [
    ...collectVisualEvidence(session.visualSampling),
    ...collectArchiveEvidence(session.archiveDecode),
    ...collectLabEvidence(session.styleLab),
    ...collectContinuousEvidence(session.activity.records),
    ...collectResultCorrectionEvidence(session.styleSystem.corrections),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const groups = groupEvidenceByAttribute(evidence);
  const contradictions = detectContradictions(groups);
  const statements = generateTasteStatements(groups, session.updatedAt);
  const styleTensions = generateStyleTensions(groups, statements, contradictions);
  const unresolvedQuestions = generateUnresolvedQuestions(groups, contradictions);
  const allStatements = [...statements.coreTaste, ...statements.aspirationalTaste, ...statements.wearabilityBoundary, ...statements.currentCuriosity];
  const curiosityLabels = statements.currentCuriosity.map((statement) => statement.title);
  return {
    ...statements,
    confidence: Object.fromEntries(allStatements.map((statement) => [statement.id, statement.confidence])),
    evidence,
    styleTensions,
    unresolvedQuestions,
    generatedAt: session.updatedAt,
    trendTranslations: curiosityLabels.length ? [{
      trendName: "最近想试的细节",
      sourceAttributes: curiosityLabels.slice(0, 3),
      personalVersion: "一次只加入一个让你好奇的细节，其他部分先保持熟悉。",
      lowRiskMove: "从常穿的一套衣服开始，只换一个颜色、版型或配饰。",
    }] : [],
    shoppingFilters: {
      prioritize: statements.coreTaste.map((statement) => statement.title),
      avoidAssuming: ["觉得图片好看，就等于自己想穿", "喜欢某个流行词，就等于被它定义", "拒绝一次，就等于不喜欢整个方向"],
    },
    searchKeywords: statements.coreTaste.map((statement) => `${statement.title} 日常穿搭`),
    lowRiskExperiments: statements.wearabilityBoundary.length
      ? statements.wearabilityBoundary.map((statement) => `围绕“${statement.title}”，一次只换一个细节`)
      : ["从熟悉的一套衣服开始，一次只换一个细节，再看看是否愿意穿"],
  };
}

export function deriveStableClues(responses: VisualResponse[], rejectedClueAttributeKeys: string[] = []) {
  const state: VisualSamplingState = { status: "in-progress", responses, askedLookIds: responses.map((response) => response.lookId), stableClues: [], rejectedClueAttributeKeys, candidateThemeIds: [] };
  return groupEvidenceByAttribute(collectVisualEvidence(state)).flatMap((group) => {
    const result = calculateConfidence(group, "core");
    if (result.confidence === "unresolved" || rejectedClueAttributeKeys.includes(group.attributeKey)) return [];
    return [{ id: `clue-${group.attributeKey}`, title: group.attributeKey, attributeIds: [group.attributeKey], confidence: result.confidence, evidenceIds: group.positive.map((item) => item.id) }];
  }).slice(0, 6);
}

const diversitySeedLookIds = [
  "retro-color-daily",
  "relaxed-tailoring-daily",
  "crafted-layering-expressive",
  "polished-sport-daily",
  "modern-romance-expressive",
  "soft-utility-daily",
  "quiet-structure-daily",
  "sculptural-mono-expressive",
];

export function getNextAdaptiveLook(responses: VisualResponse[], askedLookIds: string[]): TrendLook | null {
  const allLooks = trendThemes.flatMap((theme) => theme.looks);
  const nextSeed = diversitySeedLookIds
    .map((id) => allLooks.find((look) => look.id === id))
    .find((look) => look && !askedLookIds.includes(look.id));
  // The opening samples deliberately cross color, tailoring, texture and sport.
  // Adaptation starts only after the user has seen enough range to avoid anchoring.
  if (responses.length < 4 && nextSeed) return nextSeed;
  const latest = responses.at(-1)!;
  const latestTheme = trendThemes.find((theme) => theme.id === latest.themeId)!;
  const nextIntensityIndex = latest.intensity === "daily" ? 1 : latest.intensity === "expressive" ? 2 : -1;
  if (positiveAdaptiveIntents.has(latest.reaction) && nextIntensityIndex >= 0) {
    const intensified = latestTheme.looks[nextIntensityIndex];
    if (!askedLookIds.includes(intensified.id)) return intensified;
  }
  const positiveAttributeIds = new Set(responses.filter((response) => positiveAdaptiveIntents.has(response.reaction)).flatMap((response) => response.attributeIds));
  const askedThemeIds = new Set(responses.map((response) => response.themeId));
  const ranked = allLooks
    .filter((look) => !askedLookIds.includes(look.id))
    .map((look) => ({
      look,
      score: look.attributes.filter((attribute) => positiveAttributeIds.has(attribute.id)).length
        + (askedThemeIds.has(look.themeId) ? 0 : 4),
    }))
    .sort((left, right) => right.score - left.score || left.look.id.localeCompare(right.look.id));
  return ranked[0]?.look ?? null;
}

export function shouldCompleteVisualSampling(session: StyleSession) {
  const responseCount = session.visualSampling.responses.length;
  const themeCount = new Set(session.visualSampling.responses.map((response) => response.themeId)).size;
  return responseCount >= 8 && (session.visualSampling.stableClues.length >= 3 || themeCount >= 6);
}

const directionDimensions: AttributeDimension[] = [
  "color", "silhouette", "material", "proportion", "ornament", "stylingRelation", "accessory", "mood",
];

function directionEvidenceScore(item: EvidenceRef) {
  if (item.direction === "positive") return item.weight * 3;
  if (item.direction === "conditional") return item.weight * 1.7;
  if (item.direction === "aspirational") return item.weight;
  if (item.direction === "negative") return item.weight * -4;
  return 0;
}

function selectLookForAttributes(
  attributeKeys: Record<AttributeDimension, string>,
  zone: StyleDirection["variants"][number]["zone"],
  usedLookIds: Set<string>,
) {
  const targetIntensity = zone === "safe" ? "daily" : zone === "extension" ? "expressive" : "experimental";
  const selectedKeys = new Set(Object.values(attributeKeys));
  const ranked = trendThemes.flatMap((theme) => theme.looks).map((look) => {
    const overlap = look.attributes.filter((attribute) => selectedKeys.has(attribute.id)).length;
    const intensityMatch = look.intensity === targetIntensity ? 4 : 0;
    const reusePenalty = usedLookIds.has(look.id) ? 8 : 0;
    return { look, score: overlap * 5 + intensityMatch - reusePenalty };
  }).sort((left, right) => right.score - left.score || left.look.id.localeCompare(right.look.id));
  const selected = ranked[0]?.look;
  if (selected) usedLookIds.add(selected.id);
  return selected;
}

export function buildStyleDirectionsFromEvidence(evidence: EvidenceRef[]): StyleDirection[] {
  const templates = mockStyleDirections(evidence.map((item) => item.id));
  if (!evidence.length) return templates;

  const rankedByDimension = new Map<AttributeDimension, Array<{ key: string; score: number; aspirational: number; conditional: number }>>();
  directionDimensions.forEach((dimension) => {
    const keys = attributeTokens.filter((token) => token.dimension === dimension).map((token) => token.id);
    const ranked = keys.map((key) => {
      const matching = evidence.filter((item) => item.attributeKey === key);
      return {
        key,
        score: matching.reduce((sum, item) => sum + directionEvidenceScore(item), 0),
        aspirational: matching.filter((item) => item.direction === "aspirational").reduce((sum, item) => sum + item.weight, 0),
        conditional: matching.filter((item) => item.direction === "conditional").reduce((sum, item) => sum + item.weight, 0),
      };
    }).filter((item) => item.score > 0 || item.aspirational > 0 || item.conditional > 0)
      .sort((left, right) => right.score - left.score || right.conditional - left.conditional || right.aspirational - left.aspirational || left.key.localeCompare(right.key));
    rankedByDimension.set(dimension, ranked);
  });

  const usedLookIds = new Set<string>();
  return templates.map((template, directionIndex) => {
    const selectedKeys = new Set<string>();
    const variants = template.variants.map((variant) => {
      const attributeKeys = { ...variant.attributeKeys };
      const attributes = { ...variant.attributes };
      directionDimensions.forEach((dimension) => {
        const ranked = rankedByDimension.get(dimension) ?? [];
        const positive = ranked.filter((item) => item.score > 0);
        const exploratory = ranked.filter((item) => item.aspirational > 0 || item.conditional > 0);
        const selected = variant.zone === "safe"
          ? positive[directionIndex] ?? positive[0]
          : variant.zone === "extension"
            ? positive[directionIndex + 1] ?? exploratory[directionIndex] ?? positive[directionIndex] ?? positive[0]
            : exploratory[directionIndex] ?? positive[directionIndex + 1] ?? positive[directionIndex] ?? positive[0];
        if (!selected) return;
        const token = tokenById.get(selected.key);
        attributeKeys[dimension] = selected.key;
        attributes[dimension] = token?.label ?? selected.key;
        selectedKeys.add(selected.key);
      });
      const selectedLook = selectLookForAttributes(attributeKeys, variant.zone, usedLookIds);
      return {
        ...variant,
        attributeKeys,
        attributes,
        imageSrc: selectedLook?.imageSrc ?? variant.imageSrc,
        imageAlt: selectedLook
          ? `${variant.title}：依据前两步属性匹配的完整造型，包含${selectedLook.attributes.map((item) => item.label).join("、")}`
          : variant.imageAlt,
      };
    });
    const safe = variants.find((variant) => variant.zone === "safe")!;
    const titleKeys = [safe.attributeKeys.silhouette, safe.attributeKeys.color, safe.attributeKeys.material]
      .filter((key, index, all) => key && all.indexOf(key) === index)
      .slice(0, 2);
    const title = titleKeys.map((key) => tokenById.get(key)?.label ?? key).join(" × ") || template.title;
    const sourceEvidence = evidence.filter((item) => selectedKeys.has(item.attributeKey));
    const wearCount = new Set(sourceEvidence.filter((item) => item.intent === "want-to-wear").map(independenceKey)).size;
    const aspirationCount = new Set(sourceEvidence.filter((item) => item.direction === "aspirational").map(independenceKey)).size;
    return {
      ...template,
      title,
      rationale: `由前两步中 ${sourceEvidence.length} 条相关证据组合：${wearCount} 组现实穿着信号，${aspirationCount} 组欣赏信号。安全区优先现实证据，实验区才引入欣赏或条件属性。`,
      sourceEvidenceIds: sourceEvidence.map((item) => item.id),
      variants,
    };
  });
}

export function initializeLab(session: StyleSession): StyleSession {
  if (session.styleLab.directions.length) return session;
  const evidence = [...collectVisualEvidence(session.visualSampling), ...collectArchiveEvidence(session.archiveDecode)];
  return {
    ...session,
    activeStep: "style-lab",
    styleLab: { ...session.styleLab, status: "in-progress", directions: buildStyleDirectionsFromEvidence(evidence) },
  };
}

export function recordLabElementReplacement(state: StyleLabState, directionId: string, variantId: string, option: SwapOption, createdAt: string): StyleLabState {
  const direction = state.directions.find((item) => item.id === directionId);
  const variant = direction?.variants.find((item) => item.id === variantId);
  if (!direction || !variant) return state;
  const event: LabEditEvent = {
    id: `edit-${state.editEvents.length + 1}`,
    directionId,
    variantId,
    dimension: option.dimension,
    elementKey: option.elementKey,
    fromValue: variant.attributes[option.dimension],
    toValue: option.value,
    fromAttributeKey: variant.attributeKeys[option.dimension],
    toAttributeKey: option.attributeKey,
    wearingIntentBefore: variant.wearingIntent,
    wearingIntentAfter: variant.wearingIntent,
    limitingFactor: option.limitingFactor,
    createdAt,
  };
  return {
    ...state,
    editEvents: [...state.editEvents, event],
    directions: state.directions.map((item) => item.id !== directionId ? item : {
      ...item,
      variants: item.variants.map((candidate) => candidate.id !== variantId ? candidate : {
        ...candidate,
        attributes: { ...candidate.attributes, [option.dimension]: option.value },
        attributeKeys: { ...candidate.attributeKeys, [option.dimension]: option.attributeKey },
      }),
    }),
  };
}

function transitionInterpretation(edit: LabEditEvent) {
  return `换掉${edit.elementKey === "shoe" ? "鞋子" : edit.elementKey}后从“${edit.wearingIntentBefore === "hesitant" ? "犹豫" : "不愿穿"}”转为“愿意穿”。限制因素可能是${edit.limitingFactor}，而不是整体风格。`;
}

export function recordWearingIntentChange(state: StyleLabState, directionId: string, variantId: string, nextIntent: WearingIntent, createdAt: string): StyleLabState {
  const direction = state.directions.find((item) => item.id === directionId);
  const variant = direction?.variants.find((item) => item.id === variantId);
  if (!direction || !variant || variant.wearingIntent === nextIntent) return state;
  const event = {
    id: `wearing-intent-${state.wearingIntentEvents.length + 1}`,
    directionId,
    variantId,
    from: variant.wearingIntent,
    to: nextIntent,
    attributeKeys: Object.values(variant.attributeKeys),
    createdAt,
  };
  const lastEditIndex = state.editEvents.findLastIndex((item) => item.variantId === variantId && (item.wearingIntentBefore === "reject" || item.wearingIntentBefore === "hesitant"));
  const lastEdit = lastEditIndex >= 0 ? state.editEvents[lastEditIndex] : undefined;
  const createsTransition = nextIntent === "want-to-wear" && (variant.wearingIntent === "reject" || variant.wearingIntent === "hesitant") && lastEdit?.wearingIntentBefore === variant.wearingIntent;
  const editEvents = state.editEvents.map((item, index) => index === lastEditIndex && createsTransition ? { ...item, wearingIntentAfter: nextIntent } : item);
  const transition = createsTransition && lastEdit ? {
    id: `boundary-${state.boundaryTransitions.length + 1}`,
    directionId,
    variantId,
    changedDimension: lastEdit.dimension,
    changedElement: lastEdit.elementKey,
    fromValue: lastEdit.fromValue,
    toValue: lastEdit.toValue,
    fromAttributeKey: lastEdit.fromAttributeKey,
    toAttributeKey: lastEdit.toAttributeKey,
    wearingIntentBefore: variant.wearingIntent as "hesitant" | "reject",
    wearingIntentAfter: "want-to-wear" as const,
    limitingFactor: lastEdit.limitingFactor,
    interpretation: transitionInterpretation(lastEdit),
    evidenceId: `lab-${lastEdit.id}`,
  } : null;
  return {
    ...state,
    editEvents,
    wearingIntentEvents: [...state.wearingIntentEvents, event],
    boundaryTransitions: transition ? [...state.boundaryTransitions, transition] : state.boundaryTransitions,
    directions: state.directions.map((item) => item.id !== directionId ? item : { ...item, variants: item.variants.map((candidate) => candidate.id === variantId ? { ...candidate, wearingIntent: nextIntent } : candidate) }),
  };
}

export function describeArchiveCorrection(before: ArchiveObservation, after: ArchiveObservation, createdAt: string): ArchiveCorrectionImpact | null {
  if (after.verdict === "pending") return null;
  const editedKeys = after.editedAttributeIds ?? [];
  const message = after.verdict === "confirmed"
    ? `你确认了“${after.title}”，${after.attributeIds.length} 个属性获得用户确认支持。`
    : after.verdict === "denied"
      ? `你否认了“${before.title}”，原观察不再产生正向证据。`
      : `你把“${before.title}”修改为“${after.editedTitle ?? "条件性偏好"}”，原正向作用已删除，只保留 ${editedKeys.length} 条条件证据。`;
  return {
    id: `correction-${after.id}-${after.verdict}`,
    observationId: after.id,
    verdict: after.verdict,
    affectedAttributeKeys: after.verdict === "modified" ? editedKeys : after.attributeIds,
    removedPositiveEvidenceCount: after.verdict === "confirmed" ? 0 : before.attributeIds.length,
    addedConditionalEvidenceCount: after.verdict === "modified" ? editedKeys.length : after.verdict === "confirmed" ? after.attributeIds.length : 0,
    message,
    createdAt,
  };
}

export function generateStyleSystem(session: StyleSession): StyleSession {
  return {
    ...session,
    status: "completed",
    activeStep: "style-system",
    flow: {},
    styleSystem: { ...session.styleSystem, status: "completed", output: generateStyleSystemOutput(session) },
  };
}

export function applyStyleStatementCorrection(session: StyleSession, correction: StyleStatementCorrection): StyleSession {
  const corrections = [
    ...session.styleSystem.corrections.filter((item) => item.statementId !== correction.statementId),
    correction,
  ].sort((left, right) => left.id.localeCompare(right.id));
  const draft = {
    ...session,
    styleSystem: { ...session.styleSystem, status: "completed" as const, corrections, output: null },
    updatedAt: correction.createdAt,
  };
  return { ...draft, styleSystem: { ...draft.styleSystem, output: generateStyleSystemOutput(draft) } };
}

export function removeStyleStatementCorrection(session: StyleSession, statementId: string, createdAt = new Date().toISOString()): StyleSession {
  const draft = {
    ...session,
    updatedAt: createdAt,
    styleSystem: {
      ...session.styleSystem,
      corrections: session.styleSystem.corrections.filter((item) => item.statementId !== statementId),
      output: null,
    },
  };
  return { ...draft, styleSystem: { ...draft.styleSystem, status: "completed", output: generateStyleSystemOutput(draft) } };
}

export function addContinuousToolRecord(session: StyleSession, record: ContinuousToolRecord): StyleSession {
  const records = [...session.activity.records, record];
  const draft = {
    ...session,
    activity: {
      ...session.activity,
      lastEntry: record.tool,
      checkInCount: session.activity.checkInCount + (record.tool === "outfit-check-in" ? 1 : 0),
      records,
    },
    updatedAt: record.createdAt,
  };
  return session.styleSystem.status === "completed"
    ? { ...draft, styleSystem: { ...draft.styleSystem, output: generateStyleSystemOutput(draft) } }
    : draft;
}

export function archiveReady(archive: ArchiveDecodeState) {
  return archive.images.length >= 5 && archive.observations.length > 0 && archive.observations.every((item) => item.verdict !== "pending");
}

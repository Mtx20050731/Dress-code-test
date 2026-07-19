export type ExplorationStep =
  | "visual-sampling"
  | "archive-decode"
  | "style-lab"
  | "style-system";

export type StepStatus = "not-started" | "in-progress" | "completed";
export type ConfidenceLevel = "emerging" | "supported" | "stable" | "unresolved";

export type EvidenceDirection =
  | "positive"
  | "negative"
  | "neutral"
  | "aspirational"
  | "conditional";

export type UserIntent =
  | "want-to-wear"
  | "admire-only"
  | "borrow-element"
  | "uninterested"
  | "reject";

export type EvidenceSource =
  | "visual-sampling"
  | "archive-image"
  | "archive-confirmation"
  | "style-lab"
  | "outfit-check-in"
  | "result-feedback";

export type EvidenceTargetType =
  | "image"
  | "region"
  | "outfit"
  | "attribute"
  | "observation";

export type AttributeDimension =
  | "color"
  | "silhouette"
  | "material"
  | "proportion"
  | "ornament"
  | "stylingRelation"
  | "accessory"
  | "mood";

export type AttributeToken = {
  id: string;
  dimension: AttributeDimension;
  label: string;
  description?: string;
};

export type EvidenceRef = {
  id: string;
  source: EvidenceSource;
  targetType: EvidenceTargetType;
  attributeKey: string;
  direction: EvidenceDirection;
  intent: UserIntent;
  weight: number;
  relatedEntityId: string;
  context?: string;
  createdAt: string;
  imageSrc?: string;
  independenceKey?: string;
  userConfirmed?: boolean;
  observationVerdict?: ObservationVerdict;
};

export type EvidenceGroup = {
  attributeKey: string;
  evidence: EvidenceRef[];
  positive: EvidenceRef[];
  negative: EvidenceRef[];
  neutral: EvidenceRef[];
  aspirational: EvidenceRef[];
  conditional: EvidenceRef[];
  independentPositiveCount: number;
  independentNegativeCount: number;
  sourceCount: number;
  stageCount: number;
};

export type ConfidenceResult = {
  confidence: ConfidenceLevel;
  reasons: string[];
  positiveWeight: number;
  negativeWeight: number;
  independentPositiveCount: number;
  independentNegativeCount: number;
  sourceCount: number;
  stageCount: number;
};

export type EvidenceContradiction = {
  id: string;
  kind: "direct" | "aspiration-versus-wear" | "intensity-boundary" | "conditional-boundary";
  title: string;
  attributeKeys: string[];
  positiveEvidenceIds: string[];
  negativeEvidenceIds: string[];
  aspirationalEvidenceIds: string[];
  conditionalEvidenceIds: string[];
  interpretation: string;
  practicalTranslation: string;
};

export type TasteStatement = {
  id: string;
  dimension: AttributeDimension;
  title: string;
  summary: string;
  attributeIds: string[];
  confidence: ConfidenceLevel;
  evidenceIds: string[];
  positiveEvidenceIds: string[];
  negativeEvidenceIds: string[];
  aspirationalEvidenceIds: string[];
  conditionalEvidenceIds: string[];
  state: "active" | "to-explore";
  classificationReason: string;
  confidenceReasons: string[];
};

export type CuriosityStatement = TasteStatement & {
  firstSeenAt: string;
  lastReinforcedAt: string;
  reinforcementCount: number;
  expiresAt?: string;
};

export type StyleTension = {
  id: string;
  title: string;
  sideA: TasteStatement;
  sideB: TasteStatement;
  interpretation: string;
  practicalTranslation: string;
  evidenceIds: string[];
};

export type ExplorationQuestion = {
  id: string;
  attributeKey: string;
  question: string;
  reason: string;
  evidenceIds: string[];
  suggestedNextStep: "visual-sampling" | "archive-decode" | "style-lab" | "outfit-check-in";
};

export type TasteProfile = {
  coreTaste: TasteStatement[];
  aspirationalTaste: TasteStatement[];
  wearabilityBoundary: TasteStatement[];
  currentCuriosity: CuriosityStatement[];
  confidence: Record<string, ConfidenceLevel>;
  evidence: EvidenceRef[];
};

export type TrendIntensity = "daily" | "expressive" | "experimental";
export type VisualReaction = UserIntent;
export type BorrowableElement = AttributeDimension | "item";

export type TrendLook = {
  id: string;
  themeId: string;
  intensity: TrendIntensity;
  title: string;
  imageSrc: string;
  imageAlt: string;
  attributes: AttributeToken[];
};

export type TrendTheme = {
  id: string;
  name: string;
  englishName: string;
  description: string;
  looks: TrendLook[];
};

export type VisualResponse = {
  lookId: string;
  themeId: string;
  intensity: TrendIntensity;
  reaction: VisualReaction;
  borrowedElements: BorrowableElement[];
  attributeIds: string[];
  createdAt: string;
};

export type StableClue = {
  id: string;
  title: string;
  attributeIds: string[];
  confidence: ConfidenceLevel;
  evidenceIds: string[];
};

export type VisualSamplingState = {
  status: StepStatus;
  responses: VisualResponse[];
  askedLookIds: string[];
  stableClues: StableClue[];
  rejectedClueAttributeKeys: string[];
  candidateThemeIds: string[];
};

export type ArchiveIntent =
  | "want-to-wear"
  | "borrow-element"
  | "atmosphere-only"
  | "ideal-self";

export type FocusMark = {
  id: string;
  x: number;
  y: number;
  element: BorrowableElement;
  attributeKeys: string[];
  note?: string;
};

export type ArchiveImage = {
  id: string;
  name: string;
  previewSrc: string;
  intent: ArchiveIntent;
  focusMarks: FocusMark[];
  attributeIds: string[];
  createdAt: string;
};

export type ImageAnalysisCandidate = {
  id: string;
  imageId: string;
  garmentId: string | null;
  attributeName: string;
  dimension: AttributeDimension | "garmentCategory";
  value: string;
  attributeKey: string | null;
  confidence: number;
  regionIds: string[];
  rationale: string;
  reviewStatus: "pending" | "confirmed" | "rejected" | "modified";
  isUncertain: boolean;
  editedValue?: string;
  editedAttributeKey?: string;
};

export type ArchiveImageAnalysis = {
  imageId: string;
  status: "queued" | "processing" | "completed" | "partial" | "needs-review" | "failed";
  requestedProvider: "qwen" | "mock";
  effectiveProvider?: "qwen" | "openai" | "mock";
  fallbackReason?: "missing-api-key" | "missing-model" | null;
  schemaVersion?: string;
  model?: string;
  promptVersion?: string;
  latencyMs?: number;
  candidates: ImageAnalysisCandidate[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  analyzedAt?: string;
};

export type ObservationVerdict = "pending" | "confirmed" | "denied" | "modified";

export type ArchiveObservation = {
  id: string;
  dimension: AttributeDimension;
  title: string;
  description: string;
  attributeIds: string[];
  imageIds: string[];
  verdict: ObservationVerdict;
  editedTitle?: string;
  editedAttributeIds?: string[];
  reviewedAt?: string;
  source?: "ai" | "mock" | "manual";
  candidateIds?: string[];
};

export type ArchiveCluster = {
  id: string;
  title: string;
  imageIds: string[];
  attributeIds: string[];
};

export type ArchiveCorrectionImpact = {
  id: string;
  observationId: string;
  verdict: Exclude<ObservationVerdict, "pending">;
  affectedAttributeKeys: string[];
  removedPositiveEvidenceCount: number;
  addedConditionalEvidenceCount: number;
  message: string;
  createdAt: string;
};

export type ArchiveDecodeState = {
  status: StepStatus;
  images: ArchiveImage[];
  clusters: ArchiveCluster[];
  observations: ArchiveObservation[];
  correctionImpacts: ArchiveCorrectionImpact[];
  analyses: ArchiveImageAnalysis[];
};

export type LabZone = "safe" | "extension" | "experiment";
export type WearingIntent = "pending" | "want-to-wear" | "hesitant" | "reject";

export type LookVariant = {
  id: string;
  zone: LabZone;
  title: string;
  imageSrc: string;
  imageAlt: string;
  scene: string;
  attributes: Record<AttributeDimension, string>;
  attributeKeys: Record<AttributeDimension, string>;
  wearingIntent: WearingIntent;
};

export type SwapOption = {
  id: string;
  dimension: AttributeDimension;
  elementKey: "color" | "silhouette" | "bottom" | "shoe" | "bag" | "material" | "accessory";
  label: string;
  value: string;
  attributeKey: string;
  limitingFactor: string;
};

export type StyleDirection = {
  id: string;
  title: string;
  rationale: string;
  sourceEvidenceIds: string[];
  variants: LookVariant[];
  swapOptions: SwapOption[];
};

export type WearingIntentEvent = {
  id: string;
  directionId: string;
  variantId: string;
  from: WearingIntent;
  to: WearingIntent;
  attributeKeys: string[];
  createdAt: string;
};

export type LabEditEvent = {
  id: string;
  directionId: string;
  variantId: string;
  dimension: AttributeDimension;
  elementKey: SwapOption["elementKey"];
  fromValue: string;
  toValue: string;
  fromAttributeKey: string;
  toAttributeKey: string;
  wearingIntentBefore: WearingIntent;
  wearingIntentAfter: WearingIntent;
  limitingFactor: string;
  createdAt: string;
};

export type BoundaryTransition = {
  id: string;
  directionId: string;
  variantId: string;
  changedDimension: AttributeDimension;
  changedElement: SwapOption["elementKey"];
  fromValue: string;
  toValue: string;
  fromAttributeKey: string;
  toAttributeKey: string;
  wearingIntentBefore: "hesitant" | "reject";
  wearingIntentAfter: "want-to-wear";
  limitingFactor: string;
  interpretation: string;
  evidenceId: string;
};

export type StyleLabState = {
  status: StepStatus;
  directions: StyleDirection[];
  editEvents: LabEditEvent[];
  wearingIntentEvents: WearingIntentEvent[];
  boundaryTransitions: BoundaryTransition[];
};

export type TrendTranslation = {
  trendName: string;
  sourceAttributes: string[];
  personalVersion: string;
  lowRiskMove: string;
};

export type StyleSystemOutput = TasteProfile & {
  styleTensions: StyleTension[];
  unresolvedQuestions: ExplorationQuestion[];
  generatedAt: string;
  trendTranslations: TrendTranslation[];
  shoppingFilters: {
    prioritize: string[];
    avoidAssuming: string[];
  };
  searchKeywords: string[];
  lowRiskExperiments: string[];
};

export type StyleStatementCorrection = {
  id: string;
  statementId: string;
  verdict: "denied" | "modified";
  originalAttributeIds: string[];
  replacementAttributeIds: string[];
  editedTitle?: string;
  editedSummary?: string;
  createdAt: string;
};

export type ContinuousEntry =
  | "analyze-item"
  | "translate-trend"
  | "wardrobe-experiment"
  | "outfit-check-in";

export type ContinuousToolRecord = {
  id: string;
  tool: ContinuousEntry;
  subject: string;
  attributeKeys: string[];
  intent: UserIntent;
  note?: string;
  imageId?: string;
  imageSrc?: string;
  analysis?: ArchiveImageAnalysis;
  reviewedCandidateIds?: string[];
  createdAt: string;
};

export type FlowInvalidation = {
  fromStep: ExplorationStep;
  invalidatedSteps: ExplorationStep[];
  reason: string;
  createdAt: string;
};

export type AnalysisEventName =
  | "session_started"
  | "visual_sample_answered"
  | "borrowed_element_selected"
  | "stable_clue_rejected"
  | "archive_image_uploaded"
  | "archive_observation_confirmed"
  | "archive_observation_rejected"
  | "archive_observation_modified"
  | "lab_outfit_rejected"
  | "lab_element_replaced"
  | "wearing_intent_changed"
  | "style_system_generated"
  | "result_feedback_submitted"
  | "continuous_tool_opened"
  | "continuous_tool_submitted";

export type AnalysisEvent = {
  id: string;
  eventName: AnalysisEventName;
  sessionId: string;
  step: ExplorationStep | "continuous-tool";
  payload: Record<string, unknown>;
  createdAt: string;
};

export type StyleSession = {
  version: 3;
  inferenceVersion: "evidence-v1";
  id: string;
  status: "collecting" | "ready" | "completed";
  activeStep: ExplorationStep;
  visualSampling: VisualSamplingState;
  archiveDecode: ArchiveDecodeState;
  styleLab: StyleLabState;
  styleSystem: {
    status: StepStatus;
    output: StyleSystemOutput | null;
    corrections: StyleStatementCorrection[];
  };
  activity: {
    lastEntry?: ContinuousEntry;
    checkInCount: number;
    records: ContinuousToolRecord[];
  };
  flow: {
    lastInvalidation?: FlowInvalidation;
  };
  createdAt: string;
  updatedAt: string;
};

// Legacy report types remain only for the separate historical report preview.
export type StyleDimensionKey =
  | "structure"
  | "relaxation"
  | "colorExpression"
  | "decoration"
  | "vintage"
  | "experimentation"
  | "comfortPriority"
  | "attentionTolerance";
export type StyleDimension = { key: StyleDimensionKey; label: string; value: number; description: string };
export type StyleKeyword = { name: string; explanation: string };
export type StyleEvidence = { metric: string; observation: string };
export type StyleZone = { type: "comfort" | "extension" | "experiment"; eyebrow: string; title: string; summary: string; suggestions: string[] };
export type StyleReport = {
  id: string;
  summary: string;
  descriptors: string[];
  dimensions: StyleDimension[];
  keywords: StyleKeyword[];
  evidence: StyleEvidence[];
  zones: StyleZone[];
  palette: { name: string; hex: string }[];
  shoppingFilters: { prioritize: string[]; beCarefulWith: string[] };
  searchKeywords: string[];
  firstExperiment: string;
};

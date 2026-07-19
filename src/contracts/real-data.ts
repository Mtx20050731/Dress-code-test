import type {
  ArchiveIntent,
  AttributeDimension,
  BorrowableElement,
} from "@/types/style";

export const REAL_DATA_CONTRACT_VERSION = "2026-07-15" as const;

export type ContractMeta = {
  contractVersion: typeof REAL_DATA_CONTRACT_VERSION;
  requestId: string;
  sessionId: string;
  idempotencyKey: string;
  submittedAt: string;
  locale: string;
  timezone: string;
};

export type DataConsent = {
  receiptId: string;
  policyVersion: string;
  acceptedAt: string;
  allowedPurposes: MediaPurpose[];
  modelTrainingOptIn: boolean;
};

export type ContractErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MEDIA"
  | "PAYLOAD_TOO_LARGE"
  | "UPLOAD_EXPIRED"
  | "ASSET_NOT_FOUND"
  | "ANALYSIS_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "CONTRACT_MISMATCH";

export type ContractError = {
  code: ContractErrorCode;
  message: string;
  retryable: boolean;
  field?: string;
  details?: Record<string, unknown>;
};

export type ContractSuccess<T> = {
  ok: true;
  data: T;
  meta: {
    contractVersion: typeof REAL_DATA_CONTRACT_VERSION;
    requestId: string;
    processedAt: string;
  };
};

export type ContractFailure = {
  ok: false;
  error: ContractError;
  meta: {
    contractVersion: typeof REAL_DATA_CONTRACT_VERSION;
    requestId: string;
    processedAt: string;
  };
};

export type ContractResult<T> = ContractSuccess<T> | ContractFailure;

export type MediaPurpose =
  | "archive-reference"
  | "outfit-check-in"
  | "garment-analysis"
  | "wardrobe-item";

export type MediaAsset = {
  id: string;
  ownerSessionId: string;
  purpose: MediaPurpose;
  status: "pending-upload" | "ready" | "deleted" | "quarantined";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  originalUrl: string;
  thumbnailUrl?: string;
  access: "private";
  createdAt: string;
  expiresAt?: string;
};

export type CreateImageUploadRequest = {
  meta: ContractMeta;
  consent: DataConsent;
  file: {
    name: string;
    mimeType: MediaAsset["mimeType"];
    byteSize: number;
    sha256: string;
    purpose: MediaPurpose;
  };
};

export type CreateImageUploadResponse = {
  assetId: string;
  uploadUrl: string;
  uploadMethod: "PUT";
  requiredHeaders: Record<string, string>;
  expiresAt: string;
  maxByteSize: number;
};

export type CompleteImageUploadRequest = {
  meta: ContractMeta;
  assetId: string;
  observed: {
    byteSize: number;
    width: number;
    height: number;
    sha256: string;
  };
};

export type ImageRegion = {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selectedElement?: BorrowableElement;
  userNote?: string;
};

export type ImageAnalysisInput = {
  imageId: string;
  imageUrl: string;
  sourceType:
    | "user-archive"
    | "visual-sampling"
    | "garment-item"
    | "outfit-check-in";
  expectedContent:
    | "full-outfit"
    | "single-garment"
    | "detail"
    | "unknown";
};

export type AnalysisStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "needs-review"
  | "failed";

export type ReviewStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "modified";

export type ImageObservationReview =
  | { status: "pending" }
  | { status: "confirmed" | "rejected"; reviewedAt: string }
  | {
      status: "modified";
      reviewedAt: string;
      editedTitle: string;
      editedAttributeIds: string[];
    };

export type NormalizedImageRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageObservation<TValue extends string = string> = {
  id: string;
  value: TValue;
  normalizedKey: string | null;
  confidence: number;
  regionIds: string[];
  rationale: string;
  reviewStatus: ReviewStatus;
};

export type PersonDetection = {
  id: string;
  regionId: string;
  confidence: number;
};

export type GarmentCategory =
  | "outerwear"
  | "top"
  | "shirt"
  | "knitwear"
  | "dress"
  | "skirt"
  | "trousers"
  | "shorts"
  | "denim"
  | "jumpsuit"
  | "footwear"
  | "bag"
  | "accessory"
  | "unknown";

export type GarmentDetection = {
  id: string;
  personId: string | null;
  regionId: string;
  category: ImageObservation<GarmentCategory>;
  colors: ImageObservation[];
  silhouettes: ImageObservation[];
  materials: ImageObservation[];
};

export type OutfitComposition = {
  proportions: ImageObservation[];
  stylingRelations: ImageObservation[];
};

export type AnalysisUncertainty = {
  id: string;
  reason:
    | "occluded"
    | "low-resolution"
    | "ambiguous-category"
    | "ambiguous-material"
    | "multiple-people"
    | "out-of-frame"
    | "other";
  description: string;
  regionIds: string[];
  relatedObservationIds: string[];
};

export type ImageAnalysisResult = {
  schemaVersion: "image-analysis-v1";
  imageId: string;
  status: Extract<AnalysisStatus, "completed" | "partial" | "needs-review">;
  regions: NormalizedImageRegion[];
  peopleCount: number;
  people: PersonDetection[];
  garments: GarmentDetection[];
  outfit: OutfitComposition;
  uncertainties: AnalysisUncertainty[];
  providerTrace: ProviderTrace;
};

export type ArchiveImageInput = {
  assetId: string;
  intent: ArchiveIntent;
  selectedRegions: ImageRegion[];
};

export type StartArchiveDecodeRequest = {
  meta: ContractMeta;
  consentReceiptId: string;
  images: ArchiveImageInput[];
  requestedDimensions: AttributeDimension[];
};

export type AnalysisKind =
  | "archive-decode"
  | "garment-analysis"
  | "outfit-check-in"
  | "background-removal";

export type AnalysisJobRef = {
  jobId: string;
  kind: AnalysisKind;
  status: AnalysisStatus;
  submittedAt: string;
  pollAfterMs: number;
};

export type ProviderTrace = {
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  completedAt: string;
  processingMs: number;
};

export type AttributeCandidate = {
  attributeKey: string;
  dimension: AttributeDimension;
  extractionConfidence: number;
  sourceAssetIds: string[];
  sourceRegionIds: string[];
  rationale: string;
};

export type ArchiveClusterProposal = {
  id: string;
  title: string;
  sourceAssetIds: string[];
  candidates: AttributeCandidate[];
};

export type ArchiveObservationProposal = {
  id: string;
  dimension: AttributeDimension;
  title: string;
  description: string;
  sourceAssetIds: string[];
  candidates: AttributeCandidate[];
  requiresUserReview: true;
};

export type ArchiveDecodeResult = {
  kind: "archive-decode";
  jobId: string;
  inputAssetIds: string[];
  clusters: ArchiveClusterProposal[];
  observations: ArchiveObservationProposal[];
  warnings: string[];
  providerTrace: ProviderTrace;
};

export type AnalysisJob<T> = {
  jobId: string;
  kind: AnalysisKind;
  status: AnalysisStatus;
  submittedAt: string;
  updatedAt: string;
  result?: T;
  error?: ContractError;
};

export type GetAnalysisJobRequest = {
  meta: ContractMeta;
  jobId: string;
};

export type DeleteMediaRequest = {
  meta: ContractMeta;
  assetId: string;
  reason: "user-request" | "session-expired" | "replaced";
};

export type DeleteMediaResponse = {
  assetId: string;
  deletedAt: string;
};

export type ArchiveDecodeJob = AnalysisJob<ArchiveDecodeResult>;

import {
  REAL_DATA_CONTRACT_VERSION,
  type AnalysisJobRef,
  type ArchiveDecodeJob,
  type ArchiveDecodeResult,
  type AttributeCandidate,
  type CompleteImageUploadRequest,
  type ContractResult,
  type CreateImageUploadRequest,
  type CreateImageUploadResponse,
  type DeleteMediaRequest,
  type DeleteMediaResponse,
  type GetAnalysisJobRequest,
  type MediaAsset,
  type StartArchiveDecodeRequest,
} from "../../contracts/real-data";
import type { AttributeDimension } from "../../types/style";
import type { RealDataGateway } from "./real-data-gateway";

const defaultAttributeByDimension: Record<AttributeDimension, string> = {
  color: "color-neutral-low",
  silhouette: "silhouette-clean",
  material: "material-textured",
  proportion: "proportion-balanced",
  ornament: "ornament-reduced",
  stylingRelation: "styling-one-focus",
  accessory: "accessory-quiet",
  mood: "mood-composed",
};

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

export class MockRealDataGateway implements RealDataGateway {
  private readonly assets = new Map<string, MediaAsset>();
  private readonly jobs = new Map<string, ArchiveDecodeJob>();
  private readonly idempotentResults = new Map<string, ContractResult<unknown>>();

  private success<T>(requestId: string, processedAt: string, data: T): ContractResult<T> {
    return { ok: true, data, meta: { contractVersion: REAL_DATA_CONTRACT_VERSION, requestId, processedAt } };
  }

  private remember<T>(key: string, create: () => ContractResult<T>): ContractResult<T> {
    const existing = this.idempotentResults.get(key);
    if (existing) return existing as ContractResult<T>;
    const result = create();
    this.idempotentResults.set(key, result as ContractResult<unknown>);
    return result;
  }

  async createImageUpload(request: CreateImageUploadRequest): Promise<ContractResult<CreateImageUploadResponse>> {
    return this.remember(`create:${request.meta.idempotencyKey}`, () => {
      const assetId = `asset-${safeId(request.meta.idempotencyKey)}`;
      return this.success(request.meta.requestId, request.meta.submittedAt, {
        assetId,
        uploadUrl: `mock://private-upload/${assetId}`,
        uploadMethod: "PUT",
        requiredHeaders: { "content-type": request.file.mimeType },
        expiresAt: request.meta.submittedAt,
        maxByteSize: 12 * 1024 * 1024,
      });
    });
  }

  async completeImageUpload(request: CompleteImageUploadRequest): Promise<ContractResult<MediaAsset>> {
    return this.remember(`complete:${request.meta.idempotencyKey}`, () => {
      const asset: MediaAsset = {
        id: request.assetId,
        ownerSessionId: request.meta.sessionId,
        purpose: "archive-reference",
        status: "ready",
        mimeType: "image/jpeg",
        byteSize: request.observed.byteSize,
        width: request.observed.width,
        height: request.observed.height,
        sha256: request.observed.sha256,
        originalUrl: `mock://private/${request.assetId}`,
        thumbnailUrl: `mock://private/${request.assetId}/thumbnail`,
        access: "private",
        createdAt: request.meta.submittedAt,
      };
      this.assets.set(asset.id, asset);
      return this.success(request.meta.requestId, request.meta.submittedAt, asset);
    });
  }

  async deleteMedia(request: DeleteMediaRequest): Promise<ContractResult<DeleteMediaResponse>> {
    return this.remember(`delete:${request.meta.idempotencyKey}`, () => {
      this.assets.delete(request.assetId);
      return this.success(request.meta.requestId, request.meta.submittedAt, {
        assetId: request.assetId,
        deletedAt: request.meta.submittedAt,
      });
    });
  }

  async startArchiveDecode(request: StartArchiveDecodeRequest): Promise<ContractResult<AnalysisJobRef>> {
    return this.remember(`decode:${request.meta.idempotencyKey}`, () => {
      const jobId = `job-${safeId(request.meta.idempotencyKey)}`;
      const assetIds = request.images.map((image) => image.assetId);
      const candidates: AttributeCandidate[] = request.requestedDimensions.map((dimension) => ({
        attributeKey: defaultAttributeByDimension[dimension],
        dimension,
        extractionConfidence: 0.72,
        sourceAssetIds: assetIds,
        sourceRegionIds: request.images.flatMap((image) => image.selectedRegions.map((region) => region.id)),
        rationale: `Mock 仅表示 ${dimension} 维度的机器观察候选，等待用户确认。`,
      }));
      const result: ArchiveDecodeResult = {
        kind: "archive-decode",
        jobId,
        inputAssetIds: assetIds,
        clusters: [{ id: `${jobId}-cluster`, title: "待确认的重复线索", sourceAssetIds: assetIds, candidates }],
        observations: candidates.map((candidate) => ({
          id: `${jobId}-observation-${candidate.dimension}`,
          dimension: candidate.dimension,
          title: `${candidate.dimension} 的待确认观察`,
          description: "这是机器提议，不会在用户确认前写入正向画像。",
          sourceAssetIds: candidate.sourceAssetIds,
          candidates: [candidate],
          requiresUserReview: true,
        })),
        warnings: [],
        providerTrace: {
          provider: "local-mock",
          model: "deterministic-fixture",
          modelVersion: "1",
          promptVersion: "archive-decode-v1",
          completedAt: request.meta.submittedAt,
          processingMs: 0,
        },
      };
      this.jobs.set(jobId, {
        jobId,
        kind: "archive-decode",
        status: "completed",
        submittedAt: request.meta.submittedAt,
        updatedAt: request.meta.submittedAt,
        result,
      });
      return this.success(request.meta.requestId, request.meta.submittedAt, {
        jobId,
        kind: "archive-decode",
        status: "queued",
        submittedAt: request.meta.submittedAt,
        pollAfterMs: 0,
      });
    });
  }

  async getArchiveDecodeJob(request: GetAnalysisJobRequest): Promise<ContractResult<ArchiveDecodeJob>> {
    const job = this.jobs.get(request.jobId);
    if (!job) {
      return {
        ok: false,
        error: { code: "ASSET_NOT_FOUND", message: "分析任务不存在", retryable: false, field: "jobId" },
        meta: { contractVersion: REAL_DATA_CONTRACT_VERSION, requestId: request.meta.requestId, processedAt: request.meta.submittedAt },
      };
    }
    return this.success(request.meta.requestId, request.meta.submittedAt, job);
  }
}

import type {
  AnalysisJobRef,
  ArchiveDecodeJob,
  CompleteImageUploadRequest,
  ContractResult,
  CreateImageUploadRequest,
  CreateImageUploadResponse,
  DeleteMediaRequest,
  DeleteMediaResponse,
  GetAnalysisJobRequest,
  MediaAsset,
  StartArchiveDecodeRequest,
} from "@/contracts/real-data";

export interface RealDataGateway {
  createImageUpload(request: CreateImageUploadRequest): Promise<ContractResult<CreateImageUploadResponse>>;
  completeImageUpload(request: CompleteImageUploadRequest): Promise<ContractResult<MediaAsset>>;
  deleteMedia(request: DeleteMediaRequest): Promise<ContractResult<DeleteMediaResponse>>;
  startArchiveDecode(request: StartArchiveDecodeRequest): Promise<ContractResult<AnalysisJobRef>>;
  getArchiveDecodeJob(request: GetAnalysisJobRequest): Promise<ContractResult<ArchiveDecodeJob>>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpRealDataGateway implements RealDataGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<ContractResult<T>> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json() as Promise<ContractResult<T>>;
  }

  createImageUpload(request: CreateImageUploadRequest) {
    return this.post<CreateImageUploadResponse>("/v1/media/uploads", request);
  }

  completeImageUpload(request: CompleteImageUploadRequest) {
    return this.post<MediaAsset>(`/v1/media/${encodeURIComponent(request.assetId)}/complete`, request);
  }

  deleteMedia(request: DeleteMediaRequest) {
    return this.post<DeleteMediaResponse>(`/v1/media/${encodeURIComponent(request.assetId)}/delete`, request);
  }

  startArchiveDecode(request: StartArchiveDecodeRequest) {
    return this.post<AnalysisJobRef>("/v1/analyses/archive-decode", request);
  }

  getArchiveDecodeJob(request: GetAnalysisJobRequest) {
    return this.post<ArchiveDecodeJob>(`/v1/analysis-jobs/${encodeURIComponent(request.jobId)}/read`, request);
  }
}

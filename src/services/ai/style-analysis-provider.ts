import type {
  AnalysisJobRef,
  ArchiveDecodeJob,
  ContractResult,
  GetAnalysisJobRequest,
  StartArchiveDecodeRequest,
} from "@/contracts/real-data";

/**
 * AI 只负责生成可复核的视觉观察候选。
 * 最终 TasteStatement、EvidenceRef 和 StyleSystemOutput 仍由本地证据引擎生成。
 */
export interface StyleAnalysisProvider {
  startArchiveDecode(request: StartArchiveDecodeRequest): Promise<ContractResult<AnalysisJobRef>>;
  getArchiveDecodeJob(request: GetAnalysisJobRequest): Promise<ContractResult<ArchiveDecodeJob>>;
}

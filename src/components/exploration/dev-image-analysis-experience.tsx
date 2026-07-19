"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import type { ImageAnalysisResultV1 } from "@/contracts/image-analysis-schema";
import type { ImageAnalysisInput } from "@/contracts/real-data";
import { attributeTokens } from "@/data/style-exploration-mock";
import {
  candidateObservationsToEvidence,
  reviewCandidateObservation,
  type CandidateObservation,
} from "@/features/image-analysis/candidate-observations";
import { calculateConfidence, groupEvidenceByAttribute } from "@/features/exploration/mock-engine";
import type { EvidenceRef, UserIntent } from "@/types/style";

type ProviderName = "mock" | "qwen" | "openai";
type SuccessfulResponse = {
  ok: true;
  result: ImageAnalysisResultV1;
  candidateObservations: CandidateObservation[];
  schemaValidation: { success: true; schemaVersion: string };
  providerSelection: { requestedProvider: ProviderName; effectiveProvider: ProviderName; fallbackReason: string | null };
};
type FailedResponse = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  validation?: unknown;
  providerSelection?: { requestedProvider: ProviderName; effectiveProvider: ProviderName; fallbackReason: string | null };
};
type ApiResponse = SuccessfulResponse | FailedResponse;

const intentOptions: Array<{ value: UserIntent; label: string }> = [
  { value: "want-to-wear", label: "想穿" },
  { value: "admire-only", label: "只欣赏" },
  { value: "borrow-element", label: "只借元素" },
  { value: "uninterested", label: "无感" },
  { value: "reject", label: "明确不喜欢" },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function DevImageAnalysisExperience() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderName>("mock");
  const [expectedContent, setExpectedContent] = useState<ImageAnalysisInput["expectedContent"]>("full-outfit");
  const [intent, setIntent] = useState<UserIntent>("want-to-wear");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [candidates, setCandidates] = useState<CandidateObservation[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const evidence = useMemo<EvidenceRef[]>(() => candidateObservationsToEvidence({
    observations: candidates,
    intent,
    selectedCandidateIds,
    createdAt: "2026-07-15T00:00:00.000Z",
  }), [candidates, intent, selectedCandidateIds]);

  const recalculatedEvidence = useMemo(() => groupEvidenceByAttribute(evidence).map((group) => ({
    attributeKey: group.attributeKey,
    ...calculateConfidence(group, "core"),
  })), [evidence]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
    setResponse(null);
    setCandidates([]);
    setSelectedCandidateIds([]);
  }

  async function analyze(force = false) {
    if (!file) return;
    setLoading(true);
    setResponse(null);
    try {
      const imageUrl = await readFileAsDataUrl(file);
      const imageId = `dev-${file.name}-${file.size}-${file.lastModified}`.replace(/[^a-zA-Z0-9-_]/g, "-");
      const input: ImageAnalysisInput = { imageId, imageUrl, sourceType: "user-archive", expectedContent };
      const request = await fetch("/api/dev/image-analysis", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `${imageId}:${provider}` },
        body: JSON.stringify({ input, requestedProvider: provider, force }),
      });
      const data = await request.json() as ApiResponse;
      setResponse(data);
      setCandidates(data.ok ? data.candidateObservations : []);
      setSelectedCandidateIds([]);
    } catch {
      setResponse({ ok: false, error: { code: "connection", message: "无法连接开发分析接口。", retryable: true } });
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  function reviewCandidate(id: string, status: CandidateObservation["reviewStatus"]) {
    setCandidates((current) => current.map((item) => item.id === id
      ? reviewCandidateObservation(item, {
          status,
          editedValue: status === "modified" ? item.editedValue ?? item.value : undefined,
          editedAttributeKey: status === "modified" ? item.editedAttributeKey ?? item.attributeKey ?? undefined : undefined,
        })
      : item));
  }

  function editCandidate(id: string, editedAttributeKey: string) {
    setCandidates((current) => current.map((item) => item.id === id
      ? reviewCandidateObservation(item, { status: "modified", editedValue: item.editedValue ?? item.value, editedAttributeKey: editedAttributeKey || undefined })
      : item));
  }

  async function clearAnalysis() {
    const imageId = file ? `dev-${file.name}-${file.size}-${file.lastModified}`.replace(/[^a-zA-Z0-9-_]/g, "-") : "";
    await fetch(`/api/dev/image-analysis?imageId=${encodeURIComponent(imageId)}`, { method: "DELETE" });
    setResponse(null);
    setCandidates([]);
    setSelectedCandidateIds([]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
  }

  return (
    <main className="dev-analysis-page">
      <header>
        <p className="kicker">DEVELOPMENT ONLY · VISION VALIDATION</p>
        <h1>真实图片观察验证台</h1>
        <p>这里只验证模型看见了什么。结果不会写入 StyleSession，也不会生成个人风格结论。</p>
      </header>

      <section className="dev-analysis-controls">
        <label>单张图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} /></label>
        <label>Provider<select value={provider} onChange={(event) => setProvider(event.target.value as ProviderName)}><option value="mock">Mock</option><option value="qwen">Qwen（国内）</option><option value="openai">OpenAI</option></select></label>
        <label>预期内容<select value={expectedContent} onChange={(event) => setExpectedContent(event.target.value as ImageAnalysisInput["expectedContent"])}><option value="full-outfit">完整穿搭</option><option value="single-garment">单件服装</option><option value="detail">服装局部</option><option value="unknown">未知</option></select></label>
        <button type="button" disabled={!file || loading} onClick={() => analyze(false)}>{loading ? "分析中…" : "开始分析"}</button>
        <button type="button" disabled={!file || loading} onClick={() => analyze(true)}>重新分析</button>
        <button type="button" disabled={!response} onClick={clearAnalysis}>删除结果</button>
      </section>

      {previewUrl && <section><h2>原图</h2><div className="dev-analysis-preview" role="img" aria-label={file?.name ?? "上传图片"} style={{ backgroundImage: `url("${previewUrl}")` }} /></section>}

      {response && !response.ok && <section className="dev-analysis-error"><h2>分析未写入</h2><p>{response.error.message}</p><small>{response.error.code} · {response.error.retryable ? "可以重试" : "请检查输入或配置"}</small>{response.validation !== undefined && <pre>{JSON.stringify(response.validation, null, 2)}</pre>}</section>}

      {response?.providerSelection && <section><h2>Provider 状态</h2><dl><div><dt>请求</dt><dd>{response.providerSelection.requestedProvider}</dd></div><div><dt>实际</dt><dd>{response.providerSelection.effectiveProvider}</dd></div><div><dt>回退原因</dt><dd>{response.providerSelection.fallbackReason ?? "无"}</dd></div></dl></section>}

      {response?.ok && <>
        <section><h2>Schema 校验</h2><p>✓ {response.schemaValidation.schemaVersion} 有效</p><dl><div><dt>provider</dt><dd>{response.result.providerMetadata.provider}</dd></div><div><dt>model</dt><dd>{response.result.providerMetadata.model}</dd></div><div><dt>promptVersion</dt><dd>{response.result.providerMetadata.promptVersion}</dd></div><div><dt>latency</dt><dd>{response.result.providerMetadata.latencyMs} ms</dd></div><div><dt>repair</dt><dd>{response.result.providerMetadata.repairAttempted ? "执行过一次" : "未执行"}</dd></div></dl></section>
        <section><h2>原始结构化模型输出</h2><pre>{JSON.stringify(response.result, null, 2)}</pre></section>
      </>}

      {candidates.length > 0 && <section><div className="dev-analysis-section-heading"><div><h2>候选观察</h2><p>确认只表示观察正确；是否形成偏好证据还取决于图片意图。</p></div><label>图片意图<select value={intent} onChange={(event) => setIntent(event.target.value as UserIntent)}>{intentOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="dev-candidate-list">{candidates.map((item) => <article key={item.id}><div><small>{item.attributeName} · confidence {item.confidence.toFixed(2)}</small><h3>{item.editedValue ?? item.value}</h3><p>{item.rationale}</p><code>{item.editedAttributeKey ?? item.attributeKey ?? "待探索 / 不转证据"}</code></div><div className="dev-review-actions"><button className={item.reviewStatus === "confirmed" ? "active" : ""} type="button" onClick={() => reviewCandidate(item.id, "confirmed")}>确认</button><button className={item.reviewStatus === "rejected" ? "active" : ""} type="button" onClick={() => reviewCandidate(item.id, "rejected")}>否认</button><button className={item.reviewStatus === "modified" ? "active" : ""} type="button" onClick={() => reviewCandidate(item.id, "modified")}>修改</button>{intent === "borrow-element" && <label><input type="checkbox" checked={selectedCandidateIds.includes(item.id)} onChange={(event) => setSelectedCandidateIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />选中元素</label>}</div>{item.reviewStatus === "modified" && <select aria-label="修改后的标准属性" value={item.editedAttributeKey ?? ""} onChange={(event) => editCandidate(item.id, event.target.value)}><option value="">待探索 / 不生成证据</option>{attributeTokens.filter((token) => item.dimension !== "garmentCategory" && token.dimension === item.dimension).map((token) => <option key={token.id} value={token.id}>{token.label}</option>)}</select>}</article>)}</div></section>}

      {candidates.length > 0 && <section><h2>复核后 EvidenceRef</h2><p>{evidence.length ? `${evidence.length} 条证据，仅展示，不写入当前用户会话。` : "尚无可转换证据。pending、否认、unknown 和未选中的借用元素都会被过滤。"}</p><pre>{JSON.stringify(evidence, null, 2)}</pre><h3>本地证据引擎重算</h3><p>单次图片证据不会被误判为稳定偏好；证据不足时应保持 unresolved。</p><pre>{JSON.stringify(recalculatedEvidence, null, 2)}</pre></section>}
    </main>
  );
}

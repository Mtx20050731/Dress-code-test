"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ContinuousToolTracker } from "@/components/exploration/continuous-tool-tracker";
import { attributeTokens, dimensionLabels } from "@/data/style-exploration-mock";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { addContinuousToolRecord } from "@/features/exploration/mock-engine";
import { analyzeImageInBrowser } from "@/features/image-analysis/browser-client";
import { reviewCandidateObservation } from "@/features/image-analysis/candidate-observations";
import { persistMedia, readPersistentSession, saveSession } from "@/features/session/session-storage";
import type { ArchiveImageAnalysis, ContinuousEntry, StyleSession, UserIntent } from "@/types/style";

const configurations: Record<ContinuousEntry, { eyebrow: string; title: string; description: string; subjectLabel: string; submitLabel: string; acceptsImage: boolean }> = {
  "analyze-item": { eyebrow: "ANALYZE AN ITEM", title: "分析一件衣服", description: "记录这件衣服真正吸引或阻碍你的属性，并把明确意愿加入持续证据。", subjectLabel: "这件衣服是什么？", submitLabel: "记录这件衣服", acceptsImage: true },
  "translate-trend": { eyebrow: "TRANSLATE A TREND", title: "把趋势翻译成我的版本", description: "写下趋势名称，只选择你想借用的一个属性，不把趋势名写进个人画像。", subjectLabel: "想翻译的趋势", submitLabel: "保存我的翻译变量", acceptsImage: true },
  "wardrobe-experiment": { eyebrow: "USE MY WARDROBE", title: "使用现有衣服完成风格实验", description: "记录一次只改变一个变量的衣橱实验，以及改变后的穿着意愿。", subjectLabel: "这次实验改变了什么？", submitLabel: "记录衣橱实验", acceptsImage: true },
  "outfit-check-in": { eyebrow: "OUTFIT CHECK-IN", title: "上传近期穿搭并修正画像", description: "真实穿着反馈会作为持续证据重新计算画像，但仍由你明确选择它代表什么。", subjectLabel: "这次穿搭的场景", submitLabel: "加入近期穿搭证据", acceptsImage: true },
};

const intentOptions: Array<{ value: UserIntent; label: string }> = [
  { value: "want-to-wear", label: "真实愿意穿" },
  { value: "admire-only", label: "只欣赏" },
  { value: "borrow-element", label: "只借这个元素" },
  { value: "uninterested", label: "无感" },
  { value: "reject", label: "明确拒绝" },
];

export function ContinuousToolExperience({ tool }: { tool: ContinuousEntry }) {
  const config = configurations[tool];
  const [session, setSession] = useState<StyleSession | null>(null);
  const [subject, setSubject] = useState("");
  const [attributeKey, setAttributeKey] = useState(attributeTokens[0].id);
  const [intent, setIntent] = useState<UserIntent>(tool === "translate-trend" ? "borrow-element" : "want-to-wear");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<ArchiveImageAnalysis | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void readPersistentSession().then(setSession); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const history = useMemo(() => session?.activity.records.filter((record) => record.tool === tool).slice().reverse() ?? [], [session, tool]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
    setAnalysis(null);
    setManualOnly(false);
  }

  async function analyzeSelectedImage(useMock = false) {
    if (!file || analysisBusy) return;
    setAnalysisBusy(true);
    const result = await analyzeImageInBrowser({
      imageId: `continuous-preview:${tool}:${file.lastModified}`,
      blob: file,
      sourceType: tool === "analyze-item" ? "garment-item" : "outfit-check-in",
      expectedContent: tool === "analyze-item" ? "single-garment" : "full-outfit",
      useMock,
      force: true,
    });
    setAnalysis(result);
    setAnalysisBusy(false);
  }

  function reviewCandidate(candidateId: string, status: "confirmed" | "rejected" | "modified") {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      candidates: analysis.candidates.map((candidate) => candidate.id !== candidateId ? candidate : reviewCandidateObservation(candidate, {
        status,
        editedValue: status === "modified" ? attributeTokens.find((token) => token.id === attributeKey)?.label : undefined,
        editedAttributeKey: status === "modified" ? attributeKey : undefined,
      })),
    });
  }

  async function submit() {
    if (!session?.styleSystem.output || !subject.trim()) return;
    const createdAt = new Date().toISOString();
    const id = `continuous:${tool}:${createdAt}`;
    const imageId = file ? `${id}:image` : undefined;
    if (file && imageId) await persistMedia(imageId, file);
    const reviewedCandidates = analysis?.candidates.filter((candidate) => (candidate.reviewStatus === "confirmed" || candidate.reviewStatus === "modified") && !candidate.isUncertain) ?? [];
    const reviewedKeys = [...new Set(reviewedCandidates.map((candidate) => candidate.reviewStatus === "modified" ? candidate.editedAttributeKey : candidate.attributeKey).filter(Boolean))] as string[];
    const record = {
      id,
      tool,
      subject: subject.trim(),
      attributeKeys: file && !manualOnly ? reviewedKeys : [attributeKey],
      intent,
      note: note.trim() || undefined,
      imageId,
      imageSrc: preview ?? undefined,
      analysis: analysis ?? undefined,
      reviewedCandidateIds: reviewedCandidates.map((candidate) => candidate.id),
      createdAt,
    };
    const next = saveSession(addContinuousToolRecord(session, record));
    setSession(next);
    appendAnalysisEvent({ eventName: "continuous_tool_submitted", sessionId: session.id, step: "continuous-tool", payload: { tool, recordId: id, attributeKey, intent }, createdAt });
    setMessage("已加入持续证据，个人风格系统已重新计算。");
    setSubject("");
    setNote("");
    setFile(null);
    setPreview(null);
    setAnalysis(null);
    setManualOnly(false);
  }

  if (!session) return <div className="page-shell inner-page"><p>正在恢复你的风格系统…</p></div>;
  if (!session.styleSystem.output) return <div className="page-shell inner-page studio-placeholder"><p className="kicker">CONTINUOUS TOOL</p><h1>请先完成四步主流程</h1><p>持续工具需要已有的个人风格系统作为参照。</p><Link className="button button-primary" href="/explore">返回探索流程</Link></div>;

  const selectedToken = attributeTokens.find((token) => token.id === attributeKey)!;
  const reviewableCandidates = analysis?.candidates.filter((candidate) => candidate.attributeKey && candidate.dimension !== "garmentCategory" && !candidate.isUncertain) ?? [];
  const reviewedCandidateCount = reviewableCandidates.filter((candidate) => candidate.reviewStatus === "confirmed" || candidate.reviewStatus === "modified").length;
  const canSubmit = Boolean(subject.trim()) && (!file || manualOnly || reviewedCandidateCount > 0);
  return (
    <div className="page-shell inner-page continuous-tool-page">
      <ContinuousToolTracker tool={tool} />
      <Link className="back-link" href="/explore/style-system">← 返回个人风格系统</Link>
      <header className="evidence-heading"><p className="kicker">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></header>

      <section className="continuous-tool-form">
        {config.acceptsImage && <label>参考图片（可选）<input type="file" accept="image/*" onChange={selectFile} /></label>}
        {preview && <div className="continuous-preview" role="img" aria-label="本次记录图片" style={{ backgroundImage: `url("${preview}")` }} />}
        {file && <div className="continuous-analysis-actions"><button type="button" disabled={analysisBusy} onClick={() => void analyzeSelectedImage(false)}>{analysisBusy ? "正在分析…" : analysis ? "重新分析图片" : "分析图片中的可见属性"}</button>{analysis?.status === "failed" && <button type="button" onClick={() => void analyzeSelectedImage(true)}>使用 Mock 示例观察</button>}<button type="button" className={manualOnly ? "active" : ""} onClick={() => setManualOnly(!manualOnly)}>只使用我手动选择的属性</button></div>}
        {analysis?.fallbackReason && <p className="fallback-note">真实模型配置不可用，本次显示的是 Mock 示例观察；仍需你确认后才会进入证据。</p>}
        {analysis?.status === "failed" && <p role="alert">{analysis.error?.message}</p>}
        {!manualOnly && reviewableCandidates.length > 0 && <div className="continuous-candidate-list"><strong>逐条确认图片观察</strong><p>模型置信度只用于说明“看得清不清”，不会直接变成你的偏好置信度。</p>{reviewableCandidates.map((candidate) => <article key={candidate.id}><div><small>{candidate.attributeName} · {Math.round(candidate.confidence * 100)}% 可见把握</small><b>{attributeTokens.find((token) => token.id === candidate.attributeKey)?.label ?? candidate.value}</b><span>{candidate.rationale}</span></div><div><button className={candidate.reviewStatus === "confirmed" ? "active" : ""} type="button" onClick={() => reviewCandidate(candidate.id, "confirmed")}>确认</button><button className={candidate.reviewStatus === "rejected" ? "active" : ""} type="button" onClick={() => reviewCandidate(candidate.id, "rejected")}>否认</button><button className={candidate.reviewStatus === "modified" ? "active" : ""} type="button" onClick={() => reviewCandidate(candidate.id, "modified")}>改为下方手选属性</button></div></article>)}</div>}
        <label>{config.subjectLabel}<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="用自己的话记录" /></label>
        <label>这次最关键的属性<select value={attributeKey} onChange={(event) => setAttributeKey(event.target.value)}>{attributeTokens.map((token) => <option value={token.id} key={token.id}>{dimensionLabels[token.dimension]} · {token.label}</option>)}</select></label>
        <div><span>你与这个属性的关系</span><div className="wear-decision">{intentOptions.map((option) => <button className={intent === option.value ? "active" : ""} type="button" key={option.value} onClick={() => setIntent(option.value)}>{option.label}</button>)}</div></div>
        <label>补充说明（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：只在通勤时介意正式度" /></label>
        <div className="journey-note"><strong>本次会写入</strong><p>{selectedToken.label} · {intentOptions.find((option) => option.value === intent)?.label}。趋势名称或场景名称不会直接变成风格标签。</p></div>
        <button className="button button-primary" type="button" disabled={!canSubmit} onClick={submit}>{config.submitLabel} <span>→</span></button>
        <p role="status">{message}</p>
      </section>

      <section className="continuous-history"><p className="kicker">LOCAL HISTORY</p><h2>本工具最近记录</h2>{history.length ? history.map((record) => <article key={record.id}>{record.imageSrc && <span role="img" aria-label={record.subject} style={{ backgroundImage: `url("${record.imageSrc}")` }} />}<div><strong>{record.subject}</strong><p>{record.attributeKeys.map((key) => attributeTokens.find((token) => token.id === key)?.label ?? key).join(" / ")}</p><small>{record.intent} · {record.createdAt}</small></div></article>) : <p>还没有记录。</p>}</section>
    </div>
  );
}

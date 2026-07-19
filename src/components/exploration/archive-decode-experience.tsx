"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, MouseEvent, useEffect, useState } from "react";
import { JourneyProgress } from "@/components/journey-progress";
import { FlowInvalidationNotice } from "@/components/exploration/flow-invalidation-notice";
import { archiveIntentLabels, attributeTokens, dimensionLabels, makeSampleArchive } from "@/data/style-exploration-mock";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { collectArchiveEvidence, describeArchiveCorrection, generateStyleSystemOutput } from "@/features/exploration/mock-engine";
import { buildArchiveReviewModel, replaceAnalysisRecord } from "@/features/image-analysis/archive-analysis";
import { analyzeImageInBrowser } from "@/features/image-analysis/browser-client";
import { invalidateDownstream } from "@/features/session/flow-state";
import { completedSteps, persistMedia, readPersistentMedia, readPersistentSession, removePersistentMedia, saveSession } from "@/features/session/session-storage";
import type { ArchiveImage, ArchiveImageAnalysis, ArchiveIntent, BorrowableElement, ObservationVerdict, StyleSession } from "@/types/style";

const focusElements: { value: BorrowableElement; label: string }[] = [
  { value: "color", label: "颜色" }, { value: "silhouette", label: "廓形" }, { value: "material", label: "材质" },
  { value: "stylingRelation", label: "层次" }, { value: "item", label: "单品" }, { value: "accessory", label: "配饰" }, { value: "mood", label: "气质" },
];

export function ArchiveDecodeExperience() {
  const router = useRouter();
  const [session, setSession] = useState<StyleSession | null>(null);
  const [markElement, setMarkElement] = useState<BorrowableElement | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [manualAttributeKey, setManualAttributeKey] = useState(attributeTokens[0].id);
  const [manualTitle, setManualTitle] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void readPersistentSession().then((current) => {
      const next = current.archiveDecode.status === "not-started" ? { ...current, activeStep: "archive-decode" as const, archiveDecode: { ...current.archiveDecode, status: "in-progress" as const } } : current;
      setSession(saveSession(next));
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function commit(images: ArchiveImage[], resetAnalyses = false) {
    if (!session) return;
    const imageIds = new Set(images.map((image) => image.id));
    const draft = {
      ...session,
      archiveDecode: resetAnalyses
        ? { ...session.archiveDecode, images, analyses: session.archiveDecode.analyses.filter((item) => imageIds.has(item.imageId)), clusters: [], observations: [], correctionImpacts: [] }
        : { ...session.archiveDecode, images },
    };
    const hasDownstream = session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    const next = saveSession(hasDownstream
      ? invalidateDownstream(draft, "archive-decode", "你修改了收藏输入，风格实验和个人风格系统需要重新生成")
      : draft);
    setSession(next);
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!session) return;
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 12 - session.archiveDecode.images.length);
    const createdAt = new Date().toISOString();
    const additions: ArchiveImage[] = files.map((file, index) => ({
      id: `upload-${file.lastModified}-${index}`,
      name: file.name,
      previewSrc: URL.createObjectURL(file),
      intent: "want-to-wear",
      focusMarks: [],
      attributeIds: [],
      createdAt,
    }));
    await Promise.all(additions.map((image, index) => persistMedia(image.id, files[index])));
    commit([...session.archiveDecode.images, ...additions], true);
    additions.forEach((image) => appendAnalysisEvent({ eventName: "archive_image_uploaded", sessionId: session.id, step: "archive-decode", payload: { imageId: image.id, intent: image.intent }, createdAt }));
    event.target.value = "";
  }

  function useSamples() {
    if (!session) return;
    const draft = { ...session, archiveDecode: { ...session.archiveDecode, images: makeSampleArchive(session.updatedAt).map((image) => ({ ...image, attributeIds: [] })), analyses: [], clusters: [], observations: [], correctionImpacts: [] } };
    const hasDownstream = session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    const next = saveSession(hasDownstream
      ? invalidateDownstream(draft, "archive-decode", "你更换了收藏样本，风格实验和个人风格系统需要重新生成")
      : draft);
    setSession(next);
  }

  function removeImage(imageId: string) {
    if (!session) return;
    void removePersistentMedia(imageId);
    commit(session.archiveDecode.images.filter((image) => image.id !== imageId), true);
  }

  function setIntent(imageId: string, intent: ArchiveIntent) {
    if (!session) return;
    commit(session.archiveDecode.images.map((image) => image.id === imageId ? { ...image, intent } : image));
  }

  function addFocusMark(event: MouseEvent<HTMLDivElement>, imageId: string) {
    if (!session || !markElement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const image = session.archiveDecode.images.find((item) => item.id === imageId)!;
    const attributeKeys = markElement === "item" ? [] : image.attributeIds.filter((attributeKey) => attributeTokens.find((token) => token.id === attributeKey)?.dimension === markElement);
    const mark = { id: `${imageId}-mark-${image.focusMarks.length + 1}`, x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100, element: markElement, attributeKeys };
    commit(session.archiveDecode.images.map((image) => image.id === imageId ? { ...image, focusMarks: [...image.focusMarks, mark] } : image));
  }

  async function loadImageBlob(image: ArchiveImage): Promise<Blob> {
    const stored = await readPersistentMedia(image.id);
    if (stored) return stored;
    const response = await fetch(image.previewSrc);
    if (!response.ok) throw new Error("图片读取失败");
    return response.blob();
  }

  async function analyzeImages(imageIds: string[], useMock = false, force = false) {
    if (!session || analysisBusy) return;
    setAnalysisBusy(true);
    let current = session;
    let records = current.archiveDecode.analyses;
    for (const imageId of imageIds) {
      const image = current.archiveDecode.images.find((item) => item.id === imageId);
      if (!image) continue;
      const processing: ArchiveImageAnalysis = { imageId, status: "processing", requestedProvider: useMock ? "mock" : "qwen", candidates: [] };
      records = replaceAnalysisRecord(records, processing);
      current = saveSession({ ...current, archiveDecode: { ...current.archiveDecode, analyses: records } });
      setSession(current);
      let result: ArchiveImageAnalysis;
      try {
        const blob = await loadImageBlob(image);
        result = await analyzeImageInBrowser({ imageId, blob, sourceType: "user-archive", expectedContent: "unknown", useMock, force });
      } catch {
        result = { imageId, status: "failed", requestedProvider: useMock ? "mock" : "qwen", candidates: [], error: { code: "image-read-failed", message: "无法读取这张图片，请重新选择或使用手动补充。", retryable: false }, analyzedAt: new Date().toISOString() };
      }
      records = replaceAnalysisRecord(records, result);
      current = saveSession({ ...current, archiveDecode: { ...current.archiveDecode, analyses: records } });
      setSession(current);
    }
    const reviewModel = buildArchiveReviewModel(records);
    const draft = { ...current, archiveDecode: { ...current.archiveDecode, analyses: records, ...reviewModel, correctionImpacts: [] } };
    const hasDownstream = current.styleLab.status !== "not-started" || current.styleSystem.status !== "not-started";
    const next = saveSession(hasDownstream
      ? invalidateDownstream(draft, "archive-decode", "你重新分析了收藏，风格实验和个人风格系统需要重新确认")
      : draft);
    setSession(next);
    setAnalysisBusy(false);
  }

  function decode() {
    if (!session || session.archiveDecode.images.length < 5) return;
    void analyzeImages(session.archiveDecode.images.map((image) => image.id), false, true);
  }

  function addManualObservation() {
    if (!session || !manualTitle.trim()) return;
    const token = attributeTokens.find((item) => item.id === manualAttributeKey)!;
    const observation = {
      id: `manual-observation:${Date.now()}`,
      dimension: token.dimension,
      title: manualTitle.trim(),
      description: "这是你手动补充的图片观察；仍需再次确认后才会进入证据。",
      attributeIds: [token.id],
      imageIds: session.archiveDecode.images.map((image) => image.id),
      verdict: "pending" as const,
      source: "manual" as const,
      candidateIds: [],
    };
    setSession(saveSession({ ...session, archiveDecode: { ...session.archiveDecode, observations: [...session.archiveDecode.observations, observation] } }));
    setManualTitle("");
  }

  function updateObservation(id: string, verdict: ObservationVerdict, editedTitle?: string) {
    if (!session) return;
    const before = session.archiveDecode.observations.find((item) => item.id === id)!;
    const createdAt = new Date().toISOString();
    const after = { ...before, verdict, editedTitle: editedTitle ?? before.editedTitle, editedAttributeIds: verdict === "modified" ? before.editedAttributeIds ?? before.attributeIds.slice(0, 1) : before.editedAttributeIds, reviewedAt: createdAt };
    const impact = describeArchiveCorrection(before, after, createdAt);
    const candidateIds = new Set(before.candidateIds ?? []);
    const reviewStatus = verdict === "denied" ? "rejected" as const : verdict;
    const analyses = session.archiveDecode.analyses.map((analysis) => ({ ...analysis, candidates: analysis.candidates.map((candidate) => candidateIds.has(candidate.id) ? { ...candidate, reviewStatus, editedAttributeKey: verdict === "modified" ? after.editedAttributeIds?.[0] : undefined, editedValue: verdict === "modified" ? after.editedTitle : undefined } : candidate) }));
    const archiveDecode = { ...session.archiveDecode, analyses, observations: session.archiveDecode.observations.map((item) => item.id === id ? after : item), correctionImpacts: impact ? [...session.archiveDecode.correctionImpacts.filter((item) => item.observationId !== id), impact] : session.archiveDecode.correctionImpacts };
    const draft = { ...session, updatedAt: createdAt, archiveDecode };
    const hasDownstream = session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    const next = saveSession(hasDownstream
      ? invalidateDownstream(draft, "archive-decode", "你修正了收藏观察，依赖它的风格实验和结果已失效", createdAt)
      : { ...draft, styleSystem: session.styleSystem.output ? { ...session.styleSystem, status: "completed" as const, output: generateStyleSystemOutput(draft) } : session.styleSystem });
    setSession(next);
    const eventName = verdict === "confirmed" ? "archive_observation_confirmed" : verdict === "denied" ? "archive_observation_rejected" : verdict === "modified" ? "archive_observation_modified" : null;
    if (eventName) appendAnalysisEvent({ eventName, sessionId: session.id, step: "archive-decode", payload: { observationId: id, attributeKeys: after.editedAttributeIds ?? after.attributeIds }, createdAt });
  }

  function editModifiedObservation(id: string, changes: { editedTitle?: string; editedAttributeIds?: string[] }) {
    if (!session) return;
    const createdAt = new Date().toISOString();
    const before = session.archiveDecode.observations.find((item) => item.id === id)!;
    const after = { ...before, ...changes, verdict: "modified" as const, reviewedAt: createdAt };
    const impact = describeArchiveCorrection(before, after, createdAt);
    const candidateIds = new Set(before.candidateIds ?? []);
    const analyses = session.archiveDecode.analyses.map((analysis) => ({ ...analysis, candidates: analysis.candidates.map((candidate) => candidateIds.has(candidate.id) ? { ...candidate, reviewStatus: "modified" as const, editedAttributeKey: after.editedAttributeIds?.[0], editedValue: after.editedTitle } : candidate) }));
    const archiveDecode = { ...session.archiveDecode, analyses, observations: session.archiveDecode.observations.map((item) => item.id === id ? after : item), correctionImpacts: impact ? [...session.archiveDecode.correctionImpacts.filter((item) => item.observationId !== id), impact] : session.archiveDecode.correctionImpacts };
    const draft = { ...session, updatedAt: createdAt, archiveDecode };
    const hasDownstream = session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    setSession(saveSession(hasDownstream
      ? invalidateDownstream(draft, "archive-decode", "你修改了收藏观察内容，依赖它的风格实验和结果已失效", createdAt)
      : draft));
  }

  function finish() {
    if (!session) return;
    const reviewed = session.archiveDecode.observations.length > 0 && session.archiveDecode.observations.every((item) => item.verdict !== "pending");
    if (!reviewed) return;
    saveSession({ ...session, activeStep: "style-lab", archiveDecode: { ...session.archiveDecode, status: "completed" } });
    router.push("/explore/style-lab");
  }

  if (!session) return <div className="page-shell inner-page"><p>正在读取收藏…</p></div>;
  const { images, observations, clusters, analyses } = session.archiveDecode;
  const analysisByImage = new Map(analyses.map((analysis) => [analysis.imageId, analysis]));
  const failedAnalyses = analyses.filter((analysis) => analysis.status === "failed");
  const fallbackCount = analyses.filter((analysis) => analysis.effectiveProvider === "mock").length;
  const currentEvidenceCount = collectArchiveEvidence(session.archiveDecode).filter((item) => item.direction !== "neutral").length;
  const reviewedCount = observations.filter((item) => item.verdict !== "pending").length;
  const canFinish = images.length >= 5 && observations.length > 0 && reviewedCount === observations.length;

  return (
    <div className="page-shell inner-page evidence-page archive-page">
      <JourneyProgress active="archive-decode" completed={completedSteps(session)} />
      <FlowInvalidationNotice invalidation={session.flow.lastInvalidation} />
      <header className="evidence-heading"><p className="kicker">STEP 02 · MY SAVED LOOKS</p><h1>收藏里，真正吸引<br />你的是什么？</h1><p>上传 5—12 张你存过的图片。系统会先找出重复出现的颜色、版型和细节，再由你判断说得准不准。</p></header>

      <section className="step-context-rail" aria-label="收藏分析流程">
        <article><span>01</span><small>UPLOAD</small><strong>5—12 张收藏</strong><p>尽量包含完整穿搭、街拍和细节图。</p></article>
        <article><span>02</span><small>MARK</small><strong>圈出真正喜欢的地方</strong><p>可以只喜欢颜色、版型、材质、鞋包或一种感觉。</p></article>
        <article><span>03</span><small>CHECK</small><strong>看看系统说得准不准</strong><p>你确认或修改后，这条内容才会影响结果。</p></article>
      </section>

      <div className="privacy-strip"><strong>只保存在你的设备</strong><p>当前收藏保存在这台设备的浏览器中，不会自动进入公共素材库；系统提出的每个观察都可以由你否认或修改。</p></div>
      <div className="archive-toolbar">
        <label className="button button-secondary">添加收藏<input type="file" accept="image/*" multiple onChange={addFiles} /></label>
        <button className="text-link" type="button" onClick={useSamples}>使用 6 张示例收藏</button>
        <span>{images.length} / 12</span>
      </div>

      {images.length > 0 && <><div className="focus-toolbar"><span>先选择要标记的局部，再点击图片：</span>{focusElements.map((item) => <button className={markElement === item.value ? "active" : ""} key={item.value} type="button" onClick={() => setMarkElement(markElement === item.value ? null : item.value)}>{item.label}</button>)}</div><div className="archive-grid">{images.map((image, index) => { const analysis = analysisByImage.get(image.id); return <article key={image.id}>
        <div className="archive-photo" role="img" aria-label={image.name} style={{ backgroundImage: `url("${image.previewSrc}")` }} onClick={(event) => addFocusMark(event, image.id)}>
          <span className="product-index">{String(index + 1).padStart(2, "0")}</span>
          {image.focusMarks.map((mark) => <i key={mark.id} style={{ left: `${mark.x}%`, top: `${mark.y}%` }} title={mark.element} />)}
        </div>
        <select value={image.intent} onChange={(event) => setIntent(image.id, event.target.value as ArchiveIntent)}>{Object.entries(archiveIntentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <small>{image.focusMarks.length ? `已标记 ${image.focusMarks.length} 个局部` : "尚未标记局部"}</small>
        <small className={`analysis-status analysis-${analysis?.status ?? "idle"}`}>{analysis?.status === "processing" ? "正在识别可见属性…" : analysis?.status === "failed" ? analysis.error?.message : analysis ? `${analysis.candidates.length} 条候选观察 · 待你确认` : "尚未分析"}</small>
        {analysis?.status === "failed" && <div className="analysis-recovery"><button type="button" onClick={() => void analyzeImages([image.id], false, true)}>重试</button><button type="button" onClick={() => void analyzeImages([image.id], true, true)}>使用示例观察</button></div>}
        <button className="text-link" type="button" onClick={() => removeImage(image.id)}>删除图片</button>
      </article>; })}</div></>}

      <div className="decode-action"><div><p className="kicker">FIND THE REPEATS</p><h2>{observations.length ? `找到 ${clusters.length} 组重复内容` : "看看这些收藏有什么共同点"}</h2><p>系统只提取图片中看得见的属性。所有观察先保持待确认；只有你确认或修改后才会成为证据。</p>{fallbackCount > 0 && <small className="fallback-note">其中 {fallbackCount} 张因配置或失败使用了示例观察，仍需你逐条确认。</small>}</div><button className="button button-primary" disabled={images.length < 5 || analysisBusy} type="button" onClick={decode}>{analysisBusy ? "正在逐张分析…" : observations.length ? "重新分析" : "开始分析收藏"} <span>→</span></button></div>

      {failedAnalyses.length > 0 && <section className="analysis-recovery-panel"><div><strong>{failedAnalyses.length} 张图片未完成分析</strong><p>你可以重试、对失败图片使用 Mock 示例观察，或在下面手动补充一条可见属性。</p></div><button type="button" disabled={analysisBusy} onClick={() => void analyzeImages(failedAnalyses.map((item) => item.imageId), false, true)}>重试失败图片</button><button type="button" disabled={analysisBusy} onClick={() => void analyzeImages(failedAnalyses.map((item) => item.imageId), true, true)}>用示例观察降级</button></section>}

      <section className="manual-observation-panel"><div><p className="kicker">MANUAL NOTE</p><h2>系统没看清？手动补充</h2><p>手动内容也先保持“待确认”，避免误触发后面的结论。</p></div><select aria-label="手动补充的属性" value={manualAttributeKey} onChange={(event) => setManualAttributeKey(event.target.value)}>{attributeTokens.map((token) => <option key={token.id} value={token.id}>{dimensionLabels[token.dimension]} · {token.label}</option>)}</select><input aria-label="手动观察内容" value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="例如：我反复保存的是短外套比例" /><button type="button" disabled={!manualTitle.trim()} onClick={addManualObservation}>加入待确认观察</button></section>

      {observations.length > 0 && <div className="observation-list">{observations.map((observation, index) => <article className={`verdict-${observation.verdict}`} key={observation.id}>
        <span>{String(index + 1).padStart(2, "0")}</span><div><small>{dimensionLabels[observation.dimension]}</small><h3>{observation.editedTitle ?? observation.title}</h3><p>{observation.description}</p><em>在 {observation.imageIds.length} 张图片里出现</em>
        {observation.verdict === "modified" && <div className="observation-edit"><input aria-label="修改这条观察" value={observation.editedTitle ?? ""} placeholder="用你的话修改这条观察" onChange={(event) => editModifiedObservation(observation.id, { editedTitle: event.target.value })} /><select aria-label="选择修改后的属性" value={observation.editedAttributeIds?.[0] ?? ""} onChange={(event) => editModifiedObservation(observation.id, { editedAttributeIds: event.target.value ? [event.target.value] : [] })}><option value="">不指定属性</option>{attributeTokens.filter((token) => token.dimension === observation.dimension).map((token) => <option value={token.id} key={token.id}>{token.label}</option>)}</select></div>}</div>
        <div className="verdict-actions"><button className={observation.verdict === "confirmed" ? "active" : ""} type="button" onClick={() => updateObservation(observation.id, "confirmed")}>确认</button><button className={observation.verdict === "denied" ? "active" : ""} type="button" onClick={() => updateObservation(observation.id, "denied")}>否认</button><button className={observation.verdict === "modified" ? "active" : ""} type="button" onClick={() => updateObservation(observation.id, "modified", observation.editedTitle ?? observation.title)}>修改</button></div>
      </article>)}</div>}

      {session.archiveDecode.correctionImpacts.length > 0 && <div className="correction-impact"><div><p className="kicker">YOUR CHANGES MATTER</p><h2>你的修改已经生效</h2><p>目前有 {currentEvidenceCount} 条由你确认或修改的内容。</p></div><div>{session.archiveDecode.correctionImpacts.map((impact) => <article key={impact.id}><strong>{impact.verdict === "confirmed" ? "这条说得准" : impact.verdict === "denied" ? "这条已排除" : "已按你的说法修改"}</strong><p>{impact.message}</p><small>涉及：{impact.affectedAttributeKeys.map((key) => attributeTokens.find((token) => token.id === key)?.label ?? key).join(" / ") || "未指定"}</small></article>)}</div></div>}

      <div className="flow-actions"><p>已看过 {reviewedCount} / {observations.length || 0} 条。只有你确认或修改的内容才会影响后面的结果。</p><button className="button button-primary" type="button" disabled={!canFinish} onClick={finish}>去试几套搭配 <span>→</span></button></div>
    </div>
  );
}

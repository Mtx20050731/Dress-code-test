"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { JourneyProgress } from "@/components/journey-progress";
import { FlowInvalidationNotice } from "@/components/exploration/flow-invalidation-notice";
import { attributeTokens, dimensionLabels, trendIntensityGuide } from "@/data/style-exploration-mock";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { deriveStableClues, getNextAdaptiveLook, shouldCompleteVisualSampling } from "@/features/exploration/mock-engine";
import { invalidateDownstream } from "@/features/session/flow-state";
import { completedSteps, readPersistentSession, saveSession } from "@/features/session/session-storage";
import type { BorrowableElement, StyleSession, VisualReaction } from "@/types/style";

const reactions: { value: VisualReaction; label: string; note: string }[] = [
  { value: "want-to-wear", label: "我想穿", note: "这套整体接近你的日常" },
  { value: "admire-only", label: "好看，但我不会穿", note: "喜欢画面，不等于想穿上身" },
  { value: "borrow-element", label: "只想借一个细节", note: "再选出颜色、版型或配饰" },
  { value: "uninterested", label: "没什么感觉", note: "这次选择不会影响偏好" },
  { value: "reject", label: "我不喜欢", note: "帮助排除不适合你的方向" },
];

const borrowOptions: { value: BorrowableElement; label: string }[] = [
  { value: "color", label: "颜色" }, { value: "silhouette", label: "廓形" }, { value: "material", label: "材质" },
  { value: "stylingRelation", label: "层次" }, { value: "item", label: "单品" }, { value: "accessory", label: "配饰" }, { value: "mood", label: "气质" },
];

export function VisualSamplingExperience() {
  const router = useRouter();
  const [session, setSession] = useState<StyleSession | null>(null);
  const [pendingReaction, setPendingReaction] = useState<VisualReaction | null>(null);
  const [borrowedElements, setBorrowedElements] = useState<BorrowableElement[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void readPersistentSession().then((current) => {
      const next = current.visualSampling.status === "not-started"
        ? { ...current, visualSampling: { ...current.visualSampling, status: "in-progress" as const } }
        : current;
      setSession(saveSession(next));
      if (!current.visualSampling.responses.length) appendAnalysisEvent({ eventName: "session_started", sessionId: current.id, step: "visual-sampling", payload: { inferenceVersion: current.inferenceVersion } });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const currentLook = useMemo(() => session ? getNextAdaptiveLook(session.visualSampling.responses, session.visualSampling.askedLookIds) : null, [session]);
  const ready = session ? shouldCompleteVisualSampling(session) : false;

  function record(reaction: VisualReaction, borrowed: BorrowableElement[] = []) {
    if (!session || !currentLook) return;
    const createdAt = new Date().toISOString();
    const response = {
      lookId: currentLook.id,
      themeId: currentLook.themeId,
      intensity: currentLook.intensity,
      reaction,
      borrowedElements: borrowed,
      attributeIds: reaction === "borrow-element"
        ? currentLook.attributes.filter((attribute) => borrowed.includes(attribute.dimension) || borrowed.includes("item")).map((attribute) => attribute.id)
        : currentLook.attributes.map((attribute) => attribute.id),
      createdAt,
    };
    const responses = [...session.visualSampling.responses, response];
    const stableClues = deriveStableClues(responses, session.visualSampling.rejectedClueAttributeKeys);
    const draft = {
      ...session,
      visualSampling: {
        ...session.visualSampling,
        status: "in-progress" as const,
        responses,
        askedLookIds: [...session.visualSampling.askedLookIds, currentLook.id],
        stableClues,
        candidateThemeIds: [...new Set(responses.filter((item) => ["want-to-wear", "admire-only", "borrow-element"].includes(item.reaction)).map((item) => item.themeId))],
      },
    };
    const hasDownstream = session.archiveDecode.status !== "not-started" || session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    const next = saveSession(hasDownstream
      ? invalidateDownstream(draft, "visual-sampling", "你修改了视觉采样，依赖这些线索的收藏观察、风格实验和结果需要重新确认", createdAt)
      : draft);
    setSession(next);
    appendAnalysisEvent({ eventName: "visual_sample_answered", sessionId: session.id, step: "visual-sampling", payload: { lookId: currentLook.id, reaction, attributeIds: response.attributeIds }, createdAt });
    if (reaction === "borrow-element") appendAnalysisEvent({ eventName: "borrowed_element_selected", sessionId: session.id, step: "visual-sampling", payload: { lookId: currentLook.id, borrowedElements: borrowed, attributeIds: response.attributeIds }, createdAt });
    setPendingReaction(null);
    setBorrowedElements([]);
  }

  function rejectClue(attributeKey: string) {
    if (!session) return;
    const rejectedClueAttributeKeys = [...new Set([...session.visualSampling.rejectedClueAttributeKeys, attributeKey])];
    const stableClues = deriveStableClues(session.visualSampling.responses, rejectedClueAttributeKeys);
    const createdAt = new Date().toISOString();
    const draft = { ...session, visualSampling: { ...session.visualSampling, rejectedClueAttributeKeys, stableClues } };
    const hasDownstream = session.archiveDecode.status !== "not-started" || session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    const next = saveSession(hasDownstream
      ? invalidateDownstream(draft, "visual-sampling", "你否认了一条视觉线索，依赖它的后续判断需要重新确认", createdAt)
      : draft);
    setSession(next);
    appendAnalysisEvent({ eventName: "stable_clue_rejected", sessionId: session.id, step: "visual-sampling", payload: { attributeKey } });
  }

  function undoLastResponse() {
    if (!session?.visualSampling.responses.length) return;
    const createdAt = new Date().toISOString();
    const removed = session.visualSampling.responses.at(-1)!;
    const responses = session.visualSampling.responses.slice(0, -1);
    const askedLookIds = session.visualSampling.askedLookIds.filter((id) => id !== removed.lookId);
    const visualSampling = {
      ...session.visualSampling,
      status: "in-progress" as const,
      responses,
      askedLookIds,
      stableClues: deriveStableClues(responses, session.visualSampling.rejectedClueAttributeKeys),
    };
    const draft = { ...session, visualSampling };
    const hasDownstream = session.archiveDecode.status !== "not-started" || session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    setSession(saveSession(hasDownstream
      ? invalidateDownstream(draft, "visual-sampling", "你撤销了上一条视觉回答，后续推断需要重新确认", createdAt)
      : draft));
  }

  function restartSampling() {
    if (!session) return;
    const createdAt = new Date().toISOString();
    const draft = {
      ...session,
      visualSampling: {
        ...session.visualSampling,
        status: "in-progress" as const,
        responses: [],
        askedLookIds: [],
        stableClues: [],
        candidateThemeIds: [],
        rejectedClueAttributeKeys: [],
      },
    };
    const hasDownstream = session.archiveDecode.status !== "not-started" || session.styleLab.status !== "not-started" || session.styleSystem.status !== "not-started";
    setSession(saveSession(hasDownstream
      ? invalidateDownstream(draft, "visual-sampling", "你重新开始了多样化视觉采样，后续推断需要重新确认", createdAt)
      : draft));
    setPendingReaction(null);
    setBorrowedElements([]);
  }

  function choose(reaction: VisualReaction) {
    if (reaction === "borrow-element") {
      setPendingReaction(reaction);
      return;
    }
    record(reaction);
  }

  function finish() {
    if (!session || !ready) return;
    saveSession({ ...session, activeStep: "archive-decode", visualSampling: { ...session.visualSampling, status: "completed" } });
    router.push("/explore/archive-decode");
  }

  if (!session) return <div className="page-shell inner-page"><p>正在读取你的采样进度…</p></div>;
  const clueLabels = session.visualSampling.stableClues.map((clue) => attributeTokens.find((item) => item.id === clue.attributeIds[0])?.label ?? clue.title);

  if (!currentLook) return (
    <div className="page-shell inner-page evidence-page sampling-page">
      <JourneyProgress active="visual-sampling" completed={completedSteps(session)} />
      <FlowInvalidationNotice invalidation={session.flow.lastInvalidation} />
      <header className="evidence-heading sampling-heading">
        <div><p className="kicker">STEP 01 · VISUAL SAMPLING</p><h1>这一轮已经看完，<br />不需要继续等题目。</h1></div>
        <div className="clue-meter"><span>LOOKS REVIEWED</span><strong>{session.visualSampling.responses.length}</strong><p>已看 {session.visualSampling.responses.length} 组 · 有 {session.visualSampling.stableClues.length} 个偏好反复出现</p></div>
      </header>
      <section className="sampling-finish">
        <div><p className="kicker">ROUND COMPLETE</p><h2>{ready ? "接下来，用你的收藏看看这些感觉准不准。" : "旧进度没有留下足够信息，可以重新开始这一轮。"}</h2><p>{ready ? "下一步不会直接给你贴标签。你可以逐条确认、否认，或者用自己的话修改系统看到的内容。" : "这通常是旧版记录与新版图片不一致造成的，不是你的操作错误。"}</p></div>
        <div className="sampling-finish-clues">{clueLabels.length ? clueLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>) : <span>暂时还没有反复出现的偏好</span>}</div>
        <div className="sampling-finish-actions"><button className="text-link" type="button" onClick={restartSampling}>重新开始多样化采样</button>{ready && <button className="button button-primary" type="button" onClick={finish}>进入收藏解剖 <span>→</span></button>}</div>
      </section>
    </div>
  );

  return (
    <div className="page-shell inner-page evidence-page sampling-page">
      <JourneyProgress active="visual-sampling" completed={completedSteps(session)} />
      <FlowInvalidationNotice invalidation={session.flow.lastInvalidation} />
      <header className="evidence-heading sampling-heading">
        <div><p className="kicker">STEP 01 · LOOK & FEEL</p><h1>先别想它叫什么，<br />看看你会不会穿。</h1></div>
        <div className="clue-meter"><span>REPEATED SIGNALS</span><strong>{session.visualSampling.stableClues.length}</strong><p>{session.visualSampling.stableClues.length} 个偏好反复出现 · 已看 {session.visualSampling.responses.length} 组穿搭</p></div>
      </header>

      <section className="step-context-rail" aria-label="本步判断重点">
        <article><span>01</span><small>LOOK</small><strong>看整套，不只看单品</strong><p>把衣服、鞋包和整体感觉放在一起看。</p></article>
        <article><span>02</span><small>FEEL</small><strong>好看，不一定想穿</strong><p>两种感觉都可以选，系统会分开记录。</p></article>
        <article><span>03</span><small>NEXT</small><strong>你的选择会改变下一张</strong><p>不用做一套人人相同的固定题目。</p></article>
      </section>

      <section className="intensity-guide" aria-label="三个版本是什么意思">
        {(["daily", "expressive", "experimental"] as const).map((intensity, index) => <article key={intensity}><span>0{index + 1}</span><div><small>{trendIntensityGuide[intensity].badge}</small><strong>{trendIntensityGuide[intensity].label}</strong><p>{trendIntensityGuide[intensity].description}</p></div></article>)}
      </section>

      <section className="sampling-card">
        <div className="sampling-photo" role="img" aria-label={currentLook.imageAlt} style={{ backgroundImage: `url("${currentLook.imageSrc}")` }}>
          <span>{trendIntensityGuide[currentLook.intensity].badge}</span>
        </div>
        <div className="sampling-copy">
          <p className="kicker">THIS LOOK / 会影响下一张</p>
          <h2>{currentLook.title}</h2>
          <p>不用分析得很专业，只选最接近你第一感觉的答案。系统会据此调整接下来出现的穿搭。</p>
          <div className="attribute-chips">{currentLook.attributes.map((attribute) => <span key={attribute.id}>{dimensionLabels[attribute.dimension]} · {attribute.label}</span>)}</div>
          <div className="reaction-list">{reactions.map((reaction) => <button key={reaction.value} type="button" onClick={() => choose(reaction.value)}><strong>{reaction.label}</strong><small>{reaction.note}</small><b>→</b></button>)}</div>
        </div>
      </section>

      {pendingReaction === "borrow-element" && <div className="borrow-panel"><div><p className="kicker">BORROW ONE ELEMENT</p><h2>你想借走什么？</h2><p>可多选。只会把这些局部写入偏好，不会把整套造型当成“想穿”。</p></div><div className="borrow-options">{borrowOptions.map((option) => <button className={borrowedElements.includes(option.value) ? "active" : ""} type="button" key={option.value} onClick={() => setBorrowedElements((current) => current.includes(option.value) ? current.filter((item) => item !== option.value) : [...current, option.value])}>{option.label}</button>)}</div><button className="button button-primary" type="button" disabled={!borrowedElements.length} onClick={() => record("borrow-element", borrowedElements)}>确认这些元素 <span>→</span></button></div>}

      <div className="clue-strip"><span>反复出现的偏好</span><div>{clueLabels.length ? session.visualSampling.stableClues.map((clue, index) => <button type="button" key={clue.id} onClick={() => rejectClue(clue.attributeIds[0])} title="这条不符合我">{clueLabels[index]} ×</button>) : <em>多看几组后会出现在这里；不急着给你贴标签</em>}</div></div>
      <div className="flow-actions"><p>{ready ? "已经有一些偏好反复出现，可以去收藏里看看是否一致。" : "先看不同颜色、剪裁、纹理和运动感的穿搭，接下来会根据你的选择变化。"}</p><div><button className="text-link" type="button" disabled={!session.visualSampling.responses.length} onClick={restartSampling}>重新开始</button><button className="text-link" type="button" disabled={!session.visualSampling.responses.length} onClick={undoLastResponse}>撤销上一条</button><button className="button button-primary" type="button" disabled={!ready} onClick={finish}>去看我的收藏 <span>→</span></button></div></div>
    </div>
  );
}

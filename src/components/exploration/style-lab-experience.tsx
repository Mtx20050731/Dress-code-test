"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JourneyProgress } from "@/components/journey-progress";
import { FlowInvalidationNotice } from "@/components/exploration/flow-invalidation-notice";
import { dimensionLabels } from "@/data/style-exploration-mock";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { generateStyleSystem, initializeLab, recordLabElementReplacement, recordWearingIntentChange } from "@/features/exploration/mock-engine";
import { invalidateDownstream } from "@/features/session/flow-state";
import { completedSteps, readPersistentSession, saveSession } from "@/features/session/session-storage";
import type { AttributeDimension, StyleSession, SwapOption, WearingIntent } from "@/types/style";

const zoneLabels = { safe: "FAMILIAR / 现在就会穿", extension: "ONE STEP / 多试一点", experiment: "BOLD / 大胆看看" };

export function StyleLabExperience() {
  const router = useRouter();
  const [session, setSession] = useState<StyleSession | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void readPersistentSession().then((current) => {
        const initialized = initializeLab(current);
        setSession(saveSession(initialized));
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function setWearingIntent(directionId: string, variantId: string, wearingIntent: WearingIntent) {
    if (!session) return;
    const direction = session.styleLab.directions.find((item) => item.id === directionId)!;
    const variant = direction.variants.find((item) => item.id === variantId)!;
    const createdAt = new Date().toISOString();
    const styleLab = recordWearingIntentChange(session.styleLab, directionId, variantId, wearingIntent, createdAt);
    const draft = { ...session, styleLab };
    const next = saveSession(session.styleSystem.status !== "not-started"
      ? invalidateDownstream(draft, "style-lab", "你修改了穿着意愿，个人风格系统需要重新生成", createdAt)
      : draft);
    setSession(next);
    appendAnalysisEvent({ eventName: "wearing_intent_changed", sessionId: session.id, step: "style-lab", payload: { variantId, from: variant.wearingIntent, to: wearingIntent }, createdAt });
    if (wearingIntent === "reject") appendAnalysisEvent({ eventName: "lab_outfit_rejected", sessionId: session.id, step: "style-lab", payload: { variantId, attributeKeys: Object.values(variant.attributeKeys) }, createdAt });
  }

  function applySwap(directionId: string, variantId: string, option: SwapOption) {
    if (!session) return;
    const createdAt = new Date().toISOString();
    const styleLab = recordLabElementReplacement(session.styleLab, directionId, variantId, option, createdAt);
    const draft = { ...session, styleLab };
    const next = saveSession(session.styleSystem.status !== "not-started"
      ? invalidateDownstream(draft, "style-lab", "你替换了造型元素，个人风格系统需要重新生成", createdAt)
      : draft);
    setSession(next);
    appendAnalysisEvent({ eventName: "lab_element_replaced", sessionId: session.id, step: "style-lab", payload: { variantId, elementKey: option.elementKey, dimension: option.dimension, toAttributeKey: option.attributeKey }, createdAt });
  }

  function finish() {
    if (!session) return;
    const judged = session.styleLab.directions.flatMap((item) => item.variants).filter((item) => item.wearingIntent !== "pending").length;
    if (judged < 4) return;
    const completed = { ...session, styleLab: { ...session.styleLab, status: "completed" as const } };
    const withSystem = generateStyleSystem(completed);
    saveSession(withSystem);
    appendAnalysisEvent({ eventName: "style_system_generated", sessionId: session.id, step: "style-system", payload: { evidenceCount: withSystem.styleSystem.output?.evidence.length ?? 0, tensionCount: withSystem.styleSystem.output?.styleTensions.length ?? 0 } });
    router.push("/explore/style-system");
  }

  if (!session) return <div className="page-shell inner-page"><p>正在根据前两步生成个性化造型…</p></div>;
  const variants = session.styleLab.directions.flatMap((item) => item.variants);
  const judgedCount = variants.filter((item) => item.wearingIntent !== "pending").length;

  return (
    <div className="page-shell inner-page evidence-page lab-page">
      <JourneyProgress active="style-lab" completed={completedSteps(session)} />
      <FlowInvalidationNotice invalidation={session.flow.lastInvalidation} />
      <header className="evidence-heading"><p className="kicker">STEP 03 · TRY IT YOUR WAY</p><h1>把一套搭配，<br />改到你愿意穿。</h1><p>这些搭配来自前两步反复出现的选择。你可以换鞋、换颜色或减少配饰，看看真正让你犹豫的是哪一个细节。</p></header>

      <section className="zone-legend" aria-label="三种尝试范围">
        <article><span>FAMILIAR</span><strong>现在就会穿</strong><p>大部分细节都来自你已经确认过的选择。</p></article>
        <article><span>ONE STEP</span><strong>多试一点</strong><p>保留熟悉的部分，只增加一个新变化。</p></article>
        <article><span>BOLD</span><strong>大胆看看</strong><p>把你欣赏的元素放大，只用来试探接受范围。</p></article>
      </section>

      {session.styleLab.directions.map((direction, directionIndex) => <section className="lab-direction" key={direction.id}>
        <div className="lab-direction-heading"><span>0{directionIndex + 1}</span><div><p className="kicker">BASED ON YOUR CHOICES</p><h2>{direction.title}</h2><p>{direction.rationale}</p></div></div>
        <div className="lab-variant-grid">{direction.variants.map((variant) => <article key={variant.id}>
          <div className="lab-photo" role="img" aria-label={variant.imageAlt} style={{ backgroundImage: `url("${variant.imageSrc}")` }}><span>{zoneLabels[variant.zone]}</span><small>{variant.scene}</small></div>
          <div className="lab-variant-copy"><h3>{variant.title}</h3><dl>{(Object.entries(variant.attributes) as [AttributeDimension, string][]).map(([dimension, value]) => <div key={dimension}><dt>{dimensionLabels[dimension]}</dt><dd>{value}</dd></div>)}</dl>
          <div className="wear-decision"><button className={variant.wearingIntent === "want-to-wear" ? "active" : ""} type="button" onClick={() => setWearingIntent(direction.id, variant.id, "want-to-wear")}>愿意穿</button><button className={variant.wearingIntent === "hesitant" ? "active" : ""} type="button" onClick={() => setWearingIntent(direction.id, variant.id, "hesitant")}>犹豫</button><button className={variant.wearingIntent === "reject" ? "active negative" : ""} type="button" onClick={() => setWearingIntent(direction.id, variant.id, "reject")}>不愿穿</button></div>
          <details><summary>换一个细节再看看</summary><div className="swap-options">{direction.swapOptions.map((option) => <button type="button" key={option.id} onClick={() => applySwap(direction.id, variant.id, option)}>{option.label}</button>)}</div></details></div>
        </article>)}</div>
      </section>)}

      <div className="boundary-log"><div><p className="kicker">WHAT CHANGED YOUR MIND</p><h2>换掉什么之后，你愿意穿了？</h2></div>{session.styleLab.boundaryTransitions.length ? session.styleLab.boundaryTransitions.map((transition) => <p key={transition.id}><strong>{dimensionLabels[transition.changedDimension]}</strong>：{transition.fromValue} → {transition.toValue}<br /><span>{transition.interpretation}</span></p>) : <p>先选“犹豫”或“不愿穿”，换掉一个细节后再选“愿意穿”。这样才能知道问题出在鞋、颜色还是其他部分。</p>}</div>
      <div className="flow-actions"><p>已看过 {judgedCount} / {variants.length} 套 · 至少选择 4 套，就能生成你的风格总结。</p><button className="button button-primary" type="button" disabled={judgedCount < 4} onClick={finish}>生成我的风格总结 <span>→</span></button></div>
    </div>
  );
}

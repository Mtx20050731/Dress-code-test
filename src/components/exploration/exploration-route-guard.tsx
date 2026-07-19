"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { JourneyProgress } from "@/components/journey-progress";
import { themeImageSets } from "@/data/style-exploration-mock";
import { canAccessStep, explorationStepPaths, firstIncompleteStep } from "@/features/session/flow-state";
import { completedSteps, readPersistentSession } from "@/features/session/session-storage";
import type { ExplorationStep, StyleSession } from "@/types/style";

const previews: Record<ExplorationStep, {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{ label: string; title: string; description: string; image: string }>;
}> = {
  "visual-sampling": { eyebrow: "STEP 01 · LOOK & FEEL", title: "从完整穿搭开始，记录最直接的感觉。", description: "你的每一次选择都会影响下一张；想穿、只欣赏和只借一个细节会被分开记录。", cards: [] },
  "archive-decode": { eyebrow: "STEP 02 · MY SAVED LOOKS", title: "看看收藏里，真正吸引你的是什么。", description: "上传 5—12 张收藏，系统找出重复的颜色、版型、材质和搭配细节，再由你判断说得准不准。", cards: [
    { label: "COLOR", title: "反复出现的颜色", description: "不是只看某一张，而是找出你一再收藏的配色。", image: themeImageSets["retro-color"][1] },
    { label: "SHAPE", title: "衣服的松紧与长短", description: "看看你更常收藏宽松、利落、垂坠还是贴身的版型。", image: themeImageSets["relaxed-tailoring"][1] },
    { label: "DETAIL", title: "只圈出喜欢的局部", description: "可以只喜欢鞋、包、材质或一个配色，不必接受整套。", image: themeImageSets["crafted-layering"][1] },
  ] },
  "style-lab": { eyebrow: "STEP 03 · TRY IT YOUR WAY", title: "换掉一个细节，看看什么时候你会愿意穿。", description: "前两步的选择会组成三种尝试范围；你可以换鞋、下装、材质、颜色或配饰。", cards: [
    { label: "FAMILIAR", title: "现在就会穿", description: "大部分细节来自你已经确认过的日常选择。", image: themeImageSets["quiet-structure"][0] },
    { label: "ONE STEP", title: "多试一点", description: "保留熟悉的部分，只增加一个新变化。", image: themeImageSets["modern-romance"][1] },
    { label: "BOLD", title: "大胆看看", description: "放大你欣赏的元素，用来了解自己能接受到哪里。", image: themeImageSets["retro-color"][2] },
  ] },
  "style-system": { eyebrow: "STEP 04 · MY STYLE FILE", title: "得到一份能看懂、能修改、也会继续变化的风格总结。", description: "结果不贴固定标签，而是分别告诉你：真正会穿什么、会被什么吸引、什么让你犹豫，以及最近想试什么。", cards: [
    { label: "MY EVERYDAY", title: "我真正会穿的", description: "来自不同环节里反复出现、并且你愿意穿的选择。", image: themeImageSets["quiet-structure"][0] },
    { label: "TWO SIDES", title: "我也可以有两面", description: "欣赏和日常不必完全相同，看似矛盾也可以同时成立。", image: themeImageSets["retro-color"][1] },
    { label: "WHAT NEXT", title: "下一次继续更新", description: "通过近期穿搭、流行翻译和衣橱尝试，让结果越来越像你。", image: themeImageSets["crafted-layering"][2] },
  ] },
};

function LockedStepPreview({ step, session }: { step: ExplorationStep; session: StyleSession }) {
  const preview = previews[step];
  const required = firstIncompleteStep(session);
  return (
    <div className="page-shell inner-page step-preview-page">
      <JourneyProgress active={step} completed={completedSteps(session)} />
      <header className="step-preview-hero"><div><p className="kicker">{preview.eyebrow} · PREVIEW</p><h1>{preview.title}</h1><p>{preview.description}</p></div><aside><span>PREVIEW MODE</span><strong>可查看结构，完成前一步后解锁操作</strong></aside></header>
      <section className="step-preview-grid">{preview.cards.map((card, index) => <article key={card.label}><div className="step-preview-image" role="img" aria-label={card.title} style={{ backgroundImage: `url("${card.image}")` }}><span>0{index + 1}</span></div><small>{card.label}</small><h2>{card.title}</h2><p>{card.description}</p></article>)}</section>
      <section className="step-preview-action"><div><small>REQUIRED FIRST</small><h2>先完成：{previews[required].eyebrow.replace(/STEP \d+ · /, "")}</h2><p>页面不会再把你无提示地退回第一步；这里只限制提交，不限制理解整个流程。</p></div><Link className="button button-primary" href={explorationStepPaths[required]}>继续当前步骤 <span>→</span></Link></section>
    </div>
  );
}

export function ExplorationRouteGuard({ step, children }: { step: ExplorationStep; children: ReactNode }) {
  const [session, setSession] = useState<StyleSession | null>(null);
  useEffect(() => {
    let active = true;
    void readPersistentSession().then((current) => { if (active) setSession(current); });
    return () => { active = false; };
  }, []);
  if (!session) return <div className="page-shell inner-page"><p>正在恢复你的探索进度…</p></div>;
  if (!canAccessStep(session, step)) return <LockedStepPreview step={step} session={session} />;
  return children;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { explorationStages } from "@/components/journey-progress";
import { FlowInvalidationNotice } from "@/components/exploration/flow-invalidation-notice";
import { themeImageSets } from "@/data/style-exploration-mock";
import { canAccessStep, explorationStepPaths, firstIncompleteStep } from "@/features/session/flow-state";
import { clearPersistentSession, createSession, readPersistentSession } from "@/features/session/session-storage";
import type { ExplorationStep, StepStatus, StyleSession } from "@/types/style";

const descriptions: Record<ExplorationStep, string> = {
  "visual-sampling": "从 8 个趋势母题中自适应取样，区分想穿、欣赏、借元素与明确排斥。",
  "archive-decode": "上传 5—12 张真实收藏，确认、否认或修改系统观察，并标记真正吸引的局部。",
  "style-lab": "根据前两步生成个性化造型，在安全区、延伸区和实验区中测试可穿边界。",
  "style-system": "形成可追溯、可继续修正的风格系统，而不是一次性的风格标签。",
};

const stageImages: Record<ExplorationStep, string> = {
  "visual-sampling": themeImageSets["retro-color"][1],
  "archive-decode": themeImageSets["crafted-layering"][1],
  "style-lab": themeImageSets["polished-sport"][1],
  "style-system": themeImageSets["modern-romance"][2],
};

function getStatus(session: StyleSession | null, step: ExplorationStep): StepStatus {
  if (!session) return "not-started";
  if (step === "visual-sampling") return session.visualSampling.status;
  if (step === "archive-decode") return session.archiveDecode.status;
  if (step === "style-lab") return session.styleLab.status;
  return session.styleSystem.status;
}

export function JourneyOverview() {
  const [session, setSession] = useState<StyleSession | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void readPersistentSession().then(setSession); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function reset() {
    await clearPersistentSession();
    setSession(createSession());
  }

  return (
    <>
      <div className="journey-note"><strong>HOW THE SYSTEM LEARNS</strong><p>每一步都生成可以被后一步验证、否认或修改的证据。系统分别保存稳定审美、理想偏好、现实穿着边界与当前好奇，不把趋势标签直接写成你的身份。</p></div>
      <FlowInvalidationNotice invalidation={session?.flow.lastInvalidation} />
      <div className="journey-list">
        {explorationStages.map((step) => {
          const status = getStatus(session, step.id);
          const unlocked = session ? canAccessStep(session, step.id) : step.id === "visual-sampling";
          return (
            <Link className={`journey-row ${unlocked ? "" : "preview-only"}`} href={step.href} key={step.id}>
              <span className="journey-no">{step.index}</span>
              <span className="journey-visual" role="img" aria-label={`${step.label}示例`} style={{ backgroundImage: `url("${stageImages[step.id]}")` }} />
              <div><small>{step.en}</small><h2>{step.label}</h2><p>{descriptions[step.id]}</p></div>
              <div className="journey-state"><span className={status}>{status === "completed" ? "已完成" : status === "in-progress" ? "继续" : unlocked ? "开始" : "预览"}</span><b>→</b></div>
            </Link>
          );
        })}
      </div>
      <div className="journey-bottom"><p>当前主流程使用本地规则与本地数据库，所有判断都可以返回修改或推翻。</p><div><button className="text-link" type="button" onClick={() => void reset()}>清除记录，从零开始</button><Link className="button button-primary" href={session ? explorationStepPaths[firstIncompleteStep(session)] : "/explore/visual-sampling"}>{session && session.visualSampling.status !== "not-started" ? "继续上次进度" : "开始视觉采样"} <span>→</span></Link></div></div>
    </>
  );
}

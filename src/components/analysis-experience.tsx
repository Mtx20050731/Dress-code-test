"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const steps = [
  "重新读取 12 组视觉直觉",
  "从真实收藏提取重复线索",
  "区分单品的“想穿”与“只欣赏”",
  "用生活场景调整建议强度",
  "标记证据一致处与冲突处",
  "生成新的个人风格地图",
];

export function AnalysisExperience() {
  const router = useRouter();
  const [active, setActive] = useState(0);
  useEffect(() => { const stepTimer = window.setInterval(() => setActive((value) => Math.min(value + 1, steps.length - 1)), 680); const redirectTimer = window.setTimeout(() => router.push("/report/current"), 4700); return () => { window.clearInterval(stepTimer); window.clearTimeout(redirectTimer); }; }, [router]);
  return (
    <div className="analysis-v2" aria-live="polite">
      <div className="analysis-v2-copy"><p className="kicker">RE-SYNTHESIZING ALL EVIDENCE</p><h1>不是确认旧答案，<br />而是重新计算。</h1><p>如果新证据与视觉初筛冲突，我们会保留差异，而不是让后续选择服从第一次判断。</p><ol>{steps.map((step, index) => <li key={step} className={index < active ? "done" : index === active ? "active" : ""}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol><button className="text-link" type="button" onClick={() => router.push("/report/current")}>跳过等待，查看演示报告 →</button></div>
        <div className="analysis-v2-media"><Image src="/images/style-v3/quiet-structure-expressive-v1.png" alt="正在分析的结构化穿搭示意" fill unoptimized sizes="50vw" /><span className="scan-line" /><div><strong>{Math.round(((active + 1) / steps.length) * 100)}%</strong><small>COMBINING EVIDENCE</small></div></div>
    </div>
  );
}

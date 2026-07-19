"use client";

import { useEffect, useState } from "react";
import { readSession } from "@/features/session/session-storage";
import type { StyleSession } from "@/types/style";

export function ReportEvidenceSummary() {
  const [session, setSession] = useState<StyleSession | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSession(readSession()));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const judgedLooks = session?.styleLab.directions.flatMap((item) => item.variants).filter((item) => item.wearingIntent !== "pending").length ?? 0;
  const sources = [
    ["视觉采样", session?.visualSampling.responses.length ?? 0, "次反应"],
    ["收藏解剖", session?.archiveDecode.images.length ?? 0, "张图片"],
    ["风格实验", judgedLooks, "套造型"],
    ["用户修正", session?.archiveDecode.observations.filter((item) => item.verdict !== "pending").length ?? 0, "条判断"],
  ];
  const stableCount = session?.styleSystem.output?.coreTaste.filter((item) => item.confidence === "stable").length ?? 0;
  return <div className="report-source-bar">{sources.map(([label, value, unit], index) => <div key={String(label)}><span>0{index + 1}</span><strong>{label}</strong><p>{value} {unit} EVIDENCE</p></div>)}<div className="confidence-cell"><span>CONFIDENCE</span><strong>{stableCount ? "有稳定线索" : "待探索"}</strong><p>不使用虚假的精确百分比</p></div></div>;
}

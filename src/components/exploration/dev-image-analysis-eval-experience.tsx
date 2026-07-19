"use client";

import { useMemo, useState } from "react";
import type { generateEvaluationReport } from "@/evals/image-analysis/generate-report";
import type { DatasetCategory, EvaluationRunItem, HumanAnnotation, ImageEvaluationDifference } from "@/evals/image-analysis/types";

type Report = ReturnType<typeof generateEvaluationReport>;
type Entry = { imageId: string; filename: string; datasetCategory: DatasetCategory; annotation: HumanAnnotation | null; imageAvailable: boolean; item: EvaluationRunItem | null; difference: ImageEvaluationDifference | null };

export function DevImageAnalysisEvalExperience({ report, entries }: { report: Report | null; entries: Entry[] }) {
  const [category, setCategory] = useState<string>("all");
  const [selectedId, setSelectedId] = useState(entries[0]?.imageId ?? "");
  const [overrides, setOverrides] = useState<Record<string, { item: EvaluationRunItem; difference: ImageEvaluationDifference }>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const filtered = useMemo(() => entries.filter((entry) => category === "all" || entry.datasetCategory === category), [category, entries]);
  const selected = entries.find((entry) => entry.imageId === selectedId) ?? filtered[0] ?? null;
  const override = selected ? overrides[selected.imageId] : undefined;
  const item = override?.item ?? selected?.item ?? null;
  const difference = override?.difference ?? selected?.difference ?? null;
  async function rerun() {
    if (!selected) return;
    setLoading(true); setMessage("");
    const response = await fetch("/api/dev/image-analysis-eval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageId: selected.imageId, provider: "qwen" }) });
    const data = await response.json();
    if (data.ok && data.item && data.difference) setOverrides((current) => ({ ...current, [selected.imageId]: { item: data.item, difference: data.difference } }));
    setMessage(data.ok ? "已重新分析。批量报告仍由评估命令生成。" : (data.error?.message ?? data.error ?? "重新分析失败"));
    setLoading(false);
  }
  return <main className="dev-analysis-page"><header><p className="kicker">DEVELOPMENT ONLY · EVALUATION</p><h1>视觉模型人工评估</h1><p>展示人工标注与真实模型结果差异，不接入正式用户画像。</p></header><section><h2>总体指标与门槛</h2>{report ? <><pre>{JSON.stringify(report.metrics.technical, null, 2)}</pre><div className="dev-candidate-list">{report.metrics.thresholds.map((threshold) => <article key={threshold.key}><strong>{threshold.label}</strong><p>{threshold.comparator} {threshold.target} · 实际 {threshold.actual ?? "n/a"}</p><code>{threshold.status}</code></article>)}</div></> : <p>尚无真实评估运行记录。请先放入图片、填写标注并运行评估命令。</p>}</section><section className="dev-analysis-controls"><label>图片类别<select value={category} onChange={(event) => { setCategory(event.target.value); const next = entries.find((entry) => event.target.value === "all" || entry.datasetCategory === event.target.value); if (next) setSelectedId(next.imageId); }}><option value="all">全部</option>{[...new Set(entries.map((entry) => entry.datasetCategory))].map((value) => <option key={value}>{value}</option>)}</select></label><label>图片<select value={selected?.imageId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{filtered.map((entry) => <option key={entry.imageId} value={entry.imageId}>{entry.imageId} · {entry.imageAvailable ? "有图片" : "缺图片"} · {entry.annotation ? "已标注" : "待标注"}</option>)}</select></label><button type="button" disabled={!selected?.imageAvailable || !selected.annotation || loading} onClick={rerun}>{loading ? "分析中…" : "使用真实Provider重新分析"}</button></section>{message && <section><p>{message}</p></section>}{selected && <div className="dev-eval-grid"><section><h2>评估图片</h2>{selected.imageAvailable ? <img className="dev-eval-image" src={`/api/dev/image-analysis-eval?imageId=${encodeURIComponent(selected.imageId)}`} alt={selected.filename} /> : <p>fixture尚未放入。</p>}<h3>人工标注</h3><pre>{JSON.stringify(selected.annotation, null, 2)}</pre></section><section><h2>AI结果</h2><pre>{JSON.stringify(item?.result ?? null, null, 2)}</pre><h3>字段差异与错误标签</h3><pre>{JSON.stringify(difference, null, 2)}</pre><h3>Provider元数据</h3><pre>{JSON.stringify(item?.result?.providerMetadata ?? { status: item?.status ?? "not-run", errorType: item?.errorType ?? null }, null, 2)}</pre></section></div>}</main>;
}

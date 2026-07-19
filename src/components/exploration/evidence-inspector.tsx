"use client";

import { useEffect, useMemo, useState } from "react";
import { clearAnalysisEvents, readAnalysisEvents } from "@/features/analytics/event-log";
import type { AnalysisEvent, EvidenceRef, StyleSystemOutput, TasteStatement } from "@/types/style";

const statementGroups: { key: "coreTaste" | "aspirationalTaste" | "wearabilityBoundary" | "currentCuriosity"; label: string }[] = [
  { key: "coreTaste", label: "coreTaste" },
  { key: "aspirationalTaste", label: "aspirationalTaste" },
  { key: "wearabilityBoundary", label: "wearabilityBoundary" },
  { key: "currentCuriosity", label: "currentCuriosity" },
];

function EvidenceList({ label, evidence }: { label: string; evidence: EvidenceRef[] }) {
  return <div className="inspector-evidence-list"><strong>{label} ({evidence.length})</strong>{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><code>{item.id}</code><span>{item.source} · {item.direction} · {item.intent} · weight {item.weight}</span><small>{item.context ?? item.relatedEntityId}</small></li>)}</ul> : <p>无</p>}</div>;
}

function StatementInspection({ statement, output, groupLabel }: { statement: TasteStatement; output: StyleSystemOutput; groupLabel: string }) {
  const byIds = (ids: string[]) => output.evidence.filter((item) => ids.includes(item.id));
  return <article className="inspector-statement"><div><span>{groupLabel}</span><h4>{statement.title}</h4><code>{statement.id}</code><p>confidence: <strong>{statement.confidence}</strong></p><p>{statement.classificationReason}</p>{statement.confidenceReasons.map((reason) => <small key={reason}>→ {reason}</small>)}</div><div className="inspector-evidence-columns"><EvidenceList label="positive" evidence={byIds(statement.positiveEvidenceIds)} /><EvidenceList label="negative" evidence={byIds(statement.negativeEvidenceIds)} /><EvidenceList label="aspirational" evidence={byIds(statement.aspirationalEvidenceIds)} /><EvidenceList label="conditional" evidence={byIds(statement.conditionalEvidenceIds)} /></div></article>;
}

function EventLogViewer() {
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  useEffect(() => {
    const refresh = () => setEvents(readAnalysisEvents());
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener("undefined-style-event-log-updated", refresh);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("undefined-style-event-log-updated", refresh); };
  }, []);
  return <details className="event-log-viewer"><summary>LOCAL ANALYSIS EVENT LOG ({events.length})</summary><div className="event-log-toolbar"><p>仅保存在当前浏览器，不发送到第三方服务。</p><button type="button" onClick={() => { clearAnalysisEvents(); setEvents([]); }}>清空事件</button></div><ol>{events.map((event) => <li key={event.id}><span>{event.eventName}</span><code>{event.step} · {event.createdAt}</code><pre>{JSON.stringify(event.payload, null, 2)}</pre></li>)}</ol></details>;
}

export function EvidenceInspector({ output }: { output: StyleSystemOutput }) {
  const deniedObservations = useMemo(() => output.evidence.filter((item) => item.observationVerdict === "denied"), [output.evidence]);
  if (process.env.NODE_ENV !== "development") return null;
  return <aside className="evidence-inspector"><details><summary>EVIDENCE INSPECTOR / DEV ONLY</summary><div className="inspector-intro"><strong>LOCAL INFERENCE TRACE</strong><p>这里展示每条判断的分类原因、置信原因和所有方向证据。生产构建不会渲染此面板。</p></div>{statementGroups.map((group) => <section key={group.key}><h3>{group.label}</h3>{output[group.key].length ? output[group.key].map((statement) => <StatementInspection key={statement.id} statement={statement} output={output} groupLabel={group.label} />) : <p>无结论</p>}</section>)}<section><h3>denied observations</h3><EvidenceList label="被用户否认、不再产生正向作用" evidence={deniedObservations} /></section><section><h3>unresolved questions</h3>{output.unresolvedQuestions.map((question) => <article className="inspector-question" key={question.id}><strong>{question.question}</strong><p>{question.reason}</p><code>next: {question.suggestedNextStep}</code></article>)}</section><section><h3>styleTensions</h3>{output.styleTensions.length ? output.styleTensions.map((tension) => <article className="inspector-question" key={tension.id}><strong>{tension.title}</strong><p>{tension.interpretation}</p><p>实际翻译：{tension.practicalTranslation}</p><code>{tension.evidenceIds.join(" · ")}</code></article>) : <p>未检测到张力</p>}</section><EventLogViewer /></details></aside>;
}

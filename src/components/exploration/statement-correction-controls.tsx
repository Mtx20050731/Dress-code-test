"use client";

import { useState } from "react";
import { attributeTokens } from "@/data/style-exploration-mock";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { applyStyleStatementCorrection } from "@/features/exploration/mock-engine";
import { saveSession } from "@/features/session/session-storage";
import type { StyleSession, TasteStatement } from "@/types/style";

export function StatementCorrectionControls({
  session,
  statement,
  onSessionChange,
}: {
  session: StyleSession;
  statement: TasteStatement;
  onSessionChange: (session: StyleSession) => void;
}) {
  const [editing, setEditing] = useState(false);
  const alternatives = attributeTokens.filter(
    (token) => token.dimension === statement.dimension && !statement.attributeIds.includes(token.id),
  );
  const [replacement, setReplacement] = useState(alternatives[0]?.id ?? "");

  function submit(verdict: "denied" | "modified") {
    if (verdict === "modified" && !replacement) return;
    const createdAt = new Date().toISOString();
    const replacementToken = attributeTokens.find((token) => token.id === replacement);
    const correction = {
      id: `result-correction:${statement.id}:${createdAt}`,
      statementId: statement.id,
      verdict,
      originalAttributeIds: statement.attributeIds,
      replacementAttributeIds: verdict === "modified" ? [replacement] : [],
      editedTitle: verdict === "modified" ? replacementToken?.label : undefined,
      editedSummary: verdict === "modified" ? `用户将“${statement.title}”修正为“${replacementToken?.label ?? replacement}”。` : undefined,
      createdAt,
    } as const;
    const next = saveSession(applyStyleStatementCorrection(session, correction));
    onSessionChange(next);
    appendAnalysisEvent({
      eventName: "result_feedback_submitted",
      sessionId: session.id,
      step: "style-system",
      payload: { statementId: statement.id, verdict, replacementAttributeIds: correction.replacementAttributeIds },
      createdAt,
    });
    setEditing(false);
  }

  return (
    <div className="statement-correction-controls">
      <span>这条判断准确吗？</span>
      <button type="button" onClick={() => submit("denied")}>否认</button>
      <button type="button" onClick={() => setEditing((value) => !value)}>修改</button>
      {editing && <div>
        <select aria-label="选择更准确的属性" value={replacement} onChange={(event) => setReplacement(event.target.value)}>
          {alternatives.map((token) => <option value={token.id} key={token.id}>{token.label}</option>)}
        </select>
        <button type="button" disabled={!replacement} onClick={() => submit("modified")}>保存修正</button>
      </div>}
    </div>
  );
}

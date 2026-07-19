"use client";

import { useState } from "react";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { readSession } from "@/features/session/session-storage";

export function FeedbackPanel() {
  const [message, setMessage] = useState("");
  const options = ["非常像我", "有一部分像", "和我想的不一样"];
  function submit(option: string) {
    const session = readSession();
    appendAnalysisEvent({ eventName: "result_feedback_submitted", sessionId: session.id, step: "style-system", payload: { option } });
    setMessage(`已记录：“${option}”。谢谢你帮我们校准这张地图。`);
  }
  return (
    <div className="feedback-panel">
      <p className="eyebrow">ONE LAST THING</p>
      <h2>这份观察，像你吗？</h2>
      <p className="muted">你的反馈会帮助未来的结果更接近真实穿着，而不只是视觉欣赏。</p>
      <div className="feedback-actions">
        {options.map((option) => (
          <button className="choice-chip" type="button" key={option} onClick={() => submit(option)}>{option}</button>
        ))}
      </div>
      <p className="feedback-message" role="status">{message}</p>
    </div>
  );
}

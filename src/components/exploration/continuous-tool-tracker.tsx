"use client";

import { useEffect } from "react";
import { appendAnalysisEvent } from "@/features/analytics/event-log";
import { readSession, saveSession } from "@/features/session/session-storage";
import type { ContinuousEntry } from "@/types/style";

export function ContinuousToolTracker({ tool }: { tool: ContinuousEntry }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readSession();
      saveSession({ ...session, activity: { ...session.activity, lastEntry: tool } });
      appendAnalysisEvent({ eventName: "continuous_tool_opened", sessionId: session.id, step: "continuous-tool", payload: { tool } });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tool]);
  return null;
}

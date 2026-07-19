import type { AnalysisEvent, AnalysisEventName, ExplorationStep } from "@/types/style";

const EVENT_LOG_KEY = "undefined-style-analysis-events-v1";

export type AnalysisEventInput = {
  eventName: AnalysisEventName;
  sessionId: string;
  step: ExplorationStep | "continuous-tool";
  payload?: Record<string, unknown>;
  createdAt: string;
};

export function createAnalysisEvent(input: AnalysisEventInput, existingEvents: AnalysisEvent[]): AnalysisEvent {
  return {
    id: `${input.sessionId}:${String(existingEvents.length + 1).padStart(4, "0")}:${input.eventName}`,
    eventName: input.eventName,
    sessionId: input.sessionId,
    step: input.step,
    payload: input.payload ?? {},
    createdAt: input.createdAt,
  };
}

export function readAnalysisEvents(): AnalysisEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const value = localStorage.getItem(EVENT_LOG_KEY);
    return value ? JSON.parse(value) as AnalysisEvent[] : [];
  } catch {
    return [];
  }
}

export function appendAnalysisEvent(input: Omit<AnalysisEventInput, "createdAt"> & { createdAt?: string }) {
  if (typeof window === "undefined") return null;
  const events = readAnalysisEvents();
  const event = createAnalysisEvent({ ...input, createdAt: input.createdAt ?? new Date().toISOString() }, events);
  localStorage.setItem(EVENT_LOG_KEY, JSON.stringify([...events, event]));
  window.dispatchEvent(new CustomEvent("undefined-style-event-log-updated"));
  return event;
}

export function clearAnalysisEvents() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(EVENT_LOG_KEY);
  window.dispatchEvent(new CustomEvent("undefined-style-event-log-updated"));
}

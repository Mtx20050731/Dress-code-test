import type { ExplorationStep, StyleSession } from "../../types/style";

export const explorationStepOrder: ExplorationStep[] = [
  "visual-sampling",
  "archive-decode",
  "style-lab",
  "style-system",
];

export const explorationStepPaths: Record<ExplorationStep, string> = {
  "visual-sampling": "/explore/visual-sampling",
  "archive-decode": "/explore/archive-decode",
  "style-lab": "/explore/style-lab",
  "style-system": "/explore/style-system",
};

export function firstIncompleteStep(session: StyleSession): ExplorationStep {
  if (session.visualSampling.status !== "completed") return "visual-sampling";
  if (session.archiveDecode.status !== "completed") return "archive-decode";
  if (session.styleLab.status !== "completed") return "style-lab";
  return "style-system";
}

export function canAccessStep(session: StyleSession, target: ExplorationStep): boolean {
  const targetIndex = explorationStepOrder.indexOf(target);
  if (targetIndex <= 0) return true;
  const completion = [
    session.visualSampling.status === "completed",
    session.archiveDecode.status === "completed",
    session.styleLab.status === "completed",
  ];
  return completion.slice(0, targetIndex).every(Boolean);
}

export function invalidateDownstream(
  session: StyleSession,
  fromStep: Exclude<ExplorationStep, "style-system">,
  reason: string,
  createdAt = new Date().toISOString(),
): StyleSession {
  const invalidatedSteps = explorationStepOrder.slice(explorationStepOrder.indexOf(fromStep) + 1);
  const base = {
    ...session,
    status: "collecting" as const,
    activeStep: fromStep,
    flow: { lastInvalidation: { fromStep, invalidatedSteps, reason, createdAt } },
    updatedAt: createdAt,
  };

  if (fromStep === "visual-sampling") {
    return {
      ...base,
      visualSampling: { ...session.visualSampling, status: "in-progress" },
      archiveDecode: {
        ...session.archiveDecode,
        status: session.archiveDecode.images.length ? "in-progress" : "not-started",
        clusters: [],
        observations: [],
        correctionImpacts: [],
      },
      styleLab: { status: "not-started", directions: [], editEvents: [], wearingIntentEvents: [], boundaryTransitions: [] },
      styleSystem: { status: "not-started", output: null, corrections: [] },
    };
  }

  if (fromStep === "archive-decode") {
    return {
      ...base,
      archiveDecode: { ...session.archiveDecode, status: "in-progress" },
      styleLab: { status: "not-started", directions: [], editEvents: [], wearingIntentEvents: [], boundaryTransitions: [] },
      styleSystem: { status: "not-started", output: null, corrections: [] },
    };
  }

  return {
    ...base,
    styleLab: { ...session.styleLab, status: "in-progress" },
    styleSystem: { status: "not-started", output: null, corrections: [] },
  };
}

export function clearInvalidation(session: StyleSession): StyleSession {
  return { ...session, flow: {} };
}

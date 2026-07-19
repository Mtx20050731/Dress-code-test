import type { ExplorationStep, StyleSession } from "@/types/style";
import {
  clearLocalDatabase,
  deleteMediaBlob,
  readLatestSessionRecord,
  readMediaBlob,
  saveMediaBlob,
  saveSessionRecord,
} from "./local-database";

const SESSION_KEY = "undefined-style-session-v3-evidence-v1";

export function createSession(options: { id?: string; now?: string } = {}): StyleSession {
  const now = options.now ?? new Date().toISOString();
  return {
    version: 3,
    inferenceVersion: "evidence-v1",
    id: options.id ?? `session-${now}`,
    status: "collecting",
    activeStep: "visual-sampling",
    visualSampling: { status: "not-started", responses: [], askedLookIds: [], stableClues: [], rejectedClueAttributeKeys: [], candidateThemeIds: [] },
    archiveDecode: { status: "not-started", images: [], clusters: [], observations: [], correctionImpacts: [], analyses: [] },
    styleLab: { status: "not-started", directions: [], editEvents: [], wearingIntentEvents: [], boundaryTransitions: [] },
    styleSystem: { status: "not-started", output: null, corrections: [] },
    activity: { checkInCount: 0, records: [] },
    flow: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeSession(session: StyleSession): StyleSession {
  return {
    ...session,
    archiveDecode: {
      ...session.archiveDecode,
      analyses: session.archiveDecode.analyses ?? [],
    },
    styleSystem: {
      ...session.styleSystem,
      corrections: session.styleSystem.corrections ?? [],
    },
    activity: {
      ...session.activity,
      checkInCount: session.activity?.checkInCount ?? 0,
      records: session.activity?.records ?? [],
    },
    flow: session.flow ?? {},
  };
}

export function readSession(): StyleSession {
  if (typeof window === "undefined") return createSession();
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return createSession();
    const parsed = JSON.parse(value) as StyleSession;
    return parsed.version === 3 && parsed.inferenceVersion === "evidence-v1" ? normalizeSession(parsed) : createSession();
  } catch {
    return createSession();
  }
}

export function saveSession(session: StyleSession) {
  const next = normalizeSession({ ...session, updatedAt: new Date().toISOString() });
  if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  void saveSessionRecord(next).catch(() => undefined);
  return next;
}

async function hydrateMedia(session: StyleSession): Promise<StyleSession> {
  if (typeof window === "undefined") return session;
  const archiveImages = await Promise.all(session.archiveDecode.images.map(async (image) => {
    const blob = await readMediaBlob(image.id);
    return blob ? { ...image, previewSrc: URL.createObjectURL(blob) } : image;
  }));
  const records = await Promise.all(session.activity.records.map(async (record) => {
    if (!record.imageId) return record;
    const blob = await readMediaBlob(record.imageId);
    return blob ? { ...record, imageSrc: URL.createObjectURL(blob) } : record;
  }));
  return {
    ...session,
    archiveDecode: { ...session.archiveDecode, images: archiveImages },
    activity: { ...session.activity, records },
  };
}

export async function readPersistentSession(): Promise<StyleSession> {
  const cached = readSession();
  try {
    const stored = await Promise.race<StyleSession | null>([
      readLatestSessionRecord(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200)),
    ]);
    const selected = stored && stored.updatedAt > cached.updatedAt ? normalizeSession(stored) : cached;
    const hydrated = await hydrateMedia(selected);
    if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, JSON.stringify(hydrated));
    return hydrated;
  } catch {
    return cached;
  }
}

export async function persistMedia(id: string, file: Blob): Promise<void> {
  await saveMediaBlob(id, file);
}

export async function readPersistentMedia(id: string): Promise<Blob | null> {
  return readMediaBlob(id);
}

export async function removePersistentMedia(id: string): Promise<void> {
  await deleteMediaBlob(id);
}

export function updateSession(mutator: (current: StyleSession) => StyleSession) {
  return saveSession(mutator(readSession()));
}

export function clearSession() {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
  void clearLocalDatabase().catch(() => undefined);
}

export async function clearPersistentSession() {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
  await clearLocalDatabase();
}

export function completedStepCount(session: StyleSession) {
  return [session.visualSampling, session.archiveDecode, session.styleLab, session.styleSystem].filter((step) => step.status === "completed").length;
}

export function completedSteps(session: StyleSession): ExplorationStep[] {
  return [
    session.visualSampling.status === "completed" ? "visual-sampling" : null,
    session.archiveDecode.status === "completed" ? "archive-decode" : null,
    session.styleLab.status === "completed" ? "style-lab" : null,
    session.styleSystem.status === "completed" ? "style-system" : null,
  ].filter(Boolean) as ExplorationStep[];
}

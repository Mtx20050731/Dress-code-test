import test from "node:test";
import assert from "node:assert/strict";
import { makeSampleArchive, mockDecodeArchive, trendThemes } from "../src/data/style-exploration-mock";
import {
  addContinuousToolRecord,
  applyStyleStatementCorrection,
  buildStyleDirectionsFromEvidence,
  collectArchiveEvidence,
  collectVisualEvidence,
  deriveStableClues,
  generateStyleSystem,
  initializeLab,
  recordLabElementReplacement,
  recordWearingIntentChange,
} from "../src/features/exploration/mock-engine";
import { canAccessStep, firstIncompleteStep, invalidateDownstream } from "../src/features/session/flow-state";
import { createSession } from "../src/features/session/session-storage";
import type { StyleSession, VisualResponse } from "../src/types/style";

const now = "2026-07-17T08:00:00.000Z";

function samplingResponses(): VisualResponse[] {
  return trendThemes.map((theme, index) => ({
    lookId: theme.looks[0].id,
    themeId: theme.id,
    intensity: "daily",
    reaction: index < 5 ? "want-to-wear" : index < 7 ? "admire-only" : "borrow-element",
    borrowedElements: index === 7 ? ["material"] : [],
    attributeIds: index === 7
      ? theme.looks[0].attributes.filter((attribute) => attribute.dimension === "material").map((attribute) => attribute.id)
      : theme.looks[0].attributes.map((attribute) => attribute.id),
    createdAt: `2026-07-17T08:0${index}:00.000Z`,
  }));
}

test("完整旅程：采样 → 收藏复核 → 边界实验 → 结果修正 → 持续回访", () => {
  let session: StyleSession = createSession({ id: "journey-e2e", now });
  assert.equal(firstIncompleteStep(session), "visual-sampling");
  assert.equal(canAccessStep(session, "archive-decode"), false);

  const responses = samplingResponses();
  session = {
    ...session,
    visualSampling: {
      ...session.visualSampling,
      status: "completed",
      responses,
      askedLookIds: responses.map((response) => response.lookId),
      stableClues: deriveStableClues(responses),
    },
  };
  assert.equal(canAccessStep(session, "archive-decode"), true);

  const images = makeSampleArchive(now);
  const decoded = mockDecodeArchive(images);
  session = {
    ...session,
    archiveDecode: {
      status: "completed",
      images,
      clusters: decoded.clusters,
      observations: decoded.observations.map((observation) => ({ ...observation, verdict: "confirmed" as const, reviewedAt: now })),
      correctionImpacts: [],
      analyses: [],
    },
  };
  assert.ok(collectArchiveEvidence(session.archiveDecode).some((item) => item.userConfirmed));
  assert.equal(canAccessStep(session, "style-lab"), true);

  session = initializeLab(session);
  const firstDirection = session.styleLab.directions[0];
  const firstVariant = firstDirection.variants[0];
  const shoe = firstDirection.swapOptions.find((option) => option.elementKey === "shoe")!;
  let lab = recordWearingIntentChange(session.styleLab, firstDirection.id, firstVariant.id, "reject", now);
  lab = recordLabElementReplacement(lab, firstDirection.id, firstVariant.id, shoe, now);
  lab = recordWearingIntentChange(lab, firstDirection.id, firstVariant.id, "want-to-wear", now);
  for (const variant of session.styleLab.directions.flatMap((direction) => direction.variants).slice(1, 4)) {
    const direction = session.styleLab.directions.find((item) => item.variants.some((itemVariant) => itemVariant.id === variant.id))!;
    lab = recordWearingIntentChange(lab, direction.id, variant.id, "want-to-wear", now);
  }
  session = { ...session, styleLab: { ...lab, status: "completed" } };
  assert.equal(session.styleLab.boundaryTransitions.length, 1);
  assert.equal(canAccessStep(session, "style-system"), true);

  session = generateStyleSystem(session);
  assert.ok(session.styleSystem.output);
  assert.ok(session.styleSystem.output!.evidence.length > 0);
  const statement = session.styleSystem.output!.coreTaste[0] ?? session.styleSystem.output!.currentCuriosity[0];
  assert.ok(statement);

  session = applyStyleStatementCorrection(session, {
    id: "correction-e2e",
    statementId: statement.id,
    verdict: "denied",
    originalAttributeIds: statement.attributeIds,
    replacementAttributeIds: [],
    createdAt: now,
  });
  assert.equal(session.styleSystem.corrections.length, 1);
  assert.equal(session.styleSystem.output!.coreTaste.some((item) => item.id === statement.id), false);

  session = addContinuousToolRecord(session, {
    id: "check-in-e2e",
    tool: "outfit-check-in",
    subject: "周五真实通勤",
    attributeKeys: ["color-neutral-low"],
    intent: "want-to-wear",
    createdAt: now,
  });
  assert.equal(session.activity.checkInCount, 1);
  assert.ok(session.styleSystem.output!.evidence.some((item) => item.relatedEntityId === "check-in-e2e"));

  const invalidated = invalidateDownstream(session, "archive-decode", "修改收藏", now);
  assert.equal(invalidated.styleLab.status, "not-started");
  assert.equal(invalidated.styleSystem.output, null);
  assert.equal(canAccessStep(invalidated, "style-system"), false);
});

test("Style Lab 的安全区与实验区由前两步证据选择属性", () => {
  const session = createSession({ now });
  session.visualSampling.responses = [
    ...[1, 2, 3].map((index) => ({ lookId: `neutral-${index}`, themeId: "custom", intensity: "daily" as const, reaction: "want-to-wear" as const, borrowedElements: [], attributeIds: ["color-neutral-low", "silhouette-clean"], createdAt: now })),
    ...[1, 2].map((index) => ({ lookId: `color-${index}`, themeId: "custom", intensity: "experimental" as const, reaction: "admire-only" as const, borrowedElements: [], attributeIds: ["color-high-saturation"], createdAt: now })),
  ];
  const directions = buildStyleDirectionsFromEvidence(collectVisualEvidence(session.visualSampling));
  assert.equal(directions[0].variants.find((variant) => variant.zone === "safe")!.attributeKeys.color, "color-neutral-low");
  assert.equal(directions[0].variants.find((variant) => variant.zone === "experiment")!.attributeKeys.color, "color-high-saturation");
});

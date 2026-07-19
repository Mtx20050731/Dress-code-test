import test from "node:test";
import assert from "node:assert/strict";
import { mockStyleDirections, trendThemes } from "../src/data/style-exploration-mock";
import {
  calculateConfidence,
  collectArchiveEvidence,
  collectVisualEvidence,
  generateStyleSystemOutput,
  getNextAdaptiveLook,
  groupEvidenceByAttribute,
  recordLabElementReplacement,
  recordWearingIntentChange,
  shouldCompleteVisualSampling,
} from "../src/features/exploration/mock-engine";
import { createSession } from "../src/features/session/session-storage";
import type { ArchiveObservation, EvidenceRef, StyleLabState, StyleSession, VisualResponse } from "../src/types/style";

const now = "2026-07-15T00:00:00.000Z";

function freshSession(): StyleSession {
  return createSession({ id: "test-session", now });
}

function visualResponse(id: string, reaction: VisualResponse["reaction"], attributeIds: string[], themeId = "custom", intensity: VisualResponse["intensity"] = "daily"): VisualResponse {
  return { lookId: id, themeId, intensity, reaction, borrowedElements: reaction === "borrow-element" ? ["color"] : [], attributeIds, createdAt: now };
}

function evidence(id: string, attributeKey: string, direction: EvidenceRef["direction"], source: EvidenceRef["source"], intent: EvidenceRef["intent"], entity: string, weight = 1): EvidenceRef {
  return { id, source, targetType: "attribute", attributeKey, direction, intent, weight, relatedEntityId: entity, independenceKey: `${source}:${entity}`, createdAt: now };
}

test("1. admire-only 不进入 coreTaste", () => {
  const session = freshSession();
  session.visualSampling.responses = [1, 2, 3].map((index) => visualResponse(`admire-${index}`, "admire-only", ["color-high-saturation"]));
  const output = generateStyleSystemOutput(session);
  assert.equal(output.coreTaste.some((item) => item.attributeIds.includes("color-high-saturation")), false);
  assert.equal(output.aspirationalTaste.some((item) => item.attributeIds.includes("color-high-saturation")), true);
});

test("2. borrow-element 只影响用户选中的属性", () => {
  const session = freshSession();
  session.visualSampling.responses = [visualResponse("borrow-1", "borrow-element", ["color-neutral-low"], "quiet-structure")];
  const collected = collectVisualEvidence(session.visualSampling);
  assert.deepEqual([...new Set(collected.map((item) => item.attributeKey))], ["color-neutral-low"]);
  assert.equal(collected.every((item) => item.direction === "conditional"), true);
});

test("3. 用户否认收藏观察后，原观察不再产生正向证据", () => {
  const base: ArchiveObservation = { id: "obs", dimension: "material", title: "喜欢纹理", description: "", attributeIds: ["material-textured"], imageIds: [], verdict: "confirmed", reviewedAt: now };
  const session = freshSession();
  session.archiveDecode.observations = [base];
  assert.equal(collectArchiveEvidence(session.archiveDecode).some((item) => item.direction === "positive"), true);
  session.archiveDecode.observations = [{ ...base, verdict: "denied" }];
  const denied = collectArchiveEvidence(session.archiveDecode);
  assert.equal(denied.some((item) => item.direction === "positive"), false);
  assert.equal(denied.some((item) => item.observationVerdict === "denied"), true);
});

test("4. 相同来源的重复选择不能直接形成 stable", () => {
  const items = [1, 2, 3, 4].map((index) => evidence(`v${index}`, "silhouette-clean", "positive", "visual-sampling", "want-to-wear", `look-${index}`));
  const group = groupEvidenceByAttribute(items)[0];
  const result = calculateConfidence(group, "core");
  assert.notEqual(result.confidence, "stable");
  assert.equal(result.stageCount, 1);
});

test("5. 跨两个阶段且包含 want-to-wear 的四条独立证据可以形成 stable", () => {
  const items = [
    evidence("v1", "material-textured", "positive", "visual-sampling", "want-to-wear", "look-1"),
    evidence("v2", "material-textured", "positive", "visual-sampling", "want-to-wear", "look-2"),
    evidence("a1", "material-textured", "positive", "archive-image", "want-to-wear", "image-1"),
    evidence("a2", "material-textured", "positive", "archive-image", "want-to-wear", "image-2"),
  ];
  const result = calculateConfidence(groupEvidenceByAttribute(items)[0], "core");
  assert.equal(result.confidence, "stable");
  assert.equal(result.stageCount, 2);
});

test("6. 正反证据接近时输出 unresolved", () => {
  const items = [
    evidence("p1", "color-accent", "positive", "visual-sampling", "want-to-wear", "look-1"),
    evidence("p2", "color-accent", "positive", "archive-image", "want-to-wear", "image-1"),
    evidence("n1", "color-accent", "negative", "visual-sampling", "reject", "look-2"),
    evidence("n2", "color-accent", "negative", "style-lab", "reject", "outfit-1"),
  ];
  const result = calculateConfidence(groupEvidenceByAttribute(items)[0], "core");
  assert.equal(result.confidence, "unresolved");
  assert.equal(result.reasons.some((reason) => reason.includes("权重接近")), true);
});

test("7. 高饱和欣赏 + 低饱和真实穿着形成 styleTension", () => {
  const session = freshSession();
  session.visualSampling.responses = [
    visualResponse("high-1", "admire-only", ["color-high-saturation"]),
    visualResponse("high-2", "admire-only", ["color-high-saturation"]),
    visualResponse("low-1", "want-to-wear", ["color-neutral-low"]),
    visualResponse("low-2", "want-to-wear", ["color-neutral-low"]),
  ];
  const output = generateStyleSystemOutput(session);
  assert.equal(output.styleTensions.some((item) => item.title === "色彩表达 × 日常安全感"), true);
  assert.equal(output.aspirationalTaste.some((item) => item.attributeIds.includes("color-high-saturation")), true);
});

test("8. 修改鞋子后穿着意愿转变生成 BoundaryTransition", () => {
  const session = freshSession();
  const directions = mockStyleDirections([]);
  let lab: StyleLabState = { ...session.styleLab, directions, status: "in-progress" };
  const direction = directions[0];
  const variant = direction.variants[0];
  const shoe = direction.swapOptions.find((item) => item.elementKey === "shoe")!;
  lab = recordWearingIntentChange(lab, direction.id, variant.id, "reject", now);
  lab = recordLabElementReplacement(lab, direction.id, variant.id, shoe, now);
  lab = recordWearingIntentChange(lab, direction.id, variant.id, "want-to-wear", now);
  assert.equal(lab.boundaryTransitions.length, 1);
  assert.equal(lab.boundaryTransitions[0].changedElement, "shoe");
  assert.equal(lab.boundaryTransitions[0].limitingFactor, "正式度");
  assert.match(lab.boundaryTransitions[0].interpretation, /而不是整体风格/);
});

test("9. currentCuriosity 不污染 coreTaste", () => {
  const session = freshSession();
  session.visualSampling.responses = [
    visualResponse("borrow-1", "borrow-element", ["material-technical"]),
    visualResponse("borrow-2", "borrow-element", ["material-technical"]),
  ];
  const output = generateStyleSystemOutput(session);
  assert.equal(output.currentCuriosity.some((item) => item.attributeIds.includes("material-technical")), true);
  assert.equal(output.coreTaste.some((item) => item.attributeIds.includes("material-technical")), false);
});

test("10. 同一图片的重复标签不会被当成完全独立证据", () => {
  const session = freshSession();
  session.archiveDecode.images = [{ id: "image-1", name: "same image", previewSrc: "/same.png", intent: "want-to-wear", attributeIds: [], focusMarks: [{ id: "mark-1", x: 20, y: 20, element: "material", attributeKeys: ["material-textured"] }, { id: "mark-2", x: 40, y: 40, element: "material", attributeKeys: ["material-textured"] }], createdAt: now }];
  const collected = collectArchiveEvidence(session.archiveDecode);
  const group = groupEvidenceByAttribute(collected).find((item) => item.attributeKey === "material-textured")!;
  assert.equal(group.evidence.length > 1, true);
  assert.equal(new Set(group.evidence.map((item) => item.independenceKey)).size, 1);
  assert.notEqual(calculateConfidence(group, "core").confidence, "stable");
});

test("11. 用户主动确认的收藏观察可以形成 supported，但不能跳到 stable", () => {
  const session = freshSession();
  session.archiveDecode.observations = [{ id: "confirmed", dimension: "proportion", title: "偏好纵向比例", description: "", attributeIds: ["proportion-long"], imageIds: [], verdict: "confirmed", reviewedAt: now }];
  const group = groupEvidenceByAttribute(collectArchiveEvidence(session.archiveDecode))[0];
  const result = calculateConfidence(group, "core");
  assert.equal(result.confidence, "supported");
  assert.notEqual(result.confidence, "stable");
});

test("12. 修改收藏观察会删除原正向作用并新增条件证据", () => {
  const session = freshSession();
  session.archiveDecode.observations = [{ id: "modified", dimension: "color", title: "喜欢所有亮色", description: "", attributeIds: ["color-high-saturation"], editedTitle: "只接受局部亮色", editedAttributeIds: ["color-accent"], imageIds: [], verdict: "modified", reviewedAt: now }];
  const collected = collectArchiveEvidence(session.archiveDecode);
  assert.equal(collected.some((item) => item.attributeKey === "color-high-saturation" && item.direction === "positive"), false);
  assert.equal(collected.some((item) => item.attributeKey === "color-accent" && item.direction === "conditional"), true);
});

test("13. 开场采样先跨母题展示色彩、剪裁、纹理和运动，而不是连续单色", () => {
  const responses: VisualResponse[] = [];
  const askedLookIds: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const look = getNextAdaptiveLook(responses, askedLookIds);
    assert.ok(look);
    askedLookIds.push(look.id);
    responses.push(visualResponse(look.id, "uninterested", look.attributes.map((attribute) => attribute.id), look.themeId, look.intensity));
  }
  assert.deepEqual(responses.map((response) => response.themeId), [
    "retro-color",
    "relaxed-tailoring",
    "crafted-layering",
    "polished-sport",
  ]);
});

test("14. 所有题目看完时不再等待下一题，并允许进入下一步", () => {
  const session = freshSession();
  const looks = trendThemes.flatMap((theme) => theme.looks);
  session.visualSampling.responses = looks.map((look) => visualResponse(
    look.id,
    "uninterested",
    look.attributes.map((attribute) => attribute.id),
    look.themeId,
    look.intensity,
  ));
  session.visualSampling.askedLookIds = looks.map((look) => look.id);
  assert.equal(getNextAdaptiveLook(session.visualSampling.responses, session.visualSampling.askedLookIds), null);
  assert.equal(shouldCompleteVisualSampling(session), true);
});

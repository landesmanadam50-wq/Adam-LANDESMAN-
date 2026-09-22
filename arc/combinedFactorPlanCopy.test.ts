import test from "node:test";
import assert from "node:assert/strict";

import {
  NEUTRAL_PROCESSING_CONTINUATION_LINE,
  THOUGHT_FUTURE_INSIGHT_FIXED_LINE,
  getCognitiveReassessmentCopy,
  getEmotionProcessingStepCopy,
  getFactorProcessingStepCopy,
  getGoalConnectionCopy,
  getRecognitionStepCopy,
  getSharedStageCopy,
  getStateDesiredStateEncodingCopy,
  getStateRegulationAnchorCopy,
  getUrgeProcessingStepCopy,
  resolveCognitiveReassessmentVariant,
  resolveFactorRecognitionContext,
} from "./combinedFactorPlanCopy.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import { containsInductionPattern } from "./instructions.ts";

const NOW = "2026-01-01T00:00:00.000Z";

// --- Recognition ---

test("getRecognitionStepCopy resolves item-only content -- no StateProfile dependency, identical whether or not a route has a State", () => {
  const item = createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW);
  const withText = { ...item, thoughtText: "אני אכשל" };
  const copy = getRecognitionStepCopy(withText);
  assert.equal(copy.framing, "שים לב למחשבה שעולה עכשיו.");
  assert.ok(copy.context?.includes("אני אכשל"));
});

test("recognition framing for every category passes containsInductionPattern's safety check", () => {
  const categories = [
    createEmptyThoughtInterferenceItem("t1", "x", null, NOW),
    createEmptyBeliefInterferenceItem("b1", "x", null, NOW),
    createEmptyEmotionInterferenceItem("e1", "x", null, NOW),
    createEmptyUrgeInterferenceItem("u1", "x", null, NOW),
  ];
  for (const item of categories) {
    const copy = getRecognitionStepCopy(item);
    assert.equal(containsInductionPattern(copy.framing), false, `"${copy.framing}" must never invite intensifying/recreating/maintaining/deepening`);
  }
});

test("resolveFactorRecognitionContext returns null when the item has no headline/context fields set at all", () => {
  const item = createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW);
  assert.equal(resolveFactorRecognitionContext(item), null);
});

// --- Processing ---

test("getUrgeProcessingStepCopy reads visual/sensory encoding ONLY -- never item.regulationAnchor (legacy, retired)", () => {
  const item = { ...createEmptyUrgeInterferenceItem("u1", "x", null, NOW), regulationAnchor: "עוגן ויסות ישן", visualEncodingConfig: "דימוי", representationPreference: "visual" as const };
  const copy = getUrgeProcessingStepCopy(item);
  assert.equal(copy.text, "דימוי");
  assert.ok(!copy.text?.includes("עוגן ויסות ישן"));
});

test("getEmotionProcessingStepCopy always returns null text -- Emotion's true content lives in the State block, never a reused legacy regulationCue", () => {
  const item = { ...createEmptyEmotionInterferenceItem("e1", "x", null, NOW), regulationCue: "עוגן ויסות ישן" };
  const copy = getEmotionProcessingStepCopy(item);
  assert.equal(copy.text, null);
});

test("getFactorProcessingStepCopy dispatches by category and never invents content when the item's own field is blank", () => {
  const belief = createEmptyBeliefInterferenceItem("b1", "x", null, NOW);
  assert.equal(getFactorProcessingStepCopy(belief).text, null);
  const thought = createEmptyThoughtInterferenceItem("t1", "x", null, NOW);
  assert.equal(getFactorProcessingStepCopy(thought).text, null);
});

test("THOUGHT_FUTURE_INSIGHT_FIXED_LINE and NEUTRAL_PROCESSING_CONTINUATION_LINE pass the safety validator", () => {
  assert.equal(containsInductionPattern(THOUGHT_FUTURE_INSIGHT_FIXED_LINE), false);
  assert.equal(containsInductionPattern(NEUTRAL_PROCESSING_CONTINUATION_LINE), false);
});

// --- Shared Stay/Acceptance ---

test("getSharedStageCopy is fixed and State-independent for shared_stay/shared_acceptance", () => {
  assert.equal(getSharedStageCopy("shared_stay").title, "שהייה");
  assert.equal(getSharedStageCopy("shared_acceptance").title, "קבלה");
});

// --- State block copy -- only ever called when State participates ---

test("getStateRegulationAnchorCopy/getStateDesiredStateEncodingCopy read the resolved StateProfile's own fields", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד" };
  assert.equal(getStateRegulationAnchorCopy(state).anchor, "עוגן");
  assert.equal(getStateDesiredStateEncodingCopy(state).cue, "קידוד");
});

test("State block copy never appears sourced from a factor's own field -- distinct functions, distinct data source", () => {
  const state = createEmptyStateProfile("s1", "מצב", null, NOW);
  assert.equal(getStateRegulationAnchorCopy(state).anchor, null);
  assert.equal(getStateDesiredStateEncodingCopy(state).cue, null);
});

// --- Cognitive reassessment ---

test("resolveCognitiveReassessmentVariant/getCognitiveReassessmentCopy return the exact required wording for each variant", () => {
  assert.equal(resolveCognitiveReassessmentVariant(true, false), "thought_only");
  assert.equal(resolveCognitiveReassessmentVariant(true, true), "belief_present");
  assert.equal(getCognitiveReassessmentCopy("thought_only").question, "האם המחשבה עדיין מושכת את תשומת הלב שלך?");
  assert.equal(getCognitiveReassessmentCopy("belief_present").question, "האם המחשבה או האמונה עדיין מושכות את תשומת הלב שלך?");
});

// --- Goal Connection (Adaptive ARC architecture task, unified PD/ARC Goal, Phase 7) ---

test("getGoalConnectionCopy reads back exactly the coach-authored desiredResultText/valueText/personalReasonText -- never invented or rephrased", () => {
  const copy = getGoalConnectionCopy({ desiredResultText: "תוצאה רצויה", valueText: "ערך מרכזי", personalReasonText: "סיבה אישית" });
  assert.ok(copy.desiredResultLine.includes("תוצאה רצויה"));
  assert.ok(copy.valueLine.includes("ערך מרכזי"));
  assert.ok(copy.personalReasonLine.includes("סיבה אישית"));
});

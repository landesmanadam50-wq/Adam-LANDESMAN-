import test from "node:test";
import assert from "node:assert/strict";

import {
  NEUTRAL_PROCESSING_CONTINUATION_LINE,
  THOUGHT_FUTURE_INSIGHT_FIXED_LINE,
  getAcceptanceStepCopy,
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
  resolveNeutralAnchorPhrase,
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

// --- Shared Stay ---

test("getSharedStageCopy is fixed and State-independent for shared_stay", () => {
  assert.equal(getSharedStageCopy("shared_stay").title, "שהייה");
});

// --- Acceptance (Adaptive ARC architecture task, unified PD/ARC Goal, method-completion correction) ---

test("getAcceptanceStepCopy names the single selected disturbance category specifically", () => {
  assert.ok(getAcceptanceStepCopy(["thought"], null).body.includes("המחשבה המפריעה"));
  assert.ok(getAcceptanceStepCopy(["belief"], null).body.includes("האמונה המפריעה"));
  assert.ok(getAcceptanceStepCopy(["urge"], null).body.includes("הדחף"));
  assert.ok(getAcceptanceStepCopy(["emotion"], null).body.includes("התחושה"));
});

test("getAcceptanceStepCopy falls back to the generic 'מה שמפריע' phrase for more than one distinct category, or none at all", () => {
  assert.ok(getAcceptanceStepCopy(["thought", "belief"], null).body.includes("מה שמפריע"));
  assert.ok(getAcceptanceStepCopy([], null).body.includes("מה שמפריע"), "Presence-only routes with no selected factor still get a real acceptance line");
});

test("getAcceptanceStepCopy never asks the trainee to evoke, intensify, suppress, or replace the disturbance -- only to notice it alongside the neutral anchor", () => {
  const copy = getAcceptanceStepCopy(["thought"], "עוגן קרקע");
  assert.equal(containsInductionPattern(copy.body), false);
  assert.ok(copy.body.includes("עוגן קרקע"), "the configured regulation anchor is reused verbatim as the neutral anchor");
  assert.ok(/מותר לשניהם להיות נוכחים/.test(copy.body), "both the disturbance and the anchor are explicitly allowed to be present together");
});

test("resolveNeutralAnchorPhrase reuses the configured regulation anchor when present, and falls back to the fixed feet-floor default otherwise -- an anchor is always available, even with no State included", () => {
  assert.equal(resolveNeutralAnchorPhrase("עוגן מותאם"), "עוגן מותאם");
  assert.equal(resolveNeutralAnchorPhrase(null), "המגע של כפות הרגליים עם הרצפה");
  assert.equal(resolveNeutralAnchorPhrase(undefined), "המגע של כפות הרגליים עם הרצפה");
  assert.equal(resolveNeutralAnchorPhrase("   "), "המגע של כפות הרגליים עם הרצפה");
});

// --- State block copy -- only ever called when State participates ---

test("getStateRegulationAnchorCopy/getStateDesiredStateEncodingCopy read the resolved StateProfile's own fields", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד" };
  assert.deepEqual(getStateRegulationAnchorCopy(state).lines, ["עוגן"]);
  assert.deepEqual(getStateDesiredStateEncodingCopy(state).lines, ["קידוד"]);
});

test("State block copy never appears sourced from a factor's own field -- distinct functions, distinct data source", () => {
  const state = createEmptyStateProfile("s1", "מצב", null, NOW);
  assert.deepEqual(getStateRegulationAnchorCopy(state).lines, []);
  assert.deepEqual(getStateDesiredStateEncodingCopy(state).lines, []);
});

// --- Full reads the richer, already-BUILD-configured StateProfile fields; Mini stays light ---

test("Full Regulation includes breathing/body-language/gaze alongside the anchor -- these StateProfile fields already existed and are now actually read", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", naturalBreathingAwareness: "נשימה טבעית", bodyLanguageCue: "כתפיים רפויות", gazeCue: "מבט רך" };
  const copy = getStateRegulationAnchorCopy(state, "full");
  assert.deepEqual(copy.lines, ["עוגן", "נשימה טבעית", "תנוחת הגוף: כתפיים רפויות", "מבט: מבט רך"]);
});

test("Mini Regulation stays light -- anchor + one merged body-language line, no separate breathing/gaze lines", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", naturalBreathingAwareness: "נשימה טבעית", bodyLanguageCue: "כתפיים רפויות", gazeCue: "מבט רך" };
  const copy = getStateRegulationAnchorCopy(state, "mini");
  assert.deepEqual(copy.lines, ["עוגן", "כתפיים רפויות"], "no separate breathing/gaze lines in Mini");
});

test("Full Encoding includes desired body sensation (with location) and body language alongside the encoding cue", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), encodingCue: "קידוד", desiredBodySensation: "חום", bodySensationLocation: "בחזה", bodyLanguageCue: "יציבה זקופה" };
  const copy = getStateDesiredStateEncodingCopy(state, "full");
  assert.deepEqual(copy.lines, ["קידוד", "חום (בחזה)", "תנוחת הגוף: יציבה זקופה"]);
});

test("State Mantra: 'once' states it plainly, 'fixed_count' names the saved count, 'until_change_noticed' instructs repeating until a change is noticed -- Full only", () => {
  const base = { ...createEmptyStateProfile("s1", "מצב", null, NOW), stateMantra: "אני יציב" };
  assert.equal(getStateDesiredStateEncodingCopy({ ...base, mantraRepetitionMode: "once" }, "full").lines.at(-1), 'מנטרת המצב: "אני יציב".');
  assert.equal(getStateDesiredStateEncodingCopy({ ...base, mantraRepetitionMode: "fixed_count", mantraFixedRepetitionCount: 3 }, "full").lines.at(-1), 'חזור על מנטרת המצב 3 פעמים: "אני יציב".');
  assert.equal(getStateDesiredStateEncodingCopy({ ...base, mantraRepetitionMode: "until_change_noticed" }, "full").lines.at(-1), 'חזור על מנטרת המצב עד שתבחין בשינוי: "אני יציב".');
});

test("State Mantra in Mini is always spoken once, regardless of the saved repetition mode -- no Full-only elaboration leaks into Mini", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), stateMantra: "אני יציב", mantraRepetitionMode: "fixed_count" as const, mantraFixedRepetitionCount: 5 };
  assert.equal(getStateDesiredStateEncodingCopy(state, "mini").lines.at(-1), 'מנטרת המצב: "אני יציב".');
});

test("no StateProfile content at all: both copy functions return an empty lines array, never fabricated placeholder text", () => {
  const state = createEmptyStateProfile("s1", "מצב", null, NOW);
  assert.deepEqual(getStateRegulationAnchorCopy(state, "full").lines, []);
  assert.deepEqual(getStateDesiredStateEncodingCopy(state, "full").lines, []);
  assert.deepEqual(getStateRegulationAnchorCopy(state, "mini").lines, []);
  assert.deepEqual(getStateDesiredStateEncodingCopy(state, "mini").lines, []);
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

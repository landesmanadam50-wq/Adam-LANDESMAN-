import test from "node:test";
import assert from "node:assert/strict";

import {
  NEUTRAL_PROCESSING_CONTINUATION_LINE,
  THOUGHT_FUTURE_INSIGHT_FIXED_LINE,
  getBeliefAlternativeStepCopy,
  getBeneficialActionCopy,
  getCognitiveReassessmentCopy,
  getEmotionSupportStepCopy,
  getRecognitionStepCopy,
  getSharedStageCopy,
  getThoughtAlternativeStepCopy,
  getThoughtFutureInsightStepCopy,
  getUrgeSupportStepCopy,
  resolveCognitiveReassessmentVariant,
} from "./combinedRouteStepCopy.ts";
import { containsInductionPattern } from "./instructions.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function state(overrides: Partial<ReturnType<typeof createEmptyStateProfile>> = {}) {
  return { ...createEmptyStateProfile("state1", "מצב", null, NOW), ...overrides };
}

// ---------------------------------------------------------------------------
// Recognition -- safety wording + content
// ---------------------------------------------------------------------------

test("getRecognitionStepCopy: every category's framing line passes containsInductionPattern (never an invitation to evoke/intensify)", () => {
  for (const category of ["thought", "belief", "emotion", "urge"] as const) {
    const item =
      category === "thought"
        ? createEmptyThoughtInterferenceItem("i1", "מחשבה", null, NOW)
        : category === "belief"
          ? createEmptyBeliefInterferenceItem("i1", "אמונה", null, NOW)
          : category === "emotion"
            ? createEmptyEmotionInterferenceItem("i1", "רגש", null, NOW)
            : createEmptyUrgeInterferenceItem("i1", "דחף", null, NOW);
    const copy = getRecognitionStepCopy(category, item, state());
    assert.equal(containsInductionPattern(copy.framing), false, `${category} framing line must never trip the induction-pattern denylist`);
  }
});

test("getRecognitionStepCopy: emotion recognition never displays regulation text", () => {
  const item = { ...createEmptyEmotionInterferenceItem("e1", "כעס", null, NOW), regulationCue: "נשום עמוק שלוש פעמים" };
  const copy = getRecognitionStepCopy("emotion", item, state());
  assert.ok(!copy.framing.includes("נשום עמוק"));
  assert.ok(!(copy.context ?? "").includes("נשום עמוק"));
});

test("getRecognitionStepCopy: urge recognition never displays preventive or encoding text", () => {
  const item = {
    ...createEmptyUrgeInterferenceItem("u1", "דחף לעשן", null, NOW),
    preventiveStoppingAction: "עצור מיד",
    visualEncodingConfig: "דימוי חזק",
  };
  const copy = getRecognitionStepCopy("urge", item, state());
  assert.ok(!copy.framing.includes("עצור מיד"));
  assert.ok(!(copy.context ?? "").includes("עצור מיד"));
  assert.ok(!(copy.context ?? "").includes("דימוי חזק"));
});

test("getRecognitionStepCopy: content reuses the item's own headline/situation, never fabricated", () => {
  const item = { ...createEmptyThoughtInterferenceItem("t1", "מחשבה על כישלון", null, NOW), thoughtText: "אני אכשל", situationContext: "לפני פגישה" };
  const copy = getRecognitionStepCopy("thought", item, state());
  assert.ok((copy.context ?? "").includes("אני אכשל"));
  assert.ok((copy.context ?? "").includes("לפני פגישה"));
});

// ---------------------------------------------------------------------------
// Category-specific processing -- no fallback to StateProfile
// ---------------------------------------------------------------------------

test("getEmotionSupportStepCopy: reads only the item's own regulationCue, no fallback", () => {
  const item = { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), regulationCue: "עוגן ויסות אישי" };
  assert.equal(getEmotionSupportStepCopy(item).text, "עוגן ויסות אישי");
});

test("getEmotionSupportStepCopy: blank item field -> null, never falls back to any State value", () => {
  const item = createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW);
  assert.equal(getEmotionSupportStepCopy(item).text, null);
});

test("getUrgeSupportStepCopy: reads only the item's own regulationAnchor + encoding, no fallback", () => {
  const item = { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), regulationAnchor: "עוגן דחף", visualEncodingConfig: "דימוי" };
  const result = getUrgeSupportStepCopy(item);
  assert.ok(result.text?.includes("עוגן דחף"));
  assert.ok(result.text?.includes("דימוי"));
});

test("getUrgeSupportStepCopy: blank item fields -> null", () => {
  const item = createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW);
  assert.equal(getUrgeSupportStepCopy(item).text, null);
});

test("getBeliefAlternativeStepCopy / getThoughtAlternativeStepCopy: item-only, no fallback", () => {
  const belief = { ...createEmptyBeliefInterferenceItem("b1", "אמונה", null, NOW), supportiveBelief: "אני מסוגל" };
  assert.equal(getBeliefAlternativeStepCopy(belief).text, "אני מסוגל");
  const thought = { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), alternativeInterpretation: "יכול גם להיות אחרת" };
  assert.equal(getThoughtAlternativeStepCopy(thought).text, "יכול גם להיות אחרת");
});

test("getThoughtFutureInsightStepCopy returns the fixed line", () => {
  assert.equal(getThoughtFutureInsightStepCopy().text, THOUGHT_FUTURE_INSIGHT_FIXED_LINE);
});

// ---------------------------------------------------------------------------
// Shared Stay/Acceptance/Regulation -- no duplication with category-specific processing
// ---------------------------------------------------------------------------

test("getSharedStageCopy('shared_regulation'): shows state.regulationAnchor -- the ONE place it appears", () => {
  const copy = getSharedStageCopy("shared_regulation", state({ regulationAnchor: "עוגן המצב" }));
  assert.equal(copy.anchor, "עוגן המצב");
});

test("shared_regulation's anchor and emotion_support's own text never duplicate when the item has no field of its own", () => {
  const s = state({ regulationAnchor: "עוגן המצב" });
  const regulationCopy = getSharedStageCopy("shared_regulation", s);
  const emotionCopy = getEmotionSupportStepCopy(createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW));
  assert.equal(regulationCopy.anchor, "עוגן המצב");
  assert.equal(emotionCopy.text, null, "emotion_support never falls back to state.regulationAnchor, so nothing repeats shared_regulation's own line");
});

test("getSharedStageCopy('shared_stay'/'shared_acceptance'): fixed generic lines, no per-item content, no anchor", () => {
  assert.equal(getSharedStageCopy("shared_stay", state()).anchor, null);
  assert.equal(getSharedStageCopy("shared_acceptance", state()).anchor, null);
});

// ---------------------------------------------------------------------------
// Cognitive reassessment
// ---------------------------------------------------------------------------

test("resolveCognitiveReassessmentVariant: Thought only -> thought_only; Belief present (alone or with Thought) -> belief_present", () => {
  assert.equal(resolveCognitiveReassessmentVariant(true, false), "thought_only");
  assert.equal(resolveCognitiveReassessmentVariant(false, true), "belief_present");
  assert.equal(resolveCognitiveReassessmentVariant(true, true), "belief_present");
});

test("getCognitiveReassessmentCopy: exact required Hebrew wording for both variants", () => {
  const thoughtOnly = getCognitiveReassessmentCopy("thought_only");
  assert.equal(thoughtOnly.question, "האם המחשבה עדיין מושכת את תשומת הלב שלך?");
  assert.equal(thoughtOnly.notStuckLabel, "לא, אפשר להמשיך");
  assert.equal(thoughtOnly.stillStuckLabel, "כן, אני עדיין תקוע במחשבה");

  const beliefPresent = getCognitiveReassessmentCopy("belief_present");
  assert.equal(beliefPresent.question, "האם המחשבה או האמונה עדיין מושכות את תשומת הלב שלך?");
  assert.equal(beliefPresent.stillStuckLabel, "כן, אני עדיין תקוע בזה");
});

// ---------------------------------------------------------------------------
// Beneficial action
// ---------------------------------------------------------------------------

test("getBeneficialActionCopy: reads the State's own action + duration", () => {
  const s = state({ action: "לצאת להליכה", actionTimerConfig: { durationMinutes: 10 } });
  const copy = getBeneficialActionCopy(s);
  assert.equal(copy.body, "לצאת להליכה");
  assert.equal(copy.durationMinutes, 10);
});

test("getBeneficialActionCopy: blank action falls back to a generic body, never crashes", () => {
  const copy = getBeneficialActionCopy(state());
  assert.equal(typeof copy.body, "string");
  assert.ok(copy.body.length > 0);
});

test("NEUTRAL_PROCESSING_CONTINUATION_LINE is a non-empty, safe fallback string", () => {
  assert.ok(NEUTRAL_PROCESSING_CONTINUATION_LINE.length > 0);
  assert.equal(containsInductionPattern(NEUTRAL_PROCESSING_CONTINUATION_LINE), false);
});

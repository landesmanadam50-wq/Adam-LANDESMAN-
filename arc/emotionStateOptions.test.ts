import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyEmotionStateSelection, DEFAULT_ARC_SUGGESTION_INTENSITY_THRESHOLD, EMOTION_STATE_OPTION_LABELS, EMOTION_STATE_OPTIONS, shouldSuggestArcForIntensity } from "./emotionStateOptions.ts";

test("EMOTION_STATE_OPTIONS has exactly the 14 spec-named options, each with a non-empty Hebrew label", () => {
  assert.equal(EMOTION_STATE_OPTIONS.length, 14);
  assert.equal(new Set(EMOTION_STATE_OPTIONS).size, 14, "no duplicate options");
  for (const option of EMOTION_STATE_OPTIONS) {
    const label = EMOTION_STATE_OPTION_LABELS[option];
    assert.ok(typeof label === "string" && label.length > 0, `missing label for ${option}`);
  }
});

test("createEmptyEmotionStateSelection starts with no options selected, no custom text, and not marked still-unknown", () => {
  const selection = createEmptyEmotionStateSelection();
  assert.deepEqual(selection.options, []);
  assert.equal(selection.customText, null);
  assert.equal(selection.stillUnknown, false);
});

test("shouldSuggestArcForIntensity uses the documented default (4) when no personal threshold is configured", () => {
  assert.equal(DEFAULT_ARC_SUGGESTION_INTENSITY_THRESHOLD, 4);
  assert.equal(shouldSuggestArcForIntensity(5, null), true);
  assert.equal(shouldSuggestArcForIntensity(4, null), false);
  assert.equal(shouldSuggestArcForIntensity(3, null), false);
});

test("shouldSuggestArcForIntensity respects a personally configured threshold instead of the default", () => {
  assert.equal(shouldSuggestArcForIntensity(6, 7), false);
  assert.equal(shouldSuggestArcForIntensity(8, 7), true);
  assert.equal(shouldSuggestArcForIntensity(7, 7), false, "equal to threshold never suggests -- strictly above only");
});

test("a practice may still be started below the threshold -- this is a suggestion signal only, never an enforced gate: the function returns a plain boolean with no side effect that could block anything", () => {
  const belowThreshold = shouldSuggestArcForIntensity(1, 8);
  assert.equal(belowThreshold, false);
  // The absence of any exception/throw here IS the guarantee: callers remain free to proceed regardless of this value.
});

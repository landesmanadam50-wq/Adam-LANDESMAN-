import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyPreSessionGateAnswers, shouldSuggestArcFromGate } from "./preSessionGate.ts";
import type { PreSessionGateAnswers } from "./preSessionGate.ts";

test("createEmptyPreSessionGateAnswers starts with every field null -- no answer is ever required", () => {
  const answers = createEmptyPreSessionGateAnswers();
  assert.equal(answers.whatHappened, null);
  assert.equal(answers.intensity, null);
  assert.equal(answers.difficultyChoosingAction, null);
});

test("shouldSuggestArcFromGate never suggests when intensity was never answered, regardless of the other two fields", () => {
  const answers: PreSessionGateAnswers = { whatHappened: "ריב עם קולגה", intensity: null, difficultyChoosingAction: 9 };
  assert.equal(shouldSuggestArcFromGate(answers, 4), false);
});

test("shouldSuggestArcFromGate uses only the intensity answer, matching the documented default threshold when none is configured", () => {
  assert.equal(shouldSuggestArcFromGate({ whatHappened: null, intensity: 5, difficultyChoosingAction: null }, null), true);
  assert.equal(shouldSuggestArcFromGate({ whatHappened: null, intensity: 4, difficultyChoosingAction: null }, null), false);
});

test("shouldSuggestArcFromGate respects a personally configured threshold, never the default, once one exists", () => {
  assert.equal(shouldSuggestArcFromGate({ whatHappened: null, intensity: 6, difficultyChoosingAction: null }, 7), false);
  assert.equal(shouldSuggestArcFromGate({ whatHappened: null, intensity: 8, difficultyChoosingAction: null }, 7), true);
});

test("difficultyChoosingAction never affects the suggestion on its own -- it is recognition-only, not a decision input", () => {
  const withHighDifficulty: PreSessionGateAnswers = { whatHappened: null, intensity: null, difficultyChoosingAction: 10 };
  assert.equal(shouldSuggestArcFromGate(withHighDifficulty, null), false);
});

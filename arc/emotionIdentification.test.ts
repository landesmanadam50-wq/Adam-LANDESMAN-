import test from "node:test";
import assert from "node:assert/strict";

import {
  BODY_SENSATION_OPTIONS,
  CLOSEST_STATEMENT_OPTIONS,
  PREDEFINED_EMOTIONS,
  suggestEmotion,
} from "./emotionIdentification.ts";

test("there are exactly 10 body-sensation options and 9 closest-statement options, matching the product spec", () => {
  assert.equal(BODY_SENSATION_OPTIONS.length, 10);
  assert.equal(CLOSEST_STATEMENT_OPTIONS.length, 9);
});

test("there are exactly 7 predefined emotions", () => {
  assert.equal(PREDEFINED_EMOTIONS.length, 7);
});

test("each of the 7 direct statements maps deterministically to its own emotion, regardless of the body sensation answer", () => {
  assert.deepEqual(suggestEmotion("unknown", "fearOfFailing"), { kind: "emotion", emotion: "fear" });
  assert.deepEqual(suggestEmotion("heat", "fearOfJudgment"), { kind: "emotion", emotion: "shame" });
  assert.deepEqual(suggestEmotion("tension", "tryingNotProgressing"), { kind: "emotion", emotion: "frustration" });
  assert.deepEqual(suggestEmotion("heaviness", "tooMuchToDo"), { kind: "emotion", emotion: "overwhelm" });
  assert.deepEqual(suggestEmotion("restlessness", "boring"), { kind: "emotion", emotion: "boredom" });
  assert.deepEqual(suggestEmotion("heat", "angerOrResistance"), { kind: "emotion", emotion: "anger" });
  assert.deepEqual(suggestEmotion("heaviness", "sadnessOrHopelessness"), { kind: "emotion", emotion: "sadness" });
});

test("'none fits' always resolves to unidentified, never consulting the body sensation", () => {
  assert.deepEqual(suggestEmotion("heat", "noneFits"), { kind: "unidentified" });
  assert.deepEqual(suggestEmotion("abdomenContraction", "noneFits"), { kind: "unidentified" });
});

test("'I do not know' on the statement falls back to the body sensation's own deterministic mapping", () => {
  assert.deepEqual(suggestEmotion("abdomenContraction", "unknown"), { kind: "emotion", emotion: "fear" });
  assert.deepEqual(suggestEmotion("heat", "unknown"), { kind: "emotion", emotion: "anger" });
});

test("'I do not know' on both questions resolves to unidentified, never a crash or an invented guess", () => {
  assert.deepEqual(suggestEmotion("unknown", "unknown"), { kind: "unidentified" });
  assert.deepEqual(suggestEmotion("anotherSensation", "unknown"), { kind: "unidentified" });
});

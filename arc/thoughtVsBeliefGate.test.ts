import test from "node:test";
import assert from "node:assert/strict";

import { resolveFactorKindFromThoughtVsBeliefGate, THOUGHT_VS_BELIEF_ANSWER_OPTIONS } from "./thoughtVsBeliefGate.ts";

test("there are exactly 3 options", () => {
  assert.equal(THOUGHT_VS_BELIEF_ANSWER_OPTIONS.length, 3);
});

test("'broader belief' resolves to belief; 'this situation only' and 'unknown' both resolve to the shorter neutral thought route", () => {
  assert.equal(resolveFactorKindFromThoughtVsBeliefGate("broaderBelief"), "belief");
  assert.equal(resolveFactorKindFromThoughtVsBeliefGate("thisSituationOnly"), "thought");
  assert.equal(resolveFactorKindFromThoughtVsBeliefGate("unknown"), "thought");
});

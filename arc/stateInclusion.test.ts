import test from "node:test";
import assert from "node:assert/strict";

import { resolveStateInclusion } from "./stateInclusion.ts";

test("linked policy with a stateProfileId resolves linked", () => {
  assert.deepEqual(resolveStateInclusion("linked", "state1"), { kind: "linked", stateProfileId: "state1" });
});

test("linked policy with no stateProfileId resolves none defensively, never invents a candidate", () => {
  assert.deepEqual(resolveStateInclusion("linked", null), { kind: "none" });
});

test("none policy always resolves none, regardless of a stray stateProfileId", () => {
  assert.deepEqual(resolveStateInclusion("none", null), { kind: "none" });
  assert.deepEqual(resolveStateInclusion("none", "state1"), { kind: "none" });
});

test("decide_in_live with a candidate stateProfileId resolves decide_in_live, carrying that candidate", () => {
  assert.deepEqual(resolveStateInclusion("decide_in_live", "state1"), { kind: "decide_in_live", candidateStateProfileId: "state1" });
});

test("decide_in_live with no candidate resolves none defensively -- an undefined LIVE choice is never produced", () => {
  assert.deepEqual(resolveStateInclusion("decide_in_live", null), { kind: "none" });
});

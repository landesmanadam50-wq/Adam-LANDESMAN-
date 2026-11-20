import test from "node:test";
import assert from "node:assert/strict";

import { cycleShortBodyMarking, resolveShortBodyMarkingPhase } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { resolveSupportiveOpeningSelections } from "./bodyScanSelection.ts";

/**
 * arc/shortBodyMarking.test.ts
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * "short_body_marking" ("פחות טוב" short depth only) -- a ONE-screen
 * three-state (none -> red -> blue -> none) RED/BLUE body-marking
 * cycle, modeled on Mini ARC's own cycleMiniBodyScanRegion but with
 * its middle "lightGreen" phase deliberately removed (the spec names
 * only two colors here). Writes into the SAME existing fields every
 * other body-selection screen already uses -- no new session fields.
 */

const NOW = "2026-01-05T12:00:00.000Z";

function freshState(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull");
}

test("the cycle is exactly 3 states: none -> red -> blue -> none, never a 4th (light green) state", () => {
  let state = freshState();
  assert.equal(resolveShortBodyMarkingPhase(state, "scanShoulders", "left"), "none");
  state = cycleShortBodyMarking(state, "scanShoulders", "left");
  assert.equal(resolveShortBodyMarkingPhase(state, "scanShoulders", "left"), "red");
  state = cycleShortBodyMarking(state, "scanShoulders", "left");
  assert.equal(resolveShortBodyMarkingPhase(state, "scanShoulders", "left"), "blue");
  state = cycleShortBodyMarking(state, "scanShoulders", "left");
  assert.equal(resolveShortBodyMarkingPhase(state, "scanShoulders", "left"), "none", "the third tap must reset directly to none -- no 4th state exists");
});

test("red writes into bodyScanContractionRegions, exactly like every other red/contraction marking in this file", () => {
  let state = freshState();
  state = cycleShortBodyMarking(state, "scanAbdomen", null);
  assert.deepEqual(state.bodyScanContractionRegions, [{ region: "scanAbdomen", side: null }]);
  assert.deepEqual(state.openingBodyScanRegions, [], "red alone creates no opening/supportive entry yet");
});

test("blue writes role 'opening_and_supportive' into openingBodyScanRegions, and clears the red contraction entry -- the SAME field every other opening-role pathway already reads", () => {
  let state = freshState();
  state = cycleShortBodyMarking(state, "scanChest", null); // red
  state = cycleShortBodyMarking(state, "scanChest", null); // blue
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanChest", side: null, role: "opening_and_supportive" }]);
  assert.deepEqual(state.bodyScanContractionRegions, [], "the red entry is cleared once promoted to blue, never left stale alongside it");
  assert.deepEqual(resolveSupportiveOpeningSelections(state.openingBodyScanRegions), [{ region: "scanChest", side: null, role: "opening_and_supportive" }]);
});

test("resetting from blue back to none clears the opening/supportive entry entirely, with no contraction entry left behind either", () => {
  let state = freshState();
  state = cycleShortBodyMarking(state, "scanChest", null); // red
  state = cycleShortBodyMarking(state, "scanChest", null); // blue
  state = cycleShortBodyMarking(state, "scanChest", null); // none
  assert.deepEqual(state.openingBodyScanRegions, []);
  assert.deepEqual(state.bodyScanContractionRegions, []);
});

test("each (region, side) slot cycles completely independently of every other slot", () => {
  let state = freshState();
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // red
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // blue
  state = cycleShortBodyMarking(state, "scanAbdomen", null); // red only
  assert.equal(resolveShortBodyMarkingPhase(state, "scanShoulders", "left"), "blue");
  assert.equal(resolveShortBodyMarkingPhase(state, "scanAbdomen", null), "red");
  assert.equal(resolveShortBodyMarkingPhase(state, "scanChest", null), "none", "an untouched slot stays none");
});

test("the shared max-2-Blue limit (canPromoteToSupportiveOpening) blocks a third region from ever reaching blue, leaving it stuck at red", () => {
  let state = freshState();
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // red
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // blue (1st)
  state = cycleShortBodyMarking(state, "scanChest", null); // red
  state = cycleShortBodyMarking(state, "scanChest", null); // blue (2nd)
  state = cycleShortBodyMarking(state, "scanAbdomen", null); // red
  state = cycleShortBodyMarking(state, "scanAbdomen", null); // attempted blue -- blocked
  assert.equal(resolveShortBodyMarkingPhase(state, "scanAbdomen", null), "red", "the third region must stay at red, never promoted to blue");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2, "still exactly two blue regions -- the limit holds");
});

test("an already-blue region can still be reset to none even while the 2-blue cap is maxed out (the cap only blocks NEW promotions, never deselecting an existing one)", () => {
  let state = freshState();
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // red
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // blue (1st)
  state = cycleShortBodyMarking(state, "scanChest", null); // red
  state = cycleShortBodyMarking(state, "scanChest", null); // blue (2nd)
  state = cycleShortBodyMarking(state, "scanShoulders", "left"); // reset to none
  assert.equal(resolveShortBodyMarkingPhase(state, "scanShoulders", "left"), "none");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 1);
});

test("task context fields stay completely untouched by cycling the body marking", () => {
  let state = freshState();
  const before = { taskId: state.taskId, taskTitle: state.taskTitle, firstAction: state.firstAction, arcInvocationMode: state.arcInvocationMode };
  state = cycleShortBodyMarking(state, "scanShoulders", "left");
  state = cycleShortBodyMarking(state, "scanShoulders", "left");
  assert.equal(state.taskId, before.taskId);
  assert.equal(state.taskTitle, before.taskTitle);
  assert.equal(state.firstAction, before.firstAction);
  assert.equal(state.arcInvocationMode, before.arcInvocationMode);
});

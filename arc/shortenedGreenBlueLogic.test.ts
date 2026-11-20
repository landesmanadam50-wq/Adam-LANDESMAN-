import test from "node:test";
import assert from "node:assert/strict";

import {
  advance,
  completeFreeBreathingIntro,
  confirmBodyScanClosedness,
  confirmTimeAvailableRating,
  setBodyScanHeavinessRegion,
  setGoalType,
  setSelectedAction,
  toggleBodyScanContractionRegion,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { resolveBodyScanOpeningRole, resolveSupportiveOpeningSelections } from "./bodyScanSelection.ts";
import { resolveBodyMantraShapeAppearance } from "./arcBodyMantraCircleLogic.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function shortenedSession(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened");
}

function fullSession(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull");
}

/**
 * arc/shortenedGreenBlueLogic.test.ts
 *
 * ARCHI -- Add the Green/Blue Body Selection Model to Shortened ARC
 * ("סבבה") task, section 5: the 9 required regression scenarios.
 * Shortened ARC reuses the exact same engine (toggleOpeningBodyScanRegion/
 * cycleBodyScanOpeningRole/resolveSupportiveOpeningSelections/
 * resolveBodyMantraShapeAppearance) Full ARC's own green/blue screen
 * uses -- there is no second, duplicated body-selection system to test
 * separately; these tests confirm the SAME engine behaves correctly
 * when driven through the shortened pathway's own entry point
 * (the "supportive_area_select" screen), and that contraction stays
 * entirely absent from it.
 *
 * ARCHI -- Precise Body Opening and Stabilization Rules task, section
 * 1/4: Light Green now requires a region to be BOTH contracted AND
 * closed -- "Shortened ARC: do not add contraction selection." Since
 * bodyScanContractionRegions can therefore never hold an entry for a
 * shortened session, NO region tapped here can ever qualify as Light
 * Green any more -- every tap goes straight to Dark Blue (a 2-state
 * none<->blue cycle), never green. Scenarios 1-6 below (previously
 * exercising a green-then-blue cycle, before this task) are rewritten
 * to reflect that -- this is a deliberate, required behavior change
 * for this pathway specifically (section 4: "Allow selection of up to
 * two Blue supportive regions... for opening/stabilization during
 * Regulation"), never a reverted fix.
 */

function reachShortenedBodySelection(): NewArcLiveSessionState {
  let state = shortenedSession();
  state = setGoalType(state, "action", NOW);
  // ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task,
  // requirement 1: free_breathing now opens a shortened session too.
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: the new standalone time-available rating now sits right
  // here -- a full-depth rating (6-10) keeps the rest of this walk
  // completely unaffected.
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "supportive_area_select", "Shortened ARC's own body-selection screen");
  return state;
}

// 1. The selection model works end-to-end in Shortened ARC -- now a
// 2-state (none <-> blue) cycle, since green can never be reachable
// here (no contraction data exists in this pathway at all).
test("1. the Dark-Blue-only selection model works end-to-end in Shortened ARC, through its own supportive_area_select screen", () => {
  let state = reachShortenedBodySelection();
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "left"), "opening_and_supportive");
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "left"), "none", "a clear, consistent deselect -- the same obvious reset Full ARC's own screen uses");
});

// 2. First tap selects BLUE directly -- never green.
test("2. in Shortened ARC, the FIRST tap on any eligible (heaviness/closedness/instability-mapped) region selects it as DARK BLUE directly, skipping green entirely -- 'do not add contraction selection,' so no region here can ever qualify as Light Green (contracted AND closed)", () => {
  let state = reachShortenedBodySelection();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening_and_supportive" }]);
  assert.deepEqual(resolveSupportiveOpeningSelections(state.openingBodyScanRegions), [{ region: "scanShoulders", side: "left", role: "opening_and_supportive" }], "the very first selection is already a real supportive (Dark Blue) one");
});

// 3. A second tap on an already-blue region resets it to none (the
// 2-state cycle's own obvious reset) -- there is no third, green state
// to cycle through in this pathway.
test("3. a second tap on an already-DARK-BLUE region in Shortened ARC resets it to none -- the 2-state cycle's own obvious deselect, never a third (green) state", () => {
  let state = reachShortenedBodySelection();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [], "the second tap must reset, never advance to a non-existent third state");
});

// 4. Dark Blue always carries the opening role too (opening AND
// supportive, never supportive alone), even directly from the first tap.
test("4. Dark Blue in Shortened ARC always carries the opening role too -- opening AND supportive, never supportive alone, even selected directly on the first tap", () => {
  let state = reachShortenedBodySelection();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  const entry = state.openingBodyScanRegions.find((e) => e.region === "scanShoulders" && e.side === "left")!;
  assert.equal(entry.role, "opening_and_supportive");
  // Still a real opening target for Regulation -- resolveBodyMantraShapeAppearance (the shared classifier both pathways use) must still resolve movement for it.
  const appearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions: [], closureRegions: [], openingRegions: state.openingBodyScanRegions });
  assert.ok(appearance.movementDef, "a blue region in Shortened ARC must still receive its real opening movement");
});

// 5. Up to two Dark Blue regions open during Regulation, each one a
// fully real, independently-moving opening target.
test("5. up to two Dark Blue regions, selected via Shortened ARC's own screen, each open with real movement during Regulation", () => {
  let state = reachShortenedBodySelection();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // blue (1st)
  state = toggleOpeningBodyScanRegion(state, "scanChest", null); // blue (2nd)
  const firstAppearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions: [], closureRegions: [], openingRegions: state.openingBodyScanRegions });
  const secondAppearance = resolveBodyMantraShapeAppearance("scanChest", null, { contractionRegions: [], closureRegions: [], openingRegions: state.openingBodyScanRegions });
  assert.ok(firstAppearance.movementDef, "the first selected region must open");
  assert.ok(secondAppearance.movementDef, "the second selected region must ALSO open");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2, "both regions count as real supportive (Dark Blue) anchors");

  // ARCHI -- Consolidated Implementation Request, Part 1.2: Acceptance
  // is now permanently skipped for Shortened ARC -- Regulation follows
  // Body Selection directly.
  state = advance(state, NOW);
  assert.equal(state.currentStep, "regulation", "Regulation is still reached normally, reusing the existing gentle body-opening animations");
});

// 6. A third Dark Blue selection is blocked in Shortened ARC too --
// section 2's maximum-two limit is enforced by the SAME shared
// cycleBodyScanOpeningRole every pathway uses, never only in Full ARC.
test("6. a third Dark Blue selection is blocked in Shortened ARC too -- the shared maximum-two-Blue limit applies identically to every pathway, enforced in the state-management logic itself", () => {
  let state = reachShortenedBodySelection();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "none", "the third region must never be promoted to Dark Blue");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2, "still exactly two -- the limit holds");
});

// 7. Contraction is not selectable in Shortened ARC.
test("7. contraction is never selectable or reachable anywhere in the Shortened ARC pathway", () => {
  let state = reachShortenedBodySelection();
  const visited: string[] = [];
  let cursor = state;
  for (let i = 0; i < 20 && cursor.currentStep !== "complete"; i++) {
    visited.push(cursor.currentStep);
    if (cursor.currentStep === "supportive_area_select") {
      cursor = toggleOpeningBodyScanRegion(cursor, "palms", "left");
      cursor = advance(cursor, NOW);
    } else if (cursor.currentStep === "action_selection") {
      cursor = setSelectedAction(cursor, { source: "temporaryAction", title: "לסדר את החדר", durationMinutes: 10 }, NOW);
    } else {
      cursor = advance(cursor, NOW);
    }
  }
  assert.ok(!visited.includes("body_scan_contraction"), "Shortened ARC must never visit the contraction-selection step");
  assert.ok(!visited.includes("dwelling"), "Shortened ARC must never visit contraction's own dwelling step");
  assert.ok(!visited.includes("body_scan_closedness"), "Shortened ARC must never visit the (Full-ARC-only) closedness-selection step either -- its own body selection happens entirely on supportive_area_select");
  // And the data model itself: nothing a shortened session ever does
  // can populate bodyScanContractionRegions -- there is no reachable
  // setter call site for it in this pathway at all.
  assert.deepEqual(cursor.bodyScanContractionRegions, [], "a shortened session's contraction collection must stay empty throughout");
});

// 8. Full ARC contraction behavior remains unchanged.
test("8. Full ARC's own contraction selection/behavior is completely unaffected by extending green/blue to Shortened ARC", () => {
  let state: NewArcLiveSessionState = { ...fullSession(), currentStep: "body_scan_contraction" };
  state = toggleBodyScanContractionRegion(state, "scanAbdomen", null);
  assert.deepEqual(state.bodyScanContractionRegions, [{ region: "scanAbdomen", side: null }]);
  assert.deepEqual(state.openingBodyScanRegions, [], "selecting contraction in Full ARC must still never create any opening/supportive entry");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "none", "contraction still has no role concept in Full ARC either");

  // Full ARC's own Blue-only selection screen (body_scan_opening_region)
  // is still reachable there -- untouched by this task. ARCHI -- Full
  // ARC Body Flow Redesign task: dwelling/body_scan_closedness are both
  // now permanently unreachable, and Acceptance Part 1 ("acceptance")
  // sits directly after body_scan_contraction, with body_scan_opening_region
  // (Screen Two) only reached after it.
  let contractionState: NewArcLiveSessionState = { ...fullSession(), currentStep: "body_scan_contraction" };
  contractionState = toggleBodyScanContractionRegion(contractionState, "scanShoulders", "left");
  contractionState = advance(contractionState, NOW);
  assert.equal(contractionState.currentStep, "acceptance", "Acceptance Part 1 is reached right after body_scan_contraction -- dwelling/body_scan_closedness are both permanently unreachable now");
  contractionState = advance(contractionState, NOW);
  assert.equal(contractionState.currentStep, "body_scan_opening_region", "Full ARC's own Blue-only screen must still be reached right after Acceptance Part 1");
});

// 9. Existing ARC sessions and task context remain intact.
test("9. a shortened session's own task context (taskId/taskTitle/firstAction/arcInvocationMode) and every unrelated field stay completely intact through green/blue selection", () => {
  let state = reachShortenedBodySelection();
  const before = { ...state };
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  assert.equal(state.taskId, before.taskId);
  assert.equal(state.taskTitle, before.taskTitle);
  assert.equal(state.firstAction, before.firstAction);
  assert.equal(state.arcInvocationMode, "shortened");
  assert.deepEqual({ ...state, openingBodyScanRegions: before.openingBodyScanRegions }, before, "every OTHER field must be byte-for-byte unchanged -- only openingBodyScanRegions itself was touched");
});

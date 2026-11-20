import test from "node:test";
import assert from "node:assert/strict";

import {
  cycleMiniBodyScanRegion,
  goBack,
  migrateLegacyNewArcLiveStep,
  resolveMiniBodyScanTapPhase,
  toggleBodyScanContractionRegion,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { isBodyScanOpeningRoleSupportive, resolveBodyScanContractionState, resolveBodyScanOpeningRole, resolveSupportiveOpeningSelections } from "./bodyScanSelection.ts";

/**
 * arc/miniBodyThreeTapCycle.test.ts
 *
 * ARCHI -- Fix Mini ARC Interactive Body Selection and Three-Tap Color
 * Model task, section 8: the 14 required regression scenarios, in
 * order. Scenarios 1-9 and 12-14 are pure engine/state behavior, tested
 * directly against cycleMiniBodyScanRegion/resolveMiniBodyScanTapPhase
 * (arc/newArcLiveSteps.ts) and the shared bodyScanSelection.ts
 * primitives they reuse. Scenarios 10-11 (legend text, button removal)
 * are screen-rendering concerns, covered by source-text assertions in
 * live/newArcLiveScreen.test.ts instead, the same convention every
 * other screen test in this codebase already uses.
 */

const NOW = "2026-01-05T12:00:00.000Z";

function miniSession(): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedMini"), currentStep: "mini_acceptance_transition", subIndex: 0 };
}

test("1. Tapping a body region changes its selection -- cycleMiniBodyScanRegion mutates the session's own body-scan fields for that exact region", () => {
  const before = miniSession();
  const after = cycleMiniBodyScanRegion(before, "scanChest", null);
  assert.notDeepEqual(after.bodyScanContractionRegions, before.bodyScanContractionRegions);
});

test("2. First tap = Red (contraction only, not yet closed, not yet an opening role)", () => {
  const state = cycleMiniBodyScanRegion(miniSession(), "scanChest", null);
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "red");
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanChest", null), "contraction");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "none");
});

test("3. Second tap = Light Green (contraction AND closedness together, opening role 'opening')", () => {
  let state = miniSession();
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // red
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // light green
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "lightGreen");
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanChest", null), "contraction", "contraction is preserved, never cleared, once Light Green is reached");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "opening");
  assert.ok(
    state.bodyScanHeavinessRegions.some((entry) => entry.region === "scanChest" && entry.side === null && (entry.state === "closedness" || entry.state === "heaviness_and_closedness")),
    "the region is also marked closed -- Light Green eligibility requires BOTH contraction and closedness, never either alone"
  );
});

test("4. Third tap = Dark Blue (opening role promoted to 'opening_and_supportive')", () => {
  let state = miniSession();
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // red
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // light green
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // dark blue
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "darkBlue");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "opening_and_supportive");
});

test("5. Fourth tap = Deselect -- clears contraction, closedness, AND the opening role entirely, back to the true 'none' default", () => {
  let state = miniSession();
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // red
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // light green
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // dark blue
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // deselect
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "none");
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanChest", null), "none");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "none");
  assert.equal(state.bodyScanHeavinessRegions.some((entry) => entry.region === "scanChest" && entry.side === null), false);
  // A fifth tap starts the exact same cycle again from "none" -> red.
  const restarted = cycleMiniBodyScanRegion(state, "scanChest", null);
  assert.equal(resolveMiniBodyScanTapPhase(restarted, "scanChest", null), "red");
});

test("6. Region states remain independent -- tapping one region never affects any other region's own phase", () => {
  let state = miniSession();
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // red
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // light green
  state = cycleMiniBodyScanRegion(state, "scanAbdomen", null); // red, a completely different region
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "lightGreen", "scanChest keeps its own phase");
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanAbdomen", null), "red", "scanAbdomen has its own, independent phase");
  // Deselecting scanChest entirely never touches scanAbdomen.
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // dark blue
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // deselect
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "none");
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanAbdomen", null), "red", "untouched by scanChest's own full cycle");
});

function promoteToBlue(state: NewArcLiveSessionState, region: Parameters<typeof cycleMiniBodyScanRegion>[1], side: Parameters<typeof cycleMiniBodyScanRegion>[2]): NewArcLiveSessionState {
  let next = cycleMiniBodyScanRegion(state, region, side); // red
  next = cycleMiniBodyScanRegion(next, region, side); // light green
  next = cycleMiniBodyScanRegion(next, region, side); // dark blue (attempted)
  return next;
}

test("7. A maximum of two regions may reach Dark Blue in the same session", () => {
  let state = miniSession();
  state = promoteToBlue(state, "scanChest", null);
  state = promoteToBlue(state, "scanAbdomen", null);
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanChest", null), "darkBlue");
  assert.equal(resolveMiniBodyScanTapPhase(state, "scanAbdomen", null), "darkBlue");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2);
});

test("8. A THIRD Blue selection is rejected -- the state-management logic itself refuses it (never only a UI-level block), leaving the third region stuck at Light Green", () => {
  let state = miniSession();
  state = promoteToBlue(state, "scanChest", null);
  state = promoteToBlue(state, "scanAbdomen", null);
  // A third region reaches Light Green, then its own third tap is refused.
  state = cycleMiniBodyScanRegion(state, "upperBack", null); // red
  state = cycleMiniBodyScanRegion(state, "upperBack", null); // light green
  const beforeThirdAttempt = state;
  state = cycleMiniBodyScanRegion(state, "upperBack", null); // attempted dark blue -- must be refused
  assert.deepEqual(state, beforeThirdAttempt, "the session is returned completely unchanged -- the same silent-refusal contract cycleBodyScanOpeningRole already uses for Full ARC");
  assert.equal(resolveMiniBodyScanTapPhase(state, "upperBack", null), "lightGreen", "stuck at Light Green, never silently promoted");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2, "still exactly two Blue regions, never three");
});

test("9. Contraction is NEVER classified as supportive -- a Red-only region (contracted, not yet promoted) never appears among the supportive (Blue) selections, and Dark Blue's own supportive flag is a property of the opening role, never of bodyScanContractionRegions itself", () => {
  let state = miniSession();
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // red only
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 0, "a plain Red (contracted-only) region is never counted as supportive");
  state = promoteToBlue(miniSession(), "scanChest", null);
  const supportive = resolveSupportiveOpeningSelections(state.openingBodyScanRegions);
  assert.equal(supportive.length, 1);
  assert.ok(isBodyScanOpeningRoleSupportive(supportive[0].role));
  // The underlying contraction record for this same region is its own,
  // separate array entry -- promoting to Dark Blue never folds
  // contraction itself into the opening/supportive array, or vice versa.
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanChest", null), "contraction");
  assert.ok(!("role" in state.bodyScanContractionRegions[0]), "bodyScanContractionRegions entries never carry a role/supportive concept of their own");
});

test("12. Acceptance/Regulation's own existing stage-specific Green/Blue targeting rules (Precise Body Opening and Stabilization Rules task) are completely untouched by Mini ARC's own tap cycle -- Full ARC's own toggleOpeningBodyScanRegion/toggleBodyScanContractionRegion still behave exactly as before", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull"), currentStep: "body_scan_opening_region", subIndex: 0 };
  // A region never marked contracted structurally skips straight to
  // Dark Blue on Full ARC's own screen (2-state cycle) -- this rule
  // lives entirely in toggleOpeningBodyScanRegion/cycleBodyScanOpeningRole,
  // never touched by this task's new cycleMiniBodyScanRegion function.
  state = { ...state, bodyScanHeavinessRegions: [{ region: "scanChest", side: null, state: "closedness" }] };
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "opening_and_supportive", "Full ARC's own never-contracted-closure-region rule is unaffected");
});

test("13. Stored Mini ARC body selections survive backward navigation and session restoration", () => {
  let state = miniSession();
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // red
  state = cycleMiniBodyScanRegion(state, "scanChest", null); // light green
  const advanced = { ...state, currentStep: "mini_acceptance_transition" as const, subIndex: 1 };
  const wentBack = goBack(advanced, NOW);
  assert.equal(wentBack.currentStep, "mini_acceptance_transition");
  assert.equal(wentBack.subIndex, 0);
  assert.deepEqual(wentBack.bodyScanContractionRegions, state.bodyScanContractionRegions, "back-navigation never discards the tapped body-scan selections");
  assert.deepEqual(wentBack.openingBodyScanRegions, state.openingBodyScanRegions);
  // Session restoration (migrateLegacyNewArcLiveStep) never touches a
  // session already parked on a real, current currentStep -- the
  // selections pass straight through untouched.
  const restored = migrateLegacyNewArcLiveStep(state);
  assert.deepEqual(restored.bodyScanContractionRegions, state.bodyScanContractionRegions);
  assert.deepEqual(restored.openingBodyScanRegions, state.openingBodyScanRegions);
  assert.deepEqual(restored.bodyScanHeavinessRegions, state.bodyScanHeavinessRegions);
});

test("14. Full ARC and Shortened ARC do not regress -- their own existing body-opening tap cycles (toggleBodyScanContractionRegion/toggleOpeningBodyScanRegion) are structurally separate functions from cycleMiniBodyScanRegion, never sharing or overwriting each other's behavior", () => {
  // Full ARC: contraction and opening are still two SEPARATE screens/
  // steps, each with its own dedicated setter -- never auto-combined
  // into one tap the way Mini ARC's own screen now is.
  let fullState: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull") };
  fullState = toggleBodyScanContractionRegion(fullState, "scanChest", null);
  assert.equal(resolveBodyScanOpeningRole(fullState.openingBodyScanRegions, "scanChest", null), "none", "marking contraction on Full ARC's own screen never also sets an opening role -- that still requires its own separate screen/tap");

  // Shortened ARC: still has no contraction data at all ("do not add
  // contraction selection") -- toggleOpeningBodyScanRegion's own
  // isGreenEligible computation still reads false for it, exactly as
  // before this task.
  let shortenedState: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened") };
  shortenedState = toggleOpeningBodyScanRegion(shortenedState, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(shortenedState.openingBodyScanRegions, "palms", "left"), "opening_and_supportive", "Shortened ARC's own first tap still skips straight to Dark Blue -- unaffected by Mini ARC's own new cycle");
  assert.equal(shortenedState.bodyScanContractionRegions.length, 0, "Shortened ARC still never collects contraction data");
});

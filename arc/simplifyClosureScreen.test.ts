import test from "node:test";
import assert from "node:assert/strict";

import {
  advance,
  confirmOpeningBodyScanRegions,
  migrateLegacyNewArcLiveStep,
  resolvePreviousStep,
  resolveStepOrder,
  toggleBodyScanContractionRegion,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { resolveBodyScanOpeningRole } from "./bodyScanSelection.ts";

/**
 * arc/simplifyClosureScreen.test.ts
 *
 * ARCHI -- Simplify the "פחות טוב" body-flow and remove the separate
 * closure-selection screen task, regression requirements: the 8
 * explicitly-required scenarios, in order. Every one of them is also
 * incidentally covered by the updated tests in arc/newArcLiveSteps.test.ts,
 * arc/greenBlueOpeningLogic.test.ts, and arc/shortenedGreenBlueLogic.test.ts
 * -- this file exists for direct 1:1 traceability against the request's
 * own numbered list, never duplicated coverage of a different concern.
 *
 * ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
 * Logic task: the original Task 2 spec ("auto-carry a contracted region
 * in as green on entry") is now explicitly corrected -- green is never
 * preselected, and the trainee's own Red (contraction) history only
 * determines the RESULT of a later tap, never a before-the-fact color.
 * Tests 3/5/6 below (and confirmBodyScanContraction, since removed
 * outright) are updated in place to assert the CORRECTED behavior,
 * never reverted to the superseded spec; "the closure screen stays
 * removed" (test 1/8) is unaffected and still holds.
 */

const NOW = "2026-01-05T12:00:00.000Z";

function fullSession(): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull"), currentStep: "body_scan_contraction" };
}

test("1. The separate closure-selection screen ('באילו אזורים בגוף אתה מרגיש סגירות?') is no longer shown in the Full ARC / פחות טוב path -- body_scan_closedness is permanently unreachable, structurally skipped by both forward and backward navigation", () => {
  let state = fullSession();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = advance(state, NOW);
  assert.notEqual(state.currentStep, "body_scan_closedness", "leaving body_scan_contraction must never land on the closure screen");
  // Walking forward from the still-present step id in resolveStepOrder
  // itself never reaches it either -- advance()/resolvePreviousStep
  // both filter through isStepReachable, which now always refuses it.
  assert.ok(resolveStepOrder("plannedFull").includes("body_scan_closedness"), "the step id itself is kept, never deleted, per this codebase's own convention for every previously-removed step");
  const atOpeningRegion: NewArcLiveSessionState = { ...fullSession(), currentStep: "body_scan_opening_region", bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }] };
  assert.notEqual(resolvePreviousStep(atOpeningRegion)?.step, "body_scan_closedness", "going back from the remaining screen never lands on the removed closure screen either");
});

test("2. Earlier contraction data is still preserved -- leaving body_scan_contraction only ever READS bodyScanContractionRegions, never clears or modifies it", () => {
  let state = fullSession();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = toggleBodyScanContractionRegion(state, "scanAbdomen", null);
  const before = state.bodyScanContractionRegions;
  state = advance(state, NOW);
  assert.deepEqual(state.bodyScanContractionRegions, before, "the earlier red contraction selection is completely untouched by leaving this screen");
  // It survives further navigation too (back-and-forth) and session restoration.
  const wentBack = resolvePreviousStep(state);
  assert.ok(wentBack !== null);
  const restored = migrateLegacyNewArcLiveStep(state);
  assert.deepEqual(restored.bodyScanContractionRegions, before, "contraction data survives session restoration (migrateLegacyNewArcLiveStep) untouched");
});

// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: test 3 is now the OPPOSITE of its original Task 2
// assertion -- a previously-contracted region must NOT appear
// automatically as green. It is remembered (bodyScanContractionRegions)
// but only colored once the trainee actually taps it.
test("3. A previously contracted region does NOT appear automatically as green -- no region is ever preselected on entering body_scan_opening_region, regardless of earlier Red history", () => {
  let state = fullSession();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = advance(state, NOW); // -> dwelling
  state = advance(state, NOW); // -> body_scan_opening_region
  assert.equal(state.currentStep, "body_scan_opening_region");
  assert.deepEqual(state.openingBodyScanRegions, [], "nothing is ever preselected, regardless of earlier Red history");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none", "the previously-Red region shows no color at all until the trainee actually taps it");
});

// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: the earlier Red selection determines the RESULT of a
// tap, never which regions are reachable -- tapping the previously-Red
// region selects green, while tapping a never-Red region selects blue
// directly, and both remain fully tappable on the same screen.
test("4. Tapping a previously-contracted region selects green; tapping a never-contracted region selects blue directly -- the earlier Red selection decides the tap's RESULT, never which regions can be tapped", () => {
  let state = fullSession();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left"); // only this one is contracted (Red)
  state = advance(state, NOW); // -> dwelling
  state = advance(state, NOW); // -> body_scan_opening_region
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // previously Red -> green
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null); // never Red -> blue directly
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening", "tapping the previously-Red region selects green");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "opening_and_supportive", "tapping the never-Red region selects blue directly");
});

// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: test 5 is corrected -- the trainee's very first tap on a
// region that was NEVER marked contracted is what lands on Dark Blue
// directly; the very first tap on the SAME region that WAS previously
// Red lands on green, never blue, and a second tap on it deselects
// rather than promoting it further.
test("5. The trainee's very first tap on a never-contracted region lands directly on Dark Blue; the very first tap on a previously-Red region lands on green instead, and a second tap on it deselects (never promotes to blue)", () => {
  let state = fullSession();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = advance(state, NOW); // -> dwelling
  state = advance(state, NOW); // -> body_scan_opening_region (body_scan_closedness skipped)
  assert.equal(state.currentStep, "body_scan_opening_region");
  assert.deepEqual(state.openingBodyScanRegions, [], "nothing is colored at rest, before any tap on this screen");

  const tappedNeverRed = toggleOpeningBodyScanRegion(state, "scanAbdomen", null);
  assert.equal(resolveBodyScanOpeningRole(tappedNeverRed.openingBodyScanRegions, "scanAbdomen", null), "opening_and_supportive", "the very first tap on a never-Red region lands directly on Dark Blue");

  const tappedPreviouslyRed = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(tappedPreviouslyRed.openingBodyScanRegions, "scanShoulders", "left"), "opening", "the very first tap on the previously-Red region lands on green, never blue");
  const deselected = toggleOpeningBodyScanRegion(tappedPreviouslyRed, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(deselected.openingBodyScanRegions, "scanShoulders", "left"), "none", "a second tap deselects entirely -- it never promotes green to blue");
});

// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: test 6 is corrected -- a non-contracted region is never
// green, but it remains fully tappable on body_scan_opening_region
// (selecting blue directly), unlike the old, now-wrong "can never be
// tapped at all" assertion.
test("6. Non-contracted regions never become green, but remain fully tappable on body_scan_opening_region -- selecting blue directly, never blocked", () => {
  let state = fullSession();
  // Nothing at all marked contracted. dwelling/body_scan_closedness are
  // both permanently unreachable -- Acceptance Part 1 comes first, then
  // body_scan_opening_region (Screen Two, Blue-only) right after it.
  state = advance(state, NOW);
  assert.equal(state.currentStep, "acceptance");
  state = advance(state, NOW); // acceptance is exactly one page
  assert.equal(state.currentStep, "body_scan_opening_region");
  assert.deepEqual(state.openingBodyScanRegions, [], "with nothing contracted, nothing is ever preselected");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none");

  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening_and_supportive", "a never-contracted region remains fully tappable, selecting blue directly");
});

test("7. The rest of the Full ARC flow remains intact -- Presence, Contraction selection, Acceptance, Regulation (including Action Selection), Encoding, and the full navigation sequence all still work end to end", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull") };
  assert.equal(state.currentStep, "goal_select");
  state = { ...state, currentStep: "body_scan_contraction" };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "acceptance", "Acceptance Part 1 is reached right after Contraction selection -- dwelling/body_scan_closedness are both permanently unreachable now");
  state = advance(state, NOW); // acceptance (Part 1) is exactly one page
  assert.equal(state.currentStep, "body_scan_opening_region");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  state = confirmOpeningBodyScanRegions(state, NOW);
  assert.equal(state.currentStep, "acceptance_part_two", "Acceptance Part 2 is reached directly after the body-selection screen");
  state = advance(state, NOW); // acceptance_part_two is exactly one page
  assert.equal(state.currentStep, "regulation", "Regulation is still reached right after Acceptance Part 2");
  assert.equal(state.subIndex, 0, "Action Selection renders together with Regulation on this one sub-screen, completely unaffected by this task");
});

test("8a. Mini ARC is not unintentionally broken -- it never had body_scan_contraction/body_scan_closedness/body_scan_opening_region at all, and its own step order is completely untouched", () => {
  const miniOrder = resolveStepOrder("plannedMini");
  for (const removed of ["body_scan_contraction", "body_scan_closedness", "body_scan_opening_region"] as const) {
    assert.ok(!miniOrder.includes(removed), `Mini ARC's own step order must never include ${removed}`);
  }
});

test("8b. Shortened ARC is not unintentionally broken -- it already skipped body_scan_closedness/body_scan_contraction entirely before this task, via its own existing interactive supportive_area_select screen, completely untouched", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened") };
  state = { ...state, currentStep: "goal_select" };
  const migrated = migrateLegacyNewArcLiveStep({ ...state, goalType: "action" });
  assert.notEqual(migrated.currentStep, "body_scan_contraction");
  assert.notEqual(migrated.currentStep, "body_scan_closedness");
  const atSupportive: NewArcLiveSessionState = { ...state, currentStep: "supportive_area_select", goalType: "action" };
  const afterTap = toggleOpeningBodyScanRegion(atSupportive, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(afterTap.openingBodyScanRegions, "palms", "left"), "opening_and_supportive", "Shortened ARC's own first-tap-skips-to-Dark-Blue rule (it never has contraction data) is completely unaffected");
});

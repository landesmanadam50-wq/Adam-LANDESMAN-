import test from "node:test";
import assert from "node:assert/strict";

import {
  advance,
  confirmOpeningBodyScanRegions,
  cycleMiniBodyScanRegion,
  toggleBodyScanContractionRegion,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { MAX_SUPPORTIVE_OPENING_SELECTIONS, resolveBodyScanOpeningRole } from "./bodyScanSelection.ts";
import { resolveGreenOpeningActiveForStage } from "./arcBodyMantraCircleLogic.ts";

/**
 * arc/correctRedGreenBlueLogic.test.ts
 *
 * ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
 * Logic task: the 10 explicitly-required regression scenarios, in
 * order. This corrects the immediately-preceding (wrong) task's
 * auto-carry-as-green mechanism: Green is never preselected on
 * entering body_scan_opening_region; the earlier Red (contraction)
 * selection only determines the RESULT of a tap there -- previously-Red
 * -> Light Green, never-Red -> Dark Blue directly -- and never
 * restricts which regions are tappable.
 */

const NOW = "2026-01-05T12:00:00.000Z";

function fullSession(): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull"), currentStep: "body_scan_contraction" };
}

function reachOpeningRegion(contractedRegions: Array<{ region: Parameters<typeof toggleBodyScanContractionRegion>[1]; side: Parameters<typeof toggleBodyScanContractionRegion>[2] }>): NewArcLiveSessionState {
  let state = fullSession();
  for (const { region, side } of contractedRegions) {
    state = toggleBodyScanContractionRegion(state, region, side);
  }
  state = advance(state, NOW); // -> dwelling (or straight to body_scan_opening_region if nothing contracted)
  if (state.currentStep !== "body_scan_opening_region") {
    state = advance(state, NOW); // -> body_scan_opening_region
  }
  return state;
}

// 1. A previously Red region does not appear Green automatically on
// entering the next screen.
test("1. a previously Red region does not appear Green automatically on entering body_scan_opening_region -- nothing is ever preselected", () => {
  const state = reachOpeningRegion([{ region: "scanShoulders", side: "left" }]);
  assert.equal(state.currentStep, "body_scan_opening_region");
  assert.deepEqual(state.openingBodyScanRegions, [], "nothing is preselected, regardless of earlier Red history");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none", "the previously-Red region shows no color at all before any tap");
});

// 2. Tapping a previously Red region selects Green.
test("2. tapping a previously Red region selects Green", () => {
  let state = reachOpeningRegion([{ region: "scanShoulders", side: "left" }]);
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening", "tapping the previously-Red region selects Light Green");
});

// 3. Tapping a non-Red region selects Blue directly.
test("3. tapping a non-Red region selects Blue directly", () => {
  let state = reachOpeningRegion([{ region: "scanShoulders", side: "left" }]);
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null); // never Red
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "opening_and_supportive", "tapping a never-Red region selects Dark Blue directly, with no Green step in between");
});

// 4. All eligible regions remain tappable regardless of earlier Red
// selections -- the worked example: Head (forehead -- an anatomically
// unsuitable, non-movement-eligible region) selected Red -> taps
// Green; Neck (never Red) -> taps Blue; Shoulder (never Red) -> 2nd
// Blue. Selectability is governed by the full anatomical set, not by
// movement eligibility (a separate, independent concern).
test("4. all eligible regions remain tappable regardless of earlier Red selections (worked example: head/neck/shoulder)", () => {
  let state = reachOpeningRegion([{ region: "forehead", side: null }]);
  state = toggleOpeningBodyScanRegion(state, "forehead", null); // previously Red -> green
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "forehead", null), "opening");
  state = toggleOpeningBodyScanRegion(state, "scanNeck", null); // never Red -> blue (1st)
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanNeck", null), "opening_and_supportive");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // never Red -> blue (2nd)
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening_and_supportive");
});

// 5. A maximum of two Blue regions can be selected.
test("5. a maximum of two Blue regions can be selected -- a third attempted Blue promotion is silently refused", () => {
  let state = reachOpeningRegion([]);
  state = toggleOpeningBodyScanRegion(state, "scanNeck", null); // blue 1
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // blue 2
  const beforeThird = state.openingBodyScanRegions;
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null); // blue attempt 3 -- refused
  assert.deepEqual(state.openingBodyScanRegions, beforeThird, "a third Dark Blue selection must be refused, the array unchanged");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "none", "the third region must stay unselected");
});

// 6. Green selections do not count toward the Blue limit.
test("6. Green selections do not count toward the two-Blue limit", () => {
  let state = reachOpeningRegion([
    { region: "scanShoulders", side: "left" },
    { region: "scanChest", side: null },
    { region: "scanAbdomen", side: null },
  ]);
  // Three Green (previously-Red) selections -- all allowed, none counts toward the Blue limit.
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "opening");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "opening");
  // Two Blue selections (never-Red regions) are still both allowed afterward.
  state = toggleOpeningBodyScanRegion(state, "scanNeck", null);
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanNeck", null), "opening_and_supportive");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "left"), "opening_and_supportive");
});

// 7. Existing Red contraction data remains intact.
test("7. existing Red contraction data remains intact -- untouched by advancing, tapping, or deselecting on body_scan_opening_region", () => {
  let state = reachOpeningRegion([{ region: "scanShoulders", side: "left" }]);
  const beforeContraction = state.bodyScanContractionRegions;
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // green
  assert.deepEqual(state.bodyScanContractionRegions, beforeContraction);
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // deselect
  assert.deepEqual(state.bodyScanContractionRegions, beforeContraction, "the Red contraction data survives deselecting the opening/color choice");
  state = confirmOpeningBodyScanRegions(state, NOW);
  assert.deepEqual(state.bodyScanContractionRegions, beforeContraction, "...and survives leaving the screen entirely");
});

// 8. Light Green opening occurs only during Acceptance.
test("8. Light Green opening is active only during Acceptance (and dwelling, for documentation symmetry) -- never during Regulation or Encoding", () => {
  assert.equal(resolveGreenOpeningActiveForStage("dwelling"), true);
  assert.equal(resolveGreenOpeningActiveForStage("acceptance"), true);
  assert.equal(resolveGreenOpeningActiveForStage("regulation"), false, "Green opening must stop once Regulation begins");
  assert.equal(resolveGreenOpeningActiveForStage("encoding"), false);
});

// 9. The separate closure-selection screen stays removed.
test("9. the separate closure-selection screen (body_scan_closedness) stays permanently removed from the active flow", () => {
  const state = reachOpeningRegion([{ region: "scanShoulders", side: "left" }]);
  assert.notEqual(state.currentStep, "body_scan_closedness");
  // Walking the whole flow from body_scan_contraction never visits it either.
  let walked = fullSession();
  walked = toggleBodyScanContractionRegion(walked, "scanShoulders", "left");
  walked = advance(walked, NOW);
  assert.notEqual(walked.currentStep, "body_scan_closedness");
  walked = advance(walked, NOW);
  assert.notEqual(walked.currentStep, "body_scan_closedness");
});

// 10a. Mini ARC does not regress -- its own, fully independent
// four-phase cycleMiniBodyScanRegion mechanism (none -> red -> lightGreen
// -> darkBlue -> none) is untouched by this task.
test("10a. Mini ARC's own body-selection cycle (cycleMiniBodyScanRegion) is completely unaffected by this task", () => {
  const miniState: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: "mini_acceptance_transition" };
  const afterFirstTap = cycleMiniBodyScanRegion(miniState, "scanChest", null); // none -> red (marks contraction)
  assert.deepEqual(afterFirstTap.bodyScanContractionRegions, [{ region: "scanChest", side: null }]);
  assert.equal(resolveBodyScanOpeningRole(afterFirstTap.openingBodyScanRegions, "scanChest", null), "none", "Mini ARC's own first tap only marks red -- its second tap is what marks green");
  const afterSecondTap = cycleMiniBodyScanRegion(afterFirstTap, "scanChest", null); // red -> lightGreen
  assert.equal(resolveBodyScanOpeningRole(afterSecondTap.openingBodyScanRegions, "scanChest", null), "opening", "Mini ARC's own second-tap-green rule is untouched by this task");
});

// 10b. Shortened ARC does not regress -- its own supportive_area_select
// screen (first tap always skips straight to Dark Blue, since it never
// has contraction data) is completely unaffected.
test("10b. Shortened ARC's own supportive_area_select screen is completely unaffected -- its first tap still always skips straight to Dark Blue", () => {
  const shortenedState: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened"), currentStep: "supportive_area_select" };
  const afterTap = toggleOpeningBodyScanRegion(shortenedState, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(afterTap.openingBodyScanRegions, "palms", "left"), "opening_and_supportive");
  assert.deepEqual(shortenedState.bodyScanContractionRegions, [], "Shortened ARC never has contraction data at all, by design");
});

// Sanity check on the limit constant itself, so the above scenarios
// stay meaningful if it is ever retuned.
test("MAX_SUPPORTIVE_OPENING_SELECTIONS is exactly 2, as the spec requires", () => {
  assert.equal(MAX_SUPPORTIVE_OPENING_SELECTIONS, 2);
});

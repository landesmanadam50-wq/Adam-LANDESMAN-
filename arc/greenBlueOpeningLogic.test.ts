import test from "node:test";
import assert from "node:assert/strict";

import {
  cycleBodyScanOpeningRole,
  isBodyScanOpeningRoleSupportive,
  resolveBodyScanOpeningRole,
  resolveSupportiveOpeningSelections,
  setBodyScanOpeningRole,
} from "./bodyScanSelection.ts";
import type { BodyScanOpeningSelection } from "./bodyScanSelection.ts";
import {
  advance,
  confirmBodyScanClosedness,
  confirmOpeningBodyScanRegions,
  setBodyScanHeavinessRegion,
  toggleBodyScanContractionRegion,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { getStepContent, resolveEncodingMantra } from "./newArcLiveCopy.ts";
import { filterMovementEligibleSelections, isBodyRegionMovementEligible } from "./bodyRegionMovements.ts";
import { resolveBodyMantraShapeAppearance } from "./arcBodyMantraCircleLogic.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

/**
 * arc/greenBlueOpeningLogic.test.ts
 *
 * ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
 * task, section 9: the 14 required regression scenarios. Core rule
 * under test throughout: blue (opening_and_supportive) is opening PLUS
 * supportive attention, never supportive attention alone; green
 * (opening) is opening only, never presented as supportive; contraction
 * can never become supportive, even sharing a region with a blue
 * selection.
 *
 * ARCHI -- Precise Body Opening and Stabilization Rules task, section
 * 1: green ("Light Green") is now reachable only for a region ALSO
 * marked contracted ("contracted AND closed," never closed alone) --
 * every scenario below that exercises the FIRST ("none" -> "opening")
 * leg of the cycle now marks its target region contracted first
 * (toggleBodyScanContractionRegion), so "first tap selects green"
 * still means exactly that; a region tapped WITHOUT first being marked
 * contracted instead skips straight to blue (see
 * arc/lightGreenDarkBlueRules.test.ts's own dedicated eligibility
 * scenarios for that side of the rule).
 */

// 1. First tap selects green.
test("1. first tap on a CONTRACTED region selects it as green (opening only)", () => {
  let state = fresh();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }]);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening");
  assert.equal(isBodyScanOpeningRoleSupportive("opening"), false);
});

// 2. ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue
// Selection Logic task: a second tap on an already-green (previously-
// Red) region now DESELECTS it entirely -- it is never promoted to
// blue. Green is reachable only for a previously-Red region, and once
// selected green, a further tap only ever resets it to "none."
test("2. second tap on the same already-green (previously-Red) region deselects it entirely -- it is never promoted to blue", () => {
  let state = fresh();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [], "the second tap deselects entirely, never promoting green to blue");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none");
});

// 3. Blue is reachable directly for a never-Red region -- "blue must
// retain every functional property of green and add the supportive-
// area role," never replacing opening.
test("3. blue (reached directly, for a never-Red region) preserves the opening role -- it is never a replacement for opening, only an addition to it", () => {
  let state = fresh();
  // scanShoulders was never marked contracted, so the very first tap
  // lands directly on blue (opening_and_supportive).
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  const entry = state.openingBodyScanRegions.find((e) => e.region === "scanShoulders" && e.side === "left")!;
  assert.equal(entry.role, "opening_and_supportive");
  // The region is still movement-eligible / still a real opening target --
  // filterMovementEligibleSelections (the same gate the engine uses
  // throughout) must still accept it, exactly as a plain green entry would.
  assert.ok(isBodyRegionMovementEligible("scanShoulders"));
  assert.equal(filterMovementEligibleSelections(state.openingBodyScanRegions).length, 1, "a blue region is still a fully functional opening target");
});

// 4. Green does not imply supportive attention.
test("4. green (opening only) never implies supportive attention", () => {
  let state = fresh();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(isBodyScanOpeningRoleSupportive(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left") as "opening"), false);
  assert.deepEqual(resolveSupportiveOpeningSelections(state.openingBodyScanRegions), [], "a green-only selection must never appear in the supportive-only list");
});

// 5. Contraction cannot become blue/supportive -- there is no role
// concept on the contraction collection at all, structurally.
test("5. contraction can never become blue/supportive -- toggling contraction never touches openingBodyScanRegions, and the contraction type has no role field to misuse", () => {
  let state = fresh();
  state = toggleBodyScanContractionRegion(state, "scanAbdomen", null);
  assert.deepEqual(state.bodyScanContractionRegions, [{ region: "scanAbdomen", side: null }]);
  assert.deepEqual(state.openingBodyScanRegions, [], "selecting a contraction region must never create any opening/supportive entry for it");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "none", "a pure contraction region has no opening role at all, let alone a supportive one");
});

// 6. Contraction and blue closedness coexist in the same region --
// neither collection ever overwrites or erases the other.
// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: a previously-Red region can only ever reach green by
// tapping (never blue, per the corrected cycle) -- so this scenario
// uses setBodyScanOpeningRole directly to construct the blue role
// alongside independent contraction/closedness data, exactly the way
// the data model allows even though no ordinary tap sequence on a
// Red region can reach it any more.
test("6. contraction and a blue (opening_and_supportive) closedness selection coexist in the SAME physical region without either erasing the other", () => {
  let state = fresh();
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = setBodyScanHeavinessRegion(state, "scanShoulders", "left", "closedness");
  state = { ...state, openingBodyScanRegions: setBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left", "opening_and_supportive") };
  assert.deepEqual(state.bodyScanContractionRegions, [{ region: "scanShoulders", side: "left" }], "the contraction entry must survive untouched");
  assert.deepEqual(state.bodyScanHeavinessRegions, [{ region: "scanShoulders", side: "left", state: "closedness" }], "the closedness entry must survive untouched");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening_and_supportive", "the blue role must also be preserved, alongside the untouched contraction entry");
  // The visual classifier (shared by every drawn body shape) must never
  // present this region as contraction-colored any more, since opening
  // outranks contraction by design -- but the underlying contraction
  // DATA is still there, just not what is shown once opening exists.
  const appearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions: state.bodyScanContractionRegions,
    closureRegions: [],
    openingRegions: state.openingBodyScanRegions,
  });
  assert.ok(appearance.movementDef, "the region is shown and animated as an opening target, while the contraction entry itself was never deleted from the session");
});

// 7. Both green and blue regions open (movement) during Regulation --
// but each now RETAINS its own role's color (bug fix: a region
// selected as supportive must show BLUE, a region selected as
// closed/unstable-only must show GREEN, both visible at once, neither
// ever silently recolored to match the other).
test("7. both green and blue regions receive the SAME movement eligibility during Regulation, but each keeps its OWN role's color -- green (opening-only) and blue (opening_and_supportive) must never render identically", () => {
  const greenOnly: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening" }];
  const blueOnly: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening_and_supportive" }];
  const greenAppearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions: [], closureRegions: [], openingRegions: greenOnly });
  const blueAppearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions: [], closureRegions: [], openingRegions: blueOnly });
  assert.deepEqual(greenAppearance.movementDef, blueAppearance.movementDef, "movement eligibility stays identical regardless of role -- role only ever changes the color, never whether the region opens");
  assert.notDeepEqual([...greenAppearance.colorStops], [...blueAppearance.colorStops], "bug fix: role must change the color -- green and blue must never render through the same track");
  assert.ok(greenAppearance.movementDef, "an eligible region must still receive its real movement, regardless of role");
});

// 8. Blue regions participate in supportive attention.
test("8. blue regions (and only blue regions) participate in supportive attention", () => {
  const mixed: BodyScanOpeningSelection[] = [
    { region: "scanShoulders", side: "left", role: "opening" },
    { region: "scanChest", side: null, role: "opening_and_supportive" },
  ];
  const supportive = resolveSupportiveOpeningSelections(mixed);
  assert.deepEqual(supportive, [{ region: "scanChest", side: null, role: "opening_and_supportive" }]);
});

// 9. Green-only regions are never presented as supportive -- exercised
// through the one real call site that names a supportive region
// (mini_encoding's bodyLine via resolvePrimaryOpeningLabel's priority
// chain: blue first, then the older single-region field, then the
// coarse supportiveBodyArea fallback -- a green-only entry's own region
// name must never surface here).
test("9. a green-only region is never presented as the supportive area -- resolvePrimaryOpeningLabel (via getStepContent) skips it and falls through to the next rung", () => {
  const greenOnlyState: NewArcLiveSessionState = {
    ...fresh(),
    arcInvocationMode: "plannedMini",
    currentStep: "mini_encoding",
    goalType: "action",
    supportiveSensation: "רוגע",
    positiveMovement: "נשימה עמוקה",
    openingBodyScanRegions: [{ region: "scanShoulders", side: "left", role: "opening" }],
  };
  const content = getStepContent(greenOnlyState);
  const bodyLine = content.supporting[0] ?? "";
  assert.ok(!bodyLine.includes("כתפיים"), "the green-only region's own Hebrew label must never appear as a supportive area");

  const blueState: NewArcLiveSessionState = { ...greenOnlyState, openingBodyScanRegions: [{ region: "scanShoulders", side: "left", role: "opening_and_supportive" }] };
  const blueContent = getStepContent(blueState);
  assert.ok(blueContent.supporting[0]?.includes("כתפיים"), "once the SAME region is promoted to blue, it correctly becomes the supportive area");
});

// 10. No duplicate opening animations for overlapping selections --
// the data model stores at most one entry per region/side, so there is
// structurally only ever one movement resolved for it.
test("10. overlapping taps on the same region never produce duplicate opening entries or duplicate movement instructions", () => {
  let state = fresh();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // never-Red -> blue directly
  let matches = state.openingBodyScanRegions.filter((e) => e.region === "scanShoulders" && e.side === "left");
  assert.equal(matches.length, 1, "exactly one entry per region/side");
  assert.equal(filterMovementEligibleSelections(state.openingBodyScanRegions).length, 1, "exactly one movement-eligible entry, never a duplicate");

  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // deselect
  matches = state.openingBodyScanRegions.filter((e) => e.region === "scanShoulders" && e.side === "left");
  assert.equal(matches.length, 0, "deselecting never leaves a stray duplicate entry behind either");
});

// 11. Existing Acceptance behavior preserved -- still the fixed,
// generic mantra, never leaking a region name, regardless of any
// green/blue mix.
test("11. Acceptance's existing fixed mantra is preserved, verbatim, for any mix of green and blue selections", () => {
  const state: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "acceptance",
    openingBodyScanRegions: [
      { region: "scanShoulders", side: "left", role: "opening" },
      { region: "scanChest", side: null, role: "opening_and_supportive" },
    ],
  };
  const content = getStepContent(state);
  // ARCHI -- Full ARC Body Flow Redesign task: "acceptance" is now
  // exclusively Part 1, with its own exact required mantra, reached
  // BEFORE any Blue (opening_and_supportive) selection exists in
  // practice -- the fixed text itself is still read purely from the
  // step id, regardless of whatever this directly-constructed fixture
  // happens to carry on openingBodyScanRegions.
  assert.equal(content.primary, "אני שוהה ומקבל את הכיווץ.");
  assert.deepEqual(content.supporting, []);
  assert.ok(!content.primary.includes("כתפיים") && !content.primary.includes("חזה"), "Acceptance must never name a body region, green or blue");
});

// 12. Existing personalized Encoding behavior preserved -- Full ARC's
// resolveEncodingMantra is still driven by firstAction/desiredFeelingText,
// completely unaffected by the green/blue role split.
test("12. Encoding's existing personalized action-visualization mantra is unaffected by the green/blue role split", () => {
  const withGreenOnly: NewArcLiveSessionState = {
    ...fresh(),
    goalType: "action",
    firstAction: "לכתוב דוח",
    openingBodyScanRegions: [{ region: "scanShoulders", side: "left", role: "opening" }],
  };
  const withBlue: NewArcLiveSessionState = { ...withGreenOnly, openingBodyScanRegions: [{ region: "scanShoulders", side: "left", role: "opening_and_supportive" }] };
  assert.equal(resolveEncodingMantra(withGreenOnly), resolveEncodingMantra(withBlue), "the personalized action mantra must be identical regardless of role -- it never names a region at all");
  assert.equal(resolveEncodingMantra(withGreenOnly), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את לכתוב דוח.");
});

// 13. Saved ARC sessions remain compatible -- the auto-carry at
// body_scan_closedness always starts a region as green (never
// retroactively blue), and migrating/loading an old session (covered in
// data/storage.ts / live/newArcLiveScreen.test.ts) backfills a missing
// role to "opening". Verified at the engine level here.
//
// ARCHI -- Precise Body Opening and Stabilization Rules task, section
// 1: the auto-carry itself is now narrowed to CONTRACTED-AND-CLOSED
// regions only -- a closed-only region (never also marked contracted)
// no longer auto-carries as green at all, verified by the companion
// scenario right after this one.
test("13. saved sessions remain compatible: confirmBodyScanClosedness auto-carries a CONTRACTED-AND-CLOSED region in as GREEN (opening), never inventing a blue/supportive selection the trainee never made", () => {
  let state: NewArcLiveSessionState = { ...fresh(), goalType: "action", currentStep: "body_scan_closedness" };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = setBodyScanHeavinessRegion(state, "scanShoulders", "left", "closedness");
  state = confirmBodyScanClosedness(state, NOW);
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }]);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening", "auto-derived regions always start as green -- blue is only ever the trainee's own later, explicit choice");
});

// ARCHI -- Full ARC Body Flow Redesign task: body_scan_closedness and
// dwelling are now BOTH permanently unreachable (Acceptance Part 1
// immediately follows Screen One) -- advancing from body_scan_contraction
// now lands on "acceptance" first, then on "body_scan_opening_region"
// (Screen Two) right after it. body_scan_opening_region itself still no
// longer depends on any contraction data to be reachable -- a region
// never marked contracted at all still reaches it and remains fully
// tappable there (selecting blue directly), per this task's own
// correction.
test("13b (further corrected). Acceptance Part 1 immediately follows Screen One, and a region never marked contracted still reaches the later body_scan_opening_region directly -- it is unconditionally reachable, never falling through to supportive_area_select, and the region remains fully tappable there", () => {
  let state: NewArcLiveSessionState = { ...fresh(), goalType: "action", currentStep: "body_scan_contraction" };
  state = advance(state, NOW);
  assert.equal(state.currentStep, "acceptance", "Acceptance Part 1 immediately follows Screen One -- nothing (dwelling/closedness) sits between them any more");
  state = advance(state, NOW);
  assert.deepEqual(state.openingBodyScanRegions, [], "nothing was ever contracted, so nothing is ever preselected");
  assert.equal(state.currentStep, "body_scan_opening_region", "body_scan_opening_region is unconditionally reachable now, regardless of contraction data");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening_and_supportive", "the never-contracted region remains fully tappable, selecting blue directly");
});

// 14. Selection can be safely deselected/reset. ARCHI -- Correct the
// Full ARC Red-to-Green/Direct-to-Blue Selection Logic task: the cycle
// on a previously-Red region is now green -> none (2 taps, never 3) --
// a second tap is the "obvious way to deselect" the spec requires.
test("14. a selection can always be safely deselected/reset -- a second tap on a previously-Red (green) region clears it back to 'none' entirely, and setBodyScanOpeningRole('none') does the same directly", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // green
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // reset
  assert.deepEqual(state.openingBodyScanRegions, []);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none");

  // The direct setter path (used by confirmOpeningBodyScanRegions'
  // own callers and tests) offers the same reset explicitly.
  const direct = setBodyScanOpeningRole([{ region: "scanChest", side: null, role: "opening_and_supportive" }], "scanChest", null, "none");
  assert.deepEqual(direct, []);

  // Deselecting never blocks the screen's own continue action.
  // ARCHI -- Full ARC Body Flow Redesign task: "supportive_area_select"
  // is now reachable only for Shortened ARC (this fixture's own mode is
  // the "fresh()" default, never "shortened") -- the very next step is
  // "acceptance_part_two".
  const committed = confirmOpeningBodyScanRegions(state, NOW);
  assert.equal(committed.currentStep, "acceptance_part_two", "an empty selection is a valid, continuable state -- never a dead end");
});

// cycleBodyScanOpeningRole, directly, as the one shared mechanism both
// toggleOpeningBodyScanRegion call sites (Full ARC's
// body_scan_opening_region and shortened's supportive_area_select) use.
// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: the cycle is now none -> opening -> none (2 states, never
// 3) when isGreenEligible -- a second tap deselects rather than
// promoting green to blue, so a previously-Red region can never reach
// blue through this cycle at all.
test("cycleBodyScanOpeningRole walks none -> opening -> none, for any region/side, when isGreenEligible -- never promoted further to opening_and_supportive", () => {
  let selections: BodyScanOpeningSelection[] = [];
  selections = cycleBodyScanOpeningRole(selections, "palms", "right", true);
  assert.equal(resolveBodyScanOpeningRole(selections, "palms", "right"), "opening");
  selections = cycleBodyScanOpeningRole(selections, "palms", "right", true);
  assert.equal(resolveBodyScanOpeningRole(selections, "palms", "right"), "none", "the second tap deselects entirely, never promoting to opening_and_supportive");
  assert.deepEqual(selections, []);
});

test("cycleBodyScanOpeningRole walks none -> opening_and_supportive -> none (a 2-state cycle, skipping green entirely) when NOT isGreenEligible", () => {
  let selections: BodyScanOpeningSelection[] = [];
  selections = cycleBodyScanOpeningRole(selections, "palms", "right", false);
  assert.equal(resolveBodyScanOpeningRole(selections, "palms", "right"), "opening_and_supportive", "a region that can never be Light Green must go straight to Dark Blue on its very first tap");
  selections = cycleBodyScanOpeningRole(selections, "palms", "right", false);
  assert.equal(resolveBodyScanOpeningRole(selections, "palms", "right"), "none");
  assert.deepEqual(selections, []);
});

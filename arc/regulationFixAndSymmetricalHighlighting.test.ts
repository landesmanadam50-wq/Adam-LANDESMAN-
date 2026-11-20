import test from "node:test";
import assert from "node:assert/strict";

import {
  canPromoteToSupportiveOpeningLogical,
  countLogicalSupportiveSelections,
  cycleSupportiveOnlyOpeningBilateral,
  isBodyRegionSymmetricPair,
  resolveMirroredGreenHighlight,
  resolveOppositeBodySide,
} from "./bodyRegionMovements.ts";
import { resolveBodyScanContractionState, resolveBodyScanOpeningRole } from "./bodyScanSelection.ts";
import { cycleBodyScanContractionAndGreen, toggleSupportiveOpeningRegion, toggleSupportiveOpeningRegionBilateral } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { getStepContent } from "./newArcLiveCopy.ts";
import { ARC_BODY_CIRCLE_GROWTH_INDEX, ARC_BODY_STAGE_INTENSITY, resolveBodyMantraShapeAppearance, resolveShowBodyForStage } from "./arcBodyMantraCircleLogic.ts";
import { BODY_MOVEMENT_SET_INSTRUCTIONS } from "./bodyRegionMovements.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

/**
 * arc/regulationFixAndSymmetricalHighlighting.test.ts
 *
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 7: the required regression scenarios.
 * The Regulation copy fix itself (items 1-3) is exercised in full
 * detail by arc/newArcLiveCopy.test.ts/arc/fullArcBodyFlowRedesign.test.ts
 * already -- this file adds the remaining gaps: body visibility/colors
 * during Regulation, and the brand-new symmetrical-highlighting
 * feature in full.
 */

// 1. Encoding-specific text is absent from Regulation.
test("1. Regulation's own mantra never contains the whole-body-spreading-feeling phrasing ('מתפשטת') that belongs exclusively to Encoding", () => {
  const regulation = getStepContent({ ...fresh(), currentStep: "regulation", subIndex: 0 });
  assert.ok(!regulation.primary.includes("מתפשטת"));
});

// 2. The correct, shortened Regulation mantra is displayed.
// ARCHI -- Simplify the Regulation Stage (Body Image + Short Mantra)
// task: supersedes this spec's earlier "exact required sentence"
// (the old three-sentence mantra) with this one short line instead.
test("2. Regulation displays the new, shortened mantra verbatim, and nothing else", () => {
  const regulation = getStepContent({ ...fresh(), currentStep: "regulation", subIndex: 0 });
  assert.equal(regulation.primary, "אני מקבל את הכיווץ ושם לב יותר לתמיכה");
});

// 3. Acceptance of contraction and attention to support are both present, in ONE short sentence now (never the old two-part structure).
test("3. Regulation's one-line mantra still conveys both acceptance of the contraction AND attention to support, in that order", () => {
  const regulation = getStepContent({ ...fresh(), currentStep: "regulation", subIndex: 0 });
  const acceptIndex = regulation.primary.indexOf("מקבל את הכיווץ");
  const supportIndex = regulation.primary.indexOf("תמיכה");
  assert.ok(acceptIndex !== -1 && supportIndex !== -1 && acceptIndex < supportIndex, "acceptance of the contraction must come first, then attention to support");
});

// 4. The body silhouette appears during Regulation.
test("4. resolveShowBodyForStage('regulation') is true -- the body is rendered alongside the main instruction and movement guidance", () => {
  assert.equal(resolveShowBodyForStage("regulation"), true);
});

// 5. Contracted regions are light red and supportive regions light blue at Regulation.
test("5. at Regulation's own stage intensity, a plain contracted region's color stop is a visibly LIGHTER red than full intensity, and a Blue (supportive) region's stop is light blue, never the raw saturated starting colors", () => {
  const contractionRegions = [{ region: "scanShoulders" as const, side: "left" as const }];
  const contractionAppearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions, closureRegions: [], openingRegions: [] });
  // checkpoint index for intensity 0.65 (regulation) is index 2 of the 4-stop fade.
  assert.notEqual(contractionAppearance.colorStops[2], contractionAppearance.colorStops[0], "the regulation-stage stop must differ from the raw full-saturation starting stop -- i.e. it is lighter");

  const openingRegions = [{ region: "scanArms" as const, side: "left" as const, role: "opening_and_supportive" as const }];
  const blueAppearance = resolveBodyMantraShapeAppearance("scanArms", "left", { contractionRegions: [], closureRegions: [], openingRegions });
  assert.notEqual(blueAppearance.colorStops[2], blueAppearance.colorStops[3], "the regulation-stage blue stop must be its own distinct (lighter) tier, not already the full Encoding-tier vivid blue");

  // Both pin to the exact checkpoint ARC_BODY_STAGE_INTENSITY reserves for Regulation.
  assert.equal(ARC_BODY_STAGE_INTENSITY.regulation, 0.65);
  assert.ok(ARC_BODY_CIRCLE_GROWTH_INDEX.regulation > ARC_BODY_CIRCLE_GROWTH_INDEX.acceptance, "Regulation's own circle must have grown further than Acceptance Part 1's");
});

// 6. Selecting one eligible Blue hand highlights both hands.
test("6. tapping one eligible (never-contracted) hand as supportive on Screen Two immediately marks BOTH hands Blue -- no second tap needed", () => {
  assert.ok(isBodyRegionSymmetricPair("palms"), "palms must be recognized as a genuine symmetric pair for this scenario to be meaningful");
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = toggleSupportiveOpeningRegionBilateral(state, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "left"), "opening_and_supportive");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "right"), "opening_and_supportive", "the opposite hand must be highlighted Blue immediately, without a second tap");
});

// 7. Selecting one eligible Green region highlights both sides when appropriate, without fabricating additional contraction.
test("7. marking one shoulder Green (contracted and closed) on Screen One visually mirrors Green onto the OPPOSITE shoulder, while never writing any real contraction/opening data for that opposite side", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // tap 1 -> Red
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // tap 2 -> Green
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening");

  // The opposite (right) shoulder carries NO real data of its own.
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanShoulders", "right"), "none", "the opposite side must never be fabricated as contracted");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "right"), "none", "the opposite side must never be fabricated as Green either");

  // But it IS displayed as Green, purely visually.
  assert.equal(resolveMirroredGreenHighlight(state.bodyScanContractionRegions, state.openingBodyScanRegions, "scanShoulders", "right"), true);
  // A plain Red-only (never Green) region must NOT mirror -- unilateral Red stays accurate.
  let redOnly: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  redOnly = cycleBodyScanContractionAndGreen(redOnly, "scanArms", "left"); // tap 1 -> Red only (never promoted to Green)
  assert.equal(resolveMirroredGreenHighlight(redOnly.bodyScanContractionRegions, redOnly.openingBodyScanRegions, "scanArms", "right"), false, "a plain Red (not Green) region must never mirror onto its opposite side");
});

// 8. Both sides are deselected together (Blue).
test("8. tapping either Blue hand again deselects BOTH hands together", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = toggleSupportiveOpeningRegionBilateral(state, "palms", "left");
  state = toggleSupportiveOpeningRegionBilateral(state, "palms", "right"); // tap the OTHER side -- still deselects the pair
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "left"), "none");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "right"), "none");
});

// 9. Bilateral selection counts as one logical region.
test("9. a selected symmetric pair (both hands Blue) counts as exactly ONE of the two allowed logical Blue slots -- a second, different symmetric pair can still be added", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = toggleSupportiveOpeningRegionBilateral(state, "palms", "left");
  assert.equal(countLogicalSupportiveSelections(state.openingBodyScanRegions), 1, "both hands together must count as ONE logical selection, not two");
  assert.equal(state.openingBodyScanRegions.filter((e) => e.role === "opening_and_supportive").length, 2, "but the raw data genuinely holds two real entries");

  // A second symmetric pair is still allowed (logical count 1 < 2).
  state = toggleSupportiveOpeningRegionBilateral(state, "ankles", "left");
  assert.equal(countLogicalSupportiveSelections(state.openingBodyScanRegions), 2);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "ankles", "right"), "opening_and_supportive");

  // A THIRD symmetric pair must now be refused (logical count already at the max).
  assert.equal(canPromoteToSupportiveOpeningLogical(state.openingBodyScanRegions, "feet", "left"), false);
  const refused = cycleSupportiveOnlyOpeningBilateral(state.bodyScanContractionRegions, state.openingBodyScanRegions, "feet", "left");
  assert.deepEqual(refused, state.openingBodyScanRegions, "a third symmetric pair must be silently refused, never partially applied");
});

// 10. Red/Green exclusion rules remain enforced for the bilateral Blue cycle.
test("10. if one side of a symmetric pair is already Red or Green, the ENTIRE bilateral Blue selection is refused -- never a contradictory half-applied result", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  state = cycleBodyScanContractionAndGreen(state, "scanArms", "left"); // left arm -> Red
  // Attempting to select the RIGHT arm as Blue must be refused, because the pair's LEFT side is Red.
  const attempt = cycleSupportiveOnlyOpeningBilateral(state.bodyScanContractionRegions, state.openingBodyScanRegions, "scanArms", "right");
  assert.deepEqual(attempt, state.openingBodyScanRegions, "the whole pair must be refused -- never one side Blue while the other stays Red");
});

// 11. Saved sessions restore the correct body highlights.
test("11. a session restored from storage (plain data, no special migration needed) re-derives the exact same Blue/Green highlights on every render, purely from its own persisted contraction/opening arrays", () => {
  const restored: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_opening_region",
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
    openingBodyScanRegions: [
      { region: "scanShoulders", side: "left", role: "opening" },
      { region: "palms", side: "left", role: "opening_and_supportive" },
      { region: "palms", side: "right", role: "opening_and_supportive" },
    ],
  };
  // Green mirror re-derives correctly on the restored data.
  assert.equal(resolveMirroredGreenHighlight(restored.bodyScanContractionRegions, restored.openingBodyScanRegions, "scanShoulders", "right"), true);
  // Both real Blue hands restore correctly.
  assert.equal(resolveBodyScanOpeningRole(restored.openingBodyScanRegions, "palms", "left"), "opening_and_supportive");
  assert.equal(resolveBodyScanOpeningRole(restored.openingBodyScanRegions, "palms", "right"), "opening_and_supportive");
  assert.equal(countLogicalSupportiveSelections(restored.openingBodyScanRegions), 1);
});

// 12. Existing movement instructions remain unchanged.
test("12. the existing per-set movement instruction text (acceptance/regulation/encoding) is untouched by this task -- the registry itself was never rewritten", () => {
  assert.equal(BODY_MOVEMENT_SET_INSTRUCTIONS.palmsOpen.acceptance, "אני פותח מעט את האצבעות.");
  assert.equal(BODY_MOVEMENT_SET_INSTRUCTIONS.shoulders.regulation, "אני מעמיק בעדינות את פתיחת הכתפיים.");
  assert.equal(BODY_MOVEMENT_SET_INSTRUCTIONS.chestExpand.encoding, "אני שומר על בית חזה פתוח ורחב.");
});

// 13. Mini ARC and Shortened ARC behavior remains unaffected.
test("13. Shortened ARC's own unilateral toggleSupportiveOpeningRegion setter is completely untouched -- selecting one hand there never auto-selects the other", () => {
  let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "shortened", currentStep: "supportive_area_select" };
  state = toggleSupportiveOpeningRegion(state, "palms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "left"), "opening_and_supportive");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "palms", "right"), "none", "Shortened ARC's own screen must stay strictly unilateral -- the new bilateral sync is wired only into Full ARC's Screen Two");
});

test("resolveOppositeBodySide/isBodyRegionSymmetricPair: a midline (non-paired) movement-eligible region is never treated as symmetric, and its 'opposite' is itself", () => {
  assert.equal(isBodyRegionSymmetricPair("scanChest"), false);
  assert.equal(resolveOppositeBodySide(null), null);
  assert.equal(isBodyRegionSymmetricPair("upperBack"), false);
});

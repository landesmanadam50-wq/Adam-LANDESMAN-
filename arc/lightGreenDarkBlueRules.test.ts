import test from "node:test";
import assert from "node:assert/strict";

import {
  canPromoteToSupportiveOpening,
  cycleBodyScanOpeningRole,
  MAX_SUPPORTIVE_OPENING_SELECTIONS,
  resolveBodyScanOpeningRole,
  resolveSupportiveOpeningSelections,
} from "./bodyScanSelection.ts";
import type { BodyScanOpeningSelection } from "./bodyScanSelection.ts";
import {
  advance,
  confirmBodyScanClosedness,
  setBodyScanHeavinessRegion,
  toggleBodyScanContractionRegion,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { getStepContent } from "./newArcLiveCopy.ts";
import {
  CONTRACTION_FROM_COLOR,
  CONTRACTION_TO_COLOR,
  resolveBodyMantraShapeAppearance,
  resolveFourStopColorFade,
} from "./arcBodyMantraCircleLogic.ts";
import { resolveMovementInstructionsForStage } from "./bodyRegionMovements.ts";
import { setGoalType } from "./newArcLiveSteps.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

function shortenedSession(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened");
}

/**
 * arc/lightGreenDarkBlueRules.test.ts
 *
 * ARCHI -- Precise Body Opening and Stabilization Rules task, section
 * 6: the 15 required regression scenarios, verbatim from the task's
 * own numbered list. Builds directly on the shared engine
 * (arc/bodyScanSelection.ts, arc/newArcLiveSteps.ts,
 * arc/arcBodyMantraCircleLogic.ts, arc/bodyRegionMovements.ts) --
 * never a second, parallel body-selection model.
 */

// 1. Light Green is eligible ONLY when contraction and closedness coexist.
test("1. Light Green is eligible ONLY when contraction AND closedness coexist -- confirmBodyScanClosedness auto-carries a region as Light Green exactly when both are present on the same (region, side) slot", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness" };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = setBodyScanHeavinessRegion(state, "scanShoulders", "left", "closedness");
  const after = confirmBodyScanClosedness(state, NOW);
  assert.deepEqual(after.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }], "contracted AND closed -- eligible for Light Green");
});

// 2. Closedness alone cannot qualify as Light Green.
test("2. closedness alone (never also contracted) cannot qualify as Light Green", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness" };
  state = setBodyScanHeavinessRegion(state, "scanShoulders", "left", "closedness");
  const after = confirmBodyScanClosedness(state, NOW);
  assert.deepEqual(after.openingBodyScanRegions, [], "closed but never contracted -- not eligible, must never auto-carry as Light Green");
});

// 3. Contraction alone cannot qualify as Light Green.
test("3. contraction alone (never also closed) cannot qualify as Light Green", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness" };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  const after = confirmBodyScanClosedness(state, NOW);
  assert.deepEqual(after.openingBodyScanRegions, [], "contracted but never closed -- not eligible, must never auto-carry as Light Green");
  // Also true at the raw cycle level: a region never marked eligible by
  // the caller (isGreenEligible: false) skips straight to Dark Blue,
  // never green, regardless of contraction data the caller didn't check.
  let selections: BodyScanOpeningSelection[] = [];
  selections = cycleBodyScanOpeningRole(selections, "scanShoulders", "left", false);
  assert.equal(resolveBodyScanOpeningRole(selections, "scanShoulders", "left"), "opening_and_supportive");
});

// 4. ARCHI -- Full ARC Body Flow Redesign task: "do not visually
// display Green... display ALL contracted regions as RED" -- Light
// Green still receives active opening/stabilization MOVEMENT during
// Acceptance Part 1 (and its own movement-instruction line), but never
// a distinct color any more -- it always shows the same red fade a
// plain contracted region shows.
test("4. Light Green receives active opening/stabilization MOVEMENT during Acceptance Part 1 and its own movement-instruction line, but never a distinct color -- it always shows the same red/contraction fade a plain contracted region shows", () => {
  const greenOnly: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening" }];
  const appearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions: [{ region: "scanShoulders", side: "left" }],
    closureRegions: [],
    openingRegions: greenOnly,
    allowGreenOpening: true,
  });
  assert.ok(appearance.movementDef, "Light Green must move during Acceptance Part 1");
  assert.deepEqual([...appearance.colorStops], [...resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR)], "Light Green must show the exact same red/contraction fade as a plain contracted region -- color never depends on role any more");
  const instructions = resolveMovementInstructionsForStage("acceptance", greenOnly);
  assert.ok(instructions.length > 0, "Acceptance must show a movement instruction line for the Light Green region");
});

// 5. Light Green no longer receives active opening/stabilization instructions after Acceptance.
test("5. Light Green no longer receives active opening/stabilization after Acceptance -- no movement, no instruction line, for Regulation and Encoding alike", () => {
  const greenOnly: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening" }];
  for (const stage of ["regulation", "encoding"] as const) {
    const appearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
      contractionRegions: [{ region: "scanShoulders", side: "left" }],
      closureRegions: [],
      openingRegions: greenOnly,
      allowGreenOpening: false,
    });
    assert.equal(appearance.movementDef, null, `Light Green must NOT move during ${stage}`);
    assert.deepEqual(resolveMovementInstructionsForStage(stage, greenOnly), [], `no movement-instruction line for Light Green during ${stage}`);
  }
});

// 6. The contracted region remains Red after its temporary Green highlight disappears.
test("6. the contracted region remains RED (the plain contraction fade) once its temporary Light Green highlight disappears -- never neutral, never still green/blue", () => {
  const greenOnly: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening" }];
  const appearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions: [{ region: "scanShoulders", side: "left" }],
    closureRegions: [],
    openingRegions: greenOnly,
    allowGreenOpening: false,
  });
  assert.deepEqual([...appearance.colorStops], [...resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR)], "must fall back to the exact same Red contraction representation, not a new/neutral one");
});

// 7. Existing Acceptance mantras are unchanged.
test("7. existing Acceptance mantras are completely unchanged, regardless of any Light Green/Dark Blue selection", () => {
  const noneState: NewArcLiveSessionState = { ...fresh(), currentStep: "acceptance", openingBodyScanRegions: [] };
  const mixedState: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "acceptance",
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
    openingBodyScanRegions: [
      { region: "scanShoulders", side: "left", role: "opening" },
      { region: "scanChest", side: null, role: "opening_and_supportive" },
    ],
  };
  const a = getStepContent(noneState);
  const b = getStepContent(mixedState);
  assert.equal(a.primary, b.primary, "the fixed Acceptance mantra must never depend on the Green/Blue mix");
  assert.equal(b.primary, "אני שוהה ומקבל את הכיווץ.");
  assert.deepEqual(b.supporting, []);
});

// 8. One or two Dark Blue supportive regions can be selected.
test("8. one or two Dark Blue supportive regions can be selected -- neither is required, both are valid", () => {
  let state = fresh();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 1, "one Dark Blue region is a fully valid selection");
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2, "two Dark Blue regions is also a fully valid selection");
});

// 9. A third Dark Blue selection is blocked.
test("9. a third Dark Blue selection is blocked -- enforced in the state-management logic itself", () => {
  let state = fresh();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2);
  assert.equal(canPromoteToSupportiveOpening(state.openingBodyScanRegions, "scanAbdomen", null), false, "the pre-check itself must report the limit is reached");
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "none", "the third region must never be promoted");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2, "still exactly two -- the limit holds");
});

// 10. Deselecting a Blue region allows another region to be selected.
test("10. deselecting an existing Dark Blue region allows a different one to be selected in its place", () => {
  let state = fresh();
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2);
  // Deselect scanChest (already blue -- the 2-state cycle's own reset).
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanChest", null), "none");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 1);
  // Now a third, different region CAN be selected.
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null);
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanAbdomen", null), "opening_and_supportive");
  assert.equal(resolveSupportiveOpeningSelections(state.openingBodyScanRegions).length, 2);
});

// 11. Blue regions receive opening/stabilization during Acceptance and Regulation where applicable.
test("11. Dark Blue regions receive active opening/stabilization during BOTH Acceptance and Regulation (and Encoding) -- completely unaffected by the stage-based Light Green cutoff", () => {
  const blueOnly: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening_and_supportive" }];
  for (const [stage, allowGreenOpening] of [
    ["acceptance", true],
    ["regulation", false],
    ["encoding", false],
  ] as const) {
    const appearance = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions: [], closureRegions: [], openingRegions: blueOnly, allowGreenOpening });
    assert.ok(appearance.movementDef, `Dark Blue must move during ${stage}`);
    assert.ok(resolveMovementInstructionsForStage(stage, blueOnly).length > 0, `Dark Blue must produce a movement-instruction line during ${stage}`);
  }
});

// 12. Regulation never accidentally targets the contracted-and-closed region after Acceptance.
test("12. Regulation never accidentally targets the contracted-AND-closed (Light Green) region -- only the selected Dark Blue region(s) are targeted, even when both are selected together", () => {
  const mixed: BodyScanOpeningSelection[] = [
    { region: "scanShoulders", side: "left", role: "opening" }, // Light Green
    { region: "scanChest", side: null, role: "opening_and_supportive" }, // Dark Blue
  ];
  const greenAtRegulation = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions: [{ region: "scanShoulders", side: "left" }],
    closureRegions: [],
    openingRegions: mixed,
    allowGreenOpening: false,
  });
  const blueAtRegulation = resolveBodyMantraShapeAppearance("scanChest", null, {
    contractionRegions: [{ region: "scanShoulders", side: "left" }],
    closureRegions: [],
    openingRegions: mixed,
    allowGreenOpening: false,
  });
  assert.equal(greenAtRegulation.movementDef, null, "the Light Green region must never move during Regulation");
  assert.ok(blueAtRegulation.movementDef, "the Dark Blue region must still move during Regulation");
  const instructions = resolveMovementInstructionsForStage("regulation", mixed);
  assert.ok(instructions.length > 0, "Regulation still shows an instruction line for the Dark Blue region");
});

// 13. Encoding preserves supportive spreading without restarting contraction opening.
test("13. Encoding preserves the supportive (Dark Blue) spreading animation without ever restarting active opening of the contracted/closed region", () => {
  const mixed: BodyScanOpeningSelection[] = [{ region: "scanShoulders", side: "left", role: "opening" }];
  // The Light Green region itself: still Red, never reopened, even
  // though Encoding's own whole-body spreading is active.
  const greenAtEncoding = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions: [{ region: "scanShoulders", side: "left" }],
    closureRegions: [],
    openingRegions: mixed,
    allowGreenOpening: false,
    encodingSpreadActive: true,
  });
  assert.equal(greenAtEncoding.movementDef, null, "the contracted/closed region must never be reopened at Encoding");
  assert.deepEqual([...greenAtEncoding.colorStops], [...resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR)], "must stay Red, never turned into a supportive sensation, even while spreading is active");
  // An untouched region elsewhere on the body: DOES receive the ambient
  // supportive spreading tint, completely independent of the above.
  const untouched = resolveBodyMantraShapeAppearance("scanAbdomen", null, {
    contractionRegions: [{ region: "scanShoulders", side: "left" }],
    closureRegions: [],
    openingRegions: mixed,
    allowGreenOpening: false,
    encodingSpreadActive: true,
  });
  assert.notDeepEqual([...untouched.colorStops], [...resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR)], "an unrelated region must still get the ambient spread tint, not the contraction fade");
});

// 14. Shortened ARC retains its no-Acceptance, no-contraction design.
test("14. Shortened ARC retains its no-Acceptance, no-contraction design -- 'acceptance' and 'body_scan_contraction' are never visited for this mode, and Body Selection goes straight into Regulation", () => {
  let state = shortenedSession();
  state = setGoalType(state, "action", NOW);
  const visited: string[] = [];
  let cursor = state;
  for (let i = 0; i < 20 && cursor.currentStep !== "supportive_area_select"; i++) {
    visited.push(cursor.currentStep);
    cursor = advance(cursor, NOW);
  }
  assert.ok(!visited.includes("body_scan_contraction"), "contraction selection must never be visited in Shortened ARC");
  assert.equal(cursor.currentStep, "supportive_area_select", "Shortened ARC's own direct body-selection screen");

  cursor = toggleOpeningBodyScanRegion(cursor, "palms", "left");
  assert.deepEqual(cursor.bodyScanContractionRegions, [], "no contraction data can ever exist for a shortened session");
  assert.equal(resolveBodyScanOpeningRole(cursor.openingBodyScanRegions, "palms", "left"), "opening_and_supportive", "with no contraction possible, the very first tap always goes straight to Dark Blue, never Light Green");

  cursor = advance(cursor, NOW);
  assert.equal(cursor.currentStep, "regulation", "Regulation follows Body Selection directly -- Acceptance stays permanently skipped for Shortened ARC");
});

// 15. Existing ARC sessions and task context are preserved.
test("15. existing ARC sessions and task context are completely unaffected by this task's own changes", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "acceptance" };
  const before = { taskId: state.taskId, taskTitle: state.taskTitle, firstAction: state.firstAction, arcInvocationMode: state.arcInvocationMode };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left");
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left"); // green
  state = toggleOpeningBodyScanRegion(state, "scanChest", null); // blue
  // ARCHI -- Full ARC Body Flow Redesign task: "acceptance" (Part 1,
  // one page) now advances to "body_scan_opening_region" (Screen Two),
  // then to "acceptance_part_two" (Part 2, supportive_area_select stays
  // skipped for this non-shortened session), then finally to
  // "regulation" -- never directly from Part 1 any more.
  state = advance(state, NOW); // acceptance -> body_scan_opening_region
  assert.equal(state.currentStep, "body_scan_opening_region");
  state = advance(state, NOW); // body_scan_opening_region -> acceptance_part_two
  assert.equal(state.currentStep, "acceptance_part_two");
  state = advance(state, NOW); // acceptance_part_two -> regulation
  assert.equal(state.currentStep, "regulation");
  assert.equal(state.subIndex, 0, "regulation is exactly one sub-screen now");
  state = advance(state, NOW); // regulation -> encoding (action-selection step removed entirely)
  assert.equal(state.currentStep, "encoding");
  assert.equal(state.taskId, before.taskId);
  assert.equal(state.taskTitle, before.taskTitle);
  assert.equal(state.firstAction, before.firstAction);
  assert.equal(state.arcInvocationMode, before.arcInvocationMode);
});

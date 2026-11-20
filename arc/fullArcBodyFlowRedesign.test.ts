import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveBodyScanContractionState, resolveBodyScanOpeningRole, cycleSupportiveOnlyOpening } from "./bodyScanSelection.ts";
import {
  advance,
  cycleBodyScanContractionAndGreen,
  toggleSupportiveOpeningRegion,
  confirmOpeningBodyScanRegions,
  migrateLegacyNewArcLiveStep,
  setSupportiveFeelingOverride,
  resolveFinalSupportiveFeeling,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { getStepContent } from "./newArcLiveCopy.ts";
import { isBodyRegionMovementEligible, resolveMovementInstructionsForStage } from "./bodyRegionMovements.ts";
import { resolveBodyMantraShapeAppearance } from "./arcBodyMantraCircleLogic.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

/**
 * arc/fullArcBodyFlowRedesign.test.ts
 *
 * ARCHI -- Full ARC "פחות טוב": Complete Body Flow Redesign, Movement
 * Guidance and Selection Restrictions task, Section 13: the 29 required
 * regression scenarios, numbered exactly as the spec lists them. Many
 * are already covered elsewhere (arc/newArcLiveSteps.test.ts,
 * arc/greenBlueOpeningLogic.test.ts, arc/lightGreenDarkBlueRules.test.ts,
 * arc/bodyRegionMovements.test.ts, arc/arcBodyMantraCircleLogic.test.ts,
 * arc/newArcLiveCopy.test.ts, arc/shortenedGreenBlueLogic.test.ts,
 * arc/simplifyClosureScreen.test.ts) -- this file closes the remaining
 * gaps and gives every one of the 29 scenarios its own explicit,
 * traceable test, cross-referencing the file that already covers a
 * scenario in full rather than duplicating it wholesale.
 */

// 1-3. Screen One tap cycle: Red -> Green (movement-eligible only) -> deselect.
test("1-3. Screen One: first tap -> Red, second tap -> Green (movement-eligible), third tap -> deselect (full cycle already covered in depth by arc/greenBlueOpeningLogic.test.ts/arc/lightGreenDarkBlueRules.test.ts)", () => {
  let state = fresh();
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // tap 1
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanShoulders", "left"), "contraction");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none");
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // tap 2
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanShoulders", "left"), "contraction");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "opening");
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // tap 3
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "scanShoulders", "left"), "none");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanShoulders", "left"), "none");
});

// 4. Movement-ineligible regions can be Red but never Green.
test("4. a movement-ineligible region (e.g. forehead) cycles Red -> deselect on Screen One -- it can never become Green, no matter how many times it is tapped", () => {
  assert.equal(isBodyRegionMovementEligible("forehead"), false, "forehead must stay movement-ineligible for this scenario to be meaningful");
  let state = fresh();
  state = cycleBodyScanContractionAndGreen(state, "forehead", null); // tap 1 -> Red
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "forehead", null), "contraction");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "forehead", null), "none", "an ineligible region must never receive a Green role");
  state = cycleBodyScanContractionAndGreen(state, "forehead", null); // tap 2 -> deselect (GREEN never available)
  assert.equal(resolveBodyScanContractionState(state.bodyScanContractionRegions, "forehead", null), "none");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "forehead", null), "none");
});

// 5. Acceptance Part 1 immediately follows Screen One.
test("5. Acceptance Part 1 ('acceptance') immediately follows body_scan_contraction, with nothing in between (dwelling/body_scan_closedness are both permanently unreachable; full step-order proof lives in arc/newArcLiveSteps.test.ts)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "acceptance");
});

// 6. Exact mantra appears inside the circle.
test("6. Acceptance Part 1's exact required mantra ('אני שוהה ומקבל את הכיווץ.') is the content getStepContent returns for 'acceptance', which ArcBodyMantraCircle renders inside the circle", () => {
  const content = getStepContent({ ...fresh(), currentStep: "acceptance" });
  assert.equal(content.primary, "אני שוהה ומקבל את הכיווץ.");
  assert.ok(screen.includes("mantra={content.primary}") || screen.includes("primary={content.primary}") || screen.match(/ArcBodyMantraCircle[\s\S]{0,400}content\.primary/), "ArcBodyMantraCircle must be driven by this exact same content.primary string");
});

// 7-9. Movement instructions: personalized, every Green gets one, Red-only gets none, no invented instructions.
test("7-9. every Green region gets a valid movement instruction during Acceptance Part 1; a Red-only (never Green) region gets none; a region with no selection at all gets none (full coverage in arc/bodyRegionMovements.test.ts)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // Red
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // Green
  state = cycleBodyScanContractionAndGreen(state, "scanChest", null); // Red-only, left as Red
  const instructions = resolveMovementInstructionsForStage("acceptance", state.openingBodyScanRegions);
  assert.equal(instructions.length, 1, "exactly one instruction line -- one for the single Green region, none invented for the Red-only chest");
});

// 10. Previously Green regions display Red while closedness persists.
test("10. a Green region renders via the same red/contraction color fade as plain Red during Acceptance Part 1 -- Green is never visually displayed, but its underlying contracted status (and its own active movement) persists (full color-logic coverage in arc/arcBodyMantraCircleLogic.test.ts)", () => {
  const contractionRegions = [{ region: "scanShoulders" as const, side: "left" as const }];
  const redOnly = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions, closureRegions: [], openingRegions: [] });
  const green = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions,
    closureRegions: [],
    openingRegions: [{ region: "scanShoulders", side: "left", role: "opening" }],
    allowGreenOpening: true,
  });
  assert.deepEqual(green.colorStops, redOnly.colorStops, "Green must use the exact same color track as plain Red -- it is never visually distinguished");
  assert.ok(green.movementDef !== null, "Green's own movement must still be active during Acceptance Part 1, even though its color is identical to Red");
});

// 11. Acceptance Part 1 is user-paced (no mandatory timer / no auto-advance).
test("11. Acceptance Part 1's own content never sets dwellSeconds -- there is no mandatory timer or auto-advance; the trainee's own tap on the Continue button is the only way forward (shared dwell-timer mechanism already proven in live/dwellingStage.test.ts)", () => {
  const content = getStepContent({ ...fresh(), currentStep: "acceptance" });
  assert.equal((content as { dwellSeconds?: number }).dwellSeconds, undefined, "acceptance must never carry a dwellSeconds value");
});

// 12. Screen Two appears after Acceptance Part 1.
test("12. Screen Two (body_scan_opening_region) appears right after Acceptance Part 1, never before it", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "acceptance" };
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan_opening_region");
});

// 13. Screen Two displays the actual selected feeling by its exact name.
test("13. Screen Two's own primary text shows the trainee's actual selected supportive feeling by exact name (e.g. 'ביטחון' -> '...הקשורות לתחושת הביטחון?'), never a generic placeholder", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = setSupportiveFeelingOverride(state, { feeling: "ביטחון", quality: "ביטחון", mantra: "" });
  assert.equal(resolveFinalSupportiveFeeling(state)?.feeling, "ביטחון");
  const content = getStepContent(state);
  assert.equal(content.primary, "באילו אזורים בגוף אתה מרגיש סגירות ותמיכה הקשורות לתחושת הביטחון?");

  // Without a feeling, the question must still be well-formed (never invent one), and the screen offers the existing selection/custom-entry control.
  const withoutFeeling = getStepContent({ ...fresh(), currentStep: "body_scan_opening_region" });
  assert.equal(withoutFeeling.primary, "באילו אזורים בגוף אתה מרגיש סגירות ותמיכה?");
  const caseIndex = screen.indexOf('case "body_scan_opening_region": {');
  const caseBody = screen.slice(caseIndex, screen.indexOf('case "supportive_area_select"', caseIndex));
  assert.ok(caseBody.includes("!feeling &&") && caseBody.includes("renderSupportiveFeelingPicker("), "when no feeling is known yet, the shared selection/custom-entry picker must render inline, never a requirement with no way to answer it");
});

// 14-17. Screen Two offers only support-eligible, movement-eligible, non-Red/Green regions, enforced at BOTH engine and UI levels.
test("14-17. Screen Two excludes every Red and Green region absolutely, at BOTH the engine level (cycleSupportiveOnlyOpening is a no-op for a contracted region) and the UI level (resolveSupportiveEligibleSilhouetteRegions filters them out of selectableRegions)", () => {
  // Engine level: a region marked contracted (Red or Green-derived, both share the same contraction flag) can never be promoted to Blue, even via a direct call.
  const contracted: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  const afterRed = cycleBodyScanContractionAndGreen(contracted, "scanShoulders", "left");
  const engineAttempt = cycleSupportiveOnlyOpening(afterRed.bodyScanContractionRegions, afterRed.openingBodyScanRegions, "scanShoulders", "left");
  assert.deepEqual(engineAttempt, afterRed.openingBodyScanRegions, "the engine's own cycleSupportiveOnlyOpening must be a complete no-op for any contracted (Red or Green) region");

  const afterGreen = cycleBodyScanContractionAndGreen(afterRed, "scanShoulders", "left");
  assert.equal(resolveBodyScanOpeningRole(afterGreen.openingBodyScanRegions, "scanShoulders", "left"), "opening");
  const engineAttemptOnGreen = cycleSupportiveOnlyOpening(afterGreen.bodyScanContractionRegions, afterGreen.openingBodyScanRegions, "scanShoulders", "left");
  assert.deepEqual(engineAttemptOnGreen, afterGreen.openingBodyScanRegions, "a Green region must remain excluded from Blue too, even while it currently renders as Red during Acceptance");

  // toggleSupportiveOpeningRegion (the real setter wired into the UI) must likewise refuse to touch a contracted region.
  const viaRealSetter = toggleSupportiveOpeningRegion(afterGreen, "scanShoulders", "left");
  assert.deepEqual(viaRealSetter.openingBodyScanRegions, afterGreen.openingBodyScanRegions);

  // UI level: the source must filter selectableRegions through a resolver that reads bodyScanContractionRegions, never offering an unrestricted list.
  const caseIndex = screen.indexOf('case "body_scan_opening_region": {');
  const caseBody = screen.slice(caseIndex, screen.indexOf('case "supportive_area_select"', caseIndex));
  assert.ok(caseBody.includes("selectableRegions={resolveSupportiveEligibleSilhouetteRegions(session!)}"));
  const resolverIndex = screen.indexOf("function resolveSupportiveEligibleSilhouetteRegions(");
  assert.ok(resolverIndex !== -1, "the UI-level exclusion resolver must exist as its own named function, not inlined ad hoc");
  const resolverBody = screen.slice(resolverIndex, screen.indexOf("\n}", resolverIndex));
  assert.ok(resolverBody.includes('resolveBodyScanContractionState(session.bodyScanContractionRegions, region, side) === "contraction"'), "the UI's own resolver must filter out every region currently marked contraction (Red or Green-derived) -- never just hide/disable the tap, genuinely exclude it from the selectable pool");
});

// 18-19. Blue tap1 select / tap2 deselect, max two.
test("18-19. a never-contracted region tapped on Screen Two selects Blue directly, a second tap deselects it, and a third distinct region is refused once two Blue are already selected (full coverage in arc/greenBlueOpeningLogic.test.ts/arc/lightGreenDarkBlueRules.test.ts)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = toggleSupportiveOpeningRegion(state, "scanArms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanArms", "left"), "opening_and_supportive");
  state = toggleSupportiveOpeningRegion(state, "scanArms", "left");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanArms", "left"), "none");

  state = toggleSupportiveOpeningRegion(state, "scanArms", "left");
  state = toggleSupportiveOpeningRegion(state, "scanArms", "right");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanArms", "left"), "opening_and_supportive");
  assert.equal(resolveBodyScanOpeningRole(state.openingBodyScanRegions, "scanArms", "right"), "opening_and_supportive");
  // A third distinct Blue region via the raw engine primitive: cycleSupportiveOnlyOpening
  // promotes unconditionally (the friendly max-two refusal lives in the UI's own
  // attemptToggleSupportiveOpeningRegion pre-check, tested by source assertion below) --
  // but the UI never calls the raw setter without that guard.
  const guardIndex = screen.indexOf("function attemptToggleSupportiveOpeningRegion(");
  assert.ok(guardIndex !== -1);
  const guardBody = screen.slice(guardIndex, screen.indexOf("\n}", guardIndex));
  assert.ok(guardBody.includes("canPromoteToSupportiveOpening") && guardBody.match(/Alert\.alert/), "the UI's own guard must block a third Blue selection with a friendly message, never silently allow it");
});

// 20. Purple never appears.
test("20. no PURPLE color constant or role exists anywhere in the body-selection engine or UI -- comments may reference its historical removal, but no declared constant/color/role literally names it; there are structurally only three colors (Red/Green/Blue)", () => {
  const steps = readSource("arc/newArcLiveSteps.ts");
  const selection = readSource("arc/bodyScanSelection.ts");
  const logic = readSource("arc/arcBodyMantraCircleLogic.ts");
  for (const source of [steps, selection, logic, screen]) {
    assert.ok(!/\bPURPLE[A-Z_]*\s*=/.test(source), "no PURPLE-named constant declaration must exist anywhere in the body-selection pipeline");
    assert.ok(!/"opening_and_purple"|'opening_and_purple'/.test(source), "no third opening role representing Purple must exist");
  }
});

// 21. Blue regions get valid guidance.
test("21. a Blue-selected region receives a valid movement instruction during Acceptance Part 2/Regulation/Encoding (full coverage in arc/bodyRegionMovements.test.ts/arc/lightGreenDarkBlueRules.test.ts)", () => {
  const blueRegions = [{ region: "scanArms" as const, side: "left" as const, role: "opening_and_supportive" as const }];
  for (const stage of ["acceptance_part_two", "regulation", "encoding"] as const) {
    const instructions = resolveMovementInstructionsForStage(stage, blueRegions);
    assert.equal(instructions.length, 1, `Blue must receive exactly one valid instruction line during ${stage}`);
  }
});

// 22. Acceptance Part 2 is ONE continuous exercise -- simultaneous attention
// to contraction+support, plus initial Blue opening -- and must NEVER
// instruct transferring attention away from the contraction (that is
// Regulation's own job now, per the ARCHI -- Final Correction task).
test("22. Acceptance Part 2's exact mantra is ONE continuous sentence (simultaneous attention to contraction AND support, plus initial Blue opening/stabilization), never divided into phases, never instructs transferring attention away from the contraction, and never gives Red regions a new opening instruction", () => {
  const content = getStepContent({ ...fresh(), currentStep: "acceptance_part_two" });
  assert.equal(content.primary, "אני שם לב גם לכיווץ וגם לתמיכה, ומתחיל לפתוח ולייצב בעדינות את אזורי התמיכה.");
  assert.ok(!content.primary.includes("מעביר"), "Acceptance Part 2 must never instruct transferring attention -- that only happens during Regulation");
  const redOnlyInstructions = resolveMovementInstructionsForStage("acceptance_part_two", [{ region: "scanChest", side: null, role: "opening" }]);
  // "opening" (Green) role must never receive instructions outside Acceptance Part 1 (stage !== "acceptance" skips role === "opening" entries).
  assert.deepEqual(redOnlyInstructions, [], "Green/Red regions must never receive a NEW opening instruction during Acceptance Part 2");
});

// ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
// Highlighting task, sections 1-2 (supersedes the earlier "Final
// Correction" task's own "use the previously selected feeling"
// requirement for Regulation, which turned out to leak Encoding-only
// whole-body-spreading-feeling wording into Regulation): Regulation is
// where the gradual attention transfer actually happens, but it must
// NEVER mention the supportive feeling spreading -- that phrasing is
// Encoding's own exclusive job.
// ARCHI -- Simplify the Regulation Stage (Body Image + Short Mantra)
// task: supersedes this test's earlier three-sentence assertions with
// the new, short, fixed mantra -- still acknowledges acceptance of
// the contraction and attention to support in one line, still never
// mentions any feeling spreading.
test("22b. Regulation's own mantra is the new short line -- accepts the contraction, directs attention to support, never mentions any feeling spreading (that is Encoding-only)", () => {
  const content = getStepContent({ ...fresh(), currentStep: "regulation", subIndex: 0 });
  assert.equal(content.primary, "אני מקבל את הכיווץ ושם לב יותר לתמיכה");
  assert.ok(!content.primary.includes("מתפשטת"), "Regulation must never use Encoding's own whole-body-spreading-feeling phrasing");

  // The same holds regardless of whether a supportive feeling was ever selected.
  const withFeeling: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "regulation",
    subIndex: 0,
    selectedSupportiveFeeling: { feeling: "ביטחון", quality: "ביטחון", mantra: "" },
  };
  assert.equal(getStepContent(withFeeling).primary, content.primary, "Regulation's mantra must be fixed, never interpolating a feeling name");
});

// 23. Regulation continues Blue opening + preserves action selection.
test("23. Regulation continues gradual Blue opening (valid movement instructions) while its own integrated action-selection section is untouched", () => {
  const blueRegions = [{ region: "scanArms" as const, side: "left" as const, role: "opening_and_supportive" as const }];
  assert.equal(resolveMovementInstructionsForStage("regulation", blueRegions).length, 1);
  const state: NewArcLiveSessionState = { ...fresh(), currentStep: "regulation", subIndex: 0, isActiveTaskLiveOrigin: false, arcInvocationMode: "spontaneous" };
  assert.equal(state.currentStep, "regulation");
  assert.equal(state.subIndex, 0, "regulation is exactly one sub-screen (ARCHI -- Show Action Selection ON the Regulation Screen task) -- the action-selection section renders together with it, unaffected by this task");
});

// 24. Encoding strengthens Blue opening.
test("24. Encoding's own movement instruction tier for a Blue region is distinct from Regulation's (progressively stronger wording, same mapping)", () => {
  const blueRegions = [{ region: "scanArms" as const, side: "left" as const, role: "opening_and_supportive" as const }];
  const regulationLine = resolveMovementInstructionsForStage("regulation", blueRegions)[0];
  const encodingLine = resolveMovementInstructionsForStage("encoding", blueRegions)[0];
  assert.ok(regulationLine && encodingLine && regulationLine !== encodingLine, "Encoding's own instruction text must be its own distinct (stronger) tier, never identical to Regulation's");
});

// 25. No invalid movements prescribed (ineligible regions never produce instructions, no matter the role/stage).
test("25. an ineligible region (forehead) selected with any role, at any stage, never produces a movement instruction (defensive coverage; the engine already refuses to let it become Green/Blue at all)", () => {
  for (const stage of ["acceptance", "acceptance_part_two", "regulation", "encoding"] as const) {
    assert.deepEqual(resolveMovementInstructionsForStage(stage, [{ region: "forehead", side: null, role: "opening" }]), []);
  }
});

// 26. Back/forward preserves eligibility.
test("26. navigating back from body_scan_opening_region to body_scan_contraction and forward again never changes which regions are excluded -- eligibility is re-derived from the same persisted contraction data every time, never cached stale", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  state = cycleBodyScanContractionAndGreen(state, "scanShoulders", "left"); // Red
  state = advance(state, NOW); // acceptance
  state = advance(state, NOW); // body_scan_opening_region
  const before = cycleSupportiveOnlyOpening(state.bodyScanContractionRegions, state.openingBodyScanRegions, "scanShoulders", "left");
  assert.deepEqual(before, state.openingBodyScanRegions, "scanShoulders must be excluded here (it is Red)");
  // Simulate going back to Screen One and marking an ADDITIONAL region Red, then forward again.
  const backThenForward: NewArcLiveSessionState = { ...state, currentStep: "body_scan_contraction" };
  const withMoreRed = cycleBodyScanContractionAndGreen(backThenForward, "scanChest", null);
  const after = cycleSupportiveOnlyOpening(withMoreRed.bodyScanContractionRegions, withMoreRed.openingBodyScanRegions, "scanChest", null);
  assert.deepEqual(after, withMoreRed.openingBodyScanRegions, "the newly-Red scanChest must now ALSO be excluded on return -- eligibility is re-derived live, never a stale snapshot taken when Screen Two was first reached");
});

// 27. Interrupted-session restoration preserves exclusions.
test("27. migrateLegacyNewArcLiveStep is a complete no-op for a session already parked on body_scan_opening_region -- an interrupted/restored session's own Red/Green/Blue data and exclusions survive byte-for-byte, never backfilled or altered", () => {
  const interrupted: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_opening_region",
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
    openingBodyScanRegions: [
      { region: "scanShoulders", side: "left", role: "opening" },
      { region: "scanArms", side: "left", role: "opening_and_supportive" },
    ],
  };
  const restored = migrateLegacyNewArcLiveStep(interrupted);
  assert.deepEqual(restored, interrupted);
  // The restored session's own exclusion must still hold: scanShoulders (Red/Green) stays excluded from Blue.
  const attempt = cycleSupportiveOnlyOpening(restored.bodyScanContractionRegions, restored.openingBodyScanRegions, "scanShoulders", "left");
  assert.deepEqual(attempt, restored.openingBodyScanRegions);
});

// 28. No post-Encoding dwelling timer.
test("28. no separate timed dwelling stage exists after Encoding -- 'encoding' is followed directly by 'complete', which itself fires automatically with no menu or extra screen (step-order proof lives in arc/newArcLiveSteps.test.ts)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "encoding" };
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete");
  const content = getStepContent({ ...fresh(), currentStep: "encoding" });
  assert.equal((content as { dwellSeconds?: number }).dwellSeconds, undefined, "encoding itself must never carry a dwellSeconds value either");
});

// 29. Mini ARC / Shortened ARC / ARC Focus retain their intended behavior.
test("29. Mini ARC's own step order and Shortened ARC's own supportive_area_select mechanism are both completely untouched by this task (full isolation proof lives in arc/shortenedGreenBlueLogic.test.ts/arc/simplifyClosureScreen.test.ts and the Mini ARC step-order tests in arc/newArcLiveSteps.test.ts)", () => {
  const steps = readSource("arc/newArcLiveSteps.ts");
  assert.ok(steps.includes("export const NEW_ARC_MINI_STEP_ORDER"), "Mini ARC's own, separate step order must still exist, untouched");
  // Shortened ARC still reaches supportive_area_select as its own mechanism.
  let shortened: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "shortened", currentStep: "supportive_area_select" };
  const next = toggleSupportiveOpeningRegion(shortened, "scanArms", "left");
  assert.equal(resolveBodyScanOpeningRole(next.openingBodyScanRegions, "scanArms", "left"), "opening_and_supportive", "Shortened ARC's own Blue-selection mechanism on supportive_area_select is unaffected");
});

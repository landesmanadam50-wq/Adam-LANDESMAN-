import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getStepContent } from "./newArcLiveCopy.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import {
  CIRCLE_CONTENT_INSET_BOTTOM,
  CIRCLE_CONTENT_INSET_LEFT,
  CIRCLE_CONTENT_INSET_RIGHT,
  CIRCLE_CONTENT_INSET_TOP,
  resolveCircleContentInsetIsSafe,
  resolveShowBodyForStage,
} from "./arcBodyMantraCircleLogic.ts";

/**
 * arc/regulationBodyImageAndShortMantra.test.ts
 *
 * ARCHI -- Simplify the Regulation Stage (Body Image + Short Mantra)
 * task: regression tests for both required fixes --
 * 1) the body image during Full ARC's Regulation stage is clear, sized
 *    responsively, and never overlaps the mantra text;
 * 2) the long three-sentence Regulation mantra is replaced by exactly
 *    one short line.
 * Scope: Full ARC's "פחות טוב" Regulation stage ONLY -- Shortened ARC's
 * own Regulation mantra, Mini ARC, and every other step/stage must stay
 * completely unaffected.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const NEW_REGULATION_MANTRA = "אני מקבל את הכיווץ ושם לב יותר לתמיכה";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

// --- Requirement 2: the shortened mantra ---

test("Full ARC Regulation (subIndex 0): the mantra is exactly the new short line, nothing else appended", () => {
  const content = getStepContent({ ...fresh(), currentStep: "regulation", subIndex: 0 });
  assert.equal(content.primary, NEW_REGULATION_MANTRA);
  assert.deepEqual(content.supporting, []);
});

test("Full ARC Regulation: the new mantra is fixed regardless of a selected supportive feeling or selected body regions -- never interpolates either", () => {
  const withFeelingAndRegions: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "regulation",
    subIndex: 0,
    selectedSupportiveFeeling: { feeling: "ביטחון", quality: "ביטחון", mantra: "" },
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
    openingBodyScanRegions: [{ region: "scanArms", side: "left", role: "opening_and_supportive" }],
  };
  assert.equal(getStepContent(withFeelingAndRegions).primary, NEW_REGULATION_MANTRA);
});

test("Full ARC Regulation's mantra is short enough to render as a single short line, leaving the inset box's remaining room to the body image (never squeezed out by a long mantra)", () => {
  // A generous upper bound for "one short readable line" at this
  // component's own mantraText style (fontSize 15) -- the new mantra
  // (38 characters) is comfortably under it, unlike the old
  // three-sentence version (over 170 characters) this task replaces.
  assert.ok(NEW_REGULATION_MANTRA.length <= 60, "the mantra must stay short enough to never crowd out the body image");
});

// --- Shortened ARC and Mini ARC: completely unaffected ---

test("Shortened ARC's own Regulation mantra is completely unchanged by this task", () => {
  const shortened: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "shortened", currentStep: "regulation", subIndex: 0 };
  const content = getStepContent(shortened);
  assert.equal(content.primary, "אני שם לב למה שקורה בגוף ומעמיק את תשומת הלב לתמיכה", "Shortened ARC's own mantra must stay exactly as it already was");
  assert.notEqual(content.primary, NEW_REGULATION_MANTRA, "the new short mantra is exclusive to Full ARC -- never applied to Shortened ARC");
});

test("Mini ARC's own regulation-equivalent (mini_acceptance_transition) is unaffected -- it never shares Regulation's getStepContent branch at all", () => {
  const mini: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "task", "action", NOW, "plannedMini"), currentStep: "mini_acceptance_transition", subIndex: 0 };
  const content = getStepContent(mini);
  assert.notEqual(content.primary, NEW_REGULATION_MANTRA);
  assert.ok(!content.primary.includes("הכיווץ"), "Mini ARC's own combined screen must never pick up Full ARC Regulation's new wording");
});

// --- Requirement 1: body image display during Regulation ---

test("the anatomical body is shown during Full ARC's Regulation stage (resolveShowBodyForStage)", () => {
  assert.equal(resolveShowBodyForStage("regulation"), true);
});

test("the circle's own body/mantra inset box is mathematically safe (never clipped by the circular mask, never overlapping) at the exact fractions ArcBodyMantraCircle.tsx actually uses", () => {
  assert.equal(
    resolveCircleContentInsetIsSafe(CIRCLE_CONTENT_INSET_TOP, CIRCLE_CONTENT_INSET_BOTTOM, CIRCLE_CONTENT_INSET_LEFT, CIRCLE_CONTENT_INSET_RIGHT),
    true,
    "the body and the (now much shorter) mantra must both stay fully inside the circle, never overlapping each other"
  );
});

// --- Structural: the body-region data flow into the Regulation render case is unaffected ---

const screenSource = readFileSync(fileURLToPath(new URL("../live/NewArcLiveScreen.tsx", import.meta.url)), "utf8");

test("live/NewArcLiveScreen.tsx's \"regulation\" render case (subIndex 0) still passes the real contraction/closure/opening regions into ArcBodyMantraCircle -- the body image's own data source is unchanged by this task", () => {
  const caseIndex = screenSource.indexOf('case "regulation":');
  assert.ok(caseIndex !== -1, "the regulation render case must still exist");
  const nextCaseIndex = screenSource.indexOf("case ", caseIndex + 'case "regulation":'.length);
  const caseBody = screenSource.slice(caseIndex, nextCaseIndex === -1 ? undefined : nextCaseIndex);
  assert.ok(caseBody.includes("contractionRegions={session!.bodyScanContractionRegions}"), "contraction (Red) regions must still be passed through");
  assert.ok(caseBody.includes("closureRegions={resolveClosureRegions(session!)}"), "closure/support (light-blue tiers) regions must still be passed through");
  assert.ok(caseBody.includes("openingRegions={session!.openingBodyScanRegions}"), "opening/supportive (Blue) regions must still be passed through");
  assert.ok(caseBody.includes("stage=\"regulation\""), "the body-mantra circle must still be rendered for the regulation stage");
});

test("live/NewArcLiveScreen.tsx never hardcodes the old three-sentence Regulation mantra text anywhere (the fixed copy now lives only in arc/newArcLiveCopy.ts, read via content.primary)", () => {
  assert.ok(!screenSource.includes("אני ממשיך לקבל את התחושה המכווצת"), "the removed long mantra must not reappear anywhere in the screen component");
});

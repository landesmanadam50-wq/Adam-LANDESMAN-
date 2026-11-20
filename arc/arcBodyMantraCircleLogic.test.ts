import test from "node:test";
import assert from "node:assert/strict";

import {
  ARC_BODY_CIRCLE_GROWTH_INDEX,
  ARC_BODY_STAGE_INTENSITY,
  BASE_CIRCLE_SIZE,
  CIRCLE_CONTENT_INSET_BOTTOM,
  CIRCLE_CONTENT_INSET_LEFT,
  CIRCLE_CONTENT_INSET_RIGHT,
  CIRCLE_CONTENT_INSET_TOP,
  CIRCLE_GROWTH_PER_STAGE,
  CIRCLE_SIZE_SAFETY_MARGIN,
  CLOSURE_MARKER_COLOR,
  CONTRACTION_FROM_COLOR,
  CONTRACTION_TO_COLOR,
  ENCODING_SPREAD_AMBIENT_COLOR,
  INTENSITY_COLOR_CHECKPOINTS,
  MAX_CIRCLE_SCALE,
  MIN_CIRCLE_SIZE,
  NEUTRAL_COLOR,
  OPENING_ACCEPTANCE_COLOR,
  OPENING_ENCODING_COLOR,
  OPENING_GREEN_REGULATION_COLOR,
  OPENING_REGULATION_COLOR,
  lerpHexColor,
  resolveBetterSilhouetteView,
  resolveBodyMantraShapeAppearance,
  resolveCircleContentInsetIsSafe,
  resolveClampedCircleSize,
  resolveFourStopColorFade,
  resolveShowBodyForStage,
} from "./arcBodyMantraCircleLogic.ts";

/**
 * arc/arcBodyMantraCircleLogic.test.ts
 *
 * Final ARC Flow & Body Animation task, requirement 7 (test coverage):
 * every PURE piece of logic live/components/ArcBodyMantraCircle.tsx
 * renders from -- stage intensities (requirement 3: body movement
 * progression), the color-progression priority rule (requirement 3:
 * red/blue progression), and the front/back view picker. The
 * component itself (real Reanimated/SVG JSX) has no renderer in this
 * test suite, so it is instead covered structurally, via source text,
 * in live/components/arcBodyMantraCircle.test.ts.
 */

// --- Fix All Confirmed ARC Android Bugs task, requirement 5: body stays
// still through every Presence page AND Dwelling; opening movement begins
// only at Acceptance, deepening through Regulation/Encoding ---

const ALL_NINE_STAGES = ["natural_breathing", "center_attention", "visual_field", "sound_awareness", "body_scan", "dwelling", "acceptance", "regulation", "encoding"] as const;
// Unified ARC & Productivity Update task, requirement 7 / ARCHI
// Universal ARC Routing task, requirement 7: the three cognitive-
// acceptance stages, in their own actual exercise order (BEFORE
// natural_breathing, "Urge -> Thought -> Interpretation"), for the
// growth-monotonicity assertion below.
const ALL_ELEVEN_STAGES = ["urge_acceptance", "thought_acceptance", "interpretation_acceptance", ...ALL_NINE_STAGES] as const;

test("ARC_BODY_STAGE_INTENSITY: urge_acceptance/thought_acceptance/interpretation_acceptance, every Presence page, AND dwelling are exactly 0 (body mostly still/hidden -- nothing has been selected yet, and Dwelling itself asks for stillness), then Acceptance~0.3, Regulation~0.65, Encoding=1", () => {
  assert.deepEqual(ARC_BODY_STAGE_INTENSITY, {
    urge_acceptance: 0,
    thought_acceptance: 0,
    interpretation_acceptance: 0,
    natural_breathing: 0,
    center_attention: 0,
    visual_field: 0,
    sound_awareness: 0,
    body_scan: 0,
    dwelling: 0,
    acceptance: 0.3,
    // ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 2 --
    // same gentleness tier as Part 1, right before Regulation deepens it.
    acceptance_part_two: 0.3,
    regulation: 0.65,
    encoding: 1,
    // Part 6: Mini ARC's own field-widening page -- same "nothing
    // selected/body hidden yet" value every pre-body-awareness
    // Presence-equivalent stage already uses.
    mini_presence: 0,
    // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
    // task: the new combined "quick presence" short-depth screen --
    // same "nothing selected/body hidden yet" value.
    quick_presence: 0,
  });
  const ordered = ["dwelling", "acceptance", "regulation", "encoding"] as const;
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ARC_BODY_STAGE_INTENSITY[ordered[i]] > ARC_BODY_STAGE_INTENSITY[ordered[i - 1]], `${ordered[i]} must be a larger intensity than ${ordered[i - 1]}`);
  }
});

test("Fix All Confirmed ARC Android Bugs task, requirement 4: the circle grows by exactly 3% per stage, across ALL NINE mantra pages (natural_breathing 1.00x through encoding 1.24x) -- cumulative across every ARC stage transition, never reset. Unified ARC & Productivity Update / ARCHI Universal ARC Routing tasks, requirement 7: urge_acceptance/thought_acceptance/interpretation_acceptance sit BEFORE natural_breathing with their own negative indices, growing INTO it, never shifting any of the nine original indices or the largest (encoding) scale", () => {
  assert.equal(CIRCLE_GROWTH_PER_STAGE, 0.03);
  assert.deepEqual(ARC_BODY_CIRCLE_GROWTH_INDEX, {
    urge_acceptance: -3,
    thought_acceptance: -2,
    interpretation_acceptance: -1,
    natural_breathing: 0,
    center_attention: 1,
    visual_field: 2,
    sound_awareness: 3,
    body_scan: 4,
    dwelling: 5,
    acceptance: 6,
    // Same growth index as Part 1 -- the circle holds its size across
    // the intervening Blue-selection screen.
    acceptance_part_two: 6,
    regulation: 7,
    encoding: 8,
    // Part 6: same growth index as visual_field -- the same point in
    // the overall Presence progression, for Mini ARC's own version of it.
    mini_presence: 2,
    // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
    // task: same growth index as visual_field/mini_presence -- the same
    // tier in the overall Presence progression.
    quick_presence: 2,
  });
  const scales = ALL_NINE_STAGES.map((stage) => 1 + CIRCLE_GROWTH_PER_STAGE * ARC_BODY_CIRCLE_GROWTH_INDEX[stage]);
  assert.deepEqual(scales, [1.0, 1.03, 1.06, 1.09, 1.12, 1.15, 1.18, 1.21, 1.24]);
  for (let i = 1; i < scales.length; i++) {
    assert.ok(scales[i] > scales[i - 1], `${ALL_NINE_STAGES[i]} must be strictly larger than ${ALL_NINE_STAGES[i - 1]} -- growth is cumulative, never flat between pages`);
  }

  const elevenScales = ALL_ELEVEN_STAGES.map((stage) => 1 + CIRCLE_GROWTH_PER_STAGE * ARC_BODY_CIRCLE_GROWTH_INDEX[stage]);
  assert.deepEqual(elevenScales, [0.91, 0.94, 0.97, 1.0, 1.03, 1.06, 1.09, 1.12, 1.15, 1.18, 1.21, 1.24]);
  for (let i = 1; i < elevenScales.length; i++) {
    assert.ok(elevenScales[i] > elevenScales[i - 1], `${ALL_ELEVEN_STAGES[i]} must be strictly larger than ${ALL_ELEVEN_STAGES[i - 1]} in the full twelve-stage walk too`);
  }
});

// --- Unified ARC & Productivity Update task, requirement 8 ("SHOW THE
// ANATOMICAL BODY ONLY FROM BODY AWARENESS") ---

test("resolveShowBodyForStage: false for urge_acceptance/thought_acceptance/interpretation_acceptance and every pre-body-awareness Presence page, true from body_scan onward", () => {
  for (const stage of ["urge_acceptance", "thought_acceptance", "interpretation_acceptance", "natural_breathing", "center_attention", "visual_field", "sound_awareness"] as const) {
    assert.equal(resolveShowBodyForStage(stage), false, `${stage} must not show the body yet`);
  }
  for (const stage of ["body_scan", "dwelling", "acceptance", "regulation", "encoding"] as const) {
    assert.equal(resolveShowBodyForStage(stage), true, `${stage} must show the body`);
  }
});

// --- Final ARC Body Redesign & Flow Fixes task, requirement 4: progressive light-blue color (4 stops), requirement 3: red/blue priority rule ---

test("resolveFourStopColorFade/lerpHexColor: a plain, pure, Reanimated-free color lerp -- the four stops at 0/0.3/0.65/1 are all on the same straight line as the plain from->to gradient", () => {
  assert.equal(lerpHexColor("#000000", "#FFFFFF", 0), "#000000");
  assert.equal(lerpHexColor("#000000", "#FFFFFF", 1), "#FFFFFF");
  assert.equal(lerpHexColor("#000000", "#FFFFFF", 0.5), "#808080");
  const stops = resolveFourStopColorFade("#D32F2F", "#FFFFFF");
  assert.equal(stops.length, 4);
  assert.equal(stops[0], "#D32F2F");
  assert.equal(stops[3], "#FFFFFF");
  assert.equal(stops[1], lerpHexColor("#D32F2F", "#FFFFFF", 0.3));
  assert.equal(stops[2], lerpHexColor("#D32F2F", "#FFFFFF", 0.65));
});

test("INTENSITY_COLOR_CHECKPOINTS matches ARC_BODY_STAGE_INTENSITY's own acceptance/regulation/encoding values exactly -- the color track's three visible brightening steps always land on the three movement phases", () => {
  assert.deepEqual(INTENSITY_COLOR_CHECKPOINTS, [0, 0.3, 0.65, 1]);
  assert.equal(INTENSITY_COLOR_CHECKPOINTS[1], ARC_BODY_STAGE_INTENSITY.acceptance);
  assert.equal(INTENSITY_COLOR_CHECKPOINTS[2], ARC_BODY_STAGE_INTENSITY.regulation);
  assert.equal(INTENSITY_COLOR_CHECKPOINTS[3], ARC_BODY_STAGE_INTENSITY.encoding);
});

test("resolveBodyMantraShapeAppearance: priority order is isOpening > isClosure > isContraction > neutral", () => {
  const openingRegions = [{ region: "scanShoulders" as const, side: "left" as const }];
  const closureRegions = [
    { region: "scanShoulders" as const, side: "left" as const },
    { region: "scanArms" as const, side: "right" as const },
  ];
  const contractionRegions = [
    { region: "scanShoulders" as const, side: "left" as const },
    { region: "scanAbdomen" as const, side: null },
  ];
  const expectedOpeningStops = [CLOSURE_MARKER_COLOR, OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR];

  // A region that is BOTH opening, closure, AND contraction resolves as opening (highest priority).
  const openingAndContraction = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions, closureRegions, openingRegions });
  assert.deepEqual(openingAndContraction.colorStops, expectedOpeningStops);
  assert.ok(openingAndContraction.movementDef !== null, "an opening-selected, movement-eligible region must carry a real movement def");

  // A region that is closure-only (not opening) still runs the SAME progressive light-blue track, but never moves.
  const closureOnly = resolveBodyMantraShapeAppearance("scanArms", "right", { contractionRegions, closureRegions, openingRegions });
  assert.deepEqual(closureOnly.colorStops, expectedOpeningStops);
  assert.equal(closureOnly.movementDef, null, "a closure-only region (not also selected for opening) must never move");

  // A region that is contraction-only fades toward white, never toward the opening track's own light blue.
  const contractionOnly = resolveBodyMantraShapeAppearance("scanAbdomen", null, { contractionRegions, closureRegions, openingRegions });
  assert.equal(contractionOnly.colorStops[0], "#D32F2F");
  assert.equal(contractionOnly.colorStops[3], "#FFFFFF");
  assert.notDeepEqual([...contractionOnly.colorStops], [...expectedOpeningStops], "contraction must never share the opening track's own light-blue colors -- only fade toward neutral white");

  // A region that is none of the three stays a plain, neutral fill (never changes with intensity).
  const neutral = resolveBodyMantraShapeAppearance("scanChest", null, { contractionRegions, closureRegions, openingRegions });
  assert.deepEqual([...neutral.colorStops], ["#E6F4FE", "#E6F4FE", "#E6F4FE", "#E6F4FE"], "an unselected region's fill never changes across intensity -- it is never emphasized");
});

// --- Bug fix: body-region colors in ARC LIVE's Regulation step --
// supportive -> blue, closed/unstable (opening-only) -> green, BOTH
// retained and shown simultaneously on the same body, never both
// collapsing onto the same track as before this fix. ---

test("resolveBodyMantraShapeAppearance: a region selected as opening_and_supportive (e.g. a knee chosen as the supportive region) runs the BLUE track -- unchanged from before this fix", () => {
  const openingRegions = [{ region: "knees" as const, side: "left" as const, role: "opening_and_supportive" as const }];
  const appearance = resolveBodyMantraShapeAppearance("knees", "left", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  assert.deepEqual([...appearance.colorStops], [CLOSURE_MARKER_COLOR, OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR]);
  assert.ok(appearance.movementDef !== null, "a real opening selection must still carry its movement def regardless of role");
});

test("ARCHI -- Full ARC Body Flow Redesign task: resolveBodyMantraShapeAppearance -- a region selected as opening-only (Light Green, e.g. an arm, never also made supportive) now ALWAYS runs the same contraction/red fade a plain Red-only region shows -- 'do not visually display Green... display ALL contracted regions as RED.' Movement still applies when allowGreenOpening is true (the default here, i.e. Acceptance Part 1) -- only the COLOR, never the movement eligibility, depends on role", () => {
  const openingRegions = [{ region: "scanArms" as const, side: "left" as const, role: "opening" as const }];
  const appearance = resolveBodyMantraShapeAppearance("scanArms", "left", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  assert.deepEqual([...appearance.colorStops], [...resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR)]);
  assert.notDeepEqual([...appearance.colorStops], [CLOSURE_MARKER_COLOR, OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR], "an opening-only (Green) region must never share the supportive region's own blue track");
  assert.ok(appearance.movementDef !== null, "opening-only regions still animate while allowGreenOpening is true -- only the color, never the movement eligibility, depends on role");
});

test("ARCHI -- Full ARC Body Flow Redesign task: resolveBodyMantraShapeAppearance -- a knee marked opening_and_supportive (Blue) AND an arm marked opening-only (Light Green) are each resolved independently; the knee keeps its own blue track, the arm now shows the SAME red fade a plain contracted region shows, never a distinct green", () => {
  const openingRegions = [
    { region: "knees" as const, side: "left" as const, role: "opening_and_supportive" as const },
    { region: "scanArms" as const, side: "left" as const, role: "opening" as const },
  ];
  const knee = resolveBodyMantraShapeAppearance("knees", "left", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  const arm = resolveBodyMantraShapeAppearance("scanArms", "left", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  assert.equal(knee.colorStops[2], OPENING_REGULATION_COLOR, "the supportive knee must show blue at the Regulation checkpoint");
  assert.equal(arm.colorStops[2], resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR)[2], "the Light Green arm must show the same red-fade checkpoint a plain contracted region shows");
  assert.notEqual(knee.colorStops[2], arm.colorStops[2], "the two simultaneously-selected regions must never be forced onto the same color");
});

test("resolveBodyMantraShapeAppearance: an opening-region entry with no role at all (every pre-existing test fixture/call site in this file that predates this fix) keeps the original BLUE track -- the fix never silently recolors a caller that doesn't pass role, since every real production call site (session.openingBodyScanRegions) always carries one", () => {
  const openingRegions = [{ region: "palms" as const, side: "right" as const }];
  const appearance = resolveBodyMantraShapeAppearance("palms", "right", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  assert.deepEqual([...appearance.colorStops], [CLOSURE_MARKER_COLOR, OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR]);
});

test("OPENING_GREEN_REGULATION_COLOR matches live/NewArcLiveScreen.tsx's own OPENING_GREEN_SELECTED_COLOR exactly (#2E7D32) -- the static selection-screen swatch and the animated Regulation-stage green are always the same color, never two independently drifting tones for the same role", () => {
  assert.equal(OPENING_GREEN_REGULATION_COLOR, "#2E7D32");
});

test("resolveBodyMantraShapeAppearance: never animates a region that isn't in openingRegions, even if it's otherwise movement-eligible and marked closed", () => {
  const appearance = resolveBodyMantraShapeAppearance("scanArms", "left", {
    contractionRegions: [],
    closureRegions: [{ region: "scanArms", side: "left" }],
    openingRegions: [],
  });
  assert.equal(appearance.movementDef, null, "'never animate unselected regions as opening targets' -- closure alone is never enough to move a region");
});

test("requirement 2 (multi-region selection, independent movements): two simultaneously-selected opening regions each carry their OWN distinct movement def, independently -- never sharing, averaging, or interfering with each other", () => {
  const openingRegions = [
    { region: "scanShoulders" as const, side: "left" as const },
    { region: "scanShoulders" as const, side: "right" as const },
    { region: "palms" as const, side: "left" as const },
  ];
  const leftShoulder = resolveBodyMantraShapeAppearance("scanShoulders", "left", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  const rightShoulder = resolveBodyMantraShapeAppearance("scanShoulders", "right", { contractionRegions: [], closureRegions: openingRegions, openingRegions });
  const leftPalm = resolveBodyMantraShapeAppearance("palms", "left", { contractionRegions: [], closureRegions: openingRegions, openingRegions });

  assert.ok(leftShoulder.movementDef && rightShoulder.movementDef && leftPalm.movementDef, "every simultaneously-selected region must get its own real movement def");
  assert.equal(leftShoulder.movementDef!.region, "scanShoulders");
  assert.equal(rightShoulder.movementDef!.region, "scanShoulders");
  assert.equal(leftPalm.movementDef!.region, "palms");
  // Shoulders and palms have genuinely different movement numbers -- never sharing one generic "opening" animation.
  assert.notDeepEqual(leftShoulder.movementDef, leftPalm.movementDef);
  // Left and right shoulder share the SAME def object (one table entry per region) -- independence comes from
  // resolveBodyRegionMovementTransform mirroring dx by side, not from two separate defs (verified in arc/bodyRegionMovements.test.ts).
  assert.deepEqual(leftShoulder.movementDef, rightShoulder.movementDef);
});

test("resolveBodyMantraShapeAppearance: a region with no selections of any kind returns the plain neutral fill, with no movement", () => {
  const appearance = resolveBodyMantraShapeAppearance("eyes", "left", {
    contractionRegions: [],
    closureRegions: [],
    openingRegions: [],
  });
  assert.deepEqual([...appearance.colorStops], ["#E6F4FE", "#E6F4FE", "#E6F4FE", "#E6F4FE"]);
  assert.equal(appearance.movementDef, null);
});

// --- ARCHI -- Consolidated Implementation Request, Part 8.2/8.3
// ("Whole-Body Spreading Animation" / "Important Data Distinction") ---

test("resolveBodyMantraShapeAppearance: encodingSpreadActive gives an otherwise-untouched region a FOURTH-checkpoint-only tint toward ENCODING_SPREAD_AMBIENT_COLOR -- flat/neutral at every earlier checkpoint, so the spread only ever shows up via the SAME gradual withTiming transition every other track already uses, never an instant swap", () => {
  const appearance = resolveBodyMantraShapeAppearance("eyes", "left", {
    contractionRegions: [],
    closureRegions: [],
    openingRegions: [],
    encodingSpreadActive: true,
  });
  assert.deepEqual([...appearance.colorStops], [NEUTRAL_COLOR, NEUTRAL_COLOR, NEUTRAL_COLOR, ENCODING_SPREAD_AMBIENT_COLOR]);
  assert.equal(appearance.movementDef, null, "the ambient spread tint never invents movement for a region the trainee never selected");
});

test("resolveBodyMantraShapeAppearance: encodingSpreadActive is strictly lower priority than isOpening/isClosure/isContraction -- an actually-selected region keeps reading as 'more selected' than the ambient spread, never flattened to the same tint", () => {
  const openingRegions = [{ region: "scanShoulders" as const, side: "left" as const, role: "opening_and_supportive" as const }];
  const openingSelected = resolveBodyMantraShapeAppearance("scanShoulders", "left", {
    contractionRegions: [],
    closureRegions: openingRegions,
    openingRegions,
    encodingSpreadActive: true,
  });
  assert.deepEqual([...openingSelected.colorStops], [CLOSURE_MARKER_COLOR, OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR]);

  const contractionOnly = resolveBodyMantraShapeAppearance("scanAbdomen", null, {
    contractionRegions: [{ region: "scanAbdomen", side: null }],
    closureRegions: [],
    openingRegions: [],
    encodingSpreadActive: true,
  });
  assert.equal(contractionOnly.colorStops[0], "#D32F2F", "contraction must stay non-supportive even while the ambient encoding spread is active elsewhere");
  assert.equal(contractionOnly.colorStops[3], "#FFFFFF");
});

test("resolveBodyMantraShapeAppearance: encodingSpreadActive defaults to false/absent for every pre-existing call site -- never active unless explicitly requested, matching every other call in this file that omits it", () => {
  const appearance = resolveBodyMantraShapeAppearance("eyes", "left", { contractionRegions: [], closureRegions: [], openingRegions: [] });
  assert.deepEqual([...appearance.colorStops], [NEUTRAL_COLOR, NEUTRAL_COLOR, NEUTRAL_COLOR, NEUTRAL_COLOR], "omitting the flag must never silently activate the spread");
});

// --- requirement: body shown is synchronized with the actual session data, auto-picks the better view ---

test("resolveBetterSilhouetteView picks whichever view (front/back) shows MORE of the trainee's own actual selections -- never an arbitrary fixed default when selections favor the other view", () => {
  // upperBack is back-only -- a selection set entirely of back-only regions must resolve to "back".
  assert.equal(resolveBetterSilhouetteView([{ region: "upperBack", side: null }]), "back");
  // scanChest is front-only.
  assert.equal(resolveBetterSilhouetteView([{ region: "scanChest", side: null }]), "front");
  // Empty (nothing selected yet) defaults to "front", matching BodySilhouetteMap's own default.
  assert.equal(resolveBetterSilhouetteView([]), "front");
});

test("resolveBetterSilhouetteView: a region drawn on both views (e.g. scanShoulders/scanArms) contributes to BOTH counts, never forcing a tie-break by itself", () => {
  // scanShoulders is drawn on both front and back -- alone, it's a tie (defaults to front); paired with one back-only region, back wins.
  assert.equal(resolveBetterSilhouetteView([{ region: "scanShoulders", side: "left" }]), "front");
  assert.equal(resolveBetterSilhouetteView([{ region: "scanShoulders", side: "left" }, { region: "lowerBack", side: null }]), "back");
});

// --- Circle Centering and Touch Behavior task, requirement 1: circle must never extend beyond the screen, growth must stay proportionally visible ---

test("resolveClampedCircleSize: on a generously wide screen, every one of the nine pages keeps its exact, undamped designed size (280 through 347.2) -- never shrunk when there's plenty of room", () => {
  // A tablet-class width, well beyond anything a phone needs.
  const availableWidth = 800;
  const availableHeight = 1200;
  const expected: Record<(typeof ALL_NINE_STAGES)[number], number> = {
    natural_breathing: 280,
    center_attention: 288.4,
    visual_field: 296.8,
    sound_awareness: 305.2,
    body_scan: 313.6,
    dwelling: 322,
    acceptance: 330.4,
    regulation: 338.8,
    encoding: 347.2,
  };
  for (const stage of ALL_NINE_STAGES) {
    assert.ok(
      Math.abs(resolveClampedCircleSize(BASE_CIRCLE_SIZE, stage, availableWidth, availableHeight) - expected[stage]) < 0.01,
      `${stage} should be ${expected[stage]}`
    );
  }
});

test("resolveClampedCircleSize: NEVER exceeds the measured available width (minus the safety margin), across a representative sweep of real Android widths including small/budget devices (a Xiaomi-class 360dp phone included)", () => {
  // Representative logical (dp) widths: a small/older Android phone, a
  // common budget Xiaomi/Redmi width, a mid-range phone, a large phone.
  // Each already has the screen's OWN content padding (24dp each side,
  // live/NewArcLiveScreen.tsx's styles.content) subtracted, since that
  // is exactly what onLayout measures in the real component -- the
  // Pressable's own rendered box, already inside that padding.
  const representativeAvailableWidths = [272, 312, 345, 364, 380];
  for (const availableWidth of representativeAvailableWidths) {
    const availableHeight = 700; // tall enough to never be the binding constraint here
    for (const stage of ALL_NINE_STAGES) {
      const size = resolveClampedCircleSize(BASE_CIRCLE_SIZE, stage, availableWidth, availableHeight);
      assert.ok(
        size <= availableWidth - CIRCLE_SIZE_SAFETY_MARGIN * 2 + 0.001,
        `${stage} at availableWidth=${availableWidth} must never exceed the safe width budget (got ${size})`
      );
      assert.ok(size >= MIN_CIRCLE_SIZE, `${stage} must never shrink below the absolute floor`);
    }
  }
});

test("resolveClampedCircleSize: on a narrow screen where the full progression wouldn't fit, the WHOLE progression scales down together -- growth across stages stays strictly increasing, never flattened to one ceiling (the bug a naive per-stage clamp would cause)", () => {
  // 360dp width minus 48dp of the screen's own padding = 312 -- a very
  // common Android logical width (many budget/mid Xiaomi phones report
  // exactly this). A naive `Math.min(target, maxWidth)` per stage would
  // clamp acceptance/regulation/encoding all flat to the same ~280
  // ceiling, erasing the "grows slightly after each mantra" cue on
  // exactly this kind of common, narrow screen.
  const availableWidth = 312;
  const availableHeight = 700;
  const sizes = ALL_NINE_STAGES.map((stage) => resolveClampedCircleSize(BASE_CIRCLE_SIZE, stage, availableWidth, availableHeight));
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] > sizes[i - 1], `stage ${i} (${sizes[i]}) must be strictly larger than stage ${i - 1} (${sizes[i - 1]}) -- growth must stay visible even when shrunk to fit`);
  }
  // The largest stage (encoding, last in the list) exactly fills the available budget -- the progression is scaled to just fit, not needlessly smaller.
  const maxByWidth = availableWidth - CIRCLE_SIZE_SAFETY_MARGIN * 2;
  assert.ok(Math.abs(sizes[sizes.length - 1] - maxByWidth) < 0.01, `encoding should land almost exactly at the width budget (${maxByWidth}), got ${sizes[sizes.length - 1]}`);
});

test("resolveClampedCircleSize: also respects available HEIGHT (e.g. a short or landscape viewport), not just width", () => {
  const size = resolveClampedCircleSize(BASE_CIRCLE_SIZE, "encoding", 800, 300);
  assert.ok(size <= 300 * 0.55 + 0.01, "a short viewport must clamp the circle by height too, even when width is generous");
});

test("resolveClampedCircleSize: an unmeasured (zero) available size never produces a circle wider than the screen -- it safely resolves to the absolute floor rather than the full, unclamped design size", () => {
  assert.equal(resolveClampedCircleSize(BASE_CIRCLE_SIZE, "encoding", 0, 0), MIN_CIRCLE_SIZE);
});

test("MAX_CIRCLE_SCALE matches the designed encoding-stage scale (1.24, the largest of all nine growth indices) exactly, derived from the same CIRCLE_GROWTH_PER_STAGE constant the component itself uses -- never a second, independently hand-typed number that could drift", () => {
  assert.equal(MAX_CIRCLE_SCALE, 1 + CIRCLE_GROWTH_PER_STAGE * 8);
  assert.equal(MAX_CIRCLE_SCALE, 1.24);
});

// --- Circle Centering and Touch Behavior task, requirement 1: body+mantra must stay inside the circle, never clipped, never overlapping ---

test("resolveCircleContentInsetIsSafe: the ACTUAL constants this app ships (CIRCLE_CONTENT_INSET_*) are mathematically proven safe -- the inset box's own farthest corner never reaches the circle's edge", () => {
  assert.equal(resolveCircleContentInsetIsSafe(CIRCLE_CONTENT_INSET_TOP, CIRCLE_CONTENT_INSET_BOTTOM, CIRCLE_CONTENT_INSET_LEFT, CIRCLE_CONTENT_INSET_RIGHT), true);
});

test("resolveCircleContentInsetIsSafe: a box inset only enough to clear the BOUNDING SQUARE (no real safety margin for the circle's own curvature) is correctly detected as UNSAFE -- proves the check isn't vacuously true for any input", () => {
  // A small, symmetric inset (8%/10%) leaves a box whose corners mathematically stick out past the circle -- the exact mistake this function exists to catch.
  assert.equal(resolveCircleContentInsetIsSafe(0.08, 0.08, 0.1, 0.1), false);
});

test("resolveCircleContentInsetIsSafe: near the mathematical boundary (inset = (1 - 1/sqrt(2))/2 on all sides, where the box's corners land almost exactly ON the circle) -- a hair LESS inset is unsafe, a hair MORE is safe", () => {
  const boundaryInset = (1 - 1 / Math.sqrt(2)) / 2;
  assert.equal(resolveCircleContentInsetIsSafe(boundaryInset - 0.01, boundaryInset - 0.01, boundaryInset - 0.01, boundaryInset - 0.01), false);
  assert.equal(resolveCircleContentInsetIsSafe(boundaryInset + 0.01, boundaryInset + 0.01, boundaryInset + 0.01, boundaryInset + 0.01), true);
});

/**
 * arc/arcBodyMantraCircleLogic.ts
 *
 * Final ARC Flow & Body Animation task, requirement 4 ("ONE CIRCLE --
 * BODY + MANTRA") and requirement 3 (body movement/color progression):
 * every PURE piece of logic live/components/ArcBodyMantraCircle.tsx
 * needs, pulled out into its own plain module (no React, no Reanimated,
 * no react-native-svg) -- exactly the same "pure data/geometry module
 * the component merely renders" split arc/bodyRegionMovements.ts and
 * arc/bodySilhouetteLayout.ts already use, and the one way this logic
 * can be unit-tested directly (this codebase's test runner has no
 * React Native/JSX renderer, so a .tsx file is never imported from a
 * test -- only ever read as source text).
 */

import type { BodyRegionMovementDef } from "./bodyRegionMovements.ts";
import { resolveBodyRegionMovement } from "./bodyRegionMovements.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanOpeningRole, BodyScanSide } from "./bodyScanSelection.ts";
import { resolveRegionViews } from "./bodySilhouetteLayout.ts";
import type { BodySilhouetteView } from "./bodySilhouetteLayout.ts";

/**
 * Fix All Confirmed ARC Android Bugs task, requirement 2 ("Presence
 * Mantras Inside the Circle"): the one circle now carries the WHOLE
 * exercise, from the first Presence mantra through Encoding & Action
 * -- nine pages in total. "focus_color" (choosing the Presence color
 * itself) is deliberately NOT one of them: it is a genuine SELECTION
 * screen (its own color chips), never a passive tap-to-advance mantra
 * page, so it keeps its own existing, unchanged chip-based UI outside
 * this circle entirely -- the circle's own growth simply has no entry
 * for it (see ARC_BODY_CIRCLE_GROWTH_INDEX below), which is exactly
 * correct: growth resumes from where it left off once the circle
 * reappears at "visual_field", never losing or duplicating a step.
 *
 * Unified ARC & Productivity Update task, requirement 7 ("START
 * PRESENCE DURING COGNITIVE ACCEPTANCE"): "urge_acceptance" and
 * "thought_acceptance" are two MORE circle-rendered stages, for the
 * exact moment a trainee accepts an urge (the closing sub-screen of
 * "stop_and_accept_urge"/"mini_stop_accept_urge") or a thought (the
 * resolved-mantra sub-screen of "reality_acceptance") -- both happen
 * BEFORE "natural_breathing" in the actual exercise order, so their
 * own growth index (below) is negative, never shifting any of the
 * original nine stages' own indices or sizes.
 *
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 7: "interpretation_acceptance" is a
 * THIRD such stage, for Interpretation's own now-ALWAYS-separate
 * acceptance moment (interpretation_acceptance's one fixed mantra
 * screen, and Mini ARC's own mini_reality_acceptance when it is
 * showing the interpretation-only line) -- sits right after
 * "thought_acceptance" in the actual exercise order ("Urge -> Thought
 * -> Interpretation"), so it gets the next negative growth index.
 */
export type ArcBodyMantraStage =
  | "urge_acceptance"
  | "thought_acceptance"
  | "interpretation_acceptance"
  | "natural_breathing"
  | "center_attention"
  | "visual_field"
  | "sound_awareness"
  | "body_scan"
  | "dwelling"
  | "acceptance"
  // ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 2 (the
  // simultaneous-attention -> transfer -> initial Blue-region opening
  // moment, right after the new Blue-only supportive-region selection
  // screen) -- a genuinely separate stage from "acceptance" above
  // (Part 1), since the two now sit on opposite sides of that selection
  // screen in the real step order and NEW_ARC_LIVE_STEP_ORDER can never
  // contain the same step id twice.
  | "acceptance_part_two"
  | "regulation"
  | "encoding"
  // ARCHI -- Consolidated Implementation Request, Part 6 ("Presence:
  // Expanding Field of View"): Mini ARC's own "mini_presence" step
  // now renders through this SAME shared component, exactly like Full
  // ARC's visual_field -- showing the central point and the one
  // expanding circle, with no body (pre-body-awareness, same as every
  // other Presence-equivalent stage above).
  | "mini_presence"
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: the one shared "quick presence" screen for BOTH tracks'
  // short depth -- point + widening field of view + sounds + body, all
  // on one screen. Unlike every other pre-body-awareness stage above,
  // the body IS shown and animated here (resolveShowBodyForStage
  // below) -- this one screen stands in for the entire Presence ->
  // body-awareness transition that full depth spreads across several
  // separate pages.
  | "quick_presence";

/**
 * Requirement 5 ("begin the selected anatomical opening movements
 * only during Acceptance... increase gradually through Regulation and
 * Encoding"): body movement intensity is 0 for every Presence page
 * (nothing has been selected yet -- Presence happens before Identify
 * Contraction/Closure/Opening even exist) and for Dwelling itself
 * ("body mostly still"); Acceptance begins the gentle opening,
 * Regulation deepens it, Encoding reaches the full comfortable
 * opening. This is DELIBERATELY a separate table from
 * ARC_BODY_CIRCLE_GROWTH_INDEX below -- "circle expansion and the
 * continuous Presence animation [movement] are two separate
 * behaviors," so a session that is only on page 2 of Presence (small
 * circle) still shows exactly zero body movement, and Encoding (full
 * movement) is also the LARGEST circle, but neither fact is derived
 * from the other.
 */
export const ARC_BODY_STAGE_INTENSITY: Record<ArcBodyMantraStage, number> = {
  // Requirement 7/8: the body is not even shown yet during these two
  // stages (resolveShowBodyForStage below), so their own intensity is
  // moot -- 0, the same "nothing selected/no movement yet" value every
  // pre-body-awareness stage already uses.
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
  // Same tier as Part 1 above -- Acceptance Part 2's own gentle, INITIAL
  // Blue-region opening (per the spec's own Phase C) is the same
  // gentleness level as Part 1's Green-region opening, never the deeper
  // Regulation-tier movement.
  acceptance_part_two: 0.3,
  regulation: 0.65,
  encoding: 1,
  mini_presence: 0,
  // No movement yet -- same reasoning as every other pre-opening
  // stage above, even though the body itself is already visible here.
  quick_presence: 0,
};

/**
 * Requirement 4 ("maintain cumulative progression across ARC stage
 * transitions... do not reset its size when components mount
 * again... persist or correctly reconstruct expansion progress after
 * session restoration"): the circle grows across ALL nine pages, not
 * just the final four -- this index is a PURE function of the
 * session's own currentStep (always correctly reconstructible after
 * a restart or app restore, exactly like every other piece of
 * ArcBodyMantraCircle's own state, never a separately-tracked local
 * counter that could drift or reset on remount).
 */
export const ARC_BODY_CIRCLE_GROWTH_INDEX: Record<ArcBodyMantraStage, number> = {
  // Requirement 7: these two happen BEFORE natural_breathing in the
  // actual exercise order -- negative indices place them earlier in
  // the SAME single growth progression (the circle starts slightly
  // smaller than natural_breathing's own base size and grows INTO it),
  // without shifting any of the nine original indices below, which
  // every existing size/test assumption is still anchored to.
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
  // Same growth index as Part 1 -- the circle holds its size across the
  // intervening Blue-selection screen (not itself a mantra-circle page),
  // then continues growing into Regulation exactly as before.
  acceptance_part_two: 6,
  regulation: 7,
  encoding: 8,
  // Part 6: Mini ARC's own field-widening moment -- same growth index
  // as Full ARC's analogous "visual_field" page, since both are the
  // same point in the overall Presence progression.
  mini_presence: 2,
  // Same tier as visual_field/mini_presence -- this one screen stands
  // in for that same point in the overall Presence progression for
  // both tracks' short depth.
  quick_presence: 2,
};

export const BASE_CIRCLE_SIZE = 280;
export const CIRCLE_GROWTH_PER_STAGE = 0.03;
/** The largest growth index ever reached (Encoding, still 8 -- urge_acceptance/thought_acceptance's own indices are negative, so they never raise this): 1 + 0.03 * 8 = 1.24x the base size. */
export const MAX_CIRCLE_SCALE = 1 + CIRCLE_GROWTH_PER_STAGE * 8;

/**
 * Unified ARC & Productivity Update task, requirement 8 ("SHOW THE
 * ANATOMICAL BODY ONLY FROM BODY AWARENESS"): "during the initial
 * Presence stages... do not show the anatomical body yet... introduce
 * the body when the body scan/body-awareness stage begins... show the
 * segmented body wherever relevant [from there], including
 * contraction, closure, supportive regions, and subsequent movement
 * stages." A pure, total function of the stage alone (never a second,
 * independently-tracked flag) -- true from "body_scan" onward
 * (body_scan/dwelling/acceptance/regulation/encoding), false for the
 * two new acceptance stages above and for every earlier Presence page
 * (natural_breathing/center_attention/visual_field/sound_awareness).
 */
export function resolveShowBodyForStage(stage: ArcBodyMantraStage): boolean {
  // "interpretation_acceptance" is deliberately absent from this list,
  // same as "urge_acceptance"/"thought_acceptance" -- the body is never
  // shown before body_scan, for any of the three cognitive-acceptance
  // moments.
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: "quick_presence" is the one deliberate exception -- per the
  // user's own explicit confirmation, this shared short-depth screen
  // shows the body, visible and animated in the circle, from the very
  // start (it stands in for the entire Presence -> body-awareness
  // transition full depth spreads across several separate pages).
  return (
    stage === "body_scan" ||
    stage === "dwelling" ||
    stage === "acceptance" ||
    stage === "acceptance_part_two" ||
    stage === "regulation" ||
    stage === "encoding" ||
    stage === "quick_presence"
  );
}

/**
 * ARCHI -- Precise Body Opening and Stabilization Rules task, Final
 * Goal: the pure, total function of stage alone that
 * resolveBodyMantraShapeAppearance's own `allowGreenOpening` option
 * is computed from at the one real call site
 * (live/components/ArcBodyMantraCircle.tsx) -- "dwelling" is included
 * for documentation symmetry only (see that option's own doc for why
 * it can never actually change dwelling's rendered output in the real
 * step order).
 */
export function resolveGreenOpeningActiveForStage(stage: ArcBodyMantraStage): boolean {
  return stage === "dwelling" || stage === "acceptance";
}

/**
 * Circle Centering and Touch Behavior task, requirement 1 ("must not...
 * extend beyond the screen"): the circle's own size is clamped against
 * the ACTUAL available width/height (the component measures this via
 * onLayout + useWindowDimensions, never a hardcoded screen-size guess).
 * CIRCLE_SIZE_SAFETY_MARGIN leaves a visible gap from the measured
 * edge (so the circle never touches the screen/safe-area edge exactly,
 * which would look clipped even if technically on-screen).
 * MIN_CIRCLE_SIZE is the absolute floor -- only ever reached on a
 * genuinely tiny or not-yet-measured container, never on a real phone.
 * MAX_CIRCLE_HEIGHT_FRACTION bounds the circle by available height too
 * (short/landscape viewports), since width is the primary constraint
 * in ordinary portrait use but not the only one.
 */
export const CIRCLE_SIZE_SAFETY_MARGIN = 16;
export const MIN_CIRCLE_SIZE = 160;
export const MAX_CIRCLE_HEIGHT_FRACTION = 0.55;

/**
 * Requirement 1 ("the circle must be centered... must not extend
 * beyond the screen... as the circle expands, its center must remain
 * fixed"): resolves the actual on-screen diameter for a given stage,
 * given the REAL measured available width/height (not a hardcoded
 * device-size assumption). When the full designed progression (280 up
 * to 322) would fit, every stage keeps its exact designed size -- this
 * function never shrinks a session that has plenty of room. When it
 * would NOT fit (a narrow phone, e.g. many common ~360dp-wide Android
 * screens once the screen's own padding is subtracted), the WHOLE
 * progression is scaled down by one shared factor, together -- never
 * clamping only the larger stages flat against the same ceiling, which
 * would silently erase "the circle grows slightly after each mantra"
 * on exactly the narrow screens this task calls out (a Xiaomi device
 * included). The result keeps the exact same relative growth ratio
 * between stages at any width, just smaller when the screen is smaller.
 *
 * `availableWidth`/`availableHeight` of 0 (not yet measured, e.g. the
 * very first render before onLayout fires) safely resolve to
 * MIN_CIRCLE_SIZE rather than the full, unclamped design size --
 * briefly smaller-than-ideal for one frame is harmless; briefly
 * wider-than-the-screen is the bug this function exists to prevent.
 */
export function resolveClampedCircleSize(baseSize: number, stage: ArcBodyMantraStage, availableWidth: number, availableHeight: number): number {
  const stageScale = 1 + CIRCLE_GROWTH_PER_STAGE * ARC_BODY_CIRCLE_GROWTH_INDEX[stage];
  const maxTarget = baseSize * MAX_CIRCLE_SCALE;
  const maxByWidth = Math.max(0, availableWidth - CIRCLE_SIZE_SAFETY_MARGIN * 2);
  const maxByHeight = availableHeight > 0 ? availableHeight * MAX_CIRCLE_HEIGHT_FRACTION : Infinity;
  const availableMax = Math.min(maxByWidth, maxByHeight);
  const shrinkFactor = availableMax > 0 ? Math.min(1, availableMax / maxTarget) : 0;
  return Math.max(MIN_CIRCLE_SIZE, baseSize * stageScale * shrinkFactor);
}

/**
 * Requirement 1 ("the body and mantra must not overlap, become
 * clipped, or extend beyond the screen" -- INSIDE the circle itself):
 * the axis-aligned box inset from the circle's own bounding square by
 * these exact fractions is mathematically guaranteed to stay fully
 * inside the circle (never clipped by its own `overflow: "hidden"`
 * circular mask), because its own farthest corner is closer to the
 * center than the circle's radius -- verified directly in this
 * module's own test file via resolveCircleContentInsetIsSafe, rather
 * than eyeballed. Body and mantra are then laid out as ordinary,
 * non-overlapping flex-column siblings WITHIN that one safe box (body:
 * flex: 1, taking whatever room the mantra text doesn't need; mantra:
 * auto-height, so a longer mantra simply takes more of the box and the
 * body shrinks to fit -- never overlapping, by flexbox's own
 * guarantee for normal-flow siblings in a column).
 */
export const CIRCLE_CONTENT_INSET_TOP = 0.12;
export const CIRCLE_CONTENT_INSET_BOTTOM = 0.12;
export const CIRCLE_CONTENT_INSET_LEFT = 0.22;
export const CIRCLE_CONTENT_INSET_RIGHT = 0.22;

/**
 * Sanity-checks the four CIRCLE_CONTENT_INSET_* fractions above against
 * the actual circle geometry -- true iff the resulting box's own
 * farthest corner from the circle's center is strictly within the
 * circle's radius. Exported so the test file asserts this directly,
 * rather than re-deriving the same geometry formula ad hoc (and rather
 * than only trusting the hand-picked constants above by eye).
 */
export function resolveCircleContentInsetIsSafe(insetTop: number, insetBottom: number, insetLeft: number, insetRight: number): boolean {
  const halfWidthFraction = 0.5 - Math.max(insetLeft, insetRight);
  const halfHeightFraction = 0.5 - Math.max(insetTop, insetBottom);
  if (halfWidthFraction <= 0 || halfHeightFraction <= 0) return false;
  const cornerDistanceFraction = Math.sqrt(halfWidthFraction ** 2 + halfHeightFraction ** 2);
  return cornerDistanceFraction < 0.5;
}

/**
 * Final ARC Body Redesign & Flow Fixes task, requirement 4
 * ("PROGRESSIVE LIGHT-BLUE SUPPORT COLOR"): a closure/opening region's
 * own fill now runs through FOUR fixed stops, one per
 * ARC_BODY_STAGE_INTENSITY checkpoint (0, 0.3, 0.65, 1) -- never the
 * trainee's own arbitrary chosen presence/focus color (that stays the
 * Presence ring's own, separate, personalized motif; see
 * live/components/ArcBodyMantraCircle.tsx's own presenceColor prop,
 * completely unaffected by this change). CLOSURE_MARKER_COLOR is both
 * the dark-blue "Closure" mark shown on the SELECTION screens
 * (requirement 2's own exact "Closure: dark blue" spec) AND this
 * track's own intensity-0 starting point (Dwelling -- "not yet
 * opened"); the three OPENING_* colors are the exact three named tiers
 * ("soft light blue" / "brighter light blue" / "vivid, luminous light
 * blue") for Acceptance/Regulation/Encoding respectively. A region
 * that is selected as CLOSED but never also chosen as an opening
 * target still runs through this same four-stop brightening (it never
 * moves -- see resolveBodyMantraShapeAppearance below -- but the
 * color track itself was already shared between closure-only and
 * opening before this task, and nothing here asked to change that).
 */
export const CLOSURE_MARKER_COLOR = "#1A237E";
export const OPENING_ACCEPTANCE_COLOR = "#BBDEFB";
export const OPENING_REGULATION_COLOR = "#4FC3F7";
export const OPENING_ENCODING_COLOR = "#00B0FF";
/**
 * Bug fix: "retain role and color" (supportive -> blue, opening-only
 * ("closed/unstable") -> green) -- resolveBodyMantraShapeAppearance
 * below previously ran EVERY opening region through the three OPENING_*
 * stops above regardless of its own role, so a region selected only as
 * "opening" (never also "opening_and_supportive") rendered identically
 * to a real supportive region during Regulation/Encoding's animated
 * body -- never actually showing green at all. This green track is the
 * exact parallel of the blue one above, same four checkpoints, same
 * progression shape (soft -> brighter -> vivid). OPENING_GREEN_
 * REGULATION_COLOR intentionally matches live/NewArcLiveScreen.tsx's
 * own OPENING_GREEN_SELECTED_COLOR (#2E7D32) exactly, the same way
 * OPENING_REGULATION_COLOR above already matches that file's
 * OPENING_SUPPORT_SELECTED_COLOR/OPENING_BLUE_SELECTED_COLOR -- so the
 * static selection-screen swatch and the animated Regulation-stage
 * color are always the same green, never two independently-chosen
 * tones for the same role.
 */
export const OPENING_GREEN_ACCEPTANCE_COLOR = "#C8E6C9";
export const OPENING_GREEN_REGULATION_COLOR = "#2E7D32";
export const OPENING_GREEN_ENCODING_COLOR = "#00C853";
/** Deprecated alias, kept only so any lingering external reference keeps compiling -- CLOSURE_MARKER_COLOR is the name every NEW call site actually uses. */
export const CLOSURE_FROM_COLOR = CLOSURE_MARKER_COLOR;
/** Red -> white, same hex live/NewArcLiveScreen.tsx already uses for CONTRACTION_SELECTED_COLOR -- contraction never brightens toward a "positive" color, only fades toward neutral, "as a guided visual metaphor" (never evidence that the trainee's own actual sensation has changed -- the color is illustrative, not a sensor reading). */
export const CONTRACTION_FROM_COLOR = "#D32F2F";
export const CONTRACTION_TO_COLOR = "#FFFFFF";
export const NEUTRAL_COLOR = "#E6F4FE";
/**
 * ARCHI -- Consolidated Implementation Request, Part 8.2: the ambient
 * tint an otherwise-untouched region fades toward, ONLY at Encoding's
 * own intensity checkpoint (1) and ONLY when encodingSpreadActive is
 * true -- a visibly lighter wash than OPENING_ENCODING_COLOR itself
 * (the trainee's own actually-selected regions' full color), so the
 * whole body visibly reads as "the same supportive color spreading
 * outward" without ever looking indistinguishable from a real
 * selection.
 */
export const ENCODING_SPREAD_AMBIENT_COLOR = "#B3E5FC";

/** The exact four intensity checkpoints every color track below is anchored to -- identical to ARC_BODY_STAGE_INTENSITY's own acceptance(0.3)/regulation(0.65)/encoding(1) values, so the color's own three visible brightening steps always land exactly on the three movement phases, never on a separate or uncoordinated schedule. */
export const INTENSITY_COLOR_CHECKPOINTS = [0, 0.3, 0.65, 1] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const int = parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (channel: number) => Math.round(clamp01(channel / 255) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** A plain, pure RGB channel lerp -- no Reanimated dependency (unlike interpolateColor, which only runs inside a worklet), so the four-stop color tracks below can be computed and tested directly, outside any animation context. */
export function lerpHexColor(from: string, to: string, t: number): string {
  const clampedT = clamp01(t);
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(r1 + (r2 - r1) * clampedT, g1 + (g2 - g1) * clampedT, b1 + (b2 - b1) * clampedT);
}

/** The four color stops (matching INTENSITY_COLOR_CHECKPOINTS exactly) for a plain, continuous from->to fade -- used by every track that is NOT the fixed three-tier light-blue progression (contraction's own red->white fade, and the inert neutral fill). Mathematically identical to a plain 2-stop interpolateColor(intensity, [0,1], [from,to]) at every one of the four checkpoints, since all four lie on the same straight line -- expressed as four explicit stops only so every track in this module shares the exact same shape/contract. */
export function resolveFourStopColorFade(from: string, to: string): readonly [string, string, string, string] {
  return [from, lerpHexColor(from, to, 0.3), lerpHexColor(from, to, 0.65), to];
}

export interface RegionSideKey {
  region: BodyScanRegion;
  side: BodyScanSide;
}

function containsRegionSide(list: readonly RegionSideKey[], region: BodyScanRegion, side: BodyScanSide): boolean {
  return list.some((entry) => entry.region === region && entry.side === side);
}

/**
 * Picks whichever of front/back shows more of the trainee's own
 * actually-marked regions -- so the one body view on screen is the one
 * that actually carries the trainee's own selections, never an
 * arbitrary default that might show an empty back view while every
 * selection is only drawn on the front. Ties (including "nothing
 * selected yet") default to "front", matching
 * BodySilhouetteMap.tsx's own default.
 */
export function resolveBetterSilhouetteView(regions: readonly RegionSideKey[]): BodySilhouetteView {
  let frontCount = 0;
  let backCount = 0;
  for (const entry of regions) {
    const views = resolveRegionViews(entry.region);
    if (views.includes("front")) frontCount += 1;
    if (views.includes("back")) backCount += 1;
  }
  return backCount > frontCount ? "back" : "front";
}

export interface BodyMantraShapeAppearance {
  /** Exactly four colors, matching INTENSITY_COLOR_CHECKPOINTS -- ArticulatedBodyShape.tsx interpolates across all four, never just two. */
  colorStops: readonly [string, string, string, string];
  movementDef: BodyRegionMovementDef | null;
}

/**
 * The one shared color/movement classification every drawn shape goes
 * through -- priority order (requirement 3): isOpening > isClosure >
 * isContraction > neutral. A shape that is BOTH opening and contraction
 * (e.g. a trainee marked a region both contracted AND later selected it
 * as an opening target) is shown as opening -- the forward-looking,
 * illustrative brightening takes priority over the fading-out
 * contraction color, since the opening selection is the trainee's own
 * more specific, more recent choice for that exact region. Movement is
 * applied ONLY when the shape is one of the trainee's own
 * openingRegions -- "never animate unselected regions as opening
 * targets" holds structurally, since every other branch returns
 * movementDef: null.
 *
 * Final ARC Body Redesign & Flow Fixes task, requirement 4: opening AND
 * closure-only regions now share the SAME fixed three-tier light-blue
 * progression (never the trainee's own arbitrary presence color, which
 * this function no longer even takes as a parameter -- it was its only
 * use here).
 *
 * Bug fix (role/color retention): an opening-region match's own `role`
 * now picks WHICH of the two parallel four-stop tracks it runs through
 * -- "opening_and_supportive" (e.g. a knee chosen as the supportive
 * region) stays on the existing blue track, "opening" alone (e.g. an
 * arm selected as closed/unstable but never also made supportive) now
 * actually runs the green track, rather than silently reusing blue.
 * Two simultaneously-selected regions with different roles are each
 * resolved independently (this function takes one region/side at a
 * time; the caller draws every shape through it), so both their own
 * correct colors show on the SAME body at once, never one overwriting
 * the other. A role-less entry (every call site this codebase actually
 * ships reads role straight from session.openingBodyScanRegions, which
 * always carries one; only pre-existing test fixtures omit it) keeps
 * the original blue track, so no already-passing test's expectations
 * silently change underneath it.
 */
export function resolveBodyMantraShapeAppearance(
  region: BodyScanRegion,
  side: BodyScanSide,
  options: {
    contractionRegions: readonly RegionSideKey[];
    closureRegions: readonly RegionSideKey[];
    openingRegions: readonly (RegionSideKey & { role?: BodyScanOpeningRole })[];
    /**
     * ARCHI -- Precise Body Opening and Stabilization Rules task,
     * Final Goal: "the closed-and-contracted region is actively
     * opened and stabilized ONLY during Acceptance. After Acceptance,
     * active opening and stabilization continue ONLY in the user-
     * selected supportive Blue regions." Defaults to true (every
     * EXISTING call site/test that omits this keeps rendering exactly
     * as before -- the same "never changes behavior for callers that
     * don't opt in" convention `circleOutlineColor` on
     * ArcBodyMantraCircle already uses). The one real production call
     * site (live/components/ArcBodyMantraCircle.tsx) passes
     * `stage === "dwelling" || stage === "acceptance"` -- dwelling is
     * included only for documentation symmetry with
     * resolveShowBodyForStage's own "not yet opened" framing; in the
     * real step order openingBodyScanRegions is always still empty at
     * that point (body_scan_closedness/body_scan_opening_region only
     * run AFTER dwelling), so this can never actually change
     * dwelling's own rendered output. A Dark Blue match
     * ("opening_and_supportive") is completely unaffected by this flag
     * -- it keeps the opening treatment through Regulation/Encoding
     * exactly as before this task.
     */
    allowGreenOpening?: boolean;
    /**
     * ARCHI -- Consolidated Implementation Request, Part 8.2 ("Whole-
     * Body Spreading Animation"): true only during Encoding, and only
     * once the trainee actually chose at least one real
     * opening_and_supportive (blue) region -- never invented when no
     * supportive region was ever selected (Part 8.3's own "do not
     * silently convert a green region into a supportive region," read
     * here as "never invent one out of nothing either"). When true, an
     * otherwise-untouched region (none of contraction/closure/opening
     * above) gets a FOURTH color-checkpoint-only tint toward the
     * supportive encoding color -- still flat/neutral at every earlier
     * checkpoint (Dwelling/Acceptance/Regulation), so it only becomes
     * visible once the SAME existing shared `intensity` animation
     * (ArcBodyMantraCircle's own 1100ms withTiming) actually reaches
     * Encoding's checkpoint, giving a real GRADUAL transition rather
     * than an instant swap, through the existing animation mechanism,
     * never a second one. This never touches contractionRegions/
     * openingRegions themselves -- purely a render-time color choice,
     * so green-only and never-selected regions are never reclassified
     * as supportive in the underlying data.
     */
    encodingSpreadActive?: boolean;
  }
): BodyMantraShapeAppearance {
  const openingBlueColorStops: readonly [string, string, string, string] = [CLOSURE_MARKER_COLOR, OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR];
  const contractionFadeColorStops = resolveFourStopColorFade(CONTRACTION_FROM_COLOR, CONTRACTION_TO_COLOR);
  const allowGreenOpening = options.allowGreenOpening ?? true;
  const openingMatch = options.openingRegions.find((entry) => entry.region === region && entry.side === side);
  if (openingMatch && openingMatch.role !== "opening") {
    // Dark Blue (supportive) -- the opening treatment applies at every
    // stage it's rendered at, unaffected by allowGreenOpening.
    return { colorStops: openingBlueColorStops, movementDef: resolveBodyRegionMovement(region) };
  }
  if (openingMatch) {
    // ARCHI -- Full ARC Body Flow Redesign task: "do not visually
    // display Green... display ALL contracted regions as RED" -- Light
    // Green NEVER renders its own color any more, at any stage; it
    // always shows the same contraction/red fade a plain Red-only
    // region shows. The ONE remaining difference a Light Green region
    // gets is its own active OPENING MOVEMENT, and only while
    // allowGreenOpening is true (Acceptance Part 1 specifically) -- "the
    // closed-and-contracted region is actively opened and stabilized
    // ONLY during Acceptance[Part 1]. After [Part 1], active opening
    // and stabilization continue ONLY in the... Blue regions."
    return { colorStops: contractionFadeColorStops, movementDef: allowGreenOpening ? resolveBodyRegionMovement(region) : null };
  }
  if (containsRegionSide(options.closureRegions, region, side)) {
    return { colorStops: openingBlueColorStops, movementDef: null };
  }
  if (containsRegionSide(options.contractionRegions, region, side)) {
    return { colorStops: contractionFadeColorStops, movementDef: null };
  }
  if (options.encodingSpreadActive) {
    return { colorStops: [NEUTRAL_COLOR, NEUTRAL_COLOR, NEUTRAL_COLOR, ENCODING_SPREAD_AMBIENT_COLOR], movementDef: null };
  }
  return { colorStops: [NEUTRAL_COLOR, NEUTRAL_COLOR, NEUTRAL_COLOR, NEUTRAL_COLOR], movementDef: null };
}

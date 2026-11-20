/**
 * arc/bodyRegionMovements.ts
 *
 * Final ARC Flow & Body Animation task, requirement 2 ("BODY MOVEMENT
 * -- CRITICAL"): the explicit anatomical movement map for every
 * closure-eligible BodyScanRegion -- "the body animation teaches the
 * movement, the mantra teaches attention." Pure data/geometry only, no
 * React, no animation library -- live/components/ArticulatedBodyShape.tsx
 * is the one place that actually drives a real animated value from
 * this module's own numbers.
 *
 * ARCHI 10-Set Body Movement redesign task: reorganized under the
 * reference diagram's own ten named movement sets (BODY_MOVEMENT_SETS
 * below) -- "use the image as inspiration for movement and appearance,
 * never as a static replacement or an exact anatomical specification."
 * Every one of this module's own existing per-region (dx, dy, scale)
 * numbers, movement-eligibility decisions, and safety constraints
 * (gentle, bounded, never exaggerated) carry over UNCHANGED in spirit;
 * this task's only real additions are (1) the explicit 10-set grouping
 * itself, as a first-class, testable registry, so "ARCHI's 10
 * body-movement sets" is a real concept in code, never just an
 * informal grouping, (2) one genuinely NEW movement-eligible region --
 * scanNeck (head/neck stabilization + straightening, the diagram's own
 * set 3) -- added with the smallest magnitude of any region in this
 * table, specifically because the neck is sensitive (the ORIGINAL
 * reason it was excluded): a gentle midline lengthening/centering,
 * never anything resembling a neck stretch or rotation, and (3) a
 * handful of existing regions' own dx/dy/scale retuned slightly to
 * better match each set's own described direction (documented inline,
 * at each changed entry) -- never a wholesale replacement of the
 * working geometry. The existing interactive SVG body
 * (arc/bodySilhouetteLayout.ts's own shapes), the existing selectable
 * BodyScanRegion identifiers (arc/bodyScanRegions.ts, arc/bodyScanSelection.ts),
 * and ArcBodyMantraCircle's own centering/expansion/tap-to-advance
 * behavior are ALL untouched by this task -- this module only ever
 * supplies numbers consumed by that already-existing, already-working
 * machinery, exactly as before. The body itself is -- and remains --
 * gender-neutral: every shape in bodySilhouetteLayout.ts is a plain,
 * abstract anatomical ellipse (no gendered proportions or secondary
 * characteristics of any kind), so no shape-level change was needed to
 * satisfy "a gender-neutral, articulated body."
 *
 * Eligibility (now 16 of the 26 arc/bodyScanRegions.ts regions): every
 * region with a real, gentle, anatomically meaningful GENTLE opening
 * movement. Explicitly excluded, per the spec's own instruction
 * ("exclude eyes, ears, head, and other regions without a suitable
 * opening movement") and this module's own judgment:
 * - forehead/eyes/cheeks/scanJaw/ears/scalp (head/face): no safe,
 *   natural "opening" movement for a face/head region -- animating
 *   head motion risks reading as exaggerated or unnatural. (scanNeck
 *   is the one deliberate exception -- see set 3 below -- because the
 *   reference diagram asks for it explicitly, as a genuinely gentle
 *   stabilizing/straightening posture cue, never a face/head motion.)
 * - throat: still excluded -- no voluntary "opening" gesture is safe
 *   to suggest visually for the throat specifically, unlike the
 *   neck's own broader postural straightening.
 * - elbows/forearms: these are intermediate arm segments with no
 *   movement of their own distinct from the arm's own outward motion
 *   (scanArms) or the wrist/palm/fingers opening -- animating them
 *   independently would fabricate a movement that isn't anatomically
 *   separate.
 * - shins: no independent meaningful opening distinct from the knee/
 *   ankle/foot movements already covering the leg.
 * Every other region below has its own real joint/muscle-based gentle
 * opening movement, matching the spec's own worked examples (shoulders/
 * chest/upper back/arms/hands/hips) and extended, by the same
 * reasoning, to the other genuinely movable joints the spec's own
 * "other eligible regions" instruction asks for.
 *
 * Movement model: a (dx, dy, scale) triple at FULL intensity (1.0) --
 * never a literal SVG transform string, applied instead directly to
 * the shape's own cx/cy/rx/ry (by live/components/ArticulatedBodyShape.tsx),
 * which is what makes this a real, bounded, anatomically-directed
 * movement ("real articulated body movements, not simply stretching
 * colored SVG shapes") rather than an arbitrary visual stretch:
 * - dx: outward translation (away from the body's own midline, x=110)
 *   at full intensity. Always 0 for a midline region (chest/abdomen/
 *   back/neck) -- those never move laterally. MIRRORED for a paired
 *   region's "left" side (resolveBodyRegionMovementTransform below
 *   negates it) so left and right always move away from each other,
 *   never toward it, satisfying "support independent left/right
 *   movement" without a second, duplicated table.
 * - dy: vertical translation at full intensity, same sign for both
 *   sides (never mirrored -- "down" is down regardless of side).
 * - scale: a gentle expansion factor at full intensity (1 = no
 *   change) for the regions whose own "opening" IS an expansion
 *   (chest/abdomen/back lengthening, palms/fingers/toes opening,
 *   feet widening) rather than a joint translation.
 * Every value here is deliberately small -- "no exaggerated or
 * physically unnatural movements."
 *
 * The THREE MOVEMENT PHASES (Acceptance -> Regulation -> Encoding --
 * "gentle beginning -> gradually increased movement -> full comfortable
 * opening or stabilization") are NOT a second, separate data table in
 * this file: they are the SAME (dx, dy, scale) triple below, scaled by
 * the `intensity` argument resolveBodyRegionMovementTransform already
 * takes -- and `intensity` is already pinned to exactly those three
 * checkpoints by arc/arcBodyMantraCircleLogic.ts's own
 * ARC_BODY_STAGE_INTENSITY (acceptance=0.3, regulation=0.65,
 * encoding=1.0). A single definition therefore drives a visibly
 * three-staged, monotonically increasing movement with no risk of the
 * two ever drifting apart. The SAME mechanism drives the matching
 * color brightening ("the supportive light-blue color should
 * progressively become brighter"): live/components/ArticulatedBodyShape.tsx
 * interpolates each shape's own fill from CLOSURE_FROM_COLOR (a dim,
 * muted blue -- arc/arcBodyMantraCircleLogic.ts) at intensity 0 toward
 * the trainee's own chosen, brighter supportive color at intensity 1,
 * using this exact same three-checkpoint intensity value -- so the
 * color brightens in the SAME three visible steps the movement itself
 * does, never on a separate or uncoordinated schedule.
 */

import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanContractionSelection, BodyScanOpeningRole, BodyScanOpeningSelection, BodyScanSide } from "./bodyScanSelection.ts";
import { MAX_SUPPORTIVE_OPENING_SELECTIONS, cycleSupportiveOnlyOpening, resolveBodyScanContractionState, resolveBodyScanOpeningRole, setBodyScanOpeningRole } from "./bodyScanSelection.ts";
import { BODY_SCAN_REGION_SHAPES } from "./bodySilhouetteLayout.ts";

export interface BodyRegionMovementDef {
  region: BodyScanRegion;
  /** Outward translation (px, at full intensity) -- 0 for a midline region. */
  dx: number;
  /** Vertical translation (px, at full intensity; positive = down). */
  dy: number;
  /** Expansion factor at full intensity (1 = unchanged). */
  scale: number;
  /** Hebrew description of the movement itself -- for accessibility labels ONLY, never rendered as on-screen instruction text during the mantra stages (requirement 9: "no verbal movement instructions"). */
  description: string;
}

/**
 * Exactly the 16 movement-eligible regions -- every OTHER
 * BodyScanRegion has no entry here at all (never a zero/no-op entry),
 * so "has a supported opening animation" is simply "has an entry in
 * this table," the same sparse-table convention
 * arc/bodyScanSelection.ts's own session arrays already use for "not
 * selected." Grouped below under the reference diagram's own ten
 * named movement sets (see BODY_MOVEMENT_SETS below, which is this
 * SAME grouping, expressed as its own first-class, testable registry
 * -- the comments here and that registry must never drift apart).
 */
export const BODY_REGION_MOVEMENTS: Partial<Record<BodyScanRegion, BodyRegionMovementDef>> = {
  // Set 1 -- Back: stabilization and straightening (lengthens upward, gently opens).
  upperBack: { region: "upperBack", dx: 0, dy: -4, scale: 1.05, description: "הגב העליון מתארך ומתיישר בהדרגה" },
  lowerBack: { region: "lowerBack", dx: 0, dy: -3, scale: 1.04, description: "הגב התחתון מתארך ומתרפה בעדינות" },
  // Set 2 -- Shoulders: stabilization and moving back (lowers + settles open; a 2D proxy for "back" with no real depth axis).
  scanShoulders: { region: "scanShoulders", dx: 3, dy: 7, scale: 1.02, description: "הכתפיים יורדות ונעות לאחור בעדינות, ונפתחות מעט" },
  // Set 3 -- Head and neck: stabilization and straightening. NEW -- the
  // smallest magnitude of any region here, deliberately: the neck is
  // sensitive (the original reason it had no entry at all), so this is
  // a gentle midline lengthening/centering cue only, never a stretch,
  // tilt, or rotation.
  scanNeck: { region: "scanNeck", dx: 0, dy: -2, scale: 1.02, description: "הצוואר מתארך ומתיישר מעט, במרכז" },
  // Set 4 -- Arms: straightening (arms settle outward into a straight, resting line).
  scanArms: { region: "scanArms", dx: 10, dy: 0, scale: 1, description: "הזרועות נעות בעדינות לצדדים" },
  // Set 5 -- Hands: opening (forearms/wrists loosen and release).
  wrists: { region: "wrists", dx: 3, dy: 0, scale: 1.06, description: "פרקי כפות הידיים משתחררים ונפתחים בעדינות" },
  // Set 6 -- Legs: straightening (knees lengthen/settle, never bend further).
  knees: { region: "knees", dx: 0, dy: -2, scale: 1.02, description: "הברכיים מתיישרות ומתרככות בעדינות" },
  // Set 7 -- Legs: opening (hips/thighs widen gently into a comfortable, open stance).
  pelvisHips: { region: "pelvisHips", dx: 3, dy: 0, scale: 1, description: "האגן נע בעדינות לעבר מנח פתוח ונוח" },
  thighs: { region: "thighs", dx: 5, dy: 0, scale: 1.02, description: "הירכיים משתחררות בעדינות לעבר מנח פתוח" },
  // Set 8 -- Palms: finger-opening (the hand itself opens, fingers spread).
  palms: { region: "palms", dx: 0, dy: 0, scale: 1.08, description: "כפות הידיים נפתחות בעדינות" },
  fingers: { region: "fingers", dx: 1, dy: 0, scale: 1.1, description: "האצבעות נפתחות ומתרווחות בעדינות" },
  // Set 9 -- Feet: opening to the sides (soles/toes widen outward).
  ankles: { region: "ankles", dx: 1, dy: 1, scale: 1.04, description: "הקרסוליים משתחררים ונפתחים מעט לצדדים" },
  feet: { region: "feet", dx: 3, dy: 0, scale: 1.04, description: "כפות הרגליים מתרווחות ומתרככות בעדינות" },
  toes: { region: "toes", dx: 1, dy: 0, scale: 1.12, description: "אצבעות הרגליים נפתחות ומתרווחות בעדינות" },
  // Set 10 -- Chest: opening and expansion (torso expands, the diagram's own most visible expansion).
  scanChest: { region: "scanChest", dx: 0, dy: 0, scale: 1.08, description: "החזה נפתח ומתרחב בעדינות" },
  scanAbdomen: { region: "scanAbdomen", dx: 0, dy: 0, scale: 1.05, description: "הבטן מתרחבת בעדינות עם הנשימה" },
};

/**
 * ARCHI 10-Set Body Movement redesign task: the reference diagram's own
 * ten named movement sets, as a first-class, testable registry -- "the
 * main visual reference for ARCHI's 10 body-movement sets." Purely
 * descriptive/grouping metadata (never consumed by the actual
 * animation math, which stays keyed by individual BodyScanRegion, the
 * same existing interactive-selection granularity this task explicitly
 * preserves) -- its own test proves every region in BODY_REGION_MOVEMENTS
 * belongs to EXACTLY one set here, so the grouping can never silently
 * drift out of sync with the table above.
 */
export type BodyMovementSetId =
  | "back"
  | "shoulders"
  | "headNeck"
  | "armsStraighten"
  | "handsOpen"
  | "legsStraighten"
  | "legsOpen"
  | "palmsOpen"
  | "feetOpen"
  | "chestExpand";

export interface BodyMovementSet {
  id: BodyMovementSetId;
  /** Hebrew label, matching the reference diagram's own wording. */
  label: string;
  regions: readonly BodyScanRegion[];
}

export const BODY_MOVEMENT_SETS: readonly BodyMovementSet[] = [
  { id: "back", label: "גב -- ייצוב ויישור", regions: ["upperBack", "lowerBack"] },
  { id: "shoulders", label: "כתפיים -- ייצוב והזזה לאחור", regions: ["scanShoulders"] },
  { id: "headNeck", label: "ראש וצוואר -- ייצוב ויישור", regions: ["scanNeck"] },
  { id: "armsStraighten", label: "ידיים -- יישור", regions: ["scanArms"] },
  { id: "handsOpen", label: "ידיים -- פתיחה", regions: ["wrists"] },
  { id: "legsStraighten", label: "רגליים -- יישור", regions: ["knees"] },
  { id: "legsOpen", label: "רגליים -- פתיחה", regions: ["pelvisHips", "thighs"] },
  { id: "palmsOpen", label: "כפות ידיים -- פתיחת אצבעות", regions: ["palms", "fingers"] },
  { id: "feetOpen", label: "כפות רגליים -- פתיחה לצדדים", regions: ["ankles", "feet", "toes"] },
  { id: "chestExpand", label: "בית החזה -- פתיחה והתרחבות", regions: ["scanChest", "scanAbdomen"] },
];

export function isBodyRegionMovementEligible(region: BodyScanRegion): boolean {
  return region in BODY_REGION_MOVEMENTS;
}

/**
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 4: "the existing movement instructions
 * already correctly describe bilateral movements... synchronize the
 * body-region highlighting with those instructions." True exactly for
 * a movement-eligible region that is actually drawn as a genuine
 * left/right PAIR (arc/bodySilhouetteLayout.ts's own shape data -- a
 * region with at least one "left" shape necessarily also has a
 * "right" one, since every paired region in that table is defined for
 * both). A midline region (upperBack, scanChest, scanNeck, pelvisHips,
 * etc. -- side: null) is never a pair: there is no "opposite side" to
 * mirror at all, so it is correctly excluded here, never accidentally
 * treated as eligible for bilateral sync.
 */
export function isBodyRegionSymmetricPair(region: BodyScanRegion): boolean {
  return isBodyRegionMovementEligible(region) && BODY_SCAN_REGION_SHAPES.some((shape) => shape.region === region && shape.side === "left");
}

/** "left" <-> "right"; null (a midline region) has no opposite, so it maps to itself -- callers only ever use this after already confirming isBodyRegionSymmetricPair(region), where side is always "left" or "right". */
export function resolveOppositeBodySide(side: BodyScanSide): BodyScanSide {
  if (side === "left") return "right";
  if (side === "right") return "left";
  return side;
}

/**
 * Section 4's Green example, visual-only: "highlight both hands in
 * Green where allowed by the existing selection state... do not
 * automatically record the opposite hand as contracted merely because
 * the movement uses both hands." This resolves whether (region, side)
 * should be DISPLAYED as Green purely because its symmetric opposite
 * is genuinely Green -- it never reads or writes any new data, so a
 * caller that never calls it leaves the underlying contraction/opening
 * arrays completely untouched (no fabricated contraction, ever).
 * Returns false whenever (region, side) itself already carries any
 * real selection of its own (contraction or otherwise) -- a region's
 * own real, directly-tapped state always wins over a mirrored one,
 * "never show contradictory colors."
 */
export function resolveMirroredGreenHighlight(
  contractionSelections: readonly { region: BodyScanRegion; side: BodyScanSide }[],
  openingSelections: readonly { region: BodyScanRegion; side: BodyScanSide; role: BodyScanOpeningRole }[],
  region: BodyScanRegion,
  side: BodyScanSide
): boolean {
  if (side === null || !isBodyRegionSymmetricPair(region)) return false;
  const hasOwnContraction = contractionSelections.some((entry) => entry.region === region && entry.side === side);
  if (hasOwnContraction) return false;
  const opposite = resolveOppositeBodySide(side);
  const oppositeContracted = contractionSelections.some((entry) => entry.region === region && entry.side === opposite);
  if (!oppositeContracted) return false;
  const oppositeRole = openingSelections.find((entry) => entry.region === region && entry.side === opposite)?.role;
  return oppositeRole === "opening";
}

/**
 * Section 4's Blue example: "treat a symmetrical pair as one logical
 * selection for selection limits." Unlike Green (visual-only mirror
 * above), a Blue (supportive) pair is genuinely recorded on BOTH
 * sides -- there is no "do not fabricate" concern here, since
 * supportive attention chosen for a region is a real, deliberate
 * choice the spec's own worked example sanctions outright ("both
 * hands immediately appear in Blue... the user does not need to tap
 * the second hand"). So the max-two-Blue limit must count a
 * same-region left+right pair as ONE slot, never two, or selecting a
 * single symmetric region would silently consume the entire limit.
 * Groups by region alone for a symmetric pair (both its sides, when
 * both selected, collapse to one key) and by "region-side" for every
 * other (midline) region, which only ever has one real side anyway.
 */
export function countLogicalSupportiveSelections(openingSelections: readonly { region: BodyScanRegion; side: BodyScanSide; role: BodyScanOpeningRole }[]): number {
  const seen = new Set<string>();
  for (const entry of openingSelections) {
    if (entry.role !== "opening_and_supportive") continue;
    const key = isBodyRegionSymmetricPair(entry.region) ? entry.region : `${entry.region}-${entry.side ?? "mid"}`;
    seen.add(key);
  }
  return seen.size;
}

/** The logical (pair-aware) counterpart to arc/bodyScanSelection.ts's own canPromoteToSupportiveOpening -- a slot already Blue can always be re-toggled (never blocked on itself), otherwise the limit reads countLogicalSupportiveSelections rather than the raw per-slot count, so a selected symmetric pair never eats both of the two allowed slots. Reads the exact same MAX_SUPPORTIVE_OPENING_SELECTIONS constant every other limit check in this codebase uses -- never a second, independently-chosen number. */
export function canPromoteToSupportiveOpeningLogical(openingSelections: readonly BodyScanOpeningSelection[], region: BodyScanRegion, side: BodyScanSide): boolean {
  if (resolveBodyScanOpeningRole([...openingSelections], region, side) === "opening_and_supportive") return true;
  return countLogicalSupportiveSelections(openingSelections) < MAX_SUPPORTIVE_OPENING_SELECTIONS;
}

/**
 * Section 4's Blue example, engine level: Screen Two's own Blue-only
 * cycle, extended so a genuine symmetric pair (section 4's own
 * isBodyRegionSymmetricPair) is selected and deselected TOGETHER --
 * "selecting one side automatically highlights both sides... the
 * opposite side should be highlighted immediately, without requiring
 * another tap... deselecting the selected region should deselect both
 * sides together." A midline (non-paired) region falls straight
 * through to the existing, unilateral cycleSupportiveOnlyOpening,
 * completely unchanged.
 *
 * Section 5's own exclusion rule, enforced for BOTH sides of the pair:
 * "if a bilateral Blue selection conflicts with an existing Red/Green
 * region on either side, prevent the invalid selection" -- a region
 * already Red/Green on EITHER side refuses the whole pair, returning
 * openingSelections completely unchanged (the same silent-refusal
 * contract cycleSupportiveOnlyOpening/cycleBodyScanOpeningRole already
 * use), never a half-applied, contradictory result with one side blue
 * and the other red.
 */
export function cycleSupportiveOnlyOpeningBilateral(
  contractionSelections: readonly BodyScanContractionSelection[],
  openingSelections: readonly BodyScanOpeningSelection[],
  region: BodyScanRegion,
  side: BodyScanSide
): BodyScanOpeningSelection[] {
  if (!isBodyRegionSymmetricPair(region)) {
    return cycleSupportiveOnlyOpening([...contractionSelections], [...openingSelections], region, side);
  }
  const opposite = resolveOppositeBodySide(side);
  if (resolveBodyScanContractionState([...contractionSelections], region, side) === "contraction") return [...openingSelections];
  if (resolveBodyScanContractionState([...contractionSelections], region, opposite) === "contraction") return [...openingSelections];

  const current = resolveBodyScanOpeningRole([...openingSelections], region, side);
  if (current === "opening_and_supportive") {
    return setBodyScanOpeningRole(setBodyScanOpeningRole([...openingSelections], region, side, "none"), region, opposite, "none");
  }
  if (!canPromoteToSupportiveOpeningLogical([...openingSelections], region, side)) return [...openingSelections];
  return setBodyScanOpeningRole(setBodyScanOpeningRole([...openingSelections], region, side, "opening_and_supportive"), region, opposite, "opening_and_supportive");
}

export function resolveBodyRegionMovement(region: BodyScanRegion): BodyRegionMovementDef | null {
  return BODY_REGION_MOVEMENTS[region] ?? null;
}

/**
 * Every (region, side) pair, across every drawn shape, for a
 * movement-eligible region -- the one allow-list
 * live/NewArcLiveScreen.tsx's "Identify Closure" screen restricts its
 * own selectable regions to ("ONLY regions with a real, gentle,
 * anatomically meaningful opening movement"). Deduplicated: a region
 * drawn in both front and back views (e.g. scanShoulders) contributes
 * exactly one (region, side) entry per side, never two.
 */
export function resolveMovementEligibleRegionKeys(): { region: BodyScanRegion; side: BodyScanSide }[] {
  const seen = new Set<string>();
  const keys: { region: BodyScanRegion; side: BodyScanSide }[] = [];
  for (const shape of BODY_SCAN_REGION_SHAPES) {
    if (!isBodyRegionMovementEligible(shape.region)) continue;
    const key = `${shape.region}-${shape.side ?? "mid"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push({ region: shape.region, side: shape.side });
  }
  return keys;
}

/** Filters an arbitrary (region, side) selection list down to only the movement-eligible ones -- never assumes a caller's own list is already filtered (e.g. a historical session's bodyScanHeavinessRegions saved before this task existed). */
export function filterMovementEligibleSelections<T extends { region: BodyScanRegion; side: BodyScanSide }>(selections: readonly T[]): T[] {
  return selections.filter((entry) => isBodyRegionMovementEligible(entry.region));
}

export interface ResolvedBodyRegionTransform {
  dx: number;
  dy: number;
  scale: number;
}

/**
 * The one shared transform math every ArticulatedBodyShape instance
 * uses -- `intensity` is 0 (no movement, Dwelling) through 1 (full
 * comfortable opening, Encoding), and `side` mirrors `dx` for a "left"
 * shape so left and right always move apart, never toward each other,
 * from the exact same movement definition. A region with no movement
 * def (not eligible, or an unknown region) resolves to "no movement at
 * all" -- "never animate unselected regions as opening targets" holds
 * structurally for a non-eligible region, which can never even be
 * selected as an opening target in the first place.
 */
export function resolveBodyRegionMovementTransform(def: BodyRegionMovementDef | null, side: BodyScanSide, intensity: number): ResolvedBodyRegionTransform {
  "worklet";
  // Circle Centering and Touch Behavior / Android bug-fix task: this
  // function is called every animation frame from INSIDE
  // live/components/ArticulatedBodyShape.tsx's own useAnimatedProps
  // worklet, but is DEFINED in this separate, plain (non-.tsx) module.
  // Reanimated's "automatic workletization" is documented to not
  // reliably trace a plain cross-file function call in every version
  // combination -- the officially documented fix for "using a function
  // from a different file" inside a worklet is this exact explicit
  // "worklet" directive, so the function is always compiled for the UI
  // thread regardless of auto-detection. Confirmed root cause of the
  // reported black screen on entering a mantra stage (the first place
  // in this codebase that ever called an imported, cross-file function
  // from inside a Reanimated worklet): without this directive, calling
  // an un-workletized plain JS function from the UI thread throws at
  // runtime on a release Android build (no redbox in release mode, so
  // the screen simply goes blank while unrelated native overlay
  // windows -- the floating task timer, the ARC shortcut -- keep
  // rendering independently). The directive changes nothing about this
  // function's own behavior or its plain-JS-call contract (every
  // existing call site -- resolveBodyRegionMovementTransform's own
  // test file included -- keeps working exactly as before); it only
  // ALSO allows the UI thread to run it directly.
  if (!def) return { dx: 0, dy: 0, scale: 1 };
  const clamped = Math.max(0, Math.min(1, intensity));
  const sideSign = side === "left" ? -1 : 1;
  return {
    // `|| 0` normalizes a resulting -0 (e.g. a midline region's own
    // dx: 0, mirrored for "left") back to a plain 0 -- never a
    // numerically-equal-but-distinct -0 that would make two otherwise
    // identical transforms compare unequal.
    dx: def.dx * sideSign * clamped || 0,
    dy: def.dy * clamped,
    scale: 1 + (def.scale - 1) * clamped,
  };
}

/**
 * Final ARC Body Redesign & Flow Fixes task, requirement 5 ("SHOW
 * MOVEMENT INSTRUCTIONS BELOW THE CIRCLE"): one short, practical,
 * stage-specific Hebrew line per movement SET (never per individual
 * region -- scanShoulders/left and scanShoulders/right both belong to
 * the SAME "shoulders" set and therefore share the exact same
 * instruction line, deduplicated by resolveMovementInstructionsForStage
 * below), for exactly the three stages that actually move the body
 * (Acceptance/Regulation/Encoding -- Dwelling and every selection
 * screen never reach this at all, enforced by the stage check inside
 * that function, not by the caller remembering to gate it). Every line
 * is a plain, present-tense, first-person statement describing the
 * movement itself ("I lower... I deepen... I keep...") -- never a
 * written instruction for how to FEEL (that stays the mantra's own
 * job, shown inside the circle) and never anything the denylist in
 * arc/instructions.ts would flag (verified directly, by every one of
 * these 30 lines, in this module's own test file).
 */
export const BODY_MOVEMENT_SET_INSTRUCTIONS: Record<BodyMovementSetId, { acceptance: string; regulation: string; encoding: string }> = {
  back: {
    acceptance: "אני מיישר מעט את הגב כלפי מעלה.",
    regulation: "אני מעמיק בעדינות את ההתארכות של הגב.",
    encoding: "אני שומר על גב יציב וזקוף.",
  },
  shoulders: {
    acceptance: "אני מוריד את הכתפיים מעט לאחור.",
    regulation: "אני מעמיק בעדינות את פתיחת הכתפיים.",
    encoding: "אני שומר על כתפיים פתוחות ויציבות.",
  },
  headNeck: {
    acceptance: "אני מיישר מעט את הראש והצוואר.",
    regulation: "אני מעמיק בעדינות את התארכות הצוואר.",
    encoding: "אני שומר על ראש וצוואר יציבים וישרים.",
  },
  armsStraighten: {
    acceptance: "אני מיישר מעט את הזרועות הצידה.",
    regulation: "אני מעמיק בעדינות את יישור הזרועות.",
    encoding: "אני שומר על זרועות ישרות ונינוחות.",
  },
  handsOpen: {
    acceptance: "אני פותח מעט את כפות הידיים.",
    regulation: "אני מעמיק בעדינות את פתיחת הידיים.",
    encoding: "אני שומר על ידיים פתוחות ונינוחות.",
  },
  legsStraighten: {
    acceptance: "אני מיישר מעט את הרגליים.",
    regulation: "אני מעמיק בעדינות את יישור הרגליים.",
    encoding: "אני שומר על רגליים יציבות וישרות.",
  },
  legsOpen: {
    acceptance: "אני פותח מעט את עמידת הרגליים.",
    regulation: "אני מעמיק בעדינות את פתיחת הרגליים.",
    encoding: "אני שומר על עמידה פתוחה ויציבה.",
  },
  palmsOpen: {
    acceptance: "אני פותח מעט את האצבעות.",
    regulation: "אני מעמיק בעדינות את פתיחת האצבעות.",
    encoding: "אני שומר על כף יד פתוחה ונינוחה.",
  },
  feetOpen: {
    acceptance: "אני פותח מעט את כפות הרגליים לצדדים.",
    regulation: "אני מעמיק בעדינות את פתיחת כפות הרגליים.",
    encoding: "אני שומר על כפות רגליים פתוחות ויציבות.",
  },
  chestExpand: {
    acceptance: "אני מרחיב מעט את בית החזה.",
    regulation: "אני מעמיק בעדינות את פתיחת בית החזה.",
    encoding: "אני שומר על בית חזה פתוח ורחב.",
  },
};

/** Which of the 10 movement sets the given region belongs to -- null for a region that isn't movement-eligible at all (never silently falls into some default set). */
export function resolveBodyMovementSetForRegion(region: BodyScanRegion): BodyMovementSetId | null {
  for (const set of BODY_MOVEMENT_SETS) {
    if (set.regions.includes(region)) return set.id;
  }
  return null;
}

/**
 * The actual instruction lines to show BELOW the circle, for the
 * trainee's own actually-selected opening regions, at the given stage
 * -- "the instruction must describe the movement demonstrated at that
 * specific stage," "animate only user-selected opening regions,"
 * "combining multiple selected movements naturally" (several
 * selected regions across different sets simply contribute several
 * lines; the SAME set selected on both sides, or via more than one of
 * its own regions, contributes its line only once). Returns an empty
 * list for every stage OTHER than Acceptance/Regulation/Encoding --
 * "do not show movement instructions during Dwelling or selection
 * screens" holds structurally here, at the one shared source, rather
 * than relying on every caller to remember the same stage check.
 */
/**
 * ARCHI -- Precise Body Opening and Stabilization Rules task, Final
 * Goal: "the closed-and-contracted region is actively opened and
 * stabilized ONLY during Acceptance. After Acceptance, active opening
 * and stabilization continue ONLY in the user-selected supportive Blue
 * regions." A Light Green ("opening"-only) entry contributes its own
 * movement-set instruction line only while stage is "acceptance" --
 * never during "regulation"/"encoding", where only Dark Blue
 * ("opening_and_supportive") entries still contribute. A role-less
 * entry (pre-existing test fixtures that omit it; every real
 * production entry always carries one) is treated as Blue -- the same
 * backward-compatible default arc/arcBodyMantraCircleLogic.ts's own
 * resolveBodyMantraShapeAppearance already uses for the identical
 * reason -- so it keeps contributing at every stage, unaffected.
 */
export function resolveMovementInstructionsForStage(
  stage: string,
  openingRegions: readonly { region: BodyScanRegion; side: BodyScanSide; role?: BodyScanOpeningRole }[]
): string[] {
  if (stage !== "acceptance" && stage !== "acceptance_part_two" && stage !== "regulation" && stage !== "encoding") return [];
  const setIds = new Set<BodyMovementSetId>();
  for (const entry of openingRegions) {
    if (stage !== "acceptance" && entry.role === "opening") continue;
    const setId = resolveBodyMovementSetForRegion(entry.region);
    if (setId) setIds.add(setId);
  }
  // ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 2 shares
  // its gentle, "initial opening" instruction wording with Part 1's own
  // "acceptance" tier -- the two are the same gentleness level,
  // Regulation/Encoding's own deeper wording stays untouched.
  const instructionStage = stage === "acceptance_part_two" ? "acceptance" : stage;
  return [...setIds].map((setId) => BODY_MOVEMENT_SET_INSTRUCTIONS[setId][instructionStage]);
}

/**
 * arc/bodyScanSelection.ts
 *
 * Body Scan Upgrade task: pure state manipulation for the two new
 * interactive body-scan screens (contraction, then heaviness/
 * closedness) and the primary-opening-region choice that follows them.
 * No React, no storage -- the exact same split every other ARC LIVE
 * pure module (arc/newArcLiveSteps.ts, arc/taskOccurrenceOverride.ts)
 * already keeps.
 *
 * Critical requirement 1 ("automatic default selection"): every region
 * is "אין תחושה" by DEFAULT simply because it has no entry in these
 * arrays at all -- never a pre-populated "none" entry for all 26
 * regions. This is the exact same sparse-array convention
 * supportiveBodyAreas/unpleasantBodyAreas already use elsewhere in
 * this file's own session state: "continue without choosing" is
 * already valid everywhere in this engine, and an empty array IS that
 * valid state here too, with zero new plumbing. Restoring a region to
 * "אין תחושה" is simply removing its entry -- never writing a literal
 * "none" value anywhere, so a once-identified sensation can always be
 * cleared back to the true default, not just reassigned to a
 * placeholder "none" record.
 */

import type { BodyScanRegion } from "./bodyScanRegions.ts";

export type BodyScanSide = "left" | "right" | null;

export interface BodyScanContractionSelection {
  region: BodyScanRegion;
  side: BodyScanSide;
}

export type BodyScanHeavinessState = "heaviness" | "closedness" | "heaviness_and_closedness";

export interface BodyScanHeavinessSelection {
  region: BodyScanRegion;
  side: BodyScanSide;
  state: BodyScanHeavinessState;
}

/** "אין תחושה" (no entry) vs "כיווץ / מתח" (an entry exists) for this exact (region, side) pair -- a different side of the SAME region is a completely independent slot. */
export function resolveBodyScanContractionState(selections: BodyScanContractionSelection[], region: BodyScanRegion, side: BodyScanSide): "none" | "contraction" {
  return selections.some((entry) => entry.region === region && entry.side === side) ? "contraction" : "none";
}

/** Toggles this one (region, side) slot between "אין תחושה" and "כיווץ / מתח" -- changing one region/side never touches any other entry in the array. */
export function toggleBodyScanContraction(selections: BodyScanContractionSelection[], region: BodyScanRegion, side: BodyScanSide): BodyScanContractionSelection[] {
  const has = selections.some((entry) => entry.region === region && entry.side === side);
  if (has) return selections.filter((entry) => !(entry.region === region && entry.side === side));
  return [...selections, { region, side }];
}

export function resolveBodyScanHeavinessState(selections: BodyScanHeavinessSelection[], region: BodyScanRegion, side: BodyScanSide): "none" | BodyScanHeavinessState {
  return selections.find((entry) => entry.region === region && entry.side === side)?.state ?? "none";
}

/**
 * Sets this one (region, side) slot's own heaviness/closedness state,
 * replacing whatever it held before -- "none" removes the entry
 * entirely (back to the true default, same convention as
 * toggleBodyScanContraction above), any of the three real states
 * upserts it. Every OTHER (region, side) slot is always untouched.
 */
export function setBodyScanHeavinessState(
  selections: BodyScanHeavinessSelection[],
  region: BodyScanRegion,
  side: BodyScanSide,
  state: "none" | BodyScanHeavinessState
): BodyScanHeavinessSelection[] {
  const filtered = selections.filter((entry) => !(entry.region === region && entry.side === side));
  if (state === "none") return filtered;
  return [...filtered, { region, side, state }];
}

function resolveCombinedHeavinessState(hasHeaviness: boolean, hasClosedness: boolean): "none" | BodyScanHeavinessState {
  if (hasHeaviness && hasClosedness) return "heaviness_and_closedness";
  if (hasHeaviness) return "heaviness";
  if (hasClosedness) return "closedness";
  return "none";
}

/**
 * ARC Full Sequence Update task, Part 3: the two consecutive, SEPARATE
 * questions the new protocol requires ("באילו אזורים בגוף אתה מרגיש
 * כבדות?" then "...סגירות?") must never assume one implies the other --
 * "save selections independently." These two functions flip ONLY their
 * own bit of this one (region, side) slot's tri-state, reading and
 * preserving whatever the OTHER bit already held -- the exact same
 * underlying bodyScanHeavinessRegions array/type as before (never a
 * second, competing field for the same concept), just two independent
 * entry points into it instead of one single three/four-way picker.
 * Toggling heaviness on a region already marked "closedness" alone
 * produces "heaviness_and_closedness"; toggling it off again returns to
 * plain "closedness" -- the closedness bit is never touched either way.
 */
export function toggleBodyScanHeaviness(selections: BodyScanHeavinessSelection[], region: BodyScanRegion, side: BodyScanSide): BodyScanHeavinessSelection[] {
  const current = resolveBodyScanHeavinessState(selections, region, side);
  const hasClosedness = current === "closedness" || current === "heaviness_and_closedness";
  const hasHeaviness = current === "heaviness" || current === "heaviness_and_closedness";
  return setBodyScanHeavinessState(selections, region, side, resolveCombinedHeavinessState(!hasHeaviness, hasClosedness));
}

/** Symmetric to toggleBodyScanHeaviness above, for the second question's own closedness bit -- the heaviness bit, if any, is always preserved untouched. */
export function toggleBodyScanClosedness(selections: BodyScanHeavinessSelection[], region: BodyScanRegion, side: BodyScanSide): BodyScanHeavinessSelection[] {
  const current = resolveBodyScanHeavinessState(selections, region, side);
  const hasClosedness = current === "closedness" || current === "heaviness_and_closedness";
  const hasHeaviness = current === "heaviness" || current === "heaviness_and_closedness";
  return setBodyScanHeavinessState(selections, region, side, resolveCombinedHeavinessState(hasHeaviness, !hasClosedness));
}

/**
 * ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
 * task, main objective: a region already identified as heavy/closed
 * (never contraction -- that stays its own, completely separate array
 * above, with no role concept of its own at all) can be chosen for
 * opening alone ("green" -- opening = true, supportive = false), or
 * ALSO as a supportive anchor ("blue" -- opening = true, supportive =
 * true). Blue is deliberately modeled as its own distinct role, not a
 * second boolean flag alongside green, since the two are mutually
 * exclusive states of the SAME (region, side) slot -- a region is
 * never simultaneously "green" and "blue" the way it can be
 * simultaneously "closed" and "heavy" (two genuinely independent bits
 * on bodyScanHeavinessRegions above). "None" (no entry at all, the
 * same sparse-array default convention as every other array in this
 * module) is the third, deselected state every (region, side) slot
 * starts in and can always return to.
 */
export type BodyScanOpeningRole = "opening" | "opening_and_supportive";

export interface BodyScanOpeningSelection {
  region: BodyScanRegion;
  side: BodyScanSide;
  role: BodyScanOpeningRole;
}

/** "None" (no entry) vs this exact (region, side) slot's own role -- same convention as resolveBodyScanContractionState/resolveBodyScanHeavinessState above. */
export function resolveBodyScanOpeningRole(selections: BodyScanOpeningSelection[], region: BodyScanRegion, side: BodyScanSide): "none" | BodyScanOpeningRole {
  return selections.find((entry) => entry.region === region && entry.side === side)?.role ?? "none";
}

/** Sets this one (region, side) slot's own role, replacing whatever it held before -- "none" removes the entry entirely (same convention as setBodyScanHeavinessState above), either real role upserts it. Every OTHER (region, side) slot is always untouched. */
export function setBodyScanOpeningRole(
  selections: BodyScanOpeningSelection[],
  region: BodyScanRegion,
  side: BodyScanSide,
  role: "none" | BodyScanOpeningRole
): BodyScanOpeningSelection[] {
  const filtered = selections.filter((entry) => !(entry.region === region && entry.side === side));
  if (role === "none") return filtered;
  return [...filtered, { region, side, role }];
}

/**
 * ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
 * Logic task: the trainee's FIRST tap on a "none" slot resolves its
 * color purely from `isGreenEligible` -- true exactly when this same
 * (region, side) was already selected RED during the earlier
 * contraction step (the one real production call site,
 * arc/newArcLiveSteps.ts's own toggleOpeningBodyScanRegion, derives it
 * from resolveBodyScanContractionState). "Green must NOT be
 * automatically preselected" -- this function is never called except
 * in direct response to an actual tap, so there is no path by which a
 * region could show green (or blue) before the trainee taps it here.
 *
 * Every tap AFTER the first one on the SAME slot -- regardless of
 * which role it is currently showing, Light Green or Dark Blue --
 * simply deselects it back to "none" ("a clear way to deselect or
 * correct a choice, without introducing a new Green-to-Blue cycle that
 * contradicts these rules"). This supersedes the EARLIER three-state
 * cycle (none -> opening -> opening_and_supportive -> none) this same
 * function used to implement for a region eligible for both roles --
 * that cycle let a second tap silently promote an already-Light-Green
 * region to Dark Blue, exactly the behavior this task corrects. A
 * region whose earlier contraction status makes it BLUE-only
 * (isGreenEligible false) was already a two-state none<->blue cycle
 * before this correction (it never visited the "opening" branch at
 * all) and is completely unaffected -- in particular this is why
 * Shortened ARC's own supportive_area_select screen, which always
 * calls this with isGreenEligible === false (it has no contraction
 * data of its own), is untouched by this change.
 */
export function resolveNextOpeningRole(current: "none" | BodyScanOpeningRole, isGreenEligible: boolean): "none" | BodyScanOpeningRole {
  if (current === "none") return isGreenEligible ? "opening" : "opening_and_supportive";
  return "none";
}

/**
 * Section 2's own maximum: "allow the user to select a maximum of TWO
 * Dark Blue supportive regions per ARC session." Exported so both
 * cycleBodyScanOpeningRole below (the authoritative, state-management-
 * level enforcement the task explicitly asks for -- "enforce the limit
 * in the actual state-management logic, not just visually in the UI")
 * and the UI's own pre-check (to decide whether to show the friendly
 * blocked-selection message) read the exact same number.
 */
export const MAX_SUPPORTIVE_OPENING_SELECTIONS = 2;

/** How many DISTINCT (region, side) slots are currently Dark Blue -- the one count both the limit check below and any caller that wants to display "x/2 selected" reads. */
export function countSupportiveOpeningSelections(selections: BodyScanOpeningSelection[]): number {
  return resolveSupportiveOpeningSelections(selections).length;
}

/**
 * True when promoting THIS (region, side) slot to Dark Blue is
 * allowed -- always true when it is already Dark Blue (promoting an
 * already-blue slot to itself is a no-op, never a reason to block),
 * otherwise only while fewer than MAX_SUPPORTIVE_OPENING_SELECTIONS
 * distinct OTHER slots are already Dark Blue. Section 2: "allow the
 * user to deselect an existing Blue region and choose another" holds
 * structurally -- deselecting first lowers the count, so the very next
 * promotion attempt is then allowed again.
 */
export function canPromoteToSupportiveOpening(selections: BodyScanOpeningSelection[], region: BodyScanRegion, side: BodyScanSide): boolean {
  if (resolveBodyScanOpeningRole(selections, region, side) === "opening_and_supportive") return true;
  return countSupportiveOpeningSelections(selections) < MAX_SUPPORTIVE_OPENING_SELECTIONS;
}

/**
 * Section 3's own exact tap sequence: "first tap: green -- opening
 * only [only when isGreenEligible]. Second tap: blue -- opening +
 * supportive," with a third tap returning to "none" -- the obvious,
 * existing-convention way to deselect/reset this one slot (section 3's
 * own "provide an obvious way to deselect or reset the selection"),
 * never a separate reset button this codebase has no precedent for.
 * Every OTHER slot is always untouched, same as every other toggle/
 * cycle function in this module.
 *
 * ARCHI -- Precise Body Opening and Stabilization Rules task: now
 * takes `isGreenEligible` (section 1's "contracted AND closed" gate --
 * see resolveNextOpeningRole's own doc) and enforces section 2's
 * maximum-two-Blue limit directly here, in the state-management logic
 * itself (never only in the UI): an attempt to promote a THIRD region
 * to Dark Blue is silently refused -- the selections array is returned
 * completely unchanged, the exact same "no-op, nothing to show for
 * it" contract setBodyScanOpeningRole already has for a "none" removal
 * of a slot that was never selected. The caller (live/NewArcLiveScreen.tsx)
 * runs the identical canPromoteToSupportiveOpening check BEFORE calling
 * this, purely to decide whether to surface the friendly Hebrew
 * message -- this function's own refusal is what actually, always
 * prevents the third selection, regardless of whether that UI check
 * ever ran at all.
 */
export function cycleBodyScanOpeningRole(selections: BodyScanOpeningSelection[], region: BodyScanRegion, side: BodyScanSide, isGreenEligible: boolean): BodyScanOpeningSelection[] {
  const current = resolveBodyScanOpeningRole(selections, region, side);
  const next = resolveNextOpeningRole(current, isGreenEligible);
  if (next === "opening_and_supportive" && !canPromoteToSupportiveOpening(selections, region, side)) return selections;
  return setBodyScanOpeningRole(selections, region, side, next);
}

/** Section 8's own exact data-integrity rule: "blue implies opening = true AND supportive = true; green implies opening = true AND supportive = false." Every entry in this array (by construction -- it is never populated with any other role) already satisfies opening = true, so this resolves only the supportive half. */
export function isBodyScanOpeningRoleSupportive(role: BodyScanOpeningRole): boolean {
  return role === "opening_and_supportive";
}

/** Every (region, side) entry actually marked supportive ("blue") -- the ONE filter every caller that needs "which areas serve as supportive anchors" uses, never a second, independently-reimplemented filter. A green-only entry is never included -- "do not present green-only areas as supportive." */
export function resolveSupportiveOpeningSelections(selections: BodyScanOpeningSelection[]): BodyScanOpeningSelection[] {
  return selections.filter((entry) => isBodyScanOpeningRoleSupportive(entry.role));
}

/**
 * ARCHI -- Full ARC Body Flow Redesign task: Screen One's own combined
 * Red/Green tap cycle -- "first tap: RED. Second tap: LIGHT GREEN [only
 * for a movement-eligible region]. Third tap: deselect." Unlike the
 * cycle above (which only ever mutates openingSelections), this one
 * drives contraction (Red) and the opening role (Green) TOGETHER, since
 * Screen One is now the single screen for both. A movement-ineligible
 * region never reaches "opening" at all -- its second tap deselects
 * straight back to "none" ("GREEN must never be available").
 */
export function cycleContractionAndGreenOpening(
  contractionSelections: BodyScanContractionSelection[],
  openingSelections: BodyScanOpeningSelection[],
  region: BodyScanRegion,
  side: BodyScanSide,
  isMovementEligible: boolean
): { contractionSelections: BodyScanContractionSelection[]; openingSelections: BodyScanOpeningSelection[] } {
  const isRed = resolveBodyScanContractionState(contractionSelections, region, side) === "contraction";
  const isGreen = isRed && resolveBodyScanOpeningRole(openingSelections, region, side) === "opening";
  if (isGreen) {
    return {
      contractionSelections: toggleBodyScanContraction(contractionSelections, region, side),
      openingSelections: setBodyScanOpeningRole(openingSelections, region, side, "none"),
    };
  }
  if (isRed) {
    if (!isMovementEligible) {
      return { contractionSelections: toggleBodyScanContraction(contractionSelections, region, side), openingSelections };
    }
    return { contractionSelections, openingSelections: setBodyScanOpeningRole(openingSelections, region, side, "opening") };
  }
  return { contractionSelections: toggleBodyScanContraction(contractionSelections, region, side), openingSelections };
}

/**
 * ARCHI -- Full ARC Body Flow Redesign task: Screen Two's own Blue-only
 * cycle -- "every region selected Red or Green on Screen One is
 * forbidden from becoming Blue... enforce exclusion in the engine AND
 * the UI." This is the engine-level half of that absolute rule: a
 * region already marked Red or Green (any entry in contractionSelections)
 * is refused here regardless of what the caller/UI passes in, returning
 * openingSelections completely unchanged -- the same silent-refusal
 * contract cycleBodyScanOpeningRole already uses for a blocked promotion.
 * Every other region cycles none<->"opening_and_supportive" directly
 * (isGreenEligible always false here -- Green is never reachable from
 * this screen), with the existing maximum-two-Blue limit still enforced
 * by cycleBodyScanOpeningRole itself.
 */
export function cycleSupportiveOnlyOpening(
  contractionSelections: BodyScanContractionSelection[],
  openingSelections: BodyScanOpeningSelection[],
  region: BodyScanRegion,
  side: BodyScanSide
): BodyScanOpeningSelection[] {
  if (resolveBodyScanContractionState(contractionSelections, region, side) === "contraction") return openingSelections;
  return cycleBodyScanOpeningRole(openingSelections, region, side, false);
}

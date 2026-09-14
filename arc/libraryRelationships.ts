/**
 * arc/libraryRelationships.ts
 *
 * Adaptive ARC architecture task, Phase 3 (data-layer foundations),
 * spec section 5 ("Relationship rules"): pure validation helpers over
 * StateProfile/IdentityProfile/InterferenceItem (arc/stateProfile.ts,
 * arc/identityProfile.ts, arc/interferenceItem.ts). Every function here
 * returns a typed result -- never throws for legacy or incomplete data,
 * per spec section 5's own "Return typed validation results. Do not
 * throw unhandled errors for legacy or incomplete data."
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (no screen/LIVE/Goal wiring in this phase).
 */

import type { StateProfile } from "./stateProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import type { IdentityExtensionTrack } from "./types.ts";

/**
 * "new" -- the record is expected to fully satisfy the new-architecture
 * relationship rules (a real, factored StateProfile/InterferenceItem
 * created in or after this phase).
 * "legacy" -- the record predates this phase's library entities (a
 * standalone UrgeArc/ThoughtArc/BeliefArc, read through
 * arc/legacyDerivativeAdapter.ts) and is validated against its own,
 * looser compatibility rule instead -- see
 * describeLegacyInterferenceCompatibility in that module.
 */
export type LibraryValidationSource = "new" | "legacy";

export interface LibraryValidationResult {
  valid: boolean;
  source: LibraryValidationSource;
  /** A short, stable machine-readable reason code, or null when valid. Never a user-facing sentence -- callers/screens in a later phase are responsible for any Hebrew copy. */
  reason: string | null;
}

function ok(source: LibraryValidationSource): LibraryValidationResult {
  return { valid: true, source, reason: null };
}

function fail(source: LibraryValidationSource, reason: string): LibraryValidationResult {
  return { valid: false, source, reason };
}

/**
 * Spec section 5: "InterferenceItem primary State must reference a valid
 * StateProfile when resolving a complete new record." Only meaningful
 * for a NEW (non-legacy-adapted) item -- a legacy-adapted item carries
 * its own `selfContainedState` instead (arc/legacyDerivativeAdapter.ts's
 * own doc) and is never checked against this function; see
 * describeLegacyInterferenceCompatibility for its own, separate rule.
 */
export function validateInterferenceItemPrimaryState(item: InterferenceItem, stateProfiles: StateProfile[]): LibraryValidationResult {
  if (!item.primaryStateProfileId) return fail("new", "missing_primary_state");
  const found = stateProfiles.some((state) => state.id === item.primaryStateProfileId);
  return found ? ok("new") : fail("new", "primary_state_not_found");
}

/**
 * Spec section 5: "A StateProfile may reference zero or one primary
 * IdentityProfile." Zero (primaryIdentityProfileId === null) is always
 * valid -- this only checks that a SET reference actually resolves.
 */
export function validateStatePrimaryIdentity(state: StateProfile, identityProfiles: IdentityProfile[]): LibraryValidationResult {
  if (!state.primaryIdentityProfileId) return ok("new");
  const found = identityProfiles.some((identity) => identity.id === state.primaryIdentityProfileId);
  return found ? ok("new") : fail("new", "primary_identity_not_found");
}

/**
 * Spec section 5: "An InterferenceItem may optionally override the
 * State's Identity." Resolves which Identity actually applies for THIS
 * item -- its own override when set, else the linked StateProfile's own
 * primaryIdentityProfileId, else null ("Self Development allows no
 * Identity" -- a null result is a normal, valid outcome for that track,
 * never an error). Never mutates either input; `state` may be null when
 * the item's own primary State didn't resolve (see
 * validateInterferenceItemPrimaryState) -- the override still applies on
 * its own in that case.
 */
export function resolveEffectiveIdentityForInterferenceItem(item: InterferenceItem, state: StateProfile | null): string | null {
  if (item.identityProfileIdOverride) return item.identityProfileIdOverride;
  return state?.primaryIdentityProfileId ?? null;
}

/** Spec section 5: "Self Development allows no Identity" -- true only for the personal_development track, reusing arc/identityExtension.ts's/arc/types.ts's own IdentityExtensionTrack rather than inventing a second track enum. */
export function isIdentityOptionalForTrack(track: IdentityExtensionTrack): boolean {
  return track === "personal_development";
}

/**
 * Spec section 5: "Future Goal use will require exactly one State and
 * one Identity, but do not wire Goal behavior during Phase 3." Exposed
 * here as a pure predicate only -- nothing in this repository calls it
 * yet; a future phase decides when/where to apply it (e.g. gating ARC
 * Goal LIVE entry).
 */
export function isCompleteForGoalTrack(resolvedStateId: string | null, resolvedIdentityId: string | null): boolean {
  return resolvedStateId !== null && resolvedIdentityId !== null;
}

/**
 * Spec section 5: "Only one InterferenceItem is selected in a future
 * LIVE session." A pure predicate a future LIVE selection screen can use
 * to validate its own selection state -- nothing in this phase has a
 * selection mechanism yet, so nothing calls this either.
 */
export function isValidInterferenceSelection(selectedInterferenceItemIds: string[]): boolean {
  return selectedInterferenceItemIds.length <= 1;
}

/**
 * Spec section 5: "Presence is not an InterferenceItem. Presence remains
 * a rating-driven preparation layer." Structurally enforced already --
 * InterferenceCategory (arc/interferenceItem.ts) has no "presence"
 * member, and arc/legacyDerivativeAdapter.ts's own AdaptedPresenceSource
 * is a deliberately separate, non-InterferenceItem shape. This function
 * exists only so a future selection screen has an explicit, named check
 * to call rather than relying on readers noticing the type-level
 * omission -- always true today, since no category value can ever equal
 * "presence".
 */
export function isEligibleAsInterferenceItem(category: string): boolean {
  return category !== "presence";
}

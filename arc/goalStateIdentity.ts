/**
 * arc/goalStateIdentity.ts
 *
 * Adaptive ARC architecture task, decision 3 ("ARC Goal has explicit
 * required State and Identity relationships"): pure resolution of an
 * ArcGoal's one required base State and one required Identity, honoring
 * the new explicit `stateProfileId`/`identityProfileId` fields
 * (arc/types.ts's own doc on both) when set, and falling back to a
 * legacy-compatibility path for every goal saved before those fields
 * existed -- "Do not mutate or delete legacy records in Phase 2" and "If
 * no valid State or Identity can be resolved, return a safe typed
 * incomplete-legacy result rather than crashing."
 *
 * Never mutates the goal it's given, never writes anything back to
 * storage -- this module is a pure read-time resolver only. Nothing in
 * this repository calls it yet (Phase 2 is pure logic/types only); a
 * later phase wires it into whichever screen/engine needs "this goal's
 * one required State/Identity" resolved.
 */

import type { ArcGoal } from "./types.ts";

/**
 * "explicit" -- resolved from the new stateProfileId/identityProfileId
 * field, once those are actually populated (nothing in this phase
 * populates them yet -- see arc/types.ts's own doc on both fields).
 * "legacy" -- resolved through a pre-existing field/relationship instead
 * (today, only identityProtocolId qualifies -- see resolveGoalRequiredState's
 * own doc on why State has no reliable legacy source).
 * "unresolved" -- neither an explicit nor a legacy reference could be
 * found; never invented, never guessed.
 */
export type GoalStateIdentitySource = "explicit" | "legacy" | "unresolved";

export interface ResolvedGoalReference {
  source: GoalStateIdentitySource;
  /** The resolved id, or null when source is "unresolved". */
  id: string | null;
}

function unresolvedReference(): ResolvedGoalReference {
  return { source: "unresolved", id: null };
}

/**
 * Resolves this goal's one required base State reference.
 *
 * Explicit: goal.stateProfileId, once set (forward-looking only in this
 * phase -- no existing screen writes it yet).
 *
 * Legacy: deliberately "unresolved" for every goal without an explicit
 * stateProfileId. Confirmed by the Phase 1 architecture report: no
 * single existing ArcGoal field reliably represents "this goal's own
 * base State" today -- interferingMappings[].supportiveProtocolId
 * references SUPPORT for a specific interference, not the goal's own
 * base state, and there may be zero, one, or several such mappings.
 * Guessing one would be inventing data this function must never do --
 * a legacy goal's base State genuinely has no resolvable answer until a
 * coach/trainee (or a later, explicit migration UI) sets stateProfileId.
 */
export function resolveGoalRequiredState(goal: ArcGoal): ResolvedGoalReference {
  if (goal.stateProfileId) {
    return { source: "explicit", id: goal.stateProfileId };
  }
  return unresolvedReference();
}

/**
 * Resolves this goal's one required Identity reference.
 *
 * Explicit: goal.identityProfileId, once set (forward-looking only in
 * this phase).
 *
 * Legacy: goal.identityProtocolId -- the pre-existing, already
 * effectively-required field every current ArcGoal screen already reads
 * and writes (Week 1 of the four-week dashboard is gated on it; the
 * classic engine's outer run targets it). This IS a reliable legacy
 * source, unlike State above.
 */
export function resolveGoalRequiredIdentity(goal: ArcGoal): ResolvedGoalReference {
  if (goal.identityProfileId) {
    return { source: "explicit", id: goal.identityProfileId };
  }
  if (goal.identityProtocolId) {
    return { source: "legacy", id: goal.identityProtocolId };
  }
  return unresolvedReference();
}

export interface GoalStateIdentityResolution {
  state: ResolvedGoalReference;
  identity: ResolvedGoalReference;
  /** True only when BOTH the State and Identity references resolved to a real id (explicit or legacy) -- never when either is "unresolved". */
  isComplete: boolean;
}

/**
 * The combined resolution both individual resolvers feed into -- the
 * single entry point a future caller (BUILD guidance UI, LIVE entry
 * gating) should use rather than calling the two resolvers separately.
 */
export function resolveGoalStateIdentity(goal: ArcGoal): GoalStateIdentityResolution {
  const state = resolveGoalRequiredState(goal);
  const identity = resolveGoalRequiredIdentity(goal);
  return { state, identity, isComplete: state.id !== null && identity.id !== null };
}

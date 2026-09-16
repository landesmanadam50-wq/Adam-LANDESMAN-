/**
 * arc/stateInclusion.ts
 *
 * Adaptive ARC architecture task, Phase 14B-1 (action/State-relationship
 * data model): whether a combined Personal Development route includes its
 * one optional ARC State, and which State that is. Route-level, never
 * per-item -- a route may configure several disturbing factors, but ARC
 * State regulation, desired-state encoding, the desired-state rating, and
 * the State action are each rendered at most ONCE per route (never once
 * per factor), so a single StateInclusionPolicy governs the whole
 * PersonalDevelopmentRouteConfig (arc/personalDevelopmentRouteConfig.ts)
 * -- never InterferenceItem itself.
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (no BUILD/LIVE wiring in this phase).
 */

export type StateInclusionPolicy = "linked" | "none" | "decide_in_live";

export type StateInclusionResolution = { kind: "linked"; stateProfileId: string } | { kind: "none" } | { kind: "decide_in_live"; candidateStateProfileId: string };

/**
 * Resolves a route's own StateInclusionPolicy + stateProfileId into what a
 * combined session actually does with it.
 *
 * "decide_in_live" always carries the one configured CANDIDATE State --
 * LIVE only decides WHETHER to use it, never WHICH State to use (an
 * undefined LIVE choice is never allowed). A route configured as
 * "decide_in_live" or "linked" with no resolvable stateProfileId is never
 * complete-for-practice (see validatePersonalDevelopmentRouteConfig); this
 * resolver stays total and defensively returns "none" in that case rather
 * than inventing a candidate.
 */
export function resolveStateInclusion(policy: StateInclusionPolicy, stateProfileId: string | null): StateInclusionResolution {
  if (policy === "linked") return stateProfileId ? { kind: "linked", stateProfileId } : { kind: "none" };
  if (policy === "decide_in_live") return stateProfileId ? { kind: "decide_in_live", candidateStateProfileId: stateProfileId } : { kind: "none" };
  return { kind: "none" };
}

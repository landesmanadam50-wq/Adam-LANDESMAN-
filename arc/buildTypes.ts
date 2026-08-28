/**
 * arc/buildTypes.ts
 *
 * A Desired State can have multiple ArcMaps -- each ArcMap is one
 * challenge pattern (Interfering State -> Challenge Context ->
 * Preventive Action) that can interfere with the same desired
 * direction. BuildGoalProfile is the overarching Goal -> Habit ->
 * Identity -> Desired State record; ArcMap references it by
 * desiredStateId rather than duplicating the desired-state text, so it
 * can't go stale across multiple maps.
 *
 * Today's BUILD wizard only ever produces ONE desired state per
 * profile (ArcBuildProfile.supportiveState) and has no UI yet for
 * creating additional ArcMaps for it -- createGoalModelFromProfile
 * migrates that single legacy state into the first ArcMap. A future
 * BUILD-ARC screen is what would let a trainee add a second, third,
 * etc. ArcMap for the same desired state; this file's job is just to
 * make that possible without breaking anything that exists today.
 */

import type { ArcBuildProfile } from "./types.ts";

export interface BuildGoalProfile {
  /** No equivalent field exists in ArcBuildProfile -- always null for a migrated profile, never invented. */
  goal: string | null;
  habit: string | null;
  identity: string | null;
  desiredStateId: string;
  desiredState: string;
}

export interface ArcMap {
  id: string;
  desiredStateId: string;
  interferingState: string | null;
  challengeContext: string | null;
  preventiveAction: string | null;
}

/**
 * Not cryptographically strong -- doesn't need to be. IDs are generated
 * once per device, stored locally, and never compared across devices
 * or transmitted, so timestamp + random suffix is sufficient to avoid
 * collisions within one install.
 */
export function generateStableId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Migrates the CURRENT ArcBuildProfile's flat state fields
 * (supportiveState/interferingState/preventiveAction) into the new
 * goal-model shape, generating stable IDs via the injected generator.
 * Returns null when there's no desired state to migrate at all (a
 * Habit Only or Identity Only profile with supportiveState still
 * null) -- there's nothing to create yet.
 *
 * Call this at most once per profile: the caller (data/storage.ts's
 * getOrCreateGoalModel) is responsible for checking whether a
 * BuildGoalProfile already exists first, so the generated IDs stay
 * stable across app runs rather than being regenerated every time.
 */
export function createGoalModelFromProfile(
  profile: ArcBuildProfile,
  generateId: (kind: "desiredState" | "arcMap") => string
): { goalProfile: BuildGoalProfile; arcMaps: ArcMap[] } | null {
  if (profile.supportiveState === null) return null;

  const desiredStateId = generateId("desiredState");

  const goalProfile: BuildGoalProfile = {
    goal: null,
    habit: profile.habit,
    identity: profile.desiredIdentity,
    desiredStateId,
    desiredState: profile.supportiveState,
  };

  const primaryArcMap: ArcMap = {
    id: generateId("arcMap"),
    desiredStateId,
    interferingState: profile.interferingState,
    // No legacy equivalent to Challenge Context -- stays null until the
    // trainee adds one through a future BUILD-ARC screen.
    challengeContext: null,
    preventiveAction: profile.preventiveAction,
  };

  return { goalProfile, arcMaps: [primaryArcMap] };
}

/**
 * Which ArcMap LIVE should treat as the active challenge pattern.
 * There's no multi-map selection UI yet, so this just picks the first
 * one -- the natural place to add real selection (e.g. matching the
 * trainee's current context) once BUILD-ARC supports creating more
 * than one ArcMap for the same desired state, without LIVE inventing
 * that logic itself.
 */
export function resolveActiveArcMap(arcMaps: ArcMap[]): ArcMap | null {
  return arcMaps[0] ?? null;
}

/**
 * Overlays the active ArcMap's interferingState/preventiveAction onto
 * profile, falling back to the profile's own flat fields when the
 * ArcMap doesn't have a value for one of them. This is the ONLY thing
 * that lets ArcMap actually reach LIVE -- arc/arcEngine.ts and
 * arc/stageCopy.ts stay untouched, always reading a plain
 * ArcBuildProfile, so nothing about them needs to know ArcMap exists.
 */
export function applyActiveArcMap(profile: ArcBuildProfile, arcMaps: ArcMap[]): ArcBuildProfile {
  const activeArcMap = resolveActiveArcMap(arcMaps);
  if (!activeArcMap) return profile;
  return {
    ...profile,
    interferingState: activeArcMap.interferingState ?? profile.interferingState,
    preventiveAction: activeArcMap.preventiveAction ?? profile.preventiveAction,
  };
}

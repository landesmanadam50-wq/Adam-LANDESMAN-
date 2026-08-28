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
 * profile (ArcBuildProfile.supportiveState); createGoalModelFromProfile
 * migrates that single legacy state into the first ArcMap. The
 * BUILD-ARC screen (build/ArcMapManagerScreen.tsx) is what lets a
 * trainee create/edit/remove further ArcMaps for that same desired
 * state, using createArcMap/upsertArcMap/removeArcMap below.
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
 * The default ArcMap when nothing has been explicitly selected --
 * picks the first one. Used both as the fallback inside
 * resolveSelectedArcMap (a single ArcMap needs no picker) and by
 * applyPreventiveActionRouting below.
 */
export function resolveActiveArcMap(arcMaps: ArcMap[]): ArcMap | null {
  return arcMaps[0] ?? null;
}

/**
 * Which ArcMap LIVE should treat as the trainee's actual choice this
 * session: the one matching selectedArcMapId once they've picked (or
 * been auto-assigned) one, falling back to resolveActiveArcMap only
 * while nothing has been selected yet.
 */
export function resolveSelectedArcMap(arcMaps: ArcMap[], selectedArcMapId: string | null): ArcMap | null {
  if (selectedArcMapId !== null) {
    return arcMaps.find((arcMap) => arcMap.id === selectedArcMapId) ?? null;
  }
  return resolveActiveArcMap(arcMaps);
}

/**
 * Overlays a preventiveAction onto profile ONLY for the purpose of
 * arc/arcEngine.ts's existing afterArcThought() routing check
 * (profile.preventiveAction !== null) -- so LIVE still offers
 * preventive_action_check whenever ANY ArcMap could have one, even
 * though which map (and therefore which specific action) is actually
 * relevant isn't known until the trainee selects/recognizes it inside
 * that stage (see getPreventiveActionSubStage). Deliberately does NOT
 * overlay interferingState: that's resolved fresh from the selected
 * ArcMap inside arc/stageCopy.ts's preventive_action_check case, never
 * from the profile object, so there's nothing to overlay here for it.
 */
export function applyPreventiveActionRouting(profile: ArcBuildProfile, arcMaps: ArcMap[]): ArcBuildProfile {
  if (profile.preventiveAction !== null) return profile;
  const anyPreventiveAction = arcMaps.find((arcMap) => arcMap.preventiveAction !== null)?.preventiveAction ?? null;
  if (anyPreventiveAction === null) return profile;
  return { ...profile, preventiveAction: anyPreventiveAction };
}

export interface ArcMapDraft {
  interferingState: string | null;
  challengeContext: string | null;
  preventiveAction: string | null;
}

export function createArcMap(desiredStateId: string, draft: ArcMapDraft, generateId: () => string): ArcMap {
  return { id: generateId(), desiredStateId, ...draft };
}

export function upsertArcMap(arcMaps: ArcMap[], arcMap: ArcMap): ArcMap[] {
  const index = arcMaps.findIndex((m) => m.id === arcMap.id);
  if (index === -1) return [...arcMaps, arcMap];
  const next = [...arcMaps];
  next[index] = arcMap;
  return next;
}

export function removeArcMap(arcMaps: ArcMap[], arcMapId: string): ArcMap[] {
  return arcMaps.filter((m) => m.id !== arcMapId);
}

/** The label BUILD-ARC's list and LIVE's ArcMap picker both show for one ArcMap -- kept in one place so they can never drift apart. */
export function getArcMapDisplayLabel(arcMap: ArcMap): string {
  return arcMap.challengeContext ?? arcMap.interferingState ?? "דפוס ללא תיאור";
}

/**
 * data/storage.ts
 *
 * Thin AsyncStorage wrapper. There's no accounts/auth system yet, so
 * "per tester" persistence means per-device: each pilot tester runs
 * their own install and gets their own local profile + session log.
 *
 * Depends on the native AsyncStorage module, so unlike the rest of
 * data/ this isn't unit-tested with node --test — it's exercised for
 * real by actually running the app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateArcBuildId } from "../arc/types.ts";
import type {
  ArcBuild,
  ArcBuildProfile,
  ArcGoal,
  ArcGoalTarget,
  ArcProgramProgress,
  BeliefArc,
  PersonalDevelopmentFourWeekProgram,
  PresenceArc,
  ThoughtArc,
  UrgeArc,
} from "../arc/types.ts";
import { deletePersonalDevelopmentProgramFromList, normalizePersonalDevelopmentProgram, upsertPersonalDevelopmentProgramInList } from "../arc/personalDevelopmentProgram.ts";
import { splitProfileIntoArcBuilds } from "../arc/arcEngine.ts";
import { deleteArcBuildFromList, upsertArcBuildInList } from "../arc/arcBuilds.ts";
import { deleteMiniArcFromList, upsertMiniArcInList } from "../arc/miniArc.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import { deleteArcGoalFromList, normalizeArcGoal, upsertArcGoalInList } from "../arc/arcGoals.ts";
import { deleteArcGoalTargetFromList, upsertArcGoalTargetInList } from "../arc/subGoalExecution.ts";
import type { ArcGoalTargetOccurrenceCompletion } from "../arc/subGoalExecution.ts";
import { deleteUrgeArcFromList, normalizeUrgeArc, upsertUrgeArcInList } from "../arc/urgeArcs.ts";
import { deleteThoughtArcFromList, normalizeThoughtArc, upsertThoughtArcInList } from "../arc/thoughtArcs.ts";
import { deleteBeliefArcFromList, normalizeBeliefArc, upsertBeliefArcInList } from "../arc/beliefArcs.ts";
import { deletePresenceArcFromList, normalizePresenceArc, upsertPresenceArcInList } from "../arc/presenceArcs.ts";
import {
  deleteLifeManifestFromList,
  deleteTargetFromList,
  normalizeLifeManifest,
  normalizeTarget,
  upsertLifeManifestInList,
  upsertTargetInList,
} from "../arc/lifeManifest.ts";
import type { LifeManifest, Target } from "../arc/lifeManifest.ts";
import {
  deleteArcLinkFromList,
  deleteRoutineTriggerFromList,
  deleteWeeklyActionFromList,
  upsertArcLinkInList,
  upsertRoutineTriggerInList,
  upsertWeeklyActionInList,
} from "../arc/routineLinks.ts";
import type { ArcLink, RoutineTrigger, WeeklyAction } from "../arc/routineLinks.ts";
import type { ArcProgramSelection } from "../program/programTypes.ts";
import { PROGRAM_DEFINITIONS } from "../program/config.ts";
import type { SessionLogEntry } from "./sessionLog.ts";
import type { LifeManifestJournalEntry } from "./lifeManifestJournal.ts";
import { normalizeStateProfile, upsertStateProfileInList } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import { normalizeIdentityProfile, upsertIdentityProfileInList } from "../arc/identityProfile.ts";
import type { IdentityProfile } from "../arc/identityProfile.ts";
import { normalizeInterferenceItem, upsertInterferenceItemInList } from "../arc/interferenceItem.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import { normalizeCombinedInterferenceSelection, upsertCombinedInterferenceSelectionInList } from "../arc/combinedInterferenceSelection.ts";
import type { CombinedInterferenceSelection } from "../arc/combinedInterferenceSelection.ts";
import { normalizePersonalDevelopmentRouteConfig, upsertPersonalDevelopmentRouteConfigInList } from "../arc/personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import {
  archiveLibraryItem,
  disableLibraryItem,
  restoreLibraryItem,
  resolveEnabledLibraryItemsForProgram,
} from "../arc/libraryItemStatus.ts";
import type { MappingProgressionStore } from "../arc/reactiveProactiveProgression.ts";
import type { PersonalDevelopmentRouteProgress } from "../arc/personalDevelopmentRouteProgress.ts";
import { normalizePersonalDevelopmentRouteProgress } from "../arc/personalDevelopmentRouteProgress.ts";
import type { ArcGoalSessionProgress } from "../arc/arcGoalSessionProgress.ts";
import { normalizeArcGoalSessionProgress } from "../arc/arcGoalSessionProgress.ts";
import type { PendingSharedActionExecution } from "../arc/pendingSharedActionExecution.ts";

const PROFILE_KEY = "archi.buildProfile.v2";
const PROGRAM_SELECTION_KEY = "archi.programSelection.v1";
const PROGRAM_PROGRESS_KEY = "archi.programProgress.v2";
const SESSION_LOG_KEY = "archi.sessionLog.v1";
const PILOT_STARTED_AT_KEY = "archi.pilotStartedAt.v1";
const ARC_BUILDS_KEY = "archi.arcBuilds.v1";
/** Mini ARC task: a brand-new, independent collection -- never read/written by any full-ARC code path, never migrated from or into ARC_BUILDS_KEY/PROFILE_KEY. Deleting/editing/duplicating a Mini ARC can never affect a full ArcBuild, and vice versa. */
const MINI_ARC_BUILDS_KEY = "archi.miniArcBuilds.v1";
/** ARC Goal task: a brand-new, independent collection, storing only REFERENCES to existing ArcBuilds (never their content) -- see arc/types.ts's ArcGoal doc. No legacy migration: there is no prior data format for ARC Goal, so an absent key simply means "no ARC Goals yet". Deleting/editing an ArcGoal never touches ARC_BUILDS_KEY/PROFILE_KEY/MINI_ARC_BUILDS_KEY, and vice versa. */
const ARC_GOALS_KEY = "archi.arcGoals.v1";
/** Urge route task: a brand-new, independent collection storing full UrgeArc records -- never read/written by regular ARC, Mini ARC, or ARC Goal's own key. No legacy migration: there is no prior data format for UrgeArc, so an absent key simply means "no Urge ARCs yet". ArcGoal.urgeMappings only ever stores a UrgeArc's id, never its content -- deleting/editing a UrgeArc never touches ARC_GOALS_KEY, and vice versa. */
const ARC_URGE_ARCS_KEY = "archi.urgeArcs.v1";
/** Life Manifest task: a brand-new, independent top-level collection -- Major Goals and Sub-goals nest inside each LifeManifest record; Targets (below) are a separate flat store. Never read/written by ARC/ArcGoal/MiniArc/UrgeArc/ArcLink/routine code -- REFERENCES those by plain id only (see arc/lifeManifest.ts's own module doc). No legacy migration: there is no prior data format, so an absent key simply means "no Life Manifests yet". */
const LIFE_MANIFESTS_KEY = "archi.lifeManifests.v1";
/** Life Manifest task: a separate flat store for Targets (referenced by subGoalId, never nested inside LifeManifest) -- see arc/lifeManifest.ts's own module doc for why. Not yet created by any screen in this phase of the feature; wired now so its storage/id shape never needs a breaking change later. */
const LIFE_MANIFEST_TARGETS_KEY = "archi.lifeManifestTargets.v1";
/** Sub-goal↔ARC Goal connection task: the Life Manifest journal -- append-only, mirrors SESSION_LOG_KEY's own shape/guarantees exactly (see data/lifeManifestJournal.ts's module doc). Never read/written by any other Life Manifest key, ARC/ArcGoal/MiniArc/UrgeArc/ArcLink/routine code. */
const LIFE_MANIFEST_JOURNAL_KEY = "archi.lifeManifestJournal.v1";
/** Adaptive ARC architecture task, Phase 3 (data-layer foundations): a brand-new, independent collection of reusable StateProfile records (arc/stateProfile.ts) -- never read/written by any existing ARC/ArcGoal/MiniArc/UrgeArc/ThoughtArc/BeliefArc/PresenceArc key. No legacy migration: there is no prior data format for StateProfile, so an absent key simply means "no State Profiles yet". */
const STATE_PROFILES_KEY = "archi.stateProfiles.v1";
/** Adaptive ARC architecture task, Phase 3: a brand-new, independent collection of reusable IdentityProfile records (arc/identityProfile.ts) -- same non-migrated, non-conflicting key convention as STATE_PROFILES_KEY. */
const IDENTITY_PROFILES_KEY = "archi.identityProfiles.v1";
/** Adaptive ARC architecture task, Phase 3: a brand-new, independent collection of InterferenceItem records (arc/interferenceItem.ts) -- storing only REFERENCES to StateProfile/IdentityProfile (never their content), same "reference, never duplicate" convention as ARC_GOALS_KEY. Legacy UrgeArc/ThoughtArc/BeliefArc records are never migrated into this key -- they remain readable at their own existing keys and are only ever projected into this shape at read time (arc/legacyDerivativeAdapter.ts's adaptUrgeArcToInterferenceItem/adaptThoughtArcToInterferenceItem/adaptBeliefArcToInterferenceItem), never written back here. */
const INTERFERENCE_ITEMS_KEY = "archi.interferenceItems.v1";
/** Adaptive ARC architecture task, Phase 12: a brand-new, independent collection of CombinedInterferenceSelection records (arc/combinedInterferenceSelection.ts) -- storing only a REFERENCE to one StateProfile plus REFERENCES to InterferenceItem ids (never their content), same "reference, never duplicate" convention as INTERFERENCE_ITEMS_KEY. No legacy migration: there is no prior data format for this, so an absent key simply means "no combined selections configured yet". Never read/written by any other key above, including STATE_PROFILES_KEY/INTERFERENCE_ITEMS_KEY themselves (both stay completely untouched by this phase). */
const COMBINED_INTERFERENCE_SELECTIONS_KEY = "archi.combinedInterferenceSelections.v1";
/** Adaptive ARC architecture task, Phase 14B-2: a brand-new, independent collection of PersonalDevelopmentRouteConfig records (arc/personalDevelopmentRouteConfig.ts) -- never restructures or migrates COMBINED_INTERFERENCE_SELECTIONS_KEY, which stays completely untouched and remains valid, State-scoped BUILD-authoring data in its own right. No legacy migration: there is no prior data format for this record, so an absent key simply means "no Personal Development route configurations yet". */
const PERSONAL_DEVELOPMENT_ROUTE_CONFIGS_KEY = "archi.personalDevelopmentRouteConfigs.v1";
/** Adaptive ARC architecture task, Phase 8 (progression persistence): a brand-new key storing the whole MappingProgressionStore (arc/reactiveProactiveProgression.ts) as one plain JSON object map, keyed by the mapping-key strings arc/progressionSessionBridge.ts's own resolveProgressionMappingKey produces -- never a flat array like every other key above. No legacy migration: there is no prior data format for per-mapping progression, so an absent key simply means "no progression recorded yet". Never read/written by any other key above. */
const PROGRESSION_MAPPING_STORE_KEY = "archi.progressionMappingStore.v1";
/** Adaptive ARC architecture task, Phase 15: a brand-new key storing the whole PersonalDevelopmentRouteProgressStore (arc/personalDevelopmentRouteProgress.ts) as one plain JSON object map, keyed by PersonalDevelopmentRouteConfig.id -- deliberately separate from PROGRESSION_MAPPING_STORE_KEY (that store is keyed by a single-InterferenceItem/StateProfile mapping key and belongs to the unrelated Stage 1-4 legacy progression system; combined multi-factor sessions never write to it). No legacy migration: an absent key simply means "no combined-route sessions counted yet" -- every existing PersonalDevelopmentRouteConfig loads with zero progress. Never read/written by any other key above. */
const PERSONAL_DEVELOPMENT_ROUTE_PROGRESS_KEY = "archi.personalDevelopmentRouteProgress.v1";
const ARC_GOAL_SESSION_PROGRESS_KEY = "archi.arcGoalSessionProgress.v1";
const PENDING_SHARED_ACTION_EXECUTION_KEY = "archi.pendingSharedActionExecution.v1";

function isKnownProgramPath(programPath: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROGRAM_DEFINITIONS, programPath);
}

/**
 * Startup-safety fix: JSON.parse on stored data must never be allowed to
 * throw uncaught -- this is reachable from app/index.tsx's (Home's) very
 * first useFocusEffect on every cold start via loadArcBuilds' migration
 * path below, with no .catch() at any call site. An unguarded throw here
 * became an unhandled promise rejection on the very first screen the app
 * renders, which is exactly the class of very-early fatal failure Expo
 * Updates' rollback-to-previous-update safety net watches for. A
 * corrupted/unparseable PROFILE_KEY record is treated as "no legacy
 * profile" (never crashes, never invents data) -- the raw bytes are left
 * untouched in storage (never deleted/overwritten by this read), so nothing
 * about the trainee's actual data is destroyed, only this one read safely
 * degrades to null.
 */
export async function loadProfile(): Promise<ArcBuildProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcBuildProfile;
  } catch (error) {
    console.warn("[storage] Stored profile is not valid JSON -- treating as no legacy profile.", error);
    return null;
  }
}

export async function saveProfile(profile: ArcBuildProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * ARC Builds task: the standalone collection BUILD and LIVE now operate
 * on, replacing the old single global profile (PROFILE_KEY, above) as
 * the user-facing source of truth. Stored as one plain array, the same
 * "keyed by its own stable id, read-modify-write the whole list" style
 * already used for ScheduledRoutine (loadScheduledRoutines/
 * saveScheduledRoutines, further down) -- appropriate for the same
 * reason: a trainee's own handful of ARC Builds, not an unbounded log.
 *
 * Migration (#10): the OLD BUILD-GOAL -> BUILD-ARC flow persisted
 * exactly one profile (PROFILE_KEY) that could bundle a state target
 * AND an identity target AND a habit target together -- never a list,
 * never one-target-per-build. The very first time this collection is
 * loaded and found empty, if that legacy profile exists, it is split
 * into one standalone ArcBuild PER target actually configured
 * (arc/arcEngine.ts's splitProfileIntoArcBuilds -- never one bundled
 * build covering several targets), each named from that target's own
 * Desired State/Identity/Habit text, and persisted into the new
 * collection -- so an existing trainee's already-configured ARC
 * protocol(s) are carried forward automatically rather than silently
 * discarded, exactly once (every subsequent load just returns the
 * persisted collection as-is, even if it's still empty because the
 * trainee deleted every migrated build or never had legacy data to
 * begin with -- saveArcBuilds always persists the array, even an empty
 * one, so `raw` is truthy on every later load and this branch is never
 * re-entered). The legacy PROFILE_KEY record itself is left
 * untouched/inert -- never deleted -- so program/'s week-based
 * progression and the Stats screen keep reading exactly what they
 * always did for any pre-existing data, unaffected by this migration.
 */
export async function loadArcBuilds(): Promise<ArcBuild[]> {
  const raw = await AsyncStorage.getItem(ARC_BUILDS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ArcBuild[];
      // Defensive: a stored value that parses but isn't actually an
      // array (e.g. corrupted into an object/null) must not reach
      // callers that immediately call .length/.find/.map on it.
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      // Startup-safety fix: this key already exists (raw is truthy), so
      // re-running migration below would risk creating duplicate builds
      // from the still-present legacy profile -- corruption here must
      // degrade to "no builds visible right now", never to "migrate
      // again". The raw bytes are left in storage untouched; nothing is
      // deleted or overwritten by this read.
      console.warn("[storage] Stored ARC Builds are not valid JSON -- returning an empty list rather than crashing or re-migrating.", error);
      return [];
    }
  }

  // No ARC_BUILDS_KEY at all yet -- migrate once from any legacy profile.
  // Wrapped defensively end to end: any unexpected failure here (a
  // corrupted legacy profile loadProfile() couldn't parse, or the split
  // itself throwing on a truly malformed record) must never crash
  // startup -- it simply resolves to "no builds yet", the same state a
  // trainee with no legacy data already sees, and never writes anything
  // to ARC_BUILDS_KEY, so the migration remains eligible to run again
  // correctly with better data if this call was a transient failure.
  try {
    const legacyProfile = await loadProfile();
    if (!legacyProfile) return [];

    const migrated = splitProfileIntoArcBuilds(legacyProfile, generateArcBuildId, new Date().toISOString());
    await saveArcBuilds(migrated);
    return migrated;
  } catch (error) {
    console.warn("[storage] Legacy-profile migration into ARC Builds failed -- returning an empty list rather than crashing startup.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching loadScheduledRoutines/saveScheduledRoutines' own style. */
export async function saveArcBuilds(builds: ArcBuild[]): Promise<void> {
  await AsyncStorage.setItem(ARC_BUILDS_KEY, JSON.stringify(builds));
}

export async function getArcBuild(id: string): Promise<ArcBuild | null> {
  const builds = await loadArcBuilds();
  return builds.find((build) => build.id === id) ?? null;
}

/** Upserts by id -- see arc/arcBuilds.ts's upsertArcBuildInList (the actual, unit-tested list logic) for the exact guarantee: updates the one matching build in place, never touching any other build's own fields, or appends it as a new build. Never matches by name/Desired State text, only by id -- two builds sharing the same Desired State never collide. */
export async function upsertArcBuild(build: ArcBuild): Promise<void> {
  const builds = await loadArcBuilds();
  await saveArcBuilds(upsertArcBuildInList(builds, build));
}

/** Removes exactly the one matching build (by id) -- see arc/arcBuilds.ts's deleteArcBuildFromList. Every other build is left completely untouched; a no-op if the id doesn't match any build. */
export async function deleteArcBuild(id: string): Promise<void> {
  const builds = await loadArcBuilds();
  await saveArcBuilds(deleteArcBuildFromList(builds, id));
}

/**
 * Mini ARC task: an independent collection, parallel to loadArcBuilds
 * above but with NO legacy migration step -- there is no prior data
 * format for Mini ARC, so an absent/empty key simply means "no Mini ARC
 * Builds yet". Same defensive parse (corrupt JSON, or JSON that parses
 * but isn't actually an array) as loadArcBuilds, for the same reason:
 * malformed data here must degrade to an empty list, never crash
 * startup or any Mini ARC screen.
 */
export async function loadMiniArcBuilds(): Promise<MiniArcBuild[]> {
  const raw = await AsyncStorage.getItem(MINI_ARC_BUILDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MiniArcBuild[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored Mini ARC Builds are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcBuilds' own style. */
export async function saveMiniArcBuilds(builds: MiniArcBuild[]): Promise<void> {
  await AsyncStorage.setItem(MINI_ARC_BUILDS_KEY, JSON.stringify(builds));
}

export async function getMiniArcBuild(id: string): Promise<MiniArcBuild | null> {
  const builds = await loadMiniArcBuilds();
  return builds.find((build) => build.id === id) ?? null;
}

/** Upserts by id -- see arc/miniArc.ts's upsertMiniArcInList. Updates the one matching Mini ARC in place, never touching any other Mini ARC's own fields, or appends it as new. Never touches ARC_BUILDS_KEY/PROFILE_KEY. */
export async function upsertMiniArcBuild(build: MiniArcBuild): Promise<void> {
  const builds = await loadMiniArcBuilds();
  await saveMiniArcBuilds(upsertMiniArcInList(builds, build));
}

/** Removes exactly the one matching Mini ARC (by id) -- see arc/miniArc.ts's deleteMiniArcFromList. Every other Mini ARC (and every full ArcBuild) is left completely untouched; a no-op if the id doesn't match any Mini ARC. */
export async function deleteMiniArcBuild(id: string): Promise<void> {
  const builds = await loadMiniArcBuilds();
  await saveMiniArcBuilds(deleteMiniArcFromList(builds, id));
}

/**
 * ARC Goal task: an independent collection, parallel to loadMiniArcBuilds
 * above -- same "no legacy migration, defensive parse degrades to an
 * empty list rather than crashing" shape.
 *
 * Urge route task: every parsed goal is run through normalizeArcGoal so
 * fields added after a goal was first saved (urgeMappings, and each
 * mapping's miniArcId/executionMode/identityProtocolId/goalAction) always
 * come back with their safe defaults -- callers never need to null-check
 * these themselves.
 */
export async function loadArcGoals(): Promise<ArcGoal[]> {
  const raw = await AsyncStorage.getItem(ARC_GOALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGoal[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcGoal) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Goals are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcBuilds/saveMiniArcBuilds' own style. */
export async function saveArcGoals(goals: ArcGoal[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GOALS_KEY, JSON.stringify(goals));
}

export async function getArcGoal(id: string): Promise<ArcGoal | null> {
  const goals = await loadArcGoals();
  return goals.find((goal) => goal.id === id) ?? null;
}

/** Upserts by id -- see arc/arcGoals.ts's upsertArcGoalInList. Updates the one matching goal in place, never touching any other goal's own fields, or appends it as new. */
export async function upsertArcGoal(goal: ArcGoal): Promise<void> {
  const goals = await loadArcGoals();
  await saveArcGoals(upsertArcGoalInList(goals, goal));
}

/** Removes exactly the one matching ArcGoal (by id) -- see arc/arcGoals.ts's deleteArcGoalFromList. Every other ArcGoal (and every referenced ArcBuild, which this never touches) is left completely untouched; a no-op if the id doesn't match any goal. */
export async function deleteArcGoal(id: string): Promise<void> {
  const goals = await loadArcGoals();
  await saveArcGoals(deleteArcGoalFromList(goals, id));
}

/**
 * Sub-goal execution task: a separate flat store for ArcGoalTarget
 * (referenced by arcGoalId/subGoalId, never nested inside ArcGoal) --
 * same "flat list + foreign key" convention as LIFE_MANIFEST_TARGETS_KEY
 * above, and a completely independent collection from it (a Life
 * Manifest Target and an ArcGoal execution Target are different entities
 * that happen to share a similar shape). A missing/corrupt key always
 * loads as an empty list, never a crash and never invented data.
 */
const ARC_GOAL_TARGETS_KEY = "archi.arcGoalTargets.v1";
/** Sub-goal execution task: append-only, per-occurrence completion record for a RECURRING ArcGoalTarget -- exact mirror of RoutineOccurrenceCompletion's own shape/guarantees (see that interface's own doc): completing today's occurrence of target A never marks yesterday's, tomorrow's, or any other target's occurrence complete. */
const ARC_GOAL_TARGET_OCCURRENCE_COMPLETIONS_KEY = "archi.arcGoalTargetOccurrenceCompletions.v1";
/** Phase 9: Personal Development's own four-week programs -- see arc/personalDevelopmentProgram.ts's own module doc. */
const PERSONAL_DEVELOPMENT_PROGRAMS_KEY = "archi.personalDevelopmentPrograms.v1";

export async function loadArcGoalTargets(): Promise<ArcGoalTarget[]> {
  const raw = await AsyncStorage.getItem(ARC_GOAL_TARGETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGoalTarget[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcGoal Targets are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveLifeManifestTargets/saveArcGoals' own style. */
export async function saveArcGoalTargets(targets: ArcGoalTarget[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GOAL_TARGETS_KEY, JSON.stringify(targets));
}

export async function getArcGoalTarget(id: string): Promise<ArcGoalTarget | null> {
  const targets = await loadArcGoalTargets();
  return targets.find((target) => target.id === id) ?? null;
}

/** Upserts by id -- see arc/subGoalExecution.ts's upsertArcGoalTargetInList. */
export async function upsertArcGoalTarget(target: ArcGoalTarget): Promise<void> {
  const targets = await loadArcGoalTargets();
  await saveArcGoalTargets(upsertArcGoalTargetInList(targets, target));
}

/** Removes exactly the one matching ArcGoalTarget (by id) -- see arc/subGoalExecution.ts's deleteArcGoalTargetFromList. A no-op if the id doesn't match any target. Callers are responsible for also cancelling its scheduled notification first (data/arcGoalTargetReminders.ts's cancelArcGoalTargetNotification) -- this function never does I/O beyond AsyncStorage itself. */
export async function deleteArcGoalTarget(id: string): Promise<void> {
  const targets = await loadArcGoalTargets();
  await saveArcGoalTargets(deleteArcGoalTargetFromList(targets, id));
}

export async function loadArcGoalTargetOccurrenceCompletions(): Promise<ArcGoalTargetOccurrenceCompletion[]> {
  const raw = await AsyncStorage.getItem(ARC_GOAL_TARGET_OCCURRENCE_COMPLETIONS_KEY);
  return raw ? (JSON.parse(raw) as ArcGoalTargetOccurrenceCompletion[]) : [];
}

/** Records one occurrence as done -- never removes or rewrites any earlier entry, so completion history survives app restarts and one target's completion can never affect another's. */
export async function appendArcGoalTargetOccurrenceCompletion(entry: ArcGoalTargetOccurrenceCompletion): Promise<void> {
  const existing = await loadArcGoalTargetOccurrenceCompletions();
  existing.push(entry);
  await AsyncStorage.setItem(ARC_GOAL_TARGET_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(existing));
}

/**
 * Phase 9: Personal Development's own four-week programs -- a brand-new,
 * independent collection, entirely separate from ARC_GOALS_KEY (never
 * read/written by it, and vice versa -- see
 * arc/personalDevelopmentProgram.ts's own module doc on why this is a
 * new top-level entity rather than nested onto ArcGoal or any of the
 * five protocol record types). No legacy migration: there is no prior
 * data format for this, so an absent key simply means "no Personal
 * Development programs yet".
 */
export async function loadPersonalDevelopmentPrograms(): Promise<PersonalDevelopmentFourWeekProgram[]> {
  const raw = await AsyncStorage.getItem(PERSONAL_DEVELOPMENT_PROGRAMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersonalDevelopmentFourWeekProgram[];
    return Array.isArray(parsed) ? parsed.map(normalizePersonalDevelopmentProgram) : [];
  } catch (error) {
    console.warn("[storage] Stored Personal Development programs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcGoals' own style. */
export async function savePersonalDevelopmentPrograms(programs: PersonalDevelopmentFourWeekProgram[]): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_DEVELOPMENT_PROGRAMS_KEY, JSON.stringify(programs));
}

export async function getPersonalDevelopmentProgram(id: string): Promise<PersonalDevelopmentFourWeekProgram | null> {
  const programs = await loadPersonalDevelopmentPrograms();
  return programs.find((program) => program.id === id) ?? null;
}

/** Upserts by id -- see arc/personalDevelopmentProgram.ts's upsertPersonalDevelopmentProgramInList. Updates the one matching program in place, never touching any other program's own fields, or appends it as new. */
export async function upsertPersonalDevelopmentProgram(program: PersonalDevelopmentFourWeekProgram): Promise<void> {
  const programs = await loadPersonalDevelopmentPrograms();
  await savePersonalDevelopmentPrograms(upsertPersonalDevelopmentProgramInList(programs, program));
}

/** Removes exactly the one matching program (by id) -- a no-op if the id doesn't match any program. Never touches the underlying protocol record this program merely referenced. */
export async function deletePersonalDevelopmentProgram(id: string): Promise<void> {
  const programs = await loadPersonalDevelopmentPrograms();
  await savePersonalDevelopmentPrograms(deletePersonalDevelopmentProgramFromList(programs, id));
}

/**
 * Urge route task: a brand-new, independent collection, storing full
 * UrgeArc records (mirrors ARC_BUILDS_KEY, not MINI_ARC_BUILDS_KEY's
 * reference-only ArcGoal collection -- a UrgeArc IS the protocol, not a
 * reference to one). No legacy migration: there is no prior data format
 * for UrgeArc, so an absent key simply means "no Urge ARCs yet". Same
 * defensive parse as loadMiniArcBuilds/loadArcGoals.
 */
export async function loadUrgeArcs(): Promise<UrgeArc[]> {
  const raw = await AsyncStorage.getItem(ARC_URGE_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UrgeArc[];
    return Array.isArray(parsed) ? parsed.map(normalizeUrgeArc) : [];
  } catch (error) {
    console.warn("[storage] Stored Urge ARCs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcGoals/saveMiniArcBuilds' own style. */
export async function saveUrgeArcs(urgeArcs: UrgeArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_URGE_ARCS_KEY, JSON.stringify(urgeArcs));
}

export async function getUrgeArc(id: string): Promise<UrgeArc | null> {
  const urgeArcs = await loadUrgeArcs();
  return urgeArcs.find((urgeArc) => urgeArc.id === id) ?? null;
}

/** Upserts by id -- see arc/urgeArcs.ts's upsertUrgeArcInList. Updates the one matching Urge ARC in place, never touching any other Urge ARC's own fields, or appends it as new. */
export async function upsertUrgeArc(urgeArc: UrgeArc): Promise<void> {
  const urgeArcs = await loadUrgeArcs();
  await saveUrgeArcs(upsertUrgeArcInList(urgeArcs, urgeArc));
}

/** Removes exactly the one matching Urge ARC (by id) -- see arc/urgeArcs.ts's deleteUrgeArcFromList. Every other Urge ARC is left completely untouched; a no-op if the id doesn't match any row. Mappings referencing a deleted UrgeArc are handled safely at read time by the live engine, not here -- this never cascades into ArcGoal.urgeMappings. */
export async function deleteUrgeArc(id: string): Promise<void> {
  const urgeArcs = await loadUrgeArcs();
  await saveUrgeArcs(deleteUrgeArcFromList(urgeArcs, id));
}

/**
 * Phase 4 (ARC Thought and ARC Mini Thought): a brand-new, independent
 * collection storing full ThoughtArc records -- mirrors
 * ARC_URGE_ARCS_KEY exactly (a ThoughtArc IS the protocol, never a
 * reference to one). No legacy migration: there is no prior data
 * format, so an absent key simply means "no ARC Thoughts yet".
 */
const ARC_THOUGHT_ARCS_KEY = "archi.thoughtArcs.v1";

export async function loadThoughtArcs(): Promise<ThoughtArc[]> {
  const raw = await AsyncStorage.getItem(ARC_THOUGHT_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ThoughtArc[];
    return Array.isArray(parsed) ? parsed.map(normalizeThoughtArc) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Thoughts are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveUrgeArcs' own style. */
export async function saveThoughtArcs(thoughtArcs: ThoughtArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_THOUGHT_ARCS_KEY, JSON.stringify(thoughtArcs));
}

export async function getThoughtArc(id: string): Promise<ThoughtArc | null> {
  const thoughtArcs = await loadThoughtArcs();
  return thoughtArcs.find((thoughtArc) => thoughtArc.id === id) ?? null;
}

/** Upserts by id -- see arc/thoughtArcs.ts's upsertThoughtArcInList. Updates the one matching ARC Thought in place, never touching any other's own fields, or appends it as new. */
export async function upsertThoughtArc(thoughtArc: ThoughtArc): Promise<void> {
  const thoughtArcs = await loadThoughtArcs();
  await saveThoughtArcs(upsertThoughtArcInList(thoughtArcs, thoughtArc));
}

/** Removes exactly the one matching ARC Thought (by id) -- see arc/thoughtArcs.ts's deleteThoughtArcFromList. Every other ARC Thought is left completely untouched; a no-op if the id doesn't match any row. */
export async function deleteThoughtArc(id: string): Promise<void> {
  const thoughtArcs = await loadThoughtArcs();
  await saveThoughtArcs(deleteThoughtArcFromList(thoughtArcs, id));
}

/**
 * Phase 6 (ARC Belief and ARC Mini Belief): a brand-new, independent
 * collection storing full BeliefArc records -- mirrors
 * ARC_THOUGHT_ARCS_KEY exactly. No legacy migration: there is no prior
 * data format, so an absent key simply means "no ARC Beliefs yet".
 */
const ARC_BELIEF_ARCS_KEY = "archi.beliefArcs.v1";

export async function loadBeliefArcs(): Promise<BeliefArc[]> {
  const raw = await AsyncStorage.getItem(ARC_BELIEF_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BeliefArc[];
    return Array.isArray(parsed) ? parsed.map(normalizeBeliefArc) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Beliefs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveThoughtArcs' own style. */
export async function saveBeliefArcs(beliefArcs: BeliefArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_BELIEF_ARCS_KEY, JSON.stringify(beliefArcs));
}

export async function getBeliefArc(id: string): Promise<BeliefArc | null> {
  const beliefArcs = await loadBeliefArcs();
  return beliefArcs.find((beliefArc) => beliefArc.id === id) ?? null;
}

/** Upserts by id -- see arc/beliefArcs.ts's upsertBeliefArcInList. */
export async function upsertBeliefArc(beliefArc: BeliefArc): Promise<void> {
  const beliefArcs = await loadBeliefArcs();
  await saveBeliefArcs(upsertBeliefArcInList(beliefArcs, beliefArc));
}

/** Removes exactly the one matching ARC Belief (by id) -- see arc/beliefArcs.ts's deleteBeliefArcFromList. */
export async function deleteBeliefArc(id: string): Promise<void> {
  const beliefArcs = await loadBeliefArcs();
  await saveBeliefArcs(deleteBeliefArcFromList(beliefArcs, id));
}

/**
 * Phase 5 (ARC Presence and ARC Mini Presence): a brand-new, independent
 * collection storing full PresenceArc records -- mirrors
 * ARC_THOUGHT_ARCS_KEY/ARC_URGE_ARCS_KEY exactly. No legacy migration:
 * there is no prior data format, so an absent key simply means "no ARC
 * Presences yet".
 */
const ARC_PRESENCE_ARCS_KEY = "archi.presenceArcs.v1";

export async function loadPresenceArcs(): Promise<PresenceArc[]> {
  const raw = await AsyncStorage.getItem(ARC_PRESENCE_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PresenceArc[];
    return Array.isArray(parsed) ? parsed.map(normalizePresenceArc) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Presences are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveThoughtArcs' own style. */
export async function savePresenceArcs(presenceArcs: PresenceArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_PRESENCE_ARCS_KEY, JSON.stringify(presenceArcs));
}

export async function getPresenceArc(id: string): Promise<PresenceArc | null> {
  const presenceArcs = await loadPresenceArcs();
  return presenceArcs.find((presenceArc) => presenceArc.id === id) ?? null;
}

/** Upserts by id -- see arc/presenceArcs.ts's upsertPresenceArcInList. */
export async function upsertPresenceArc(presenceArc: PresenceArc): Promise<void> {
  const presenceArcs = await loadPresenceArcs();
  await savePresenceArcs(upsertPresenceArcInList(presenceArcs, presenceArc));
}

/** Removes exactly the one matching ARC Presence (by id) -- see arc/presenceArcs.ts's deletePresenceArcFromList. */
export async function deletePresenceArc(id: string): Promise<void> {
  const presenceArcs = await loadPresenceArcs();
  await savePresenceArcs(deletePresenceArcFromList(presenceArcs, id));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 3 (data-layer foundations): CRUD
// for the three new library collections (StateProfile/IdentityProfile/
// InterferenceItem) -- mirrors loadUrgeArcs/loadThoughtArcs/
// loadBeliefArcs' own defensive-parse + normalize pattern exactly.
// "Avoid destructive deletion APIs" (spec section 7): unlike UrgeArc/
// ThoughtArc/etc. above, none of these three get a delete* function --
// only archive (non-destructive) and restore, per spec section 7's own
// explicit instruction.
// ---------------------------------------------------------------------------

export async function loadStateProfiles(): Promise<StateProfile[]> {
  const raw = await AsyncStorage.getItem(STATE_PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StateProfile[];
    return Array.isArray(parsed) ? parsed.map(normalizeStateProfile) : [];
  } catch (error) {
    console.warn("[storage] Stored State Profiles are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveUrgeArcs/saveThoughtArcs' own style. */
export async function saveStateProfiles(profiles: StateProfile[]): Promise<void> {
  await AsyncStorage.setItem(STATE_PROFILES_KEY, JSON.stringify(profiles));
}

export async function getStateProfile(id: string): Promise<StateProfile | null> {
  const profiles = await loadStateProfiles();
  return profiles.find((profile) => profile.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/stateProfile.ts's upsertStateProfileInList. */
export async function upsertStateProfile(profile: StateProfile): Promise<void> {
  const profiles = await loadStateProfiles();
  await saveStateProfiles(upsertStateProfileInList(profiles, profile));
}

/** "Archive/disable without deletion" -- marks the one matching StateProfile disabled (never removes it). A no-op if the id doesn't match any row. */
export async function disableStateProfile(id: string, now: string): Promise<void> {
  const profiles = await loadStateProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveStateProfiles(upsertStateProfileInList(profiles, disableLibraryItem(target, now)));
}

/** Retires the one matching StateProfile (kept for history, never offered live) -- never deletes it. A no-op if the id doesn't match any row. */
export async function archiveStateProfile(id: string, now: string): Promise<void> {
  const profiles = await loadStateProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveStateProfiles(upsertStateProfileInList(profiles, archiveLibraryItem(target, now)));
}

/** "Restore/enable" -- returns the one matching StateProfile to "enabled" regardless of whether it was disabled or archived. A no-op if the id doesn't match any row. */
export async function restoreStateProfile(id: string, now: string): Promise<void> {
  const profiles = await loadStateProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveStateProfiles(upsertStateProfileInList(profiles, restoreLibraryItem(target, now)));
}

/** "Resolve enabled items for a program" -- only the ENABLED StateProfiles owned by `programId`. */
export async function resolveEnabledStateProfilesForProgram(programId: string): Promise<StateProfile[]> {
  const profiles = await loadStateProfiles();
  return resolveEnabledLibraryItemsForProgram(profiles, programId);
}

export async function loadIdentityProfiles(): Promise<IdentityProfile[]> {
  const raw = await AsyncStorage.getItem(IDENTITY_PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as IdentityProfile[];
    return Array.isArray(parsed) ? parsed.map(normalizeIdentityProfile) : [];
  } catch (error) {
    console.warn("[storage] Stored Identity Profiles are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveIdentityProfiles(profiles: IdentityProfile[]): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_PROFILES_KEY, JSON.stringify(profiles));
}

export async function getIdentityProfile(id: string): Promise<IdentityProfile | null> {
  const profiles = await loadIdentityProfiles();
  return profiles.find((profile) => profile.id === id) ?? null;
}

export async function upsertIdentityProfile(profile: IdentityProfile): Promise<void> {
  const profiles = await loadIdentityProfiles();
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, profile));
}

export async function disableIdentityProfile(id: string, now: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, disableLibraryItem(target, now)));
}

export async function archiveIdentityProfile(id: string, now: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, archiveLibraryItem(target, now)));
}

export async function restoreIdentityProfile(id: string, now: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, restoreLibraryItem(target, now)));
}

export async function resolveEnabledIdentityProfilesForProgram(programId: string): Promise<IdentityProfile[]> {
  const profiles = await loadIdentityProfiles();
  return resolveEnabledLibraryItemsForProgram(profiles, programId);
}

export async function loadInterferenceItems(): Promise<InterferenceItem[]> {
  const raw = await AsyncStorage.getItem(INTERFERENCE_ITEMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as InterferenceItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeInterferenceItem) : [];
  } catch (error) {
    console.warn("[storage] Stored Interference Items are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveInterferenceItems(items: InterferenceItem[]): Promise<void> {
  await AsyncStorage.setItem(INTERFERENCE_ITEMS_KEY, JSON.stringify(items));
}

export async function getInterferenceItem(id: string): Promise<InterferenceItem | null> {
  const items = await loadInterferenceItems();
  return items.find((item) => item.id === id) ?? null;
}

export async function upsertInterferenceItem(item: InterferenceItem): Promise<void> {
  const items = await loadInterferenceItems();
  await saveInterferenceItems(upsertInterferenceItemInList(items, item));
}

export async function disableInterferenceItem(id: string, now: string): Promise<void> {
  const items = await loadInterferenceItems();
  const target = items.find((item) => item.id === id);
  if (!target) return;
  await saveInterferenceItems(upsertInterferenceItemInList(items, disableLibraryItem(target, now)));
}

export async function archiveInterferenceItem(id: string, now: string): Promise<void> {
  const items = await loadInterferenceItems();
  const target = items.find((item) => item.id === id);
  if (!target) return;
  await saveInterferenceItems(upsertInterferenceItemInList(items, archiveLibraryItem(target, now)));
}

export async function restoreInterferenceItem(id: string, now: string): Promise<void> {
  const items = await loadInterferenceItems();
  const target = items.find((item) => item.id === id);
  if (!target) return;
  await saveInterferenceItems(upsertInterferenceItemInList(items, restoreLibraryItem(target, now)));
}

export async function resolveEnabledInterferenceItemsForProgram(programId: string): Promise<InterferenceItem[]> {
  const items = await loadInterferenceItems();
  return resolveEnabledLibraryItemsForProgram(items, programId);
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 12: CRUD for CombinedInterferenceSelection
// (arc/combinedInterferenceSelection.ts) -- mirrors loadStateProfiles/
// loadInterferenceItems' own defensive-parse + normalize pattern exactly.
// Same "avoid destructive deletion APIs" rule as StateProfile/InterferenceItem:
// only disable/archive (non-destructive) and restore, never a delete*
// function.
// ---------------------------------------------------------------------------

export async function loadCombinedInterferenceSelections(): Promise<CombinedInterferenceSelection[]> {
  const raw = await AsyncStorage.getItem(COMBINED_INTERFERENCE_SELECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CombinedInterferenceSelection[];
    return Array.isArray(parsed) ? parsed.map(normalizeCombinedInterferenceSelection) : [];
  } catch (error) {
    console.warn("[storage] Stored Combined Interference Selections are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveStateProfiles/saveInterferenceItems' own style. */
export async function saveCombinedInterferenceSelections(selections: CombinedInterferenceSelection[]): Promise<void> {
  await AsyncStorage.setItem(COMBINED_INTERFERENCE_SELECTIONS_KEY, JSON.stringify(selections));
}

export async function getCombinedInterferenceSelection(id: string): Promise<CombinedInterferenceSelection | null> {
  const selections = await loadCombinedInterferenceSelections();
  return selections.find((selection) => selection.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/combinedInterferenceSelection.ts's upsertCombinedInterferenceSelectionInList. For the sanctioned "one per StateProfile" write path, see that module's own applyConfiguredSelectionForState instead -- this function alone does not enforce that invariant. */
export async function upsertCombinedInterferenceSelection(selection: CombinedInterferenceSelection): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, selection));
}

export async function disableCombinedInterferenceSelection(id: string, now: string): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  const target = selections.find((selection) => selection.id === id);
  if (!target) return;
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, disableLibraryItem(target, now)));
}

export async function archiveCombinedInterferenceSelection(id: string, now: string): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  const target = selections.find((selection) => selection.id === id);
  if (!target) return;
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, archiveLibraryItem(target, now)));
}

export async function restoreCombinedInterferenceSelection(id: string, now: string): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  const target = selections.find((selection) => selection.id === id);
  if (!target) return;
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, restoreLibraryItem(target, now)));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 14B-2: CRUD for PersonalDevelopmentRouteConfig
// (arc/personalDevelopmentRouteConfig.ts) -- mirrors loadCombinedInterferenceSelections'
// own defensive-parse + normalize pattern exactly. Same "avoid destructive
// deletion APIs" rule as every other library key: only disable/archive
// (non-destructive) and restore, never a delete* function.
// ---------------------------------------------------------------------------

export async function loadPersonalDevelopmentRouteConfigs(): Promise<PersonalDevelopmentRouteConfig[]> {
  const raw = await AsyncStorage.getItem(PERSONAL_DEVELOPMENT_ROUTE_CONFIGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersonalDevelopmentRouteConfig[];
    return Array.isArray(parsed) ? parsed.map(normalizePersonalDevelopmentRouteConfig) : [];
  } catch (error) {
    console.warn("[storage] Stored Personal Development Route Configs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveCombinedInterferenceSelections' own style. */
export async function savePersonalDevelopmentRouteConfigs(configs: PersonalDevelopmentRouteConfig[]): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_DEVELOPMENT_ROUTE_CONFIGS_KEY, JSON.stringify(configs));
}

export async function getPersonalDevelopmentRouteConfig(id: string): Promise<PersonalDevelopmentRouteConfig | null> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  return configs.find((config) => config.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/personalDevelopmentRouteConfig.ts's upsertPersonalDevelopmentRouteConfigInList. For the idempotent "convert this legacy CombinedInterferenceSelection" write path, see that module's own resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection instead -- this function alone does not enforce that invariant. */
export async function upsertPersonalDevelopmentRouteConfig(config: PersonalDevelopmentRouteConfig): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, config));
}

export async function disablePersonalDevelopmentRouteConfig(id: string, now: string): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return;
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, disableLibraryItem(target, now)));
}

export async function archivePersonalDevelopmentRouteConfig(id: string, now: string): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return;
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, archiveLibraryItem(target, now)));
}

export async function restorePersonalDevelopmentRouteConfig(id: string, now: string): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return;
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, restoreLibraryItem(target, now)));
}

/**
 * Bug-fix task: every parsed manifest is run through normalizeLifeManifest
 * (arc/lifeManifest.ts), mirroring loadArcGoals' own normalizeArcGoal.
 * This WAS true-and-safe to skip when this feature first shipped (every
 * field really was optional/nullable from day one), but Part A/B later
 * added several required fields to MajorGoal/SubGoal (embodiedIdentityCue,
 * achievedStateMantra, connectedArcGoalId, completionMode, etc.) -- a
 * manifest saved before those existed is missing them entirely, and code
 * that reads them unconditionally (e.g. the visualization screen) used
 * to crash on such a record with no error boundary to catch it. Backfill
 * here once so every other reader in this app can keep assuming a fully-
 * populated record.
 */
export async function loadLifeManifests(): Promise<LifeManifest[]> {
  const raw = await AsyncStorage.getItem(LIFE_MANIFESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LifeManifest[];
    return Array.isArray(parsed) ? parsed.map(normalizeLifeManifest) : [];
  } catch (error) {
    console.warn("[storage] Stored Life Manifests are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcGoals/saveUrgeArcs' own style. */
export async function saveLifeManifests(manifests: LifeManifest[]): Promise<void> {
  await AsyncStorage.setItem(LIFE_MANIFESTS_KEY, JSON.stringify(manifests));
}

export async function getLifeManifest(id: string): Promise<LifeManifest | null> {
  const manifests = await loadLifeManifests();
  return manifests.find((manifest) => manifest.id === id) ?? null;
}

/** Upserts by id -- see arc/lifeManifest.ts's upsertLifeManifestInList. Updates the one matching manifest in place (including any nested Major Goal/Sub-goal changes the caller has already applied), never touching any other manifest's own fields, or appends it as new. */
export async function upsertLifeManifest(manifest: LifeManifest): Promise<void> {
  const manifests = await loadLifeManifests();
  await saveLifeManifests(upsertLifeManifestInList(manifests, manifest));
}

/** Removes exactly the one matching Life Manifest (by id) -- see arc/lifeManifest.ts's deleteLifeManifestFromList. Every other Life Manifest is left completely untouched; a no-op if the id doesn't match any manifest. Never cascades into LIFE_MANIFEST_TARGETS_KEY or any referenced ArcBuild/ArcGoal/MiniArcBuild/UrgeArc/ArcLink. */
export async function deleteLifeManifest(id: string): Promise<void> {
  const manifests = await loadLifeManifests();
  await saveLifeManifests(deleteLifeManifestFromList(manifests, id));
}

/**
 * Life Manifest task: Targets live in their own flat store, separate
 * from LIFE_MANIFESTS_KEY -- see arc/lifeManifest.ts's own module doc.
 * Not yet written by any screen in this phase; wired now so later
 * phases (journal entries, Scheduled Actions) attach to a stable id
 * surface from day one.
 */
export async function loadLifeManifestTargets(): Promise<Target[]> {
  const raw = await AsyncStorage.getItem(LIFE_MANIFEST_TARGETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Target[];
    return Array.isArray(parsed) ? parsed.map(normalizeTarget) : [];
  } catch (error) {
    console.warn("[storage] Stored Life Manifest Targets are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching every other saveX above. */
export async function saveLifeManifestTargets(targets: Target[]): Promise<void> {
  await AsyncStorage.setItem(LIFE_MANIFEST_TARGETS_KEY, JSON.stringify(targets));
}

export async function getLifeManifestTarget(id: string): Promise<Target | null> {
  const targets = await loadLifeManifestTargets();
  return targets.find((target) => target.id === id) ?? null;
}

/** Upserts by id -- see arc/lifeManifest.ts's upsertTargetInList. */
export async function upsertLifeManifestTarget(target: Target): Promise<void> {
  const targets = await loadLifeManifestTargets();
  await saveLifeManifestTargets(upsertTargetInList(targets, target));
}

/** Removes exactly the one matching Target (by id) -- see arc/lifeManifest.ts's deleteTargetFromList. A no-op if the id doesn't match any Target. */
export async function deleteLifeManifestTarget(id: string): Promise<void> {
  const targets = await loadLifeManifestTargets();
  await saveLifeManifestTargets(deleteTargetFromList(targets, id));
}

/**
 * Sub-goal↔ARC Goal connection task: the Life Manifest journal --
 * append-only, exact mirror of loadSessionLog/appendSessionLogEntry
 * (data/sessionLog.ts's own CRUD, defined below in this file). No
 * update/delete function exists on purpose -- a journal entry, once
 * appended, is permanent history (see data/lifeManifestJournal.ts's own
 * module doc).
 */
export async function loadLifeManifestJournal(): Promise<LifeManifestJournalEntry[]> {
  const raw = await AsyncStorage.getItem(LIFE_MANIFEST_JOURNAL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LifeManifestJournalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored Life Manifest journal is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function appendLifeManifestJournalEntry(entry: LifeManifestJournalEntry): Promise<void> {
  const existing = await loadLifeManifestJournal();
  existing.push(entry);
  await AsyncStorage.setItem(LIFE_MANIFEST_JOURNAL_KEY, JSON.stringify(existing));
}

/**
 * The real source of truth for what a trainee needs (state/identity/
 * habit, and whether identity was wanted immediately) -- BUILD reads
 * this back instead of inferring from ArcBuildProfile.identityActionNeeded,
 * which is legacy-only. Validated the same way loadProgramProgress()
 * is: an unrecognized programPath returns null instead of a value
 * downstream code would crash on.
 */
export async function loadProgramSelection(): Promise<ArcProgramSelection | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_SELECTION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ArcProgramSelection;
  if (!isKnownProgramPath(parsed.programPath)) {
    console.warn(
      `[storage] Stored program selection has an unknown programPath "${parsed.programPath}" -- discarding it rather than letting downstream code use it.`
    );
    return null;
  }
  return parsed;
}

export async function saveProgramSelection(selection: ArcProgramSelection): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_SELECTION_KEY, JSON.stringify(selection));
}

/**
 * Validates programPath against PROGRAM_DEFINITIONS before returning:
 * every real caller (program/progress.ts, stats/StatsScreen.tsx) calls
 * getProgramDefinition(progress.programPath), which throws on an
 * unrecognized path. Rather than let that throw reach the UI, treat a
 * corrupt/legacy-incompatible programPath as "no progress yet" -- a
 * fresh ArcProgramProgress is created the next time BUILD completes.
 */
export async function loadProgramProgress(): Promise<ArcProgramProgress | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_PROGRESS_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ArcProgramProgress;
  if (!isKnownProgramPath(parsed.programPath)) {
    console.warn(
      `[storage] Stored program progress has an unknown programPath "${parsed.programPath}" -- discarding it rather than crashing downstream.`
    );
    return null;
  }
  return parsed;
}

export async function saveProgramProgress(progress: ArcProgramProgress): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_PROGRESS_KEY, JSON.stringify(progress));
}

export async function loadSessionLog(): Promise<SessionLogEntry[]> {
  const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
  return raw ? (JSON.parse(raw) as SessionLogEntry[]) : [];
}

export async function appendSessionLogEntry(entry: SessionLogEntry): Promise<void> {
  const existing = await loadSessionLog();
  existing.push(entry);
  await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(existing));
}

/**
 * Attaches an optional Gratitude note -- protocol-linked, per the
 * evidence-encoding task (#4): "על מה אתה מוקיר תודה מתוך מה שקרה עכשיו
 * בתרגול?" -- and, when the trainee also supplied one, ONE concrete
 * memory detail from that SAME experience (#5), to the most recently
 * logged session. Called after appendSessionLogEntry() already logged
 * the session itself (so a completed session is never left unlogged
 * just because the trainee is still on the Gratitude screen), once the
 * trainee submits (or explicitly leaves blank) either field. Both are
 * written together in this ONE call, onto this ONE SessionLogEntry --
 * never two separate writes that could end up describing different
 * sessions (#6/#13's same-source guarantee starts here). `memoryDetail`
 * defaults to null so every pre-existing call site (there were none
 * outside this task, but this keeps the signature backward-compatible
 * regardless) keeps working unchanged. A no-op if the log is empty
 * (defensive; shouldn't happen in practice since this is only ever
 * called right after appendSessionLogEntry).
 */
export async function updateLastSessionLogEntryGratitude(
  gratitude: string | null,
  memoryDetail: string | null = null,
  /**
   * Coherent-architecture task (#13 "Evidence of Progress"): the
   * trainee's own optional progress note, saved onto this SAME entry
   * in this SAME call -- see SessionLogEntry.progressEvidence's doc.
   * Defaults to null so both pre-existing callers (there was only one)
   * keep working unchanged.
   */
  progressEvidence: string | null = null,
  /**
   * Post-action reflection/imagery task: the trainee's own "מה אפשר
   * לשפר בפעם הבאה?" answer, saved onto this SAME entry in this SAME
   * call -- see SessionLogEntry.improvementReflection's doc. Defaults
   * to null so every pre-existing caller keeps working unchanged.
   */
  improvementReflection: string | null = null,
  /**
   * Post-action reflection/imagery task: whether this session earned
   * full completion-star credit -- see
   * SessionLogEntry.fullReflectionCreditEarned's doc. Defaults to null
   * (never ran the reflection sequence at all) so every pre-existing
   * caller keeps working unchanged.
   */
  fullReflectionCreditEarned: boolean | null = null
): Promise<void> {
  const existing = await loadSessionLog();
  if (existing.length === 0) return;
  existing[existing.length - 1] = {
    ...existing[existing.length - 1],
    gratitude,
    gratitudeMemoryDetail: memoryDetail,
    progressEvidence,
    improvementReflection,
    fullReflectionCreditEarned,
  };
  await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(existing));
}

/**
 * The trainee's pilot clock starts the first time this is called (normally
 * right after BUILD saves their profile) and never moves after that --
 * editing the profile later doesn't reset it. Idempotent, so it's also
 * safe to call defensively wherever pilot progress is displayed.
 *
 * Independent of program/ (a trainee's own program can be 1-3 weeks
 * depending on what they need): this is the fixed pilot testing window
 * (data/pilotConfig.ts), not their program length.
 */
export async function getOrCreatePilotStartedAt(): Promise<string> {
  const existing = await AsyncStorage.getItem(PILOT_STARTED_AT_KEY);
  if (existing) return existing;
  const now = new Date().toISOString();
  await AsyncStorage.setItem(PILOT_STARTED_AT_KEY, now);
  return now;
}

/**
 * The shared timer-persistence model behind all three of ARCHI's real
 * timed activities -- the Beneficial Action Timer ("act"'s "performing"
 * sub-phase), the Success Focus / Success Coding Timer, and the
 * Negative Action Timer. Each TimerType gets its OWN storage key
 * (timerRunKey below), so the three timers can never read, overwrite,
 * or complete one another -- starting a new Negative Action Timer run
 * cannot touch a Beneficial Action run's record, even if one happened
 * to still exist. This is deliberately its own storage category,
 * separate from both PROFILE_KEY (persistent BUILD data -- e.g. the
 * planned action/duration/base allowance -- never touched by this) and
 * ArcLiveState (session-only, never persisted -- see
 * live/LiveSessionScreen.tsx's module doc): a narrow, explicit
 * exception to "session state is never persisted," whose only purpose
 * is letting a real timer survive navigating away from LIVE, the app
 * backgrounding/locking, or a full close/reopen, per
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt.
 *
 * actionStartedAt is the absolute anchor everything is recomputed
 * from; copyTitle/copyBody are a snapshot of the exact screen text at
 * the moment the timer began, so resuming shows the same action/cue
 * the trainee actually started with rather than re-deriving it from a
 * necessarily incomplete reconstructed session. runId distinguishes
 * this specific timer run from any other (past or future) run of the
 * same timerType -- e.g. so a stale notification from an earlier
 * Negative Action Timer run can never be mistaken for completing a
 * newer one. notificationId is the scheduled local notification this
 * run owns (see data/notifications.ts), cancelled once completion is
 * handled so it can never fire a redundant/delayed completion signal.
 * completedAt is the idempotency guard: null until completion has
 * actually been processed (sound played, notification cancelled) --
 * once set, it is never processed a second time for this run.
 */
/**
 * Adaptive ARC architecture task, Phase 14B-4: three new timer types for
 * the combined Personal Development LIVE route's own action(s) --
 * "combinedStateAction" and "combinedFactorAction" are DISTINCT stable
 * identities so a state_then_factor outcome's two sequential actions
 * never collide in this singleton-per-type storage slot; a
 * shared_explicit/legacy_shared_state_fallback outcome uses its own
 * third, unambiguous "combinedSharedAction" slot rather than overloading
 * either of the other two with a second meaning. Every existing timer
 * type/call site is completely unaffected -- this is a pure addition.
 */
export type TimerType = "beneficialAction" | "successCoding" | "negativeAction" | "routineSuccessFocus" | "combinedStateAction" | "combinedFactorAction" | "combinedSharedAction";

export interface TimerRun {
  timerType: TimerType;
  runId: string;
  actionStartedAt: string;
  durationMinutes: number | null;
  copyTitle: string;
  copyBody: string;
  notificationId: string | null;
  completedAt: string | null;
  /**
   * Only ever set for timerType "routineSuccessFocus" -- which
   * ScheduledRoutine's post-ARC Success Focus timer this specific run
   * belongs to, so resuming it (surviving backgrounding/locking/a full
   * close-reopen, the same as every other TimerRun) can record
   * completion against the correct routine occurrence. Optional (never
   * present on the other three timer types, and absent on any TimerRun
   * persisted before this field existed) rather than `string | null`,
   * so a legacy record simply parses with it `undefined` -- never a
   * literal "undefined" read as a real id.
   */
  relatedRoutineId?: string | null;
  /**
   * Adaptive ARC architecture task, Phase 14B-4: only ever set for the
   * three "combined*Action" timer types above -- the owning combined LIVE
   * session's own sessionId (minted once by arc/combinedLiveSession.ts).
   * Mirrors relatedRoutineId's exact shape/purpose for a different owner:
   * lets a resumed run be validated against the CURRENT in-memory
   * session before being trusted (a mismatch means the run belongs to an
   * earlier, abandoned session -- treated as stale, never silently
   * resumed into unrelated session state). Optional for the same legacy-
   * record-safety reason as relatedRoutineId.
   */
  relatedCombinedSessionId?: string | null;
}

function timerRunKey(timerType: TimerType): string {
  return `archi.timerRun.v1.${timerType}`;
}

export async function loadTimerRun(timerType: TimerType): Promise<TimerRun | null> {
  const raw = await AsyncStorage.getItem(timerRunKey(timerType));
  return raw ? (JSON.parse(raw) as TimerRun) : null;
}

/** Persists (or re-persists, e.g. once a notificationId or completedAt is resolved) this timer's current run -- always keyed by its own timerType, so this can never overwrite a different timer type's record. */
export async function saveTimerRun(run: TimerRun): Promise<void> {
  await AsyncStorage.setItem(timerRunKey(run.timerType), JSON.stringify(run));
}

/** Called once a timer's real activity is actually completed and acknowledged (or a brand-new session explicitly restarts) -- never on a routine LIVE-screen focus, which is exactly the event this record needs to survive. Only ever clears the ONE named timerType's record. */
export async function clearTimerRun(timerType: TimerType): Promise<void> {
  await AsyncStorage.removeItem(timerRunKey(timerType));
}

/**
 * A "come back later" reminder -- a distinct concept from TimerRun
 * above (which times an activity already in progress): this persists
 * the trainee's own intention for a FUTURE moment that hasn't happened
 * yet, scheduled via data/notifications.ts's scheduleReminderNotification.
 * Two independent kinds -- kind "focusSuccess" is the START ping for a
 * future-scheduled Success Focus (see data/reminders.ts's
 * scheduleFutureSuccessFocus, and TimerRun above for the paired
 * "successCoding" run this ping's own moment feeds into) -- can never
 * overwrite or be confused with a separately-scheduled future ARC
 * session reminder (kind "arc", see app/index.tsx), and vice versa. At
 * most one pending reminder per kind -- scheduling a new one for the
 * same kind (data/reminders.ts's scheduleDeferredReminder/
 * scheduleFutureSuccessFocus) always cancels and replaces whatever was
 * pending for that kind first, so a trainee can never end up with two
 * overlapping reminders of the same kind. notificationId is cleared
 * alongside the record once the reminder is resolved (its notification
 * fires and is handled, or the trainee replaces/cancels it) -- never
 * left dangling to fire a redundant signal later.
 */
/**
 * Sub-goal↔ARC Goal connection task: "lifeManifestSubGoal"/"lifeManifestTarget"
 * are used only via scheduleReminderNotification directly (data/notifications.ts),
 * never via PendingReminder below -- PendingReminder is stored one-per-kind,
 * which doesn't fit "many Sub-goals/Targets, each with its own reminder."
 * SubGoal.deadlineNotificationId/Target's own equivalent (arc/lifeManifest.ts)
 * play PendingReminder's role instead, one pair per entity -- see
 * data/lifeManifestReminders.ts.
 */
export type ReminderKind =
  | "focusSuccess"
  | "arc"
  | "routine"
  | "lifeManifestSubGoal"
  | "lifeManifestTarget"
  | "arcGoalTarget"
  | "fourWeekProgramWeek"
  | "personalDevelopmentProgramWeek";

export interface PendingReminder {
  kind: ReminderKind;
  /** ISO timestamp of when this reminder is scheduled to fire. */
  fireAt: string;
  /**
   * Only meaningful for kind "focusSuccess": true = "Focus Success with
   * ARC" was chosen, false = "Focus Success without ARC". Always true
   * for kind "arc" (a future ARC session is, by construction, "with
   * ARC") -- kept on every record rather than a separate optional field
   * so the shape stays uniform across both kinds.
   */
  arcRequested: boolean;
  notificationId: string | null;
  createdAt: string;
}

function pendingReminderKey(kind: ReminderKind): string {
  return `archi.pendingReminder.v1.${kind}`;
}

export async function loadPendingReminder(kind: ReminderKind): Promise<PendingReminder | null> {
  const raw = await AsyncStorage.getItem(pendingReminderKey(kind));
  return raw ? (JSON.parse(raw) as PendingReminder) : null;
}

/** Always keyed by this reminder's own kind, so saving one kind's reminder can never overwrite the other's. */
export async function savePendingReminder(reminder: PendingReminder): Promise<void> {
  await AsyncStorage.setItem(pendingReminderKey(reminder.kind), JSON.stringify(reminder));
}

/** Called once a reminder's notification has actually fired and been handled, or when it's being replaced by a newly-scheduled one of the same kind. Only ever clears the ONE named kind's record. */
export async function clearPendingReminder(kind: ReminderKind): Promise<void> {
  await AsyncStorage.removeItem(pendingReminderKey(kind));
}

/**
 * Multiple Scheduled ARC + Success Focus Routines: a trainee-defined
 * recurring routine (e.g. "08:00 -- Morning Focus"), distinct from
 * PendingReminder above -- that type is deliberately one-per-kind
 * (see its own doc), which cannot represent "any number of independent
 * named routines, each with its own schedule". ScheduledRoutine records
 * are instead stored as a single list (loadScheduledRoutines/
 * saveScheduledRoutines below), each with its own stable `id`, so any
 * number of routines -- including several scheduled for the exact same
 * clock time -- can exist, be edited, and be notified independently,
 * never overwriting one another.
 *
 * hour/minute are the device's LOCAL wall-clock time (never a UTC or
 * elapsed-time value) the routine should begin; recurrenceDays uses
 * JS's own Date.getDay() convention (0 = Sunday .. 6 = Saturday) so the
 * exact same values can be compared directly against a live Date
 * without any extra conversion. nextOccurrenceNotificationId/
 * nextOccurrenceScheduledFor are this routine's OWN currently-scheduled
 * local notification for its next occurrence (see data/routines.ts's
 * rescheduleRoutineNotification/reconcileRoutineNotifications) --
 * always kept in sync with a fresh resolveNextOccurrenceDate result,
 * cancelled and replaced rather than ever left stale or duplicated.
 */
export interface ScheduledRoutine {
  id: string;
  title: string;
  hour: number;
  minute: number;
  /** 0 = Sunday .. 6 = Saturday (Date.getDay() convention). */
  recurrenceDays: number[];
  successFocusDurationMinutes: number;
  notificationsEnabled: boolean;
  enabled: boolean;
  nextOccurrenceNotificationId: string | null;
  /** ISO timestamp this routine's currently-scheduled notification (if any) actually fires at -- lets reconciliation detect a stale schedule without re-deriving it from the notification itself. */
  nextOccurrenceScheduledFor: string | null;
  createdAt: string;
  /**
   * Sub-goal execution task: an optional REFERENCE back to the
   * ArcGoalTarget that links to THIS routine (ArcGoalTarget.
   * linkedScheduledRoutineId is the primary/forward link -- see that
   * field's own doc) -- lets the routines page itself offer "open the
   * linked target," satisfying "be opened from the routine" (spec
   * section 4) without a second, disconnected lookup table. Undefined
   * for every routine saved before this field existed or never linked;
   * always read with `?? null`, since loadScheduledRoutines has no
   * normalize step (see its own doc).
   */
  linkedArcGoalTargetId?: string | null;
}

/**
 * One completed occurrence of one routine, keyed by the LOCAL calendar
 * date (program/dateUtils.ts's todayLocalDateString -- never an hour-only
 * or UTC-based key, so a trainee near midnight always gets the correct
 * day's occurrence marked, not the wrong one). Completing today's
 * occurrence of routine A can never mark routine B -- or a different
 * day's occurrence of routine A -- complete, since both routineId and
 * occurrenceDateLocal must match. This list only ever grows
 * (appendRoutineOccurrenceCompletion below); nothing in this feature
 * removes a past completion.
 */
export interface RoutineOccurrenceCompletion {
  routineId: string;
  occurrenceDateLocal: string;
  completedAt: string;
}

const SCHEDULED_ROUTINES_KEY = "archi.scheduledRoutines.v1";
const ROUTINE_OCCURRENCE_COMPLETIONS_KEY = "archi.routineOccurrenceCompletions.v1";
/**
 * Weekly Routine + ARC Link management task: three brand-new, independent
 * collections (arc/routineLinks.ts) -- never read/written by any normal
 * ARC/Mini ARC code path, ScheduledRoutine, or program/. A missing key
 * (a trainee's existing install, before this feature existed) always
 * loads as an empty list, never a crash and never invented data.
 */
const ROUTINE_TRIGGERS_KEY = "archi.routineTriggers.v1";
const WEEKLY_ACTIONS_KEY = "archi.weeklyActions.v1";
const ARC_LINKS_KEY = "archi.arcLinks.v1";

export async function loadScheduledRoutines(): Promise<ScheduledRoutine[]> {
  const raw = await AsyncStorage.getItem(SCHEDULED_ROUTINES_KEY);
  return raw ? (JSON.parse(raw) as ScheduledRoutine[]) : [];
}

/** Always the FULL list -- callers read-modify-write (load, change one routine, save the whole array back) rather than a per-id upsert, matching loadSessionLog/appendSessionLogEntry's own simple whole-array persistence style for a list this small (a trainee's own handful of routines, not an unbounded log). */
export async function saveScheduledRoutines(routines: ScheduledRoutine[]): Promise<void> {
  await AsyncStorage.setItem(SCHEDULED_ROUTINES_KEY, JSON.stringify(routines));
}

/** Sub-goal execution task: a single-routine lookup, read-modify-write against the same full list above -- reused by live/ArcGoalTargetScreen.tsx to show a linked routine's own title without loading the whole routines screen. */
export async function getScheduledRoutine(id: string): Promise<ScheduledRoutine | null> {
  const routines = await loadScheduledRoutines();
  return routines.find((routine) => routine.id === id) ?? null;
}

export async function loadRoutineOccurrenceCompletions(): Promise<RoutineOccurrenceCompletion[]> {
  const raw = await AsyncStorage.getItem(ROUTINE_OCCURRENCE_COMPLETIONS_KEY);
  return raw ? (JSON.parse(raw) as RoutineOccurrenceCompletion[]) : [];
}

/** Records one occurrence as done -- never removes or rewrites any earlier entry, so completion history survives app restarts and one routine's completion can never affect another's. */
export async function appendRoutineOccurrenceCompletion(entry: RoutineOccurrenceCompletion): Promise<void> {
  const existing = await loadRoutineOccurrenceCompletions();
  existing.push(entry);
  await AsyncStorage.setItem(ROUTINE_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(existing));
}

// ---------------------------------------------------------------------------
// Weekly Routine + ARC Link management task -- three independent
// collections, each the same "load full list / save full list / upsert-
// by-id / delete-by-id" style already used for ArcBuild/MiniArcBuild
// above. Defensive parsing (corrupt JSON, or JSON that parses but isn't
// actually an array) degrades to an empty list, never a crash -- same
// guarantee loadArcBuilds/loadMiniArcBuilds already give.
// ---------------------------------------------------------------------------

export async function loadRoutineTriggers(): Promise<RoutineTrigger[]> {
  const raw = await AsyncStorage.getItem(ROUTINE_TRIGGERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RoutineTrigger[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored routine triggers are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveRoutineTriggers(triggers: RoutineTrigger[]): Promise<void> {
  await AsyncStorage.setItem(ROUTINE_TRIGGERS_KEY, JSON.stringify(triggers));
}

export async function upsertRoutineTrigger(trigger: RoutineTrigger): Promise<void> {
  const triggers = await loadRoutineTriggers();
  await saveRoutineTriggers(upsertRoutineTriggerInList(triggers, trigger));
}

export async function deleteRoutineTrigger(id: string): Promise<void> {
  const triggers = await loadRoutineTriggers();
  await saveRoutineTriggers(deleteRoutineTriggerFromList(triggers, id));
}

export async function loadWeeklyActions(): Promise<WeeklyAction[]> {
  const raw = await AsyncStorage.getItem(WEEKLY_ACTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as WeeklyAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored weekly actions are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveWeeklyActions(actions: WeeklyAction[]): Promise<void> {
  await AsyncStorage.setItem(WEEKLY_ACTIONS_KEY, JSON.stringify(actions));
}

export async function getWeeklyAction(id: string): Promise<WeeklyAction | null> {
  const actions = await loadWeeklyActions();
  return actions.find((action) => action.id === id) ?? null;
}

export async function upsertWeeklyAction(action: WeeklyAction): Promise<void> {
  const actions = await loadWeeklyActions();
  await saveWeeklyActions(upsertWeeklyActionInList(actions, action));
}

export async function deleteWeeklyAction(id: string): Promise<void> {
  const actions = await loadWeeklyActions();
  await saveWeeklyActions(deleteWeeklyActionFromList(actions, id));
}

export async function loadArcLinks(): Promise<ArcLink[]> {
  const raw = await AsyncStorage.getItem(ARC_LINKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Links are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveArcLinks(links: ArcLink[]): Promise<void> {
  await AsyncStorage.setItem(ARC_LINKS_KEY, JSON.stringify(links));
}

export async function getArcLink(id: string): Promise<ArcLink | null> {
  const links = await loadArcLinks();
  return links.find((link) => link.id === id) ?? null;
}

export async function upsertArcLink(link: ArcLink): Promise<void> {
  const links = await loadArcLinks();
  await saveArcLinks(upsertArcLinkInList(links, link));
}

export async function deleteArcLink(id: string): Promise<void> {
  const links = await loadArcLinks();
  await saveArcLinks(deleteArcLinkFromList(links, id));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 8 (progression persistence): the
// whole MappingProgressionStore (arc/reactiveProactiveProgression.ts) is
// stored as ONE plain JSON object map under PROGRESSION_MAPPING_STORE_KEY
// -- unlike every array-shaped collection above, so the defensive parse
// below validates "a plain object, not an array/null/primitive" rather
// than Array.isArray. Mirrors every loadX function's own "never throw,
// fall back to a safe empty default" guarantee exactly.
// ---------------------------------------------------------------------------

export async function loadProgressionMappingStore(): Promise<MappingProgressionStore> {
  const raw = await AsyncStorage.getItem(PROGRESSION_MAPPING_STORE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isPlainObject ? (parsed as MappingProgressionStore) : {};
  } catch (error) {
    console.warn("[storage] Stored progression mapping store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store -- callers read-modify-write, matching every other saveX function's own style. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function saveProgressionMappingStore(store: MappingProgressionStore): Promise<void> {
  await AsyncStorage.setItem(PROGRESSION_MAPPING_STORE_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 15: the combined Personal
// Development route-level progress store -- same "one plain JSON object
// map" shape/defensive-parse convention as PROGRESSION_MAPPING_STORE_KEY
// above, keyed by routeConfigId instead of a single-item mapping key.
// ---------------------------------------------------------------------------

export type PersonalDevelopmentRouteProgressStore = Record<string, PersonalDevelopmentRouteProgress>;

export async function loadPersonalDevelopmentRouteProgressStore(): Promise<PersonalDevelopmentRouteProgressStore> {
  const raw = await AsyncStorage.getItem(PERSONAL_DEVELOPMENT_ROUTE_PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    if (!isPlainObject) return {};
    const store = parsed as PersonalDevelopmentRouteProgressStore;
    // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: every
    // record backfills its new 4-stage-program fields (and every other
    // defensive default normalizePersonalDevelopmentRouteProgress already
    // covers) at read time -- no migration step, mirrors every other
    // normalize-on-load store in this module.
    const normalized: PersonalDevelopmentRouteProgressStore = {};
    for (const [routeConfigId, progress] of Object.entries(store)) {
      normalized[routeConfigId] = normalizePersonalDevelopmentRouteProgress(progress);
    }
    return normalized;
  } catch (error) {
    console.warn("[storage] Stored Personal Development route progress store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function savePersonalDevelopmentRouteProgressStore(store: PersonalDevelopmentRouteProgressStore): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_DEVELOPMENT_ROUTE_PROGRESS_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 3: the
// per-goal ArcGoal LIVE-session progress store -- ArcGoal's own analog of
// PersonalDevelopmentRouteProgressStore above, keyed by ArcGoal.id, a
// wholly separate store from it (see arc/arcGoalSessionProgress.ts's own
// header doc for why).
// ---------------------------------------------------------------------------

export type ArcGoalSessionProgressStore = Record<string, ArcGoalSessionProgress>;

export async function loadArcGoalSessionProgressStore(): Promise<ArcGoalSessionProgressStore> {
  const raw = await AsyncStorage.getItem(ARC_GOAL_SESSION_PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    if (!isPlainObject) return {};
    const store = parsed as ArcGoalSessionProgressStore;
    const normalized: ArcGoalSessionProgressStore = {};
    for (const [arcGoalId, progress] of Object.entries(store)) {
      normalized[arcGoalId] = normalizeArcGoalSessionProgress(progress);
    }
    return normalized;
  } catch (error) {
    console.warn("[storage] Stored ArcGoal session progress store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function saveArcGoalSessionProgressStore(store: ArcGoalSessionProgressStore): Promise<void> {
  await AsyncStorage.setItem(ARC_GOAL_SESSION_PROGRESS_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 4: the
// persistent PendingSharedActionExecution store -- keyed by
// arc/pendingSharedActionExecution.ts's own resolvePendingSharedActionExecutionKey
// (track:ownerId), shared by both tracks. This is what makes a session's
// explicit action-role confirmations survive an app restart.
// ---------------------------------------------------------------------------

export type PendingSharedActionExecutionStore = Record<string, PendingSharedActionExecution>;

export async function loadPendingSharedActionExecutionStore(): Promise<PendingSharedActionExecutionStore> {
  const raw = await AsyncStorage.getItem(PENDING_SHARED_ACTION_EXECUTION_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isPlainObject ? (parsed as PendingSharedActionExecutionStore) : {};
  } catch (error) {
    console.warn("[storage] Stored PendingSharedActionExecution store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function savePendingSharedActionExecutionStore(store: PendingSharedActionExecutionStore): Promise<void> {
  await AsyncStorage.setItem(PENDING_SHARED_ACTION_EXECUTION_KEY, JSON.stringify(store));
}

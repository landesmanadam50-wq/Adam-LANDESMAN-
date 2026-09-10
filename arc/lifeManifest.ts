/**
 * arc/lifeManifest.ts
 *
 * Life Manifest task: a NEW, independent top-level feature connecting a
 * trainee's larger life vision down to daily scheduled actions -- see the
 * hierarchy Life Manifest -> Major Goal -> Sub-goal -> Target ->
 * Scheduled Action -> ARC Link -> Routine Execution. Deliberately
 * separate from ARC Goal/regular ARC/Mini ARC/ARC Link/routines: this
 * module never wraps, extends, or replaces any of them -- it only
 * REFERENCES existing entities by plain id string (ArcBuild.id,
 * ArcGoal.id, MiniArcBuild.id, UrgeArc.id, ArcLink.id), resolved by the
 * caller via data/storage.ts's own getX(id) functions, exactly mirroring
 * how ArcGoal.identityProtocolId/ArcGoalInterferingMapping
 * .supportiveProtocolId already reference ArcBuild (arc/arcGoals.ts).
 *
 * Storage shape (Phase 1 of the feature, see the approved implementation
 * plan): MajorGoal and SubGoal nest inside LifeManifest as strongly-typed
 * arrays -- low-churn, always edited together in the questionnaire,
 * mirroring how ArcGoalInterferingMapping[] nests inside ArcGoal today.
 * Target is a separate flat store (own AsyncStorage key, own id), because
 * later phases attach high-churn, append-only, cross-referenced data to
 * it (journal entries, occurrence completions) that must never be
 * rewritten when a parent Sub-goal/Major Goal is edited.
 *
 * This module holds ONLY pure logic (types, id generators, empty-record
 * builders, list/nested-array upsert-or-append-delete helpers, and the
 * draft-completeness predicate) -- no AsyncStorage I/O, exactly mirroring
 * arc/arcGoals.ts's own module doc and guarantees: editing one
 * LifeManifest/MajorGoal/SubGoal never touches another's own object.
 */

export type LifeManifestEntityStatus = "draft" | "active" | "completed" | "paused" | "archived";

/**
 * A specific, measurable milestone inside a Sub-goal. Phase 1 defines
 * the full shape now (so it never needs a breaking change later) but its
 * cross-reference fields (connectedIdentityProtocolId/connectedArcGoalId/
 * connectedSupportiveProtocolIds/connectedArcLinkIds) and its own
 * Scheduled Actions/journal are wired up starting Phase 3 -- see the
 * approved plan. Never store a Scheduled Action or an ARC Link as
 * unstructured text on a Target; both get their own typed, id-referenced
 * entities in later phases.
 */
export interface Target {
  id: string;
  subGoalId: string;
  title: string;
  description: string | null;
  successMeasurement: string | null;
  quantity: number | null;
  unit: string | null;
  targetDate: string | null;
  currentProgress: number;
  status: LifeManifestEntityStatus;
  /** REFERENCE to an ArcBuild targeting "identity" (an "identity protocol") -- never a copy of its content. Same reference-by-id convention as ArcGoal.identityProtocolId. */
  connectedIdentityProtocolId: string | null;
  /** REFERENCE to an ArcGoal.id. */
  connectedArcGoalId: string | null;
  /** REFERENCEs to ArcBuild(s) targeting "state" (supportive-state protocols). A single protocol may support several Targets -- never duplicated here, only referenced. */
  connectedSupportiveProtocolIds: string[];
  /** REFERENCEs to ArcLink.id -- an existing ArcLink, never a duplicate ArcLink record. */
  connectedArcLinkIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A meaningful stage required to reach the Major Goal. Visualization
 * fields (embodied-identity-cue override, Achieved-State Mantra) are
 * added in Phase 2 -- kept out of Phase 1's shape entirely rather than
 * pre-declared-but-unused, since a Sub-goal's own visualization choice
 * ("use the Major Goal's shared cue, or configure separately") needs the
 * Major Goal's own Phase-2 fields to exist first.
 */
export interface SubGoal {
  id: string;
  title: string;
  description: string | null;
  status: LifeManifestEntityStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The larger result or life direction -- captures the Life Manifest
 * questionnaire's 9 free-text questions (spec section 2; the 10th
 * question, "which sub-goals will lead to it," is answered structurally
 * via `subGoals` below, never as a free-text field). All 9 are optional/
 * nullable so progress can be saved after every section without
 * requiring the whole questionnaire in one sitting -- see
 * isMajorGoalQuestionnaireComplete.
 */
export interface MajorGoal {
  id: string;
  /** "מהי המטרה הגדולה שהיית רוצה להגשים?" -- the only required field (mirrors ArcGoal.name); every other question is optional. */
  title: string;
  /** "למה המטרה הזאת חשובה לך?" */
  why: string | null;
  /** "איזה ערך היא מבטאת?" */
  value: string | null;
  /** "מי תהיה כשתגשים אותה?" */
  futureIdentity: string | null;
  /** "איך החיים שלך ייראו כשהמטרה תושג?" */
  futureLifeDescription: string | null;
  /** "אילו יכולות או איכויות יהיה עליך לפתח?" */
  capabilitiesNeeded: string | null;
  /** "מה עלול להפריע בדרך?" */
  obstacles: string | null;
  /** "אילו מצבים פנימיים יתמכו בך?" */
  supportiveInternalStates: string | null;
  /** "מה יהיה הסימן הממשי לכך שהמטרה הושגה?" */
  realWorldSign: string | null;
  status: LifeManifestEntityStatus;
  /** Array order IS sub-goal order (no separate order field to keep in sync) -- see reorderSubGoals. Multiple sub-goals allowed, editable/deletable/reorderable per spec section 2. */
  subGoals: SubGoal[];
  createdAt: string;
  updatedAt: string;
}

/** The top-level container. A trainee may have more than one (list-shaped, matching every other entity in this app), though the UI nudges toward "your Life Manifest" as a singleton in practice. Its own fields are just the timestamps and its Major Goals -- there is no separate "Life Manifest title" question in the spec. */
export interface LifeManifest {
  id: string;
  majorGoals: MajorGoal[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Id generators -- same stable timestamp+random pattern as
// generateArcGoalId/generateArcBuildId (arc/types.ts).
// ---------------------------------------------------------------------------

export function generateLifeManifestId(): string {
  return `lifemanifest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateMajorGoalId(): string {
  return `majorgoal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateSubGoalId(): string {
  return `subgoal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateTargetId(): string {
  return `target-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Empty-record builders
// ---------------------------------------------------------------------------

export function createEmptySubGoal(id: string, title: string, now: string): SubGoal {
  return { id, title, description: null, status: "draft", createdAt: now, updatedAt: now };
}

/** A fresh Major Goal with only its title set (the one required question) -- every other question null, no sub-goals yet, exactly like a trainee who just started the questionnaire. */
export function createEmptyMajorGoal(id: string, title: string, now: string): MajorGoal {
  return {
    id,
    title,
    why: null,
    value: null,
    futureIdentity: null,
    futureLifeDescription: null,
    capabilitiesNeeded: null,
    obstacles: null,
    supportiveInternalStates: null,
    realWorldSign: null,
    status: "draft",
    subGoals: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyLifeManifest(id: string, now: string): LifeManifest {
  return { id, majorGoals: [], createdAt: now, updatedAt: now };
}

export function createEmptyTarget(id: string, subGoalId: string, title: string, now: string): Target {
  return {
    id,
    subGoalId,
    title,
    description: null,
    successMeasurement: null,
    quantity: null,
    unit: null,
    targetDate: null,
    currentProgress: 0,
    status: "draft",
    connectedIdentityProtocolId: null,
    connectedArcGoalId: null,
    connectedSupportiveProtocolIds: [],
    connectedArcLinkIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Top-level list helpers (LifeManifest[]) -- mirrors
// arc/arcGoals.ts's upsertArcGoalInList/deleteArcGoalFromList exactly.
// ---------------------------------------------------------------------------

/** Updates the one manifest matching `manifest.id` in place if found, otherwise appends it as new. Never reorders the rest of the list, never matches by anything other than id. */
export function upsertLifeManifestInList(manifests: LifeManifest[], manifest: LifeManifest): LifeManifest[] {
  const index = manifests.findIndex((existing) => existing.id === manifest.id);
  if (index === -1) return [...manifests, manifest];
  return manifests.map((existing, i) => (i === index ? manifest : existing));
}

/** Removes exactly the one manifest matching `id` -- every other manifest is returned as the exact same object it already was. A no-op if the id doesn't match any manifest. */
export function deleteLifeManifestFromList(manifests: LifeManifest[], id: string): LifeManifest[] {
  return manifests.filter((manifest) => manifest.id !== id);
}

/**
 * A deep, independent copy of `manifest` under a new id, with a fresh id
 * for every nested Major Goal and Sub-goal too (never reusing an
 * original nested id) -- editing the copy's questionnaire or sub-goal
 * list can never accidentally affect the original's, mirroring
 * arc/arcGoals.ts's duplicateArcGoal treatment of its own nested
 * mapping rows. Does not persist anything itself.
 */
export function duplicateLifeManifest(manifest: LifeManifest, newId: string, now: string): LifeManifest {
  return {
    ...manifest,
    id: newId,
    majorGoals: manifest.majorGoals.map((goal) => ({
      ...goal,
      id: generateMajorGoalId(),
      subGoals: goal.subGoals.map((subGoal) => ({ ...subGoal, id: generateSubGoalId() })),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Nested-array helpers, scoped to ONE manifest/major goal -- callers
// (data/storage.ts, or a screen operating on already-loaded state) are
// responsible for persisting the returned object; these never touch
// AsyncStorage.
// ---------------------------------------------------------------------------

/** Updates the one Major Goal matching `majorGoal.id` in place if found on this manifest, otherwise appends it as new. Every other Major Goal on this manifest is untouched. */
export function upsertMajorGoalInLifeManifest(manifest: LifeManifest, majorGoal: MajorGoal): LifeManifest {
  const index = manifest.majorGoals.findIndex((existing) => existing.id === majorGoal.id);
  const majorGoals = index === -1 ? [...manifest.majorGoals, majorGoal] : manifest.majorGoals.map((existing, i) => (i === index ? majorGoal : existing));
  return { ...manifest, majorGoals };
}

/** Removes exactly the one Major Goal matching `majorGoalId` from this manifest. A no-op if the id doesn't match any Major Goal on it. */
export function deleteMajorGoalFromLifeManifest(manifest: LifeManifest, majorGoalId: string): LifeManifest {
  return { ...manifest, majorGoals: manifest.majorGoals.filter((goal) => goal.id !== majorGoalId) };
}

/** Updates the one Sub-goal matching `subGoal.id` in place if found on this Major Goal, otherwise appends it as new (at the end -- new sub-goals are added last, matching the array-order-is-display-order convention). */
export function upsertSubGoalInMajorGoal(majorGoal: MajorGoal, subGoal: SubGoal): MajorGoal {
  const index = majorGoal.subGoals.findIndex((existing) => existing.id === subGoal.id);
  const subGoals = index === -1 ? [...majorGoal.subGoals, subGoal] : majorGoal.subGoals.map((existing, i) => (i === index ? subGoal : existing));
  return { ...majorGoal, subGoals };
}

/** Removes exactly the one Sub-goal matching `subGoalId`. A no-op if the id doesn't match any Sub-goal on this Major Goal. */
export function deleteSubGoalFromMajorGoal(majorGoal: MajorGoal, subGoalId: string): MajorGoal {
  return { ...majorGoal, subGoals: majorGoal.subGoals.filter((subGoal) => subGoal.id !== subGoalId) };
}

/**
 * Moves the Sub-goal matching `subGoalId` one position up or down in the
 * array (swap with its neighbor) -- a no-op at either end of the list
 * (moving "up" from index 0, or "down" from the last index, changes
 * nothing). Since array position IS sub-goal order, this is the entire
 * reordering mechanism -- spec section 2's "allow the user to ... reorder
 * sub-goals."
 */
export function reorderSubGoals(majorGoal: MajorGoal, subGoalId: string, direction: "up" | "down"): MajorGoal {
  const index = majorGoal.subGoals.findIndex((subGoal) => subGoal.id === subGoalId);
  if (index === -1) return majorGoal;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= majorGoal.subGoals.length) return majorGoal;
  const subGoals = [...majorGoal.subGoals];
  [subGoals[index], subGoals[targetIndex]] = [subGoals[targetIndex], subGoals[index]];
  return { ...majorGoal, subGoals };
}

// ---------------------------------------------------------------------------
// Draft/completeness (spec section 2: "show unfinished Life Manifests as
// drafts that the user can continue later" -- no stored boolean, a pure
// derived predicate instead, mirroring build/UrgeArcEditorScreen.tsx's
// own isXDraftComplete convention).
// ---------------------------------------------------------------------------

/** All 9 free-text questions answered (non-empty after trim) AND at least one sub-goal exists. The title alone being set is NOT enough -- a Major Goal with only a title is still a draft. */
export function isMajorGoalQuestionnaireComplete(goal: MajorGoal): boolean {
  const requiredText = [
    goal.title,
    goal.why,
    goal.value,
    goal.futureIdentity,
    goal.futureLifeDescription,
    goal.capabilitiesNeeded,
    goal.obstacles,
    goal.supportiveInternalStates,
    goal.realWorldSign,
  ];
  return requiredText.every((value) => (value ?? "").trim().length > 0) && goal.subGoals.length > 0;
}

/** True when the manifest has zero Major Goals, or every Major Goal on it is still an incomplete draft -- used by the list screen to show a "טיוטה" badge. A manifest with even one complete Major Goal is no longer shown as a draft. */
export function isLifeManifestDraft(manifest: LifeManifest): boolean {
  return manifest.majorGoals.length === 0 || manifest.majorGoals.every((goal) => !isMajorGoalQuestionnaireComplete(goal));
}

// ---------------------------------------------------------------------------
// Target flat-list helpers -- same shape as upsertArcGoalInList/
// deleteArcGoalFromList above, for the separate flat Target store
// (data/storage.ts's LIFE_MANIFEST_TARGETS_KEY). No UI creates a Target
// yet in Phase 1 (see arc/lifeManifest.ts's own module doc) -- wired now
// so the type/id-gen/storage surface never needs a breaking change later.
// ---------------------------------------------------------------------------

export function upsertTargetInList(targets: Target[], target: Target): Target[] {
  const index = targets.findIndex((existing) => existing.id === target.id);
  if (index === -1) return [...targets, target];
  return targets.map((existing, i) => (i === index ? target : existing));
}

export function deleteTargetFromList(targets: Target[], id: string): Target[] {
  return targets.filter((target) => target.id !== id);
}

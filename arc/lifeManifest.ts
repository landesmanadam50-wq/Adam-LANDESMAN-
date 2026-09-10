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

import { addCalendarDays, daysBetweenCalendarDates, parseCalendarDate } from "../program/dateUtils.ts";

export type LifeManifestEntityStatus = "draft" | "active" | "completed" | "paused" | "archived";

/**
 * Sub-goal↔ARC Goal connection task: Sub-goal's own status vocabulary --
 * a strict superset of LifeManifestEntityStatus (adds "pending", the
 * "not yet the active Sub-goal" state used by sequential progression --
 * see resolveActiveSubGoal/activateSubGoal below). Every value ever
 * stored under the old LifeManifestEntityStatus type remains valid here
 * -- no migration needed. Kept as its own type (not a union extension of
 * LifeManifestEntityStatus, which TypeScript can't express cleanly)
 * because the Hebrew DISPLAY labels for Sub-goal are grammatically
 * feminine ("תת-מטרה"), distinct from Major Goal's masculine labels --
 * the STORED keys below are plain English and shared where the meaning
 * is the same; only "pending" is new.
 */
export type SubGoalStatus = "draft" | "pending" | "active" | "completed" | "paused" | "archived";

/**
 * Sub-goal↔ARC Goal connection task: Target's own status vocabulary --
 * a strict superset of LifeManifestEntityStatus (adds "overdue", set
 * when a Target's targetDate has passed without completion -- never set
 * automatically by a notification, only by explicit user action or the
 * reminder reconciler's own read-time check; see the approved plan's
 * "a deadline notification must not automatically mark completion"
 * requirement). Target never had any real stored records before this
 * task (confirmed: no UI created one), so there is no migration concern
 * at all for this retype.
 */
export type TargetStatus = "draft" | "active" | "completed" | "overdue" | "paused" | "archived";

/** How a Sub-goal decides it's been completed -- spec section 9: never automatic without this being configured and (for the two automatic modes) explicitly confirmed by the trainee. "manual" is the default -- see createEmptySubGoal. */
export type SubGoalCompletionMode = "manual" | "all_targets" | "progress_threshold";

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
  /** Sub-goal↔ARC Goal connection task: optional start date (ISO date string), section 4. */
  startDate: string | null;
  targetDate: string | null;
  currentProgress: number;
  status: TargetStatus;
  /** Sub-goal↔ARC Goal connection task: set the moment status transitions into "completed" -- "save the exact completion date and time" (section 6). Never cleared/overwritten afterward by anything other than an explicit un-complete action (not offered by this task). */
  completedAt: string | null;
  /** REFERENCE to an ArcBuild targeting "identity" (an "identity protocol") -- never a copy of its content. Same reference-by-id convention as ArcGoal.identityProtocolId. */
  connectedIdentityProtocolId: string | null;
  /** REFERENCE to an ArcGoal.id. Its effective value for display/navigation is resolved via resolveEffectiveTargetArcGoalId -- read this raw field only when arcGoalLinkMode is "own". */
  connectedArcGoalId: string | null;
  /**
   * Sub-goal↔ARC Goal connection task (section 4): "inherited" (default)
   * means this Target has no ARC Goal of its own -- it follows whatever
   * the owning Sub-goal is connected to, resolved live (never copied) via
   * resolveEffectiveTargetArcGoalId. "own" means connectedArcGoalId above
   * is this Target's own explicit choice, independent of the Sub-goal's.
   * Switching a Sub-goal's own connectedArcGoalId never silently changes
   * a Target already set to "own".
   */
  arcGoalLinkMode: "inherited" | "own";
  /** REFERENCEs to ArcBuild(s) targeting "state" (supportive-state protocols). A single protocol may support several Targets -- never duplicated here, only referenced. */
  connectedSupportiveProtocolIds: string[];
  /** REFERENCEs to ArcLink.id -- an existing ArcLink, never a duplicate ArcLink record. */
  connectedArcLinkIds: string[];
  /** Reminder task: opt-in -- "allow OPTIONAL reminders." false by default; reconcileTargetDeadlineNotification (data/lifeManifestReminders.ts) never schedules anything while this is false, and clears any already-scheduled one the moment it's turned off. */
  remindersEnabled: boolean;
  /** Reminder task: same cancel-then-reschedule pair as SubGoal's own fields below, for this Target's own targetDate. */
  deadlineNotificationId: string | null;
  deadlineNotificationScheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Visualization task (spec section 2, "Successful body language"): the
 * embodied identity cue connected to an (already-)achieved goal --
 * posture/facial expression/movement quality/breathing style, plus two
 * optional anchors. Every field optional/editable -- "all fields must be
 * optional and editable." Never confused with arc/bodyImagery.ts's own
 * BodyImagery (a different, regulation-cue-to-imagery-text resolver used
 * by regular ARC/ARC Link's Encoding stage) -- this is Life Manifest's
 * own, separate concept.
 */
export interface EmbodiedIdentityCue {
  posture: string | null;
  facialExpression: string | null;
  movementQuality: string | null;
  breathingStyle: string | null;
  physicalAnchor: string | null;
  regulationAnchor: string | null;
}

export function createEmptyEmbodiedIdentityCue(): EmbodiedIdentityCue {
  return { posture: null, facialExpression: null, movementQuality: null, breathingStyle: null, physicalAnchor: null, regulationAnchor: null };
}

/**
 * Visualization task (spec section 4): "the desired goal is experienced
 * in imagery as an already achieved reality" -- structurally distinct
 * from every other mantra in this app (Identity Mantra, Success Mantra,
 * Future-Oriented Mantra, and the four mantras in arc/mantras.ts) --
 * never merged into or confused with any of them. `enabled` lets the
 * trainee disable/skip it without losing the typed text -- "disable or
 * skip it."
 */
export type AchievedStateMantraTense = "present" | "past";
export interface AchievedStateMantra {
  text: string | null;
  tense: AchievedStateMantraTense;
  enabled: boolean;
}

export function createEmptyAchievedStateMantra(): AchievedStateMantra {
  return { text: null, tense: "present", enabled: false };
}

/**
 * A meaningful stage required to reach the Major Goal. Visualization
 * fields (embodied-identity-cue override, Achieved-State Mantra) --
 * spec section 8: "each Sub-goal may optionally... use the Major Goal's
 * embodied identity cue, or configure separate body language, anchors
 * and mantra." useSharedEmbodiedCue/useSharedAchievedStateMantra default
 * true (inherit); the own* fields are only ever read when their own
 * flag is false, and switching the shared flag never touches them --
 * "handle references safely... never silently overwrite a separately
 * configured Sub-goal."
 */
export interface SubGoal {
  id: string;
  title: string;
  description: string | null;
  status: SubGoalStatus;
  /** REFERENCE to an ArcGoal.id -- resolved via data/storage.ts's getArcGoal, never copied. Every Target under this Sub-goal with arcGoalLinkMode "inherited" resolves to this same id (resolveEffectiveTargetArcGoalId). */
  connectedArcGoalId: string | null;
  /** Sub-goal↔ARC Goal connection task, section 3: optional start date/deadline (ISO date strings). */
  startDate: string | null;
  deadline: string | null;
  /** Set the moment status transitions into "completed" -- "save its completion date and history" (section 2). Never overwritten afterward. */
  completedAt: string | null;
  /** How this Sub-goal is allowed to complete -- section 9. Default "manual"; the other two modes still require explicit confirmation (see allRequiredTargetsComplete/computeSubGoalProgress and the confirmation-prompt UI), never silent auto-completion. */
  completionMode: SubGoalCompletionMode;
  /** Reminder task: opt-in -- "allow OPTIONAL reminders for: upcoming deadline; deadline day; overdue." false by default. */
  remindersEnabled: boolean;
  /** Reminder task: the currently-scheduled deadline notification's id + the ISO instant it was scheduled for, mirroring ScheduledRoutine.nextOccurrenceNotificationId/nextOccurrenceScheduledFor -- reconciled (cancel-then-reschedule), never left to duplicate. Both null when reminders are off or there's no deadline to remind about. */
  deadlineNotificationId: string | null;
  deadlineNotificationScheduledFor: string | null;
  /** Visualization task: true (default) inherits the Major Goal's own embodiedIdentityCue; false means ownEmbodiedIdentityCue below is this Sub-goal's own, independent configuration. */
  useSharedEmbodiedCue: boolean;
  /** Only ever read/written when useSharedEmbodiedCue is false. Null while shared. */
  ownEmbodiedIdentityCue: EmbodiedIdentityCue | null;
  /** Same "shared unless overridden" shape as useSharedEmbodiedCue above, for the Achieved-State Mantra specifically -- kept as its own independent flag since a Sub-goal might want its own mantra while still sharing the Major Goal's body language, or vice versa. */
  useSharedAchievedStateMantra: boolean;
  ownAchievedStateMantra: AchievedStateMantra | null;
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
  /** Visualization task, spec section 2 ("Successful body language") -- the embodied identity cue for the ACHIEVED Major Goal. Every Sub-goal that hasn't opted out of sharing (useSharedEmbodiedCue) resolves to this same object. */
  embodiedIdentityCue: EmbodiedIdentityCue;
  /** Visualization task, spec section 4. Disabled (enabled: false) by default -- "the user must be able to... disable it." */
  achievedStateMantra: AchievedStateMantra;
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

/** Sub-goal↔ARC Goal connection task: id for a LifeManifestJournalEntry (data/lifeManifestJournal.ts) -- kept here with every other Life Manifest id generator rather than in the data/ module, matching this codebase's convention of generating domain ids alongside their pure domain logic. */
export function generateLifeManifestJournalEntryId(): string {
  return `lifemanifestjournal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Empty-record builders
// ---------------------------------------------------------------------------

export function createEmptySubGoal(id: string, title: string, now: string): SubGoal {
  return {
    id,
    title,
    description: null,
    status: "draft",
    connectedArcGoalId: null,
    startDate: null,
    deadline: null,
    completedAt: null,
    completionMode: "manual",
    remindersEnabled: false,
    deadlineNotificationId: null,
    deadlineNotificationScheduledFor: null,
    useSharedEmbodiedCue: true,
    ownEmbodiedIdentityCue: null,
    useSharedAchievedStateMantra: true,
    ownAchievedStateMantra: null,
    createdAt: now,
    updatedAt: now,
  };
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
    embodiedIdentityCue: createEmptyEmbodiedIdentityCue(),
    achievedStateMantra: createEmptyAchievedStateMantra(),
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
    startDate: null,
    targetDate: null,
    currentProgress: 0,
    status: "draft",
    completedAt: null,
    connectedIdentityProtocolId: null,
    connectedArcGoalId: null,
    arcGoalLinkMode: "inherited",
    connectedSupportiveProtocolIds: [],
    connectedArcLinkIds: [],
    remindersEnabled: false,
    deadlineNotificationId: null,
    deadlineNotificationScheduledFor: null,
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
// Sub-goal↔ARC Goal connection task: sequential progression, resolved
// purely from each Sub-goal's own `status` (no separate "activeSubGoalId"
// field to keep in sync -- exactly one Sub-goal, at most, ever carries
// status "active" at a time, enforced by activateSubGoal below).
// ---------------------------------------------------------------------------

/**
 * "By default, the first incomplete Sub-goal is the active Sub-goal."
 * Prefers a Sub-goal explicitly marked "active" (the trainee's own
 * manual choice, which may be out of order -- "do not force the user to
 * complete Sub-goals in order"); otherwise falls back to the first
 * Sub-goal in array order that is not yet "completed" or "archived"
 * (a "paused" one is still eligible as the DEFAULT active choice --
 * pausing doesn't remove it from the sequence, it just isn't manually
 * activated right now). Returns null only when every Sub-goal is
 * completed/archived, or there are none.
 */
export function resolveActiveSubGoal(majorGoal: MajorGoal): SubGoal | null {
  const explicit = majorGoal.subGoals.find((subGoal) => subGoal.status === "active");
  if (explicit) return explicit;
  return majorGoal.subGoals.find((subGoal) => subGoal.status !== "completed" && subGoal.status !== "archived") ?? null;
}

/**
 * Manually activates the Sub-goal matching `subGoalId` -- sets its status
 * to "active" and demotes any OTHER currently-"active" Sub-goal to
 * "pending" (never touching a completed/archived/paused/draft one on any
 * other Sub-goal). A no-op (returns the manifest unchanged) if the id
 * doesn't match any Sub-goal on this goal. This is the one and only way
 * "active" is ever set -- always explicit, works on any Sub-goal
 * regardless of array position ("allow manual activation... and
 * returning to an earlier Sub-goal").
 */
export function activateSubGoal(majorGoal: MajorGoal, subGoalId: string): MajorGoal {
  if (!majorGoal.subGoals.some((subGoal) => subGoal.id === subGoalId)) return majorGoal;
  const now = new Date().toISOString();
  const subGoals = majorGoal.subGoals.map((subGoal) => {
    if (subGoal.id === subGoalId) return { ...subGoal, status: "active" as const, updatedAt: now };
    if (subGoal.status === "active") return { ...subGoal, status: "pending" as const, updatedAt: now };
    return subGoal;
  });
  return { ...majorGoal, subGoals };
}

/**
 * Marks the Sub-goal matching `subGoalId` "completed" and records
 * `completedAt` -- "save its completion date and history... do not
 * delete or overwrite its ARC Goal history" (section 2). Deliberately
 * does NOT activate the next Sub-goal itself -- the caller (UI) offers
 * that as one of three explicit choices after completion; this function
 * only ever completes the one Sub-goal it's given. A no-op for an
 * unmatched id.
 */
export function completeSubGoal(majorGoal: MajorGoal, subGoalId: string, completedAt: string): MajorGoal {
  const subGoals = majorGoal.subGoals.map((subGoal) =>
    subGoal.id === subGoalId ? { ...subGoal, status: "completed" as const, completedAt, updatedAt: completedAt } : subGoal
  );
  return { ...majorGoal, subGoals };
}

/** The next Sub-goal after `afterSubGoalId` in array order that isn't completed/archived -- used to offer "לעבור לתת־המטרה הבאה" after completing one. Returns null if there is no such Sub-goal (afterSubGoalId not found, or it's the last eligible one). */
export function resolveNextSubGoal(majorGoal: MajorGoal, afterSubGoalId: string): SubGoal | null {
  const index = majorGoal.subGoals.findIndex((subGoal) => subGoal.id === afterSubGoalId);
  if (index === -1) return null;
  for (let i = index + 1; i < majorGoal.subGoals.length; i++) {
    const candidate = majorGoal.subGoals[i];
    if (candidate.status !== "completed" && candidate.status !== "archived") return candidate;
  }
  return null;
}

/**
 * A Target's EFFECTIVE connected ArcGoal id -- "inherited" (the default)
 * resolves live to the owning Sub-goal's own connectedArcGoalId (never
 * copied onto the Target itself); "own" resolves to the Target's own
 * connectedArcGoalId, completely independent of the Sub-goal's. Pass the
 * Target's actual owning SubGoal (by subGoalId) -- this function doesn't
 * look it up itself, staying pure/total.
 */
export function resolveEffectiveTargetArcGoalId(target: Target, subGoal: SubGoal): string | null {
  return target.arcGoalLinkMode === "own" ? target.connectedArcGoalId : subGoal.connectedArcGoalId;
}

/** True when `targets` is non-empty and every non-archived Target in it is "completed" -- feeds SubGoalCompletionMode "all_targets". An archived Target is excluded from the requirement (it's no longer "required"). Empty/all-archived input is never considered "all complete" (nothing to complete yet). */
export function allRequiredTargetsComplete(targets: Target[]): boolean {
  const required = targets.filter((target) => target.status !== "archived");
  return required.length > 0 && required.every((target) => target.status === "completed");
}

/** 0-100 average of currentProgress across every non-archived Target -- feeds SubGoalCompletionMode "progress_threshold" (reaching 100 triggers the same confirmation prompt as "all_targets"). Returns 0 for no eligible Targets, never NaN. */
export function computeSubGoalProgress(targets: Target[]): number {
  const required = targets.filter((target) => target.status !== "archived");
  if (required.length === 0) return 0;
  const total = required.reduce((sum, target) => sum + Math.max(0, Math.min(100, target.currentProgress)), 0);
  return Math.round(total / required.length);
}

// ---------------------------------------------------------------------------
// Visualization task: shared-unless-overridden resolvers for a Sub-goal's
// embodied identity cue / Achieved-State Mantra -- "each Sub-goal may
// optionally... use the Major Goal's embodied identity cue, or configure
// separate body language, anchors and mantra" (spec section 8).
// ---------------------------------------------------------------------------

export function resolveEmbodiedIdentityCueForSubGoal(majorGoal: MajorGoal, subGoal: SubGoal): EmbodiedIdentityCue {
  if (!subGoal.useSharedEmbodiedCue && subGoal.ownEmbodiedIdentityCue) return subGoal.ownEmbodiedIdentityCue;
  return majorGoal.embodiedIdentityCue;
}

export function resolveAchievedStateMantraForSubGoal(majorGoal: MajorGoal, subGoal: SubGoal): AchievedStateMantra {
  if (!subGoal.useSharedAchievedStateMantra && subGoal.ownAchievedStateMantra) return subGoal.ownAchievedStateMantra;
  return majorGoal.achievedStateMantra;
}

// ---------------------------------------------------------------------------
// Reminder task: pure deadline-reminder-moment resolution -- the I/O half
// (data/lifeManifestReminders.ts) reuses data/routines.ts's exact
// cancel-then-reschedule pattern; this function only ever computes WHICH
// moment is next, in pure calendar-date-string space (program/dateUtils.ts,
// already an established arc/ dependency -- see arc/routines.ts), never a
// clock-time Date -- deadlines here are date-only, no specific hour.
// ---------------------------------------------------------------------------

export type DeadlineReminderMoment = "approaching" | "day_of" | "overdue";

/** How many days before a deadline the "approaching" reminder's window opens. Fixed and documented rather than user-configurable -- the spec doesn't specify a lead time. */
export const DEADLINE_APPROACHING_LEAD_DAYS = 2;

/**
 * The single next relevant deadline-reminder moment for a Sub-goal or
 * Target, given today's local date -- "approaching" once within
 * DEADLINE_APPROACHING_LEAD_DAYS of the deadline (and not yet past it),
 * "day_of" exactly on the deadline, "overdue" any day after. Returns
 * null when there's no deadline, the entity is already
 * completed/archived (no more reminders needed -- a deadline
 * notification never marks completion itself, but once completion
 * happens some other way, reminders stop), or the deadline is still
 * more than the lead time away (nothing to schedule yet; reconciled
 * again as today advances, mirroring reconcileRoutineNotifications'
 * own "recompute on every relevant focus" approach).
 */
export function resolveNextDeadlineReminder(
  deadline: string | null,
  status: SubGoalStatus | TargetStatus,
  todayLocalDate: string
): { moment: DeadlineReminderMoment; fireOnLocalDate: string } | null {
  if (!deadline) return null;
  if (status === "completed" || status === "archived") return null;
  const daysUntil = daysBetweenCalendarDates(todayLocalDate, deadline);
  if (daysUntil < 0) return { moment: "overdue", fireOnLocalDate: todayLocalDate };
  if (daysUntil === 0) return { moment: "day_of", fireOnLocalDate: todayLocalDate };
  const approachingWindowStart = addCalendarDays(deadline, -DEADLINE_APPROACHING_LEAD_DAYS);
  if (daysBetweenCalendarDates(approachingWindowStart, todayLocalDate) >= 0) {
    return { moment: "approaching", fireOnLocalDate: todayLocalDate };
  }
  return null;
}

/** `fireOnLocalDate` (from resolveNextDeadlineReminder) at a fixed 09:00 local time, or `now` (plus a few seconds, so it's a genuinely future moment for the OS scheduler) when that instant has already passed -- deadlines carry no clock time of their own, so a fixed hour is the simplest reasonable choice. */
export function resolveDeadlineReminderFireAt(fireOnLocalDate: string, now: Date): Date {
  const { year, month, day } = parseCalendarDate(fireOnLocalDate);
  const at9am = new Date(year, month - 1, day, 9, 0, 0, 0);
  return at9am.getTime() > now.getTime() ? at9am : new Date(now.getTime() + 5000);
}

// ---------------------------------------------------------------------------
// Sub-goal↔ARC Goal connection task: cross-manifest finders -- every id
// this module generates is globally unique (timestamp+random), so a
// screen reached by a Sub-goal's or Major Goal's own id alone (no parent
// LifeManifest id needed in the route) can locate its full ownership
// chain with a plain scan. Returns null rather than throwing when the id
// doesn't match anything (deleted, or a stale/bad link) -- "handle
// missing or deleted references safely."
// ---------------------------------------------------------------------------

export interface SubGoalOwner {
  manifest: LifeManifest;
  majorGoal: MajorGoal;
  subGoal: SubGoal;
  /** This Sub-goal's 1-based position among its Major Goal's subGoals -- "show the Sub-goal's order" (spec). */
  order: number;
}

export function findSubGoalOwner(manifests: LifeManifest[], subGoalId: string): SubGoalOwner | null {
  for (const manifest of manifests) {
    for (const majorGoal of manifest.majorGoals) {
      const index = majorGoal.subGoals.findIndex((subGoal) => subGoal.id === subGoalId);
      if (index !== -1) return { manifest, majorGoal, subGoal: majorGoal.subGoals[index], order: index + 1 };
    }
  }
  return null;
}

export interface MajorGoalOwner {
  manifest: LifeManifest;
  majorGoal: MajorGoal;
}

export function findMajorGoalOwner(manifests: LifeManifest[], majorGoalId: string): MajorGoalOwner | null {
  for (const manifest of manifests) {
    const majorGoal = manifest.majorGoals.find((goal) => goal.id === majorGoalId);
    if (majorGoal) return { manifest, majorGoal };
  }
  return null;
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

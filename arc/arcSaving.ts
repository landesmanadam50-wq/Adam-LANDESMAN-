/**
 * arc/arcSaving.ts
 *
 * ARCHI -- ARC Saving, Trigger Management & Quick-Action Buttons task:
 * pure, storage-free engine for the new "save a completed ARC exercise's
 * body-region/sensation/regulation/encoding data and reuse it" system.
 * Four deliberately separate entities (the spec's own section 16):
 *
 *   (a) ArcSavedExercise   -- one completed ARC exercise's own saved
 *                             protocol, usable standalone ("תרגל שוב").
 *   (b) ArcTrigger         -- a personally-defined trigger (never an
 *                             automatic diagnosis), pointing at one or
 *                             more body options.
 *   (c) ArcSavedBodyOption -- one reusable, named body/sensation/
 *                             regulation/encoding protocol a trigger can
 *                             offer; a trigger may hold several.
 *   (d) the active/displayed trigger list -- plain string[] of trigger
 *       ids, kept entirely in data/storage.ts (no derived logic beyond
 *       "is this id present/in what order"), never duplicated here.
 *
 * Never a free-standing "type in body regions" form: a snapshot is only
 * ever produced by capturing a real, just-practiced ARC session
 * (captureArcBodyProtocolSnapshot) or by promoting an existing saved
 * exercise into a body option -- "never an automatic diagnosis, always
 * from a real practiced exercise," the spec's own repeated principle.
 *
 * Same split as every other arc/*.ts module (arc/arcDecision.ts,
 * arc/arcPerspective.ts, arc/arcGym.ts): no React, no AsyncStorage, pure
 * functions only, so this gets genuine `node:test` unit coverage instead
 * of only a source-text regression check.
 */

import type { BodyRegion } from "./bodyRegionRoles.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanContractionSelection, BodyScanOpeningSelection, BodyScanSide } from "./bodyScanSelection.ts";
import type { SupportiveFeelingMapping } from "./supportiveFeelingMapping.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

/**
 * The reusable body/sensation/regulation/encoding bundle -- exactly the
 * subset of NewArcLiveSessionState's own fields the spec's section 1
 * means by "the data required to reconstruct the body steps of the
 * exercise." Deliberately reads/writes the CURRENT active fields only
 * (openingBodyScanRegions, the singular supportiveBodyArea) -- never the
 * two legacy fields (primaryOpeningBodyScanRegion/Side, the plural
 * supportiveBodyAreas array) arc/newArcLiveTypes.ts itself documents as
 * superseded and no longer written by any current session.
 */
export interface ArcBodyProtocolSnapshot {
  bodyScanContractionRegions: BodyScanContractionSelection[];
  openingBodyScanRegions: BodyScanOpeningSelection[];
  supportiveBodyArea: BodyRegion | null;
  supportiveBodyAreaCustomLabel: string | null;
  supportiveSensation: string | null;
  positiveMovement: string | null;
  selectedSupportiveFeeling: SupportiveFeelingMapping | null;
}

/** (a) One completed ARC exercise's own saved protocol -- standalone, independent of any trigger. */
export interface ArcSavedExercise {
  id: string;
  label: string;
  snapshot: ArcBodyProtocolSnapshot;
  mode: "full" | "shortened";
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

/**
 * (c) One reusable, named body option a trigger can offer. Carries its
 * own usage stats (spec section 5: "מספר שימושים... תאריך שימוש אחרון")
 * so the activation picker can order options by frequency/recency
 * without the app ever inventing which option is "correct."
 */
export interface ArcSavedBodyOption {
  id: string;
  label: string;
  snapshot: ArcBodyProtocolSnapshot;
  sourceSavedExerciseId: string | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** (b) A personally-defined trigger -- a description the trainee writes, never a diagnosis the app concludes. */
export interface ArcTrigger {
  id: string;
  label: string;
  description: string | null;
  bodyOptionIds: string[];
  linkedArcGymSituationId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Single-slot resumable record carried across the ARC round-trip, read
 * once by build/ArcSavingReviewScreen.tsx -- mirrors
 * loadArcDecisionInProgress/loadArcPerspectiveInProgress's own "survives
 * the detour and an app close/reopen in between" convention.
 * `triggerIdForNewOption` is set only on the "בחירת אזורי גוף מחדש" path
 * (spec section 6) -- no pre-existing option to compare against, so the
 * review screen offers "add as the trigger's first/next option" instead
 * of the usual add-new/update-existing/don't-save three-way choice.
 */
export interface ArcSavingPendingReview {
  bodyOptionId: string | null;
  exerciseId: string | null;
  triggerIdForNewOption: string | null;
  finalSnapshot: ArcBodyProtocolSnapshot;
  activeTaskId: string | null;
  completedAt: string;
}

function randomSuffix(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateArcSavedExerciseId(): string {
  return randomSuffix("arc-saved-exercise");
}

export function generateArcSavedBodyOptionId(): string {
  return randomSuffix("arc-saved-body-option");
}

export function generateArcTriggerId(): string {
  return randomSuffix("arc-trigger");
}

/**
 * Projects a live/just-completed NewArcLiveSessionState down to the
 * reusable snapshot -- the ONE place this mapping is defined, so a
 * future field added to either side never silently drifts out of sync
 * at more than one call site.
 */
export function captureArcBodyProtocolSnapshot(session: NewArcLiveSessionState): ArcBodyProtocolSnapshot {
  return {
    bodyScanContractionRegions: session.bodyScanContractionRegions,
    openingBodyScanRegions: session.openingBodyScanRegions,
    supportiveBodyArea: session.supportiveBodyArea,
    supportiveBodyAreaCustomLabel: session.supportiveBodyAreaCustomLabel,
    supportiveSensation: session.supportiveSensation,
    positiveMovement: session.positiveMovement,
    selectedSupportiveFeeling: session.selectedSupportiveFeeling,
  };
}

/**
 * The inverse of captureArcBodyProtocolSnapshot -- applied exactly once,
 * at session creation (never re-applied on reload), so the trainee's own
 * live edits during Regulation are never clobbered by a second apply.
 * Pure: never touches `updatedAt`/stage bookkeeping beyond the 7 fields
 * themselves, mirroring every other setter in this codebase's own
 * `{ ...state, field: value }` convention.
 */
export function applyArcBodyProtocolSnapshotToSession(session: NewArcLiveSessionState, snapshot: ArcBodyProtocolSnapshot): NewArcLiveSessionState {
  return {
    ...session,
    bodyScanContractionRegions: snapshot.bodyScanContractionRegions,
    openingBodyScanRegions: snapshot.openingBodyScanRegions,
    supportiveBodyArea: snapshot.supportiveBodyArea,
    supportiveBodyAreaCustomLabel: snapshot.supportiveBodyAreaCustomLabel,
    supportiveSensation: snapshot.supportiveSensation,
    positiveMovement: snapshot.positiveMovement,
    selectedSupportiveFeeling: snapshot.selectedSupportiveFeeling,
  };
}

function sameContractionSet(a: BodyScanContractionSelection[], b: BodyScanContractionSelection[]): boolean {
  if (a.length !== b.length) return false;
  const matches = (x: { region: BodyScanRegion; side: BodyScanSide }, y: { region: BodyScanRegion; side: BodyScanSide }) => x.region === y.region && x.side === y.side;
  return a.every((entryA) => b.some((entryB) => matches(entryA, entryB)));
}

function sameOpeningSet(a: BodyScanOpeningSelection[], b: BodyScanOpeningSelection[]): boolean {
  if (a.length !== b.length) return false;
  const matches = (x: BodyScanOpeningSelection, y: BodyScanOpeningSelection) => x.region === y.region && x.side === y.side && x.role === y.role;
  return a.every((entryA) => b.some((entryB) => matches(entryA, entryB)));
}

/**
 * The pure divergence check the "הוסף אפשרות חדשה / עדכן אפשרות קיימת /
 * אל תשמור" confirmation (spec section 5) is gated on -- a real UI Alert
 * only ever appears when this returns false; never built into any setter
 * itself (the same pure-setter/UI-confirmation split as
 * pairArcResultWithBehaviour/linkArcPerspectiveToArcGymSituation
 * elsewhere in this codebase). Array-order-insensitive on both selection
 * arrays, since re-tapping the same two regions in the opposite order is
 * not a real divergence.
 */
export function areArcBodyProtocolSnapshotsEqual(a: ArcBodyProtocolSnapshot, b: ArcBodyProtocolSnapshot): boolean {
  if (!sameContractionSet(a.bodyScanContractionRegions, b.bodyScanContractionRegions)) return false;
  if (!sameOpeningSet(a.openingBodyScanRegions, b.openingBodyScanRegions)) return false;
  if (a.supportiveBodyArea !== b.supportiveBodyArea) return false;
  if ((a.supportiveBodyAreaCustomLabel ?? "") !== (b.supportiveBodyAreaCustomLabel ?? "")) return false;
  if ((a.supportiveSensation ?? "") !== (b.supportiveSensation ?? "")) return false;
  if ((a.positiveMovement ?? "") !== (b.positiveMovement ?? "")) return false;
  const feelingA = a.selectedSupportiveFeeling ? JSON.stringify(a.selectedSupportiveFeeling) : "";
  const feelingB = b.selectedSupportiveFeeling ? JSON.stringify(b.selectedSupportiveFeeling) : "";
  return feelingA === feelingB;
}

// --- (a) ArcSavedExercise CRUD ---

export function createArcSavedExercise(id: string, label: string, snapshot: ArcBodyProtocolSnapshot, mode: "full" | "shortened", sourceSessionId: string | null, now: string): ArcSavedExercise {
  return { id, label: label.trim(), snapshot, mode, sourceSessionId, createdAt: now, updatedAt: now, lastUsedAt: null };
}

export function updateArcSavedExercise(exercise: ArcSavedExercise, patch: Partial<Pick<ArcSavedExercise, "label" | "snapshot">>, now: string): ArcSavedExercise {
  return {
    ...exercise,
    label: patch.label !== undefined ? patch.label.trim() : exercise.label,
    snapshot: patch.snapshot ?? exercise.snapshot,
    updatedAt: now,
  };
}

export function markArcSavedExerciseUsed(exercise: ArcSavedExercise, now: string): ArcSavedExercise {
  return { ...exercise, lastUsedAt: now };
}

export function upsertArcSavedExerciseInList(exercises: ArcSavedExercise[], exercise: ArcSavedExercise): ArcSavedExercise[] {
  const index = exercises.findIndex((entry) => entry.id === exercise.id);
  if (index === -1) return [...exercises, exercise];
  const next = exercises.slice();
  next[index] = exercise;
  return next;
}

export function deleteArcSavedExerciseFromList(exercises: ArcSavedExercise[], id: string): ArcSavedExercise[] {
  return exercises.filter((entry) => entry.id !== id);
}

export function findArcSavedExerciseById(exercises: ArcSavedExercise[], id: string): ArcSavedExercise | null {
  return exercises.find((entry) => entry.id === id) ?? null;
}

// --- (c) ArcSavedBodyOption CRUD ---

export function createArcSavedBodyOption(id: string, label: string, snapshot: ArcBodyProtocolSnapshot, sourceSavedExerciseId: string | null, now: string): ArcSavedBodyOption {
  return { id, label: label.trim(), snapshot, sourceSavedExerciseId, useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now };
}

/** Promotes one saved exercise's own snapshot into a reusable, trigger-attachable body option -- never mutates or deletes the source exercise. */
export function promoteArcSavedExerciseToBodyOption(exercise: ArcSavedExercise, id: string, label: string, now: string): ArcSavedBodyOption {
  return createArcSavedBodyOption(id, label, exercise.snapshot, exercise.id, now);
}

/**
 * Unconditional setter -- never overwrites without the caller already
 * having asked the trainee ("עדכן אפשרות קיימת" in the UI's own Alert).
 * `patch.snapshot` replaces the whole snapshot at once (the only shape a
 * divergence-update ever needs).
 */
export function updateArcSavedBodyOption(option: ArcSavedBodyOption, patch: Partial<Pick<ArcSavedBodyOption, "label" | "snapshot">>, now: string): ArcSavedBodyOption {
  return {
    ...option,
    label: patch.label !== undefined ? patch.label.trim() : option.label,
    snapshot: patch.snapshot ?? option.snapshot,
    updatedAt: now,
  };
}

export function markArcSavedBodyOptionUsed(option: ArcSavedBodyOption, now: string): ArcSavedBodyOption {
  return { ...option, useCount: option.useCount + 1, lastUsedAt: now };
}

export function upsertArcSavedBodyOptionInList(options: ArcSavedBodyOption[], option: ArcSavedBodyOption): ArcSavedBodyOption[] {
  const index = options.findIndex((entry) => entry.id === option.id);
  if (index === -1) return [...options, option];
  const next = options.slice();
  next[index] = option;
  return next;
}

export function deleteArcSavedBodyOptionFromList(options: ArcSavedBodyOption[], id: string): ArcSavedBodyOption[] {
  return options.filter((entry) => entry.id !== id);
}

export function findArcSavedBodyOptionById(options: ArcSavedBodyOption[], id: string): ArcSavedBodyOption | null {
  return options.find((entry) => entry.id === id) ?? null;
}

// --- (b) ArcTrigger CRUD ---

export function createArcTrigger(id: string, label: string, now: string): ArcTrigger {
  return { id, label: label.trim(), description: null, bodyOptionIds: [], linkedArcGymSituationId: null, createdAt: now, updatedAt: now };
}

export function updateArcTrigger(trigger: ArcTrigger, patch: Partial<Pick<ArcTrigger, "label" | "description">>, now: string): ArcTrigger {
  return {
    ...trigger,
    label: patch.label !== undefined ? patch.label.trim() : trigger.label,
    description: patch.description !== undefined ? (patch.description?.trim() || null) : trigger.description,
    updatedAt: now,
  };
}

/** Attaches an existing body option id to a trigger -- never creates/deletes the option itself. Idempotent: attaching an already-attached option is a no-op. */
export function addBodyOptionToTrigger(trigger: ArcTrigger, bodyOptionId: string, now: string): ArcTrigger {
  if (trigger.bodyOptionIds.includes(bodyOptionId)) return trigger;
  return { ...trigger, bodyOptionIds: [...trigger.bodyOptionIds, bodyOptionId], updatedAt: now };
}

/** Removes a body option from this trigger's own list only -- the option itself (and any OTHER trigger referencing it) is untouched, matching the spec's own "למחוק אפשרות מסוימת בלי למחוק את כל הטריגר." */
export function removeBodyOptionFromTrigger(trigger: ArcTrigger, bodyOptionId: string, now: string): ArcTrigger {
  if (!trigger.bodyOptionIds.includes(bodyOptionId)) return trigger;
  return { ...trigger, bodyOptionIds: trigger.bodyOptionIds.filter((id) => id !== bodyOptionId), updatedAt: now };
}

export function linkArcGymSituationToTrigger(trigger: ArcTrigger, situationId: string, now: string): ArcTrigger {
  return { ...trigger, linkedArcGymSituationId: situationId, updatedAt: now };
}

export function unlinkArcGymSituationFromTrigger(trigger: ArcTrigger, now: string): ArcTrigger {
  if (trigger.linkedArcGymSituationId === null) return trigger;
  return { ...trigger, linkedArcGymSituationId: null, updatedAt: now };
}

export function upsertArcTriggerInList(triggers: ArcTrigger[], trigger: ArcTrigger): ArcTrigger[] {
  const index = triggers.findIndex((entry) => entry.id === trigger.id);
  if (index === -1) return [...triggers, trigger];
  const next = triggers.slice();
  next[index] = trigger;
  return next;
}

/** Deletes a trigger from the master list only -- callers must separately drop its id from the active-triggers list (data/storage.ts's own saveActiveArcTriggerIds), never implied here, so this pure module never reaches into that unrelated concern. */
export function deleteArcTriggerFromList(triggers: ArcTrigger[], id: string): ArcTrigger[] {
  return triggers.filter((entry) => entry.id !== id);
}

export function findArcTriggerById(triggers: ArcTrigger[], id: string): ArcTrigger | null {
  return triggers.find((entry) => entry.id === id) ?? null;
}

// --- (d) active/displayed trigger list -- pure array helpers; persistence itself lives in data/storage.ts ---

/** Adds a trigger id to the end of the active list (spec section 9.1/9.4) -- idempotent, and never auto-starts anything (section 8: "אין להתחיל ARC אוטומטית בעת בחירת הטריגרים"). */
export function addTriggerToActiveList(activeIds: string[], triggerId: string): string[] {
  if (activeIds.includes(triggerId)) return activeIds;
  return [...activeIds, triggerId];
}

/** Removes a trigger id from the active list only -- never deletes the trigger from the master list (section 9.2: "להסיר טריגר מהתצוגה בלי למחוק אותו מהמאגר"). */
export function removeTriggerFromActiveList(activeIds: string[], triggerId: string): string[] {
  return activeIds.filter((id) => id !== triggerId);
}

/** Section 9.3: "להחליף טריגר בטריגר אחר" -- same position, different id. No-op if `fromId` isn't present. */
export function swapTriggerInActiveList(activeIds: string[], fromId: string, toId: string): string[] {
  const index = activeIds.indexOf(fromId);
  if (index === -1) return activeIds;
  const next = activeIds.slice();
  next[index] = toId;
  return next;
}

/** Section 9.5: "לשנות את סדר התצוגה" -- moves the id at `fromIndex` to `toIndex`, clamping both to the array's bounds. */
export function reorderActiveTriggerList(activeIds: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || fromIndex >= activeIds.length) return activeIds;
  const clampedTo = Math.max(0, Math.min(toIndex, activeIds.length - 1));
  const next = activeIds.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

/** Drops ids from the active list that no longer resolve to a real trigger (deleted exercise/trigger case, spec section 14: "מחיקת תרגיל שמור תסיר קיצורים שאינם תקפים"), preserving the remaining order. */
export function pruneActiveTriggerList(activeIds: string[], triggers: ArcTrigger[]): string[] {
  const validIds = new Set(triggers.map((trigger) => trigger.id));
  return activeIds.filter((id) => validIds.has(id));
}

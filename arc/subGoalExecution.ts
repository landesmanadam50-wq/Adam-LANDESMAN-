/**
 * arc/subGoalExecution.ts
 *
 * Sub-goal execution task (Phase 5) -- pure (React/storage-free) logic
 * for the phase ArcGoalFourWeekProgram.readyForSubGoalActivation was
 * always meant to unlock: the ArcGoal's OWN ordered execution sub-goals
 * and their targets, once its four-week identity-and-habit program
 * finishes. Exactly mirrors arc/fourWeekProgram.ts's own module shape
 * (every function takes the relevant entity and returns a new one) and
 * arc/lifeManifest.ts's sequential Sub-goal progression
 * (resolveActiveSubGoal/activateSubGoal/completeSubGoal), adapted to
 * ArcGoal's own (distinct, NOT the same entity as) SubGoal/Target types.
 *
 * Central design rule, same as the four-week program: nothing here ever
 * auto-activates or auto-completes anything just because a planned date
 * arrived -- activateExecutionPhase only runs once Week 4 is explicitly
 * confirmed complete (readyForSubGoalActivation), and
 * completeActiveSubGoalAndAdvance only runs after the trainee explicitly
 * confirms a sub-goal's own completion prompt.
 */

import { addCalendarDays, todayLocalDateString } from "../program/dateUtils.ts";
import { generateArcGoalSubGoalId, generateArcGoalTargetId } from "./types.ts";
import type {
  ArcGoal,
  ArcGoalExecutionReturnContext,
  ArcGoalPhase,
  ArcGoalSubGoal,
  ArcGoalSubGoalReflection,
  ArcGoalTarget,
  FourWeekProgramWeekNumber,
} from "./types.ts";

/**
 * A null/undefined ArcGoal.phase (every legacy goal, and every goal
 * before its four-week program's Week 4 completes) resolves to
 * "four_week_program" whenever a four-week program is actually enabled,
 * otherwise there IS no phase at all (a goal with no program and no
 * execution history -- there's nothing to resolve, so this returns null).
 * Callers gate any execution-phase UI/behavior on this, never on the raw
 * stored field, so a legacy goal is never treated as being in any phase.
 */
export function resolvePhase(goal: Pick<ArcGoal, "phase" | "fourWeekProgram">): ArcGoalPhase | null {
  if (goal.phase) return goal.phase;
  if (goal.fourWeekProgram?.enabled) return "four_week_program";
  return null;
}

/** Updates the one target matching `target.id` in place if found, otherwise appends it -- same convention as arc/lifeManifest.ts's upsertTargetInList/arc/arcGoals.ts's upsertArcGoalInList. */
export function upsertArcGoalTargetInList(targets: ArcGoalTarget[], target: ArcGoalTarget): ArcGoalTarget[] {
  const index = targets.findIndex((existing) => existing.id === target.id);
  if (index === -1) return [...targets, target];
  return targets.map((existing, i) => (i === index ? target : existing));
}

/** Removes exactly the one target matching `id` -- a no-op if the id doesn't match any target. Never touches any other target's own fields. */
export function deleteArcGoalTargetFromList(targets: ArcGoalTarget[], id: string): ArcGoalTarget[] {
  return targets.filter((target) => target.id !== id);
}

/**
 * Always starts "locked", REGARDLESS of order -- activateExecutionPhase/
 * completeActiveSubGoalAndAdvance are the ONLY functions that ever set a
 * sub-goal "active" (spec section 1: never merely because it was
 * created first, or a date arrived). A sub-goal added in BUILD before
 * the four-week program even finishes must never appear active early.
 */
export function createEmptyArcGoalSubGoal(arcGoalId: string, order: number, now: string): ArcGoalSubGoal {
  return {
    id: generateArcGoalSubGoalId(),
    arcGoalId,
    name: "",
    description: null,
    order,
    plannedStartDate: null,
    plannedCompletionDate: null,
    actualCompletionDate: null,
    status: "locked",
    reflection: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyArcGoalTarget(arcGoalId: string, subGoalId: string, now: string): ArcGoalTarget {
  return {
    id: generateArcGoalTargetId(),
    arcGoalId,
    subGoalId,
    name: "",
    actionDescription: null,
    plannedDate: null,
    plannedTime: null,
    location: null,
    durationMinutes: null,
    recurrenceDaysOfWeek: null,
    plannedCompletionDate: null,
    actualCompletionDate: null,
    status: "pending",
    remindersEnabled: false,
    notificationId: null,
    notificationScheduledFor: null,
    linkedScheduledRoutineId: null,
    linkedSupportProtocolIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** The one sub-goal currently active, if any -- "only one sub-goal should be active by default" (spec section 2). Order among ties is irrelevant; activateExecutionPhase/completeActiveSubGoalAndAdvance never produce more than one. */
export function resolveActiveSubGoal(goal: Pick<ArcGoal, "subGoals">): ArcGoalSubGoal | null {
  return (goal.subGoals ?? []).find((subGoal) => subGoal.status === "active") ?? null;
}

/**
 * Sub-goal execution task, spec section 1: the ONLY function that
 * transitions an ArcGoal from its four-week program into execution.
 * Requires readyForSubGoalActivation (set exclusively by
 * confirmWeekCompleteAndAdvance, arc/fourWeekProgram.ts, itself only
 * ever called after the trainee explicitly confirms Week 4's own
 * completion) -- "Do not activate the first sub-goal merely because the
 * planned Week 4 date arrived." A no-op (returns goal unchanged) if
 * already in execution/completed, or if the program was never enabled or
 * never reached Week 4 confirmation -- safe to call defensively, never
 * re-activates/reorders anything on a second call.
 *
 * Sets phase "execution", and -- only if this goal actually has
 * sub-goals configured (BUILD) and none is already active -- activates
 * the first ordered one (status locked -> active); "keep later sub-goals
 * visible but locked/upcoming" holds automatically since nothing else is
 * touched. A goal with no sub-goals yet configured still transitions to
 * "execution" (the trainee can add sub-goals from there), just with no
 * active one until they do.
 */
export function activateExecutionPhase(goal: ArcGoal, now: string): ArcGoal {
  if (resolvePhase(goal) !== "four_week_program") return goal;
  if (!goal.fourWeekProgram?.readyForSubGoalActivation) return goal;

  const subGoals = goal.subGoals ?? [];
  if (subGoals.length === 0 || resolveActiveSubGoal(goal)) {
    return { ...goal, phase: "execution", updatedAt: now };
  }

  const ordered = [...subGoals].sort((a, b) => a.order - b.order);
  const firstId = ordered[0].id;
  return {
    ...goal,
    phase: "execution",
    subGoals: subGoals.map((subGoal) => (subGoal.id === firstId ? { ...subGoal, status: "active", updatedAt: now } : subGoal)),
    updatedAt: now,
  };
}

/**
 * Sub-goal execution task, spec section 2: reassigns `.order` across the
 * given full id ordering -- never touches id, status, dates, or any
 * ArcGoalTarget (which references subGoalId, never order/position), so
 * "reordering during BUILD/editing" can never break a saved target link.
 * Any id in `orderedIds` not found among goal.subGoals is ignored; any
 * existing sub-goal not present in `orderedIds` keeps its current order
 * and is appended after the reordered ones (defensive -- callers always
 * pass every id, but this never silently drops one that was somehow
 * missed).
 */
export function reorderSubGoals(goal: ArcGoal, orderedIds: string[], now: string): ArcGoal {
  const subGoals = goal.subGoals ?? [];
  const byId = new Map(subGoals.map((subGoal) => [subGoal.id, subGoal]));
  const reordered: ArcGoalSubGoal[] = [];
  let nextOrder = 0;
  for (const id of orderedIds) {
    const subGoal = byId.get(id);
    if (!subGoal) continue;
    reordered.push({ ...subGoal, order: nextOrder, updatedAt: now });
    nextOrder += 1;
    byId.delete(id);
  }
  for (const remaining of byId.values()) {
    reordered.push({ ...remaining, order: nextOrder, updatedAt: now });
    nextOrder += 1;
  }
  return { ...goal, subGoals: reordered, updatedAt: now };
}

/**
 * Sub-goal execution task, spec section 7: "all required targets
 * completed" -- scoped to this sub-goal's own ONE-TIME targets only
 * (recurrenceDaysOfWeek === null). A recurring target represents an
 * ongoing habit, not a one-off requirement with a final "done" state, so
 * it never blocks (or is required for) sub-goal completion; a sub-goal
 * made up ENTIRELY of recurring targets is never automatically
 * "completable" by this check (returns false when there are zero
 * qualifying one-time targets), matching "only after confirmation" --
 * the trainee's own explicit completion action is always still available
 * regardless of what this function reports; it only gates WHETHER the
 * dashboard offers the completion prompt, never a hard block.
 */
export function allRequiredTargetsComplete(subGoalId: string, targets: ArcGoalTarget[]): boolean {
  const oneTime = targets.filter((target) => target.subGoalId === subGoalId && target.recurrenceDaysOfWeek === null);
  if (oneTime.length === 0) return false;
  return oneTime.every((target) => target.status === "completed");
}

/**
 * Sub-goal execution task, spec section 7: the ONLY function that
 * actually completes the active sub-goal and advances the program --
 * called after the trainee explicitly confirms ("להשלים ולעבור לתת־המטרה
 * הבאה"), optionally after answering the reflection. Marks the active
 * sub-goal completed (status + actualCompletionDate), then either
 * activates the next ordered not-yet-completed sub-goal (locked ->
 * active) or, when none remains, completes the whole ArcGoal (phase
 * "completed" + executionCompletedAt). A no-op (returns goal unchanged)
 * if there is no active sub-goal to complete.
 */
export function completeActiveSubGoalAndAdvance(goal: ArcGoal, reflection: Omit<ArcGoalSubGoalReflection, "answeredAt"> | null, now: string): ArcGoal {
  const active = resolveActiveSubGoal(goal);
  if (!active) return goal;

  const subGoals = (goal.subGoals ?? []).map((subGoal) =>
    subGoal.id === active.id
      ? {
          ...subGoal,
          status: "completed" as const,
          actualCompletionDate: now,
          reflection: reflection ? { ...reflection, answeredAt: now } : subGoal.reflection,
          updatedAt: now,
        }
      : subGoal
  );

  const nextCandidate = subGoals
    .filter((subGoal) => subGoal.status === "locked")
    .sort((a, b) => a.order - b.order)[0];

  if (!nextCandidate) {
    return { ...goal, subGoals, phase: "completed", executionCompletedAt: now, updatedAt: now };
  }

  return {
    ...goal,
    subGoals: subGoals.map((subGoal) => (subGoal.id === nextCandidate.id ? { ...subGoal, status: "active", updatedAt: now } : subGoal)),
    updatedAt: now,
  };
}

/** Saved right before leaving a target's execution screen for optional ARCHI support (spec section 11) -- see ArcGoalExecutionReturnContext's own doc. */
export function setExecutionReturnContext(
  goal: ArcGoal,
  fields: Omit<ArcGoalExecutionReturnContext, "sourceMode" | "arcGoalId" | "savedAt">,
  now: string
): ArcGoal {
  const returnContext: ArcGoalExecutionReturnContext = { sourceMode: "reach_your_goal", arcGoalId: goal.id, savedAt: now, ...fields };
  return { ...goal, executionReturnContext: returnContext, updatedAt: now };
}

export function clearExecutionReturnContext(goal: ArcGoal): ArcGoal {
  return { ...goal, executionReturnContext: null };
}

// ---------------------------------------------------------------------------
// Target occurrence resolution (spec sections 3, 6, 9, 14) -- mirrors
// arc/routines.ts's own resolveTodayOccurrenceDate/resolveNextOccurrenceDate/
// isRoutineCompletedForDate exactly (same 14-day-window scan, same real
// Date-object arithmetic, immune to the same timezone/DST bug class --
// see that file's own module doc), adapted to ArcGoalTarget's own shape
// (a "YYYY-MM-DD"+"HH:MM" pair instead of separate hour/minute integers,
// and an optional plannedDate for the one-time case that ScheduledRoutine
// has no equivalent of at all).
// ---------------------------------------------------------------------------

export type ArcGoalTargetOccurrenceCompletion = { targetId: string; occurrenceDateLocal: string; completedAt: string };

function parseTimeOfDay(plannedTime: string | null): { hour: number; minute: number } {
  if (!plannedTime) return { hour: 9, minute: 0 };
  const match = /^(\d{1,2}):(\d{2})$/.exec(plannedTime);
  if (!match) return { hour: 9, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function setLocalTime(base: Date, hour: number, minute: number): Date {
  const withTime = new Date(base);
  withTime.setHours(hour, minute, 0, 0);
  return withTime;
}

export function isTargetRecurring(target: Pick<ArcGoalTarget, "recurrenceDaysOfWeek">): boolean {
  return target.recurrenceDaysOfWeek !== null;
}

/** This target's own scheduled moment TODAY (device local time) -- for a recurring target, only when today's weekday is one of its recurrence days; for a one-time target, only when its plannedDate is today. null otherwise, regardless of whether that moment has already passed. */
export function resolveTargetTodayOccurrenceDate(target: ArcGoalTarget, now: Date = new Date()): Date | null {
  const { hour, minute } = parseTimeOfDay(target.plannedTime);
  if (isTargetRecurring(target)) {
    if (!target.recurrenceDaysOfWeek!.includes(now.getDay())) return null;
    return setLocalTime(now, hour, minute);
  }
  if (!target.plannedDate || target.plannedDate !== todayLocalDateString(now)) return null;
  return setLocalTime(now, hour, minute);
}

/**
 * The next STRICTLY FUTURE occurrence from `now` -- for a recurring
 * target, scans a full 14-day window exactly like
 * arc/routines.ts's resolveNextOccurrenceDate (every weekday occurs at
 * least twice in that span, so this never returns null for a target with
 * at least one recurrence day). For a one-time target, its own
 * plannedDate/plannedTime if that moment is still ahead, else null (a
 * past one-time target has no "next" occurrence -- it's simply overdue or
 * done). A one-time target already marked "completed" always returns
 * null regardless of date -- spec section 6/9: completing it must
 * "cancel remaining reminders for that occurrence," never leave one
 * schedulable again. null when nothing is scheduled at all.
 */
export function resolveTargetNextOccurrenceDate(target: ArcGoalTarget, now: Date = new Date()): Date | null {
  if (!isTargetRecurring(target) && target.status === "completed") return null;
  const { hour, minute } = parseTimeOfDay(target.plannedTime);
  if (isTargetRecurring(target)) {
    const days = target.recurrenceDaysOfWeek!;
    if (days.length === 0) return null;
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const candidateDay = new Date(now);
      candidateDay.setDate(candidateDay.getDate() + dayOffset);
      if (!days.includes(candidateDay.getDay())) continue;
      const candidate = setLocalTime(candidateDay, hour, minute);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
    return null; // Unreachable when days is non-empty.
  }
  if (!target.plannedDate) return null;
  const candidate = setLocalTime(new Date(`${target.plannedDate}T00:00:00`), hour, minute);
  return candidate.getTime() > now.getTime() ? candidate : null;
}

export function isTargetOccurrenceCompleted(targetId: string, occurrenceDateLocal: string, completions: ArcGoalTargetOccurrenceCompletion[]): boolean {
  return completions.some((entry) => entry.targetId === targetId && entry.occurrenceDateLocal === occurrenceDateLocal);
}

export type TargetOccurrenceStatus = "completed" | "dueOrOverdue" | "upcoming" | "noOccurrenceToday";

/**
 * Sub-goal execution task, spec section 9 ("prevent duplicate
 * reminders"): the pure "does this target's already-scheduled
 * notification still match its own freshly-computed next occurrence"
 * decision -- data/arcGoalTargetReminders.ts's reconcileArcGoalTargetNotification
 * is a thin I/O wrapper around exactly this, mirroring
 * data/routines.ts's own reconcileRoutineNotifications inline check.
 * true means "leave it alone, no cancel+reschedule needed" -- editing a
 * target that DIDN'T change its own occurrence timing (e.g. only its
 * description) never churns its notification.
 */
export function isTargetNotificationInSync(target: ArcGoalTarget, now: Date = new Date()): boolean {
  if (!target.remindersEnabled) return target.notificationId === null && target.notificationScheduledFor === null;
  const nextOccurrence = resolveTargetNextOccurrenceDate(target, now);
  const targetIso = nextOccurrence ? nextOccurrence.toISOString() : null;
  return target.notificationScheduledFor === targetIso && (targetIso === null || target.notificationId !== null);
}

/**
 * Today's own status for one target -- for a one-time target already
 * marked "completed" at the target level, always "completed" regardless
 * of date (spec section 6: a completed one-time target stays completed).
 * A recurring target's completion is read from today's own occurrence
 * record only -- completing one occurrence never marks a later day
 * "completed" too (spec section 14).
 */
export function resolveTargetStatusToday(target: ArcGoalTarget, completions: ArcGoalTargetOccurrenceCompletion[], now: Date = new Date()): TargetOccurrenceStatus {
  if (!isTargetRecurring(target) && target.status === "completed") return "completed";
  const todayOccurrence = resolveTargetTodayOccurrenceDate(target, now);
  if (!todayOccurrence) return "noOccurrenceToday";
  if (isTargetOccurrenceCompleted(target.id, todayLocalDateString(now), completions)) return "completed";
  return todayOccurrence.getTime() <= now.getTime() ? "dueOrOverdue" : "upcoming";
}

/**
 * Sub-goal execution task, spec section 6: pure decision for "סיימתי" --
 * for a ONE-TIME target, returns the target itself marked completed
 * (status + actualCompletionDate) and no occurrence record (there's only
 * ever one completion to represent). For a RECURRING target, the target
 * is returned UNCHANGED (it keeps recurring) alongside today's own
 * occurrence completion record -- "record completion per occurrence
 * rather than incorrectly completing the entire recurring series."
 * Idempotent against accidental duplicate taps: completing an
 * already-completed one-time target, or an already-completed today's
 * occurrence, returns the same state back rather than duplicating
 * anything (callers should still avoid appending a duplicate occurrence
 * row -- see isTargetOccurrenceCompleted -- this function only decides
 * WHAT the record should look like, not whether to persist it again).
 */
export function completeTarget(
  target: ArcGoalTarget,
  now: string
): { target: ArcGoalTarget; occurrence: ArcGoalTargetOccurrenceCompletion | null } {
  if (isTargetRecurring(target)) {
    return { target, occurrence: { targetId: target.id, occurrenceDateLocal: todayLocalDateString(new Date(now)), completedAt: now } };
  }
  return { target: { ...target, status: "completed", actualCompletionDate: now, updatedAt: now }, occurrence: null };
}

/**
 * Sub-goal execution task, spec section 6: "allow undoing completion
 * safely while preserving history where the current data model
 * supports it" -- for a ONE-TIME target, reverting status/
 * actualCompletionDate to pending/null is fully safe (there was only
 * ever one completion record, now cleared). A RECURRING target's own
 * occurrence completion is a separate flat record (data/storage.ts) this
 * function never touches -- callers wanting to undo a specific
 * occurrence remove that one row directly, which this pure function
 * has no way to reach (no list ever passed in) by design, so it is
 * documented here rather than silently no-op'd.
 */
export function uncompleteTarget(target: ArcGoalTarget, now: string): ArcGoalTarget {
  if (isTargetRecurring(target)) return target;
  return { ...target, status: "pending", actualCompletionDate: null, updatedAt: now };
}

/** "Due today" for the execution dashboard's own "Targets due today" list (spec section 5) -- dueOrOverdue only, never upcoming/completed. */
export function isTargetDueToday(target: ArcGoalTarget, completions: ArcGoalTargetOccurrenceCompletion[], now: Date = new Date()): boolean {
  return resolveTargetStatusToday(target, completions, now) === "dueOrOverdue";
}

export type TargetSupportDifficulty = "emotion" | "urge" | "thought" | "practical_barrier" | "short_support" | "none";

export type TargetSupportRoute =
  | { kind: "none" }
  | { kind: "practical_barrier_options" }
  | { kind: "identity_recall" }
  | { kind: "mini_arc"; miniArcId: string }
  | { kind: "full_arc"; buildId: string }
  | { kind: "arc_goal_urge_session" };

/**
 * Sub-goal execution task, spec section 10: resolves the trainee's own
 * answer to "מה מפריע לך לבצע את הפעולה?" into a concrete route --
 * "Do not automatically select a protocol on behalf of the user" is
 * satisfied by never picking BETWEEN multiple equally-valid options here
 * (that choice, when both Full and Mini are available, is made by the
 * caller/UI before this function is even reached -- see
 * live/ArcGoalTargetScreen.tsx). "practical_barrier" NEVER resolves to
 * an ARC route at all -- always its own 4-option local picker, never
 * emotion/urge/thought (spec section 12, directly regression-tested).
 */
export function resolveTargetSupportRoute(
  difficulty: TargetSupportDifficulty,
  goal: Pick<ArcGoal, "identityProtocolId" | "interferingMappings" | "urgeMappings" | "fourWeekProgram">
): TargetSupportRoute {
  if (difficulty === "none") return { kind: "none" };
  if (difficulty === "practical_barrier") return { kind: "practical_barrier_options" };

  if (difficulty === "emotion") {
    const mapping = goal.interferingMappings[0];
    if (mapping) return { kind: "full_arc", buildId: mapping.supportiveProtocolId };
    if (goal.identityProtocolId) return { kind: "full_arc", buildId: goal.identityProtocolId };
    return { kind: "none" };
  }

  if (difficulty === "urge") {
    // Urge ARC has no standalone LIVE route -- it's only ever practiced
    // embedded inside /arc-goal/live/[goalId] (see arc/arcGoalEngine.ts's
    // own module doc). Routing there reuses that EXISTING, only possible
    // way to practice an UrgeArc rather than inventing a second one.
    if (goal.urgeMappings.length > 0) return { kind: "arc_goal_urge_session" };
    if (goal.identityProtocolId) return { kind: "full_arc", buildId: goal.identityProtocolId };
    return { kind: "none" };
  }

  if (difficulty === "thought") {
    // ARC Thought is a stage WITHIN the regular Full ARC flow
    // (arc/arcEngine.ts) -- there is no standalone "ARC Thought" screen
    // to route to, so a Full ARC session on the identity protocol is the
    // most literal available match.
    if (goal.identityProtocolId) return { kind: "full_arc", buildId: goal.identityProtocolId };
    return { kind: "none" };
  }

  // "short_support": Mini ARC when this goal's own four-week program
  // linked one, else Identity Recall in place (no navigation) --
  // mirrors the four-week dashboard's own existing Week 3 pattern.
  if (goal.fourWeekProgram?.linkedMiniArcId) return { kind: "mini_arc", miniArcId: goal.fourWeekProgram.linkedMiniArcId };
  return { kind: "identity_recall" };
}

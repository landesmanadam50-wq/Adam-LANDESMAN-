/**
 * arc/dailyPlan.ts
 *
 * Fixed Weekly Routine / Flexible Daily Routine task: resolves the
 * Flexible Daily Routine's own chronological list for one date --
 * every recurring (Fixed Weekly Routine) task scheduled on that
 * weekday, minus any removed-for-this-date occurrences, with any
 * per-date time/duration/order override applied (arc/taskOccurrenceOverride.ts),
 * PLUS every one-time task whose own scheduledDate is exactly this
 * date (already fully date-specific by construction -- "adding a
 * different task" or "adding a break/ARC directly" to just today is
 * simply creating one of these, never a new concept).
 *
 * Deliberately a DIFFERENT module from arc/todaySchedule.ts: that one
 * buckets today's tasks into overdue/current/next/later/unscheduled
 * sections for the existing Today screen, a purpose this task's own
 * spec never asks to change. This module instead answers "what is the
 * EDITABLE plan for date X" as one flat, chronologically ordered list
 * -- the Flexible Daily Routine's own distinct job. Both modules read
 * the exact same Task/TaskOccurrenceCompletion data; neither one
 * supersedes or duplicates the other's own sorting rules.
 */

import type { Task } from "./tasks.ts";
import { formatMinutesToClockTime, parseClockTimeToMinutes } from "./dailyRoutine.ts";
import { isTaskOccurrenceCompleted, type TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { isRecurringOccurrenceVisibleOnDate, resolveEffectiveOccurrence, type TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";
import { resolveGapMinutes, type WeeklyScheduleMode } from "./weeklyScheduleMode.ts";
import { isActiveTaskStillCurrent } from "./todaySchedule.ts";
import type { TaskTimerRun } from "./taskTimer.ts";

export interface DailyPlanEntry {
  task: Task;
  occurrenceDateLocal: string;
  /** "weekly": inherited from a Fixed Weekly Routine recurring task. "oneoff": a one-time task scheduled directly for this date (includes a standalone break/ARC entry, and a task added via "replace"). */
  origin: "weekly" | "oneoff";
  scheduledTime: string | null;
  expectedDurationMinutes: number | null;
  /**
   * Weekly & Daily Routine Redesign task, section 4: true when
   * `scheduledTime` is a fixed anchor applyScheduleMode below must
   * never move (the template's own time, or an explicit per-date
   * edit); false only for a weekly-origin entry whose override was
   * itself last written by the auto-scheduler (see
   * arc/taskOccurrenceOverride.ts's own timeIsManual). A "oneoff" entry
   * is manual exactly when it already has an explicit scheduledTime --
   * one with none is flexible for DISPLAY/ordering purposes only
   * (there is no override record for a oneoff task to safely write a
   * computed time back into without it looking identical to a real
   * manual edit on the next read, which is why resolveAutoScheduleWriteBacks
   * below only ever writes back for "weekly" entries).
   */
  timeIsManual: boolean;
  /** Calendar design task, requirement 5: lets the UI render a visibly different style for a weekly-origin entry whose time/duration/order was changed for this date alone, vs an untouched inherited one. Always false for "oneoff" (it has no template to diverge from). */
  isModifiedForToday: boolean;
  isCompletedToday: boolean;
}

function compareDailyPlanEntries(a: DailyPlanEntry, b: DailyPlanEntry): number {
  // Manual order (if either entry's EFFECTIVE order is set) wins first,
  // since that's an explicit trainee decision about this date's own
  // sequence -- then scheduled time, then creation order for stability.
  const aOrder = a.task.order;
  const bOrder = b.task.order;
  if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
  if (aOrder !== null) return -1;
  if (bOrder !== null) return 1;
  if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
  if (a.scheduledTime) return -1;
  if (b.scheduledTime) return 1;
  return a.task.createdAt.localeCompare(b.task.createdAt);
}

/**
 * dateLocal must be the same local YYYY-MM-DD string as `date` resolves
 * to (same convention every other caller in this codebase already
 * follows, e.g. arc/todaySchedule.ts) -- passed separately rather than
 * re-derived here so every caller shares one single "what day is it"
 * reading, never two clocks disagreeing by a few milliseconds around
 * midnight.
 */
export function resolveDailyPlan(
  tasks: Task[],
  overrides: TaskOccurrenceOverride[],
  completions: TaskOccurrenceCompletion[],
  dateLocal: string,
  date: Date
): DailyPlanEntry[] {
  const entries: DailyPlanEntry[] = [];

  for (const task of tasks) {
    if (task.status === "archived") continue;
    // Smart To-Do List task: a To-Do item (no fixed start time) never
    // enters the chronological Flexible Daily plan at all -- it is
    // resolved only by arc/todoList.ts's own resolveTodoList, never by
    // applyScheduleMode's auto-chaining, which would otherwise place it
    // onto the timeline the moment an earlier entry anchors the cursor.
    if (task.isTodoItem) continue;

    if (task.recurrence.kind === "recurring") {
      if (!isRecurringOccurrenceVisibleOnDate(task, date, dateLocal, overrides)) continue;
      const effective = resolveEffectiveOccurrence(task, dateLocal, overrides);
      entries.push({
        task: { ...task, order: effective.order },
        occurrenceDateLocal: dateLocal,
        origin: "weekly",
        scheduledTime: effective.scheduledTime,
        expectedDurationMinutes: effective.expectedDurationMinutes,
        timeIsManual: effective.timeIsManual,
        isModifiedForToday: effective.isOverridden,
        isCompletedToday: isTaskOccurrenceCompleted(task.id, dateLocal, completions),
      });
      continue;
    }

    // One-time task: visible on the Flexible Daily Routine only for the
    // exact date it's scheduled on (or, for an unscheduled one-time
    // task, never here -- it belongs only on the existing Today
    // screen's own "unscheduled" bucket, not this date-specific plan).
    if (task.scheduledDate !== dateLocal) continue;
    entries.push({
      task,
      occurrenceDateLocal: dateLocal,
      origin: "oneoff",
      scheduledTime: task.scheduledTime,
      expectedDurationMinutes: task.expectedDurationMinutes,
      timeIsManual: task.scheduledTime !== null,
      isModifiedForToday: false,
      isCompletedToday: task.status === "completed",
    });
  }

  return entries.sort(compareDailyPlanEntries);
}

/**
 * Flexible Daily Routine task, "reordering tasks": normalizes the
 * WHOLE day's own resolved plan to sequential order values in its
 * CURRENT displayed order, then swaps the moved entry with its
 * neighbor -- same deterministic approach as arc/weeklyRoutine.ts's
 * own reorderWeeklyTask, generalized to a day's PLAN entries (which mix
 * weekly-origin and one-off tasks) rather than a raw task list.
 * Returns, for every entry that needs its own `order` persisted, which
 * STORAGE PATH the caller must use: a weekly-origin entry's new order
 * goes into its own TaskOccurrenceOverride (never the shared Task
 * record), a one-off entry's new order goes directly onto its Task.
 * null when the move is impossible (already at an edge, or the taskId
 * isn't in this plan at all).
 */
export interface DailyReorderResult {
  taskId: string;
  origin: "weekly" | "oneoff";
  order: number;
}

export function reorderDailyPlanEntry(plan: DailyPlanEntry[], taskId: string, direction: "up" | "down"): DailyReorderResult[] | null {
  const index = plan.findIndex((entry) => entry.task.id === taskId);
  if (index === -1) return null;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= plan.length) return null;
  const normalized = plan.map((entry, position) => ({ taskId: entry.task.id, origin: entry.origin, order: position }));
  [normalized[index].order, normalized[targetIndex].order] = [normalized[targetIndex].order, normalized[index].order];
  return normalized;
}

/**
 * Weekly & Daily Routine Redesign task, section 4: a day's plan, with
 * an EFFECTIVE start/end time computed for every entry -- walked in
 * the plan's own given (already chronologically/order-sorted) order,
 * chaining forward from wherever the previous entry actually ended.
 *
 * - A FIXED entry (timeIsManual=true WITH a scheduledTime -- the
 *   template's own time, or an explicit per-date edit) is NEVER moved
 *   -- "preserve manually fixed task times" -- but it still advances
 *   the running cursor for whatever comes after it, same as any other
 *   entry.
 * - Every OTHER entry (timeIsManual=false, whether or not it happens
 *   to already carry a stale scheduledTime from a PREVIOUS
 *   computation) is placed at the running cursor, or left with no
 *   effective time at all (null) if nothing earlier in the day has
 *   anchored the cursor yet -- there is simply nothing to chain from.
 *   Deciding by timeIsManual rather than by "is scheduledTime set"
 *   matters precisely because a flexible entry's own last-computed
 *   time IS stored (so alarms can read it -- see
 *   resolveAutoScheduleWriteBacks below): recomputation must never
 *   mistake that stored value for a real fixed anchor, or an earlier
 *   change would leave it permanently stuck.
 * - `mode`'s own gap (0 for continuous, the chosen interval for
 *   spaced -- resolveGapMinutes) is added after EVERY entry's own end
 *   before placing the next one, so a flexible entry following a
 *   fixed one still leaves the configured gap, matching section 4's
 *   own "the interval between consecutive tasks" wording (a day-wide
 *   rule, not "between flexible entries only").
 * - `hasConflict` flags a FIXED entry whose own time is earlier than
 *   the cursor left by whatever came before it -- "detect and handle
 *   conflicts with fixed appointments." A flexible entry can never
 *   conflict; it is always placed AT the cursor, never earlier.
 */
export interface ScheduledPlanEntry extends DailyPlanEntry {
  effectiveStartTime: string | null;
  effectiveEndTime: string | null;
  hasConflict: boolean;
}

export function applyScheduleMode(entries: DailyPlanEntry[], mode: WeeklyScheduleMode): ScheduledPlanEntry[] {
  const gapMinutes = resolveGapMinutes(mode);
  let cursor: number | null = null;
  const result: ScheduledPlanEntry[] = [];

  for (const entry of entries) {
    const durationMinutes = entry.expectedDurationMinutes ?? 0;
    let startMinutes: number | null;
    let hasConflict = false;

    if (entry.timeIsManual && entry.scheduledTime !== null) {
      startMinutes = parseClockTimeToMinutes(entry.scheduledTime);
      if (startMinutes !== null && cursor !== null && startMinutes < cursor) hasConflict = true;
    } else {
      // Not a fixed anchor -- re-chained from the running cursor on
      // every call, regardless of whatever scheduledTime a PREVIOUS
      // computation happened to leave stored (never trusted as ground
      // truth once timeIsManual is false, or this would get stuck at a
      // stale position the moment anything earlier in the day shifts).
      startMinutes = cursor;
    }

    const endMinutes: number | null = startMinutes !== null ? startMinutes + durationMinutes : null;
    result.push({
      ...entry,
      effectiveStartTime: startMinutes !== null ? formatMinutesToClockTime(startMinutes) : null,
      effectiveEndTime: endMinutes !== null ? formatMinutesToClockTime(endMinutes) : null,
      hasConflict,
    });
    if (endMinutes !== null) cursor = endMinutes + gapMinutes;
  }

  return result;
}

/**
 * Unified Emotional Check-In and Task Postponement System, section 1
 * ("😄 מעולה -- Next Task"): "find the next relevant actionable task in
 * today's effective Flexible Daily Timetable" -- the first entry, IN
 * THE SAME ORDER this day's plan already displays them, that isn't
 * already completed today and isn't itself a bare calendar entry with
 * nothing to actually start (a break/appointment has no "action" to
 * take). Returns null when every entry is already completed/non-
 * actionable, or the plan is empty -- callers (data/emotionalCheckInRouting.ts)
 * fall back to "no relevant task exists" exactly as the spec requires.
 * Deliberately a pure, read-only lookup over an already-resolved plan
 * -- callers decide what "today" and "effective" mean by how they built
 * `scheduled` (resolveDailyPlan + applyScheduleMode), never re-derived
 * here.
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: superseded for every
 * navigation/suggestion purpose by resolveCurrentTaskState below, which
 * adds the one check this function always lacked -- whether the
 * returned entry's own scheduled window has already passed. Kept
 * as-is (not removed) only because it has its own long-standing,
 * passing tests; every real caller now goes through
 * resolveCurrentTaskState instead.
 */
export function resolveNextActionableTask(scheduled: ScheduledPlanEntry[]): ScheduledPlanEntry | null {
  return scheduled.find((entry) => !entry.isCompletedToday && entry.task.status !== "archived") ?? null;
}

/**
 * Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
 * Management task, requirement 2: exactly resolveNextActionableTask's
 * own filtering, PLUS excluding the currently active task itself (a
 * task already running/paused is never its own "next" task) -- the one
 * source of truth live/ActiveTaskScreen.tsx's Task LIVE and Task
 * Details renders, and the ongoing lock-screen notification, must all
 * read through, never re-derived independently. `activeTaskId` is
 * null-safe (no active task at all -- e.g. the Task Details pre-start
 * screen for a task not yet started -- simply excludes nothing extra).
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: same superseded status
 * as resolveNextActionableTask above, and for the same reason -- see
 * resolveCurrentTaskState.
 */
export function resolveNextScheduledTaskAfter(scheduled: ScheduledPlanEntry[], activeTaskId: string | null): ScheduledPlanEntry | null {
  return scheduled.find((entry) => entry.task.id !== activeTaskId && !entry.isCompletedToday && entry.task.status !== "archived") ?? null;
}

/**
 * Lock-Screen Timer task, requirement 2: true once the entry's own
 * EFFECTIVE start time has already passed "now"'s clock time -- the
 * Next-Task section's own "overdue" indicator (spec: "clearly indicate
 * if the next task's scheduled time has already passed"). An entry
 * with no effective start time at all (never computed/scheduled) is
 * never considered overdue -- there is nothing to be late for.
 */
export function isScheduledPlanEntryOverdue(entry: ScheduledPlanEntry, now: Date): boolean {
  if (entry.effectiveStartTime === null) return false;
  const startMinutes = parseClockTimeToMinutes(entry.effectiveStartTime);
  if (startMinutes === null) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > startMinutes;
}

/**
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: the ONE central
 * "what's current/next right now" decision -- every navigation/
 * suggestion call site that used to call resolveNextActionableTask/
 * resolveNextScheduledTaskAfter (Home's "😄 Next Task", Task LIVE's
 * "next scheduled task" display + lock-screen notification, and ARC
 * LIVE's own action-selection step) now goes through this instead, so
 * there is exactly one place that decides it, never several that can
 * silently drift apart.
 *
 * Bug this replaces (verbatim repro): at 6:40am, a recurring "go to
 * sleep" task scheduled for e.g. 00:30 with no duration was proposed
 * as the thing to do right now, because the two functions above never
 * checked whether an entry's own scheduled window had already passed
 * -- only whether it was "not completed." This function does check:
 * `current` is drawn from either a genuinely still-running task
 * (status "active", confirmed via isActiveTaskStillCurrent's real
 * TaskTimerRun elapsed-time math -- the exact same check
 * arc/todaySchedule.ts's Today screen already relies on, reused here
 * rather than re-implemented) or, when none, the first not-yet-
 * completed entry whose effective window [effectiveStartTime,
 * effectiveEndTime) actually contains `now`. An entry whose window has
 * already fully elapsed (a zero-duration entry's window is just its
 * own start minute) is NEVER promoted to `current` or `next` -- it
 * only ever lands in `overdue`, exactly mirroring
 * arc/todaySchedule.ts's own current/overdue/nextTask split.
 *
 * `next` is the nearest entry whose window hasn't started yet --
 * `scheduled` is already chronologically ordered (resolveDailyPlan +
 * applyScheduleMode), so a plain forward scan is enough; `next` is
 * never drawn from `overdue`. Both `current` and `next` are null when
 * nothing fits -- callers must show an explicit "nothing left today"
 * state rather than falling back to a stale/overdue entry.
 */
export interface CurrentTaskState {
  current: ScheduledPlanEntry | null;
  overdue: ScheduledPlanEntry[];
  next: ScheduledPlanEntry | null;
}

function hasScheduledPlanEntryStarted(entry: ScheduledPlanEntry, nowMinutes: number): boolean {
  if (entry.effectiveStartTime === null) return false;
  const startMinutes = parseClockTimeToMinutes(entry.effectiveStartTime);
  return startMinutes !== null && startMinutes <= nowMinutes;
}

function hasScheduledPlanEntryWindowElapsed(entry: ScheduledPlanEntry, nowMinutes: number): boolean {
  if (entry.effectiveEndTime !== null) {
    const endMinutes = parseClockTimeToMinutes(entry.effectiveEndTime);
    return endMinutes !== null && endMinutes <= nowMinutes;
  }
  if (entry.effectiveStartTime !== null) {
    const startMinutes = parseClockTimeToMinutes(entry.effectiveStartTime);
    return startMinutes !== null && startMinutes < nowMinutes;
  }
  return false;
}

export function resolveCurrentTaskState(
  scheduled: ScheduledPlanEntry[],
  now: Date,
  activeRun: TaskTimerRun | null = null,
  excludeTaskId: string | null = null
): CurrentTaskState {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const candidates = scheduled.filter((entry) => entry.task.id !== excludeTaskId && !entry.isCompletedToday && entry.task.status !== "archived");

  const activeEntry = candidates.find((entry) => entry.task.status === "active" && isActiveTaskStillCurrent(entry.task, now, activeRun)) ?? null;

  const current =
    activeEntry ?? candidates.find((entry) => hasScheduledPlanEntryStarted(entry, nowMinutes) && !hasScheduledPlanEntryWindowElapsed(entry, nowMinutes)) ?? null;

  const overdue = candidates.filter(
    (entry) => entry !== current && hasScheduledPlanEntryStarted(entry, nowMinutes) && hasScheduledPlanEntryWindowElapsed(entry, nowMinutes)
  );
  const next = candidates.find((entry) => entry !== current && !hasScheduledPlanEntryStarted(entry, nowMinutes)) ?? null;

  return { current, overdue, next };
}

/**
 * Task LIVE / To-Do List / Flexible Day sync fix: the ONE "what to jump
 * to or auto-start right now" pick for every navigation/suggestion call
 * site that used to fall back through arc/todaySchedule.ts's own
 * resolveMostUrgentEntry/resolveNextTaskEntry (live/ActiveTaskScreen.tsx's
 * Next Task/Skip Task, live/PersistentTaskControls.tsx's "התחל משימה",
 * live/PostTaskRewardScreen.tsx's post-completion auto-advance,
 * live/ManifestMeditationScreen.tsx's "today's action" suggestion).
 *
 * That old engine independently recomputed "what's scheduled today"
 * straight from Task's own scheduledDate/scheduledTime -- never
 * excluding isTodoItem tasks (a To-Do item not yet placed into the
 * flexible day could surface as "next"), and never reading the chained
 * effectiveStartTime/effectiveEndTime applyScheduleMode computes (so its
 * own idea of "urgent" could disagree with what the Flexible Day screen
 * itself shows). This picks exclusively from `state`, which the caller
 * must have already built from THIS date's real, resolved flexible-day
 * plan (resolveDailyPlan + applyScheduleMode + resolveCurrentTaskState)
 * -- so a task removed from the flexible day, or never scheduled into it
 * in the first place, can never be chosen here, by construction.
 *
 * Mirrors resolveMostUrgentEntry's own fallback order exactly (current,
 * else the earliest overdue entry, else the next upcoming one) -- same
 * semantics trainees already know from that screen, just sourced from
 * the one real plan instead of a second, independent calculation.
 */
export function resolveMostUrgentScheduledEntry(state: CurrentTaskState): ScheduledPlanEntry | null {
  return state.current ?? state.overdue[0] ?? state.next ?? null;
}

/**
 * Morning Flow Simplification task, section 3: "a suitable schedule"
 * for today means at least this many effectively-scheduled entries --
 * matching the spec's own "recommendation to select at least three
 * tasks" for the quick-planning prompt. Below this threshold,
 * live/DailyStartupSequenceOverlay.tsx's own planning-decision step
 * offers quick planning (with this same recommendation) instead of
 * the "my plan is ready" button.
 */
export const MIN_SUITABLE_DAILY_TASK_COUNT = 3;

/** Pure, read-only check over an already-resolved `scheduled` plan -- never re-derives what "today" or "effective" mean itself. */
export function isDailyScheduleSuitable(scheduled: ScheduledPlanEntry[]): boolean {
  return scheduled.length >= MIN_SUITABLE_DAILY_TASK_COUNT;
}

/**
 * Weekly & Daily Routine Redesign task, section 8: makes a flexible
 * weekly-origin entry's own computed effective time ALARM-VISIBLE, by
 * writing it back into that date's TaskOccurrenceOverride with
 * timeIsManual=false -- data/taskAlarm.ts's own reconcileTaskAlarms
 * already resolves every alarm through resolveEffectiveOccurrence, so
 * this is the ONE, minimal integration point that makes Task LIVE/
 * alarms honor the auto-scheduled time with ZERO changes to the alarm
 * engine itself.
 *
 * Deliberately skips: any entry that is already timeIsManual (never
 * overwrite a trainee's own fixed choice), any entry whose effective
 * time already matches what's stored (no redundant write), any entry
 * with no effective time at all (nothing computed yet), and every
 * "oneoff" entry (see DailyPlanEntry.timeIsManual's own doc on why a
 * one-time task's computed time is never silently written back onto
 * the Task record itself).
 */
export interface AutoScheduleWriteBack {
  taskId: string;
  occurrenceDateLocal: string;
  scheduledTime: string;
}

export function resolveAutoScheduleWriteBacks(scheduled: ScheduledPlanEntry[]): AutoScheduleWriteBack[] {
  const writeBacks: AutoScheduleWriteBack[] = [];
  for (const entry of scheduled) {
    if (entry.origin !== "weekly") continue;
    if (entry.timeIsManual) continue;
    if (entry.effectiveStartTime === null) continue;
    if (entry.scheduledTime === entry.effectiveStartTime) continue;
    writeBacks.push({ taskId: entry.task.id, occurrenceDateLocal: entry.occurrenceDateLocal, scheduledTime: entry.effectiveStartTime });
  }
  return writeBacks;
}

/**
 * ARCHI -- Unified Final Specification task, section 4 ("TEMPORARY
 * ACTIONS BEFORE THE NEXT SCHEDULED TASK") / Smart To-Do List task:
 * the time remaining until the next real, not-yet-completed scheduled
 * entry today -- null when none exists at all ("if no upcoming task
 * exists, allow choosing duration without a schedule-based limit"),
 * otherwise clamped to zero (never negative) when that entry's own
 * effective start has already passed. A pure function over an
 * already-resolved plan, exactly like every other arc/dailyPlan.ts
 * reader -- never re-derives "today" or "effective" itself.
 * `excludeTaskId` drops the caller's own (possibly non-existent/
 * standalone) taskId, same null-safe exclusion resolveCurrentTaskState
 * already takes.
 *
 * Promoted here (from a module-local function of the same name/
 * signature that used to live only in live/NewArcLiveScreen.tsx) so
 * arc/todoList.ts's own smart-fit recommendation engine can share the
 * EXACT same "how much free time is there" computation -- never a
 * second, competing one.
 */
export function resolveFreeMinutesUntilNextTask(scheduled: ScheduledPlanEntry[], now: Date, excludeTaskId: string | null): number | null {
  const { next } = resolveCurrentTaskState(scheduled, now, null, excludeTaskId);
  if (!next || next.effectiveStartTime === null) return null;
  const startMinutes = parseClockTimeToMinutes(next.effectiveStartTime);
  if (startMinutes === null) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, startMinutes - nowMinutes);
}

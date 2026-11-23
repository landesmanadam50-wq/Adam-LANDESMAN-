/**
 * arc/todoList.ts
 *
 * Smart To-Do List task: resolves today's To-Do items (isTodoItem ===
 * true one-off Tasks -- see arc/tasks.ts's own doc on why a To-Do item
 * is a one-off task, never a parallel entity or a recurring one) into
 * a priority-ordered list, and layers a "what To-Do item fits the
 * currently free time" recommendation on top of arc/dailyPlan.ts's own
 * resolveCurrentTaskState -- WITHOUT changing that function at all.
 *
 * Deliberately a separate, sibling module from arc/dailyPlan.ts (same
 * convention as arc/taskOccurrenceOverride.ts/arc/weeklyScheduleMode.ts/
 * arc/todaySchedule.ts, each its own small file for its own distinct
 * concern): a To-Do item never enters resolveDailyPlan's own
 * chronological DailyPlanEntry[]/ScheduledPlanEntry[] pipeline at all
 * (resolveDailyPlan's own `if (task.isTodoItem) continue;` guarantees
 * this), so this module owns resolving it from scratch.
 *
 * A To-Do item, being a one-off task, tracks its own completion exactly
 * like any other one-off task already does elsewhere in this codebase
 * (resolveDailyPlan's own "oneoff" branch: `isCompletedToday: task.status
 * === "completed"`) -- never through TaskOccurrenceCompletion, which
 * exists only for a RECURRING task's per-occurrence history.
 */

import type { Task } from "./tasks.ts";
import { resolveCurrentTaskState, resolveFreeMinutesUntilNextTask, type CurrentTaskState, type ScheduledPlanEntry } from "./dailyPlan.ts";
import { parseClockTimeToMinutes } from "./dailyRoutine.ts";
import type { TaskTimerRun } from "./taskTimer.ts";

export interface TodoPlanEntry {
  task: Task;
  occurrenceDateLocal: string;
  /** task.expectedDurationMinutes minus task.todoCompletedMinutes (floored at 0), or null when no duration estimate was ever set -- a To-Do item with no estimate is treated as fitting any free window (see resolveRecommendedTodoAction below), same "no estimate -> no limit" convention isScheduledPlanEntryOverdue's own sibling functions already use for "no effective time at all." */
  remainingMinutes: number | null;
}

/**
 * Today's To-Do items, unsorted (chronological-irrelevant by definition
 * -- see resolveEffectiveTodoOrder below for the actual priority order
 * every UI/engine consumer should read). Excludes archived and
 * already-completed items, exactly like every other "today's actionable
 * items" reader in this codebase.
 */
export function resolveTodoList(tasks: Task[], dateLocal: string): TodoPlanEntry[] {
  return tasks
    .filter((task) => task.isTodoItem && task.scheduledDate === dateLocal && task.status !== "archived" && task.status !== "completed")
    .map((task) => ({
      task,
      occurrenceDateLocal: dateLocal,
      remainingMinutes: task.expectedDurationMinutes === null ? null : Math.max(0, task.expectedDurationMinutes - task.todoCompletedMinutes),
    }));
}

/**
 * Smart To-Do List task, section 2: urgency (10 -> 1) FIRST, importance
 * (10 -> 1) only as a tiebreaker WITHIN equal urgency -- NEVER combined
 * into one score (the user's own explicit, non-negotiable requirement).
 * Ties in both fall back to original insertion order (createdAt), same
 * stability convention arc/dailyPlan.ts's own compareDailyPlanEntries
 * already uses for its own final tiebreak.
 */
export function compareTodoPriority(a: TodoPlanEntry, b: TodoPlanEntry): number {
  if (a.task.todoUrgency !== b.task.todoUrgency) return b.task.todoUrgency - a.task.todoUrgency;
  if (a.task.todoImportance !== b.task.todoImportance) return b.task.todoImportance - a.task.todoImportance;
  return a.task.createdAt.localeCompare(b.task.createdAt);
}

/**
 * Smart To-Do List task, section 3: manual todoOrder (if ANY entry in
 * the list has one set) wins first, mirroring arc/dailyPlan.ts's own
 * compareDailyPlanEntries "manual order wins first, else fall back"
 * rule exactly -- else compareTodoPriority decides the whole list.
 * Editing todoUrgency/todoImportance never touches todoOrder (so a
 * rating edit can never silently reshuffle a manually-set order); only
 * resolveResortByRating below clears it.
 */
export function resolveEffectiveTodoOrder(entries: TodoPlanEntry[]): TodoPlanEntry[] {
  const hasManualOrder = entries.some((entry) => entry.task.todoOrder !== null);
  if (!hasManualOrder) return [...entries].sort(compareTodoPriority);
  return [...entries].sort((a, b) => {
    const aOrder = a.task.todoOrder;
    const bOrder = b.task.todoOrder;
    if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
    if (aOrder !== null) return -1;
    if (bOrder !== null) return 1;
    return compareTodoPriority(a, b);
  });
}

/**
 * Smart To-Do List task, section 3: up/down swap over the list's
 * CURRENT effective order -- exact normalize-then-swap convention as
 * arc/dailyPlan.ts's own reorderDailyPlanEntry / arc/weeklyRoutine.ts's
 * own reorderWeeklyTask. Returns every entry's own new todoOrder for
 * the caller to persist via upsertTask (never an override record -- a
 * To-Do item's own manual order lives directly on the Task, same as
 * arc/dailyPlan.ts's Task.order). null when the move is impossible
 * (already at an edge, or the taskId isn't in this list at all).
 */
export function reorderTodoEntry(entries: TodoPlanEntry[], taskId: string, direction: "up" | "down"): { taskId: string; todoOrder: number }[] | null {
  const ordered = resolveEffectiveTodoOrder(entries);
  const index = ordered.findIndex((entry) => entry.task.id === taskId);
  if (index === -1) return null;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= ordered.length) return null;
  const normalized = ordered.map((entry, position) => ({ taskId: entry.task.id, todoOrder: position }));
  [normalized[index].todoOrder, normalized[targetIndex].todoOrder] = [normalized[targetIndex].todoOrder, normalized[index].todoOrder];
  return normalized;
}

/**
 * Smart To-Do List task, section 3 ("סדר מחדש לפי דירוג" / "re-sort by
 * rating"): returns every entry's taskId so the caller clears todoOrder
 * back to null for all of them via upsertTask -- the list then falls
 * through to compareTodoPriority on its own (resolveEffectiveTodoOrder
 * above), exactly as if none had ever been manually ordered. Never
 * deletes or recreates any task.
 */
export function resolveResortByRating(entries: TodoPlanEntry[]): { taskId: string }[] {
  return entries.map((entry) => ({ taskId: entry.task.id }));
}

export type TodoSuggestionReason = "fits" | "split_suggested" | "top_priority_does_not_fit" | "none_available" | "no_todo_items";

export interface TodoSuggestion {
  entry: TodoPlanEntry | null;
  reason: TodoSuggestionReason;
  /** The full remainingMinutes when reason==="fits", the clamped split amount when reason==="split_suggested", else null. */
  suggestedDurationMinutes: number | null;
  isSplit: boolean;
}

/**
 * Smart To-Do List task, section 5 (the smart-fit algorithm): walks the
 * PRIORITY-ordered list (resolveEffectiveTodoOrder, never re-sorted
 * here); the first entry whose remainingMinutes fits within
 * freeMinutes (or freeMinutes===null, meaning "nothing scheduled later
 * today -- unlimited", or remainingMinutes===null, meaning "no
 * estimate -- assume it fits") wins with reason "fits". If the very
 * TOP-priority entry doesn't fit: offer a split of THAT SAME entry
 * (section 6 -- "the recommendation always proposes splitting the
 * top-priority task first, never silently skips to a different one")
 * when it allows splitting and there is at least one free minute to
 * work with; otherwise fall through to the next entry in priority
 * order that DOES fit; if truly nothing fits, reason
 * "top_priority_does_not_fit" with suggestedDurationMinutes null (the
 * UI shows this, offers no auto-start). Pure and deterministic.
 */
export function resolveRecommendedTodoAction(entries: TodoPlanEntry[], freeMinutes: number | null): TodoSuggestion {
  if (entries.length === 0) return { entry: null, reason: "no_todo_items", suggestedDurationMinutes: null, isSplit: false };

  const ordered = resolveEffectiveTodoOrder(entries);
  const fits = (entry: TodoPlanEntry): boolean => entry.remainingMinutes === null || freeMinutes === null || entry.remainingMinutes <= freeMinutes;

  const topEntry = ordered[0];
  if (fits(topEntry)) return { entry: topEntry, reason: "fits", suggestedDurationMinutes: topEntry.remainingMinutes, isSplit: false };

  if (topEntry.task.todoIsSplittable && freeMinutes !== null && freeMinutes > 0) {
    const remaining = topEntry.remainingMinutes ?? freeMinutes;
    return { entry: topEntry, reason: "split_suggested", suggestedDurationMinutes: Math.min(remaining, freeMinutes), isSplit: true };
  }

  const nextFitting = ordered.slice(1).find(fits) ?? null;
  if (nextFitting) return { entry: nextFitting, reason: "fits", suggestedDurationMinutes: nextFitting.remainingMinutes, isSplit: false };

  return { entry: topEntry, reason: "top_priority_does_not_fit", suggestedDurationMinutes: null, isSplit: false };
}

/**
 * Smart To-Do List task, section 9 (ARC LIVE action-selection sync):
 * THE wrapper point -- calls arc/dailyPlan.ts's own resolveCurrentTaskState
 * completely UNCHANGED, and only when it returns no `current` (a due
 * scheduled task always wins over any To-Do suggestion) does it compute
 * the free time via resolveFreeMinutesUntilNextTask and layer
 * resolveRecommendedTodoAction on top. Every consumer that needs "what
 * should happen right now, To-Do included" reads through THIS function;
 * resolveCurrentTaskState itself stays the one function every OTHER
 * existing consumer (that doesn't need To-Do awareness) keeps calling
 * directly -- never two competing decisions.
 */
export function resolveCurrentTaskStateWithTodoSuggestion(
  scheduled: ScheduledPlanEntry[],
  todoEntries: TodoPlanEntry[],
  now: Date,
  activeRun: TaskTimerRun | null,
  excludeTaskId: string | null
): CurrentTaskState & { todoSuggestion: TodoSuggestion | null } {
  const state = resolveCurrentTaskState(scheduled, now, activeRun, excludeTaskId);
  if (state.current) return { ...state, todoSuggestion: null };
  const freeMinutes = resolveFreeMinutesUntilNextTask(scheduled, now, excludeTaskId);
  return { ...state, todoSuggestion: resolveRecommendedTodoAction(todoEntries, freeMinutes) };
}

export type WovenDayItem = { kind: "scheduled"; entry: ScheduledPlanEntry } | { kind: "todo"; entry: TodoPlanEntry };

/**
 * "אני רוצה שתהיה אפשרות להעביר את המשימה מה-To-Do ליסט ליום הגמיש בין
 * המשימות הקבועות": weaves today's To-Do entries INTO the gaps between
 * the day's own fixed/scheduled entries, for a single screen that shows
 * both together in their visual day-order -- a pure DISPLAY merge, same
 * boundary resolveRecommendedTodoAction above already draws ("a to-do's
 * duration genuinely isn't known until start time" -- see this task's
 * plan, decision 5), never a second scheduling engine: it reuses the
 * EXACT same remainingMinutes/"fits the free window" rule
 * resolveRecommendedTodoAction already uses, just applied once per gap
 * instead of only to "now".
 *
 * Walks `scheduled` in its own existing chronological order
 * (effectiveStartTime/effectiveEndTime, already computed by
 * applyScheduleMode -- never re-derived here); after each entry, greedily
 * places every not-yet-placed To-Do entry (priority order via
 * resolveEffectiveTodoOrder) whose remainingMinutes fits that gap. A gap
 * whose bounds aren't both known gets 0 free minutes (conservative: an
 * item with an estimate never gets front-loaded into an uncertain slot),
 * EXCEPT the always-open trailing gap after the last scheduled entry (or
 * the whole day, when there are no scheduled entries at all), which is
 * unlimited -- so an item that fits nowhere earlier is still always
 * shown, never silently dropped.
 */
export function resolveWovenDaySections(scheduled: ScheduledPlanEntry[], todoEntries: TodoPlanEntry[]): WovenDayItem[] {
  const orderedTodo = resolveEffectiveTodoOrder(todoEntries);
  const placed = new Set<string>();
  const fits = (entry: TodoPlanEntry, freeMinutes: number | null): boolean =>
    entry.remainingMinutes === null || freeMinutes === null || entry.remainingMinutes <= freeMinutes;

  const result: WovenDayItem[] = [];
  function placeFittingInto(freeMinutes: number | null): void {
    for (const entry of orderedTodo) {
      if (placed.has(entry.task.id) || !fits(entry, freeMinutes)) continue;
      result.push({ kind: "todo", entry });
      placed.add(entry.task.id);
    }
  }
  function gapMinutesAfter(current: ScheduledPlanEntry, next: ScheduledPlanEntry | null): number | null {
    if (next === null) return null;
    if (current.effectiveEndTime === null || next.effectiveStartTime === null) return 0;
    const endMinutes = parseClockTimeToMinutes(current.effectiveEndTime);
    const startMinutes = parseClockTimeToMinutes(next.effectiveStartTime);
    if (endMinutes === null || startMinutes === null) return 0;
    return Math.max(0, startMinutes - endMinutes);
  }

  scheduled.forEach((current, index) => {
    result.push({ kind: "scheduled", entry: current });
    placeFittingInto(gapMinutesAfter(current, scheduled[index + 1] ?? null));
  });
  placeFittingInto(null);

  return result;
}

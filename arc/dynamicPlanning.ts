/**
 * arc/dynamicPlanning.ts
 *
 * ARCHI -- Rolling Dynamic Planning task: decides, for a FIXED entry in
 * today's resolved plan, whether the gap right after it still needs the
 * trainee's attention -- either because nothing has been queued into it
 * yet ("plan_gap": spec section 1 -- let the trainee add or move To-Do
 * items into the gap, reorder them, and set the first one's own start
 * time/duration) or because a To-Do item is ALREADY woven into it (by
 * arc/todoList.ts's own resolveWovenDaySections -- automatically by its
 * greedy fit, or manually via todoPinnedAfterTaskId) but hasn't had its
 * own start time/duration explicitly confirmed yet ("confirm_next_todo":
 * spec sections 2+4).
 *
 * "Confirming" IS the same action as "converting the To-Do into a
 * fixed, daily-only anchor" (spec section 3): a single Task field edit
 * -- isTodoItem:false, plus a real scheduledTime/expectedDurationMinutes
 * -- which is already, by construction, a full "oneoff" fixed entry as
 * far as arc/dailyPlan.ts's own resolveDailyPlan is concerned (a To-Do
 * item is always recurrence.kind "once", confirmed in arc/taskDraft.ts,
 * so this never touches TaskOccurrenceOverride or the weekly template).
 * Every existing capability a fixed task already has (notifications,
 * Task LIVE, the floating timer, ARC links) carries through automatically,
 * since it is the exact same Task record, never a second one.
 *
 * This module deliberately needs no "already confirmed" flag of its
 * own: the instant a gap's own candidate To-Do is confirmed, it stops
 * being "a To-Do woven into a gap" and becomes a real ScheduledPlanEntry
 * with its own gap after IT -- so resolveDynamicPlanningAction simply
 * stops finding a candidate for that pairing on the next call, and the
 * exact same function, re-run against the now-updated plan, already
 * asks about the newly-created fixed task's own next gap instead. This
 * is what gives spec section 4's "rolling, one task planned ahead at a
 * time" chain for free -- nothing here is specific to "the first"
 * conversion vs. "the second" one.
 *
 * "Never show a useless planning notification when no gap exists" is
 * `window === null || window.durationMinutes === 0` below -- the exact
 * same zero-vs-null distinction arc/freeTimeWindow.ts's own
 * FreeTimeWindow already encodes (null = open-ended/unlimited, a REAL
 * gap; 0 = the next fixed entry follows immediately, no gap at all).
 * Dismissal/"skip" tracking is deliberately NOT this module's job --
 * same layering as data/freeTimeWindowNotification.ts's own pure
 * resolveFreeTimeWindows + a separate dismissal filter applied by the
 * caller: data/dynamicPlanningNotification.ts reuses
 * arc/freeTimeWindowDismissal.ts's existing (dateLocal, precedingTaskId,
 * followingTaskId)-keyed dismissal list directly (the window identity is
 * literally the same pair), rather than building a second, parallel
 * dismissal mechanism for what is, for dedup purposes, the exact same
 * window.
 */

import type { ScheduledPlanEntry } from "./dailyPlan.ts";
import { resolveFreeTimeWindowKey, resolveFreeTimeWindows } from "./freeTimeWindow.ts";
import type { FreeTimeWindow } from "./freeTimeWindow.ts";
import { resolveWovenDaySections } from "./todoList.ts";
import type { TodoPlanEntry, WovenDayItem } from "./todoList.ts";

export type DynamicPlanningAction = "none" | "plan_gap" | "confirm_next_todo";

export interface DynamicPlanningDecision {
  action: DynamicPlanningAction;
  /** The fixed entry whose own upcoming gap this decision is about. */
  precedingEntry: ScheduledPlanEntry;
  /** Set whenever action !== "none" -- the gap itself, for display and for resolveDynamicPlanningKey below. */
  window: FreeTimeWindow | null;
  /** The To-Do already woven into the gap, only when action === "confirm_next_todo". */
  candidate: TodoPlanEntry | null;
}

/**
 * The woven item immediately after `precedingTaskId`'s own "scheduled"
 * item in the woven result -- null when nothing follows it there, or
 * when the very next woven item is itself another fixed/scheduled entry
 * (nothing has been woven into this particular gap).
 */
function resolveWovenCandidateAfter(woven: WovenDayItem[], precedingTaskId: string): TodoPlanEntry | null {
  const index = woven.findIndex((item) => item.kind === "scheduled" && item.entry.task.id === precedingTaskId);
  if (index === -1) return null;
  const next = woven[index + 1];
  if (!next || next.kind !== "todo") return null;
  return next.entry;
}

/**
 * The one decision function for a single fixed entry. `excludeTaskId`
 * is the same null-safe exclusion every other arc/dailyPlan.ts-adjacent
 * resolver already takes (e.g. resolveFreeTimeWindows itself) -- lets a
 * caller ignore the gap tied to a task it is currently editing
 * elsewhere.
 */
export function resolveDynamicPlanningAction(
  scheduled: ScheduledPlanEntry[],
  todoEntries: TodoPlanEntry[],
  precedingEntry: ScheduledPlanEntry,
  excludeTaskId: string | null = null
): DynamicPlanningDecision {
  const windows = resolveFreeTimeWindows(scheduled, excludeTaskId);
  const window = windows.find((candidate) => candidate.precedingTaskId === precedingEntry.task.id) ?? null;
  if (!window || window.durationMinutes === 0) {
    return { action: "none", precedingEntry, window: null, candidate: null };
  }

  const woven = resolveWovenDaySections(scheduled, todoEntries);
  const candidate = resolveWovenCandidateAfter(woven, precedingEntry.task.id);
  if (candidate) return { action: "confirm_next_todo", precedingEntry, window, candidate };
  return { action: "plan_gap", precedingEntry, window, candidate: null };
}

/**
 * Every fixed entry in today's plan that currently needs attention, in
 * the plan's own chronological order -- used by the 5-minutes-before arm
 * (data/dynamicPlanningNotification.ts) to find the soonest one, and by
 * tests to assert the whole day's state in one call.
 */
export function resolveDynamicPlanningActions(scheduled: ScheduledPlanEntry[], todoEntries: TodoPlanEntry[]): DynamicPlanningDecision[] {
  return scheduled.map((entry) => resolveDynamicPlanningAction(scheduled, todoEntries, entry, null)).filter((decision) => decision.action !== "none");
}

/**
 * The same window-identity convention arc/freeTimeWindow.ts's own
 * resolveFreeTimeWindowKey already uses (the two bounding task ids, not
 * raw minutes) -- deliberately IDENTICAL, so
 * arc/freeTimeWindowDismissal.ts's existing dismissal list can be reused
 * verbatim for this feature's own "skip" action, never a second,
 * parallel dismissal mechanism for what is the same window.
 */
export function resolveDynamicPlanningKey(dateLocal: string, decision: Pick<DynamicPlanningDecision, "window">): string | null {
  if (!decision.window) return null;
  return resolveFreeTimeWindowKey(dateLocal, decision.window);
}

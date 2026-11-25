/**
 * arc/freeTimeWindow.ts
 *
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task: the one
 * generalized, exported "list every free window in today's Flexible Daily
 * plan" module -- the single source of truth arc/todoList.ts's own
 * un-exported local `gapMinutesAfter` (resolveWovenDaySections) never was.
 * Shared by the free-time-window notification (data/freeTimeWindowNotification.ts)
 * and the task-not-started notification's move-suggestion
 * (data/taskNotStartedNotification.ts) -- never duplicated between them.
 *
 * Deliberately a sibling module to arc/dailyPlan.ts (same convention as
 * arc/todoList.ts/arc/weeklyScheduleMode.ts), reading its ScheduledPlanEntry[]
 * completely unchanged.
 *
 * The filtering here (exclude completed/archived/excludeTaskId) is an exact
 * copy of resolveCurrentTaskState's own `candidates` derivation
 * (arc/dailyPlan.ts) -- load-bearing, not incidental: a completed task's own
 * slot must stop occupying time the instant it's done (an early finish is
 * exactly what turns that slot into a free window), the same instant
 * resolveCurrentTaskState's own `current` would already read null there.
 * Without this exact mirroring, the two functions could disagree about
 * whether "now" sits inside a real window.
 */

import type { ScheduledPlanEntry } from "./dailyPlan.ts";
import { parseClockTimeToMinutes } from "./dailyRoutine.ts";

export interface FreeTimeWindow {
  startMinutes: number;
  /** null = open-ended trailing window (after the last entry, or the whole day when nothing is scheduled). */
  endMinutes: number | null;
  /** The entry ending right at this window's start; null when the window is before the day's first entry. */
  precedingTaskId: string | null;
  /** The entry starting right at this window's end; null when the window is the open trailing one. */
  followingTaskId: string | null;
  /** endMinutes - startMinutes, or null when open-ended (treated as "unlimited" by every duration-fit check). */
  durationMinutes: number | null;
}

function resolveCandidates(scheduled: ScheduledPlanEntry[], excludeTaskId: string | null): ScheduledPlanEntry[] {
  return scheduled.filter((entry) => entry.task.id !== excludeTaskId && !entry.isCompletedToday && entry.task.status !== "archived");
}

/**
 * One pass over today's real (filtered) entries, chronologically ordered by
 * applyScheduleMode already -- producing a leading window (before the first
 * entry with a resolved effectiveStartTime), one window between every
 * consecutive pair, and a trailing open-ended window after the last entry
 * (or the single whole-day window when there are no candidates at all). An
 * entry with an unresolved effectiveStartTime/effectiveEndTime is skipped
 * for window-boundary purposes, same as gapMinutesAfter's own rule -- never
 * invents a window from an unknown bound.
 */
export function resolveFreeTimeWindows(scheduled: ScheduledPlanEntry[], excludeTaskId: string | null = null): FreeTimeWindow[] {
  const candidates = resolveCandidates(scheduled, excludeTaskId).filter((entry) => entry.effectiveStartTime !== null);
  const windows: FreeTimeWindow[] = [];

  if (candidates.length === 0) {
    windows.push({ startMinutes: 0, endMinutes: null, precedingTaskId: null, followingTaskId: null, durationMinutes: null });
    return windows;
  }

  const first = candidates[0];
  const firstStart = parseClockTimeToMinutes(first.effectiveStartTime!);
  if (firstStart !== null && firstStart > 0) {
    windows.push({ startMinutes: 0, endMinutes: firstStart, precedingTaskId: null, followingTaskId: first.task.id, durationMinutes: firstStart });
  }

  for (let i = 0; i < candidates.length; i++) {
    const current = candidates[i];
    const next = candidates[i + 1] ?? null;
    const endMinutes = current.effectiveEndTime !== null ? parseClockTimeToMinutes(current.effectiveEndTime) : null;
    if (endMinutes === null) continue;

    if (next === null) {
      windows.push({ startMinutes: endMinutes, endMinutes: null, precedingTaskId: current.task.id, followingTaskId: null, durationMinutes: null });
      continue;
    }
    const nextStart = next.effectiveStartTime !== null ? parseClockTimeToMinutes(next.effectiveStartTime) : null;
    if (nextStart === null) continue;
    windows.push({
      startMinutes: endMinutes,
      endMinutes: nextStart,
      precedingTaskId: current.task.id,
      followingTaskId: next.task.id,
      durationMinutes: Math.max(0, nextStart - endMinutes),
    });
  }

  return windows;
}

/** The window whose [startMinutes, endMinutes) contains nowMinutes -- by construction non-null in exactly the cases resolveCurrentTaskState(...).current === null already is. An entry's own start minute belongs to that entry, never to the window before it. */
export function resolveFreeTimeWindowAt(windows: FreeTimeWindow[], nowMinutes: number): FreeTimeWindow | null {
  return (
    windows.find((window) => {
      if (nowMinutes < window.startMinutes) return false;
      if (window.endMinutes === null) return true;
      return nowMinutes < window.endMinutes;
    }) ?? null
  );
}

/** Every window starting at/after afterMinutes, in chronological order, filtered to windows with enough capacity (durationMinutes === null means unlimited/open-ended, always keeps). */
export function resolveFreeTimeWindowsAfter(windows: FreeTimeWindow[], afterMinutes: number, minDurationMinutes: number | null): FreeTimeWindow[] {
  return windows
    .filter((window) => window.startMinutes >= afterMinutes)
    .filter((window) => window.durationMinutes === null || minDurationMinutes === null || window.durationMinutes >= minDurationMinutes);
}

/**
 * Identity is the two bounding tasks, not raw minutes -- a window that
 * reflows by a few minutes after a scheduling change is still "the same
 * window" for decline purposes (arc/freeTimeWindowDismissal.ts), while a
 * genuinely new neighbor (a task inserted into the gap) is correctly
 * treated as a new, askable-again window.
 */
export function resolveFreeTimeWindowKey(dateLocal: string, window: Pick<FreeTimeWindow, "precedingTaskId" | "followingTaskId">): string {
  return `${dateLocal}|${window.precedingTaskId ?? "__start__"}|${window.followingTaskId ?? "__end__"}`;
}

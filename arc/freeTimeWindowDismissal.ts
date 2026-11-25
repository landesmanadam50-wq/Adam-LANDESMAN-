/**
 * arc/freeTimeWindowDismissal.ts
 *
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task, rule
 * "אין להציג שוב הצעות שהמשתמש כבר דחה באותו חלון זמן" (never re-offer a
 * window the user already said wasn't free): a small, upsert-by-key record
 * of "the user declined this exact window today" -- no "don't show again"
 * precedent existed anywhere in this app before this task (confirmed by
 * repo-wide search); of the two closest shapes, the time-boxed snooze
 * (data/taskAlarm.ts) is the wrong fit (a decline must last the rest of the
 * day, not re-fire minutes later), so this instead mirrors
 * arc/positiveMemorySelectionHistory.ts's own keyed-upsert idiom exactly.
 *
 * Pure data model + logic only, no AsyncStorage/navigation/React -- the
 * storage layer (data/storage.ts) just loads/saves this array verbatim.
 */

import type { FreeTimeWindow } from "./freeTimeWindow.ts";

export interface FreeTimeWindowDismissal {
  dateLocal: string;
  precedingTaskId: string | null;
  followingTaskId: string | null;
  dismissedAt: string;
}

/** Upserts by (dateLocal, precedingTaskId, followingTaskId) -- a second decline for the same window replaces its timestamp, never duplicates. */
export function recordFreeTimeWindowDismissal(
  dismissals: FreeTimeWindowDismissal[],
  dateLocal: string,
  window: Pick<FreeTimeWindow, "precedingTaskId" | "followingTaskId">,
  now: string
): FreeTimeWindowDismissal[] {
  const index = dismissals.findIndex(
    (entry) => entry.dateLocal === dateLocal && entry.precedingTaskId === window.precedingTaskId && entry.followingTaskId === window.followingTaskId
  );
  const entry: FreeTimeWindowDismissal = { dateLocal, precedingTaskId: window.precedingTaskId, followingTaskId: window.followingTaskId, dismissedAt: now };
  if (index === -1) return [...dismissals, entry];
  const next = [...dismissals];
  next[index] = entry;
  return next;
}

/** True only for an exact (dateLocal, precedingTaskId, followingTaskId) match -- a window whose neighbor changed (a task inserted into the gap, or the bounding task itself moved) is a genuinely new window and was never declined. */
export function isFreeTimeWindowDismissed(
  dismissals: FreeTimeWindowDismissal[],
  dateLocal: string,
  window: Pick<FreeTimeWindow, "precedingTaskId" | "followingTaskId">
): boolean {
  return dismissals.some(
    (entry) => entry.dateLocal === dateLocal && entry.precedingTaskId === window.precedingTaskId && entry.followingTaskId === window.followingTaskId
  );
}

/** Keeps only today's entries -- there is no cross-day meaning to a "not free" decision, so this is purely self-cleaning (unlike an append-only history). */
export function pruneFreeTimeWindowDismissals(dismissals: FreeTimeWindowDismissal[], todayLocal: string): FreeTimeWindowDismissal[] {
  return dismissals.filter((entry) => entry.dateLocal === todayLocal);
}

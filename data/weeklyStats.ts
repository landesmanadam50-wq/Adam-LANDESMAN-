/**
 * data/weeklyStats.ts
 *
 * Pure aggregation of SessionLogEntry[] into per-ISO-week counts, for
 * the stats screen. No React, no storage — kept testable with
 * node --test the same way engine/ and live/ are.
 */

import type { SessionLogEntry } from "./sessionLog.ts";

export interface WeekStat {
  weekKey: string; // e.g. "2026-W35"
  sessions: number;
  successes: number;
  falls: number;
}

/** ISO 8601 week key (Monday-start weeks, week 1 contains the year's first Thursday). */
export function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const weekNum = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** Aggregates by ISO week, newest week first. */
export function computeWeeklyStats(entries: SessionLogEntry[]): WeekStat[] {
  const byWeek = new Map<string, WeekStat>();

  for (const entry of entries) {
    const weekKey = getIsoWeekKey(new Date(entry.finishedAt));
    const existing = byWeek.get(weekKey) ?? { weekKey, sessions: 0, successes: 0, falls: 0 };
    existing.sessions += 1;
    if (entry.success) existing.successes += 1;
    if (entry.fall) existing.falls += 1;
    byWeek.set(weekKey, existing);
  }

  return Array.from(byWeek.values()).sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));
}

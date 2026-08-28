/**
 * data/pilotProgress.ts
 *
 * Pure calculation of where a trainee is within the pilot, given when
 * their pilot started and how long a pilot run is (data/pilotConfig.ts).
 * No React, no storage -- testable with node --test like the rest of
 * data/.
 */

import { PILOT_DURATION_WEEKS } from "./pilotConfig.ts";

export interface PilotProgress {
  /** 1-indexed, clamped to [1, totalWeeks]. */
  currentWeek: number;
  totalWeeks: number;
  weeksRemaining: number;
  isComplete: boolean;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function computePilotProgress(
  pilotStartedAt: string,
  now: Date = new Date(),
  totalWeeks: number = PILOT_DURATION_WEEKS
): PilotProgress {
  const elapsedWeeks = Math.floor((now.getTime() - new Date(pilotStartedAt).getTime()) / MS_PER_WEEK);
  const currentWeek = Math.min(Math.max(elapsedWeeks + 1, 1), totalWeeks);
  const weeksRemaining = Math.max(totalWeeks - elapsedWeeks, 0);

  return {
    currentWeek,
    totalWeeks,
    weeksRemaining,
    isComplete: elapsedWeeks >= totalWeeks,
  };
}

/**
 * arc/arcAddictionStats.ts
 *
 * Pure aggregation for the ARC Addiction personal progress screen.
 * Every metric is per profile and computed from closed episodes only:
 *
 *   - זמן ההמתנה לפני ביצוע ההתנהגות (minutes actually waited per episode)
 *   - משך ההתנהגות בפועל (logged minutes, acted episodes)
 *   - תדירות ביצוע ההתנהגות (acted episodes per ISO week)
 *   - עוצמת הדחף (initial intensity, and intensity after waiting)
 *   - תחושת המסוגלות (efficacy rating after the efficacy ARC)
 *   - מידת הקבלה העצמית (before → after the self-acceptance ARC)
 *   - מספר הפעמים שבחרת שלא לפעול לפי הדחף
 *
 * Wait time and behavior duration are reported separately, each with
 * its own direction-only trend – never combined into a "score".
 */

import type { AddictionEpisode } from "./arcAddiction.ts";
import { computeEpisodeWaitSeconds, countNotActChoices } from "./arcAddiction.ts";
import type { AddictionTrend } from "./arcAddictionProgression.ts";
import { computeTrend } from "./arcAddictionProgression.ts";
import { getIsoWeekKey } from "../data/weeklyStats.ts";

export interface ChartPoint {
  /** ISO timestamp (x axis order) */
  at: string;
  value: number;
}

export interface WeeklyCount {
  weekKey: string;
  acted: number;
  practices: number;
  notActChoices: number;
}

export interface AddictionProfileStats {
  totalPractices: number;
  actedCount: number;
  resistedCount: number;
  notActChoices: number;
  waitTargetMetCount: number;
  waitMinutes: ChartPoint[];
  behaviorMinutes: ChartPoint[];
  initialIntensity: ChartPoint[];
  intensityAfterWait: ChartPoint[];
  efficacy: ChartPoint[];
  acceptanceBefore: ChartPoint[];
  acceptanceAfter: ChartPoint[];
  weekly: WeeklyCount[];
  averages: {
    waitMinutesLast7Days: number | null;
    waitMinutesLast30Days: number | null;
    behaviorMinutesLast7Days: number | null;
    behaviorMinutesLast30Days: number | null;
  };
  trends: {
    waitMinutes: AddictionTrend;
    behaviorMinutes: AddictionTrend;
    efficacy: AddictionTrend;
    acceptance: AddictionTrend;
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(points: ChartPoint[], sinceMs: number): number | null {
  const recent = points.filter((point) => Date.parse(point.at) >= sinceMs);
  if (recent.length === 0) return null;
  return round1(recent.reduce((sum, point) => sum + point.value, 0) / recent.length);
}

function isClosed(episode: AddictionEpisode): boolean {
  return episode.outcome !== null && episode.endedAt !== null;
}

export function computeAddictionProfileStats(episodes: readonly AddictionEpisode[], profileId: string, now: string): AddictionProfileStats {
  const closed = episodes.filter((episode) => episode.profileId === profileId && isClosed(episode)).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  const waitMinutes: ChartPoint[] = [];
  const behaviorMinutes: ChartPoint[] = [];
  const initialIntensity: ChartPoint[] = [];
  const intensityAfterWait: ChartPoint[] = [];
  const efficacy: ChartPoint[] = [];
  const acceptanceBefore: ChartPoint[] = [];
  const acceptanceAfter: ChartPoint[] = [];
  const weeklyMap = new Map<string, WeeklyCount>();
  let notActChoices = 0;
  let waitTargetMetCount = 0;

  for (const episode of closed) {
    const at = episode.startedAt;
    const seconds = computeEpisodeWaitSeconds(episode, episode.endedAt ?? now);
    if (episode.waitRounds.length > 0) waitMinutes.push({ at, value: round1(seconds / 60) });
    if (episode.outcome === "acted" && episode.behavior?.durationMinutes != null) behaviorMinutes.push({ at, value: episode.behavior.durationMinutes });
    if (episode.initialIntensity !== null) initialIntensity.push({ at, value: episode.initialIntensity });
    for (const round of episode.waitRounds) if (round.intensityAfter !== null) intensityAfterWait.push({ at: round.answeredAt ?? at, value: round.intensityAfter });
    for (const round of episode.arcRounds) {
      if (round.kind === "efficacy" && round.ratingAfter !== null) efficacy.push({ at: round.completedAt ?? at, value: round.ratingAfter });
      if (round.kind === "acceptance") {
        if (round.ratingBefore !== null) acceptanceBefore.push({ at: round.completedAt ?? at, value: round.ratingBefore });
        if (round.ratingAfter !== null) acceptanceAfter.push({ at: round.completedAt ?? at, value: round.ratingAfter });
      }
    }
    const notAct = countNotActChoices(episode);
    notActChoices += notAct;
    if (episode.waitRounds.some((round) => round.endedEarlyAt === null && round.elapsedAt !== null)) waitTargetMetCount += 1;

    const weekKey = getIsoWeekKey(new Date(at));
    const week = weeklyMap.get(weekKey) ?? { weekKey, acted: 0, practices: 0, notActChoices: 0 };
    week.practices += 1;
    if (episode.outcome === "acted") week.acted += 1;
    week.notActChoices += notAct;
    weeklyMap.set(weekKey, week);
  }

  const nowMs = Date.parse(now);
  const day = 24 * 3_600_000;
  return {
    totalPractices: closed.length,
    actedCount: closed.filter((episode) => episode.outcome === "acted").length,
    resistedCount: closed.filter((episode) => episode.outcome === "resisted").length,
    notActChoices,
    waitTargetMetCount,
    waitMinutes,
    behaviorMinutes,
    initialIntensity,
    intensityAfterWait,
    efficacy,
    acceptanceBefore,
    acceptanceAfter,
    weekly: [...weeklyMap.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
    averages: {
      waitMinutesLast7Days: average(waitMinutes, nowMs - 7 * day),
      waitMinutesLast30Days: average(waitMinutes, nowMs - 30 * day),
      behaviorMinutesLast7Days: average(behaviorMinutes, nowMs - 7 * day),
      behaviorMinutesLast30Days: average(behaviorMinutes, nowMs - 30 * day),
    },
    trends: {
      waitMinutes: computeTrend(waitMinutes.map((point) => point.value), false),
      behaviorMinutes: computeTrend(behaviorMinutes.map((point) => point.value), true),
      efficacy: computeTrend(efficacy.map((point) => point.value), false),
      acceptance: computeTrend(acceptanceAfter.map((point) => point.value), false),
    },
  };
}

export interface HistoryRow {
  id: string;
  startedAt: string;
  outcome: AddictionEpisode["outcome"];
  waitedMinutes: number;
  notActChoices: number;
  behaviorMinutes: number | null;
  initialIntensity: number | null;
  savedPositiveMemoryId: string | null;
}

/** Newest first – the practice history list. */
export function buildAddictionHistoryRows(episodes: readonly AddictionEpisode[], profileId: string, now: string): HistoryRow[] {
  return episodes
    .filter((episode) => episode.profileId === profileId && isClosed(episode))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .map((episode) => ({
      id: episode.id,
      startedAt: episode.startedAt,
      outcome: episode.outcome,
      waitedMinutes: round1(computeEpisodeWaitSeconds(episode, episode.endedAt ?? now) / 60),
      notActChoices: countNotActChoices(episode),
      behaviorMinutes: episode.behavior?.durationMinutes ?? null,
      initialIntensity: episode.initialIntensity,
      savedPositiveMemoryId: episode.savedPositiveMemoryId,
    }));
}

export const OUTCOME_LABELS: Record<NonNullable<AddictionEpisode["outcome"]>, string> = {
  resisted: "בחרת שלא לפעול",
  acted: "פעלת לפי הדחף + קבלה",
  ended_by_user: "התרגול הסתיים",
  abandoned: "נסגר אוטומטית",
};

/** Normalizes a series into 0..1 chart coordinates (pure, for live/components/ArcAddictionLineChart.tsx). */
export function projectChartPoints(points: readonly ChartPoint[], fixedMax?: number): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const max = fixedMax ?? Math.max(1, ...points.map((point) => point.value));
  if (points.length === 1) return [{ x: 0.5, y: Math.min(1, Math.max(0, points[0].value / max)) }];
  return points.map((point, index) => ({ x: index / (points.length - 1), y: Math.min(1, Math.max(0, point.value / max)) }));
}

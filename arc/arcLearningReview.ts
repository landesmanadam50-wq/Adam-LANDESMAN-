/**
 * arc/arcLearningReview.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task:
 * individual-insight active recall (section 2, step 6) and its adaptive
 * spaced-repetition schedule (section 3) -- built entirely on the shared
 * generic engine in arc/spacedRepetition.ts. Pure data model + logic
 * only, no AsyncStorage/navigation/React.
 *
 * Deliberately TWO separate record types, mirroring the house
 * collection-not-singleton convention: ArcLearningReviewSchedule (one per
 * insight, satellite to ArcLearningInsight -- editing insight content
 * never touches scheduling and vice versa) and ArcLearningRecallRecord
 * (append-only history, one per completed recall attempt). Section 3:
 * "must store: recall history, recall ratings, previous review dates,
 * next recommended review date, repetition interval, review status" --
 * the schedule record covers the latter four, the recall-record
 * collection covers the first two.
 */

import {
  createArcReviewScheduleCore,
  isScheduleDueOrOverdue,
  normalizeArcReviewScheduleCore,
  recordArcReview,
  DEFAULT_REVIEW_INTERVAL_LADDER_DAYS,
} from "./spacedRepetition.ts";
import type { ArcRecallRating, ArcReviewScheduleCore } from "./spacedRepetition.ts";
import { isArcLearningInsightReadyForRecall } from "./arcLearningInsight.ts";
import type { ArcLearningInsight } from "./arcLearningInsight.ts";

export interface ArcLearningReviewSchedule extends ArcReviewScheduleCore {
  insightId: string;
}

export interface ArcLearningRecallRecord {
  id: string;
  insightId: string;
  rating: ArcRecallRating;
  recalledAt: string;
}

export function generateArcLearningRecallRecordId(): string {
  return `arc-learning-recall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcLearningReviewSchedule(insightId: string, now: string, ladder: number[] = DEFAULT_REVIEW_INTERVAL_LADDER_DAYS): ArcLearningReviewSchedule {
  return { ...createArcReviewScheduleCore(now, ladder), insightId };
}

export function createArcLearningRecallRecord(id: string, insightId: string, rating: ArcRecallRating, now: string): ArcLearningRecallRecord {
  return { id, insightId, rating, recalledAt: now };
}

/** Records one completed individual-insight recall: appends the history record AND advances the schedule, in one call so the two can never drift apart. */
export function recordArcLearningRecall(
  schedules: ArcLearningReviewSchedule[],
  records: ArcLearningRecallRecord[],
  insightId: string,
  rating: ArcRecallRating,
  recordId: string,
  now: string
): { schedules: ArcLearningReviewSchedule[]; records: ArcLearningRecallRecord[] } {
  const nextRecords = [...records, createArcLearningRecallRecord(recordId, insightId, rating, now)];
  const existing = schedules.find((schedule) => schedule.insightId === insightId);
  const updatedSchedule = existing ? recordArcReview(existing, rating, now) : recordArcReview(createArcLearningReviewSchedule(insightId, now), rating, now);
  const nextSchedules = existing
    ? schedules.map((schedule) => (schedule.insightId === insightId ? updatedSchedule : schedule))
    : [...schedules, updatedSchedule];
  return { schedules: nextSchedules, records: nextRecords };
}

export function upsertArcLearningReviewScheduleInList(schedules: ArcLearningReviewSchedule[], schedule: ArcLearningReviewSchedule): ArcLearningReviewSchedule[] {
  const index = schedules.findIndex((existing) => existing.insightId === schedule.insightId);
  if (index === -1) return [...schedules, schedule];
  const next = [...schedules];
  next[index] = schedule;
  return next;
}

export function deleteArcLearningReviewScheduleFromList(schedules: ArcLearningReviewSchedule[], insightId: string): ArcLearningReviewSchedule[] {
  return schedules.filter((schedule) => schedule.insightId !== insightId);
}

export function resolveArcLearningReviewSchedule(schedules: ArcLearningReviewSchedule[], insightId: string): ArcLearningReviewSchedule | null {
  return schedules.find((schedule) => schedule.insightId === insightId) ?? null;
}

export function resolveArcLearningRecallHistory(records: ArcLearningRecallRecord[], insightId: string): ArcLearningRecallRecord[] {
  return records.filter((record) => record.insightId === insightId);
}

/**
 * The ONE resolver "what is due for individual-insight recall right
 * now" -- section 9's own core principle ("the spaced repetition
 * algorithm decides which insights... are due, while the weekly and
 * daily planners determine when the user actually practices them") and
 * section 7's "a recurring block should collect eligible reviews due at
 * that time" both read this, never a second, independently-filtered
 * query. An insight ready for recall (main sentence set) that has never
 * been reviewed yet (no schedule record) is due immediately -- the
 * section 2 step 6 "initial active recall" case; everything else is due
 * exactly when its own ArcLearningReviewSchedule says so. Order is
 * insertion order (not re-sorted), same convention as every other
 * resolve<Type>For<Scope> in this codebase.
 */
export function resolveDueArcLearningInsightIds(
  insights: ArcLearningInsight[],
  schedules: ArcLearningReviewSchedule[],
  now: Date = new Date()
): string[] {
  return insights
    .filter((insight) => isArcLearningInsightReadyForRecall(insight))
    .filter((insight) => {
      const schedule = schedules.find((candidate) => candidate.insightId === insight.id);
      return !schedule || isScheduleDueOrOverdue(schedule, now);
    })
    .map((insight) => insight.id);
}

/** Backfills a schedule saved before a field existed -- called once per record by data/storage.ts's own loadArcLearningReviewSchedules. */
export function normalizeArcLearningReviewSchedule(schedule: ArcLearningReviewSchedule, now: string): ArcLearningReviewSchedule {
  return { ...normalizeArcReviewScheduleCore(schedule, now), insightId: schedule.insightId };
}

/**
 * Section 3's own "support cumulative review of multiple insights" +
 * section 12's "save unfinished learning... sessions so users can
 * resume them after leaving the app": a single resumable slot holding
 * the queue of insights being recalled in one sitting, mirroring
 * ArcFocusSession's single-in-flight-slot convention. At most one
 * recall session is ever in progress at a time.
 */
export interface ArcLearningRecallSessionProgress {
  insightIds: string[];
  currentIndex: number;
  startedAt: string;
}

export function createArcLearningRecallSessionProgress(insightIds: string[], now: string): ArcLearningRecallSessionProgress {
  return { insightIds, currentIndex: 0, startedAt: now };
}

export function advanceArcLearningRecallSessionProgress(progress: ArcLearningRecallSessionProgress): ArcLearningRecallSessionProgress {
  return { ...progress, currentIndex: progress.currentIndex + 1 };
}

export function isArcLearningRecallSessionProgressComplete(progress: ArcLearningRecallSessionProgress): boolean {
  return progress.currentIndex >= progress.insightIds.length;
}

export function resolveCurrentArcLearningRecallInsightId(progress: ArcLearningRecallSessionProgress): string | null {
  return progress.insightIds[progress.currentIndex] ?? null;
}

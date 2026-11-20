/**
 * arc/arcCreativityReview.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task: Mode
 * D ("שליפת קשרים") -- active recall of previously-saved connections --
 * and its adaptive spaced-repetition schedule, built on the same shared
 * generic engine in arc/spacedRepetition.ts that arc/arcLearningReview.ts
 * uses. Pure data model + logic only, no AsyncStorage/navigation/React.
 *
 * Deliberately a FULLY SEPARATE pair of record types/collections from
 * arc/arcLearningReview.ts's ArcLearningReviewSchedule/
 * ArcLearningRecallRecord, never a shared table keyed by a union type:
 * section 4 Mode D's own rule -- "connection recall history must stay
 * separate from individual-insight recall history; recalling a
 * connection must never count as recalling the underlying insights" --
 * is structurally guaranteed by this split, not just a convention a
 * caller has to remember.
 */

import {
  createArcReviewScheduleCore,
  isScheduleDueOrOverdue,
  normalizeArcReviewScheduleCore,
  recordArcReview,
  DEFAULT_REVIEW_INTERVAL_LADDER_DAYS,
} from "./spacedRepetition.ts";
import type { ArcRecallRating, ArcReviewScheduleCore } from "./spacedRepetition.ts";
import type { ArcCreativityConnection } from "./arcCreativityConnection.ts";

export interface ArcCreativityReviewSchedule extends ArcReviewScheduleCore {
  connectionId: string;
}

export interface ArcCreativityRecallRecord {
  id: string;
  connectionId: string;
  rating: ArcRecallRating;
  recalledAt: string;
}

export function generateArcCreativityRecallRecordId(): string {
  return `arc-creativity-recall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcCreativityReviewSchedule(
  connectionId: string,
  now: string,
  ladder: number[] = DEFAULT_REVIEW_INTERVAL_LADDER_DAYS
): ArcCreativityReviewSchedule {
  return { ...createArcReviewScheduleCore(now, ladder), connectionId };
}

export function createArcCreativityRecallRecord(id: string, connectionId: string, rating: ArcRecallRating, now: string): ArcCreativityRecallRecord {
  return { id, connectionId, rating, recalledAt: now };
}

/** Records one completed connection recall: appends the history record AND advances the schedule, in one call so the two can never drift apart. */
export function recordArcCreativityRecall(
  schedules: ArcCreativityReviewSchedule[],
  records: ArcCreativityRecallRecord[],
  connectionId: string,
  rating: ArcRecallRating,
  recordId: string,
  now: string
): { schedules: ArcCreativityReviewSchedule[]; records: ArcCreativityRecallRecord[] } {
  const nextRecords = [...records, createArcCreativityRecallRecord(recordId, connectionId, rating, now)];
  const existing = schedules.find((schedule) => schedule.connectionId === connectionId);
  const updatedSchedule = existing
    ? recordArcReview(existing, rating, now)
    : recordArcReview(createArcCreativityReviewSchedule(connectionId, now), rating, now);
  const nextSchedules = existing
    ? schedules.map((schedule) => (schedule.connectionId === connectionId ? updatedSchedule : schedule))
    : [...schedules, updatedSchedule];
  return { schedules: nextSchedules, records: nextRecords };
}

export function upsertArcCreativityReviewScheduleInList(
  schedules: ArcCreativityReviewSchedule[],
  schedule: ArcCreativityReviewSchedule
): ArcCreativityReviewSchedule[] {
  const index = schedules.findIndex((existing) => existing.connectionId === schedule.connectionId);
  if (index === -1) return [...schedules, schedule];
  const next = [...schedules];
  next[index] = schedule;
  return next;
}

export function deleteArcCreativityReviewScheduleFromList(schedules: ArcCreativityReviewSchedule[], connectionId: string): ArcCreativityReviewSchedule[] {
  return schedules.filter((schedule) => schedule.connectionId !== connectionId);
}

export function resolveArcCreativityReviewSchedule(schedules: ArcCreativityReviewSchedule[], connectionId: string): ArcCreativityReviewSchedule | null {
  return schedules.find((schedule) => schedule.connectionId === connectionId) ?? null;
}

export function resolveArcCreativityRecallHistory(records: ArcCreativityRecallRecord[], connectionId: string): ArcCreativityRecallRecord[] {
  return records.filter((record) => record.connectionId === connectionId);
}

/** Mode D's own "what is due for connection recall right now" -- the exact mirror of arc/arcLearningReview.ts's own resolveDueArcLearningInsightIds, kept fully separate per connection ids. A saved connection never reviewed yet is due immediately. */
export function resolveDueArcCreativityConnectionIds(
  connections: ArcCreativityConnection[],
  schedules: ArcCreativityReviewSchedule[],
  now: Date = new Date()
): string[] {
  return connections
    .filter((connection) => {
      const schedule = schedules.find((candidate) => candidate.connectionId === connection.id);
      return !schedule || isScheduleDueOrOverdue(schedule, now);
    })
    .map((connection) => connection.id);
}

/** Backfills a schedule saved before a field existed -- called once per record by data/storage.ts's own loadArcCreativityReviewSchedules. */
export function normalizeArcCreativityReviewSchedule(schedule: ArcCreativityReviewSchedule, now: string): ArcCreativityReviewSchedule {
  return { ...normalizeArcReviewScheduleCore(schedule, now), connectionId: schedule.connectionId };
}

/** Mode D's own cumulative/resumable recall queue -- same single-in-flight-slot convention as arc/arcLearningReview.ts's own ArcLearningRecallSessionProgress, but a fully separate type/collection (connectionIds, never insightIds). */
export interface ArcCreativityRecallSessionProgress {
  connectionIds: string[];
  currentIndex: number;
  startedAt: string;
}

export function createArcCreativityRecallSessionProgress(connectionIds: string[], now: string): ArcCreativityRecallSessionProgress {
  return { connectionIds, currentIndex: 0, startedAt: now };
}

export function advanceArcCreativityRecallSessionProgress(progress: ArcCreativityRecallSessionProgress): ArcCreativityRecallSessionProgress {
  return { ...progress, currentIndex: progress.currentIndex + 1 };
}

export function isArcCreativityRecallSessionProgressComplete(progress: ArcCreativityRecallSessionProgress): boolean {
  return progress.currentIndex >= progress.connectionIds.length;
}

export function resolveCurrentArcCreativityRecallConnectionId(progress: ArcCreativityRecallSessionProgress): string | null {
  return progress.connectionIds[progress.currentIndex] ?? null;
}

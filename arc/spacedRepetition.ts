/**
 * arc/spacedRepetition.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task: the
 * ONE shared, generic adaptive-review engine both systems build their own
 * review-schedule record on top of (ArcLearningReviewSchedule in
 * arc/arcLearningReview.ts, ArcCreativityReviewSchedule in
 * arc/arcCreativityReview.ts). Pure data + logic only -- no AsyncStorage,
 * no navigation, no React, same split as every other arc/*.ts module (see
 * arc/arcGym.ts's own doc for the house convention).
 *
 * Deliberately generic over `T extends ArcReviewScheduleCore` rather than
 * duplicated per-system: the interval/due-date math is identical for an
 * insight and for a connection, only the id field referencing the
 * reviewed item differs between the two call sites.
 *
 * Section 6's own requirement -- "separate the recommended review due
 * date from its actual calendar appointment when necessary" -- is why
 * `nextDueAt` (the algorithm's own running recommendation) and
 * `manualDueOverrideAt` (the trainee's own explicit choice, from a
 * postponement or manual-mode edit) are two distinct fields, never one
 * merged value: `resolveEffectiveDueDate` is the one place that decides
 * which one is actually "due." A manual override is always additive --
 * recording a real review clears it and (in automatic mode) recomputes a
 * fresh nextDueAt, but never erases `lastReviewedAt` or any of the
 * recall-history records a caller appends alongside it.
 */

export type ArcRecallRating = "forgot" | "hard" | "good" | "easy";

export type ArcReviewScheduleMode = "automatic" | "manual";

export type ArcReviewRunStatus = "active" | "paused";

/** Section 3's own suggested starting ladder, in ascending days. Every schedule gets its own copy at creation (intervalLadderDays) so one trainee's own customization (section 6) never affects another record's ladder. */
export const DEFAULT_REVIEW_INTERVAL_LADDER_DAYS: number[] = [1, 3, 7, 14, 30];

/**
 * Pure: the next interval (in days) given the CURRENT interval and a
 * self-rated recall outcome. "forgot" always resets to the ladder's own
 * first step (back to square one). "hard" repeats at the ladder step
 * reached (or grows slowly past the ladder's end). "good" advances one
 * ladder step (or doubles past the end). "easy" advances two ladder steps
 * (or grows faster past the end). Never mutates `ladder`.
 */
export function resolveNextReviewIntervalDays(
  currentIntervalDays: number,
  rating: ArcRecallRating,
  ladder: number[] = DEFAULT_REVIEW_INTERVAL_LADDER_DAYS
): number {
  if (!ladder.length) return currentIntervalDays;
  if (rating === "forgot") return ladder[0];
  const currentIndex = ladder.findIndex((step) => step >= currentIntervalDays);
  if (rating === "hard") {
    if (currentIndex === -1 || currentIndex === ladder.length - 1) return Math.max(ladder[0], Math.round(currentIntervalDays * 1.2));
    return ladder[currentIndex];
  }
  if (rating === "good") {
    if (currentIndex === -1 || currentIndex === ladder.length - 1) return Math.round(currentIntervalDays * 2);
    return ladder[currentIndex + 1];
  }
  // easy
  if (currentIndex === -1 || currentIndex >= ladder.length - 2) return Math.round(currentIntervalDays * 2.5);
  return ladder[currentIndex + 2];
}

export function resolveNextReviewDate(now: Date, intervalDays: number): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

export type ArcReviewDueState = "overdue" | "due_today" | "upcoming";

/** Compares calendar dates only (local midnight), never time-of-day -- "due today" means today's date, regardless of what hour nextDueAt's time component carries. */
export function resolveReviewDueState(dueAtIso: string, now: Date = new Date()): ArcReviewDueState {
  const due = new Date(dueAtIso);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueStart.getTime() < todayStart.getTime()) return "overdue";
  if (dueStart.getTime() === todayStart.getTime()) return "due_today";
  return "upcoming";
}

export function isReviewDueOrOverdue(dueAtIso: string, now: Date = new Date()): boolean {
  const state = resolveReviewDueState(dueAtIso, now);
  return state === "overdue" || state === "due_today";
}

/** The fields every review-schedule record (ArcLearningReviewSchedule, ArcCreativityReviewSchedule) shares -- each extends this with its own single id field referencing the reviewed item (insightId / connectionId). */
export interface ArcReviewScheduleCore {
  mode: ArcReviewScheduleMode;
  intervalDays: number;
  intervalLadderDays: number[];
  lastReviewedAt: string | null;
  nextDueAt: string;
  manualDueOverrideAt: string | null;
  status: ArcReviewRunStatus;
  createdAt: string;
  updatedAt: string;
}

export function createArcReviewScheduleCore(now: string, ladder: number[] = DEFAULT_REVIEW_INTERVAL_LADDER_DAYS): ArcReviewScheduleCore {
  return {
    mode: "automatic",
    intervalDays: ladder[0] ?? 1,
    intervalLadderDays: [...ladder],
    lastReviewedAt: null,
    nextDueAt: resolveNextReviewDate(new Date(now), ladder[0] ?? 1).toISOString(),
    manualDueOverrideAt: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/** Section 6: "separate the recommended review due date from its actual calendar appointment when necessary" -- a manual override, when set, is always the effective one. */
export function resolveEffectiveDueDate(schedule: Pick<ArcReviewScheduleCore, "nextDueAt" | "manualDueOverrideAt">): string {
  return schedule.manualDueOverrideAt ?? schedule.nextDueAt;
}

export function resolveScheduleDueState(schedule: Pick<ArcReviewScheduleCore, "nextDueAt" | "manualDueOverrideAt">, now: Date = new Date()): ArcReviewDueState {
  return resolveReviewDueState(resolveEffectiveDueDate(schedule), now);
}

export function isScheduleDueOrOverdue(schedule: Pick<ArcReviewScheduleCore, "nextDueAt" | "manualDueOverrideAt" | "status">, now: Date = new Date()): boolean {
  if (schedule.status === "paused") return false;
  return isReviewDueOrOverdue(resolveEffectiveDueDate(schedule), now);
}

/**
 * Records a completed review. In "automatic" mode, recomputes
 * intervalDays/nextDueAt from the rating via the ladder. In "manual"
 * mode, the trainee owns the next date themselves -- intervalDays/
 * nextDueAt are left untouched, only lastReviewedAt is recorded. Either
 * way, any pending manual postponement is consumed (a real review always
 * supersedes a stale deferral) and review history fields already
 * recorded by the caller (a separate ArcLearningRecallRecord/
 * ArcCreativityRecallRecord) are never erased by this function -- it
 * only ever touches the schedule record itself.
 */
export function recordArcReview<T extends ArcReviewScheduleCore>(schedule: T, rating: ArcRecallRating, now: string): T {
  if (schedule.mode === "manual") {
    return { ...schedule, lastReviewedAt: now, manualDueOverrideAt: null, updatedAt: now };
  }
  const nextIntervalDays = resolveNextReviewIntervalDays(schedule.intervalDays, rating, schedule.intervalLadderDays);
  return {
    ...schedule,
    intervalDays: nextIntervalDays,
    lastReviewedAt: now,
    nextDueAt: resolveNextReviewDate(new Date(now), nextIntervalDays).toISOString(),
    manualDueOverrideAt: null,
    updatedAt: now,
  };
}

/** Section 6: postpone a review -- sets a manual override date, never touches nextDueAt/intervalDays/lastReviewedAt, so the algorithm's own recommendation and all review history survive untouched underneath it. */
export function postponeArcReview<T extends ArcReviewScheduleCore>(schedule: T, newDueAtIso: string, now: string): T {
  return { ...schedule, manualDueOverrideAt: newDueAtIso, updatedAt: now };
}

/** Section 6: "restore automatic scheduling" -- clears any manual override and switches mode back to automatic; nextDueAt (the algorithm's own last recommendation) becomes effective again untouched. */
export function restoreAutomaticArcReviewSchedule<T extends ArcReviewScheduleCore>(schedule: T, now: string): T {
  return { ...schedule, mode: "automatic", manualDueOverrideAt: null, updatedAt: now };
}

export function setArcReviewScheduleMode<T extends ArcReviewScheduleCore>(schedule: T, mode: ArcReviewScheduleMode, now: string): T {
  if (schedule.mode === mode) return schedule;
  return { ...schedule, mode, updatedAt: now };
}

/** Section 6: lets a trainee customize their own interval ladder -- a pure per-record override, never a global setting. */
export function setArcReviewIntervalLadder<T extends ArcReviewScheduleCore>(schedule: T, ladder: number[], now: string): T {
  return { ...schedule, intervalLadderDays: [...ladder], updatedAt: now };
}

export function pauseArcReviewSchedule<T extends ArcReviewScheduleCore>(schedule: T, now: string): T {
  if (schedule.status === "paused") return schedule;
  return { ...schedule, status: "paused", updatedAt: now };
}

export function resumeArcReviewSchedule<T extends ArcReviewScheduleCore>(schedule: T, now: string): T {
  if (schedule.status === "active") return schedule;
  return { ...schedule, status: "active", updatedAt: now };
}

/** Backfills a schedule record saved before any of these fields existed, or before a field was added -- called once per record by the owning data/storage.ts loader, same convention as every other normalize<Type> in this codebase. */
export function normalizeArcReviewScheduleCore<T extends Partial<ArcReviewScheduleCore>>(schedule: T, now: string): T & ArcReviewScheduleCore {
  const ladder = Array.isArray(schedule.intervalLadderDays) && schedule.intervalLadderDays.length ? schedule.intervalLadderDays : DEFAULT_REVIEW_INTERVAL_LADDER_DAYS;
  return {
    ...schedule,
    mode: schedule.mode === "manual" ? "manual" : "automatic",
    intervalDays: typeof schedule.intervalDays === "number" ? schedule.intervalDays : ladder[0] ?? 1,
    intervalLadderDays: ladder,
    lastReviewedAt: typeof schedule.lastReviewedAt === "string" ? schedule.lastReviewedAt : null,
    nextDueAt: typeof schedule.nextDueAt === "string" ? schedule.nextDueAt : now,
    manualDueOverrideAt: typeof schedule.manualDueOverrideAt === "string" ? schedule.manualDueOverrideAt : null,
    status: schedule.status === "paused" ? "paused" : "active",
    createdAt: typeof schedule.createdAt === "string" ? schedule.createdAt : now,
    updatedAt: typeof schedule.updatedAt === "string" ? schedule.updatedAt : now,
  };
}

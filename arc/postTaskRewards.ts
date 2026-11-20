/**
 * arc/postTaskRewards.ts
 *
 * Psychology/Smiling/Positive-Reinforcement task, features 2+3: the two
 * "independent systems" (spec's own words) triggered by every completed
 * task --
 *
 * (A) the progressive SMILING EXERCISE duration: "SmileDuration = BASE
 *     + (DayNumber - 1) + (CompletedTaskIndex - 1)", where DayNumber
 *     counts real calendar days since the very first time this feature
 *     was ever used (never reset by anything -- not a postponement,
 *     not a day with zero completions), and CompletedTaskIndex counts
 *     completed tasks within the CURRENT calendar day only, resetting
 *     to 0 every new day. Smile Duration Update task: this is the same
 *     (DayNumber + CompletedTaskIndex - 1) quantity the formula always
 *     used, now increasing the duration by exactly ONE second per
 *     qualifying completion instead of multiplying by ten (BASE itself
 *     -- 10 seconds -- is unchanged, so the very first completion ever
 *     still produces exactly BASE seconds, then +1 per completion after
 *     that: 10 -> 11 -> 12 -> 13 ...).
 *
 * (B) the SMILE-REWARD streak: +1/+2/+3/... smiles for each consecutive
 *     completed task (never capped -- the spec's own "do not add a
 *     maximum... without my approval" principle for (A) is applied here
 *     too, by the same logic, since no cap was specified for this
 *     growing sequence either). The streak resets to 0 on an explicit
 *     postponement (live/PostponementScreen.tsx's confirm(), the ONLY
 *     call site that actually postpones a task) and at the start of
 *     each new calendar day -- but NEVER on a rest period or an ARC
 *     exercise, since neither of those ever calls recordPostponement.
 *     Smiles are a positive-reinforcement symbol, not a currency: there
 *     is no points conversion and no end-of-day settlement step. Every
 *     smile earned is added to the running, never-reset totalSmiles the
 *     instant it is earned, and a postponement or day rollover only
 *     ever resets the STREAK (and, on rollover, the daily todaySmiles
 *     counter) -- totalSmiles itself only ever grows.
 *
 * Both features share ONE persisted state object and ONE idempotency
 * guard (`processedCompletionIds`, cleared on day rollover) so a given
 * task completion can never be double-counted by either system, no
 * matter how many times recordTaskCompletion is accidentally called
 * for it (app restart mid-animation, a duplicate event, etc).
 *
 * All day-boundary arithmetic goes through program/dateUtils.ts's own
 * todayLocalDateString/daysBetweenCalendarDates -- the same local-
 * calendar-date source of truth arc/todaySchedule.ts already uses for
 * every other "what day is it" decision in this app. Never a second,
 * competing notion of "today".
 */

import { daysBetweenCalendarDates } from "../program/dateUtils.ts";

export interface PostTaskRewardsState {
  /** The calendar date (local) this state's own daily fields currently apply to. */
  dateLocal: string;
  /** Never reset by anything -- the very first calendar date this feature was ever used. DayNumber = daysBetweenCalendarDates(anchor, today) + 1. */
  smileAnchorDateLocal: string;
  /** How many completed tasks have triggered the smiling exercise so far TODAY (dateLocal). Resets to 0 on day rollover. */
  smileTaskIndexToday: number;
  /** The consecutive-completion streak (never interrupted by an explicit postponement). Resets to 0 on postponement AND on day rollover. */
  consecutiveStreak: number;
  /** Smiles earned via the streak system today. Resets to 0 on day rollover; never affected by postponement. */
  todaySmiles: number;
  /** The running, lifetime, never-reset total of every smile ever earned. Grows the instant a smile is earned -- no conversion, no settlement, no spending. */
  totalSmiles: number;
  /** Completion-event ids already processed for TODAY (dateLocal) -- cleared on day rollover. Guards every call site (Task LIVE, Today's quick-complete, a recurring occurrence) against double-processing the exact same completion. */
  processedCompletionIds: string[];
}

export function createInitialPostTaskRewardsState(todayDateLocal: string): PostTaskRewardsState {
  return {
    dateLocal: todayDateLocal,
    smileAnchorDateLocal: todayDateLocal,
    smileTaskIndexToday: 0,
    consecutiveStreak: 0,
    todaySmiles: 0,
    totalSmiles: 0,
    processedCompletionIds: [],
  };
}

/** A stable, unique id for one task-completion event -- a task (recurring or one-time) can only be meaningfully completed once per calendar day in this app's own model, so (taskId, dateLocal) alone is already a correct, collision-free idempotency key; no need to read back completedAt. */
export function resolveTaskCompletionEventId(taskId: string, dateLocal: string): string {
  return `${taskId}:${dateLocal}`;
}

/**
 * Lazily brings the state forward to `todayDateLocal` -- resets every
 * daily field (the streak and today's smile counter), but NEVER
 * touches smileAnchorDateLocal or totalSmiles: totalSmiles is a
 * lifetime running total, already up to date the instant each smile
 * was earned, so a day boundary has nothing to settle or convert. A
 * no-op when todayDateLocal already matches state.dateLocal. Safe (and
 * recommended) to call whenever this state is loaded for display, not
 * only right before recording an event -- it is pure and always
 * returns a numerically-correct "current" state.
 */
export function rolloverToDate(state: PostTaskRewardsState, todayDateLocal: string): PostTaskRewardsState {
  if (state.dateLocal === todayDateLocal) return state;
  return {
    ...state,
    dateLocal: todayDateLocal,
    smileTaskIndexToday: 0,
    consecutiveStreak: 0,
    todaySmiles: 0,
    processedCompletionIds: [],
  };
}

/** Unchanged by the Smile Duration Update task -- "keep the existing base duration". */
const BASE_SMILE_DURATION_SECONDS = 10;

function resolveSmileDurationSeconds(anchorDateLocal: string, todayDateLocal: string, taskIndexToday: number): number {
  const dayNumber = daysBetweenCalendarDates(anchorDateLocal, todayDateLocal) + 1;
  // SmileDuration = BASE + (DayNumber - 1) + (CompletedTaskIndex - 1). Deliberately uncapped -- see this module's own doc.
  return BASE_SMILE_DURATION_SECONDS + (dayNumber - 1) + (taskIndexToday - 1);
}

export interface TaskCompletionOutcome {
  /** How long today's smiling exercise should run. */
  smileDurationSeconds: number;
  /** The streak reward earned by THIS completion (0 if this exact completionEventId was already processed before -- a duplicate event earns nothing a second time). */
  streakRewardSmiles: number;
  newStreak: number;
  todaySmiles: number;
  totalSmiles: number;
  /** True when completionEventId had already been recorded -- every number above still reflects the current, correct state, just without advancing anything further. */
  alreadyProcessed: boolean;
  nextState: PostTaskRewardsState;
}

/**
 * The ONE entry point every task-completion call site uses (Task LIVE's
 * own handleComplete -> reflect -> post-task screen; Today's quick-
 * complete for both a one-time task and a recurring occurrence).
 * Idempotent by completionEventId -- see resolveTaskCompletionEventId.
 */
export function recordTaskCompletion(state: PostTaskRewardsState, completionEventId: string, todayDateLocal: string): TaskCompletionOutcome {
  const rolled = rolloverToDate(state, todayDateLocal);
  if (rolled.processedCompletionIds.includes(completionEventId)) {
    return {
      smileDurationSeconds: resolveSmileDurationSeconds(rolled.smileAnchorDateLocal, rolled.dateLocal, rolled.smileTaskIndexToday),
      streakRewardSmiles: 0,
      newStreak: rolled.consecutiveStreak,
      todaySmiles: rolled.todaySmiles,
      totalSmiles: rolled.totalSmiles,
      alreadyProcessed: true,
      nextState: rolled,
    };
  }
  const taskIndexToday = rolled.smileTaskIndexToday + 1;
  const smileDurationSeconds = resolveSmileDurationSeconds(rolled.smileAnchorDateLocal, rolled.dateLocal, taskIndexToday);
  const newStreak = rolled.consecutiveStreak + 1;
  const streakRewardSmiles = newStreak; // 1st consecutive completion earns 1, 2nd earns 2, ... nth earns n.
  const nextState: PostTaskRewardsState = {
    ...rolled,
    smileTaskIndexToday: taskIndexToday,
    consecutiveStreak: newStreak,
    todaySmiles: rolled.todaySmiles + streakRewardSmiles,
    totalSmiles: rolled.totalSmiles + streakRewardSmiles,
    processedCompletionIds: [...rolled.processedCompletionIds, completionEventId],
  };
  return {
    smileDurationSeconds,
    streakRewardSmiles,
    newStreak,
    todaySmiles: nextState.todaySmiles,
    totalSmiles: nextState.totalSmiles,
    alreadyProcessed: false,
    nextState,
  };
}

/**
 * live/PostponementScreen.tsx's confirm() -- the ONLY place a task is
 * ever actually postponed -- calls this to reset the consecutive
 * streak to zero. Previously earned smiles (todaySmiles, totalSmiles)
 * are untouched, and neither smileTaskIndexToday nor
 * smileAnchorDateLocal are ever affected: postponement resets the
 * REWARD streak, never the physical smiling-duration progression
 * (the spec's own explicit "two independent systems" requirement).
 */
export function recordPostponement(state: PostTaskRewardsState, todayDateLocal: string): PostTaskRewardsState {
  const rolled = rolloverToDate(state, todayDateLocal);
  return { ...rolled, consecutiveStreak: 0 };
}

/** The reward the NEXT completed task would earn if the current streak continues uninterrupted -- display-only, never itself advances anything. */
export function resolveNextStreakReward(state: PostTaskRewardsState): number {
  return state.consecutiveStreak + 1;
}

/**
 * Smile & Grow migration: this module's very first shape (before the
 * points system was removed) persisted `totalPoints`/`todaySmilePoints`/
 * `lastSettledDateLocal` instead of today's `totalSmiles`/`todaySmiles`.
 * Any record already saved to a device under that old shape must still
 * load safely rather than being silently discarded (losing a trainee's
 * real progress) or crashing. `totalSmiles` is reconstructed as the old
 * settled `totalPoints` PLUS that day's own not-yet-settled
 * `todaySmilePoints` -- in the new model every smile is already counted
 * in totalSmiles the instant it is earned, so both amounts the old
 * shape still tracked separately belong in it. `lastSettledDateLocal`
 * is simply dropped; it has no equivalent now that there is nothing to
 * settle. A record already in the current shape, or anything that
 * isn't a recognizable record of either shape, is returned as-is (the
 * latter will fail validation at the call site exactly as before this
 * migration existed).
 */
export function migratePostTaskRewardsState(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const value = raw as Record<string, unknown>;
  const isCurrentShape = typeof value.totalSmiles === "number" && typeof value.todaySmiles === "number";
  if (isCurrentShape) return raw;
  const isLegacyShape = typeof value.totalPoints === "number" && typeof value.todaySmilePoints === "number";
  if (!isLegacyShape) return raw;
  const totalPoints = value.totalPoints as number;
  const todaySmilePoints = value.todaySmilePoints as number;
  return {
    dateLocal: value.dateLocal,
    smileAnchorDateLocal: value.smileAnchorDateLocal,
    smileTaskIndexToday: value.smileTaskIndexToday,
    consecutiveStreak: value.consecutiveStreak,
    processedCompletionIds: value.processedCompletionIds,
    todaySmiles: todaySmilePoints,
    totalSmiles: totalPoints + todaySmilePoints,
  };
}

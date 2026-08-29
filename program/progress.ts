import { TRAINING_CONFIG } from "./config.ts";
import { addCalendarDays, daysBetweenCalendarDates } from "./dateUtils.ts";
import { getProgramDefinition, getCurrentWeekDefinition, getNextWeekDefinition, hasNextProgramWeek } from "./engine.ts";
import type { ArcProgramProgress } from "../arc/types.ts";
import type { ArcProgramSelection } from "./programTypes.ts";

/**
 * Opens a new training window when there isn't one, or when localDate
 * falls outside the current window -- UNLESS the current window
 * already hit the required day count but hasn't been finalized by
 * completeProgramWeek() yet. That data represents a genuinely earned
 * week completion; resetting it on a late LIVE session (e.g. day 8)
 * would silently erase credit the trainee already has. In practice
 * recordValidLiveCompletion() calls completeProgramWeek() the moment
 * the required day count is hit, so this guard is a defensive
 * second layer, not the primary mechanism.
 */
export function recordTrainingDay(progress: ArcProgramProgress, localDate: string): ArcProgramProgress {
  if (progress.weekStartDate === null) {
    return { ...progress, weekStartDate: localDate, trainingDatesThisWeek: [localDate] };
  }

  const dayIndex = daysBetweenCalendarDates(progress.weekStartDate, localDate);
  const withinWindow = dayIndex >= 0 && dayIndex < TRAINING_CONFIG.arcWeekWindowDays;

  if (withinWindow) {
    if (progress.trainingDatesThisWeek.includes(localDate)) {
      return progress;
    }
    return { ...progress, trainingDatesThisWeek: [...progress.trainingDatesThisWeek, localDate] };
  }

  if (isArcWeekComplete(progress)) {
    return progress;
  }

  return { ...progress, weekStartDate: localDate, trainingDatesThisWeek: [localDate] };
}

export function isArcWeekComplete(progress: ArcProgramProgress): boolean {
  return progress.trainingDatesThisWeek.length >= TRAINING_CONFIG.requiredTrainingDaysPerArcWeek;
}

/**
 * Idempotent: calling this again for a week that was already credited
 * (lastCompletedWeek === currentProgramWeek) is a no-op, so it's safe
 * to call from recordValidLiveCompletion() every time the day count
 * threshold is hit without double-crediting completedProgramWeeks.
 */
export function completeProgramWeek(progress: ArcProgramProgress): ArcProgramProgress {
  if (progress.lastCompletedWeek === progress.currentProgramWeek) {
    return progress;
  }

  const program = getProgramDefinition(progress.programPath);
  const nextWeek = getNextWeekDefinition(program, progress.currentProgramWeek);
  const isFinalWeek = !hasNextProgramWeek(program, progress.currentProgramWeek);

  return {
    ...progress,
    completedProgramWeeks: progress.completedProgramWeeks + 1,
    buildExtensionRequired: nextWeek !== null,
    nextLayersToBuild: nextWeek ? nextWeek.layersToBuild : null,
    programCompleted: isFinalWeek,
    lastCompletedWeek: progress.currentProgramWeek,
  };
}

/**
 * If there's no next week (programCompleted), returns progress
 * unchanged rather than incrementing currentProgramWeek past
 * totalWeeks -- a safe no-op instead of either a silent overrun or a
 * thrown error the UI would have to specifically handle.
 */
export function unlockBuildExtension(progress: ArcProgramProgress): ArcProgramProgress {
  const program = getProgramDefinition(progress.programPath);
  const nextWeek = getNextWeekDefinition(program, progress.currentProgramWeek);

  if (!nextWeek) {
    return progress;
  }

  return {
    ...progress,
    activeLayers: nextWeek.activeLayers,
    currentProgramWeek: progress.currentProgramWeek + 1,
    weekStartDate: null,
    trainingDatesThisWeek: [],
    buildExtensionRequired: false,
    nextLayersToBuild: null,
  };
}

export function createInitialProgress(programPath: string): ArcProgramProgress {
  const program = getProgramDefinition(programPath);
  const week1 = getCurrentWeekDefinition(program, 1);

  return {
    programPath,
    currentProgramWeek: 1,
    completedProgramWeeks: 0,
    activeLayers: week1?.activeLayers ?? [],
    weekStartDate: null,
    trainingDatesThisWeek: [],
    buildExtensionRequired: false,
    nextLayersToBuild: null,
    programCompleted: false,
    lastCompletedWeek: null,
    liveSessionCount: 0,
  };
}

/**
 * Reconciles a persisted ArcProgramProgress against the trainee's
 * current ArcProgramSelection (program/selection.ts's real source of
 * truth for what program they should be on). A stored progress record
 * left over from before the current program was selected/restored --
 * e.g. from an earlier build or test -- can carry a programPath that
 * no longer matches the trainee's actual current selection, and would
 * otherwise keep silently running (or, if its programPath isn't even
 * recognized anymore, get discarded with no replacement -- see
 * data/storage.ts's loadProgramProgress) instead of the program
 * they're actually supposed to be on.
 *
 * Only replaced when it has recorded literally no real activity yet
 * (no completed weeks, no training days logged this week, no LIVE
 * sessions) -- a record with any real activity is always returned
 * unchanged, so this can never discard genuinely earned progress.
 * LiveSessionScreen.tsx and StatsScreen.tsx both call this instead of
 * using loadProgramProgress()'s result directly, and persist the
 * result back when it differs so the resync sticks.
 */
export function reconcileProgramProgress(
  progress: ArcProgramProgress | null,
  selection: ArcProgramSelection | null
): ArcProgramProgress | null {
  if (!selection) return progress;
  if (!progress) return createInitialProgress(selection.programPath);

  if (progress.programPath === selection.programPath) return progress;

  const hasRealActivity =
    progress.completedProgramWeeks > 0 || progress.trainingDatesThisWeek.length > 0 || progress.liveSessionCount > 0;
  if (hasRealActivity) return progress;

  return createInitialProgress(selection.programPath);
}

export interface ArcWeekStatus {
  isStarted: boolean;
  isExpired: boolean;
  isComplete: boolean;
  trainingDayCount: number;
  requiredTrainingDays: number;
  /** Whole calendar days since the window opened, clamped to >= 0. */
  daysElapsed: number;
  /** Whole calendar days left before the window closes, clamped to >= 0. */
  daysRemaining: number;
  windowStartDate: string | null;
  windowEndDate: string | null;
}

/**
 * A single place that answers "where is this trainee in their current
 * ARC week" so progress UI doesn't have to re-derive the window rules
 * (start date, 7-day window, 5-day requirement) itself.
 */
export function getArcWeekStatus(progress: ArcProgramProgress, currentLocalDate: string): ArcWeekStatus {
  const requiredTrainingDays = TRAINING_CONFIG.requiredTrainingDaysPerArcWeek;
  const trainingDayCount = progress.trainingDatesThisWeek.length;
  const isComplete = isArcWeekComplete(progress);

  if (progress.weekStartDate === null) {
    return {
      isStarted: false,
      isExpired: false,
      isComplete: false,
      trainingDayCount: 0,
      requiredTrainingDays,
      daysElapsed: 0,
      daysRemaining: TRAINING_CONFIG.arcWeekWindowDays,
      windowStartDate: null,
      windowEndDate: null,
    };
  }

  const windowEndDate = addCalendarDays(progress.weekStartDate, TRAINING_CONFIG.arcWeekWindowDays - 1);
  const elapsedSinceStart = daysBetweenCalendarDates(progress.weekStartDate, currentLocalDate);
  const isExpired = !isComplete && elapsedSinceStart >= TRAINING_CONFIG.arcWeekWindowDays;

  return {
    isStarted: true,
    isExpired,
    isComplete,
    trainingDayCount,
    requiredTrainingDays,
    daysElapsed: Math.max(elapsedSinceStart, 0),
    daysRemaining: Math.max(daysBetweenCalendarDates(currentLocalDate, windowEndDate) + 1, 0),
    windowStartDate: progress.weekStartDate,
    windowEndDate,
  };
}

export interface LiveCompletionInput {
  progress: ArcProgramProgress;
  /** The ARC protocol actually reached "act" this session. */
  reachedAct: boolean;
  /** The real-world beneficial/identity/internal action was marked completed. */
  actionCompleted: boolean;
  localDate: string;
}

/**
 * The one place training-day credit is granted from. Every LIVE
 * session increments liveSessionCount (there can be several in one
 * day), but training-day credit -- and therefore ARC week progress --
 * only comes from a session that both reached the Action stage AND
 * had the real action marked completed, and is capped at one credited
 * day per local date regardless of how many qualifying sessions
 * happen that day. The moment the required day count is hit, the week
 * is completed immediately (completeProgramWeek is idempotent, so
 * this is safe to call unconditionally once the threshold is met).
 */
export function recordValidLiveCompletion(input: LiveCompletionInput): ArcProgramProgress {
  const withSessionCount: ArcProgramProgress = {
    ...input.progress,
    liveSessionCount: input.progress.liveSessionCount + 1,
  };

  if (!input.reachedAct || !input.actionCompleted) {
    return withSessionCount;
  }

  const withTrainingCredit = recordTrainingDay(withSessionCount, input.localDate);

  if (isArcWeekComplete(withTrainingCredit)) {
    return completeProgramWeek(withTrainingCredit);
  }

  return withTrainingCredit;
}

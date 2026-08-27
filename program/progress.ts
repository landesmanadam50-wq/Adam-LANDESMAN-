import { TRAINING_CONFIG } from "./config.ts";
import { addCalendarDays, daysBetweenCalendarDates } from "./dateUtils.ts";
import { getProgramDefinition, getCurrentWeekDefinition, getNextWeekDefinition, hasNextProgramWeek } from "./engine.ts";
import type { ArcProgramProgress } from "../arc/types.ts";

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

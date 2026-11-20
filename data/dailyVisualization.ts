/**
 * data/dailyVisualization.ts
 *
 * Daily Visualization task: the thin storage I/O layer over
 * arc/dailyVisualization.ts's pure model, plus the real decisions this
 * layer owns -- resuming vs. starting fresh, and resolving late-start
 * conflicts against the trainee's own real Tasks.
 */

import {
  advanceDailyVisualizationProgress,
  buildImmediateActionTaskFields,
  buildReinforcementTaskFields,
  bypassDailyVisualizationProgress,
  createDailyVisualizationDailyProgress,
  createEmptyDailyVisualizationProfile,
  detectLateStartConflicts,
  isDailyVisualizationCompletedForToday,
  isDailyVisualizationDoneForToday,
  isVisualizationStartedLate,
  resolveResumableProgress,
  resolveTodaysVisualizationTasks,
  upsertBodyScanNote,
  type DailyVisualizationDailyProgress,
  type DailyVisualizationProfile,
} from "../arc/dailyVisualization.ts";
import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import {
  getTask,
  loadDailyVisualizationAlarmState,
  loadDailyVisualizationDailyProgress,
  loadDailyVisualizationProfile,
  loadTaskOccurrenceCompletions,
  loadTaskOccurrenceOverrides,
  loadTasks,
  saveDailyVisualizationDailyProgress,
  saveDailyVisualizationProfile,
  upsertTask,
} from "./storage.ts";
import { reconcileTaskAlarms } from "./taskAlarm.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export interface DailyVisualizationSession {
  profile: DailyVisualizationProfile;
  progress: DailyVisualizationDailyProgress;
  /** Resolved from progress.taskIds, in the SAME order -- a task deleted since the session's own snapshot is simply skipped, never crashing or reinserting a different one. */
  tasks: Task[];
}

/**
 * Opens today's Daily Visualization: resumes an already-in-progress
 * record for TODAY specifically (section 8: "an interrupted exercise
 * can resume"), or starts a brand-new one, snapshotting today's real,
 * chronologically-ordered Tasks ONCE so the sequence stays stable even
 * if the schedule changes mid-exercise. Never re-snapshots on an
 * already-resumed record -- resuming always continues the SAME list it
 * started with.
 */
export async function loadOrStartDailyVisualizationSession(now: Date = new Date()): Promise<DailyVisualizationSession> {
  const todayDateLocal = todayLocalDateString(now);
  const [storedProfile, existingProgress, tasks, completions, overrides, alarmState] = await Promise.all([
    loadDailyVisualizationProfile(),
    loadDailyVisualizationDailyProgress(),
    loadTasks(),
    loadTaskOccurrenceCompletions(),
    loadTaskOccurrenceOverrides(),
    loadDailyVisualizationAlarmState(),
  ]);
  const profile = storedProfile ?? createEmptyDailyVisualizationProfile(now.toISOString());

  const resumable = resolveResumableProgress(existingProgress, todayDateLocal);
  if (resumable) {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const resolvedTasks = resumable.taskIds.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined);
    return { profile, progress: resumable, tasks: resolvedTasks };
  }

  const todaysTasks = resolveTodaysVisualizationTasks(tasks, completions, now, overrides);
  const alarmFireAt = alarmState.scheduledFor ? new Date(alarmState.scheduledFor) : null;
  const startedLate = isVisualizationStartedLate(alarmFireAt, now);
  const progress = createDailyVisualizationDailyProgress(todayDateLocal, todaysTasks.map((task) => task.id), now.toISOString(), startedLate);
  await saveDailyVisualizationDailyProgress(progress);
  return { profile, progress, tasks: todaysTasks };
}

export async function advanceDailyVisualization(progress: DailyVisualizationDailyProgress, tasks: Task[], now: Date = new Date()): Promise<DailyVisualizationDailyProgress> {
  const next = advanceDailyVisualizationProgress(progress, tasks, now.toISOString());
  await saveDailyVisualizationDailyProgress(next);
  return next;
}

/** Bypasses an exercise already open on screen (a progress record already exists for today). */
export async function bypassDailyVisualization(progress: DailyVisualizationDailyProgress, now: Date = new Date()): Promise<DailyVisualizationDailyProgress> {
  const bypassed = bypassDailyVisualizationProgress(progress, now.toISOString());
  await saveDailyVisualizationDailyProgress(bypassed);
  return bypassed;
}

/**
 * Required-before-tasks gate's own "דילוג להיום": bypasses today's
 * exercise WITHOUT ever having opened it first -- creates today's
 * record (empty taskIds, since none were ever snapshotted) already in
 * the bypassed state if none exists yet, or bypasses an existing
 * today's record in whatever state it was in. Never deletes or
 * otherwise touches any Task.
 */
export async function bypassDailyVisualizationForToday(now: Date = new Date()): Promise<void> {
  const todayDateLocal = todayLocalDateString(now);
  const existing = await loadDailyVisualizationDailyProgress();
  const base = existing && existing.dateLocal === todayDateLocal ? existing : createDailyVisualizationDailyProgress(todayDateLocal, [], now.toISOString(), false);
  await saveDailyVisualizationDailyProgress(bypassDailyVisualizationProgress(base, now.toISOString()));
}

/** Merges over whatever profile is already stored (never a fresh from-scratch object) -- so saving feeling+movement here can never silently wipe the end-of-day reinforcement fields saved separately, below. */
export async function saveDailyVisualizationFeelingAndMovement(desiredFeeling: string, bodyMovement: string, now: Date = new Date()): Promise<DailyVisualizationProfile> {
  const existing = await loadDailyVisualizationProfile();
  const profile: DailyVisualizationProfile = { ...(existing ?? createEmptyDailyVisualizationProfile(now.toISOString())), desiredFeeling, bodyMovement, updatedAt: now.toISOString() };
  await saveDailyVisualizationProfile(profile);
  return profile;
}

/** Same merge-over-existing convention as saveDailyVisualizationFeelingAndMovement above -- persisting the reinforcement action/time can never wipe the desiredFeeling/bodyMovement fields saved earlier in the SAME run. */
export async function saveDailyVisualizationReinforcement(reinforcementAction: string, reinforcementTime: string, now: Date = new Date()): Promise<DailyVisualizationProfile> {
  const existing = await loadDailyVisualizationProfile();
  const profile: DailyVisualizationProfile = { ...(existing ?? createEmptyDailyVisualizationProfile(now.toISOString())), reinforcementAction, reinforcementTime, updatedAt: now.toISOString() };
  await saveDailyVisualizationProfile(profile);
  return profile;
}

/**
 * Morning Flow Simplification task, section 4 step 6: "schedule its
 * time" -- creates a real, one-time Task for today at the given time
 * the FIRST time a reinforcement action is set this day, or updates
 * that SAME Task (by its id, already tracked on progress.reinforcementTaskId)
 * on every later edit, never creating a second one. Leaving the action
 * text blank schedules nothing (section 5: never force) and leaves
 * any already-scheduled task exactly as it is -- clearing the text is
 * never destructive here, matching "preserve the existing daily
 * schedule."
 */
export async function commitDailyVisualizationReinforcementTask(
  progress: DailyVisualizationDailyProgress,
  actionText: string,
  time: string,
  now: Date = new Date()
): Promise<DailyVisualizationDailyProgress> {
  const fields = buildReinforcementTaskFields(actionText, time, todayLocalDateString(now));
  if (!fields) return progress;

  const existingTask = progress.reinforcementTaskId ? await getTask(progress.reinforcementTaskId) : null;
  const task: Task = existingTask
    ? { ...existingTask, title: fields.title, firstAction: fields.title, currentAction: fields.title, scheduledDate: fields.scheduledDate, scheduledTime: fields.scheduledTime }
    : { ...createEmptyTask(generateTaskId(), fields.title, fields.title, now.toISOString()), scheduledDate: fields.scheduledDate, scheduledTime: fields.scheduledTime };
  await upsertTask(task);
  await reconcileTaskAlarms();

  const next = { ...progress, reinforcementTaskId: task.id };
  await saveDailyVisualizationDailyProgress(next);
  return next;
}

/**
 * Final Morning Flow Requirements Audit task, section 3: the SAME
 * create-or-update-by-tracked-id pattern as
 * commitDailyVisualizationReinforcementTask above, for the OTHER
 * emotion-reinforcing action (the immediate one, no time) -- the two
 * actions are two entirely independent Tasks, each with its own
 * dedupe slot on `progress`, both landing on today's Flexible Daily
 * Routine (a real, one-time Task with scheduledDate=today) without
 * ever touching the permanent weekly template.
 */
export async function commitDailyVisualizationImmediateActionTask(progress: DailyVisualizationDailyProgress, actionText: string, now: Date = new Date()): Promise<DailyVisualizationDailyProgress> {
  const fields = buildImmediateActionTaskFields(actionText, todayLocalDateString(now));
  if (!fields) return progress;

  const existingTask = progress.immediateActionTaskId ? await getTask(progress.immediateActionTaskId) : null;
  const task: Task = existingTask
    ? { ...existingTask, title: fields.title, firstAction: fields.title, currentAction: fields.title, scheduledDate: fields.scheduledDate }
    : { ...createEmptyTask(generateTaskId(), fields.title, fields.title, now.toISOString()), scheduledDate: fields.scheduledDate };
  await upsertTask(task);
  await reconcileTaskAlarms();

  const next = { ...progress, immediateActionTaskId: task.id };
  await saveDailyVisualizationDailyProgress(next);
  return next;
}

/** Final Morning Flow Requirements Audit task, section 2: saves (or clears, if blank) this ONE task's own body-scan note for today -- never affecting any other task's note on the same progress record. */
export async function saveDailyVisualizationBodyScanNote(progress: DailyVisualizationDailyProgress, taskId: string, note: string, now: Date = new Date()): Promise<DailyVisualizationDailyProgress> {
  const next = { ...progress, bodyScanNotes: upsertBodyScanNote(progress.bodyScanNotes, taskId, note) };
  await saveDailyVisualizationDailyProgress(next);
  return next;
}

/** The ONE check both live/DailyStartupSequenceOverlay.tsx (navigate after the two popups) and live/ActiveTaskScreen.tsx (the required-before-tasks gate) share -- never two slightly-different re-derivations of "is today's exercise done". */
export async function isDailyVisualizationNeededNow(now: Date = new Date()): Promise<boolean> {
  const progress = await loadDailyVisualizationDailyProgress();
  return !isDailyVisualizationDoneForToday(progress, todayLocalDateString(now));
}

/**
 * Nine Functional Improvements task, Improvement 6: the ONE check the
 * Home "🧘 הכנה יומית" entry's own manual re-open uses -- deliberately
 * NOT isDailyVisualizationNeededNow above, which treats "bypassed" the
 * same as "completed" (correct for the morning sequence's own
 * auto-interrupt decision, wrong here: skipping must still let the
 * trainee open and finish it later the same day).
 */
export async function isDailyVisualizationCompletedNow(now: Date = new Date()): Promise<boolean> {
  const progress = await loadDailyVisualizationDailyProgress();
  return isDailyVisualizationCompletedForToday(progress, todayLocalDateString(now));
}

/** Section 6: only meaningful once the exercise is actually finished AND it started late in the first place -- never flags a conflict for an on-time start, and never for a late start where nothing was actually passed yet. */
export function resolveLateStartConflictsForSession(session: DailyVisualizationSession, completedAt: Date = new Date()): Task[] {
  if (!session.progress.startedLate) return [];
  return detectLateStartConflicts(session.tasks, completedAt);
}

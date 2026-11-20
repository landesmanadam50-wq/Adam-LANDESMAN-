/**
 * arc/dailyVisualization.ts
 *
 * Daily Visualization, Body Awareness & Morning Preparation task: a
 * brand-new, task-by-task mental-preparation exercise -- distinct from,
 * and never restructuring, both the short startup-popup Manifest
 * exercise (live/ManifestVisualizationCard.tsx) and the long-form
 * Manifest Meditation (arc/manifestMeditation.ts). No AsyncStorage, no
 * navigation, no React -- same split as every other arc/*.ts module;
 * data/dailyVisualization.ts and data/dailyVisualizationAlarm.ts are
 * the thin I/O wrappers.
 *
 * Reuses, rather than reimplements:
 *  - arc/todaySchedule.ts's buildTodaySections/resolveTaskClockTime for
 *    "which of today's real Tasks are relevant, and when is each one",
 *    so this is never a second, competing definition of "today's
 *    schedule".
 *  - arc/tasks.ts's own Task record -- a visualized task is never a
 *    separate daily-task model; visualizing it never marks it
 *    completed (requirement: "preparation for action, not task
 *    completion").
 *
 * Two independent, differently-scoped pieces of persisted state:
 *  - DailyVisualizationProfile: the desired end-of-day feeling and its
 *    associated body movement -- persists ACROSS days, like
 *    PurposeManifest's own mantra/color/movement, pre-filled from the
 *    last saved value every day but always editable.
 *  - DailyVisualizationDailyProgress: ONE record for the current local
 *    date -- resets every day, tracks exactly which step an in-progress
 *    (possibly interrupted) exercise is on, and whether today's
 *    exercise was completed or explicitly bypassed.
 */

import { buildTodaySections, resolveTaskClockTime } from "./todaySchedule.ts";
import type { TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import type { Task } from "./tasks.ts";
import { findActionStageByKind, hasConfiguredActionStages } from "./taskStage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export interface DailyVisualizationProfile {
  /** "איך היית רוצה להרגיש בסוף היום?" Free text -- "" means never set yet. */
  desiredFeeling: string;
  /** "איזו תנועת גוף מייצגת עבורך את התחושה הזאת?" Free text -- "" means never set yet. */
  bodyMovement: string;
  /**
   * Morning Flow Simplification task, section 4 step 6: "define an
   * end-of-day reinforcement action and schedule its time." Persists
   * across days exactly like desiredFeeling/bodyMovement (pre-filled,
   * always editable) -- "" means never set yet, and an unset action is
   * never forced (section 4/5: optional, never blocks the exercise).
   */
  reinforcementAction: string;
  /** HH:MM free text, same convention as Task.scheduledTime -- "" means no time chosen yet. */
  reinforcementTime: string;
  updatedAt: string;
}

export function createEmptyDailyVisualizationProfile(now: string): DailyVisualizationProfile {
  return { desiredFeeling: "", bodyMovement: "", reinforcementAction: "", reinforcementTime: "", updatedAt: now };
}

/** Backward compatibility: a record saved before any of these fields existed (or the whole feature existed) normalizes to "", never crashes, never invents a value. */
export function normalizeDailyVisualizationProfile(profile: DailyVisualizationProfile): DailyVisualizationProfile {
  return {
    desiredFeeling: profile.desiredFeeling ?? "",
    bodyMovement: profile.bodyMovement ?? "",
    reinforcementAction: profile.reinforcementAction ?? "",
    reinforcementTime: profile.reinforcementTime ?? "",
    updatedAt: profile.updatedAt ?? new Date().toISOString(),
  };
}

// --- The ordered, resumable step sequence ---

/**
 * Unified Task Stages task: a task's own visualize phase is no longer
 * always a single generic step -- when it has a configured action-
 * stage breakdown (arc/taskStage.ts), it expands into the stage-by-
 * stage sequence the spec itself names: trigger action, then the
 * resulting environmental cue, then the small action, then the main
 * action, each its own step -- in that fixed order, exactly mirroring
 * the stages' own fixed kind-based order. A task with NO configured
 * stages (every pre-existing task, and the default for every new one)
 * produces exactly ONE such step, stageKind "main" -- the exact same
 * single generic visualize step this exercise has always shown,
 * completely unchanged (see live/DailyVisualizationScreen.tsx's own
 * rendering split on this distinction). "trigger_cue" is its own step,
 * separate from "trigger", because the spec itself asks for two
 * distinct prompts ("imagine performing the action" then "imagine the
 * resulting cue") -- never collapsed into one.
 */
export type DailyVisualizationStageKind = "trigger" | "trigger_cue" | "small" | "main";

/**
 * One task's own stage-by-stage visualize sequence, followed by the
 * SINGLE existing quick body scan ("כעת בצע סריקת גוף מהירה") once,
 * after the whole task -- never one body scan per stage (requirement:
 * "do not add body scans between individual stages") -- then the three
 * fixed closing steps: the desired feeling, its movement, and the
 * final combined exercise. "Repeat: Task Visualization -> Quick Body
 * Scan -> Next Task until all of today's tasks have been visualized."
 */
export type DailyVisualizationStep =
  | { kind: "task_stage_visualize"; taskIndex: number; stageKind: DailyVisualizationStageKind }
  | { kind: "task_body_scan"; taskIndex: number }
  | { kind: "feeling" }
  | { kind: "end_of_day_visualize" }
  | { kind: "movement" }
  | { kind: "reinforcement_action" }
  | { kind: "final" };

/** The ordered visualize-step stageKinds for ONE task -- ["main"] for a task with no configured action-stage breakdown (preserving today's single generic step exactly), or the configured subset of trigger/trigger_cue/small plus the always-present main otherwise. */
function resolveVisualizeStageKindsForTask(task: Task): DailyVisualizationStageKind[] {
  const stages = task.actionStages;
  if (!hasConfiguredActionStages(stages)) return ["main"];
  const kinds: DailyVisualizationStageKind[] = [];
  if (findActionStageByKind(stages!, "trigger")) kinds.push("trigger", "trigger_cue");
  if (findActionStageByKind(stages!, "small")) kinds.push("small");
  kinds.push("main");
  return kinds;
}

/**
 * The full, fixed-length step list for today's own ordered task ids --
 * never stored itself (derived fresh every time), so there is nothing
 * to keep in sync if it were ever recomputed. The step COUNT is always
 * anchored on `taskIds.length` (never on `tasks.length`), so a task
 * deleted mid-exercise can never desync stepIndex math -- `tasks` is
 * only consulted, positionally, to decide how many visualize sub-steps
 * that one task index expands into; a missing task at that position
 * (deleted mid-exercise) falls back to the single generic "main" step,
 * same honest-fallback precedent every other reader of a possibly-
 * deleted task in this exercise already uses.
 */
/**
 * Morning Flow Simplification task, section 4: the main preparation
 * sequence's own 6 required steps, in order -- (1)/(2) the per-task
 * visualize+body-scan loop above, (3) "feeling", (4) a NEW, dedicated
 * "end_of_day_visualize" step (visualizing a successful end of the day
 * with that feeling, distinct from the final recap below), (5) the
 * pre-existing "movement" step -- a body movement performed RIGHT NOW
 * genuinely already IS "an immediate action to strengthen the
 * feeling," so it is kept as-is rather than duplicated under a new
 * name, and (6) a NEW "reinforcement_action" step (an end-of-day
 * action + its own scheduled time). "final" stays last as the closing
 * recap, unchanged in position.
 */
export function buildDailyVisualizationSteps(taskIds: string[], tasks: Task[]): DailyVisualizationStep[] {
  const steps: DailyVisualizationStep[] = [];
  taskIds.forEach((_taskId, taskIndex) => {
    const task = tasks[taskIndex];
    const stageKinds = task ? resolveVisualizeStageKindsForTask(task) : (["main"] as DailyVisualizationStageKind[]);
    for (const stageKind of stageKinds) steps.push({ kind: "task_stage_visualize", taskIndex, stageKind });
    steps.push({ kind: "task_body_scan", taskIndex });
  });
  steps.push({ kind: "feeling" });
  steps.push({ kind: "end_of_day_visualize" });
  steps.push({ kind: "movement" });
  steps.push({ kind: "reinforcement_action" });
  steps.push({ kind: "final" });
  return steps;
}

/**
 * Final Morning Flow Requirements Audit task, section 2: "preserve
 * separate body-scan results per task and date" -- one optional,
 * free-text note per task, for the one day this progress record is
 * already scoped to (DailyVisualizationDailyProgress.dateLocal), so
 * separation by date comes for free from the record itself never
 * being reused across days. Separate from -- never merged into --
 * ArcBodyScan*'s own full ARC body-scan region selection, which this
 * exercise deliberately keeps simpler (a single free-text note, not a
 * region/contraction/heaviness selection).
 */
export interface DailyVisualizationBodyScanNote {
  taskId: string;
  note: string;
}

/** Replaces this task's own note (never duplicates), or removes it entirely when note is blank -- optional, section 5's own "never force" applies here too. */
export function upsertBodyScanNote(notes: DailyVisualizationBodyScanNote[], taskId: string, note: string): DailyVisualizationBodyScanNote[] {
  const trimmed = note.trim();
  const filtered = notes.filter((entry) => entry.taskId !== taskId);
  if (!trimmed) return filtered;
  return [...filtered, { taskId, note: trimmed }];
}

/** "" when no note was ever saved for this task -- never undefined, so a TextInput can bind to it directly. */
export function findBodyScanNote(notes: DailyVisualizationBodyScanNote[], taskId: string): string {
  return notes.find((entry) => entry.taskId === taskId)?.note ?? "";
}

export type DailyVisualizationStatus = "in_progress" | "completed" | "bypassed";

export interface DailyVisualizationDailyProgress {
  /** Local YYYY-MM-DD this record is for -- program/dateUtils.ts's todayLocalDateString convention, same as every other daily-reset record in this codebase. */
  dateLocal: string;
  /**
   * The exact task ids being visualized, IN ORDER, snapshotted the
   * moment the exercise started today -- never re-derived mid-exercise,
   * so "resume an interrupted exercise" always resumes the SAME
   * sequence even if the schedule changes while it's paused (section 8:
   * "handle the difference without forcing the user to restart a
   * completed visualization").
   */
  taskIds: string[];
  /** Index into buildDailyVisualizationSteps(taskIds.length) -- the exact step to resume at. */
  stepIndex: number;
  status: DailyVisualizationStatus;
  startedAt: string;
  completedAt: string | null;
  /** Section 6: true when startedAt was already past the planned alarm time by more than LATE_START_THRESHOLD_MINUTES -- carried on the record so the end-of-exercise late-start message/conflict check only ever needs to read this, never re-derive "was this late" from scratch. */
  startedLate: boolean;
  /**
   * Morning Flow Simplification task, section 4 step 6: the id of the
   * real Task created/updated for TODAY's own end-of-day reinforcement
   * action, or null if none has been scheduled yet (the action text
   * was left blank, or this step hasn't been reached yet this run).
   * Read back by the data layer's own commitDailyVisualizationReinforcementTask
   * so editing the reinforcement action/time on a later resume UPDATES
   * that same Task rather than creating a duplicate one each time.
   */
  reinforcementTaskId: string | null;
  /**
   * Final Morning Flow Requirements Audit task, section 3: the id of
   * the real Task created/updated for TODAY's own immediate
   * priority action (the "movement" step's own text) -- same
   * dedupe-by-id convention as reinforcementTaskId above, a
   * completely independent slot (the two emotion-reinforcing actions
   * are two separate Tasks, never one shared record).
   */
  immediateActionTaskId: string | null;
  /** Final Morning Flow Requirements Audit task, section 2 -- see DailyVisualizationBodyScanNote's own doc above. */
  bodyScanNotes: DailyVisualizationBodyScanNote[];
}

export function createDailyVisualizationDailyProgress(dateLocal: string, taskIds: string[], now: string, startedLate: boolean): DailyVisualizationDailyProgress {
  return {
    dateLocal,
    taskIds,
    stepIndex: 0,
    status: "in_progress",
    startedAt: now,
    completedAt: null,
    startedLate,
    reinforcementTaskId: null,
    immediateActionTaskId: null,
    bodyScanNotes: [],
  };
}

/** Backward compatibility: no record at all (feature never used, or a date from before it existed) is handled by every caller treating `null` as "not done, not in progress" -- never synthesized here. */
export function normalizeDailyVisualizationDailyProgress(progress: DailyVisualizationDailyProgress): DailyVisualizationDailyProgress {
  return {
    ...progress,
    taskIds: Array.isArray(progress.taskIds) ? progress.taskIds : [],
    stepIndex: progress.stepIndex ?? 0,
    status: progress.status ?? "in_progress",
    completedAt: progress.completedAt ?? null,
    startedLate: progress.startedLate ?? false,
    reinforcementTaskId: progress.reinforcementTaskId ?? null,
    immediateActionTaskId: progress.immediateActionTaskId ?? null,
    bodyScanNotes: Array.isArray(progress.bodyScanNotes) ? progress.bodyScanNotes : [],
  };
}

/** True only when today's own record exists AND is completed or explicitly bypassed -- a record from a DIFFERENT (earlier) day, or one still "in_progress", both count as "not done yet" (the first because it's stale, the second because resuming it is still pending). Governs whether the morning sequence AUTO-interrupts with the exercise -- "already bypassed" correctly means "don't push it on the trainee again this session," same as "already completed." */
export function isDailyVisualizationDoneForToday(progress: DailyVisualizationDailyProgress | null, todayDateLocal: string): boolean {
  if (!progress || progress.dateLocal !== todayDateLocal) return false;
  return progress.status === "completed" || progress.status === "bypassed";
}

/**
 * Nine Functional Improvements task, Improvement 6: "skipping means
 * 'not now', never 'completed' or 'never today.'" Deliberately NARROWER
 * than isDailyVisualizationDoneForToday above -- only an actually
 * COMPLETED record blocks re-opening. A "bypassed" record (today's
 * morning sequence was skipped) must still let the trainee open the
 * SAME existing "🧘 הכנה יומית" Home entry later and resume/start it,
 * never a silent "you already did this" dead end. Used ONLY by that
 * manual Home entry point -- the morning sequence's own auto-interrupt
 * decision correctly keeps using isDailyVisualizationDoneForToday above
 * (bypassed there means "don't re-push it on the trainee automatically
 * this session," a different question from "can they still open it").
 */
export function isDailyVisualizationCompletedForToday(progress: DailyVisualizationDailyProgress | null, todayDateLocal: string): boolean {
  if (!progress || progress.dateLocal !== todayDateLocal) return false;
  return progress.status === "completed";
}

/**
 * True when there's an interrupted record for TODAY specifically to
 * resume -- a stale record from an earlier day is never resumed (that
 * day is over; starting today's own fresh exercise is correct
 * instead).
 *
 * Nine Functional Improvements task, Improvement 6: also resumes a
 * "bypassed" record, not just "in_progress" -- a trainee who pressed
 * the in-exercise "דילוג על הוויזואליזציה היום" button partway through
 * (bypassDailyVisualizationProgress preserves stepIndex/taskIds/
 * bodyScanNotes exactly as they were) must come back to the SAME point
 * later, never discard that progress and restart from step 0. The
 * `taskIds.length > 0` guard excludes the OTHER kind of "bypassed"
 * record -- bypassDailyVisualizationForToday's own before-ever-opening
 * skip, which stores an empty placeholder (taskIds: []) precisely
 * because no real schedule was ever snapshotted; resuming THAT would
 * freeze the trainee into "zero tasks" even if real ones exist by the
 * time they come back, so it correctly falls through below to snapshot
 * today's ACTUAL current tasks fresh instead.
 */
export function resolveResumableProgress(progress: DailyVisualizationDailyProgress | null, todayDateLocal: string): DailyVisualizationDailyProgress | null {
  if (!progress || progress.dateLocal !== todayDateLocal) return null;
  const hasRealProgress = progress.status === "in_progress" || (progress.status === "bypassed" && progress.taskIds.length > 0);
  if (!hasRealProgress) return null;
  return progress;
}

/** The step this progress record is currently sitting at -- clamped, so a stale stepIndex (e.g. taskIds shrank somehow) can never index past the end. `tasks` must be the resolved Task list for progress.taskIds, in the same order (session.tasks already is). */
export function resolveCurrentStep(progress: DailyVisualizationDailyProgress, tasks: Task[]): DailyVisualizationStep {
  const steps = buildDailyVisualizationSteps(progress.taskIds, tasks);
  const index = Math.min(progress.stepIndex, steps.length - 1);
  return steps[index];
}

/** Advances to the next step, or marks the exercise completed once the final step itself is passed -- the ONLY way stepIndex ever changes going forward. */
export function advanceDailyVisualizationProgress(progress: DailyVisualizationDailyProgress, tasks: Task[], now: string): DailyVisualizationDailyProgress {
  const steps = buildDailyVisualizationSteps(progress.taskIds, tasks);
  const nextIndex = progress.stepIndex + 1;
  if (nextIndex >= steps.length) {
    return { ...progress, stepIndex: steps.length - 1, status: "completed", completedAt: now };
  }
  return { ...progress, stepIndex: nextIndex };
}

/** "Preserve a clearly labeled option to bypass the exercise... without deleting tasks or blocking access" -- marks TODAY's record bypassed from whatever step it was at, never touching taskIds/stepIndex (so the record remains an honest trace of how far they actually got). */
export function bypassDailyVisualizationProgress(progress: DailyVisualizationDailyProgress, now: string): DailyVisualizationDailyProgress {
  return { ...progress, status: "bypassed", completedAt: now };
}

// --- End-of-day reinforcement action (section 4 step 6) -------------------

/**
 * Builds the real Task fields for today's end-of-day reinforcement
 * action, or null when no action text was given (optional, section
 * 4/5: "never force" -- leaving it blank schedules nothing). Pure
 * field-building only; data/dailyVisualization.ts's own
 * commitDailyVisualizationReinforcementTask decides whether to create
 * a brand-new Task or update the one already tracked on this day's
 * own progress.reinforcementTaskId (never both, never a duplicate).
 */
export function buildReinforcementTaskFields(actionText: string, time: string, dateLocal: string): { title: string; scheduledDate: string; scheduledTime: string | null } | null {
  const trimmed = actionText.trim();
  if (!trimmed) return null;
  return { title: trimmed, scheduledDate: dateLocal, scheduledTime: time.trim() || null };
}

// --- Immediate priority action (section 4 step 5) --------------------------

/**
 * Final Morning Flow Requirements Audit task, section 3: the SAME
 * "build the Task fields, or null when blank" pattern as
 * buildReinforcementTaskFields above, for the OTHER emotion-
 * reinforcing action -- the immediate one, done right now rather than
 * scheduled for a specific later time, so it is simply added to
 * today's date with no scheduledTime (the exact same "today, no
 * specific time" convention live/ManifestVisualizationCard.tsx's own
 * addToSchedule already uses for its small daily action).
 */
export function buildImmediateActionTaskFields(actionText: string, dateLocal: string): { title: string; scheduledDate: string } | null {
  const trimmed = actionText.trim();
  if (!trimmed) return null;
  return { title: trimmed, scheduledDate: dateLocal };
}

// --- Resolving today's real, scheduled, relevant tasks (chronological) ---

/**
 * Every one of today's own real Tasks that still has something ahead
 * of it today -- current/overdue/next/laterToday, reusing
 * arc/todaySchedule.ts's own buildTodaySections bucketing verbatim
 * (never a second, competing categorization), merged into ONE
 * chronological list by each entry's own resolved clock time. Already-
 * completed-today and genuinely unscheduled tasks are excluded by
 * buildTodaySections itself -- there is nothing to visualize for a task
 * with no resolvable time, and nothing useful to visualize for one
 * already finished.
 */
export function resolveTodaysVisualizationTasks(tasks: Task[], completions: TaskOccurrenceCompletion[], now: Date): Task[] {
  const sections = buildTodaySections(tasks, completions, now);
  const entries = [
    ...(sections.current ? [sections.current] : []),
    ...sections.overdue,
    ...(sections.nextTask ? [sections.nextTask] : []),
    ...sections.laterToday,
  ];
  return entries
    .map((entry) => ({ task: entry.task, clockMs: resolveTaskClockTime(entry.task, entry.occurrenceDateLocal)?.getTime() ?? Infinity }))
    .sort((a, b) => a.clockMs - b.clockMs)
    .map((entry) => entry.task);
}

/** The earliest resolvable clock time among today's own relevant tasks -- null when there is nothing scheduled today at all (no alarm, no "first task" to prepare for). */
export function resolveFirstTaskClockTimeToday(tasks: Task[], completions: TaskOccurrenceCompletion[], now: Date): Date | null {
  const ordered = resolveTodaysVisualizationTasks(tasks, completions, now);
  if (ordered.length === 0) return null;
  const todayDateLocal = todayLocalDateString(now);
  return resolveTaskClockTime(ordered[0], todayDateLocal);
}

// --- Alarm timing (section 4: "30 minutes before the first scheduled task") ---

export const DAILY_VISUALIZATION_ALARM_MINUTES_BEFORE = 30;

/** Pure "when" math only -- data/dailyVisualizationAlarm.ts owns deciding whether/how to actually arm it. null in -> null out (nothing scheduled today -> no alarm time to compute). */
export function resolveDailyVisualizationAlarmTime(firstTaskClockTime: Date | null): Date | null {
  if (!firstTaskClockTime) return null;
  return new Date(firstTaskClockTime.getTime() - DAILY_VISUALIZATION_ALARM_MINUTES_BEFORE * 60 * 1000);
}

// --- Late start detection (section 6) ---

/** Started more than this many minutes after the alarm's own planned time counts as "late" for the end-of-exercise message -- a few minutes' grace for ordinary human pace, never flagged as "late" for a trivial delay. */
export const LATE_START_THRESHOLD_MINUTES = 10;

export function isVisualizationStartedLate(alarmFireAt: Date | null, startedAt: Date): boolean {
  if (!alarmFireAt) return false;
  return startedAt.getTime() - alarmFireAt.getTime() > LATE_START_THRESHOLD_MINUTES * 60 * 1000;
}

/**
 * "Only require schedule editing when there is a genuine scheduling
 * conflict, rather than merely because the alarm time was missed" --
 * a task is a genuine conflict only when ITS OWN scheduled clock time
 * has already passed by the time the exercise actually finished.
 * Starting late with no such passed task yet is never flagged.
 */
export function detectLateStartConflicts(visualizedTasks: Task[], completedAt: Date): Task[] {
  const todayDateLocal = todayLocalDateString(completedAt);
  return visualizedTasks.filter((task) => {
    const clock = resolveTaskClockTime(task, todayDateLocal);
    return clock !== null && clock.getTime() <= completedAt.getTime();
  });
}

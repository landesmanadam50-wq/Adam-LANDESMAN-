/**
 * data/dailyRoutine.ts
 *
 * Automatic Routine Builder: the thin storage I/O layer over
 * arc/dailyRoutine.ts's pure template model, plus the one piece of real
 * logic this layer owns -- MATERIALIZING a DailyRoutineTemplate into
 * real arc/tasks.ts Task records.
 *
 * Why materialize into real Tasks rather than invent a second
 * "scheduled item" entity: every existing Task LIVE/timer/ARC-window/
 * completion mechanism already works on Task, and arc/taskOccurrence.ts
 * already tracks per-day completion of a recurring Task without ever
 * needing to recreate it daily. So each RoutineTaskTemplate becomes ONE
 * persistent, recurring Task (daysOfWeek = every day), matched back to
 * its template entry by the new Task.routineTaskTemplateId field. The
 * template is therefore the single source of truth for WHEN a routine
 * task happens (its own generated scheduledTime is written onto the
 * Task), while the Task itself remains the single source of truth for
 * its own completion/timer/status history, exactly as before this
 * feature for every other kind of Task.
 *
 * A "today only" one-time addition is NEVER written into the template
 * -- it becomes a plain {kind:"once"} Task scoped to today's date, so
 * it can never leak into tomorrow's schedule or the recurring routine
 * (spec: "changes made only for today must not permanently modify the
 * recurring routine").
 */

import { archiveTask, createEmptyTask, generateTaskId, type RoutineBreakTemplate, type RoutinePeriodId, type Task } from "../arc/tasks.ts";
import { generateDailyRoutineSchedule, resolveNextContinuousTaskInPeriod, type DailyRoutineTemplate, type GeneratedRoutineSlot } from "../arc/dailyRoutine.ts";
import { resolveNextTaskInContinuousRoutineGroup } from "../arc/continuousRoutineGroup.ts";
import { loadContinuousRoutineGroupForTaskToday } from "./continuousRoutineGroup.ts";
import { loadDailyRoutineTemplate, loadTasks, loadTaskOccurrenceCompletions, saveDailyRoutineTemplate, saveTasks, upsertTask } from "./storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export { loadDailyRoutineTemplate, saveDailyRoutineTemplate };

/** Every day of the week -- a routine task template applies daily, within whichever period's time window it's placed in. */
const EVERY_DAY_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

function findMaterializedTask(tasks: Task[], templateTaskId: string): Task | undefined {
  return tasks.find((task) => task.routineTaskTemplateId === templateTaskId && task.status !== "archived");
}

function materializeSlot(slot: GeneratedRoutineSlot, existing: Task | undefined, now: string): Task {
  if (existing) {
    return {
      ...existing,
      title: slot.title,
      expectedDurationMinutes: slot.durationMinutes,
      scheduledTime: slot.startTime,
      routinePeriodId: slot.periodId,
      breakAfter: slot.breakAfter,
      updatedAt: now,
    };
  }
  const base = createEmptyTask(generateTaskId(), slot.title, slot.title, now);
  return {
    ...base,
    expectedDurationMinutes: slot.durationMinutes,
    scheduledTime: slot.startTime,
    recurrence: { kind: "recurring", daysOfWeek: EVERY_DAY_OF_WEEK },
    routineTaskTemplateId: slot.taskTemplateId,
    routinePeriodId: slot.periodId,
    breakAfter: slot.breakAfter,
  };
}

/**
 * Applies a (just-built or just-edited) DailyRoutineTemplate to real
 * Task records: upserts one recurring Task per RoutineTaskTemplate
 * (created the first time, updated in place on every later template
 * edit -- title/duration/time/break only, never touching the Task's
 * own status/completedAt/subtasks history), and ARCHIVES (never hard-
 * deletes -- see arc/tasks.ts's own module doc on why) any
 * previously-materialized routine Task whose template entry was
 * removed. Persists and returns the full updated task list.
 */
export async function materializeDailyRoutineTemplate(template: DailyRoutineTemplate, now: Date): Promise<Task[]> {
  const nowIso = now.toISOString();
  const generated = generateDailyRoutineSchedule(template);
  const allSlots = generated.periods.flatMap((period) => period.slots);
  const liveTemplateTaskIds = new Set(allSlots.map((slot) => slot.taskTemplateId));

  let tasks = await loadTasks();

  tasks = tasks.map((task) =>
    task.routineTaskTemplateId && task.status !== "archived" && !liveTemplateTaskIds.has(task.routineTaskTemplateId)
      ? archiveTask(task, nowIso)
      : task,
  );

  for (const slot of allSlots) {
    const existing = findMaterializedTask(tasks, slot.taskTemplateId);
    const materialized = materializeSlot(slot, existing, nowIso);
    tasks = existing ? tasks.map((task) => (task.id === materialized.id ? materialized : task)) : [...tasks, materialized];
  }

  await saveTasks(tasks);
  return tasks;
}

/**
 * Creates a "today only" routine task: a plain one-time Task, never
 * written into the template, scoped to `scheduledDateLocal`. Section 3
 * of the spec's two add-task choices -- the other (recurring) choice
 * is: edit the template (arc/dailyRoutine.ts's addTaskToTemplate) and
 * call materializeDailyRoutineTemplate.
 */
export async function addOneTimeRoutineTask(
  periodId: RoutinePeriodId,
  title: string,
  durationMinutes: number,
  scheduledTime: string,
  scheduledDateLocal: string,
  breakAfter: RoutineBreakTemplate | null,
  now: Date,
): Promise<Task> {
  const nowIso = now.toISOString();
  const base = createEmptyTask(generateTaskId(), title, title, nowIso);
  const task: Task = {
    ...base,
    expectedDurationMinutes: durationMinutes,
    scheduledTime,
    scheduledDate: scheduledDateLocal,
    recurrence: { kind: "once" },
    routinePeriodId: periodId,
    routineTaskTemplateId: null,
    breakAfter,
  };
  await upsertTask(task);
  return task;
}

export interface ContinuousRoutineOutcome {
  /** false for any task not in a "continuous"-mode period AND not in an ad-hoc continuous-routine group -- every completion call site falls back to its existing spaced/default behavior unchanged in that case. */
  isContinuous: boolean;
  /** Only meaningful when isContinuous is true. The next not-yet-completed-today task in the SAME period/group -- navigate straight to it, skipping the per-task reflection/smile exercise. null means the just-completed task was the last one for today -- show the one summary reflection instead. */
  nextTaskInPeriod: Task | null;
  /** Only meaningful when isContinuous is true -- the opaque key data/continuousRoutineGroup.ts's own addPendingContinuousRoutineSmiles/takePendingContinuousRoutineSmiles use to accumulate this routine's own combined smile total (requirement 9: "one combined smile-reward experience at the end"). Stable across every task in the SAME routine run, for the SAME day. */
  pendingSmilesGroupKey: string | null;
}

/**
 * Continuous vs. Spaced Routines task, extended by the Unified ARC &
 * Productivity Update task's own requirement 9 ("CONTINUOUS TASK
 * ROUTINES -- SMILES, NOT POINTS"): the ONE place every task-
 * completion call site (live/ActiveTaskScreen.tsx, build/
 * DailyScheduleScreen.tsx, build/TodayScreen.tsx) asks "does this
 * completion need the normal reflection/smile-exercise interruption,
 * or should it skip straight to the next task?". Call AFTER the task
 * is already marked complete and its smile reward already recorded
 * (arc/postTaskRewards.ts's recordTaskCompletion) -- this never
 * decides whether a reward is earned, only what the UI does next.
 *
 * An ad-hoc continuous-routine GROUP (requirement 9's own "select
 * multiple consecutive scheduled tasks and group them") is checked
 * FIRST -- it is the trainee's own explicit, just-made choice for
 * this exact set of tasks today, so it takes priority over whatever
 * the task's own routine PERIOD happens to be set to. Falls back to
 * the pre-existing per-period routineMode exactly as before when the
 * task is in no group at all.
 */
export async function resolveContinuousRoutineOutcome(task: Task, now: Date): Promise<ContinuousRoutineOutcome> {
  const group = await loadContinuousRoutineGroupForTaskToday(task.id, now);
  if (group) {
    const [tasks, completions] = await Promise.all([loadTasks(), loadTaskOccurrenceCompletions()]);
    const nextTaskInPeriod = resolveNextTaskInContinuousRoutineGroup(tasks, completions, group, task.id, now);
    return { isContinuous: true, nextTaskInPeriod, pendingSmilesGroupKey: `group:${group.id}` };
  }
  if (task.routinePeriodId === null) return { isContinuous: false, nextTaskInPeriod: null, pendingSmilesGroupKey: null };
  const template = await loadDailyRoutineTemplate();
  const mode = template?.periods[task.routinePeriodId]?.routineMode ?? "spaced";
  if (mode !== "continuous") return { isContinuous: false, nextTaskInPeriod: null, pendingSmilesGroupKey: null };
  const [tasks, completions] = await Promise.all([loadTasks(), loadTaskOccurrenceCompletions()]);
  const nextTaskInPeriod = resolveNextContinuousTaskInPeriod(tasks, completions, task.routinePeriodId, task.id, now);
  return { isContinuous: true, nextTaskInPeriod, pendingSmilesGroupKey: `period:${task.routinePeriodId}:${todayLocalDateString(now)}` };
}

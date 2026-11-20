/**
 * arc/floatingTimerOverlayPayload.ts
 *
 * Floating task timer task: the one pure computation behind the
 * floating-overlay/ongoing-notification bridge (data/floatingTimerOverlay.ts) --
 * what to actually show, given a TaskTimerRun and its task. Split out
 * from that I/O wrapper the same way arc/taskTimer.ts's own pure
 * getTaskTimerStatus is split from data/storage.ts's persistence, so
 * this one piece of real logic gets genuine unit tests instead of only
 * a source-text regression check.
 *
 * Mirrors live/ActiveTaskScreen.tsx's own `timerRunEnded`/`restRunEnded`
 * computation exactly: getTaskTimerStatus's own `complete` flag alone
 * misses a run finished EARLY (finishTaskTimerRunEarly sets completedAt
 * independently of elapsed time) -- without accounting for that here
 * too, an early-finished run would still report its own frozen mid-run
 * remainingSeconds, showing a stale countdown on the overlay instead of
 * the required "00:00 until the trainee picks how to continue"
 * (requirement 1).
 */

import { getTaskTimerStatus } from "./taskTimer.ts";
import type { TaskTimerRun } from "./taskTimer.ts";
import type { Task } from "./tasks.ts";
import { resolveNextActionStage } from "./taskStage.ts";
import type { TaskStageProgress } from "./taskStageProgress.ts";

/**
 * Lock-Screen Timer task, requirement 1: who the ongoing notification's
 * own "Next task" line (never to be confused with nextActionTitle
 * below, which is a different task's own NEXT STAGE) refers to --
 * resolved by the caller (data/dailyPlan.ts's resolveNextScheduledTaskDisplay,
 * via live/ActiveTaskScreen.tsx) and simply passed through here, since
 * this module stays a pure, IO-free computation.
 */
export interface NextScheduledTaskForOverlay {
  title: string;
  effectiveStartTime: string | null;
  /** ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the next scheduled task's own planned duration, shown alongside its name/start time in the unified panel's "next task" section. Optional -- omitted/undefined behaves exactly as before this task (no duration passed through). */
  durationMinutes?: number | null;
  /**
   * ARCHI -- Home-Screen Widget Sync task, section 4: whether this task's
   * own effectiveStartTime has already passed `now` -- the EXACT same
   * data/dailyPlan.ts's resolveNextScheduledTaskDisplay already computes
   * (isScheduledPlanEntryOverdue), never a second overdue calculation.
   * Optional -- omitted/undefined is treated as not overdue, so a caller
   * that genuinely never computed it (none remain after this task, but
   * this stays backward compatible) renders exactly as before.
   */
  isOverdue?: boolean;
}

export interface FloatingTimerOverlayPayload {
  taskId: string;
  /** The ongoing notification's own content title -- always the task's name, unchanged, regardless of stages. */
  title: string;
  remainingSeconds: number;
  paused: boolean;
  /** Lock-Screen Timer task, requirement 1: true only for the "I need rest" sub-timer (run.kind === "rest") -- the notification's own status word distinguishes "resting" from a plain paused task timer. */
  resting: boolean;
  overlayEnabled: boolean;
  /**
   * Unified Task Stages task, requirement 6: the overlay's own
   * PROMINENT display text -- the active stage's description for a
   * staged task, or (unchanged) the task's title for a legacy one.
   * Deliberately a SEPARATE field from `title` above: the notification
   * always names the task; only the overlay's own prominent text
   * becomes the current concrete action.
   */
  actionTitle: string;
  /** "Next action... displayed in smaller text" -- null when there is no next stage (legacy task, or already on the final/main stage), in which case the overlay shows no such line at all. */
  nextActionTitle: string | null;
  /** True only for a task with a configured stage breakdown that is currently mid-sequence -- the native overlay renders its own ✓ button only when this is true, never for a legacy task. */
  showCompleteButton: boolean;
  /** Lock-Screen Timer task, requirement 1: the NEXT SCHEDULED TASK's own name/time (never a next stage of THIS task) -- null when nothing else is scheduled today, in which case the notification shows no such line at all. */
  nextScheduledTaskTitle: string | null;
  nextScheduledTaskTime: string | null;
  /** ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the next scheduled task's own planned duration -- null together with the two fields above when nothing is scheduled. */
  nextScheduledTaskDurationMinutes: number | null;
  /** ARCHI -- Home-Screen Widget Sync task, section 4: true only when the next scheduled task's own effectiveStartTime has already passed -- "never display a past task as upcoming without indicating it is overdue." False (never invented true) when there is no next task at all. */
  nextScheduledTaskIsOverdue: boolean;
}

export function resolveFloatingTimerOverlayPayload(
  run: TaskTimerRun,
  task: Task,
  overlayEnabled: boolean,
  stageProgress: TaskStageProgress | null = null,
  now: number = Date.now(),
  nextScheduledTask: NextScheduledTaskForOverlay | null = null
): FloatingTimerOverlayPayload {
  const status = getTaskTimerStatus(run, now);
  const ended = run.completedAt !== null || status.complete;
  const activeStage = stageProgress && task.actionStages ? task.actionStages.find((stage) => stage.id === stageProgress.activeStageId) ?? null : null;
  const nextStage = activeStage && task.actionStages ? resolveNextActionStage(task.actionStages, activeStage.id) : null;
  return {
    taskId: task.id,
    title: task.title,
    remainingSeconds: ended ? 0 : status.remainingSeconds,
    paused: status.paused,
    resting: run.kind === "rest",
    overlayEnabled,
    actionTitle: activeStage ? activeStage.description : task.title,
    nextActionTitle: nextStage ? nextStage.description : null,
    showCompleteButton: activeStage !== null,
    nextScheduledTaskTitle: nextScheduledTask ? nextScheduledTask.title : null,
    nextScheduledTaskTime: nextScheduledTask ? nextScheduledTask.effectiveStartTime : null,
    nextScheduledTaskDurationMinutes: nextScheduledTask?.durationMinutes ?? null,
    nextScheduledTaskIsOverdue: nextScheduledTask?.isOverdue ?? false,
  };
}

/**
 * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
 * sections 2+3+8: the unified panel's IDLE-state payload -- no
 * TaskTimerRun exists at all (taskId: "", the EXACT same "no task"
 * sentinel OverlayService.kt's own openTaskLive()/openArcForTask()/
 * completeStageForTask() already check via `taskId.isEmpty()`, never a
 * second "is this idle" signal). Mirrors resolveFloatingTimerOverlayPayload's
 * own next-task fields exactly, so the native layer's rendering of
 * "what's next" is identical in both states, differing only in which
 * row (mood-row's 3rd smile vs. the current-task row) is shown.
 */
export function resolveIdleFloatingOverlayPayload(overlayEnabled: boolean, nextScheduledTask: NextScheduledTaskForOverlay | null = null): FloatingTimerOverlayPayload {
  return {
    taskId: "",
    title: "",
    remainingSeconds: 0,
    paused: false,
    resting: false,
    overlayEnabled,
    actionTitle: "",
    nextActionTitle: null,
    showCompleteButton: false,
    nextScheduledTaskTitle: nextScheduledTask ? nextScheduledTask.title : null,
    nextScheduledTaskTime: nextScheduledTask ? nextScheduledTask.effectiveStartTime : null,
    nextScheduledTaskDurationMinutes: nextScheduledTask?.durationMinutes ?? null,
    nextScheduledTaskIsOverdue: nextScheduledTask?.isOverdue ?? false,
  };
}

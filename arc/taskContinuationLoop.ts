/**
 * arc/taskContinuationLoop.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, sections
 * 7-10: the pure state machine behind Task LIVE's "do you want to
 * continue?" loop. Genuinely new -- no analog exists in this codebase;
 * arc/taskSplitPlan.ts's TaskSplitProgress models a PRE-PLANNED,
 * upfront multi-segment split decided before starting (for a To-Do
 * item specifically), while this models an OPEN-ENDED loop whose next
 * step is decided reactively, after each segment/break/ARC practice
 * ends, for any task. The two are deliberately separate and can coexist.
 *
 * No AsyncStorage, no navigation, no React here; data/taskContinuationLoop.ts
 * is the thin single-slot I/O wrapper (same single-slot discipline as
 * TaskTimerRun).
 */
import { resolveFreeMinutesUntilNextTask } from "./dailyPlan.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";

export type TaskContinuationLoopPhase = "working" | "break" | "arc" | "choosing_action" | "ended";

export type TaskContinuationLoopEndReason = "completed" | "user_stopped" | "next_task_boundary";

export interface TaskContinuationLoopSegment {
  startedAt: string;
  /** null while this segment is still the active one. */
  endedAt: string | null;
  minutes: number;
}

/**
 * `taskId` is always the ORIGINAL task's id (never the shrunk child's),
 * so every segment/break/ARC-practice recorded here stays attributable
 * to the one real history the trainee cares about; `activeTaskId` is
 * whichever Task is actually being timed right now -- the original, or
 * a shrunk child created mid-loop by arc/taskAdaptation.ts -- so the
 * loop survives a shrink without losing its own identity.
 */
export interface TaskContinuationLoopState {
  taskId: string;
  activeTaskId: string;
  phase: TaskContinuationLoopPhase;
  segments: TaskContinuationLoopSegment[];
  totalWorkedSeconds: number;
  lastArcTrack: "full" | "shortened" | "none" | null;
  endReason: TaskContinuationLoopEndReason | null;
  createdAt: string;
  updatedAt: string;
}

export function startTaskContinuationLoop(taskId: string, now: string): TaskContinuationLoopState {
  return {
    taskId,
    activeTaskId: taskId,
    phase: "working",
    segments: [{ startedAt: now, endedAt: null, minutes: 0 }],
    totalWorkedSeconds: 0,
    lastArcTrack: null,
    endReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Closes the active segment, folds its real elapsed time into totalWorkedSeconds (never reset by anything else in this module), and moves to "choosing_action" so the caller can render the continue/shorten/shrink/break/ARC/finish menu. */
export function recordSegmentEnd(state: TaskContinuationLoopState, elapsedSeconds: number, now: string): TaskContinuationLoopState {
  const segments = [...state.segments];
  const lastIndex = segments.length - 1;
  if (lastIndex >= 0 && segments[lastIndex].endedAt === null) {
    segments[lastIndex] = { ...segments[lastIndex], endedAt: now, minutes: elapsedSeconds / 60 };
  }
  return { ...state, segments, totalWorkedSeconds: state.totalWorkedSeconds + Math.max(0, elapsedSeconds), phase: "choosing_action", updatedAt: now };
}

/** Starts a brand-new work segment (same task or, after a shrink, a new activeTaskId) -- "continue same," "continue shortened," and "another work segment after a shrink" are all this one call, differing only in the duration the caller chooses to start the real timer with. */
export function startNextSegment(state: TaskContinuationLoopState, activeTaskId: string, now: string): TaskContinuationLoopState {
  return { ...state, activeTaskId, phase: "working", segments: [...state.segments, { startedAt: now, endedAt: null, minutes: 0 }], updatedAt: now };
}

export function enterBreak(state: TaskContinuationLoopState, now: string): TaskContinuationLoopState {
  return { ...state, phase: "break", updatedAt: now };
}

export function exitBreak(state: TaskContinuationLoopState, now: string): TaskContinuationLoopState {
  return { ...state, phase: "choosing_action", updatedAt: now };
}

/** Never allowed while already "arc" -- the caller must check `state.phase !== "arc"` before navigating into an ARC session, satisfying "never run two ARC sessions in parallel" at the state level (the UI layer is expected to simply not offer the button while this would be a no-op). */
export function enterArc(state: TaskContinuationLoopState, track: "full" | "shortened", now: string): TaskContinuationLoopState {
  if (state.phase === "arc") return state;
  return { ...state, phase: "arc", lastArcTrack: track, updatedAt: now };
}

/** Returning from ARC always lands back on "choosing_action" -- never silently back to "working" (the trainee re-confirms what to do next, exactly once, rather than an ARC session silently auto-resuming a timer). */
export function exitArcBackToLoop(state: TaskContinuationLoopState, now: string): TaskContinuationLoopState {
  return { ...state, phase: "choosing_action", updatedAt: now };
}

export function endTaskContinuationLoop(state: TaskContinuationLoopState, reason: TaskContinuationLoopEndReason, now: string): TaskContinuationLoopState {
  return { ...state, phase: "ended", endReason: reason, updatedAt: now };
}

/**
 * Thin wrapper over arc/dailyPlan.ts's own resolveFreeMinutesUntilNextTask
 * -- never reimplements "how long until the next scheduled task" math.
 * null means no next task is scheduled today at all (the caller lets the
 * trainee set an explicit end time or end manually, per the user's own
 * spec for that case).
 */
export function resolveLoopHardStopMinutes(state: TaskContinuationLoopState, scheduled: ScheduledPlanEntry[], now: Date): number | null {
  return resolveFreeMinutesUntilNextTask(scheduled, now, state.taskId);
}

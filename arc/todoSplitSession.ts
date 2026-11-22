/**
 * arc/todoSplitSession.ts
 *
 * Smart To-Do List task, optional splitting: a tiny single-slot side
 * record marking which To-Do item the CURRENT TaskTimerRun was started
 * as a partial ("split") session for, and how many minutes were
 * explicitly planned for this one session -- exact same shape/lifecycle
 * precedent as arc/taskStageProgress.ts's own TaskStageProgress
 * (data/storage.ts persists both side by side, cleared together by the
 * SAME clearTaskTimerRun() -- see that file's own doc). Created only on
 * an explicit trainee confirmation of a split suggestion, never
 * auto-started; read once at completion time to decide whether this
 * session's elapsed minutes should be recorded as partial progress
 * (arc/tasks.ts's own recordTodoSplitProgress) instead of an ordinary
 * full completion.
 */

export interface TodoSplitSession {
  taskId: string;
  plannedMinutes: number;
}

export function createTodoSplitSession(taskId: string, plannedMinutes: number): TodoSplitSession {
  return { taskId, plannedMinutes };
}

/** Backfills a record saved before a later field existed. */
export function normalizeTodoSplitSession(session: TodoSplitSession): TodoSplitSession {
  return { ...session, plannedMinutes: typeof session.plannedMinutes === "number" ? session.plannedMinutes : 0 };
}

/**
 * arc/taskTimerEndChoice.ts
 *
 * Hebrew BUILD/LIVE rework spec, page 4 ("בסיום הזמן"): the three
 * choices offered once a task's timer ends -- "ARC" (open the linked
 * practice, or choose one if none is linked), "מנוחה" (choose a rest
 * duration and start its own timer), "המשך לפעולה הבאה" (show the next
 * task and a start button for its own timer). Deliberately separate
 * from "the task is complete" -- the spec's own explicit distinction
 * ("הפרד בין 'הטיימר הסתיים' לבין 'המשימה הושלמה'"): reaching this
 * choice never marks the task done, and completing the task (or adding
 * more time) is always still available independently, via
 * arc/tasks.ts's completeTask/setTaskCurrentAction, never through this
 * module.
 *
 * Pure types + resolution logic only -- no storage, no notifications,
 * no UI. Reused identically by the foreground in-app banner and (once
 * built) any notification action-button handling, so the three choices
 * are defined in exactly one place.
 */

export type TaskTimerEndChoice = "start_arc" | "rest" | "next_task";

export const TASK_TIMER_END_CHOICE_LABELS: Record<TaskTimerEndChoice, string> = {
  start_arc: "ARC",
  rest: "מנוחה",
  next_task: "המשך לפעולה הבאה",
};

export const REST_DURATION_OPTIONS_MINUTES = [2, 5, 10, 15];
export const DEFAULT_REST_DURATION_MINUTES = 5;

/**
 * "ARC" opens the task's own linked practice when one exists, or asks
 * the trainee to choose one otherwise -- never silently skipping or
 * picking a practice on the trainee's behalf.
 */
export function resolveArcChoiceDestination(linkedArcBuildId: string | null): { kind: "open_linked"; arcBuildId: string } | { kind: "choose_one" } {
  return linkedArcBuildId ? { kind: "open_linked", arcBuildId: linkedArcBuildId } : { kind: "choose_one" };
}

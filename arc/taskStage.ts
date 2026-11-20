/**
 * arc/taskStage.ts
 *
 * Unified Task Stages task: a task's own optional breakdown into up to
 * three sequential, named action stages -- environmental trigger
 * action (optional), small action (optional), main action (always
 * present once a task opts into this at all). This is the STATIC
 * TEMPLATE only (description/cue/duration) -- never a Task's own live
 * completion state, which lives in arc/taskStageProgress.ts's own
 * per-run record instead. Keeping completion off this template is what
 * makes a RECURRING task's stages correctly shared and re-usable across
 * every occurrence (Monday's "trigger done" must never still read as
 * done on Wednesday) -- the exact same reasoning arc/taskReflection.ts's
 * own doc already established for this app's recurring-task model.
 *
 * `null` on Task.actionStages (or an empty array) means "this task has
 * no stage breakdown at all" -- the pre-existing, single-timer,
 * firstAction/currentAction-driven behavior, completely untouched. A
 * task only ever has a stage breakdown because the trainee explicitly
 * built one in the task editor.
 *
 * Order is fixed by KIND, never a separately-stored order integer: at
 * most one stage of each kind can exist, and the sequence trigger ->
 * small -> main is exactly what the product spec itself names Stage
 * 1/2/3 -- there is no scenario where re-ordering them independently of
 * their own kind would ever make sense. This still satisfies "a fixed
 * sequence position" per stage -- the position is fixed, just derived
 * rather than duplicated as a second field that could drift out of
 * sync with kind.
 */

export type TaskActionStageKind = "trigger" | "small" | "main";

export interface TaskActionStage {
  id: string;
  kind: TaskActionStageKind;
  /** A concrete, user-written action description -- e.g. "לוקח את הספר ומניח אותו על השולחן." Never inferred or invented. */
  description: string;
  /** Only meaningful for kind "trigger" -- the resulting environmental cue once the trigger action is performed (e.g. "הספר מונח על השולחן"). Optional: a trigger stage can exist with this left blank, in which case the cue-visualization step falls back to describing the trigger's own saved action rather than inventing new detail. Always null for "small"/"main". */
  cueDescription: string | null;
  durationMinutes: number;
}

export function createTaskActionStage(id: string, kind: TaskActionStageKind, description: string, durationMinutes: number, cueDescription: string | null = null): TaskActionStage {
  return { id, kind, description, cueDescription: kind === "trigger" ? cueDescription : null, durationMinutes };
}

/** Backfills a stage saved before a later field existed -- same normalize-at-load-time convention as every other record in this codebase. */
export function normalizeTaskActionStage(stage: TaskActionStage): TaskActionStage {
  return { ...stage, cueDescription: stage.kind === "trigger" ? stage.cueDescription ?? null : null, durationMinutes: stage.durationMinutes ?? 0 };
}

const STAGE_KIND_ORDER: Record<TaskActionStageKind, number> = { trigger: 0, small: 1, main: 2 };

/** The fixed trigger -> small -> main order -- see this module's own doc for why that's derived from kind, never a stored order field. */
export function orderedActionStages(stages: TaskActionStage[]): TaskActionStage[] {
  return [...stages].sort((a, b) => STAGE_KIND_ORDER[a.kind] - STAGE_KIND_ORDER[b.kind]);
}

export function findActionStageByKind(stages: TaskActionStage[], kind: TaskActionStageKind): TaskActionStage | null {
  return stages.find((stage) => stage.kind === kind) ?? null;
}

/** "Every task must have a main action" once it opts into stages at all -- true only when a non-empty stages array has exactly a main stage present; a stages array with no main stage is treated as not-yet-valid by the editor's own validation, never silently tolerated here. */
export function hasConfiguredActionStages(stages: TaskActionStage[] | null): boolean {
  return Array.isArray(stages) && stages.length > 0 && findActionStageByKind(stages, "main") !== null;
}

/** "Total planned task duration" -- requirement 3's own worked example (2 + 3 + 25 = 30). Used to keep Task.expectedDurationMinutes in sync at save time so every pre-existing consumer of that one field (duration badges, auto-scheduling, alarm timing) keeps working unchanged, never needing to know stages exist at all. */
export function sumActionStageDurations(stages: TaskActionStage[]): number {
  return stages.reduce((total, stage) => total + stage.durationMinutes, 0);
}

/** The stage immediately after `afterStageId` in fixed order, or null once `afterStageId` is already the last (main) stage. */
export function resolveNextActionStage(stages: TaskActionStage[], afterStageId: string): TaskActionStage | null {
  const ordered = orderedActionStages(stages);
  const index = ordered.findIndex((stage) => stage.id === afterStageId);
  if (index === -1) return null;
  return ordered[index + 1] ?? null;
}

export function resolveFirstActionStage(stages: TaskActionStage[]): TaskActionStage {
  return orderedActionStages(stages)[0];
}

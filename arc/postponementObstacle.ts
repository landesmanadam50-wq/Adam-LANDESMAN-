/**
 * arc/postponementObstacle.ts
 *
 * Smart Postponement Flow: pure data model for the outcome record each
 * of the three "what's stopping you from starting" interventions
 * (Emotional Difficulty / Need for Rest / Make the Task Smaller)
 * writes. No AsyncStorage, no navigation, no React -- same split as
 * every other arc/*.ts module.
 *
 * Deliberately NOT append-only like arc/taskJournal.ts's
 * TaskJournalEntry: the whole point of this record is to learn, LATER,
 * whether the trainee actually started the original task afterward (or
 * completed the smaller step) -- facts that are only known after the
 * record is first created. So this is an upsert-by-id record (same
 * convention as Task/PlannedArc), not a strict immutable log.
 *
 * Requirement 6's own warning -- "avoid claiming ARC caused
 * improvement solely because the user started the task afterward" --
 * is a UI/interpretation concern, not a storage one: this module
 * records plain, neutral facts (which reason was picked, whether the
 * task was started afterward) and asserts no causal relationship
 * between them. Nothing here, or anywhere reading this data, should
 * present "started afterward" as proof an intervention "worked".
 */

export type PostponementObstacleReason = "emotional" | "rest" | "smaller_task";

export interface PostponementObstacleOutcome {
  id: string;
  /** The ORIGINAL task the trainee was about to postpone -- never the smaller step's own id. */
  taskId: string;
  reason: PostponementObstacleReason;
  /** Minutes spent on the intervention itself: the ARC session's own duration, the chosen rest duration, or the smaller task's own chosen duration. null until known. */
  interventionDurationMinutes: number | null;
  /** Only set for reason === "smaller_task" -- the id of the temporary step Task created from it. */
  smallerTaskId: string | null;
  /** null = not yet known (the trainee may still be mid-flow, or simply hasn't acted). Never inferred -- only ever set by an explicit action (starting the original task, or explicitly returning to the schedule instead). */
  startedOriginalTaskAfter: boolean | null;
  /** Only meaningful when smallerTaskId is set. null until the smaller step either completes or the flow is otherwise resolved. */
  smallerStepCompleted: boolean | null;
  createdAt: string;
  updatedAt: string;
}

/** Same stable-id-string pattern as arc/tasks.ts's generateTaskId. */
export function generatePostponementObstacleOutcomeId(): string {
  return `postpone-obstacle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPostponementObstacleOutcome(id: string, taskId: string, reason: PostponementObstacleReason, now: string): PostponementObstacleOutcome {
  return {
    id,
    taskId,
    reason,
    interventionDurationMinutes: null,
    smallerTaskId: null,
    startedOriginalTaskAfter: null,
    smallerStepCompleted: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function recordInterventionDuration(outcome: PostponementObstacleOutcome, minutes: number, now: string): PostponementObstacleOutcome {
  return { ...outcome, interventionDurationMinutes: minutes, updatedAt: now };
}

export function recordSmallerTaskCreated(outcome: PostponementObstacleOutcome, smallerTaskId: string, now: string): PostponementObstacleOutcome {
  return { ...outcome, smallerTaskId, updatedAt: now };
}

export function recordStartedOriginalTaskAfter(outcome: PostponementObstacleOutcome, started: boolean, now: string): PostponementObstacleOutcome {
  return { ...outcome, startedOriginalTaskAfter: started, updatedAt: now };
}

export function recordSmallerStepCompleted(outcome: PostponementObstacleOutcome, completed: boolean, now: string): PostponementObstacleOutcome {
  return { ...outcome, smallerStepCompleted: completed, updatedAt: now };
}

/** The most recently created outcome for a given ORIGINAL task, or null -- used to find "is there a pending postponement outcome for this task whose started-flag isn't known yet" without guessing which of possibly several past postponements is relevant. */
export function findLatestOutcomeForTask(outcomes: PostponementObstacleOutcome[], taskId: string): PostponementObstacleOutcome | null {
  const matches = outcomes.filter((outcome) => outcome.taskId === taskId);
  if (matches.length === 0) return null;
  return matches.reduce((latest, candidate) => (candidate.createdAt > latest.createdAt ? candidate : latest));
}

export function findOutcomeBySmallerTaskId(outcomes: PostponementObstacleOutcome[], smallerTaskId: string): PostponementObstacleOutcome | null {
  return outcomes.find((outcome) => outcome.smallerTaskId === smallerTaskId) ?? null;
}

export function upsertPostponementObstacleOutcomeInList(outcomes: PostponementObstacleOutcome[], outcome: PostponementObstacleOutcome): PostponementObstacleOutcome[] {
  const index = outcomes.findIndex((existing) => existing.id === outcome.id);
  if (index === -1) return [...outcomes, outcome];
  const next = [...outcomes];
  next[index] = outcome;
  return next;
}

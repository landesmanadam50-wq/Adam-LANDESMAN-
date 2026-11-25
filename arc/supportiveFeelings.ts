/**
 * arc/supportiveFeelings.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section 3:
 * the data model for "supportive feelings" and "internal actions" a
 * trainee can attach to any task. Deliberately a DIFFERENT concept from
 * arc/preparationStates.ts's own PreparationStateId/StateProfile (a
 * single, optional, scripted pre-task ritual) -- this model is
 * per-task-MULTIPLE, free-text-capable, and learned by effectiveness
 * (arc/internalActionRating.ts). Three distinct things, never conflated:
 * (1) the external task itself, (2) the supportive internal FEELING that
 * can help the trainee do it, (3) the internal ACTION that evokes/
 * strengthens that feeling.
 *
 * No AsyncStorage, no navigation, no React here -- same split as every
 * other arc/*.ts module; data/supportiveFeelings.ts is the thin I/O
 * wrapper.
 */

export interface SupportiveFeeling {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternalAction {
  id: string;
  feelingId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** Many-to-many: a task can have several supportive feelings, and the same feeling can be reused across tasks. */
export interface TaskFeelingLink {
  id: string;
  taskId: string;
  feelingId: string;
  createdAt: string;
}

/** Many-to-many: a feeling can have several internal actions, and the same action can be reused across feelings. */
export interface FeelingActionLink {
  id: string;
  feelingId: string;
  actionId: string;
  createdAt: string;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSupportiveFeeling(label: string, now: string): SupportiveFeeling {
  return { id: generateId("supportive-feeling"), label: label.trim(), createdAt: now, updatedAt: now };
}

export function createInternalAction(feelingId: string, text: string, now: string): InternalAction {
  return { id: generateId("internal-action"), feelingId, text: text.trim(), createdAt: now, updatedAt: now };
}

export function createTaskFeelingLink(taskId: string, feelingId: string, now: string): TaskFeelingLink {
  return { id: generateId("task-feeling-link"), taskId, feelingId, createdAt: now };
}

export function createFeelingActionLink(feelingId: string, actionId: string, now: string): FeelingActionLink {
  return { id: generateId("feeling-action-link"), feelingId, actionId, createdAt: now };
}

export function upsertSupportiveFeelingInList(feelings: SupportiveFeeling[], feeling: SupportiveFeeling): SupportiveFeeling[] {
  const index = feelings.findIndex((existing) => existing.id === feeling.id);
  if (index === -1) return [...feelings, feeling];
  const next = [...feelings];
  next[index] = feeling;
  return next;
}

export function deleteSupportiveFeelingFromList(feelings: SupportiveFeeling[], id: string): SupportiveFeeling[] {
  return feelings.filter((feeling) => feeling.id !== id);
}

export function upsertInternalActionInList(actions: InternalAction[], action: InternalAction): InternalAction[] {
  const index = actions.findIndex((existing) => existing.id === action.id);
  if (index === -1) return [...actions, action];
  const next = [...actions];
  next[index] = action;
  return next;
}

export function deleteInternalActionFromList(actions: InternalAction[], id: string): InternalAction[] {
  return actions.filter((action) => action.id !== id);
}

/**
 * Deleting a feeling/action removes its link rows -- but historical
 * InternalActionUsage rows (arc/internalActionRating.ts) are NEVER
 * deleted alongside it, so the personal-ranking history always survives
 * even past a deleted bank entry (same "tolerate a deleted/archived
 * target" rule arc/preparationStates.ts's own resolvePreparationSource
 * already follows -- a usage row referencing a missing feelingId/
 * actionId just resolves its display text defensively, see
 * arc/internalActionRating.ts).
 */
export function deleteTaskFeelingLinksForFeeling(links: TaskFeelingLink[], feelingId: string): TaskFeelingLink[] {
  return links.filter((link) => link.feelingId !== feelingId);
}

export function deleteFeelingActionLinksForAction(links: FeelingActionLink[], actionId: string): FeelingActionLink[] {
  return links.filter((link) => link.actionId !== actionId);
}

export function addTaskFeelingLink(links: TaskFeelingLink[], taskId: string, feelingId: string, now: string): TaskFeelingLink[] {
  if (links.some((link) => link.taskId === taskId && link.feelingId === feelingId)) return links;
  return [...links, createTaskFeelingLink(taskId, feelingId, now)];
}

export function addFeelingActionLink(links: FeelingActionLink[], feelingId: string, actionId: string, now: string): FeelingActionLink[] {
  if (links.some((link) => link.feelingId === feelingId && link.actionId === actionId)) return links;
  return [...links, createFeelingActionLink(feelingId, actionId, now)];
}

export function removeTaskFeelingLink(links: TaskFeelingLink[], taskId: string, feelingId: string): TaskFeelingLink[] {
  return links.filter((link) => !(link.taskId === taskId && link.feelingId === feelingId));
}

export function removeFeelingActionLink(links: FeelingActionLink[], feelingId: string, actionId: string): FeelingActionLink[] {
  return links.filter((link) => !(link.feelingId === feelingId && link.actionId === actionId));
}

/** Every feeling linked to this task, in link-creation order (oldest first, matching the order the trainee added them in). */
export function resolveFeelingsForTask(
  taskId: string,
  taskFeelingLinks: TaskFeelingLink[],
  feelings: SupportiveFeeling[]
): SupportiveFeeling[] {
  const feelingIds = taskFeelingLinks.filter((link) => link.taskId === taskId).map((link) => link.feelingId);
  return feelingIds.map((id) => feelings.find((feeling) => feeling.id === id)).filter((feeling): feeling is SupportiveFeeling => feeling !== undefined);
}

/** Every internal action linked to this feeling, in link-creation order. Unranked -- see arc/internalActionRating.ts for the effectiveness-ranked variant used by the real-time selection flow. */
export function resolveActionsForFeeling(feelingId: string, feelingActionLinks: FeelingActionLink[], actions: InternalAction[]): InternalAction[] {
  const actionIds = feelingActionLinks.filter((link) => link.feelingId === feelingId).map((link) => link.actionId);
  return actionIds.map((id) => actions.find((action) => action.id === id)).filter((action): action is InternalAction => action !== undefined);
}

/** Case-insensitive, trimmed label match -- so "typing a new one" that happens to match an existing feeling's label reuses it instead of creating a near-duplicate. */
export function findSupportiveFeelingByLabel(feelings: SupportiveFeeling[], label: string): SupportiveFeeling | null {
  const normalized = label.trim().toLowerCase();
  return feelings.find((feeling) => feeling.label.trim().toLowerCase() === normalized) ?? null;
}

/** Same case-insensitive reuse rule for internal actions, scoped to one feeling (the same action TEXT under two different feelings is two separate InternalAction rows, since "what it means" differs by feeling). */
export function findInternalActionByText(actions: InternalAction[], feelingId: string, text: string): InternalAction | null {
  const normalized = text.trim().toLowerCase();
  return actions.find((action) => action.feelingId === feelingId && action.text.trim().toLowerCase() === normalized) ?? null;
}

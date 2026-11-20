/**
 * arc/positiveMemory.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, section 2
 * ("Positive memory library") + section 16 ("Data model and
 * persistence"): pure data model + logic for the ONE persistent
 * library holding every documented positive experience and success --
 * no AsyncStorage, no navigation, no React (same split as every other
 * arc/*.ts module; see arc/arcGym.ts's own doc for the house
 * convention).
 *
 * Section 1: "A success may also include positive feelings, allowing
 * the same memory to be used in both ARC Success and regular ARC
 * encoding" -- this is why eventType distinguishes "success" from
 * "positive_feeling" while BOTH share the exact same `feelings[]`
 * field: a success memory with no documented feelings is only ever
 * eligible for ARC Success selection (arc/positiveMemorySelection.ts's
 * own success-based strategy); the moment it has one or more
 * `feelings`, it becomes eligible for feeling-based Encoding selection
 * too, automatically, with no second record and no manual flag.
 *
 * Section 2's own "optional recurring task template ID": this
 * codebase has no separate recurring-task-template entity -- a
 * recurring Task (arc/tasks.ts, `recurrence.kind === "recurring"`) IS
 * its own template, keeping the SAME Task.id across every future
 * occurrence (confirmed by this same task's earlier Stage E work on
 * ARC Learning review scheduling). `taskId` below therefore already
 * covers both "linked to one specific (one-time) task" and "linked to
 * a recurring task's own template" -- section 14's "a success
 * associated with a recurring task should remain available for future
 * occurrences of that task" is satisfied for free, since taskId never
 * changes across occurrences. A second, separate field would just be
 * a permanent duplicate of this one.
 *
 * Section 2's "optional ARC Goal ID": modeled as `linkedGoalIds:
 * string[]` (ArcGymGoal.id values) -- the SAME many-to-many
 * linking convention arc/arcResult.ts's own linkedGoalIds already
 * uses, never a second shape for "a set of ids."
 */

export type PositiveMemoryEventType = "success" | "positive_feeling";

/**
 * Section 2: "support multiple feelings associated with one event,
 * including different moments for each feeling." `feeling` is a plain
 * string so it can hold either one of
 * arc/positiveFeelingOptions.ts's suggested words or free-typed custom
 * text -- exactly like Encoding's own customSupportiveFeelingText.
 */
export interface PositiveMemoryFeelingEntry {
  feeling: string;
  /** Section 2: "specific moment when each feeling occurred." */
  moment: string;
  /** Section 2: "optional feeling intensity" -- a self-rated 1-5 scale, null when not rated. */
  intensity: number | null;
}

export interface PositiveMemory {
  id: string;
  eventType: PositiveMemoryEventType;
  title: string;
  description: string;
  feelings: PositiveMemoryFeelingEntry[];
  location: string | null;
  /** The event's own date/time -- distinct from createdAt/updatedAt below, which track when the RECORD was saved/edited, not when the real experience happened. */
  occurredAt: string;
  whatWasSpecial: string;
  /** Section 2: "description of the successful action, if applicable" -- null for a pure positive_feeling event, a real (possibly later-added) string for a success. */
  successDescription: string | null;
  taskId: string | null;
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generatePositiveMemoryId(): string {
  return `positive-memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Minimal required fields only -- every optional field starts at its true "not yet entered" state, never a fabricated placeholder. `occurredAt` defaults to `now` (section 5/6's own "use a reasonable default for the date and time, but allow correction"). */
export function createPositiveMemory(id: string, eventType: PositiveMemoryEventType, title: string, now: string): PositiveMemory {
  return {
    id,
    eventType,
    title: title.trim(),
    description: "",
    feelings: [],
    location: null,
    occurredAt: now,
    whatWasSpecial: "",
    successDescription: null,
    taskId: null,
    linkedGoalIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updatePositiveMemory(
  memory: PositiveMemory,
  patch: Partial<Pick<PositiveMemory, "title" | "description" | "location" | "occurredAt" | "whatWasSpecial" | "successDescription" | "taskId">>,
  now: string
): PositiveMemory {
  return {
    ...memory,
    title: patch.title !== undefined ? patch.title.trim() : memory.title,
    description: patch.description !== undefined ? patch.description : memory.description,
    location: patch.location !== undefined ? patch.location : memory.location,
    occurredAt: patch.occurredAt !== undefined ? patch.occurredAt : memory.occurredAt,
    whatWasSpecial: patch.whatWasSpecial !== undefined ? patch.whatWasSpecial : memory.whatWasSpecial,
    successDescription: patch.successDescription !== undefined ? patch.successDescription : memory.successDescription,
    taskId: patch.taskId !== undefined ? patch.taskId : memory.taskId,
    updatedAt: now,
  };
}

/** Section 2: "allow users to... change their associated tasks or feelings" -- the one setter for the whole feelings array (the editing UI builds its own full list, then calls this once, never a sequence of granular add/remove calls that could drift). */
export function setPositiveMemoryFeelings(memory: PositiveMemory, feelings: PositiveMemoryFeelingEntry[], now: string): PositiveMemory {
  return { ...memory, feelings, updatedAt: now };
}

/** Section 2: "link existing events to additional relevant goals" -- idempotent, same shape as arc/arcResult.ts's own linkGoalToArcResultExercise. */
export function linkGoalToPositiveMemory(memory: PositiveMemory, goalId: string, now: string): PositiveMemory {
  if (memory.linkedGoalIds.includes(goalId)) return memory;
  return { ...memory, linkedGoalIds: [...memory.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkGoalFromPositiveMemory(memory: PositiveMemory, goalId: string, now: string): PositiveMemory {
  if (!memory.linkedGoalIds.includes(goalId)) return memory;
  return { ...memory, linkedGoalIds: memory.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

export function upsertPositiveMemoryInList(memories: PositiveMemory[], memory: PositiveMemory): PositiveMemory[] {
  const index = memories.findIndex((existing) => existing.id === memory.id);
  if (index === -1) return [...memories, memory];
  const next = [...memories];
  next[index] = memory;
  return next;
}

/** Never cascades -- deleting a memory never touches its linked task or goals. */
export function deletePositiveMemoryFromList(memories: PositiveMemory[], id: string): PositiveMemory[] {
  return memories.filter((memory) => memory.id !== id);
}

export function resolvePositiveMemoriesForTask(memories: PositiveMemory[], taskId: string): PositiveMemory[] {
  return memories.filter((memory) => memory.taskId === taskId);
}

/** Section 8's own criterion 1 ("exact feeling match"): a case/whitespace-insensitive compare, since a trainee typing a custom feeling a second time should still match their own earlier wording. */
export function resolvePositiveMemoriesForFeeling(memories: PositiveMemory[], feeling: string): PositiveMemory[] {
  const normalized = feeling.trim().toLowerCase();
  if (!normalized) return [];
  return memories.filter((memory) => memory.feelings.some((entry) => entry.feeling.trim().toLowerCase() === normalized));
}

export function resolvePositiveMemoriesByEventType(memories: PositiveMemory[], eventType: PositiveMemoryEventType): PositiveMemory[] {
  return memories.filter((memory) => memory.eventType === eventType);
}

/** Backfills a memory saved before a field existed -- called once per record by data/storage.ts's own loadPositiveMemories, same convention as every other normalize<Type> in this codebase. */
export function normalizePositiveMemory(memory: PositiveMemory, now: string): PositiveMemory {
  return {
    ...memory,
    eventType: memory.eventType === "positive_feeling" ? "positive_feeling" : "success",
    description: typeof memory.description === "string" ? memory.description : "",
    feelings: Array.isArray(memory.feelings) ? memory.feelings : [],
    location: typeof memory.location === "string" ? memory.location : null,
    occurredAt: typeof memory.occurredAt === "string" ? memory.occurredAt : now,
    whatWasSpecial: typeof memory.whatWasSpecial === "string" ? memory.whatWasSpecial : "",
    successDescription: typeof memory.successDescription === "string" ? memory.successDescription : null,
    taskId: typeof memory.taskId === "string" ? memory.taskId : null,
    linkedGoalIds: Array.isArray(memory.linkedGoalIds) ? memory.linkedGoalIds : [],
    createdAt: typeof memory.createdAt === "string" ? memory.createdAt : now,
    updatedAt: typeof memory.updatedAt === "string" ? memory.updatedAt : now,
  };
}

/**
 * arc/positiveMemoryDraft.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, section 7
 * ("Automatic draft saving") + section 16 ("PositiveMemoryDraft"): a
 * COLLECTION of in-progress documentation attempts, deliberately
 * SEPARATE from arc/positiveMemory.ts's own finalized PositiveMemory
 * collection -- "an automatically saved draft is not a completed
 * positive memory... do not make unfinished drafts available for
 * automatic ARC memory selection." This split makes that rule
 * structural: arc/positiveMemorySelection.ts only ever reads the
 * PositiveMemory collection, which a draft never enters until a
 * trainee explicitly finalizes it (finalizePositiveMemoryDraft
 * below). "Support multiple independent drafts" is why this is a
 * collection (keyed by id), never a single resumable slot like
 * arc/arcFocusSession.ts's own in-progress session.
 *
 * Pure data model + logic only -- no AsyncStorage, no navigation, no
 * React, same split as every other arc/*.ts module.
 */

import { createPositiveMemory, setPositiveMemoryFeelings, updatePositiveMemory } from "./positiveMemory.ts";
import type { PositiveMemory, PositiveMemoryEventType, PositiveMemoryFeelingEntry } from "./positiveMemory.ts";

/** Mirrors PositiveMemory's own editable surface (everything except id/createdAt/updatedAt) -- every field starts at its true "not yet entered" state. */
export interface PositiveMemoryDraftFields {
  title: string;
  description: string;
  feelings: PositiveMemoryFeelingEntry[];
  location: string | null;
  occurredAt: string | null;
  whatWasSpecial: string;
  successDescription: string | null;
  linkedGoalIds: string[];
}

function createEmptyDraftFields(): PositiveMemoryDraftFields {
  return { title: "", description: "", feelings: [], location: null, occurredAt: null, whatWasSpecial: "", successDescription: null, linkedGoalIds: [] };
}

export interface PositiveMemoryDraft {
  id: string;
  eventType: PositiveMemoryEventType;
  /** Free-form, screen-defined step id (e.g. "task_link", "what_happened", "feelings") -- section 7: "save the current documentation step," resumed verbatim by whichever wizard screen reads it. */
  currentStep: string;
  fields: PositiveMemoryDraftFields;
  /** Section 7: "preserve the associated task" -- the task context this draft was opened from/for, independent of whatever `fields.successDescription` etc. the trainee has typed so far. */
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generatePositiveMemoryDraftId(): string {
  return `positive-memory-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPositiveMemoryDraft(id: string, eventType: PositiveMemoryEventType, firstStep: string, now: string, taskId: string | null = null): PositiveMemoryDraft {
  return { id, eventType, currentStep: firstStep, fields: createEmptyDraftFields(), taskId, createdAt: now, updatedAt: now };
}

/** Section 7: "save entered text as it changes" -- a shallow merge, so a caller only ever passes the fields that actually changed. */
export function updatePositiveMemoryDraftFields(draft: PositiveMemoryDraft, patch: Partial<PositiveMemoryDraftFields>, now: string): PositiveMemoryDraft {
  return { ...draft, fields: { ...draft.fields, ...patch }, updatedAt: now };
}

export function setPositiveMemoryDraftStep(draft: PositiveMemoryDraft, step: string, now: string): PositiveMemoryDraft {
  if (draft.currentStep === step) return draft;
  return { ...draft, currentStep: step, updatedAt: now };
}

/**
 * Section 4: "allow the user to return and change the selected event
 * type without losing compatible information already entered." Every
 * field that exists for both types (title/description/feelings/
 * location/occurredAt/whatWasSpecial/linkedGoalIds) is kept verbatim;
 * only `successDescription` -- meaningless for a positive_feeling
 * event -- is cleared when switching away from "success" (switching
 * back to "success" later starts that one field fresh, never
 * resurrecting stale text that was never re-confirmed for this type).
 */
export function setPositiveMemoryDraftEventType(draft: PositiveMemoryDraft, eventType: PositiveMemoryEventType, now: string): PositiveMemoryDraft {
  if (draft.eventType === eventType) return draft;
  return {
    ...draft,
    eventType,
    fields: { ...draft.fields, successDescription: eventType === "success" ? draft.fields.successDescription : null },
    updatedAt: now,
  };
}

export function upsertPositiveMemoryDraftInList(drafts: PositiveMemoryDraft[], draft: PositiveMemoryDraft): PositiveMemoryDraft[] {
  const index = drafts.findIndex((existing) => existing.id === draft.id);
  if (index === -1) return [...drafts, draft];
  const next = [...drafts];
  next[index] = draft;
  return next;
}

/** Section 7: "allow users to delete unwanted drafts." Never touches the finalized PositiveMemory collection -- a draft and its (if ever created) finalized memory are two separate records entirely. */
export function deletePositiveMemoryDraftFromList(drafts: PositiveMemoryDraft[], id: string): PositiveMemoryDraft[] {
  return drafts.filter((draft) => draft.id !== id);
}

export function resolvePositiveMemoryDraftsForTask(drafts: PositiveMemoryDraft[], taskId: string): PositiveMemoryDraft[] {
  return drafts.filter((draft) => draft.taskId === taskId);
}

/** Newest-updated first -- the natural order for "continue previous documentation" when more than one draft exists. */
export function sortPositiveMemoryDraftsNewestFirst(drafts: PositiveMemoryDraft[]): PositiveMemoryDraft[] {
  return [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Section 12/5/6: the ONE place a draft becomes a real, finalized
 * PositiveMemory -- every wizard's own "שמור הצלחה"/"שמור כהצלחה
 * חדשה"/save button calls this exactly once, never duplicating the
 * field-mapping by hand. Pure -- the caller still owns actually
 * persisting the result and then deleting the now-consumed draft.
 */
export function finalizePositiveMemoryDraft(draft: PositiveMemoryDraft, memoryId: string, now: string): PositiveMemory {
  const base = createPositiveMemory(memoryId, draft.eventType, draft.fields.title, now);
  const withFields = updatePositiveMemory(
    base,
    {
      description: draft.fields.description,
      location: draft.fields.location,
      occurredAt: draft.fields.occurredAt ?? now,
      whatWasSpecial: draft.fields.whatWasSpecial,
      successDescription: draft.fields.successDescription,
      taskId: draft.taskId,
    },
    now
  );
  const withFeelings = setPositiveMemoryFeelings(withFields, draft.fields.feelings, now);
  return { ...withFeelings, linkedGoalIds: draft.fields.linkedGoalIds, createdAt: now, updatedAt: now };
}

/** Backfills a draft saved before a field existed. */
export function normalizePositiveMemoryDraft(draft: PositiveMemoryDraft, now: string): PositiveMemoryDraft {
  const fields = draft.fields && typeof draft.fields === "object" ? draft.fields : createEmptyDraftFields();
  return {
    ...draft,
    eventType: draft.eventType === "positive_feeling" ? "positive_feeling" : "success",
    currentStep: typeof draft.currentStep === "string" ? draft.currentStep : "task_link",
    fields: {
      title: typeof fields.title === "string" ? fields.title : "",
      description: typeof fields.description === "string" ? fields.description : "",
      feelings: Array.isArray(fields.feelings) ? fields.feelings : [],
      location: typeof fields.location === "string" ? fields.location : null,
      occurredAt: typeof fields.occurredAt === "string" ? fields.occurredAt : null,
      whatWasSpecial: typeof fields.whatWasSpecial === "string" ? fields.whatWasSpecial : "",
      successDescription: typeof fields.successDescription === "string" ? fields.successDescription : null,
      linkedGoalIds: Array.isArray(fields.linkedGoalIds) ? fields.linkedGoalIds : [],
    },
    taskId: typeof draft.taskId === "string" ? draft.taskId : null,
    createdAt: typeof draft.createdAt === "string" ? draft.createdAt : now,
    updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : now,
  };
}

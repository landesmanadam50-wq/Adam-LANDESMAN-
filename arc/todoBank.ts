/**
 * arc/todoBank.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 1: pure data model + logic for the reusable To-Do
 * bank that lives inside the Fixed Weekly Routine -- a trainee creates
 * a bank item once and can place it onto any flexible day repeatedly.
 * No AsyncStorage, no navigation, no React (same split as every other
 * arc/*.ts module).
 *
 * Deliberately NOT a Task: a bank item never carries urgency,
 * importance, or an expected timer duration ("במאגר לא מגדירים דחיפות,
 * חשיבות או משך טיימר"). Placing a bank item onto a flexible day
 * creates an ORDINARY per-day To-Do Task (arc/tasks.ts, `isTodoItem:
 * true`) with its own fresh `todoUrgency`/`todoImportance` (default 5)
 * and a pure, optional `todoBankItemId` back-reference to this record
 * -- mirroring `routineTaskTemplateId`'s own "template id on the
 * materialized record" shape (arc/dailyRoutine.ts/data/dailyRoutine.ts's
 * Automatic Routine Builder). Because the day-occurrence is a normal
 * To-Do Task, every existing mechanism (resolveTodoList,
 * compareTodoPriority, resolveEffectiveTodoOrder,
 * resolveCurrentTaskStateWithTodoSuggestion, the split-session
 * machinery, TimePlanningModal's own rating-chip UI) already applies
 * to it unmodified -- this module never duplicates any of that.
 *
 * Completing or removing a day-occurrence never touches the bank item
 * it was placed from, and editing/archiving a bank item never touches
 * an already-placed day-occurrence Task -- the two are independent
 * records by construction, satisfying "השלמת משימה או הסרתה מהיום
 * הגמיש לא מוחקת אותה מהמאגר" directly.
 *
 * Build/To-Do Action-Type Integration task: unlike urgency/importance/
 * duration (deliberately per-placement-only, see above), a bank item
 * CAN carry its own `linkedAction`/`linkedArcGymMemoryExerciseIds` --
 * the trainee is choosing WHAT the task fundamentally is (e.g. "always
 * an ARC Writing session"), not WHEN/how urgently to do it, so this is
 * exactly the kind of configuration a reusable template should hold.
 * Placing the item onto a day (build/TimePlanningModal.tsx's own
 * handleAddFromBank) copies both fields onto the fresh day-occurrence
 * Task, using the exact same `arc/taskLinkedAction.ts` infrastructure
 * every fixed/weekly task and To-Do item already shares -- never a
 * second, bank-specific linking mechanism.
 */

import type { TaskLinkedAction } from "./taskLinkedAction.ts";

export interface TodoBankItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  linkedAction: TaskLinkedAction | null;
  linkedArcGymMemoryExerciseIds: string[];
}

export function generateTodoBankItemId(): string {
  return `todo-bank-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTodoBankItem(id: string, title: string, now: string): TodoBankItem {
  return { id, title: title.trim(), createdAt: now, updatedAt: now, archived: false, linkedAction: null, linkedArcGymMemoryExerciseIds: [] };
}

export function normalizeTodoBankItem(item: TodoBankItem): TodoBankItem {
  return {
    ...item,
    title: typeof item.title === "string" ? item.title : "",
    archived: item.archived ?? false,
    linkedAction: item.linkedAction ?? null,
    linkedArcGymMemoryExerciseIds: item.linkedArcGymMemoryExerciseIds ?? [],
  };
}

export function renameTodoBankItem(item: TodoBankItem, title: string, now: string): TodoBankItem {
  return { ...item, title: title.trim(), updatedAt: now };
}

/** Sets (or clears, via null) the bank item's own linked action -- the same `TaskLinkedAction` shape every Task uses, never a bank-specific variant. */
export function updateTodoBankItemLinkedAction(item: TodoBankItem, linkedAction: TaskLinkedAction | null, now: string): TodoBankItem {
  return { ...item, linkedAction, updatedAt: now };
}

/** Replaces the bank item's own linked ARC Memory exercise ids -- the same array shape every Task uses. */
export function updateTodoBankItemLinkedMemoryExercises(item: TodoBankItem, linkedArcGymMemoryExerciseIds: string[], now: string): TodoBankItem {
  return { ...item, linkedArcGymMemoryExerciseIds, updatedAt: now };
}

export function archiveTodoBankItem(item: TodoBankItem, now: string): TodoBankItem {
  return { ...item, archived: true, updatedAt: now };
}

export function upsertTodoBankItemInList(items: TodoBankItem[], next: TodoBankItem): TodoBankItem[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

/** Active (not archived) bank items, oldest-created first -- the exact set `build/TodoBankScreen.tsx` and `build/TimePlanningModal.tsx`'s own "+ הוסף מהמאגר" picker both show. */
export function listActiveTodoBankItems(items: TodoBankItem[]): TodoBankItem[] {
  return items.filter((item) => !item.archived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

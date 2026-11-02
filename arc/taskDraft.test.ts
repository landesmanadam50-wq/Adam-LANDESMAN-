import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import {
  addSubtaskToDraft,
  buildTaskFromDraft,
  createEmptyTaskDraft,
  emptyTaskBase,
  removeSubtaskFromDraft,
  taskDraftFromTask,
  toggleRecurrenceDayInDraft,
  validateTaskDraft,
} from "./taskDraft.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("createEmptyTaskDraft starts fully blank, once-only recurrence", () => {
  const draft = createEmptyTaskDraft();
  assert.equal(draft.title, "");
  assert.equal(draft.recurrenceKind, "once");
  assert.deepEqual(draft.recurrenceDays, []);
  assert.deepEqual(draft.subtasks, []);
});

test("taskDraftFromTask round-trips every field, including a numeric duration as text", () => {
  const task = { ...createEmptyTask("t1", "כותרת", "פעולה", NOW), expectedDurationMinutes: 25, scheduledDate: "2026-01-06", scheduledTime: "09:30" };
  const draft = taskDraftFromTask(task);
  assert.equal(draft.title, "כותרת");
  assert.equal(draft.expectedDurationMinutes, "25");
  assert.equal(draft.scheduledDate, "2026-01-06");
  assert.equal(draft.scheduledTime, "09:30");
});

test("validateTaskDraft requires a title, and otherwise passes an empty, fully blank draft", () => {
  assert.deepEqual(validateTaskDraft(createEmptyTaskDraft()), ["כותרת היא שדה חובה."]);
  assert.deepEqual(validateTaskDraft({ ...createEmptyTaskDraft(), title: "כותרת" }), []);
});

test("validateTaskDraft rejects a negative duration but accepts zero and a blank field", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת" };
  assert.deepEqual(validateTaskDraft({ ...base, expectedDurationMinutes: "-5" }), ["משך הזמן המתוכנן לא יכול להיות שלילי."]);
  assert.deepEqual(validateTaskDraft({ ...base, expectedDurationMinutes: "0" }), []);
  assert.deepEqual(validateTaskDraft({ ...base, expectedDurationMinutes: "" }), []);
});

test("validateTaskDraft rejects a malformed scheduledDate/scheduledTime but accepts blank", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת" };
  assert.deepEqual(validateTaskDraft({ ...base, scheduledDate: "not-a-date" }), ["תאריך מתוכנן לא תקין (פורמט: YYYY-MM-DD)."]);
  assert.deepEqual(validateTaskDraft({ ...base, scheduledDate: "2026-01-06" }), []);
  assert.deepEqual(validateTaskDraft({ ...base, scheduledTime: "25:99" }), ["שעה מתוכננת לא תקינה (פורמט: HH:MM)."]);
  assert.deepEqual(validateTaskDraft({ ...base, scheduledTime: "09:30" }), []);
});

test("validateTaskDraft requires at least one recurrence day when recurring", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת", recurrenceKind: "recurring" as const };
  assert.deepEqual(validateTaskDraft(base), ["משימה חזרתית חייבת לפחות יום אחד בשבוע."]);
  assert.deepEqual(validateTaskDraft({ ...base, recurrenceDays: [1, 3] }), []);
});

test("addSubtaskToDraft trims and ignores a blank title; removeSubtaskFromDraft removes exactly one by id", () => {
  let draft = createEmptyTaskDraft();
  draft = addSubtaskToDraft(draft, "  draft outline  ");
  draft = addSubtaskToDraft(draft, "   ");
  assert.equal(draft.subtasks.length, 1);
  assert.equal(draft.subtasks[0].title, "draft outline");
  assert.equal(draft.subtasks[0].completed, false);

  draft = addSubtaskToDraft(draft, "second");
  const idToRemove = draft.subtasks[0].id;
  draft = removeSubtaskFromDraft(draft, idToRemove);
  assert.equal(draft.subtasks.length, 1);
  assert.equal(draft.subtasks[0].title, "second");
});

test("toggleRecurrenceDayInDraft adds then removes a day, keeping the list sorted", () => {
  let draft = createEmptyTaskDraft();
  draft = toggleRecurrenceDayInDraft(draft, 3);
  draft = toggleRecurrenceDayInDraft(draft, 1);
  assert.deepEqual(draft.recurrenceDays, [1, 3]);
  draft = toggleRecurrenceDayInDraft(draft, 1);
  assert.deepEqual(draft.recurrenceDays, [3]);
});

test("buildTaskFromDraft on a brand-new base sets every field and defaults currentAction to the trimmed firstAction", () => {
  const draft = { ...createEmptyTaskDraft(), title: "  כותרת  ", firstAction: "  פעולה  ", value: "ערך", identity: "זהות" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.title, "כותרת");
  assert.equal(built.firstAction, "פעולה");
  assert.equal(built.currentAction, "פעולה");
  assert.equal(built.value, "ערך");
  assert.equal(built.identity, "זהות");
  assert.equal(built.status, "planned");
});

test("buildTaskFromDraft on an EXISTING task preserves status/postponement/notification/completion fields the draft never touches", () => {
  const existing = { ...createEmptyTask("t1", "old", "old action", NOW), status: "active" as const, notificationId: "notif-1", completedAt: null };
  const draft = { ...taskDraftFromTask(existing), title: "new title" };
  const built = buildTaskFromDraft(draft, existing, "2026-01-06T00:00:00.000Z");
  assert.equal(built.title, "new title");
  assert.equal(built.status, "active", "editing must never silently reset status");
  assert.equal(built.notificationId, "notif-1");
  assert.equal(built.updatedAt, "2026-01-06T00:00:00.000Z");
});

test("buildTaskFromDraft clears a recurrence back to 'once' and maps recurring days correctly", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", recurrenceKind: "recurring" as const, recurrenceDays: [0, 6] };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.deepEqual(built.recurrence, { kind: "recurring", daysOfWeek: [0, 6] });

  const onceDraft = { ...draft, recurrenceKind: "once" as const };
  const builtOnce = buildTaskFromDraft(onceDraft, emptyTaskBase("t1", NOW), NOW);
  assert.deepEqual(builtOnce.recurrence, { kind: "once" });
});

test("buildTaskFromDraft null-clears every optional free-text/link field left blank", () => {
  const draft = createEmptyTaskDraft();
  const built = buildTaskFromDraft({ ...draft, title: "כותרת" }, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.description, null);
  assert.equal(built.scheduledDate, null);
  assert.equal(built.scheduledTime, null);
  assert.equal(built.expectedDurationMinutes, null);
  assert.equal(built.value, null);
  assert.equal(built.identity, null);
  assert.equal(built.defaultSupportiveStateId, null);
  assert.equal(built.linkedArcGoalId, null);
  assert.equal(built.linkedArcBuildId, null);
});

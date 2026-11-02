import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveTask,
  completeTask,
  createEmptyTask,
  deleteTaskFromList,
  generateTaskId,
  generateTaskJournalEntryId,
  generateTaskSubtaskId,
  normalizeTask,
  pauseTask,
  postponeTask,
  setTaskCurrentAction,
  startTask,
  toggleTaskSubtaskCompletion,
  unarchiveTask,
  upsertTaskInList,
} from "./tasks.ts";
import type { Task } from "./tasks.ts";

const NOW = "2026-09-26T12:00:00.000Z";
const LATER = "2026-09-26T13:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask("task-1", "Write the report", "Open the document", NOW), ...overrides };
}

test("createEmptyTask defaults currentAction to firstAction and starts in planned status with no goal/value/identity/state links", () => {
  const task = createEmptyTask("task-1", "Write the report", "Open the document", NOW);
  assert.equal(task.title, "Write the report");
  assert.equal(task.firstAction, "Open the document");
  assert.equal(task.currentAction, "Open the document");
  assert.equal(task.status, "planned");
  assert.equal(task.recurrence.kind, "once");
  assert.equal(task.linkedArcGoalId, null);
  assert.equal(task.value, null);
  assert.equal(task.identity, null);
  assert.equal(task.defaultSupportiveStateId, null);
  assert.deepEqual(task.subtasks, []);
  assert.equal(task.schemaVersion, 1);
});

test("normalizeTask backfills every field on a record missing everything added after ship, without throwing", () => {
  const legacy = { id: "task-2", title: "Legacy task", createdAt: NOW, updatedAt: NOW } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.description, null);
  assert.equal(normalized.scheduledDate, null);
  assert.equal(normalized.scheduledTime, null);
  assert.equal(normalized.expectedDurationMinutes, null);
  assert.equal(normalized.firstAction, "");
  assert.equal(normalized.currentAction, null);
  assert.deepEqual(normalized.subtasks, []);
  assert.deepEqual(normalized.recurrence, { kind: "once" });
  assert.equal(normalized.linkedArcGoalId, null);
  assert.equal(normalized.linkedArcBuildId, null);
  assert.equal(normalized.value, null);
  assert.equal(normalized.identity, null);
  assert.equal(normalized.defaultSupportiveStateId, null);
  assert.equal(normalized.status, "planned");
  assert.equal(normalized.postponementReason, null);
  assert.equal(normalized.returnAt, null);
  assert.equal(normalized.notificationId, null);
  assert.equal(normalized.notificationScheduledFor, null);
  assert.equal(normalized.completedAt, null);
  assert.equal(normalized.schemaVersion, 1);
});

test("normalizeTask falls back currentAction to firstAction when only currentAction is missing", () => {
  const legacy = { ...makeTask(), currentAction: undefined } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.currentAction, "Open the document");
});

test("normalizeTask never overwrites fields that are already present", () => {
  const task = makeTask({ description: "Quarterly numbers", status: "active", scheduledDate: "2026-09-27" });
  const normalized = normalizeTask(task);
  assert.equal(normalized.description, "Quarterly numbers");
  assert.equal(normalized.status, "active");
  assert.equal(normalized.scheduledDate, "2026-09-27");
});

test("startTask sets status to active and clears any leftover postponement fields", () => {
  const postponed = postponeTask(makeTask({ status: "postponed" }), "too tired", "2026-09-27T09:00:00.000Z", NOW);
  const restarted = startTask(postponed, LATER);
  assert.equal(restarted.status, "active");
  assert.equal(restarted.postponementReason, null);
  assert.equal(restarted.returnAt, null);
  assert.equal(restarted.updatedAt, LATER);
});

test("pauseTask only changes status and updatedAt", () => {
  const active = startTask(makeTask(), NOW);
  const paused = pauseTask(active, LATER);
  assert.equal(paused.status, "paused");
  assert.equal(paused.updatedAt, LATER);
  assert.equal(paused.title, active.title);
  assert.equal(paused.firstAction, active.firstAction);
});

test("postponeTask records the reason and return time, and supports returnAt: null as the explicit unscheduled outcome", () => {
  const withReturnTime = postponeTask(makeTask(), "waiting on a reply", "2026-09-27T09:00:00.000Z", NOW);
  assert.equal(withReturnTime.status, "postponed");
  assert.equal(withReturnTime.postponementReason, "waiting on a reply");
  assert.equal(withReturnTime.returnAt, "2026-09-27T09:00:00.000Z");

  const unscheduled = postponeTask(makeTask(), "not sure when", null, NOW);
  assert.equal(unscheduled.status, "postponed");
  assert.equal(unscheduled.returnAt, null);
});

test("completeTask sets completedAt and clears any leftover postponement fields", () => {
  const postponed = postponeTask(makeTask(), "later", "2026-09-27T09:00:00.000Z", NOW);
  const completed = completeTask(postponed, LATER);
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedAt, LATER);
  assert.equal(completed.postponementReason, null);
  assert.equal(completed.returnAt, null);
});

test("archiveTask hides the task (status archived) and clears any leftover postponement fields, without deleting it", () => {
  const postponed = postponeTask(makeTask(), "too tired", "2026-09-27T09:00:00.000Z", NOW);
  const archived = archiveTask(postponed, LATER);
  assert.equal(archived.status, "archived");
  assert.equal(archived.postponementReason, null);
  assert.equal(archived.returnAt, null);
  assert.equal(archived.updatedAt, LATER);
  assert.equal(archived.title, postponed.title, "archiving must never lose the task's own data");
});

test("unarchiveTask returns an archived task to planned, never to completed", () => {
  const archived = archiveTask(makeTask(), NOW);
  const restored = unarchiveTask(archived, LATER);
  assert.equal(restored.status, "planned");
  assert.equal(restored.updatedAt, LATER);
});

test("toggleTaskSubtaskCompletion flips only the matching subtask, leaving every other subtask and field untouched", () => {
  const task = makeTask({
    subtasks: [
      { id: "sub-1", title: "Draft outline", completed: false },
      { id: "sub-2", title: "Add charts", completed: false },
    ],
  });
  const toggled = toggleTaskSubtaskCompletion(task, "sub-1", LATER);
  assert.equal(toggled.subtasks[0].completed, true);
  assert.equal(toggled.subtasks[1].completed, false);
  assert.equal(toggled.updatedAt, LATER);

  const toggledBack = toggleTaskSubtaskCompletion(toggled, "sub-1", NOW);
  assert.equal(toggledBack.subtasks[0].completed, false);
});

test("setTaskCurrentAction narrows the current action without touching firstAction", () => {
  const task = makeTask();
  const narrowed = setTaskCurrentAction(task, "Open just the intro section", LATER);
  assert.equal(narrowed.currentAction, "Open just the intro section");
  assert.equal(narrowed.firstAction, "Open the document");
  assert.equal(narrowed.updatedAt, LATER);
});

test("upsertTaskInList appends a new task and replaces an existing one by id, never duplicating", () => {
  const first = makeTask({ id: "task-1" });
  const second = makeTask({ id: "task-2", title: "Second task" });
  const withBoth = upsertTaskInList(upsertTaskInList([], first), second);
  assert.equal(withBoth.length, 2);

  const updatedFirst = { ...first, title: "Renamed" };
  const withUpdate = upsertTaskInList(withBoth, updatedFirst);
  assert.equal(withUpdate.length, 2);
  assert.equal(withUpdate.find((task) => task.id === "task-1")?.title, "Renamed");
});

test("deleteTaskFromList removes exactly the matching task and is a no-op for an unknown id", () => {
  const tasks = [makeTask({ id: "task-1" }), makeTask({ id: "task-2" })];
  const afterDelete = deleteTaskFromList(tasks, "task-1");
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, "task-2");

  const noop = deleteTaskFromList(tasks, "task-does-not-exist");
  assert.equal(noop.length, 2);
});

test("generateTaskId / generateTaskSubtaskId / generateTaskJournalEntryId produce distinct, correctly-prefixed ids", () => {
  const taskIds = new Set(Array.from({ length: 20 }, () => generateTaskId()));
  assert.equal(taskIds.size, 20);
  for (const id of taskIds) assert.match(id, /^task-/);

  const subtaskIds = new Set(Array.from({ length: 20 }, () => generateTaskSubtaskId()));
  assert.equal(subtaskIds.size, 20);
  for (const id of subtaskIds) assert.match(id, /^task-subtask-/);

  const journalIds = new Set(Array.from({ length: 20 }, () => generateTaskJournalEntryId()));
  assert.equal(journalIds.size, 20);
  for (const id of journalIds) assert.match(id, /^task-journal-/);
});

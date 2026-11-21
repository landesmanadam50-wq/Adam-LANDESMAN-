import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveTask,
  completeTask,
  createEmptyTask,
  deleteTaskFromList,
  ensureTimePlanningTaskInList,
  findActiveTask,
  generateTaskId,
  generateTaskJournalEntryId,
  generateTaskSubtaskId,
  normalizeTask,
  pauseTask,
  postponeTask,
  setTaskCurrentAction,
  startTask,
  TIME_PLANNING_DEFAULT_DURATION_MINUTES,
  TIME_PLANNING_TASK_ID,
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
  assert.equal(task.order, null, "Fixed Weekly Routine / Flexible Daily Routine task: no manual order override by default -- sorts by time");
  assert.equal(task.calendarEntryKind, null, "no standalone break/ARC marker by default -- an ordinary task");
});

test("normalizeTask backfills every field on a record missing everything added after ship, without throwing", () => {
  const legacy = { id: "task-2", title: "Legacy task", createdAt: NOW, updatedAt: NOW } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.description, null);
  assert.equal(normalized.location, null, "Final Morning Flow Requirements Audit task: backfilled to null, same as every other optional field added after ship");
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
  assert.equal(normalized.purposeManifestId, null);
  assert.equal(normalized.purposeManifestGoalId, null);
  assert.equal(normalized.purposeManifestTaskOrder, null);
  assert.equal(normalized.order, null, "Fixed Weekly Routine / Flexible Daily Routine task: backfilled to null, same as every other optional field added after ship");
  assert.equal(normalized.calendarEntryKind, null);
  assert.equal(normalized.arcLearningReviewTopicId, null, "ARC Learning + ARC Creativity + Integrated Spaced Repetition task: backfilled to null, same as every other optional field added after ship");
  assert.equal(normalized.arcWritingTextId, null, "ARC Writing & ARC Book task: backfilled to null, same as every other optional field added after ship");
  assert.equal(normalized.arcWritingChapterId, null, "ARC Writing & ARC Book task: backfilled to null, same as every other optional field added after ship");
  assert.equal(normalized.schemaVersion, 1);
});

test("normalizeTask falls back currentAction to firstAction when only currentAction is missing", () => {
  const legacy = { ...makeTask(), currentAction: undefined } as unknown as Task;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.currentAction, "Open the document");
});

test("createEmptyTask defaults location to null -- optional, never required", () => {
  const task = createEmptyTask("task-1", "Write the report", "Open the document", NOW);
  assert.equal(task.location, null);
});

test("createEmptyTask defaults arcLearningReviewTopicId to null -- meaningless for every taskKind except arcLearningReview, where null means every topic", () => {
  const task = createEmptyTask("task-1", "Write the report", "Open the document", NOW);
  assert.equal(task.arcLearningReviewTopicId, null);
});

test("normalizeTask never overwrites an already-set arcLearningReviewTopicId", () => {
  const task = { ...makeTask(), arcLearningReviewTopicId: "topic-1" };
  const normalized = normalizeTask(task);
  assert.equal(normalized.arcLearningReviewTopicId, "topic-1");
});

test("createEmptyTask defaults arcWritingTextId/arcWritingChapterId to null -- meaningless for every taskKind except arcWriting, where exactly one of the two is set", () => {
  const task = createEmptyTask("task-1", "Write the report", "Open the document", NOW);
  assert.equal(task.arcWritingTextId, null);
  assert.equal(task.arcWritingChapterId, null);
  assert.equal(task.taskKind, "standard");
});

test("normalizeTask never overwrites an already-set arcWritingTextId/arcWritingChapterId, and taskKind accepts 'arcWriting'", () => {
  const task = { ...makeTask(), taskKind: "arcWriting" as const, arcWritingTextId: "text-1", arcWritingChapterId: null };
  const normalized = normalizeTask(task);
  assert.equal(normalized.taskKind, "arcWriting");
  assert.equal(normalized.arcWritingTextId, "text-1");
  assert.equal(normalized.arcWritingChapterId, null);
});

test("normalizeTask never overwrites fields that are already present", () => {
  const task = makeTask({ description: "Quarterly numbers", location: "המשרד", status: "active", scheduledDate: "2026-09-27" });
  const normalized = normalizeTask(task);
  assert.equal(normalized.description, "Quarterly numbers");
  assert.equal(normalized.location, "המשרד");
  assert.equal(normalized.status, "active");
  assert.equal(normalized.scheduledDate, "2026-09-27");
});

test("normalizeTask never overwrites an already-set order/calendarEntryKind", () => {
  const task = makeTask({ order: 3, calendarEntryKind: "break" });
  const normalized = normalizeTask(task);
  assert.equal(normalized.order, 3);
  assert.equal(normalized.calendarEntryKind, "break");
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

// --- Nine Functional Improvements task, Improvement 2 (time-planning task + timer) ---

test("ensureTimePlanningTaskInList creates the reserved time-planning task with a default duration when none exists yet", () => {
  const { task, tasks } = ensureTimePlanningTaskInList([], NOW);
  assert.equal(task.id, TIME_PLANNING_TASK_ID);
  assert.equal(task.expectedDurationMinutes, TIME_PLANNING_DEFAULT_DURATION_MINUTES);
  assert.equal(task.taskKind, "standard");
  assert.equal(task.scheduledDate, null, "must stay unscheduled so it never clutters FlexibleDailyScreen's own daily list");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, TIME_PLANNING_TASK_ID);
});

test("ensureTimePlanningTaskInList returns the EXISTING task unchanged (never a second one) when one is already present", () => {
  const existing = makeTask({ id: TIME_PLANNING_TASK_ID, title: "תכנון הזמן שלי", expectedDurationMinutes: 40, status: "paused" });
  const otherTask = makeTask({ id: "task-2" });
  const { task, tasks } = ensureTimePlanningTaskInList([otherTask, existing], LATER);
  assert.equal(task, existing, "must return the SAME object -- never overwrite a saved duration or in-flight status just by ensuring it exists");
  assert.equal(tasks.length, 2, "never duplicates -- the list is returned unchanged when the task already exists");
  assert.equal(tasks, tasks, "sanity");
});

test("ensureTimePlanningTaskInList never mutates the input list when the task already exists", () => {
  const existing = makeTask({ id: TIME_PLANNING_TASK_ID });
  const originalTasks = [existing];
  const { tasks } = ensureTimePlanningTaskInList(originalTasks, NOW);
  assert.equal(tasks, originalTasks);
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

// ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן"), Part 2:
// arcWindowMinutesBefore is purely additive -- never required, never
// auto-set.

test("createEmptyTask defaults arcWindowMinutesBefore to null -- no ARC window unless explicitly set", () => {
  const task = createEmptyTask("t1", "כותרת", "פעולה", "2026-01-01T00:00:00.000Z");
  assert.equal(task.arcWindowMinutesBefore, null);
});

test("normalizeTask backfills arcWindowMinutesBefore to null for a record saved before this field existed, never inventing a value", () => {
  const legacy = { ...createEmptyTask("t1", "כותרת", "פעולה", "2026-01-01T00:00:00.000Z") } as Task;
  delete (legacy as Partial<Task>).arcWindowMinutesBefore;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.arcWindowMinutesBefore, null);
});

test("normalizeTask preserves an already-set arcWindowMinutesBefore", () => {
  const task = { ...createEmptyTask("t1", "כותרת", "פעולה", "2026-01-01T00:00:00.000Z"), arcWindowMinutesBefore: 5 };
  assert.equal(normalizeTask(task).arcWindowMinutesBefore, 5);
});

// Manifest Goals & Automatic Task Scheduling task: purposeManifestId/
// purposeManifestGoalId/purposeManifestTaskOrder are purely additive --
// never required, never auto-set, and completely unrelated to the
// pre-existing taskKind/manifestProfile fields above.

test("createEmptyTask defaults purposeManifestId/purposeManifestGoalId/purposeManifestTaskOrder to null -- no goal link unless explicitly set", () => {
  const task = createEmptyTask("t1", "כותרת", "פעולה", "2026-01-01T00:00:00.000Z");
  assert.equal(task.purposeManifestId, null);
  assert.equal(task.purposeManifestGoalId, null);
  assert.equal(task.purposeManifestTaskOrder, null);
});

test("normalizeTask backfills purposeManifestId/purposeManifestGoalId/purposeManifestTaskOrder to null for a record saved before these fields existed, never inventing a value, and never crashing", () => {
  const legacy = { ...createEmptyTask("t1", "כותרת", "פעולה", "2026-01-01T00:00:00.000Z") } as Task;
  delete (legacy as Partial<Task>).purposeManifestId;
  delete (legacy as Partial<Task>).purposeManifestGoalId;
  delete (legacy as Partial<Task>).purposeManifestTaskOrder;
  const normalized = normalizeTask(legacy);
  assert.equal(normalized.purposeManifestId, null);
  assert.equal(normalized.purposeManifestGoalId, null);
  assert.equal(normalized.purposeManifestTaskOrder, null);
});

test("normalizeTask preserves already-set purposeManifestId/purposeManifestGoalId/purposeManifestTaskOrder", () => {
  const task = { ...createEmptyTask("t1", "כותרת", "פעולה", "2026-01-01T00:00:00.000Z"), purposeManifestId: "m1", purposeManifestGoalId: "g1", purposeManifestTaskOrder: 2 };
  const normalized = normalizeTask(task);
  assert.equal(normalized.purposeManifestId, "m1");
  assert.equal(normalized.purposeManifestGoalId, "g1");
  assert.equal(normalized.purposeManifestTaskOrder, 2);
});

// --- Unified Emotional Check-In and Task Postponement System: findActiveTask ---

test("required test: findActiveTask returns the one task whose status is 'active', never a merely 'paused' one", () => {
  const planned = makeTask({ id: "t1", status: "planned" });
  const active = makeTask({ id: "t2", status: "active" });
  const paused = makeTask({ id: "t3", status: "paused" });
  assert.equal(findActiveTask([planned, active, paused])?.id, "t2");
});

test("required test: findActiveTask returns null when no task is active", () => {
  assert.equal(findActiveTask([]), null);
  assert.equal(findActiveTask([makeTask({ status: "planned" }), makeTask({ status: "paused" })]), null);
});

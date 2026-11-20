import test from "node:test";
import assert from "node:assert/strict";

import {
  createManifestGoal,
  deleteManifestGoalFromList,
  reorderManifestGoals,
  reorderManifestTasksForGoal,
  resolveGoalProgress,
  resolveGoalsForManifest,
  resolveManifestTaskSortTimestamp,
  resolveNextManifestAction,
  resolveNextTaskOrderForGoal,
  resolveTasksForGoal,
  upsertManifestGoalInList,
  type ManifestGoal,
} from "./manifestGoals.ts";
import { completeTask, createEmptyTask, postponeTask, type Task } from "./tasks.ts";
import type { TaskOccurrenceCompletion } from "./taskOccurrence.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(`task-${Math.random()}`, "כותרת", "פעולה", NOW), ...overrides };
}

function makeGoal(overrides: Partial<ManifestGoal> = {}): ManifestGoal {
  return { ...createManifestGoal("manifest-1", "יעד", 0, NOW), ...overrides };
}

// --- ManifestGoal CRUD/reorder/progress ---

test("createManifestGoal sets manifestId/title/order/timestamps exactly as given", () => {
  const goal = createManifestGoal("manifest-1", "שיפור כישורי אימון", 2, NOW);
  assert.equal(goal.manifestId, "manifest-1");
  assert.equal(goal.title, "שיפור כישורי אימון");
  assert.equal(goal.order, 2);
  assert.equal(goal.createdAt, NOW);
  assert.match(goal.id, /^manifest-goal-/);
});

test("upsertManifestGoalInList inserts a new goal and updates an existing one by id without touching any other goal", () => {
  const g1 = makeGoal({ id: "g1" });
  const g2 = makeGoal({ id: "g2" });
  let list = upsertManifestGoalInList([], g1);
  list = upsertManifestGoalInList(list, g2);
  const renamed = { ...g1, title: "שם מעודכן" };
  list = upsertManifestGoalInList(list, renamed);
  assert.equal(list.length, 2);
  assert.equal(list.find((g) => g.id === "g1")?.title, "שם מעודכן");
  assert.equal(list.find((g) => g.id === "g2")?.title, "יעד");
});

test("deleteManifestGoalFromList removes only the matching goal", () => {
  const list = [makeGoal({ id: "g1" }), makeGoal({ id: "g2" })];
  assert.deepEqual(deleteManifestGoalFromList(list, "g1").map((g) => g.id), ["g2"]);
});

test("resolveGoalsForManifest filters by manifestId and sorts by order", () => {
  const goals = [
    makeGoal({ id: "g1", manifestId: "m1", order: 1 }),
    makeGoal({ id: "g2", manifestId: "m2", order: 0 }),
    makeGoal({ id: "g3", manifestId: "m1", order: 0 }),
  ];
  assert.deepEqual(resolveGoalsForManifest(goals, "m1").map((g) => g.id), ["g3", "g1"]);
});

test("reorderManifestGoals reassigns order for ONE manifest's goals per orderedIds, leaving a different manifest's goals and any id missing from orderedIds completely untouched", () => {
  const goals = [
    makeGoal({ id: "g1", manifestId: "m1", order: 0 }),
    makeGoal({ id: "g2", manifestId: "m1", order: 1 }),
    makeGoal({ id: "g3", manifestId: "m2", order: 0 }),
  ];
  const reordered = reorderManifestGoals(goals, "m1", ["g2", "g1"], "2026-02-01T00:00:00.000Z");
  assert.equal(reordered.find((g) => g.id === "g2")?.order, 0);
  assert.equal(reordered.find((g) => g.id === "g1")?.order, 1);
  assert.equal(reordered.find((g) => g.id === "g3")?.order, 0, "a different manifest's goal must be untouched");
  assert.equal(reordered.find((g) => g.id === "g3")?.updatedAt, NOW, "untouched goal's updatedAt must not be bumped either");
});

test("resolveGoalProgress counts completed vs. total linked tasks, excluding archived ones, and never counts a task linked to a DIFFERENT goal", () => {
  const tasks = [
    makeTask({ purposeManifestGoalId: "g1", status: "completed" }),
    makeTask({ purposeManifestGoalId: "g1", status: "planned" }),
    makeTask({ purposeManifestGoalId: "g1", status: "archived" }),
    makeTask({ purposeManifestGoalId: "g2", status: "completed" }),
  ];
  assert.deepEqual(resolveGoalProgress("g1", tasks), { completed: 1, total: 2 });
});

test("reorderManifestTasksForGoal reassigns purposeManifestTaskOrder for ONE goal's own tasks per orderedIds, leaving a task under a different goal untouched", () => {
  const tasks = [
    makeTask({ id: "t1", purposeManifestGoalId: "g1", purposeManifestTaskOrder: 0 }),
    makeTask({ id: "t2", purposeManifestGoalId: "g1", purposeManifestTaskOrder: 1 }),
    makeTask({ id: "t3", purposeManifestGoalId: "g2", purposeManifestTaskOrder: 0 }),
  ];
  const reordered = reorderManifestTasksForGoal(tasks, "g1", ["t2", "t1"], "2026-02-01T00:00:00.000Z");
  assert.equal(reordered.find((t) => t.id === "t2")?.purposeManifestTaskOrder, 0);
  assert.equal(reordered.find((t) => t.id === "t1")?.purposeManifestTaskOrder, 1);
  assert.equal(reordered.find((t) => t.id === "t3")?.purposeManifestTaskOrder, 0);
});

test("resolveNextTaskOrderForGoal is 0 for a goal's first task, and one past the current maximum otherwise", () => {
  assert.equal(resolveNextTaskOrderForGoal("g1", []), 0);
  const tasks = [makeTask({ purposeManifestGoalId: "g1", purposeManifestTaskOrder: 0 }), makeTask({ purposeManifestGoalId: "g1", purposeManifestTaskOrder: 3 })];
  assert.equal(resolveNextTaskOrderForGoal("g1", tasks), 4);
});

test("resolveTasksForGoal filters by goalId, excludes archived, and sorts by purposeManifestTaskOrder (falling back to createdAt for ties)", () => {
  const tasks = [
    makeTask({ id: "t1", purposeManifestGoalId: "g1", purposeManifestTaskOrder: 1 }),
    makeTask({ id: "t2", purposeManifestGoalId: "g1", purposeManifestTaskOrder: 0 }),
    makeTask({ id: "t3", purposeManifestGoalId: "g1", status: "archived", purposeManifestTaskOrder: -1 }),
    makeTask({ id: "t4", purposeManifestGoalId: "g2", purposeManifestTaskOrder: 0 }),
  ];
  assert.deepEqual(resolveTasksForGoal(tasks, "g1").map((t) => t.id), ["t2", "t1"]);
});

// --- resolveManifestTaskSortTimestamp ---

test("resolveManifestTaskSortTimestamp: a one-time task with scheduledDate+scheduledTime resolves to that exact clock moment", () => {
  const task = makeTask({ recurrence: { kind: "once" }, scheduledDate: "2026-11-12", scheduledTime: "17:00" });
  const timestamp = resolveManifestTaskSortTimestamp(task, [], new Date("2026-11-01T00:00:00"));
  assert.equal(timestamp, new Date(2026, 10, 12, 17, 0, 0, 0).getTime());
});

test("resolveManifestTaskSortTimestamp: a one-time task with only scheduledDate (no time) resolves to that date's midnight, never null", () => {
  const task = makeTask({ recurrence: { kind: "once" }, scheduledDate: "2026-11-12", scheduledTime: null });
  const timestamp = resolveManifestTaskSortTimestamp(task, [], new Date("2026-11-01T00:00:00"));
  assert.equal(timestamp, new Date(`2026-11-12T00:00:00`).getTime());
});

test("resolveManifestTaskSortTimestamp: a one-time task with no scheduledDate at all is null -- unscheduled", () => {
  const task = makeTask({ recurrence: { kind: "once" }, scheduledDate: null });
  assert.equal(resolveManifestTaskSortTimestamp(task, [], new Date()), null);
});

test("resolveManifestTaskSortTimestamp: a postponed task (any recurrence) always uses its own returnAt, taking priority over its stale scheduledDate/Time", () => {
  const now = new Date("2026-11-01T00:00:00");
  const base = makeTask({ recurrence: { kind: "once" }, scheduledDate: "2026-11-01", scheduledTime: "08:00" });
  const postponed = postponeTask(base, "לא היה זמן", "2026-11-05T10:00:00.000Z", now.toISOString());
  assert.equal(resolveManifestTaskSortTimestamp(postponed, [], now), new Date("2026-11-05T10:00:00.000Z").getTime());
});

test("resolveManifestTaskSortTimestamp: a postponed task with no returnAt (moved to the unscheduled list) is null", () => {
  const now = new Date("2026-11-01T00:00:00");
  const base = makeTask({ recurrence: { kind: "once" }, scheduledDate: "2026-11-01" });
  const postponed = postponeTask(base, "לא היה זמן", null, now.toISOString());
  assert.equal(resolveManifestTaskSortTimestamp(postponed, [], now), null);
});

test("resolveManifestTaskSortTimestamp: a recurring task scheduled TODAY and not yet completed today resolves to today's own clock time", () => {
  const now = new Date("2026-11-10T08:00:00"); // a Tuesday (day 2)
  const task = makeTask({ recurrence: { kind: "recurring", daysOfWeek: [2] }, scheduledTime: "17:00" });
  const timestamp = resolveManifestTaskSortTimestamp(task, [], now);
  assert.equal(timestamp, new Date(2026, 10, 10, 17, 0, 0, 0).getTime());
});

test("resolveManifestTaskSortTimestamp: a recurring task already completed today projects forward to its NEXT matching, not-yet-completed weekday", () => {
  const now = new Date("2026-11-10T08:00:00"); // Tuesday
  const task = makeTask({ id: "t1", recurrence: { kind: "recurring", daysOfWeek: [2] }, scheduledTime: "17:00" });
  const completions: TaskOccurrenceCompletion[] = [{ taskId: "t1", occurrenceDateLocal: "2026-11-10", completedAt: now.toISOString() }];
  const timestamp = resolveManifestTaskSortTimestamp(task, completions, now);
  assert.equal(timestamp, new Date(2026, 10, 17, 17, 0, 0, 0).getTime(), "the following Tuesday, exactly 7 days later");
});

test("resolveManifestTaskSortTimestamp: a recurring task whose daysOfWeek never matches within a week is null -- treated as unscheduled, never an infinite/incorrect projection", () => {
  const task = makeTask({ recurrence: { kind: "recurring", daysOfWeek: [] } });
  assert.equal(resolveManifestTaskSortTimestamp(task, [], new Date("2026-11-10T08:00:00")), null);
});

// --- resolveNextManifestAction ---

test("resolveNextManifestAction returns null when the manifest has no incomplete, non-archived linked task at all", () => {
  const goals = [makeGoal({ id: "g1", manifestId: "m1" })];
  const tasks = [makeTask({ purposeManifestId: "m1", purposeManifestGoalId: "g1", status: "completed" })];
  assert.equal(resolveNextManifestAction("m1", goals, tasks, [], new Date()), null);
});

test("resolveNextManifestAction picks the EARLIEST timestamp across every linked task regardless of which goal it belongs to -- an overdue task from one goal is chosen over a later-scheduled task from another, 'handling overdue explicitly and consistently' via one uniform ordering rule, never a special case", () => {
  const now = new Date("2026-11-10T08:00:00");
  const goals = [makeGoal({ id: "g1", manifestId: "m1" }), makeGoal({ id: "g2", manifestId: "m1" })];
  const overdueTask = makeTask({ id: "t-overdue", purposeManifestId: "m1", purposeManifestGoalId: "g2", recurrence: { kind: "once" }, scheduledDate: "2026-11-01", scheduledTime: "09:00" });
  const futureTask = makeTask({ id: "t-future", purposeManifestId: "m1", purposeManifestGoalId: "g1", recurrence: { kind: "once" }, scheduledDate: "2026-12-01", scheduledTime: "09:00" });
  const result = resolveNextManifestAction("m1", goals, [futureTask, overdueTask], [], now);
  assert.equal(result?.task.id, "t-overdue");
  assert.equal(result?.goal.id, "g2", "must be the goal the CHOSEN task actually belongs to, never simply the first goal in the list");
});

test("resolveNextManifestAction falls back to the earliest-CREATED unscheduled task only when NO linked task has any resolvable schedule at all", () => {
  const goals = [makeGoal({ id: "g1", manifestId: "m1" })];
  const older = makeTask({ id: "older", purposeManifestId: "m1", purposeManifestGoalId: "g1", scheduledDate: null, createdAt: "2026-01-01T00:00:00.000Z" });
  const newer = makeTask({ id: "newer", purposeManifestId: "m1", purposeManifestGoalId: "g1", scheduledDate: null, createdAt: "2026-02-01T00:00:00.000Z" });
  const result = resolveNextManifestAction("m1", goals, [newer, older], [], new Date());
  assert.equal(result?.task.id, "older");
});

test("resolveNextManifestAction never selects a task linked to a DIFFERENT manifest", () => {
  const goals = [makeGoal({ id: "g1", manifestId: "m1" }), makeGoal({ id: "g2", manifestId: "m2" })];
  const tasks = [makeTask({ purposeManifestId: "m2", purposeManifestGoalId: "g2", scheduledDate: "2026-01-01", scheduledTime: "08:00" })];
  assert.equal(resolveNextManifestAction("m1", goals, tasks, [], new Date()), null);
});

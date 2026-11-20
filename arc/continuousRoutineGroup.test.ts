import test from "node:test";
import assert from "node:assert/strict";

import {
  createContinuousRoutineGroup,
  findGroupForTask,
  generateContinuousRoutineGroupId,
  isConsecutiveSelection,
  removeContinuousRoutineGroup,
  resolveNextTaskInContinuousRoutineGroup,
  upsertContinuousRoutineGroup,
  type ContinuousRoutineGroup,
} from "./continuousRoutineGroup.ts";
import type { Task } from "./tasks.ts";
import { createEmptyTask } from "./tasks.ts";
import type { TaskOccurrenceCompletion } from "./taskOccurrence.ts";

/**
 * arc/continuousRoutineGroup.test.ts
 *
 * Unified ARC & Productivity Update task, requirement 9 ("CONTINUOUS
 * TASK ROUTINES -- SMILES, NOT POINTS"): pure logic coverage for the
 * ad-hoc, per-day "select consecutive tasks, group as שגרה רצופה"
 * feature. The storage/orchestration wrapper is covered via source
 * text in data/continuousRoutineGroup.test.ts (same convention every
 * other data/*.test.ts file in this codebase already uses).
 */

const NOW = "2026-03-01T10:00:00.000Z";

function task(id: string): Task {
  return createEmptyTask(id, id, id, NOW);
}

test("isConsecutiveSelection: true only for an unbroken run of at least two ids, taken from the schedule's own order, regardless of the order the ids are PASSED in", () => {
  const ordered = ["a", "b", "c", "d", "e"];
  assert.equal(isConsecutiveSelection(ordered, ["b", "c", "d"]), true);
  assert.equal(isConsecutiveSelection(ordered, ["d", "b", "c"]), true, "pass order must not matter -- only the schedule's own order does");
  assert.equal(isConsecutiveSelection(ordered, ["a", "c"]), false, "skips 'b' -- not consecutive");
  assert.equal(isConsecutiveSelection(ordered, ["a"]), false, "a single task is never a group");
  assert.equal(isConsecutiveSelection(ordered, []), false);
  assert.equal(isConsecutiveSelection(ordered, ["a", "a"]), false, "duplicates are rejected");
  assert.equal(isConsecutiveSelection(ordered, ["a", "z"]), false, "an id not in the schedule at all is rejected");
});

test("createContinuousRoutineGroup builds a group carrying the exact taskIds/dateLocal/createdAt given, generating its own id when none is supplied", () => {
  const group = createContinuousRoutineGroup(["t1", "t2", "t3"], "2026-03-01", NOW);
  assert.deepEqual(group.taskIds, ["t1", "t2", "t3"]);
  assert.equal(group.dateLocal, "2026-03-01");
  assert.equal(group.createdAt, NOW);
  assert.ok(group.id.length > 0);
});

test("generateContinuousRoutineGroupId produces distinct ids across calls", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateContinuousRoutineGroupId()));
  assert.equal(ids.size, 20);
});

test("findGroupForTask finds the group containing a task for the EXACT date, and only that date", () => {
  const groupA: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2"], createdAt: NOW };
  const groupB: ContinuousRoutineGroup = { id: "g2", dateLocal: "2026-03-02", taskIds: ["t1", "t3"], createdAt: NOW };
  assert.deepEqual(findGroupForTask([groupA, groupB], "2026-03-01", "t1"), groupA);
  assert.deepEqual(findGroupForTask([groupA, groupB], "2026-03-02", "t1"), groupB);
  assert.equal(findGroupForTask([groupA, groupB], "2026-03-01", "t3"), null, "t3 belongs to groupB's date only, not groupA's");
  assert.equal(findGroupForTask([groupA, groupB], "2026-03-03", "t1"), null, "no group exists for this date at all");
});

test("upsertContinuousRoutineGroup never leaves a task double-grouped on the same date -- an overlapping older group has the overlap removed, and is dropped entirely if that leaves it with fewer than 2 tasks", () => {
  const older: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2"], createdAt: NOW };
  const newer = createContinuousRoutineGroup(["t2", "t3"], "2026-03-01", NOW, "g2");
  const result = upsertContinuousRoutineGroup([older], newer);
  assert.equal(result.length, 1, "the older group loses its only non-overlapping task (t1) and drops below 2, so it's removed entirely");
  assert.deepEqual(result[0], newer);
});

test("upsertContinuousRoutineGroup only trims the overlapping group down, never removing it, when enough non-overlapping tasks remain", () => {
  const older: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2", "t3"], createdAt: NOW };
  const newer = createContinuousRoutineGroup(["t3", "t4"], "2026-03-01", NOW, "g2");
  const result = upsertContinuousRoutineGroup([older], newer);
  assert.equal(result.length, 2);
  const keptOlder = result.find((group) => group.id === "g1")!;
  assert.deepEqual(keptOlder.taskIds, ["t1", "t2"]);
});

test("upsertContinuousRoutineGroup never touches a group on a DIFFERENT date, even if it shares task ids", () => {
  const otherDate: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-02", taskIds: ["t1", "t2"], createdAt: NOW };
  const newer = createContinuousRoutineGroup(["t1", "t2"], "2026-03-01", NOW, "g2");
  const result = upsertContinuousRoutineGroup([otherDate], newer);
  assert.equal(result.length, 2);
  assert.deepEqual(result.find((group) => group.id === "g1"), otherDate);
});

test("removeContinuousRoutineGroup removes only the named group, leaving every other group (any date) untouched", () => {
  const groupA: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2"], createdAt: NOW };
  const groupB: ContinuousRoutineGroup = { id: "g2", dateLocal: "2026-03-02", taskIds: ["t3", "t4"], createdAt: NOW };
  assert.deepEqual(removeContinuousRoutineGroup([groupA, groupB], "g1"), [groupB]);
  assert.deepEqual(removeContinuousRoutineGroup([groupA, groupB], "nonexistent"), [groupA, groupB]);
});

test("resolveNextTaskInContinuousRoutineGroup walks the GROUP's own stored order (never scheduledTime), returning the first not-yet-completed-today task after excludeTaskId's position", () => {
  const group: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2", "t3"], createdAt: NOW };
  const tasks = [task("t1"), task("t2"), task("t3")];
  const completions: TaskOccurrenceCompletion[] = [];
  const now = new Date(NOW);
  assert.equal(resolveNextTaskInContinuousRoutineGroup(tasks, completions, group, "t1", now)?.id, "t2");
});

test("resolveNextTaskInContinuousRoutineGroup skips an already-completed-today task and keeps walking forward", () => {
  const group: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2", "t3"], createdAt: NOW };
  const tasks = [task("t1"), task("t2"), task("t3")];
  const completions: TaskOccurrenceCompletion[] = [{ taskId: "t2", occurrenceDateLocal: "2026-03-01", completedAt: NOW }];
  const now = new Date(NOW);
  assert.equal(resolveNextTaskInContinuousRoutineGroup(tasks, completions, group, "t1", now)?.id, "t3");
});

test("resolveNextTaskInContinuousRoutineGroup returns null once excludeTaskId was the last remaining (not-yet-completed) task in the group -- the signal to show the one combined summary", () => {
  const group: ContinuousRoutineGroup = { id: "g1", dateLocal: "2026-03-01", taskIds: ["t1", "t2", "t3"], createdAt: NOW };
  const tasks = [task("t1"), task("t2"), task("t3")];
  const completions: TaskOccurrenceCompletion[] = [
    { taskId: "t1", occurrenceDateLocal: "2026-03-01", completedAt: NOW },
    { taskId: "t2", occurrenceDateLocal: "2026-03-01", completedAt: NOW },
  ];
  const now = new Date(NOW);
  assert.equal(resolveNextTaskInContinuousRoutineGroup(tasks, completions, group, "t3", now), null);
});

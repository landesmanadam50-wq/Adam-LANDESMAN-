import test from "node:test";
import assert from "node:assert/strict";

import { archiveTask, createEmptyTask } from "./tasks.ts";
import {
  findTasksReferencingArcBuild,
  findTasksReferencingArcGoal,
  findTasksReferencingStateProfile,
  isReferencedByAnyTask,
  unlinkArcBuildFromTasks,
  unlinkArcGoalFromTasks,
  unlinkStateProfileFromTasks,
} from "./taskLibraryUsage.ts";

const NOW = "2026-01-01T00:00:00.000Z";

test("findTasksReferencingArcBuild/ArcGoal/StateProfile find exactly the matching, non-archived tasks", () => {
  const linked = { ...createEmptyTask("t1", "a", "b", NOW), linkedArcBuildId: "build-1", linkedArcGoalId: "goal-1", defaultSupportiveStateId: "sp-1" };
  const unrelated = createEmptyTask("t2", "a", "b", NOW);
  assert.deepEqual(findTasksReferencingArcBuild("build-1", [linked, unrelated]).map((t) => t.id), ["t1"]);
  assert.deepEqual(findTasksReferencingArcGoal("goal-1", [linked, unrelated]).map((t) => t.id), ["t1"]);
  assert.deepEqual(findTasksReferencingStateProfile("sp-1", [linked, unrelated]).map((t) => t.id), ["t1"]);
});

test("an archived task's own reference never counts -- it is retired, same convention as arc/libraryItemUsage.ts", () => {
  const archived = archiveTask({ ...createEmptyTask("t1", "a", "b", NOW), linkedArcBuildId: "build-1" }, NOW);
  assert.deepEqual(findTasksReferencingArcBuild("build-1", [archived]), []);
});

test("isReferencedByAnyTask is a plain length check", () => {
  assert.equal(isReferencedByAnyTask([]), false);
  assert.equal(isReferencedByAnyTask([createEmptyTask("t1", "a", "b", NOW)]), true);
});

test("unlinkArcBuildFromTasks/ArcGoal/StateProfile clear exactly the one reference field, never touching any other field or deleting the task", () => {
  const linked = {
    ...createEmptyTask("t1", "a", "b", NOW),
    linkedArcBuildId: "build-1",
    linkedArcGoalId: "goal-1",
    defaultSupportiveStateId: "sp-1",
    value: "ערך חשוב",
  };
  const afterBuildUnlink = unlinkArcBuildFromTasks([linked], "build-1", "2026-01-02T00:00:00.000Z");
  assert.equal(afterBuildUnlink[0].linkedArcBuildId, null);
  assert.equal(afterBuildUnlink[0].linkedArcGoalId, "goal-1", "unlinking the build must never touch the goal link");
  assert.equal(afterBuildUnlink[0].value, "ערך חשוב", "unlinking must never touch unrelated fields");
  assert.equal(afterBuildUnlink[0].updatedAt, "2026-01-02T00:00:00.000Z");

  const afterGoalUnlink = unlinkArcGoalFromTasks([linked], "goal-1", NOW);
  assert.equal(afterGoalUnlink[0].linkedArcGoalId, null);
  assert.equal(afterGoalUnlink[0].linkedArcBuildId, "build-1");

  const afterStateUnlink = unlinkStateProfileFromTasks([linked], "sp-1", NOW);
  assert.equal(afterStateUnlink[0].defaultSupportiveStateId, null);
});

test("unlinking never affects a task that doesn't reference the deleted record", () => {
  const unrelated = createEmptyTask("t1", "a", "b", NOW);
  const result = unlinkArcBuildFromTasks([unrelated], "build-1", "2026-01-02T00:00:00.000Z");
  assert.deepEqual(result[0], unrelated);
});

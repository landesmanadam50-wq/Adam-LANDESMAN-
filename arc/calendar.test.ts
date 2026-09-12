import test from "node:test";
import assert from "node:assert/strict";

import { buildCalendarItems } from "./calendar.ts";
import { createEmptyArcGoal } from "./types.ts";
import type { ArcGoal, ArcGoalTarget } from "./types.ts";
import { createFourWeekProgram } from "./fourWeekProgram.ts";
import { createEmptyArcGoalSubGoal, createEmptyArcGoalTarget } from "./subGoalExecution.ts";

// --- 7. A target opens from the calendar (carries targetId/arcGoalId for deep-linking) ---

test("7. every target-derived calendar item carries targetId + arcGoalId for a direct deep link, never a generic goal-only item", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  const subGoal = createEmptyArcGoalSubGoal(goal.id, 0, "2025-01-01T00:00:00.000Z");
  const target: ArcGoalTarget = {
    ...createEmptyArcGoalTarget(goal.id, subGoal.id, "2025-01-01T00:00:00.000Z"),
    name: "שתיית מים",
    plannedDate: "2025-03-10",
    plannedTime: "09:00",
  };
  const items = buildCalendarItems([{ ...goal, subGoals: [subGoal] }], [target], [], new Date("2025-01-01T00:00:00"));
  const targetItem = items.find((i) => i.type === "target");
  assert.ok(targetItem);
  assert.equal(targetItem!.targetId, target.id);
  assert.equal(targetItem!.arcGoalId, goal.id);
  assert.equal(targetItem!.subGoalId, subGoal.id);
});

test("a target linked to a routine is its own calendar item type, never a second/duplicated routine entry", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  const target: ArcGoalTarget = {
    ...createEmptyArcGoalTarget(goal.id, "sub-1", "2025-01-01T00:00:00.000Z"),
    plannedDate: "2025-03-10",
    linkedScheduledRoutineId: "routine-1",
  };
  const items = buildCalendarItems([goal], [target], [], new Date("2025-01-01T00:00:00"));
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "routine_linked_target");
});

test("sub-goal deadlines carry subGoalId for opening the correct sub-goal, and a completed one still shows on the calendar", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  const subGoal = { ...createEmptyArcGoalSubGoal(goal.id, 0, "2025-01-01T00:00:00.000Z"), plannedCompletionDate: "2025-04-01", status: "completed" as const };
  const items = buildCalendarItems([{ ...goal, subGoals: [subGoal] }], [], [], new Date("2025-01-01T00:00:00"));
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "sub_goal_deadline");
  assert.equal(items[0].subGoalId, subGoal.id);
  assert.equal(items[0].completed, true);
});

test("four-week practice items only appear while the program is enabled and not yet completed", () => {
  const active = { ...createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z"), fourWeekProgram: createFourWeekProgram("2025-01-06") };
  const finished = { ...active, id: "goal-2", fourWeekProgram: { ...createFourWeekProgram("2025-01-06"), completedAt: "2025-02-01T00:00:00.000Z" } };
  const items = buildCalendarItems([active, finished], [], [], new Date("2025-01-01T00:00:00"));
  assert.equal(items.filter((i) => i.type === "four_week_practice").length, 1);
  assert.equal(items[0].arcGoalId, "goal-1");
});

// --- 21. Backward compatibility: legacy goals/targets never crash the calendar ---

test("21. legacy ArcGoals with no subGoals/fourWeekProgram and targets with missing optional fields never crash buildCalendarItems", () => {
  const legacyGoal: ArcGoal = createEmptyArcGoal("goal-1", "מטרה ישנה", "2020-01-01T00:00:00.000Z");
  assert.doesNotThrow(() => buildCalendarItems([legacyGoal], [], []));

  const minimalTarget: ArcGoalTarget = createEmptyArcGoalTarget("goal-1", "sub-1", "2020-01-01T00:00:00.000Z");
  assert.doesNotThrow(() => buildCalendarItems([legacyGoal], [minimalTarget], []));
});

test("targets with neither plannedDate nor recurrence produce no calendar item at all (nothing to schedule)", () => {
  const target = createEmptyArcGoalTarget("goal-1", "sub-1", "2020-01-01T00:00:00.000Z");
  const items = buildCalendarItems([createEmptyArcGoal("goal-1", "מטרה", "2020-01-01T00:00:00.000Z")], [target], []);
  assert.equal(items.length, 0);
});

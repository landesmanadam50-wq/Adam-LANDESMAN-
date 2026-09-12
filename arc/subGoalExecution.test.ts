import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyArcGoal } from "./types.ts";
import type { ArcGoal, ArcGoalTarget } from "./types.ts";
import { confirmWeekCompleteAndAdvance, createFourWeekProgram } from "./fourWeekProgram.ts";
import {
  activateExecutionPhase,
  allRequiredTargetsComplete,
  completeActiveSubGoalAndAdvance,
  completeTarget,
  createEmptyArcGoalSubGoal,
  createEmptyArcGoalTarget,
  deleteArcGoalTargetFromList,
  isTargetNotificationInSync,
  isTargetOccurrenceCompleted,
  isTargetRecurring,
  reorderSubGoals,
  resolveActiveSubGoal,
  resolvePhase,
  resolveTargetNextOccurrenceDate,
  resolveTargetStatusToday,
  resolveTargetSupportRoute,
  resolveTargetTodayOccurrenceDate,
  setExecutionReturnContext,
  clearExecutionReturnContext,
  uncompleteTarget,
  upsertArcGoalTargetInList,
} from "./subGoalExecution.ts";

function readyGoalWithSubGoals(subGoalNames: string[]): ArcGoal {
  const now = "2025-01-01T00:00:00.000Z";
  let goal = createEmptyArcGoal("goal-1", "מטרה לדוגמה", now);
  let program = createFourWeekProgram("2025-01-06");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-13T00:00:00.000Z"); // -> week 2
  program = confirmWeekCompleteAndAdvance(program, "2025-01-20T00:00:00.000Z"); // -> week 3
  program = confirmWeekCompleteAndAdvance(program, "2025-01-27T00:00:00.000Z"); // -> week 4, still active
  program = confirmWeekCompleteAndAdvance(program, "2025-02-03T00:00:00.000Z"); // Week 4 confirmed -> readyForSubGoalActivation
  goal = { ...goal, fourWeekProgram: program };
  goal = {
    ...goal,
    subGoals: subGoalNames.map((name, index) => createEmptyArcGoalSubGoal(goal.id, index, now)).map((s, i) => ({ ...s, name: subGoalNames[i] })),
  };
  return goal;
}

// --- 1. Completing Week 4 activates the first sub-goal only after confirmation ---

test("1. activateExecutionPhase is a no-op before Week 4 is confirmed complete", () => {
  const now = "2025-01-01T00:00:00.000Z";
  let goal = createEmptyArcGoal("goal-1", "מטרה", now);
  goal = { ...goal, fourWeekProgram: createFourWeekProgram("2025-01-06"), subGoals: [createEmptyArcGoalSubGoal(goal.id, 0, now)] };
  const untouched = activateExecutionPhase(goal, now);
  assert.equal(resolvePhase(untouched), "four_week_program");
  assert.equal(resolveActiveSubGoal(untouched), null);
});

test("1b. activateExecutionPhase activates the first ordered sub-goal only once readyForSubGoalActivation is true", () => {
  const goal = readyGoalWithSubGoals(["ראשונה", "שנייה", "שלישית"]);
  const activated = activateExecutionPhase(goal, "2025-02-03T00:00:00.000Z");
  assert.equal(resolvePhase(activated), "execution");
  assert.equal(resolveActiveSubGoal(activated)?.name, "ראשונה");
});

// --- 2. Only one sub-goal becomes active ---

test("2. exactly one sub-goal is ever active after activation", () => {
  const goal = readyGoalWithSubGoals(["א", "ב", "ג"]);
  const activated = activateExecutionPhase(goal, "2025-02-03T00:00:00.000Z");
  const activeCount = (activated.subGoals ?? []).filter((s) => s.status === "active").length;
  assert.equal(activeCount, 1);
});

// --- 3. Completing all required targets offers sub-goal completion ---

test("3. allRequiredTargetsComplete is true only once every one-time target under the sub-goal is completed", () => {
  const goal = activateExecutionPhase(readyGoalWithSubGoals(["א"]), "2025-02-03T00:00:00.000Z");
  const subGoalId = resolveActiveSubGoal(goal)!.id;
  const now = "2025-02-04T00:00:00.000Z";
  const t1 = { ...createEmptyArcGoalTarget(goal.id, subGoalId, now), status: "pending" as const };
  const t2 = { ...createEmptyArcGoalTarget(goal.id, subGoalId, now), status: "pending" as const };
  assert.equal(allRequiredTargetsComplete(subGoalId, [t1, t2]), false);
  const t1Done = { ...t1, status: "completed" as const };
  assert.equal(allRequiredTargetsComplete(subGoalId, [t1Done, t2]), false);
  const t2Done = { ...t2, status: "completed" as const };
  assert.equal(allRequiredTargetsComplete(subGoalId, [t1Done, t2Done]), true);
});

test("3b. a sub-goal with zero one-time targets never offers completion automatically", () => {
  const recurring = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-02-04T00:00:00.000Z"), recurrenceDaysOfWeek: [1, 3, 5] };
  assert.equal(allRequiredTargetsComplete("sub-1", [recurring]), false);
});

// --- 4. Confirming completion activates the next ordered sub-goal ---

test("4. completeActiveSubGoalAndAdvance activates the next ordered sub-goal and saves the reflection", () => {
  const goal = activateExecutionPhase(readyGoalWithSubGoals(["א", "ב"]), "2025-02-03T00:00:00.000Z");
  const now = "2025-02-10T00:00:00.000Z";
  const advanced = completeActiveSubGoalAndAdvance(goal, { whatHelped: "תמיכה", whatWasHard: null, whatLearned: null }, now);
  const first = advanced.subGoals!.find((s) => s.name === "א")!;
  const second = advanced.subGoals!.find((s) => s.name === "ב")!;
  assert.equal(first.status, "completed");
  assert.equal(first.actualCompletionDate, now);
  assert.equal(first.reflection?.whatHelped, "תמיכה");
  assert.equal(second.status, "active");
  assert.equal(resolvePhase(advanced), "execution");
});

test("4b. completeActiveSubGoalAndAdvance is a no-op when there is no active sub-goal", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  const untouched = completeActiveSubGoalAndAdvance(goal, null, "2025-01-02T00:00:00.000Z");
  assert.deepEqual(untouched, goal);
});

// --- 5. The final sub-goal completes the ArcGoal ---

test("5. completing the last ordered sub-goal marks the whole ArcGoal completed", () => {
  const goal = activateExecutionPhase(readyGoalWithSubGoals(["א"]), "2025-02-03T00:00:00.000Z");
  const now = "2025-02-10T00:00:00.000Z";
  const completed = completeActiveSubGoalAndAdvance(goal, null, now);
  assert.equal(resolvePhase(completed), "completed");
  assert.equal(completed.executionCompletedAt, now);
  assert.equal(resolveActiveSubGoal(completed), null);
});

// --- 6. Reordering sub-goals preserves target links ---

test("6. reorderSubGoals only ever changes .order, never id -- targets keep resolving to the same sub-goal", () => {
  const goal = readyGoalWithSubGoals(["א", "ב", "ג"]);
  const [first, second, third] = goal.subGoals!;
  const target: ArcGoalTarget = { ...createEmptyArcGoalTarget(goal.id, second.id, "2025-01-01T00:00:00.000Z"), name: "יעד קבוע" };

  const reordered = reorderSubGoals(goal, [third.id, first.id, second.id], "2025-01-05T00:00:00.000Z");
  assert.equal(reordered.subGoals!.find((s) => s.id === third.id)!.order, 0);
  assert.equal(reordered.subGoals!.find((s) => s.id === first.id)!.order, 1);
  assert.equal(reordered.subGoals!.find((s) => s.id === second.id)!.order, 2);
  // The target's own subGoalId never changed -- it still resolves to "second" regardless of its new order.
  assert.equal(target.subGoalId, second.id);
  assert.equal(reordered.subGoals!.find((s) => s.id === target.subGoalId)!.name, "ב");
});

test("6b. reorderSubGoals never drops a sub-goal missing from the given ordering", () => {
  const goal = readyGoalWithSubGoals(["א", "ב", "ג"]);
  const [first, , third] = goal.subGoals!;
  const reordered = reorderSubGoals(goal, [first.id, third.id], "2025-01-05T00:00:00.000Z");
  assert.equal(reordered.subGoals!.length, 3);
});

// --- 10/14/16. Target occurrence resolution: one-time, recurring, timezone-safe local-date math ---

test("10. a one-time target's today/next occurrence resolves from its own plannedDate/plannedTime", () => {
  const target: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), plannedDate: "2025-03-10", plannedTime: "08:30" };
  const beforeNoon = new Date("2025-03-10T06:00:00");
  const today = resolveTargetTodayOccurrenceDate(target, beforeNoon);
  assert.ok(today);
  assert.equal(today!.getHours(), 8);
  assert.equal(today!.getMinutes(), 30);
  assert.equal(resolveTargetTodayOccurrenceDate(target, new Date("2025-03-11T06:00:00")), null);
});

test("14. a recurring target's occurrence status is independent per day -- completing one day never completes another", () => {
  const target: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), recurrenceDaysOfWeek: [1, 3, 5], plannedTime: "07:00" };
  assert.equal(isTargetRecurring(target), true);
  const monday = new Date("2025-03-10T06:00:00"); // Monday
  const wednesday = new Date("2025-03-12T06:00:00");
  const completions = [{ targetId: target.id, occurrenceDateLocal: "2025-03-10", completedAt: "2025-03-10T07:05:00.000Z" }];
  assert.equal(resolveTargetStatusToday(target, completions, monday), "completed");
  assert.equal(resolveTargetStatusToday(target, completions, wednesday), "upcoming");
});

test("16. occurrence date math stays correct across a month boundary (local calendar arithmetic, not UTC)", () => {
  const target: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), recurrenceDaysOfWeek: [6], plannedTime: "09:00" }; // Saturdays
  const lateInMonth = new Date("2025-01-30T10:00:00"); // Thursday, Jan 30 -- next Saturday is Feb 1
  const next = resolveTargetNextOccurrenceDate(target, lateInMonth);
  assert.ok(next);
  assert.equal(next!.getMonth(), 1); // February (0-indexed)
  assert.equal(next!.getDate(), 1);
});

// --- 6/13. Completing a target: one-time vs recurring, per-occurrence never whole-series ---

test("13. completing a one-time target marks it completed and clears its future occurrence (obsolete reminders cancel)", () => {
  const target: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), plannedDate: "2099-01-01", plannedTime: "09:00" };
  const { target: completed, occurrence } = completeTarget(target, "2025-06-01T00:00:00.000Z");
  assert.equal(completed.status, "completed");
  assert.equal(occurrence, null);
  // A completed one-time target never resolves a future occurrence again, even though its plannedDate is still far in the future.
  assert.equal(resolveTargetNextOccurrenceDate(completed, new Date("2025-06-01T00:00:00")), null);
});

test("6c/14b. completing a recurring target records ONLY today's occurrence -- the target itself keeps recurring", () => {
  const target: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), recurrenceDaysOfWeek: [1, 2, 3, 4, 5] };
  const { target: unchanged, occurrence } = completeTarget(target, "2025-03-10T09:00:00.000Z");
  assert.equal(unchanged.status, "pending");
  assert.ok(occurrence);
  assert.equal(occurrence!.targetId, target.id);
  assert.equal(isTargetOccurrenceCompleted(target.id, occurrence!.occurrenceDateLocal, [occurrence!]), true);
});

test("uncompleteTarget safely reverts a one-time target and is a no-op for a recurring one (spec: undo where the data model supports it)", () => {
  const oneTime: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), status: "completed", actualCompletionDate: "2025-01-02T00:00:00.000Z" };
  const reverted = uncompleteTarget(oneTime, "2025-01-03T00:00:00.000Z");
  assert.equal(reverted.status, "pending");
  assert.equal(reverted.actualCompletionDate, null);

  const recurring: ArcGoalTarget = { ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"), recurrenceDaysOfWeek: [1] };
  assert.deepEqual(uncompleteTarget(recurring, "2025-01-03T00:00:00.000Z"), recurring);
});

// --- 11. Editing a target replaces rather than duplicates its notification ---

test("11. isTargetNotificationInSync is true when nothing about the schedule actually changed", () => {
  const target: ArcGoalTarget = {
    ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"),
    plannedDate: "2099-01-01",
    plannedTime: "09:00",
    remindersEnabled: true,
    notificationId: "notif-1",
    notificationScheduledFor: "2099-01-01T09:00:00.000Z",
  };
  assert.equal(isTargetNotificationInSync(target, new Date("2025-06-01T00:00:00")), true);
  // Editing an unrelated field (name) never changes the schedule -- still in sync.
  assert.equal(isTargetNotificationInSync({ ...target, name: "שם חדש" }, new Date("2025-06-01T00:00:00")), true);
  // Editing the actual date DOES desync it -- a reschedule is required.
  assert.equal(isTargetNotificationInSync({ ...target, plannedDate: "2099-02-02" }, new Date("2025-06-01T00:00:00")), false);
});

test("11b. disabling reminders desyncs a target that still has a stale scheduled notification recorded", () => {
  const target: ArcGoalTarget = {
    ...createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z"),
    remindersEnabled: false,
    notificationId: "stale",
    notificationScheduledFor: "2099-01-01T09:00:00.000Z",
  };
  assert.equal(isTargetNotificationInSync(target), false);
});

// --- 17/18. Exact return context, save/clear round trip ---

test("17. setExecutionReturnContext saves every typed field, never an untyped string", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  const withContext = setExecutionReturnContext(
    goal,
    { phase: "execution", week: null, subGoalId: "sub-1", targetId: "target-1", linkedRoutineId: "routine-1", originScreen: "/goals/target/[targetId]" },
    "2025-01-02T00:00:00.000Z"
  );
  assert.deepEqual(withContext.executionReturnContext, {
    sourceMode: "reach_your_goal",
    arcGoalId: "goal-1",
    phase: "execution",
    week: null,
    subGoalId: "sub-1",
    targetId: "target-1",
    linkedRoutineId: "routine-1",
    originScreen: "/goals/target/[targetId]",
    savedAt: "2025-01-02T00:00:00.000Z",
  });
});

test("18. clearing the return context after a successful return leaves no stale pointer behind", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  const withContext = setExecutionReturnContext(
    goal,
    { phase: "execution", week: null, subGoalId: null, targetId: "target-1", linkedRoutineId: null, originScreen: "/goals/target/[targetId]" },
    "2025-01-02T00:00:00.000Z"
  );
  assert.equal(clearExecutionReturnContext(withContext).executionReturnContext, null);
});

// --- 18b/20. Support routing: canceling/no-difficulty return directly, practical barrier never launches emotional ARC ---

test("18b. 'no difficulty' resolves to no route at all -- nothing is launched, canceling the chooser is equally a no-navigation no-op", () => {
  const goal = createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z");
  assert.deepEqual(resolveTargetSupportRoute("none", goal), { kind: "none" });
});

test("20. a practical barrier NEVER resolves to an emotional/urge/thought ARC route, even when both are fully configured", () => {
  const goal: ArcGoal = {
    ...createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z"),
    identityProtocolId: "identity-build-1",
    interferingMappings: [{ id: "m1", interferingState: "עייפות", supportiveProtocolId: "state-build-1", supportiveAction: "לנוח" }],
    urgeMappings: [{ id: "u1", urgeArcId: "urge-1", need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }],
  };
  const route = resolveTargetSupportRoute("practical_barrier", goal);
  assert.deepEqual(route, { kind: "practical_barrier_options" });
});

test("emotion/urge/thought support routes resolve to the goal's own configured protocols, letting Full/Mini be chosen by the caller when both exist", () => {
  const goal: ArcGoal = {
    ...createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z"),
    identityProtocolId: "identity-build-1",
    interferingMappings: [{ id: "m1", interferingState: "עייפות", supportiveProtocolId: "state-build-1", supportiveAction: "לנוח" }],
  };
  assert.deepEqual(resolveTargetSupportRoute("emotion", goal), { kind: "full_arc", buildId: "state-build-1" });
  assert.deepEqual(resolveTargetSupportRoute("thought", goal), { kind: "full_arc", buildId: "identity-build-1" });

  const goalWithUrge: ArcGoal = {
    ...goal,
    urgeMappings: [{ id: "u1", urgeArcId: "urge-1", need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }],
  };
  assert.deepEqual(resolveTargetSupportRoute("urge", goalWithUrge), { kind: "arc_goal_urge_session" });
});

test("short_support prefers the program's own linked Mini ARC, falling back to Identity Recall when none is linked", () => {
  const withMini: ArcGoal = {
    ...createEmptyArcGoal("goal-1", "מטרה", "2025-01-01T00:00:00.000Z"),
    fourWeekProgram: { ...createFourWeekProgram("2025-01-06"), linkedMiniArcId: "mini-1" },
  };
  assert.deepEqual(resolveTargetSupportRoute("short_support", withMini), { kind: "mini_arc", miniArcId: "mini-1" });

  const withoutMini = createEmptyArcGoal("goal-2", "מטרה", "2025-01-01T00:00:00.000Z");
  assert.deepEqual(resolveTargetSupportRoute("short_support", withoutMini), { kind: "identity_recall" });
});

// --- 21. Backward compatibility: pure list helpers never corrupt other targets on delete/reorder ---

test("21. deleteArcGoalTargetFromList removes exactly one target, leaving every other target's own fields untouched", () => {
  const t1 = createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z");
  const t2 = createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z");
  const remaining = deleteArcGoalTargetFromList([t1, t2], t1.id);
  assert.deepEqual(remaining, [t2]);
});

test("21b. upsertArcGoalTargetInList updates in place by id and appends a genuinely new one, never duplicating", () => {
  const t1 = createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z");
  const list = [t1];
  const updated = upsertArcGoalTargetInList(list, { ...t1, name: "עודכן" });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].name, "עודכן");

  const t2 = createEmptyArcGoalTarget("goal-1", "sub-1", "2025-01-01T00:00:00.000Z");
  const appended = upsertArcGoalTargetInList(updated, t2);
  assert.equal(appended.length, 2);
});

test("21c. resolvePhase returns null for a legacy ArcGoal with no phase and no four-week program -- nothing auto-activates", () => {
  const legacy = createEmptyArcGoal("goal-1", "מטרה ישנה", "2020-01-01T00:00:00.000Z");
  assert.equal(resolvePhase(legacy), null);
  assert.equal(resolveActiveSubGoal(legacy), null);
});

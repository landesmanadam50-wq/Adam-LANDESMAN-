import test from "node:test";
import assert from "node:assert/strict";

import { isTaskPurposeContextEmpty, resolveTaskPurposeContext } from "./taskPurposeContext.ts";
import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { createArcGymGoal } from "./arcGymGoal.ts";
import type { ArcGymGoal } from "./arcGymGoal.ts";
import { createEmptyPurposeManifest } from "./purposeManifest.ts";
import type { PurposeManifest } from "./purposeManifest.ts";
import type { ArcGoal } from "./types.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function arcGoalFixture(overrides: Partial<ArcGoal> = {}): ArcGoal {
  return {
    id: "arcgoal-1",
    name: "",
    description: null,
    value: null,
    personalReason: null,
    goalAction: "",
    desiredResult: "",
    identityProtocolId: null,
    interferingMappings: [],
    urgeMappings: [],
    thoughtMappings: [],
    beliefMappings: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test("a task linked to an ArcGymGoal resolves goal/reason/value/identity from that goal's own dedicated manifest", () => {
  const manifest: PurposeManifest = { ...createEmptyPurposeManifest("m1", NOW), longTermGoal: "להיות מאמן אישי", personalReason: "לעזור לאנשים", personalValue: "נתינה", personalIdentity: "אני אדם שעוזר לאחרים" };
  const goal: ArcGymGoal = createArcGymGoal("g1", "ללמוד פסיכולוגיה לצורך האימון", null, "m1", NOW);
  const task: Task = { ...createEmptyTask("t1", "ללמוד פרק 3", "לפתוח את הספר", NOW), arcGymGoalId: "g1" };

  const context = resolveTaskPurposeContext(task, [manifest], [goal], []);
  assert.deepEqual(context, {
    goal: "ללמוד פסיכולוגיה לצורך האימון",
    reason: "לעזור לאנשים",
    value: "נתינה",
    identity: "אני אדם שעוזר לאחרים",
  });
});

test("a task linked directly to a PurposeManifest (via purposeManifestId, a ManifestGoal task) resolves from that manifest's own four fields", () => {
  const manifest: PurposeManifest = { ...createEmptyPurposeManifest("m2", NOW), longTermGoal: "לפתח קריירה", personalReason: "ביטחון כלכלי", personalValue: "עצמאות", personalIdentity: "" };
  const task: Task = { ...createEmptyTask("t2", "כתיבת קורות חיים", "לפתוח מסמך", NOW), purposeManifestId: "m2" };

  const context = resolveTaskPurposeContext(task, [manifest], [], []);
  assert.equal(context.goal, "לפתח קריירה");
  assert.equal(context.reason, "ביטחון כלכלי");
  assert.equal(context.value, "עצמאות");
  assert.equal(context.identity, null, "personalIdentity was left blank on the manifest -- never invented");
});

test("a task linked to an ArcGoal resolves goal/reason/value from it, but identity stays null -- ArcGoal.identityProtocolId references a whole protocol, never a simple display line", () => {
  const goal = arcGoalFixture({ id: "ag1", name: "להפסיק לעשן", value: "בריאות", personalReason: "לחיות יותר שנים", identityProtocolId: "protocol-1" });
  const task: Task = { ...createEmptyTask("t3", "לצאת להליכה", "לנעול נעליים", NOW), linkedArcGoalId: "ag1" };

  const context = resolveTaskPurposeContext(task, [], [], [goal]);
  assert.deepEqual(context, { goal: "להפסיק לעשן", reason: "לחיות יותר שנים", value: "בריאות", identity: null });
});

test("a task with no linked goal and no task-level fields resolves to every field null, and isTaskPurposeContextEmpty is true", () => {
  const task = createEmptyTask("t4", "משימה פשוטה", "התחל", NOW);
  const context = resolveTaskPurposeContext(task, [], [], []);
  assert.deepEqual(context, { goal: null, reason: null, value: null, identity: null });
  assert.equal(isTaskPurposeContextEmpty(context), true);
});

test("a task with no linked goal but its own task-level value/identity set still resolves partial info -- never requires a goal to show something real", () => {
  const task: Task = { ...createEmptyTask("t5", "תרגול יומי", "התחל", NOW), value: "התפתחות אישית", identity: "אני אדם ממושמע" };
  const context = resolveTaskPurposeContext(task, [], [], []);
  assert.deepEqual(context, { goal: null, reason: null, value: "התפתחות אישית", identity: "אני אדם ממושמע" });
  assert.equal(isTaskPurposeContextEmpty(context), false);
});

test("task-level reason/value/identity take priority over the linked goal's own general info, per field independently", () => {
  const manifest: PurposeManifest = { ...createEmptyPurposeManifest("m3", NOW), longTermGoal: "מטרה כללית", personalReason: "סיבה כללית", personalValue: "ערך כללי", personalIdentity: "זהות כללית" };
  const goal: ArcGymGoal = createArcGymGoal("g3", "מטרת ARC", null, "m3", NOW);
  const task: Task = {
    ...createEmptyTask("t6", "משימה ספציפית", "התחל", NOW),
    arcGymGoalId: "g3",
    reason: "סיבה ספציפית למשימה הזאת",
    value: null,
    identity: "זהות ספציפית למשימה הזאת",
  };

  const context = resolveTaskPurposeContext(task, [manifest], [goal], []);
  assert.equal(context.goal, "מטרת ARC", "the goal text itself is never overridden at task level");
  assert.equal(context.reason, "סיבה ספציפית למשימה הזאת", "task-level reason wins");
  assert.equal(context.value, "ערך כללי", "value was left blank on the task, so the goal-level default is used");
  assert.equal(context.identity, "זהות ספציפית למשימה הזאת", "task-level identity wins");
});

test("a dangling goal id (the linked goal no longer exists) falls back to task-level fields only, never crashing or inventing a goal", () => {
  const task: Task = { ...createEmptyTask("t7", "משימה", "התחל", NOW), arcGymGoalId: "deleted-goal", value: "ערך שנשאר על המשימה" };
  const context = resolveTaskPurposeContext(task, [], [], []);
  assert.deepEqual(context, { goal: null, reason: null, value: "ערך שנשאר על המשימה", identity: null });
});

test("whitespace-only goal-level or task-level text is treated as unset, never shown as a blank line", () => {
  const manifest: PurposeManifest = { ...createEmptyPurposeManifest("m4", NOW), longTermGoal: "   ", personalReason: "  ", personalValue: "ערך תקין", personalIdentity: "" };
  const task: Task = { ...createEmptyTask("t8", "משימה", "התחל", NOW), purposeManifestId: "m4", identity: "   " };
  const context = resolveTaskPurposeContext(task, [manifest], [], []);
  assert.deepEqual(context, { goal: null, reason: null, value: "ערך תקין", identity: null });
});

test("switching between two tasks linked to different ArcGymGoals resolves each task's own goal independently, with no leakage between them", () => {
  const manifestA: PurposeManifest = { ...createEmptyPurposeManifest("ma", NOW), longTermGoal: "מטרה א", personalReason: "סיבה א", personalValue: "ערך א", personalIdentity: "זהות א" };
  const manifestB: PurposeManifest = { ...createEmptyPurposeManifest("mb", NOW), longTermGoal: "מטרה ב", personalReason: "סיבה ב", personalValue: "ערך ב", personalIdentity: "זהות ב" };
  const goalA = createArcGymGoal("ga", "מטרת ARC א", null, "ma", NOW);
  const goalB = createArcGymGoal("gb", "מטרת ARC ב", null, "mb", NOW);
  const taskA: Task = { ...createEmptyTask("ta", "משימה א", "התחל", NOW), arcGymGoalId: "ga" };
  const taskB: Task = { ...createEmptyTask("tb", "משימה ב", "התחל", NOW), arcGymGoalId: "gb" };

  const contextA = resolveTaskPurposeContext(taskA, [manifestA, manifestB], [goalA, goalB], []);
  const contextB = resolveTaskPurposeContext(taskB, [manifestA, manifestB], [goalA, goalB], []);
  assert.equal(contextA.goal, "מטרת ARC א");
  assert.equal(contextB.goal, "מטרת ARC ב");
  assert.notDeepEqual(contextA, contextB);
});

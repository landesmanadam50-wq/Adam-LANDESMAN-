import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcGymGoal,
  createArcGymGoalObjective,
  deleteArcGymGoalFromList,
  deleteArcGymGoalObjectiveFromList,
  reorderArcGymGoalObjectives,
  resolveArcGymGoalObjectiveProgress,
  resolveLinkedExercisesForArcGymGoal,
  resolveObjectivesForArcGymGoal,
  toggleArcGymGoalObjectiveCompleted,
  updateArcGymGoal,
  upsertArcGymGoalInList,
  upsertArcGymGoalObjectiveInList,
} from "./arcGymGoal.ts";
import type { ArcGymMemoryExercise, ArcGymSituation } from "./arcGym.ts";
import type { ArcResultExercise } from "./arcResult.ts";
import type { ArcFocusExercise } from "./arcFocusExercise.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function situation(overrides: Partial<ArcGymSituation> = {}): ArcGymSituation {
  return {
    id: "sit-1",
    manifestId: "m1",
    behaviorId: "b1",
    behaviorText: "התנהגות",
    situationDescription: "",
    trigger: "",
    desiredAction: "",
    visualizationDetails: null,
    linkedGoalIds: [],
    linkedArcPerspectiveSessionId: null,
    arcPerspectiveNewInterpretation: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function memoryExercise(overrides: Partial<ArcGymMemoryExercise> = {}): ArcGymMemoryExercise {
  return { id: "mem-1", situationText: "", actionText: "", linkedGoalIds: [], createdAt: NOW, updatedAt: NOW, ...overrides };
}

function resultExercise(overrides: Partial<ArcResultExercise> = {}): ArcResultExercise {
  return {
    id: "res-1",
    focusPoint: "",
    successVisualization: "",
    successMantra: "",
    supportiveBodyLanguage: "",
    linkedTaskIds: [],
    linkedGoalIds: [],
    parentBehaviourSituationId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function focusExercise(overrides: Partial<ArcFocusExercise> = {}): ArcFocusExercise {
  return {
    id: "focus-1",
    title: "תרגיל",
    settings: { durationMinutes: 5, tapRhythmSeconds: 2, showTapCue: true, attentionChecksEnabled: true },
    linkedGoalIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test("createArcGymGoal trims title/description and defaults description to null when blank", () => {
  const goal = createArcGymGoal("g1", "  לחזק ביטחון  ", "  ", "m1", NOW);
  assert.equal(goal.title, "לחזק ביטחון");
  assert.equal(goal.description, null);
  assert.equal(goal.manifestId, "m1");
});

test("updateArcGymGoal only changes the fields given, stamping updatedAt", () => {
  const goal = createArcGymGoal("g1", "מטרה", null, "m1", NOW);
  const updated = updateArcGymGoal(goal, { description: "תיאור חדש" }, "2026-01-06T00:00:00.000Z");
  assert.equal(updated.title, "מטרה");
  assert.equal(updated.description, "תיאור חדש");
  assert.equal(updated.updatedAt, "2026-01-06T00:00:00.000Z");
});

test("upsertArcGymGoalInList adds a new goal or replaces an existing one by id, never touching others", () => {
  const a = createArcGymGoal("a", "A", null, "ma", NOW);
  const b = createArcGymGoal("b", "B", null, "mb", NOW);
  const list = upsertArcGymGoalInList([a], b);
  assert.equal(list.length, 2);
  const replacedA = updateArcGymGoal(a, { title: "A2" }, NOW);
  const list2 = upsertArcGymGoalInList(list, replacedA);
  assert.equal(list2.length, 2);
  assert.equal(list2.find((g) => g.id === "a")?.title, "A2");
  assert.equal(list2.find((g) => g.id === "b")?.title, "B");
});

test("deleteArcGymGoalFromList removes only that goal -- the caller is responsible for unlinking exercises/tasks elsewhere", () => {
  const a = createArcGymGoal("a", "A", null, "ma", NOW);
  const b = createArcGymGoal("b", "B", null, "mb", NOW);
  const list = deleteArcGymGoalFromList([a, b], "a");
  assert.deepEqual(list.map((g) => g.id), ["b"]);
});

test("objective CRUD: create/upsert/resolve/reorder/toggle/delete, scoped strictly to one goal", () => {
  let objectives = [createArcGymGoalObjective("g1", "יעד א", 0, NOW), createArcGymGoalObjective("g1", "יעד ב", 1, NOW), createArcGymGoalObjective("g2", "יעד אחר", 0, NOW)];
  const forG1 = resolveObjectivesForArcGymGoal(objectives, "g1");
  assert.equal(forG1.length, 2);
  assert.equal(forG1[0].title, "יעד א");

  const ids = [forG1[1].id, forG1[0].id];
  objectives = reorderArcGymGoalObjectives(objectives, "g1", ids, NOW);
  const reordered = resolveObjectivesForArcGymGoal(objectives, "g1");
  assert.equal(reordered[0].title, "יעד ב");
  assert.equal(reordered[0].id, forG1[1].id);
  // g2's own objective must be completely unaffected by reordering g1.
  assert.equal(resolveObjectivesForArcGymGoal(objectives, "g2").length, 1);

  objectives = toggleArcGymGoalObjectiveCompleted(objectives, reordered[0].id, NOW);
  assert.equal(resolveArcGymGoalObjectiveProgress(objectives, "g1").completed, 1);
  assert.equal(resolveArcGymGoalObjectiveProgress(objectives, "g1").total, 2);

  objectives = deleteArcGymGoalObjectiveFromList(objectives, reordered[0].id);
  assert.equal(resolveObjectivesForArcGymGoal(objectives, "g1").length, 1);
});

test("upsertArcGymGoalObjectiveInList adds a new objective or replaces an existing one by id", () => {
  const objective = createArcGymGoalObjective("g1", "יעד", 0, NOW);
  const list = upsertArcGymGoalObjectiveInList([], objective);
  assert.equal(list.length, 1);
  const updated = { ...objective, title: "יעד מעודכן" };
  const list2 = upsertArcGymGoalObjectiveInList(list, updated);
  assert.equal(list2.length, 1);
  assert.equal(list2[0].title, "יעד מעודכן");
});

test("resolveLinkedExercisesForArcGymGoal filters all four kinds by linkedGoalIds, never duplicating or inventing refs", () => {
  const situations = [situation({ id: "s1", linkedGoalIds: ["g1"] }), situation({ id: "s2", linkedGoalIds: [] })];
  const memoryExercises = [memoryExercise({ id: "m1", linkedGoalIds: ["g1"] })];
  const resultExercises = [resultExercise({ id: "r1", linkedGoalIds: ["g2"] })];
  const focusExercises = [focusExercise({ id: "f1", linkedGoalIds: ["g1", "g2"] })];

  const refsForG1 = resolveLinkedExercisesForArcGymGoal("g1", situations, memoryExercises, resultExercises, focusExercises);
  assert.deepEqual(
    refsForG1.sort((a, b) => a.kind.localeCompare(b.kind)),
    [
      { kind: "behaviour", exerciseId: "s1" },
      { kind: "focus", exerciseId: "f1" },
      { kind: "memory", exerciseId: "m1" },
    ]
  );

  const refsForG2 = resolveLinkedExercisesForArcGymGoal("g2", situations, memoryExercises, resultExercises, focusExercises);
  assert.deepEqual(refsForG2, [
    { kind: "result", exerciseId: "r1" },
    { kind: "focus", exerciseId: "f1" },
  ]);

  const refsForUnknown = resolveLinkedExercisesForArcGymGoal("g-does-not-exist", situations, memoryExercises, resultExercises, focusExercises);
  assert.deepEqual(refsForUnknown, []);
});

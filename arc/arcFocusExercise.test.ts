import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcFocusExercise,
  deleteArcFocusExerciseFromList,
  linkGoalToArcFocusExercise,
  resolveArcFocusExercisesForGoal,
  unlinkGoalFromArcFocusExercise,
  updateArcFocusExercise,
  upsertArcFocusExerciseInList,
} from "./arcFocusExercise.ts";

const NOW = "2026-01-05T12:00:00.000Z";
const SETTINGS = { durationMinutes: 5, tapRhythmSeconds: 2, showTapCue: true, attentionChecksEnabled: true };

test("createArcFocusExercise trims the title and starts with no linked goals", () => {
  const exercise = createArcFocusExercise("f1", "  תרגול ריכוז  ", SETTINGS, NOW);
  assert.equal(exercise.title, "תרגול ריכוז");
  assert.deepEqual(exercise.settings, SETTINGS);
  assert.deepEqual(exercise.linkedGoalIds, []);
});

test("updateArcFocusExercise replaces the settings as a fresh snapshot, never merging field-by-field", () => {
  const exercise = createArcFocusExercise("f1", "תרגול", SETTINGS, NOW);
  const newSettings = { durationMinutes: 10, tapRhythmSeconds: 3, showTapCue: false, attentionChecksEnabled: false };
  const updated = updateArcFocusExercise(exercise, { settings: newSettings }, "2026-01-06T00:00:00.000Z");
  assert.deepEqual(updated.settings, newSettings);
  assert.equal(updated.title, "תרגול");
  assert.equal(updated.updatedAt, "2026-01-06T00:00:00.000Z");
});

test("upsertArcFocusExerciseInList adds a new exercise or replaces an existing one by id", () => {
  const exercise = createArcFocusExercise("f1", "תרגול", SETTINGS, NOW);
  const list = upsertArcFocusExerciseInList([], exercise);
  assert.equal(list.length, 1);
  const renamed = updateArcFocusExercise(exercise, { title: "תרגול חדש" }, NOW);
  const list2 = upsertArcFocusExerciseInList(list, renamed);
  assert.equal(list2.length, 1);
  assert.equal(list2[0].title, "תרגול חדש");
});

test("deleteArcFocusExerciseFromList removes only that exercise", () => {
  const a = createArcFocusExercise("a", "A", SETTINGS, NOW);
  const b = createArcFocusExercise("b", "B", SETTINGS, NOW);
  const list = deleteArcFocusExerciseFromList([a, b], "a");
  assert.deepEqual(list.map((e) => e.id), ["b"]);
});

test("linkGoalToArcFocusExercise is idempotent -- linking twice never duplicates the id", () => {
  let exercise = createArcFocusExercise("f1", "תרגול", SETTINGS, NOW);
  exercise = linkGoalToArcFocusExercise(exercise, "g1", NOW);
  exercise = linkGoalToArcFocusExercise(exercise, "g1", NOW);
  assert.deepEqual(exercise.linkedGoalIds, ["g1"]);
});

test("unlinkGoalFromArcFocusExercise removes only the given goal id, no-op if not linked", () => {
  let exercise = createArcFocusExercise("f1", "תרגול", SETTINGS, NOW);
  exercise = linkGoalToArcFocusExercise(exercise, "g1", NOW);
  exercise = linkGoalToArcFocusExercise(exercise, "g2", NOW);
  const unlinked = unlinkGoalFromArcFocusExercise(exercise, "g1", NOW);
  assert.deepEqual(unlinked.linkedGoalIds, ["g2"]);
  const noop = unlinkGoalFromArcFocusExercise(unlinked, "g-not-linked", NOW);
  assert.deepEqual(noop.linkedGoalIds, ["g2"]);
});

test("resolveArcFocusExercisesForGoal filters by linkedGoalIds, never touching exercises linked to a different goal", () => {
  let a = createArcFocusExercise("a", "A", SETTINGS, NOW);
  let b = createArcFocusExercise("b", "B", SETTINGS, NOW);
  a = linkGoalToArcFocusExercise(a, "g1", NOW);
  b = linkGoalToArcFocusExercise(b, "g2", NOW);
  const forG1 = resolveArcFocusExercisesForGoal([a, b], "g1");
  assert.deepEqual(forG1.map((e) => e.id), ["a"]);
});

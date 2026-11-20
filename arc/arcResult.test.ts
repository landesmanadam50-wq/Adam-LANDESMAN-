import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcResultExercise,
  deleteArcResultExerciseFromList,
  generateArcResultExerciseId,
  hasLinkedArcResult,
  linkTaskToArcResult,
  resolveArcResultsForTask,
  unlinkTaskFromArcResult,
  updateArcResultExercise,
  upsertArcResultExerciseInList,
} from "./arcResult.ts";
import type { ArcResultExercise } from "./arcResult.ts";

const NOW = "2026-01-05T09:00:00.000Z";
const LATER = "2026-01-05T10:00:00.000Z";

function makeExercise(id: string): ArcResultExercise {
  return createArcResultExercise(id, "  נקודת מיקוד  ", "  דימיון הצלחה  ", "  משפט הצלחה  ", "  שפת גוף  ", NOW);
}

test("generateArcResultExerciseId returns distinct ids on successive calls", () => {
  const a = generateArcResultExerciseId();
  const b = generateArcResultExerciseId();
  assert.notEqual(a, b);
});

test("createArcResultExercise trims every text field, starts with zero linked tasks, and stamps createdAt/updatedAt identically", () => {
  const exercise = makeExercise("r1");
  assert.equal(exercise.focusPoint, "נקודת מיקוד");
  assert.equal(exercise.successVisualization, "דימיון הצלחה");
  assert.equal(exercise.successMantra, "משפט הצלחה");
  assert.equal(exercise.supportiveBodyLanguage, "שפת גוף");
  assert.deepEqual(exercise.linkedTaskIds, []);
  assert.equal(exercise.createdAt, NOW);
  assert.equal(exercise.updatedAt, NOW);
});

test("updateArcResultExercise only changes the fields given in the patch, trims them, preserves linkedTaskIds, and bumps updatedAt", () => {
  const exercise = linkTaskToArcResult(makeExercise("r1"), "task-1", NOW);
  const updated = updateArcResultExercise(exercise, { successMantra: "  משפט חדש  " }, LATER);
  assert.equal(updated.successMantra, "משפט חדש");
  assert.equal(updated.focusPoint, exercise.focusPoint, "fields not in the patch must stay unchanged");
  assert.deepEqual(updated.linkedTaskIds, ["task-1"], "task links are never touched by the editor's own save");
  assert.equal(updated.updatedAt, LATER);
  assert.equal(updated.createdAt, NOW, "createdAt must never change on update");
});

test("upsertArcResultExerciseInList adds a new exercise, and replaces an existing one by id rather than duplicating it", () => {
  const r1 = makeExercise("r1");
  const r2 = makeExercise("r2");
  const list = upsertArcResultExerciseInList([r1], r2);
  assert.equal(list.length, 2);

  const updatedR1 = updateArcResultExercise(r1, { focusPoint: "חדש" }, LATER);
  const replaced = upsertArcResultExerciseInList(list, updatedR1);
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find((item) => item.id === "r1")?.focusPoint, "חדש");
});

test("deleteArcResultExerciseFromList removes only the matching exercise, leaving every other one untouched", () => {
  const list = [makeExercise("r1"), makeExercise("r2")];
  const next = deleteArcResultExerciseFromList(list, "r1");
  assert.deepEqual(next.map((item) => item.id), ["r2"]);
});

test("linkTaskToArcResult adds the task id once, and is idempotent for an already-linked task (section 7: 'linking or unlinking one or more tasks')", () => {
  const exercise = makeExercise("r1");
  const linked = linkTaskToArcResult(exercise, "task-1", NOW);
  assert.deepEqual(linked.linkedTaskIds, ["task-1"]);

  const linkedAgain = linkTaskToArcResult(linked, "task-1", LATER);
  assert.deepEqual(linkedAgain.linkedTaskIds, ["task-1"], "linking an already-linked task must never duplicate the id");
  assert.equal(linkedAgain.updatedAt, linked.updatedAt, "a no-op link must never bump updatedAt");
});

test("linkTaskToArcResult supports linking several tasks to the SAME result (section 5: 'if multiple results are linked' implies the reverse is also possible)", () => {
  let exercise = makeExercise("r1");
  exercise = linkTaskToArcResult(exercise, "task-1", NOW);
  exercise = linkTaskToArcResult(exercise, "task-2", NOW);
  assert.deepEqual(exercise.linkedTaskIds, ["task-1", "task-2"]);
});

test("unlinkTaskFromArcResult removes only the given task id, and is a no-op (never throwing) for a task that was never linked", () => {
  let exercise = makeExercise("r1");
  exercise = linkTaskToArcResult(exercise, "task-1", NOW);
  exercise = linkTaskToArcResult(exercise, "task-2", NOW);
  const unlinked = unlinkTaskFromArcResult(exercise, "task-1", LATER);
  assert.deepEqual(unlinked.linkedTaskIds, ["task-2"]);

  const noop = unlinkTaskFromArcResult(unlinked, "task-99", LATER);
  assert.deepEqual(noop.linkedTaskIds, ["task-2"]);
  assert.equal(noop.updatedAt, unlinked.updatedAt, "a no-op unlink must never bump updatedAt");
});

test("resolveArcResultsForTask returns every exercise linked to the given task, in the SAME order they were passed in, and excludes every exercise not linked to it", () => {
  const r1 = linkTaskToArcResult(makeExercise("r1"), "task-1", NOW);
  const r2 = makeExercise("r2");
  const r3 = linkTaskToArcResult(makeExercise("r3"), "task-1", NOW);
  const resolved = resolveArcResultsForTask([r1, r2, r3], "task-1");
  assert.deepEqual(resolved.map((item) => item.id), ["r1", "r3"]);
});

test("resolveArcResultsForTask returns an empty list for a task with no linked result at all -- required test 9 ('no suggestion appears when no result is linked')", () => {
  const r1 = makeExercise("r1");
  assert.deepEqual(resolveArcResultsForTask([r1], "task-1"), []);
  assert.deepEqual(resolveArcResultsForTask([], "task-1"), []);
});

test("hasLinkedArcResult is true exactly when resolveArcResultsForTask would return a non-empty list, and false otherwise", () => {
  const linked = linkTaskToArcResult(makeExercise("r1"), "task-1", NOW);
  assert.equal(hasLinkedArcResult([linked], "task-1"), true);
  assert.equal(hasLinkedArcResult([linked], "task-2"), false);
  assert.equal(hasLinkedArcResult([], "task-1"), false);
});

test("required test 11 (multiple linked results are selectable only after choosing to practice): resolveArcResultsForTask genuinely returns more than one exercise when more than one is linked to the same task, so the caller can detect the 'show selection' case", () => {
  const r1 = linkTaskToArcResult(makeExercise("r1"), "task-1", NOW);
  const r2 = linkTaskToArcResult(makeExercise("r2"), "task-1", NOW);
  const resolved = resolveArcResultsForTask([r1, r2], "task-1");
  assert.equal(resolved.length, 2);
});

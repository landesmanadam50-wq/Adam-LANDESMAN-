import test from "node:test";
import assert from "node:assert/strict";

import {
  addFeelingActionLink,
  addTaskFeelingLink,
  createInternalAction,
  createSupportiveFeeling,
  deleteInternalActionFromList,
  deleteSupportiveFeelingFromList,
  deleteTaskFeelingLinksForFeeling,
  deleteFeelingActionLinksForAction,
  findInternalActionByText,
  findSupportiveFeelingByLabel,
  removeFeelingActionLink,
  removeTaskFeelingLink,
  resolveActionsForFeeling,
  resolveFeelingsForTask,
  upsertInternalActionInList,
  upsertSupportiveFeelingInList,
} from "./supportiveFeelings.ts";

const NOW = "2026-11-25T08:00:00.000Z";

test("createSupportiveFeeling/createInternalAction trim their text and mint distinct ids", () => {
  const feeling = createSupportiveFeeling("  סקרנות  ", NOW);
  assert.equal(feeling.label, "סקרנות");
  const action = createInternalAction(feeling.id, "  לדמיין שיחה  ", NOW);
  assert.equal(action.text, "לדמיין שיחה");
  assert.equal(action.feelingId, feeling.id);
  assert.notEqual(feeling.id, action.id);
});

test("upsert/delete-from-list follow the exact add-or-replace, filter-out convention", () => {
  const feeling = createSupportiveFeeling("מסוגלות", NOW);
  let feelings = upsertSupportiveFeelingInList([], feeling);
  assert.equal(feelings.length, 1);
  const renamed = { ...feeling, label: "מסוגלות גבוהה", updatedAt: NOW };
  feelings = upsertSupportiveFeelingInList(feelings, renamed);
  assert.equal(feelings.length, 1, "upsert replaces, never duplicates");
  assert.equal(feelings[0].label, "מסוגלות גבוהה");
  feelings = deleteSupportiveFeelingFromList(feelings, feeling.id);
  assert.equal(feelings.length, 0);
});

test("resolveFeelingsForTask returns only feelings actually linked to this task, in link order", () => {
  const f1 = createSupportiveFeeling("סקרנות", NOW);
  const f2 = createSupportiveFeeling("מסוגלות", NOW);
  const feelings = [f1, f2];
  let links = addTaskFeelingLink([], "task-1", f1.id, NOW);
  links = addTaskFeelingLink(links, "task-1", f2.id, NOW);
  links = addTaskFeelingLink(links, "task-2", f1.id, NOW);
  const forTask1 = resolveFeelingsForTask("task-1", links, feelings);
  assert.deepEqual(forTask1.map((f) => f.id), [f1.id, f2.id]);
  const forTask2 = resolveFeelingsForTask("task-2", links, feelings);
  assert.deepEqual(forTask2.map((f) => f.id), [f1.id]);
});

test("addTaskFeelingLink/addFeelingActionLink are idempotent -- linking the same pair twice never duplicates", () => {
  let links = addTaskFeelingLink([], "task-1", "feeling-1", NOW);
  links = addTaskFeelingLink(links, "task-1", "feeling-1", NOW);
  assert.equal(links.length, 1);
  let actionLinks = addFeelingActionLink([], "feeling-1", "action-1", NOW);
  actionLinks = addFeelingActionLink(actionLinks, "feeling-1", "action-1", NOW);
  assert.equal(actionLinks.length, 1);
});

test("removeTaskFeelingLink/removeFeelingActionLink remove exactly the one matching pair", () => {
  let links = addTaskFeelingLink([], "task-1", "feeling-1", NOW);
  links = addTaskFeelingLink(links, "task-1", "feeling-2", NOW);
  links = removeTaskFeelingLink(links, "task-1", "feeling-1");
  assert.equal(links.length, 1);
  assert.equal(links[0].feelingId, "feeling-2");
});

test("resolveActionsForFeeling returns only actions linked to this feeling", () => {
  const a1 = createInternalAction("feeling-1", "פעולה א", NOW);
  const a2 = createInternalAction("feeling-1", "פעולה ב", NOW);
  const a3 = createInternalAction("feeling-2", "פעולה ג", NOW);
  const actions = [a1, a2, a3];
  let links = addFeelingActionLink([], "feeling-1", a1.id, NOW);
  links = addFeelingActionLink(links, "feeling-1", a2.id, NOW);
  links = addFeelingActionLink(links, "feeling-2", a3.id, NOW);
  const forFeeling1 = resolveActionsForFeeling("feeling-1", links, actions);
  assert.deepEqual(forFeeling1.map((a) => a.id), [a1.id, a2.id]);
});

test("deleting a feeling/action removes its link rows but the caller's historical usage rows (a separate collection) are never touched by this module at all -- it has no awareness of InternalActionUsage", () => {
  let links = addTaskFeelingLink([], "task-1", "feeling-1", NOW);
  let actionLinks = addFeelingActionLink([], "feeling-1", "action-1", NOW);
  links = deleteTaskFeelingLinksForFeeling(links, "feeling-1");
  actionLinks = deleteFeelingActionLinksForAction(actionLinks, "action-1");
  assert.equal(links.length, 0);
  assert.equal(actionLinks.length, 0);
});

test("findSupportiveFeelingByLabel reuses an existing feeling on a case-insensitive, trimmed match instead of creating a near-duplicate", () => {
  const feeling = createSupportiveFeeling("סקרנות", NOW);
  const found = findSupportiveFeelingByLabel([feeling], "  סקרנות  ");
  assert.equal(found?.id, feeling.id);
  assert.equal(findSupportiveFeelingByLabel([feeling], "משהו אחר"), null);
});

test("findInternalActionByText is scoped to one feeling -- the same text under a different feeling is a different action, never reused across feelings", () => {
  const action = createInternalAction("feeling-1", "לדמיין הצלחה", NOW);
  assert.equal(findInternalActionByText([action], "feeling-1", "לדמיין הצלחה")?.id, action.id);
  assert.equal(findInternalActionByText([action], "feeling-2", "לדמיין הצלחה"), null, "same text, different feeling, must not match");
});

test("upsertInternalActionInList/deleteInternalActionFromList mirror the same add-or-replace/filter convention", () => {
  const action = createInternalAction("feeling-1", "פעולה", NOW);
  let actions = upsertInternalActionInList([], action);
  assert.equal(actions.length, 1);
  actions = deleteInternalActionFromList(actions, action.id);
  assert.equal(actions.length, 0);
});

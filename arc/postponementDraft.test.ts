import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import { buildPostponedTask, createEmptyPostponementDraft, resolvePostponementReturnAt } from "./postponementDraft.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("createEmptyPostponementDraft defaults to 'unscheduled' -- the spec's own explicit valid ending", () => {
  const draft = createEmptyPostponementDraft();
  assert.equal(draft.returnChoice, "unscheduled");
});

test("resolvePostponementReturnAt returns null for 'unscheduled', regardless of any stray date/time text", () => {
  const draft = { ...createEmptyPostponementDraft(), returnChoice: "unscheduled" as const, returnDate: "2026-01-10", returnTime: "09:00" };
  assert.equal(resolvePostponementReturnAt(draft), null);
});

test("resolvePostponementReturnAt combines a valid date+time into a real ISO timestamp", () => {
  const draft = { ...createEmptyPostponementDraft(), returnChoice: "specificTime" as const, returnDate: "2026-01-10", returnTime: "14:30" };
  const returnAt = resolvePostponementReturnAt(draft);
  assert.ok(returnAt !== null);
  const parsed = new Date(returnAt!);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 10);
  assert.equal(parsed.getHours(), 14);
  assert.equal(parsed.getMinutes(), 30);
});

test("resolvePostponementReturnAt defaults to 09:00 for a valid date with no/invalid time", () => {
  const draft = { ...createEmptyPostponementDraft(), returnChoice: "specificTime" as const, returnDate: "2026-01-10", returnTime: "" };
  const parsed = new Date(resolvePostponementReturnAt(draft)!);
  assert.equal(parsed.getHours(), 9);
  assert.equal(parsed.getMinutes(), 0);
});

test("resolvePostponementReturnAt returns null (never a crash or an invented date) for an invalid date, even with returnChoice 'specificTime'", () => {
  const draft = { ...createEmptyPostponementDraft(), returnChoice: "specificTime" as const, returnDate: "not-a-date", returnTime: "09:00" };
  assert.equal(resolvePostponementReturnAt(draft), null);
});

test("buildPostponedTask sets status postponed, the reason, and the resolved returnAt via the shared postponeTask -- never a local status mutation", () => {
  const task = createEmptyTask("t1", "title", "first action", NOW);
  const draft = { ...createEmptyPostponementDraft(), reason: "עייף", returnChoice: "specificTime" as const, returnDate: "2026-01-06", returnTime: "09:00" };
  const built = buildPostponedTask(task, draft, NOW);
  assert.equal(built.status, "postponed");
  assert.equal(built.postponementReason, "עייף");
  assert.ok(built.returnAt !== null);
});

test("buildPostponedTask narrows currentAction (never firstAction) only when a return action was given", () => {
  const task = createEmptyTask("t1", "title", "original first action", NOW);
  const withReturnAction = buildPostponedTask(task, { ...createEmptyPostponementDraft(), firstActionOnReturn: "פעולה קטנה בחזרה" }, NOW);
  assert.equal(withReturnAction.currentAction, "פעולה קטנה בחזרה");
  assert.equal(withReturnAction.firstAction, "original first action");

  const withoutReturnAction = buildPostponedTask(task, createEmptyPostponementDraft(), NOW);
  assert.equal(withoutReturnAction.currentAction, task.currentAction);
});

test("buildPostponedTask saves the chosen supportive state as the task's new default, read back by Stage K's preparation screen -- only when one was given", () => {
  const task = createEmptyTask("t1", "title", "first action", NOW);
  const withState = buildPostponedTask(task, { ...createEmptyPostponementDraft(), supportiveStateForNextTime: "calm" }, NOW);
  assert.equal(withState.defaultSupportiveStateId, "calm");

  const withoutState = buildPostponedTask(task, createEmptyPostponementDraft(), NOW);
  assert.equal(withoutState.defaultSupportiveStateId, task.defaultSupportiveStateId);
});

test("a postponed task always ends up with either a real returnAt or explicit null (unscheduled) -- never undefined, never silently lost", () => {
  const task = createEmptyTask("t1", "title", "first action", NOW);
  const unscheduled = buildPostponedTask(task, createEmptyPostponementDraft(), NOW);
  assert.equal(unscheduled.returnAt, null);
  assert.equal(unscheduled.status, "postponed");
});

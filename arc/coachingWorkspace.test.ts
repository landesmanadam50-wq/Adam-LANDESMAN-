import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCoachingWorkspaceEntry, generateCoachingWorkspaceEntryId, upsertCoachingWorkspaceEntryInList } from "./coachingWorkspace.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("createEmptyCoachingWorkspaceEntry starts with every field null -- nothing pre-filled from any other record", () => {
  const entry = createEmptyCoachingWorkspaceEntry("c1", NOW);
  assert.equal(entry.goal, null);
  assert.equal(entry.success, null);
  assert.equal(entry.questionForCoach, null);
  assert.equal(entry.createdAt, NOW);
});

test("generateCoachingWorkspaceEntryId produces distinct, correctly-prefixed ids", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateCoachingWorkspaceEntryId()));
  assert.equal(ids.size, 20);
  for (const id of ids) assert.match(id, /^coaching-/);
});

test("upsertCoachingWorkspaceEntryInList appends a new entry and replaces an existing one by id -- one record per session, history preserved", () => {
  const first = createEmptyCoachingWorkspaceEntry("c1", NOW);
  const second = createEmptyCoachingWorkspaceEntry("c2", NOW);
  const withBoth = upsertCoachingWorkspaceEntryInList(upsertCoachingWorkspaceEntryInList([], first), second);
  assert.equal(withBoth.length, 2);

  const updatedFirst = { ...first, goal: "לכתוב כל יום" };
  const withUpdate = upsertCoachingWorkspaceEntryInList(withBoth, updatedFirst);
  assert.equal(withUpdate.length, 2);
  assert.equal(withUpdate.find((entry) => entry.id === "c1")?.goal, "לכתוב כל יום");
});

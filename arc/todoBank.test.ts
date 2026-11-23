import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveTodoBankItem,
  createTodoBankItem,
  generateTodoBankItemId,
  listActiveTodoBankItems,
  normalizeTodoBankItem,
  renameTodoBankItem,
  upsertTodoBankItemInList,
} from "./todoBank.ts";
import { createEmptyTask, normalizeTask } from "./tasks.ts";

const NOW = "2026-01-01T10:00:00.000Z";
const LATER = "2026-01-02T10:00:00.000Z";

test("createTodoBankItem starts active, with a trimmed title and no urgency/importance/duration field at all", () => {
  const item = createTodoBankItem("b1", "  לקנות מתנה  ", NOW);
  assert.equal(item.title, "לקנות מתנה");
  assert.equal(item.archived, false);
  assert.equal(item.createdAt, NOW);
  assert.equal(item.updatedAt, NOW);
  assert.ok(!("todoUrgency" in item));
  assert.ok(!("todoImportance" in item));
  assert.ok(!("expectedDurationMinutes" in item));
});

test("generateTodoBankItemId produces distinct ids", () => {
  const a = generateTodoBankItemId();
  const b = generateTodoBankItemId();
  assert.notEqual(a, b);
});

test("renameTodoBankItem trims the new title and bumps updatedAt, never touching createdAt/archived", () => {
  const item = createTodoBankItem("b1", "ישן", NOW);
  const renamed = renameTodoBankItem(item, "  חדש  ", LATER);
  assert.equal(renamed.title, "חדש");
  assert.equal(renamed.updatedAt, LATER);
  assert.equal(renamed.createdAt, NOW);
  assert.equal(renamed.archived, false);
});

test("archiveTodoBankItem sets archived=true and bumps updatedAt -- never a hard delete of the record itself", () => {
  const item = createTodoBankItem("b1", "לסדר", NOW);
  const archived = archiveTodoBankItem(item, LATER);
  assert.equal(archived.archived, true);
  assert.equal(archived.updatedAt, LATER);
  assert.equal(archived.id, "b1");
});

test("listActiveTodoBankItems excludes archived items and sorts by createdAt ascending", () => {
  const first = createTodoBankItem("b1", "ראשון", "2026-01-01T00:00:00.000Z");
  const second = createTodoBankItem("b2", "שני", "2026-01-02T00:00:00.000Z");
  const archivedThird = archiveTodoBankItem(createTodoBankItem("b3", "שלישי, הוסר", "2026-01-03T00:00:00.000Z"), LATER);
  const active = listActiveTodoBankItems([second, archivedThird, first]);
  assert.deepEqual(active.map((item) => item.id), ["b1", "b2"]);
});

test("upsertTodoBankItemInList appends a new item and replaces an existing one by id, never duplicating", () => {
  const first = createTodoBankItem("b1", "ראשון", NOW);
  const list = upsertTodoBankItemInList([], first);
  assert.equal(list.length, 1);
  const renamed = renameTodoBankItem(first, "ראשון מעודכן", LATER);
  const updatedList = upsertTodoBankItemInList(list, renamed);
  assert.equal(updatedList.length, 1);
  assert.equal(updatedList[0].title, "ראשון מעודכן");
});

test("normalizeTodoBankItem backfills a legacy/malformed record defensively", () => {
  const normalized = normalizeTodoBankItem({ id: "b1", title: "כותרת", createdAt: NOW, updatedAt: NOW } as any);
  assert.equal(normalized.archived, false);
});

test("required: placing a bank item onto a flexible day creates an ORDINARY per-day To-Do Task with its own fresh todoUrgency/todoImportance and a pure todoBankItemId back-reference -- never urgency/importance/duration on the bank item itself", () => {
  const bankItem = createTodoBankItem("b1", "לקנות מתנה", NOW);
  const placedToday = normalizeTask({ ...createEmptyTask("t1", bankItem.title, bankItem.title, NOW), isTodoItem: true, scheduledDate: "2026-01-05", todoBankItemId: bankItem.id });
  const placedTomorrow = normalizeTask({ ...createEmptyTask("t2", bankItem.title, bankItem.title, NOW), isTodoItem: true, scheduledDate: "2026-01-06", todoBankItemId: bankItem.id });
  assert.equal(placedToday.todoUrgency, 5);
  assert.equal(placedTomorrow.todoUrgency, 5);
  const ratedToday = { ...placedToday, todoUrgency: 9, todoImportance: 2 };
  // Rating one day's occurrence never touches the other's -- independent records, same bank item.
  assert.equal(placedTomorrow.todoUrgency, 5);
  assert.equal(ratedToday.todoBankItemId, placedTomorrow.todoBankItemId, "both occurrences still trace back to the SAME bank item");
});

test("required: a one-off to-do typed directly (never placed from the bank) keeps todoBankItemId null, by default", () => {
  const direct = normalizeTask({ ...createEmptyTask("t1", "מטלה חד פעמית", "", NOW), isTodoItem: true, scheduledDate: "2026-01-05" });
  assert.equal(direct.todoBankItemId, null);
});

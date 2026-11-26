import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveTodoBankItem,
  createTodoBankItem,
  generateTodoBankItemId,
  listActiveTodoBankItems,
  normalizeTodoBankItem,
  renameTodoBankItem,
  updateTodoBankItemLinkedAction,
  updateTodoBankItemLinkedMemoryExercises,
  upsertTodoBankItemInList,
} from "./todoBank.ts";
import { createEmptyTask, normalizeTask } from "./tasks.ts";
import { createTaskLinkedAction, NO_LINKED_ACTION } from "./taskLinkedAction.ts";

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

test("Build/To-Do Action-Type Integration task, requirement 3: createTodoBankItem defaults linkedAction to null and linkedArcGymMemoryExerciseIds to an empty array -- unlike urgency/importance/duration, these fields DO belong on the reusable bank item itself", () => {
  const item = createTodoBankItem("b1", "לקנות מתנה", NOW);
  assert.equal(item.linkedAction, null);
  assert.deepEqual(item.linkedArcGymMemoryExerciseIds, []);
});

test("updateTodoBankItemLinkedAction sets (or clears, via null) the bank item's own linked action and bumps updatedAt, never touching title/archived/createdAt", () => {
  const item = createTodoBankItem("b1", "כתיבה", NOW);
  const withAction = updateTodoBankItemLinkedAction(item, createTaskLinkedAction("arc_writing", "text-1"), LATER);
  assert.deepEqual(withAction.linkedAction, { kind: "arc_writing", itemId: "text-1" });
  assert.equal(withAction.updatedAt, LATER);
  assert.equal(withAction.title, "כתיבה");
  assert.equal(withAction.createdAt, NOW);
  const cleared = updateTodoBankItemLinkedAction(withAction, null, NOW);
  assert.equal(cleared.linkedAction, null);
});

test("updateTodoBankItemLinkedMemoryExercises replaces the bank item's own linked ARC Memory exercise ids and bumps updatedAt", () => {
  const item = createTodoBankItem("b1", "סופר", NOW);
  const linked = updateTodoBankItemLinkedMemoryExercises(item, ["mem-1", "mem-2"], LATER);
  assert.deepEqual(linked.linkedArcGymMemoryExerciseIds, ["mem-1", "mem-2"]);
  assert.equal(linked.updatedAt, LATER);
  const unlinked = updateTodoBankItemLinkedMemoryExercises(linked, [], NOW);
  assert.deepEqual(unlinked.linkedArcGymMemoryExerciseIds, []);
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

test("normalizeTodoBankItem backfills a legacy/malformed record defensively, including the new linkedAction/linkedArcGymMemoryExerciseIds fields a pre-existing bank item never had", () => {
  const normalized = normalizeTodoBankItem({ id: "b1", title: "כותרת", createdAt: NOW, updatedAt: NOW } as any);
  assert.equal(normalized.archived, false);
  assert.equal(normalized.linkedAction, null);
  assert.deepEqual(normalized.linkedArcGymMemoryExerciseIds, []);
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

test("required (Build/To-Do Action-Type Integration task, requirement 4): a bank item's own linkedAction/linkedArcGymMemoryExerciseIds, once set, are the exact values that must be carried onto the fresh day-occurrence Task when placed -- a Task built from them (mirroring build/TimePlanningModal.tsx's own handleAddFromBank) ends up with the SAME linkedAction/linkedArcGymMemoryExerciseIds, never the defaults", () => {
  const bankItem = updateTodoBankItemLinkedMemoryExercises(
    updateTodoBankItemLinkedAction(createTodoBankItem("b1", "כתיבה יומית", NOW), createTaskLinkedAction("arc_writing", "text-1"), NOW),
    ["mem-1"],
    NOW
  );
  const placed = normalizeTask({
    ...createEmptyTask("t1", bankItem.title, bankItem.title, NOW),
    isTodoItem: true,
    scheduledDate: "2026-01-05",
    todoBankItemId: bankItem.id,
    linkedAction: bankItem.linkedAction,
    linkedArcGymMemoryExerciseIds: bankItem.linkedArcGymMemoryExerciseIds,
  });
  assert.deepEqual(placed.linkedAction, { kind: "arc_writing", itemId: "text-1" });
  assert.deepEqual(placed.linkedArcGymMemoryExerciseIds, ["mem-1"]);
  assert.notEqual(placed.linkedAction, NO_LINKED_ACTION, "a real configured kind, never the bare none sentinel");
});

test("required (Build/To-Do Action-Type Integration task): a bank item with NO linkedAction configured (the default) places a plain To-Do Task with linkedAction null, exactly like typing one directly -- never a surprise non-none kind", () => {
  const bankItem = createTodoBankItem("b1", "לקנות מתנה", NOW);
  const placed = normalizeTask({
    ...createEmptyTask("t1", bankItem.title, bankItem.title, NOW),
    isTodoItem: true,
    scheduledDate: "2026-01-05",
    todoBankItemId: bankItem.id,
    linkedAction: bankItem.linkedAction,
    linkedArcGymMemoryExerciseIds: bankItem.linkedArcGymMemoryExerciseIds,
  });
  assert.equal(placed.linkedAction, null);
  assert.deepEqual(placed.linkedArcGymMemoryExerciseIds, []);
});

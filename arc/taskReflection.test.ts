import test from "node:test";
import assert from "node:assert/strict";

import {
  createTaskReflection,
  normalizeTaskReflection,
  reflectionsForTask,
  removeReflectionFromList,
  resolveLatestReflectionForTask,
  resolveTaskAlarmNotificationContent,
  sortReflectionsNewestFirst,
  upsertReflectionInList,
  type TaskReflection,
} from "./taskReflection.ts";

// --- Saving / per-task history (requirement 1) ---

test("createTaskReflection associates the reflection with the exact given Task id and timestamps it", () => {
  const reflection = createTaskReflection("r1", "task-A", "כשאני מתחיל בחמש דקות, קל לי להמשיך.", "2026-11-10T08:00:00.000Z");
  assert.equal(reflection.taskId, "task-A");
  assert.equal(reflection.text, "כשאני מתחיל בחמש דקות, קל לי להמשיך.");
  assert.equal(reflection.createdAt, "2026-11-10T08:00:00.000Z");
  assert.equal(reflection.updatedAt, "2026-11-10T08:00:00.000Z");
});

test("reflectionsForTask never mixes reflections between different tasks -- each task's own history is independent", () => {
  const all: TaskReflection[] = [
    createTaskReflection("r1", "task-A", "א", "2026-11-10T08:00:00.000Z"),
    createTaskReflection("r2", "task-B", "ב", "2026-11-10T09:00:00.000Z"),
    createTaskReflection("r3", "task-A", "ג", "2026-11-10T10:00:00.000Z"),
  ];
  assert.deepEqual(reflectionsForTask(all, "task-A").map((r) => r.id), ["r1", "r3"]);
  assert.deepEqual(reflectionsForTask(all, "task-B").map((r) => r.id), ["r2"]);
});

// --- Retrieving the newest reflection / replacing the displayed one (requirements 2-3) ---

test("resolveLatestReflectionForTask returns the most recently created reflection for that task, and null when none exist -- 'handling tasks without reflections'", () => {
  const all: TaskReflection[] = [
    createTaskReflection("r1", "task-A", "כשאני מתחיל בחמש דקות, קל לי להמשיך.", "2026-11-09T08:00:00.000Z"),
    createTaskReflection("r2", "task-A", "כשאני מסביר בקול, אני מבין טוב יותר.", "2026-11-10T08:00:00.000Z"),
  ];
  assert.equal(resolveLatestReflectionForTask(all, "task-A")?.text, "כשאני מסביר בקול, אני מבין טוב יותר.");
  assert.equal(resolveLatestReflectionForTask(all, "task-nonexistent"), null);
  assert.equal(resolveLatestReflectionForTask([], "task-A"), null);
});

test("saving a NEW, later reflection for the same task immediately becomes the latest -- the example scenario: first reflection then a second one replaces it as 'latest'", () => {
  let all: TaskReflection[] = [createTaskReflection("r1", "task-A", "כשאני מתחיל בחמש דקות, קל לי להמשיך.", "2026-11-09T08:00:00.000Z")];
  assert.equal(resolveLatestReflectionForTask(all, "task-A")?.text, "כשאני מתחיל בחמש דקות, קל לי להמשיך.");

  all = [...all, createTaskReflection("r2", "task-A", "כשאני מסביר בקול, אני מבין טוב יותר.", "2026-11-11T08:00:00.000Z")];
  assert.equal(resolveLatestReflectionForTask(all, "task-A")?.text, "כשאני מסביר בקול, אני מבין טוב יותר.");
});

// --- Preserving older reflections / ordering (requirement 5) ---

test("sortReflectionsNewestFirst orders strictly by createdAt, newest first, never touched by a later EDIT to an older reflection's text", () => {
  const all: TaskReflection[] = [
    createTaskReflection("r1", "task-A", "ישן", "2026-11-09T08:00:00.000Z"),
    createTaskReflection("r2", "task-A", "חדש יותר", "2026-11-10T08:00:00.000Z"),
    createTaskReflection("r3", "task-A", "החדש ביותר", "2026-11-11T08:00:00.000Z"),
  ];
  assert.deepEqual(sortReflectionsNewestFirst(all).map((r) => r.id), ["r3", "r2", "r1"]);

  const edited = upsertReflectionInList(all, { ...all[0], text: "ישן, מתוקן", updatedAt: "2026-11-12T08:00:00.000Z" });
  assert.deepEqual(sortReflectionsNewestFirst(edited).map((r) => r.id), ["r3", "r2", "r1"], "editing an older reflection's text must never make it jump ahead in order");
  assert.equal(edited.find((r) => r.id === "r1")?.text, "ישן, מתוקן");
  assert.equal(edited.length, 3, "editing never removes an older reflection -- history is preserved");
});

// --- Recurring tasks sharing the same reflection history (requirement 4) ---

test("a recurring task's reflections are all keyed by the SAME shared Task id -- Monday's reflection is still 'latest' on Wednesday until a newer one from Wednesday evening replaces it, exactly the spec's own worked example", () => {
  const recurringTaskId = "task-study-psychology";
  let all: TaskReflection[] = [createTaskReflection("mon", recurringTaskId, "מונדיי: למידה בבוקר עוזרת לי.", "2026-11-09T08:00:00.000Z")];
  // Wednesday's notification (before that evening's completion) still shows Monday's reflection.
  assert.equal(resolveLatestReflectionForTask(all, recurringTaskId)?.text, "מונדיי: למידה בבוקר עוזרת לי.");

  // Wednesday evening: a new reflection is written for the SAME task id.
  all = [...all, createTaskReflection("wed", recurringTaskId, "רביעי בערב: הקלטת עצמי עוזרת.", "2026-11-11T19:00:00.000Z")];
  assert.equal(resolveLatestReflectionForTask(all, recurringTaskId)?.text, "רביעי בערב: הקלטת עצמי עוזרת.", "Friday's notification should now show Wednesday's reflection");
  assert.equal(reflectionsForTask(all, recurringTaskId).length, 2, "never a separate reflection history per occurrence -- both rows share the one task id");
});

// --- Editing / deleting reflections (requirement 5) ---

test("upsertReflectionInList replaces an existing reflection by id (a correction), and appends when the id is new", () => {
  const all: TaskReflection[] = [createTaskReflection("r1", "task-A", "מקורי", "2026-11-10T08:00:00.000Z")];
  const corrected = upsertReflectionInList(all, { ...all[0], text: "מתוקן" });
  assert.equal(corrected.length, 1);
  assert.equal(corrected[0].text, "מתוקן");

  const appended = upsertReflectionInList(all, createTaskReflection("r2", "task-A", "נוסף", "2026-11-11T08:00:00.000Z"));
  assert.equal(appended.length, 2);
});

test("removeReflectionFromList deletes exactly the one reflection by id, leaving every other one (including other tasks') untouched", () => {
  const all: TaskReflection[] = [
    createTaskReflection("r1", "task-A", "א", "2026-11-10T08:00:00.000Z"),
    createTaskReflection("r2", "task-B", "ב", "2026-11-10T09:00:00.000Z"),
  ];
  const remaining = removeReflectionFromList(all, "r1");
  assert.deepEqual(remaining.map((r) => r.id), ["r2"]);
});

test("deleting the CURRENT latest reflection makes the next-most-recent one for that task become latest, and deleting the only one leaves null ('no saved reflection')", () => {
  const all: TaskReflection[] = [
    createTaskReflection("r1", "task-A", "ישן", "2026-11-09T08:00:00.000Z"),
    createTaskReflection("r2", "task-A", "חדש", "2026-11-10T08:00:00.000Z"),
  ];
  const afterDeletingLatest = removeReflectionFromList(all, "r2");
  assert.equal(resolveLatestReflectionForTask(afterDeletingLatest, "task-A")?.text, "ישן");

  const afterDeletingAll = removeReflectionFromList(afterDeletingLatest, "r1");
  assert.equal(resolveLatestReflectionForTask(afterDeletingAll, "task-A"), null);
});

// --- Backward compatibility (requirement 8 / "data persistence after restarting") ---

test("normalizeTaskReflection backfills a missing updatedAt (a record saved before that field existed) to its own createdAt, without crashing", () => {
  const legacy = { id: "r1", taskId: "task-A", text: "טקסט", createdAt: "2026-11-10T08:00:00.000Z" } as unknown as TaskReflection;
  const normalized = normalizeTaskReflection(legacy);
  assert.equal(normalized.updatedAt, "2026-11-10T08:00:00.000Z");
});

// --- Notification content + lock-screen privacy (requirements 2, 7) ---

test("resolveTaskAlarmNotificationContent shows the task's own name as the title and the latest reflection as the body when one exists and the privacy preference is on", () => {
  const content = resolveTaskAlarmNotificationContent("למידת פסיכולוגיה", "כשאני מסביר בקול את מה שלמדתי, אני מבין אותו טוב יותר.", true);
  assert.deepEqual(content, { title: "למידת פסיכולוגיה", body: "כשאני מסביר בקול את מה שלמדתי, אני מבין אותו טוב יותר." });
});

test("resolveTaskAlarmNotificationContent preserves the existing default notification text when the task has no saved reflection -- 'handling tasks without reflections'", () => {
  const content = resolveTaskAlarmNotificationContent("למידת פסיכולוגיה", null, true);
  assert.deepEqual(content, { title: "הגיע הזמן למשימה", body: "למידת פסיכולוגיה" });
});

test("resolveTaskAlarmNotificationContent withholds a saved reflection entirely when the lock-screen privacy preference is off -- falls back to the exact same default text as having no reflection at all", () => {
  const content = resolveTaskAlarmNotificationContent("למידת פסיכולוגיה", "משהו אישי שלמדתי", false);
  assert.deepEqual(content, { title: "הגיע הזמן למשימה", body: "למידת פסיכולוגיה" });
});

test("resolveTaskAlarmNotificationContent treats a blank/whitespace-only reflection the same as having none", () => {
  const content = resolveTaskAlarmNotificationContent("למידת פסיכולוגיה", "   ", true);
  assert.deepEqual(content, { title: "הגיע הזמן למשימה", body: "למידת פסיכולוגיה" });
});

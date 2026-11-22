import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  addSubtaskToDraft,
  buildTaskFromDraft,
  createEmptyTaskDraft,
  emptyTaskBase,
  removeSubtaskFromDraft,
  selectAllRecurrenceDaysInDraft,
  taskDraftFromTask,
  toggleRecurrenceDayInDraft,
  validateTaskDraft,
} from "./taskDraft.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("createEmptyTaskDraft starts fully blank, once-only recurrence", () => {
  const draft = createEmptyTaskDraft();
  assert.equal(draft.title, "");
  assert.equal(draft.recurrenceKind, "once");
  assert.deepEqual(draft.recurrenceDays, []);
  assert.deepEqual(draft.subtasks, []);
});

test("taskDraftFromTask round-trips every field, including a numeric duration as text", () => {
  const task = { ...createEmptyTask("t1", "כותרת", "פעולה", NOW), expectedDurationMinutes: 25, scheduledDate: "2026-01-06", scheduledTime: "09:30" };
  const draft = taskDraftFromTask(task);
  assert.equal(draft.title, "כותרת");
  assert.equal(draft.expectedDurationMinutes, "25");
  assert.equal(draft.scheduledDate, "2026-01-06");
  assert.equal(draft.scheduledTime, "09:30");
});

test("location round-trips through taskDraftFromTask/buildTaskFromDraft, for the Daily Visualization exercise's own per-task visualization", () => {
  const task = { ...createEmptyTask("t1", "כותרת", "פעולה", NOW), location: "המשרד" };
  const draft = taskDraftFromTask(task);
  assert.equal(draft.location, "המשרד");
  const built = buildTaskFromDraft({ ...draft, location: "  הבית  " }, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.location, "הבית");
});

test("validateTaskDraft requires a title, and otherwise passes an empty, fully blank draft", () => {
  assert.deepEqual(validateTaskDraft(createEmptyTaskDraft()), ["כותרת היא שדה חובה."]);
  assert.deepEqual(validateTaskDraft({ ...createEmptyTaskDraft(), title: "כותרת" }), []);
});

test("validateTaskDraft rejects a negative duration but accepts zero and a blank field", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת" };
  assert.deepEqual(validateTaskDraft({ ...base, expectedDurationMinutes: "-5" }), ["משך הזמן המתוכנן לא יכול להיות שלילי."]);
  assert.deepEqual(validateTaskDraft({ ...base, expectedDurationMinutes: "0" }), []);
  assert.deepEqual(validateTaskDraft({ ...base, expectedDurationMinutes: "" }), []);
});

test("validateTaskDraft rejects a malformed scheduledDate/scheduledTime but accepts blank", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת" };
  assert.deepEqual(validateTaskDraft({ ...base, scheduledDate: "not-a-date" }), ["תאריך מתוכנן לא תקין (פורמט: YYYY-MM-DD)."]);
  assert.deepEqual(validateTaskDraft({ ...base, scheduledDate: "2026-01-06" }), []);
  assert.deepEqual(validateTaskDraft({ ...base, scheduledTime: "25:99" }), ["שעה מתוכננת לא תקינה (פורמט: HH:MM)."]);
  assert.deepEqual(validateTaskDraft({ ...base, scheduledTime: "09:30" }), []);
});

test("validateTaskDraft requires at least one recurrence day when recurring", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת", recurrenceKind: "recurring" as const };
  assert.deepEqual(validateTaskDraft(base), ["משימה חזרתית חייבת לפחות יום אחד בשבוע."]);
  assert.deepEqual(validateTaskDraft({ ...base, recurrenceDays: [1, 3] }), []);
});

test("addSubtaskToDraft trims and ignores a blank title; removeSubtaskFromDraft removes exactly one by id", () => {
  let draft = createEmptyTaskDraft();
  draft = addSubtaskToDraft(draft, "  draft outline  ");
  draft = addSubtaskToDraft(draft, "   ");
  assert.equal(draft.subtasks.length, 1);
  assert.equal(draft.subtasks[0].title, "draft outline");
  assert.equal(draft.subtasks[0].completed, false);

  draft = addSubtaskToDraft(draft, "second");
  const idToRemove = draft.subtasks[0].id;
  draft = removeSubtaskFromDraft(draft, idToRemove);
  assert.equal(draft.subtasks.length, 1);
  assert.equal(draft.subtasks[0].title, "second");
});

test("toggleRecurrenceDayInDraft adds then removes a day, keeping the list sorted", () => {
  let draft = createEmptyTaskDraft();
  draft = toggleRecurrenceDayInDraft(draft, 3);
  draft = toggleRecurrenceDayInDraft(draft, 1);
  assert.deepEqual(draft.recurrenceDays, [1, 3]);
  draft = toggleRecurrenceDayInDraft(draft, 1);
  assert.deepEqual(draft.recurrenceDays, [3]);
});

// Multi-Day Task Scheduling task: "Select all days" is a one-tap
// shortcut onto the SAME recurrenceDays field -- never a separate
// "every day" flag.
test("selectAllRecurrenceDaysInDraft sets all seven weekdays (Sunday..Saturday), regardless of the draft's previous selection", () => {
  let draft = createEmptyTaskDraft();
  draft = toggleRecurrenceDayInDraft(draft, 2);
  draft = selectAllRecurrenceDaysInDraft(draft);
  assert.deepEqual(draft.recurrenceDays, [0, 1, 2, 3, 4, 5, 6]);

  const fromEmpty = selectAllRecurrenceDaysInDraft(createEmptyTaskDraft());
  assert.deepEqual(fromEmpty.recurrenceDays, [0, 1, 2, 3, 4, 5, 6]);
});

test("selectAllRecurrenceDaysInDraft leaves every other field untouched", () => {
  const draft = { ...createEmptyTaskDraft(), title: "משימה יומית", recurrenceKind: "recurring" as const, scheduledTime: "07:30", expectedDurationMinutes: "20" };
  const next = selectAllRecurrenceDaysInDraft(draft);
  assert.equal(next.title, "משימה יומית");
  assert.equal(next.recurrenceKind, "recurring");
  assert.equal(next.scheduledTime, "07:30");
  assert.equal(next.expectedDurationMinutes, "20");
});

// A "select all" recurring task saves/round-trips through buildTaskFromDraft
// + taskDraftFromTask exactly like any other recurring selection -- never a
// duplicated task per weekday, and the full set survives reopening the editor.
test("a task built from an all-days draft round-trips through taskDraftFromTask with all seven days, as ONE task record", () => {
  const draft = selectAllRecurrenceDaysInDraft({ ...createEmptyTaskDraft(), title: "משימה", firstAction: "פעולה", recurrenceKind: "recurring" as const });
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.deepEqual(built.recurrence, { kind: "recurring", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
  const reopened = taskDraftFromTask(built);
  assert.deepEqual(reopened.recurrenceDays, [0, 1, 2, 3, 4, 5, 6]);
});

test("buildTaskFromDraft on a brand-new base sets every field and defaults currentAction to the trimmed firstAction", () => {
  const draft = { ...createEmptyTaskDraft(), title: "  כותרת  ", firstAction: "  פעולה  ", value: "ערך", identity: "זהות" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.title, "כותרת");
  assert.equal(built.firstAction, "פעולה");
  assert.equal(built.currentAction, "פעולה");
  assert.equal(built.value, "ערך");
  assert.equal(built.identity, "זהות");
  assert.equal(built.status, "planned");
});

test("buildTaskFromDraft on an EXISTING task preserves status/postponement/notification/completion fields the draft never touches", () => {
  const existing = { ...createEmptyTask("t1", "old", "old action", NOW), status: "active" as const, notificationId: "notif-1", completedAt: null };
  const draft = { ...taskDraftFromTask(existing), title: "new title" };
  const built = buildTaskFromDraft(draft, existing, "2026-01-06T00:00:00.000Z");
  assert.equal(built.title, "new title");
  assert.equal(built.status, "active", "editing must never silently reset status");
  assert.equal(built.notificationId, "notif-1");
  assert.equal(built.updatedAt, "2026-01-06T00:00:00.000Z");
});

test("buildTaskFromDraft clears a recurrence back to 'once' and maps recurring days correctly", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", recurrenceKind: "recurring" as const, recurrenceDays: [0, 6] };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.deepEqual(built.recurrence, { kind: "recurring", daysOfWeek: [0, 6] });

  const onceDraft = { ...draft, recurrenceKind: "once" as const };
  const builtOnce = buildTaskFromDraft(onceDraft, emptyTaskBase("t1", NOW), NOW);
  assert.deepEqual(builtOnce.recurrence, { kind: "once" });
});

test("buildTaskFromDraft null-clears every optional free-text/link field left blank", () => {
  const draft = createEmptyTaskDraft();
  const built = buildTaskFromDraft({ ...draft, title: "כותרת" }, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.description, null);
  assert.equal(built.location, null, "Final Morning Flow Requirements Audit task: optional, null-cleared when left blank just like description");
  assert.equal(built.scheduledDate, null);
  assert.equal(built.scheduledTime, null);
  assert.equal(built.expectedDurationMinutes, null);
  assert.equal(built.value, null);
  assert.equal(built.identity, null);
  assert.equal(built.defaultSupportiveStateId, null);
  assert.equal(built.linkedArcGoalId, null);
  assert.equal(built.linkedArcBuildId, null);
  assert.equal(built.arcWindowMinutesBefore, null);
});

// Critical-bug fix ("שעון מעורר אוטומטי לכל משימה"): a one-time task
// with a start TIME but no explicitly-typed date used to save with
// scheduledDate: null, making it invisible to arc/taskScheduledStart.ts's
// own alarm-scheduling date math (and to Today's own bucketing) --
// defaulting to today here, at the exact point a draft becomes a Task,
// closes that gap for every NEW task without requiring the trainee to
// separately remember to type a date.
test("buildTaskFromDraft defaults scheduledDate to TODAY when scheduledTime is set but scheduledDate was left blank, for a one-time task", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", scheduledTime: "09:15" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.scheduledDate, "2026-01-05", "NOW's own local date, 2026-01-05T12:00:00.000Z");
  assert.equal(built.scheduledTime, "09:15");
});

test("buildTaskFromDraft leaves scheduledDate null when scheduledTime is ALSO blank -- a genuinely unscheduled task is never given a date it never asked for", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.scheduledDate, null);
  assert.equal(built.scheduledTime, null);
});

test("buildTaskFromDraft never defaults scheduledDate for a RECURRING task even with scheduledTime set -- recurring tasks use daysOfWeek, not scheduledDate, so a spurious value here would be meaningless", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", recurrenceKind: "recurring" as const, recurrenceDays: [1], scheduledTime: "09:15" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.scheduledDate, null);
});

test("buildTaskFromDraft never overrides an explicitly-typed scheduledDate, whatever it is", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", scheduledDate: "2026-02-01", scheduledTime: "09:15" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.scheduledDate, "2026-02-01");
});

// ARC-system upgrade task, Part 2: arcWindowMinutesBefore round-trips
// through the draft exactly like expectedDurationMinutes does -- text
// in the draft, a plain number (or null) on the built Task.

test("taskDraftFromTask round-trips a set arcWindowMinutesBefore as text, and buildTaskFromDraft parses it back to a number", () => {
  const task = { ...createEmptyTask("t1", "כותרת", "פעולה", NOW), arcWindowMinutesBefore: 5 };
  const draft = taskDraftFromTask(task);
  assert.equal(draft.arcWindowMinutesBefore, "5");
  const rebuilt = buildTaskFromDraft(draft, task, NOW);
  assert.equal(rebuilt.arcWindowMinutesBefore, 5);
});

test("a blank arcWindowMinutesBefore builds to null -- no window unless explicitly set", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", arcWindowMinutesBefore: "" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.arcWindowMinutesBefore, null);
});

test("validateTaskDraft rejects a zero or negative arcWindowMinutesBefore, but accepts a blank one", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת" };
  assert.deepEqual(validateTaskDraft({ ...base, arcWindowMinutesBefore: "" }), []);
  assert.ok(validateTaskDraft({ ...base, arcWindowMinutesBefore: "0" }).length > 0);
  assert.ok(validateTaskDraft({ ...base, arcWindowMinutesBefore: "-5" }).length > 0);
  assert.deepEqual(validateTaskDraft({ ...base, arcWindowMinutesBefore: "10" }), []);
});

// --- Unified Task Stages task: compatibility with existing (no-stages) tasks ---

test("taskDraftFromTask for a pre-existing task with no actionStages at all produces stagesEnabled: false and every stage field blank -- full backward compatibility", () => {
  const task = createEmptyTask("t1", "כותרת", "פעולה", NOW);
  const draft = taskDraftFromTask(task);
  assert.equal(draft.stagesEnabled, false);
  assert.equal(draft.triggerEnabled, false);
  assert.equal(draft.smallEnabled, false);
  assert.equal(draft.mainDescription, "");
});

test("buildTaskFromDraft for stagesEnabled: false sets actionStages to null and keeps expectedDurationMinutes from the plain duration field -- EXACTLY today's existing behavior", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", stagesEnabled: false, expectedDurationMinutes: "40" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.actionStages, null);
  assert.equal(built.expectedDurationMinutes, 40);
});

// --- Stages enabled: validation ---

test("validateTaskDraft requires a main description and a positive main duration once stagesEnabled, even with no trigger/small configured", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת", stagesEnabled: true };
  assert.ok(validateTaskDraft({ ...base, mainDescription: "", mainDurationMinutes: "25" }).length > 0, "missing main description");
  assert.ok(validateTaskDraft({ ...base, mainDescription: "קורא", mainDurationMinutes: "" }).length > 0, "missing main duration");
  assert.ok(validateTaskDraft({ ...base, mainDescription: "קורא", mainDurationMinutes: "0" }).length > 0, "zero main duration");
  assert.deepEqual(validateTaskDraft({ ...base, mainDescription: "קורא", mainDurationMinutes: "25" }), []);
});

test("validateTaskDraft only requires trigger/small fields when each is actually enabled", () => {
  const base = { ...createEmptyTaskDraft(), title: "כותרת", stagesEnabled: true, mainDescription: "קורא", mainDurationMinutes: "25" };
  assert.deepEqual(validateTaskDraft({ ...base, triggerEnabled: false, smallEnabled: false }), [], "neither optional stage configured -- only main required");
  assert.ok(validateTaskDraft({ ...base, triggerEnabled: true, triggerDescription: "", triggerDurationMinutes: "2" }).length > 0);
  assert.ok(validateTaskDraft({ ...base, smallEnabled: true, smallDescription: "פסקה", smallDurationMinutes: "0" }).length > 0);
  assert.deepEqual(
    validateTaskDraft({ ...base, triggerEnabled: true, triggerDescription: "לוקח ספר", triggerDurationMinutes: "2", smallEnabled: true, smallDescription: "פסקה", smallDurationMinutes: "3" }),
    []
  );
});

// --- Stages enabled: build + total-duration sync (requirement 3's own worked example) ---

test("buildTaskFromDraft builds all three configured stages in order, and sets expectedDurationMinutes to their SUM (2 + 3 + 25 = 30) -- never the plain duration field", () => {
  const draft = {
    ...createEmptyTaskDraft(),
    title: "קריאת ספר",
    stagesEnabled: true,
    expectedDurationMinutes: "999", // must be ignored entirely once stages are enabled
    triggerEnabled: true,
    triggerDescription: "לוקח את הספר ומניח אותו על השולחן",
    triggerCueDescription: "הספר מונח על השולחן",
    triggerDurationMinutes: "2",
    smallEnabled: true,
    smallDescription: "פותח את הספר וקורא פסקה אחת",
    smallDurationMinutes: "3",
    mainDescription: "ממשיך לקרוא את הספר",
    mainDurationMinutes: "25",
  };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(built.expectedDurationMinutes, 30);
  assert.equal(built.actionStages?.length, 3);
  assert.deepEqual(built.actionStages?.map((stage) => stage.kind), ["trigger", "small", "main"]);
  assert.equal(built.actionStages?.[0].cueDescription, "הספר מונח על השולחן");
});

test("buildTaskFromDraft omits the trigger/small stage entirely when not enabled, keeping only main", () => {
  const draft = { ...createEmptyTaskDraft(), title: "כותרת", stagesEnabled: true, mainDescription: "קורא", mainDurationMinutes: "25" };
  const built = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.deepEqual(built.actionStages?.map((stage) => stage.kind), ["main"]);
  assert.equal(built.expectedDurationMinutes, 25);
});

test("buildTaskFromDraft reuses an EXISTING stage's own saved id (never regenerates it on every edit) -- a stage id referenced elsewhere (e.g. TaskStageProgress) stays valid across edits", () => {
  const existingTask = buildTaskFromDraft(
    { ...createEmptyTaskDraft(), title: "כותרת", stagesEnabled: true, mainDescription: "קורא", mainDurationMinutes: "25" },
    emptyTaskBase("t1", NOW),
    NOW
  );
  const existingMainId = existingTask.actionStages?.[0].id;
  assert.ok(existingMainId);
  // Re-editing: taskDraftFromTask round-trips the same id, and a second build with a changed description must keep it.
  const draft = { ...taskDraftFromTask(existingTask), mainDescription: "קורא ספר אחר" };
  const reEdited = buildTaskFromDraft(draft, existingTask, NOW);
  assert.equal(reEdited.actionStages?.[0].id, existingMainId);
  assert.equal(reEdited.actionStages?.[0].description, "קורא ספר אחר");
});

test("taskDraftFromTask round-trips a fully-staged task's every field, including the trigger's own cueDescription", () => {
  const draft0 = {
    ...createEmptyTaskDraft(),
    title: "קריאת ספר",
    stagesEnabled: true,
    triggerEnabled: true,
    triggerDescription: "לוקח את הספר",
    triggerCueDescription: "הספר על השולחן",
    triggerDurationMinutes: "2",
    smallEnabled: true,
    smallDescription: "פסקה אחת",
    smallDurationMinutes: "3",
    mainDescription: "ממשיך לקרוא",
    mainDurationMinutes: "25",
  };
  const task = buildTaskFromDraft(draft0, emptyTaskBase("t1", NOW), NOW);
  const roundTripped = taskDraftFromTask(task);
  assert.equal(roundTripped.stagesEnabled, true);
  assert.equal(roundTripped.triggerEnabled, true);
  assert.equal(roundTripped.triggerDescription, "לוקח את הספר");
  assert.equal(roundTripped.triggerCueDescription, "הספר על השולחן");
  assert.equal(roundTripped.triggerDurationMinutes, "2");
  assert.equal(roundTripped.smallEnabled, true);
  assert.equal(roundTripped.smallDescription, "פסקה אחת");
  assert.equal(roundTripped.mainDescription, "ממשיך לקרוא");
  assert.equal(roundTripped.mainDurationMinutes, "25");
});

// --- Smart To-Do List task ------------------------------------------------

test("createEmptyTaskDraft defaults isTodoItem to false, urgency/importance to '5', and splittable to true", () => {
  const draft = createEmptyTaskDraft();
  assert.equal(draft.isTodoItem, false);
  assert.equal(draft.todoUrgency, "5");
  assert.equal(draft.todoImportance, "5");
  assert.equal(draft.todoIsSplittable, true);
});

test("validateTaskDraft rejects a To-Do item that also carries a scheduledTime -- mutually exclusive by definition", () => {
  const draft = { ...createEmptyTaskDraft(), title: "t", isTodoItem: true, scheduledTime: "09:00" };
  assert.ok(validateTaskDraft(draft).some((e) => e.includes("שעת התחלה")));
});

test("validateTaskDraft rejects a non-1-10 or non-integer urgency/importance, but only once isTodoItem is selected", () => {
  const base = { ...createEmptyTaskDraft(), title: "t" };
  assert.deepEqual(validateTaskDraft({ ...base, isTodoItem: false, todoUrgency: "99" }), [], "urgency/importance are irrelevant for an ordinary scheduled task");

  assert.ok(validateTaskDraft({ ...base, isTodoItem: true, todoUrgency: "0" }).length > 0);
  assert.ok(validateTaskDraft({ ...base, isTodoItem: true, todoUrgency: "11" }).length > 0);
  assert.ok(validateTaskDraft({ ...base, isTodoItem: true, todoUrgency: "5.5" }).length > 0);
  assert.ok(validateTaskDraft({ ...base, isTodoItem: true, todoUrgency: "" }).length > 0);
  assert.ok(validateTaskDraft({ ...base, isTodoItem: true, todoImportance: "0" }).length > 0);
  assert.deepEqual(validateTaskDraft({ ...base, isTodoItem: true, todoUrgency: "1", todoImportance: "10" }), []);
});

test("buildTaskFromDraft: a To-Do item is always built as a one-off task with no scheduledTime, defaulting scheduledDate to today when none was typed", () => {
  const draft = { ...createEmptyTaskDraft(), title: "לקרוא", isTodoItem: true, todoUrgency: "8", todoImportance: "3", todoIsSplittable: false, recurrenceKind: "recurring" as const, recurrenceDays: [1, 2] };
  const task = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(task.isTodoItem, true);
  assert.equal(task.scheduledTime, null);
  assert.equal(task.scheduledDate, todayLocalDateString(new Date(NOW)));
  assert.deepEqual(task.recurrence, { kind: "once" }, "a To-Do item is ALWAYS one-off, regardless of whatever the recurrence controls show");
  assert.equal(task.todoUrgency, 8);
  assert.equal(task.todoImportance, 3);
  assert.equal(task.todoIsSplittable, false);
});

test("buildTaskFromDraft preserves an explicit scheduledDate on a To-Do item rather than overriding it with today", () => {
  const draft = { ...createEmptyTaskDraft(), title: "לקרוא", isTodoItem: true, scheduledDate: "2026-02-01" };
  const task = buildTaskFromDraft(draft, emptyTaskBase("t1", NOW), NOW);
  assert.equal(task.scheduledDate, "2026-02-01");
});

test("buildTaskFromDraft never lets the editor touch todoOrder/todoCompletedMinutes -- they always carry through from `base` untouched, exactly like status/postponement fields", () => {
  const existingTodo = { ...emptyTaskBase("t1", NOW), isTodoItem: true, todoOrder: 2, todoCompletedMinutes: 15, expectedDurationMinutes: 60 };
  const draft = { ...taskDraftFromTask(existingTodo), todoUrgency: "9" };
  const rebuilt = buildTaskFromDraft(draft, existingTodo, NOW);
  assert.equal(rebuilt.todoOrder, 2, "untouched by this screen");
  assert.equal(rebuilt.todoCompletedMinutes, 15, "untouched by this screen");
  assert.equal(rebuilt.todoUrgency, 9, "this field IS editable here");
});

test("buildTaskFromDraft on an ORDINARY (non-To-Do) task preserves base's own todoUrgency/todoImportance/todoIsSplittable rather than resetting them to the draft's defaults", () => {
  const existing = { ...emptyTaskBase("t1", NOW), isTodoItem: false, todoUrgency: 7, todoImportance: 9, todoIsSplittable: false };
  const draft = { ...taskDraftFromTask(existing), title: "כותרת חדשה" };
  const rebuilt = buildTaskFromDraft(draft, existing, NOW);
  assert.equal(rebuilt.isTodoItem, false);
  assert.equal(rebuilt.todoUrgency, 7);
  assert.equal(rebuilt.todoImportance, 9);
  assert.equal(rebuilt.todoIsSplittable, false);
});

test("taskDraftFromTask round-trips every Smart To-Do List field", () => {
  const task = { ...emptyTaskBase("t1", NOW), isTodoItem: true, todoUrgency: 6, todoImportance: 2, todoIsSplittable: false };
  const draft = taskDraftFromTask(task);
  assert.equal(draft.isTodoItem, true);
  assert.equal(draft.todoUrgency, "6");
  assert.equal(draft.todoImportance, "2");
  assert.equal(draft.todoIsSplittable, false);
});

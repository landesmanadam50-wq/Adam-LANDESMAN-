import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { applyScheduleMode } from "./dailyPlan.ts";
import type { DailyPlanEntry, ScheduledPlanEntry } from "./dailyPlan.ts";
import {
  compareTodoPriority,
  reorderTodoEntry,
  resolveCurrentTaskStateWithTodoSuggestion,
  resolveEffectiveTodoOrder,
  resolveRecommendedTodoAction,
  resolveResortByRating,
  resolveTodoList,
  resolveWovenDaySections,
  TODO_PIN_START_OF_DAY,
} from "./todoList.ts";
import type { TodoPlanEntry } from "./todoList.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const DATE_LOCAL = "2026-01-05";

function todoTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    ...createEmptyTask(id, title, "להתחיל", NOW),
    isTodoItem: true,
    scheduledDate: DATE_LOCAL,
    ...overrides,
  };
}

function entry(task: Task): TodoPlanEntry {
  return { task, occurrenceDateLocal: DATE_LOCAL, remainingMinutes: task.expectedDurationMinutes === null ? null : task.expectedDurationMinutes - task.todoCompletedMinutes };
}

function fixedScheduledEntry(taskId: string, scheduledTime: string, durationMinutes: number | null): DailyPlanEntry {
  return {
    task: createEmptyTask(taskId, taskId, "להתחיל", NOW),
    occurrenceDateLocal: DATE_LOCAL,
    origin: "oneoff",
    scheduledTime,
    expectedDurationMinutes: durationMinutes,
    timeIsManual: true,
    isModifiedForToday: false,
    isCompletedToday: false,
  };
}

// --- resolveTodoList --------------------------------------------------

test("resolveTodoList includes only today's isTodoItem tasks, excluding archived and completed ones, and never a scheduled (non-To-Do) task", () => {
  const todo = todoTask("t1", "לקרוא");
  const scheduled = createEmptyTask("t2", "פגישה", "להתחיל", NOW); // isTodoItem defaults false
  const archived = todoTask("t3", "ארכיון", { status: "archived" });
  const completed = todoTask("t4", "בוצע", { status: "completed" });
  const otherDate = todoTask("t5", "יום אחר", { scheduledDate: "2026-01-06" });

  const list = resolveTodoList([todo, scheduled, archived, completed, otherDate], DATE_LOCAL);
  assert.deepEqual(list.map((e) => e.task.id), ["t1"]);
});

test("resolveTodoList computes remainingMinutes as expectedDurationMinutes minus todoCompletedMinutes, floored at 0, and null when no duration estimate exists", () => {
  const withEstimate = todoTask("t1", "ללמוד", { expectedDurationMinutes: 60, todoCompletedMinutes: 25 });
  const noEstimate = todoTask("t2", "לנקות", { expectedDurationMinutes: null });
  const overCompleted = todoTask("t3", "גבול", { expectedDurationMinutes: 10, todoCompletedMinutes: 15 });

  const list = resolveTodoList([withEstimate, noEstimate, overCompleted], DATE_LOCAL);
  assert.equal(list.find((e) => e.task.id === "t1")!.remainingMinutes, 35);
  assert.equal(list.find((e) => e.task.id === "t2")!.remainingMinutes, null);
  assert.equal(list.find((e) => e.task.id === "t3")!.remainingMinutes, 0, "never negative");
});

// --- required test 1: sort by urgency before importance, never combined ---

test("required test 1: compareTodoPriority sorts by urgency (10->1) first, then importance (10->1) only as a tiebreaker within equal urgency -- never a combined score", () => {
  const entries = [
    entry(todoTask("a", "a", { todoUrgency: 9, todoImportance: 10 })),
    entry(todoTask("b", "b", { todoUrgency: 10, todoImportance: 1 })), // lower importance but higher urgency must still come first
    entry(todoTask("c", "c", { todoUrgency: 10, todoImportance: 10 })),
    entry(todoTask("d", "d", { todoUrgency: 8, todoImportance: 10 })),
  ];
  const sorted = [...entries].sort(compareTodoPriority);
  assert.deepEqual(sorted.map((e) => e.task.id), ["c", "b", "a", "d"], "urgency 10 entries (b,c) both precede urgency 9 (a) and urgency 8 (d), regardless of importance");
});

// --- required test 2: tiebreak by importance when urgency is equal -------

test("required test 2: within equal urgency, importance (10->1) decides order", () => {
  const entries = [
    entry(todoTask("a", "a", { todoUrgency: 5, todoImportance: 5 })),
    entry(todoTask("b", "b", { todoUrgency: 5, todoImportance: 10 })),
    entry(todoTask("c", "c", { todoUrgency: 5, todoImportance: 1 })),
  ];
  const sorted = [...entries].sort(compareTodoPriority);
  assert.deepEqual(sorted.map((e) => e.task.id), ["b", "a", "c"]);
});

test("compareTodoPriority falls back to insertion (createdAt) order when both urgency and importance tie", () => {
  const entries = [
    entry(todoTask("second", "second", { todoUrgency: 5, todoImportance: 5, createdAt: "2026-01-01T00:00:02.000Z" })),
    entry(todoTask("first", "first", { todoUrgency: 5, todoImportance: 5, createdAt: "2026-01-01T00:00:01.000Z" })),
  ];
  const sorted = [...entries].sort(compareTodoPriority);
  assert.deepEqual(sorted.map((e) => e.task.id), ["first", "second"]);
});

// --- required test 3: manual reorder persists, not reset by rating edits ---

test("required test 3: resolveEffectiveTodoOrder uses manual todoOrder (when ANY entry has one) instead of rating -- editing urgency/importance never resets an already-set todoOrder", () => {
  const a = entry(todoTask("a", "a", { todoUrgency: 10, todoImportance: 10, todoOrder: 1 }));
  const b = entry(todoTask("b", "b", { todoUrgency: 1, todoImportance: 1, todoOrder: 0 }));
  const ordered = resolveEffectiveTodoOrder([a, b]);
  assert.deepEqual(ordered.map((e) => e.task.id), ["b", "a"], "manual order (b=0, a=1) wins even though a has the far higher rating");
});

test("resolveEffectiveTodoOrder falls back to compareTodoPriority when NO entry has a manual todoOrder set", () => {
  const a = entry(todoTask("a", "a", { todoUrgency: 1 }));
  const b = entry(todoTask("b", "b", { todoUrgency: 10 }));
  const ordered = resolveEffectiveTodoOrder([a, b]);
  assert.deepEqual(ordered.map((e) => e.task.id), ["b", "a"]);
});

test("resolveEffectiveTodoOrder places entries with no manual order after every manually-ordered entry, once at least one exists", () => {
  const ordered1 = entry(todoTask("ordered1", "ordered1", { todoOrder: 0 }));
  const unordered = entry(todoTask("unordered", "unordered", { todoUrgency: 10 }));
  const ordered = resolveEffectiveTodoOrder([unordered, ordered1]);
  assert.deepEqual(ordered.map((e) => e.task.id), ["ordered1", "unordered"]);
});

test("reorderTodoEntry swaps an entry with its neighbor in the CURRENT effective order, returning every entry's new todoOrder, and returns null at an edge or for an unknown taskId", () => {
  const a = entry(todoTask("a", "a", { todoOrder: 0 }));
  const b = entry(todoTask("b", "b", { todoOrder: 1 }));
  const c = entry(todoTask("c", "c", { todoOrder: 2 }));
  const result = reorderTodoEntry([a, b, c], "b", "up")!;
  assert.deepEqual(result, [
    { taskId: "a", todoOrder: 1 },
    { taskId: "b", todoOrder: 0 },
    { taskId: "c", todoOrder: 2 },
  ]);
  assert.equal(reorderTodoEntry([a, b, c], "a", "up"), null, "already at the top edge");
  assert.equal(reorderTodoEntry([a, b, c], "c", "down"), null, "already at the bottom edge");
  assert.equal(reorderTodoEntry([a, b, c], "missing", "up"), null);
});

// --- required test (re-sort by rating) ------------------------------------

test("resolveResortByRating returns every entry's taskId (for the caller to clear todoOrder back to null on all of them), never deleting or recreating anything", () => {
  const a = entry(todoTask("a", "a", { todoOrder: 3 }));
  const b = entry(todoTask("b", "b", { todoOrder: 1 }));
  assert.deepEqual(resolveResortByRating([a, b]), [{ taskId: "a" }, { taskId: "b" }]);
});

// --- required test 7: smart-fit picks the highest-priority task that fits ---

test("required test 7: resolveRecommendedTodoAction picks the top-priority entry when it fits the free time, reason 'fits'", () => {
  const top = entry(todoTask("top", "top", { todoUrgency: 10, expectedDurationMinutes: 20 }));
  const lower = entry(todoTask("lower", "lower", { todoUrgency: 1, expectedDurationMinutes: 5 }));
  const suggestion = resolveRecommendedTodoAction([lower, top], 30);
  assert.equal(suggestion.entry?.task.id, "top");
  assert.equal(suggestion.reason, "fits");
  assert.equal(suggestion.suggestedDurationMinutes, 20);
  assert.equal(suggestion.isSplit, false);
});

test("resolveRecommendedTodoAction falls through to the next-highest-priority entry that fits when the top-priority one doesn't and isn't splittable", () => {
  const top = entry(todoTask("top", "top", { todoUrgency: 10, expectedDurationMinutes: 60, todoIsSplittable: false }));
  const next = entry(todoTask("next", "next", { todoUrgency: 5, expectedDurationMinutes: 15 }));
  const suggestion = resolveRecommendedTodoAction([top, next], 20);
  assert.equal(suggestion.entry?.task.id, "next");
  assert.equal(suggestion.reason, "fits");
  assert.equal(suggestion.isSplit, false);
});

test("resolveRecommendedTodoAction treats a null remainingMinutes (no duration estimate) as always fitting, and null freeMinutes as unlimited", () => {
  const noEstimate = entry(todoTask("a", "a", { todoUrgency: 10, expectedDurationMinutes: null }));
  assert.equal(resolveRecommendedTodoAction([noEstimate], 5).reason, "fits");
  const longTask = entry(todoTask("b", "b", { todoUrgency: 10, expectedDurationMinutes: 500 }));
  assert.equal(resolveRecommendedTodoAction([longTask], null).reason, "fits", "nothing scheduled later today -- unlimited free time");
});

test("resolveRecommendedTodoAction returns reason 'no_todo_items' for an empty list", () => {
  assert.equal(resolveRecommendedTodoAction([], 30).reason, "no_todo_items");
  assert.equal(resolveRecommendedTodoAction([], 30).entry, null);
});

// --- required test 8: split suggestion + not-splittable opt-out ----------

test("required test 8: resolveRecommendedTodoAction offers a split of the TOP-priority entry when it doesn't fit but allows splitting, never silently skipping to a different task", () => {
  const top = entry(todoTask("top", "top", { todoUrgency: 10, expectedDurationMinutes: 60, todoIsSplittable: true }));
  const other = entry(todoTask("other", "other", { todoUrgency: 1, expectedDurationMinutes: 10 }));
  const suggestion = resolveRecommendedTodoAction([top, other], 30);
  assert.equal(suggestion.entry?.task.id, "top");
  assert.equal(suggestion.reason, "split_suggested");
  assert.equal(suggestion.suggestedDurationMinutes, 30, "clamped to the free time, min(remaining 60, free 30)");
  assert.equal(suggestion.isSplit, true);
});

test("required test 8 continued: when the top-priority entry opted out of splitting (todoIsSplittable=false) and doesn't fit, and nothing else fits either, reason is 'top_priority_does_not_fit' with no suggested duration", () => {
  const top = entry(todoTask("top", "top", { todoUrgency: 10, expectedDurationMinutes: 60, todoIsSplittable: false }));
  const suggestion = resolveRecommendedTodoAction([top], 10);
  assert.equal(suggestion.entry?.task.id, "top");
  assert.equal(suggestion.reason, "top_priority_does_not_fit");
  assert.equal(suggestion.suggestedDurationMinutes, null);
  assert.equal(suggestion.isSplit, false);
});

test("resolveRecommendedTodoAction never offers a split when there is zero or no free time at all, even for a splittable task", () => {
  const top = entry(todoTask("top", "top", { todoUrgency: 10, expectedDurationMinutes: 60, todoIsSplittable: true }));
  assert.equal(resolveRecommendedTodoAction([top], 0).reason, "top_priority_does_not_fit");
});

// --- required test 10: the full priority order and the one-shot recommendation are two distinct things, never conflated ---

test("required test 10: resolveRecommendedTodoAction's chosen entry can differ from the #1 (highest-priority/first-ordinal) entry the popup displays -- the plain priority order and the 'what to do now' recommendation are computed and shown separately, never collapsed into one", () => {
  const top = entry(todoTask("top", "top", { todoUrgency: 10, todoImportance: 10, expectedDurationMinutes: 60, todoIsSplittable: false }));
  const second = entry(todoTask("second", "second", { todoUrgency: 5, todoImportance: 5, expectedDurationMinutes: 15 }));
  // The plain priority order (what the Time Planning popup's own ordinal numbers reflect) is unambiguous: "top" is #1.
  const effectiveOrder = resolveEffectiveTodoOrder([second, top]);
  assert.equal(effectiveOrder[0].task.id, "top");
  // Yet the recommendation for THIS moment's free time is "second" (the only one that actually fits) --
  // the popup's own ordinal #1 and the live recommendation are never the same computation.
  const suggestion = resolveRecommendedTodoAction([second, top], 20);
  assert.equal(suggestion.entry?.task.id, "second");
  assert.notEqual(suggestion.entry?.task.id, effectiveOrder[0].task.id);
});

test("required test 10 continued: a manual todoOrder changes the plain priority list's own ordering (and therefore what resolveRecommendedTodoAction walks), but it is still resolveRecommendedTodoAction's OWN fit/split logic -- never the raw ordinal position itself -- that decides which entry is actually recommended", () => {
  const urgent = entry(todoTask("urgent", "urgent", { todoUrgency: 10, expectedDurationMinutes: 60, todoIsSplittable: false, todoOrder: 2 }));
  const manuallyFirst = entry(todoTask("manual", "manual", { todoUrgency: 1, expectedDurationMinutes: 15, todoOrder: 1 }));
  const effectiveOrder = resolveEffectiveTodoOrder([urgent, manuallyFirst]);
  assert.equal(effectiveOrder[0].task.id, "manual", "manual order, not raw urgency, decides the popup's own #1");
  // With little free time, the manually-first entry (which fits) is recommended -- not because it is "#1",
  // but because the fit/split walk (which happens to start from the same effective order) found it fits.
  const suggestion = resolveRecommendedTodoAction([urgent, manuallyFirst], 20);
  assert.equal(suggestion.entry?.task.id, "manual");
});

// --- required test 11: a removed/retimed Flexible Day entry is never resurrected without an explicit refresh ---

test("required test 11: removing a To-Do item (deleteTask, the same removal path the popup's own delete button uses) means it is simply ABSENT from the next resolveTodoList call -- there is no separate cache or snapshot anywhere in this module that could resurrect it", () => {
  const remaining = entry(todoTask("stays", "stays"));
  // Simulating "delete" is just no longer passing the task in on the next resolve -- resolveTodoList/
  // resolveRecommendedTodoAction/resolveEffectiveTodoOrder are all pure functions over their CURRENT
  // task-list argument, never over any retained prior-call state.
  const beforeDelete = resolveEffectiveTodoOrder([remaining, entry(todoTask("removed", "removed"))]);
  assert.equal(beforeDelete.length, 2);
  const afterDelete = resolveEffectiveTodoOrder([remaining]);
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].task.id, "stays");
});

test("required test 11 continued: retiming a To-Do item to a LATER date (editing its own scheduledDate, the same field every other Flexible Day entry already uses) makes resolveTodoList exclude it from today's list immediately -- no stale 'still shows today' state survives the edit", () => {
  const todayTask = todoTask("t1", "today item", { scheduledDate: DATE_LOCAL });
  const retimedTask = { ...todayTask, scheduledDate: "2026-01-06" };
  assert.equal(resolveTodoList([todayTask], DATE_LOCAL).length, 1);
  assert.equal(resolveTodoList([retimedTask], DATE_LOCAL).length, 0, "the SAME task, now dated tomorrow, must vanish from today's list the very next resolve -- never requiring a separate invalidation step");
});

// --- required test 6: due scheduled task always wins over a To-Do suggestion ---

test("required test 6: resolveCurrentTaskStateWithTodoSuggestion never offers a To-Do suggestion while a scheduled task is genuinely current -- a due scheduled task always wins", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "06:00", 60)], { mode: "continuous" });
  const todo = [entry(todoTask("todo1", "todo1", { todoUrgency: 10 }))];
  const result = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todo, new Date("2026-01-05T06:30:00"), null, null);
  assert.equal(result.current?.task.id, "sched");
  assert.equal(result.todoSuggestion, null, "no To-Do suggestion is even computed while something is current");
});

test("resolveCurrentTaskStateWithTodoSuggestion offers a To-Do suggestion when nothing is current, using the free time until the next scheduled task", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "09:00", 30)], { mode: "continuous" });
  const todo = [entry(todoTask("todo1", "todo1", { todoUrgency: 10, expectedDurationMinutes: 5 }))];
  const result = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todo, new Date("2026-01-05T08:50:00"), null, null);
  assert.equal(result.current, null);
  assert.equal(result.todoSuggestion?.entry?.task.id, "todo1");
  assert.equal(result.todoSuggestion?.reason, "fits", "10 minutes free (08:50 -> 09:00), the 5-minute task comfortably fits");
});

test("resolveCurrentTaskStateWithTodoSuggestion's To-Do suggestion correctly reflects a tight free window (does not fit, offers a split)", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "09:00", 30)], { mode: "continuous" });
  const todo = [entry(todoTask("todo1", "todo1", { todoUrgency: 10, expectedDurationMinutes: 20, todoIsSplittable: true }))];
  const result = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todo, new Date("2026-01-05T08:50:00"), null, null);
  assert.equal(result.current, null);
  assert.equal(result.todoSuggestion?.reason, "split_suggested");
  assert.equal(result.todoSuggestion?.suggestedDurationMinutes, 10);
});

test("resolveCurrentTaskStateWithTodoSuggestion returns reason 'no_todo_items' when nothing is current and the To-Do list is empty -- never a stale/leftover suggestion", () => {
  const scheduled: ScheduledPlanEntry[] = [];
  const result = resolveCurrentTaskStateWithTodoSuggestion(scheduled, [], new Date("2026-01-05T08:50:00"), null, null);
  assert.equal(result.current, null);
  assert.equal(result.next, null);
  assert.equal(result.todoSuggestion?.reason, "no_todo_items");
});

// --- required test 13: real-time recompute never touches an active task's own timer ---

test("required test 13: resolveCurrentTaskStateWithTodoSuggestion is a pure read -- it never mutates the scheduled/todo entries it was given (no active-task/timer side effects)", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "09:00", 30)], { mode: "continuous" });
  const scheduledCopy = JSON.parse(JSON.stringify(scheduled));
  const todo = [entry(todoTask("todo1", "todo1"))];
  const todoCopy = JSON.parse(JSON.stringify(todo));
  resolveCurrentTaskStateWithTodoSuggestion(scheduled, todo, new Date("2026-01-05T08:00:00"), null, null);
  assert.deepEqual(JSON.parse(JSON.stringify(scheduled)), scheduledCopy);
  assert.deepEqual(JSON.parse(JSON.stringify(todo)), todoCopy);
});

// --- required test 14: a To-Do item never silently becomes a scheduled task ---

test("required test 14: a To-Do entry's own task is never given a scheduledTime by anything in this module -- it is only ever suggested, never auto-scheduled", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "09:00", 30)], { mode: "continuous" });
  const todoItem = todoTask("todo1", "todo1", { todoUrgency: 10, expectedDurationMinutes: 10 });
  const result = resolveCurrentTaskStateWithTodoSuggestion(scheduled, [entry(todoItem)], new Date("2026-01-05T08:00:00"), null, null);
  assert.equal(result.todoSuggestion?.entry?.task.scheduledTime, null, "the suggested task's own scheduledTime is still null -- a recommendation is never a write");
});

// --- resolveWovenDaySections: "להעביר את המשימה מה-To-Do ליסט ליום הגמיש בין המשימות הקבועות" ---

test("resolveWovenDaySections weaves a fitting To-Do entry into the gap right after the scheduled entry it fits behind, and defers a non-fitting one to the always-open trailing slot", () => {
  const scheduled = applyScheduleMode(
    [fixedScheduledEntry("sched1", "09:00", 30), fixedScheduledEntry("sched2", "10:00", 30)],
    { mode: "continuous" }
  );
  // the 09:00-09:30 / 10:00-10:30 pair leaves a 30-minute gap (09:30 -> 10:00).
  const fits20 = entry(todoTask("fits", "fits", { todoUrgency: 10, expectedDurationMinutes: 20 }));
  const tooLong = entry(todoTask("tooLong", "tooLong", { todoUrgency: 5, expectedDurationMinutes: 60 }));
  const woven = resolveWovenDaySections(scheduled, [fits20, tooLong]);
  assert.deepEqual(
    woven.map((item) => (item.kind === "scheduled" ? item.entry.task.id : item.entry.task.id)),
    ["sched1", "fits", "sched2", "tooLong"]
  );
});

test("resolveWovenDaySections places every To-Do entry, in priority order, at the end when there are no scheduled entries at all -- never drops one", () => {
  const todoHigh = entry(todoTask("high", "high", { todoUrgency: 10 }));
  const todoLow = entry(todoTask("low", "low", { todoUrgency: 1 }));
  const woven = resolveWovenDaySections([], [todoLow, todoHigh]);
  assert.deepEqual(woven, [
    { kind: "todo", entry: todoHigh },
    { kind: "todo", entry: todoLow },
  ]);
});

test("resolveWovenDaySections treats a To-Do entry with no duration estimate as fitting ANY gap (even a tiny or uncertain one) -- same 'no estimate -> assume it fits' rule resolveRecommendedTodoAction already uses, so it lands in the very first gap, not deferred to the end", () => {
  const scheduled = applyScheduleMode(
    [fixedScheduledEntry("sched1", "09:00", 30), fixedScheduledEntry("sched2", "09:35", 30)],
    { mode: "continuous" }
  );
  // only a 5-minute gap (09:30 -> 09:35) -- too small for any real estimate, but a no-estimate item still fits it.
  const noEstimate = entry(todoTask("noEstimate", "noEstimate", { expectedDurationMinutes: null }));
  const woven = resolveWovenDaySections(scheduled, [noEstimate]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["sched1", "noEstimate", "sched2"]);
});

test("resolveWovenDaySections never crosses a gap whose bounds aren't both known (treated as 0 free minutes, not unlimited) -- an estimated item is never front-loaded into an uncertain early slot", () => {
  // a flexible (non-manual-time) first entry has no effectiveStartTime until a later anchor sets the cursor,
  // so the gap after it is unknown, not unlimited.
  const flexibleFirst: DailyPlanEntry = { ...fixedScheduledEntry("flex", "09:00", 30), timeIsManual: false };
  const anchored = fixedScheduledEntry("anchor", "11:00", 30);
  const scheduled = applyScheduleMode([flexibleFirst, anchored], { mode: "continuous" });
  assert.equal(scheduled[0].effectiveStartTime, null, "sanity check: the flexible entry's own effective time is genuinely unknown here");
  const estimated = entry(todoTask("estimated", "estimated", { expectedDurationMinutes: 10 }));
  const woven = resolveWovenDaySections(scheduled, [estimated]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["flex", "anchor", "estimated"], "deferred to the trailing slot, never placed into the unknown gap after the flexible entry");
});

// --- resolveWovenDaySections: manual pin override ("גרירה חופשית של השורה במסך") ---

test("resolveWovenDaySections: a to-do pinned after a fixed/scheduled task renders directly after it, overriding what the automatic free-time fit would otherwise have chosen", () => {
  const scheduled = applyScheduleMode(
    [fixedScheduledEntry("breakfast", "08:00", 30), fixedScheduledEntry("lunch", "13:00", 30)],
    { mode: "continuous" }
  );
  // a short, high-priority to-do would normally auto-fit into the big 08:30 -> 13:00 gap (right after breakfast).
  const pinnedAfterLunch = entry(todoTask("t1", "t1", { todoUrgency: 10, expectedDurationMinutes: 10, todoPinnedAfterTaskId: "lunch" }));
  const woven = resolveWovenDaySections(scheduled, [pinnedAfterLunch]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["breakfast", "lunch", "t1"]);
});

test("resolveWovenDaySections: TODO_PIN_START_OF_DAY pins a to-do before every entry, including the first scheduled one", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("morning", "08:00", 30)], { mode: "continuous" });
  const pinnedFirst = entry(todoTask("t1", "t1", { todoPinnedAfterTaskId: TODO_PIN_START_OF_DAY }));
  const woven = resolveWovenDaySections(scheduled, [pinnedFirst]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["t1", "morning"]);
});

test("resolveWovenDaySections: a pin CHAIN (to-do B pinned after to-do A, A itself pinned after a fixed task) resolves in the correct relative order in one call -- never requires a second pass from the caller", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("lunch", "13:00", 30)], { mode: "continuous" });
  const a = entry(todoTask("a", "a", { todoPinnedAfterTaskId: "lunch" }));
  const b = entry(todoTask("b", "b", { todoPinnedAfterTaskId: "a" }));
  const woven = resolveWovenDaySections(scheduled, [b, a]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["lunch", "a", "b"]);
});

test("resolveWovenDaySections: multiple to-dos pinned to the SAME target are inserted together, in priority order, not reversed", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("lunch", "13:00", 30)], { mode: "continuous" });
  const low = entry(todoTask("low", "low", { todoUrgency: 2, todoPinnedAfterTaskId: "lunch" }));
  const high = entry(todoTask("high", "high", { todoUrgency: 9, todoPinnedAfterTaskId: "lunch" }));
  const woven = resolveWovenDaySections(scheduled, [low, high]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["lunch", "high", "low"]);
});

test("resolveWovenDaySections: a pin targeting a task id that doesn't exist on this day (removed/completed/never-placed) falls back to automatic placement -- never dropped, never an error", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "09:00", 30)], { mode: "continuous" });
  const dangling = entry(todoTask("t1", "t1", { todoPinnedAfterTaskId: "does-not-exist" }));
  const woven = resolveWovenDaySections(scheduled, [dangling]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["sched", "t1"]);
});

test("resolveWovenDaySections: a cyclic pin (A after B, B after A) never loops -- both fall back to automatic placement", () => {
  const scheduled = applyScheduleMode([fixedScheduledEntry("sched", "09:00", 30)], { mode: "continuous" });
  const a = entry(todoTask("a", "a", { todoUrgency: 9, todoPinnedAfterTaskId: "b" }));
  const b = entry(todoTask("b", "b", { todoUrgency: 5, todoPinnedAfterTaskId: "a" }));
  const woven = resolveWovenDaySections(scheduled, [a, b]);
  assert.deepEqual(woven.map((item) => item.entry.task.id), ["sched", "a", "b"], "both fall back together, in priority order, same as any unpinned pair");
});

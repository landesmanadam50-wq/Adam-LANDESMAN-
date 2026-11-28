import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";
import { resolveFreeTimeWindowKey } from "./freeTimeWindow.ts";
import { TODO_PIN_START_OF_DAY } from "./todoList.ts";
import type { TodoPlanEntry } from "./todoList.ts";
import { resolveDynamicPlanningAction, resolveDynamicPlanningActions, resolveDynamicPlanningKey } from "./dynamicPlanning.ts";

const NOW = "2026-11-28T00:00:00.000Z";
const DATE_LOCAL = "2026-11-28";

function fixedTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), ...overrides };
}

function fixedEntry(id: string, title: string, start: string | null, end: string | null, overrides: Partial<ScheduledPlanEntry> = {}): ScheduledPlanEntry {
  return {
    task: fixedTask(id, title),
    occurrenceDateLocal: DATE_LOCAL,
    origin: "oneoff",
    scheduledTime: start,
    expectedDurationMinutes: null,
    timeIsManual: true,
    isModifiedForToday: false,
    isCompletedToday: false,
    effectiveStartTime: start,
    effectiveEndTime: end,
    hasConflict: false,
    ...overrides,
  };
}

function todoTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), isTodoItem: true, scheduledDate: DATE_LOCAL, ...overrides };
}

function todoEntry(task: Task): TodoPlanEntry {
  return { task, occurrenceDateLocal: DATE_LOCAL, remainingMinutes: task.expectedDurationMinutes === null ? null : task.expectedDurationMinutes - task.todoCompletedMinutes };
}

// --- "none": no real gap exists --------------------------------------------

test("back-to-back fixed tasks (zero-duration gap) never need planning", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "11:00", "12:00");
  const scheduled = [sport, learning];
  const decision = resolveDynamicPlanningAction(scheduled, [], sport);
  assert.equal(decision.action, "none");
  assert.equal(decision.window, null);
  assert.equal(resolveDynamicPlanningKey(DATE_LOCAL, decision), null);
});

// --- "plan_gap": a real gap exists, nothing woven into it ------------------

test("required scenario (spec section 1): a free gap with no To-Do items at all still needs 'plan_gap' -- the trainee can add a brand-new one through the planning screen", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "12:00", "13:00");
  const scheduled = [sport, learning];
  const decision = resolveDynamicPlanningAction(scheduled, [], sport);
  assert.equal(decision.action, "plan_gap");
  assert.ok(decision.window);
  assert.equal(decision.window!.durationMinutes, 60);
  assert.equal(decision.candidate, null);
});

test("a gap exists but no To-Do item fits it (all too long) is STILL 'plan_gap', never silently 'none' -- the trainee must still be able to shorten/split/replan", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "11:10", "12:00");
  const scheduled = [sport, learning];
  const tooLong = todoEntry(todoTask("book", "קריאת ספר", { expectedDurationMinutes: 120 }));
  const decision = resolveDynamicPlanningAction(scheduled, [tooLong], sport);
  assert.equal(decision.action, "plan_gap");
  assert.equal(decision.candidate, null);
});

test("the open-ended trailing window after the LAST fixed task of the day also qualifies for planning when nothing is woven into it", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const decision = resolveDynamicPlanningAction([sport], [], sport);
  assert.equal(decision.action, "plan_gap");
  assert.equal(decision.window!.durationMinutes, null);
});

// --- "confirm_next_todo": a To-Do is already woven into the gap -----------

test("required scenario (worked example, spec section 5): a To-Do that automatically fits the gap (greedy weave) is offered for confirmation, naming the exact task", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "12:00", "13:00");
  const scheduled = [sport, learning];
  const book = todoEntry(todoTask("book", "קריאת ספר", { expectedDurationMinutes: 30, todoUrgency: 10 }));
  const writing = todoEntry(todoTask("writing", "כתיבת תובנות", { expectedDurationMinutes: 20, todoUrgency: 5 }));
  const decision = resolveDynamicPlanningAction(scheduled, [book, writing], sport);
  assert.equal(decision.action, "confirm_next_todo");
  assert.equal(decision.candidate!.task.id, "book");
});

test("a manually pinned To-Do (todoPinnedAfterTaskId) wins over the automatic greedy fit for the confirmation candidate", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "12:00", "13:00");
  const scheduled = [sport, learning];
  const highPriorityButUnpinned = todoEntry(todoTask("urgent", "דחוף", { expectedDurationMinutes: 20, todoUrgency: 10 }));
  const pinned = todoEntry(todoTask("pinned", "מוצמד", { expectedDurationMinutes: 20, todoUrgency: 1, todoPinnedAfterTaskId: "sport" }));
  const decision = resolveDynamicPlanningAction(scheduled, [highPriorityButUnpinned, pinned], sport);
  assert.equal(decision.action, "confirm_next_todo");
  assert.equal(decision.candidate!.task.id, "pinned");
});

test("TODO_PIN_START_OF_DAY never counts as 'woven after' a real fixed entry -- it only affects the very start of the day", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "12:00", "13:00");
  const scheduled = [sport, learning];
  const startOfDay = todoEntry(todoTask("morning", "בוקר", { expectedDurationMinutes: 10, todoPinnedAfterTaskId: TODO_PIN_START_OF_DAY }));
  const decision = resolveDynamicPlanningAction(scheduled, [startOfDay], sport);
  assert.equal(decision.action, "plan_gap");
  assert.equal(decision.candidate, null);
});

// --- resolveDynamicPlanningActions: whole-day scan -------------------------

test("resolveDynamicPlanningActions returns only non-'none' decisions, in the plan's own chronological order", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "11:00", "12:00"); // no gap after sport
  const dinner = fixedEntry("dinner", "ארוחת ערב", "14:00", "15:00"); // gap after learning
  const scheduled = [sport, learning, dinner];
  const decisions = resolveDynamicPlanningActions(scheduled, []);
  assert.deepEqual(decisions.map((d) => d.precedingEntry.task.id), ["learning", "dinner"]);
  assert.ok(decisions.every((d) => d.action === "plan_gap"));
});

// --- resolveDynamicPlanningKey: identical identity to resolveFreeTimeWindowKey, for dismissal reuse ---

test("resolveDynamicPlanningKey produces the EXACT SAME string resolveFreeTimeWindowKey would for the same window -- arc/freeTimeWindowDismissal.ts's existing list can be reused verbatim, never a second dismissal mechanism", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "12:00", "13:00");
  const scheduled = [sport, learning];
  const decision = resolveDynamicPlanningAction(scheduled, [], sport);
  assert.equal(resolveDynamicPlanningKey(DATE_LOCAL, decision), resolveFreeTimeWindowKey(DATE_LOCAL, decision.window!));
  assert.equal(resolveDynamicPlanningKey(DATE_LOCAL, decision), `${DATE_LOCAL}|sport|learning`);
});

// --- the rolling chain itself (spec section 4), proven directly -----------

test("required scenario (spec section 4 -- the rolling chain): once a woven To-Do is 'confirmed' (simulated here exactly as the real conversion does: it becomes a real oneoff ScheduledPlanEntry occupying the former gap), the ORIGINAL preceding entry's own decision becomes 'none' (the gap is filled), while the NEWLY fixed entry gets its own fresh decision about ITS OWN next gap -- the same resolver, never special-cased per conversion step", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "12:00", "13:00");
  const scheduledBeforeConfirm = [sport, learning];
  const book = todoEntry(todoTask("book", "קריאת ספר", { expectedDurationMinutes: 30 }));
  const before = resolveDynamicPlanningAction(scheduledBeforeConfirm, [book], sport);
  assert.equal(before.action, "confirm_next_todo");
  assert.equal(before.candidate!.task.id, "book");

  // The confirm action itself (arc/dynamicPlanning.ts never performs this
  // write -- the real screen does, via upsertTask isTodoItem:false). Here
  // we simulate ONLY its effect on the resolved plan, to prove the chain.
  const bookNowFixed = fixedEntry("book", "קריאת ספר", "11:00", "11:30");
  const writing = todoEntry(todoTask("writing", "כתיבת תובנות", { expectedDurationMinutes: 20 }));
  const scheduledAfterConfirm = [sport, bookNowFixed, learning];

  const sportAfter = resolveDynamicPlanningAction(scheduledAfterConfirm, [writing], sport);
  assert.equal(sportAfter.action, "none", "the gap right after sport is now filled by the confirmed book task -- never re-asked about");

  const bookAfter = resolveDynamicPlanningAction(scheduledAfterConfirm, [writing], bookNowFixed);
  assert.equal(bookAfter.action, "confirm_next_todo", "the newly-fixed book task now has its own next-gap decision, exactly mirroring the worked example's second step (כתיבת תובנות)");
  assert.equal(bookAfter.candidate!.task.id, "writing");
});

// --- excludeTaskId passthrough ---------------------------------------------

test("excludeTaskId is forwarded to resolveFreeTimeWindows, same null-safe exclusion every sibling resolver already takes", () => {
  const sport = fixedEntry("sport", "ספורט", "10:00", "11:00");
  const learning = fixedEntry("learning", "למידה", "11:00", "12:00", { isCompletedToday: true });
  const dinner = fixedEntry("dinner", "ארוחת ערב", "13:00", "14:00");
  const scheduled = [sport, learning, dinner];
  // learning is already excluded by isCompletedToday inside resolveFreeTimeWindows's own candidate filter -- sport's gap should reach all the way to dinner.
  const decision = resolveDynamicPlanningAction(scheduled, [], sport, null);
  assert.equal(decision.action, "plan_gap");
  assert.equal(decision.window!.followingTaskId, "dinner");
});

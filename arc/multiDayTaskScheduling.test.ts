import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { resolveDailyPlan } from "./dailyPlan.ts";
import { buildTaskOccurrenceOverride, resolveEffectiveOccurrence } from "./taskOccurrenceOverride.ts";
import type { TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";
import { resolveNextTaskStartOccurrence } from "./taskScheduledStart.ts";
import { selectAllRecurrenceDaysInDraft, taskDraftFromTask, toggleRecurrenceDayInDraft, buildTaskFromDraft, createEmptyTaskDraft } from "./taskDraft.ts";

/**
 * arc/multiDayTaskScheduling.test.ts
 *
 * Open Today's Schedule Automatically + Multi-Day Task Scheduling task,
 * section 10's own required regression coverage for requirement 2
 * ("Select Multiple Weekdays When Editing Recurring Tasks") at the pure
 * data/scheduling level -- the editor screen's own UI wiring is covered
 * separately in build/taskEditorScreen.test.ts/arc/taskDraft.test.ts.
 * Every scenario here reuses Task.recurrence.daysOfWeek, resolveDailyPlan,
 * resolveNextTaskStartOccurrence, and TaskOccurrenceOverride exactly as
 * they already existed -- "Select Multiple Weekdays" never introduced a
 * second recurrence model or a duplicate-task-per-weekday mechanism.
 */

const NOW = "2026-01-01T00:00:00.000Z";

function multiDayTask(): Task {
  // Sunday 2026-01-04, Tuesday 2026-01-06, Thursday 2026-01-08 -- one
  // single task record, three weekdays.
  return { ...createEmptyTask("t1", "אימון", "ללבוש בגדי ספורט", NOW), recurrence: { kind: "recurring", daysOfWeek: [0, 2, 4] }, scheduledTime: "07:00", expectedDurationMinutes: 30 };
}

test("required test: a single recurring task assigned to several weekdays appears on EVERY one of them, as the SAME task id -- never a duplicate task per weekday", () => {
  const task = multiDayTask();
  const sunday = resolveDailyPlan([task], [], [], "2026-01-04", new Date(2026, 0, 4));
  const tuesday = resolveDailyPlan([task], [], [], "2026-01-06", new Date(2026, 0, 6));
  const thursday = resolveDailyPlan([task], [], [], "2026-01-08", new Date(2026, 0, 8));
  const monday = resolveDailyPlan([task], [], [], "2026-01-05", new Date(2026, 0, 5));

  for (const plan of [sunday, tuesday, thursday]) {
    assert.equal(plan.length, 1);
    assert.equal(plan[0].task.id, "t1");
    assert.equal(plan[0].origin, "weekly");
  }
  assert.equal(monday.length, 0, "a weekday never in daysOfWeek must never surface this task");
});

test("required test: editing selected weekdays updates the recurring TEMPLATE only -- the exact same task id, never a second record, with a fresh set of days taking effect everywhere at once", () => {
  const task = multiDayTask();
  // Simulate the editor: remove Thursday, add Wednesday -- reusing the
  // exact SAME toggle helpers build/TaskEditorScreen.tsx itself calls.
  let draft = taskDraftFromTask(task);
  draft = toggleRecurrenceDayInDraft(draft, 4); // remove Thursday
  draft = toggleRecurrenceDayInDraft(draft, 3); // add Wednesday
  const edited = buildTaskFromDraft(draft, task, "2026-01-02T00:00:00.000Z");

  assert.equal(edited.id, task.id, "editing recurrence days must never change/duplicate the task's own id");
  assert.deepEqual(edited.recurrence, { kind: "recurring", daysOfWeek: [0, 2, 3] });

  const thursday = resolveDailyPlan([edited], [], [], "2026-01-08", new Date(2026, 0, 8));
  assert.equal(thursday.length, 0, "Thursday was removed from the template -- it must no longer appear, including for an already-past Thursday");
  const wednesday = resolveDailyPlan([edited], [], [], "2026-01-07", new Date(2026, 0, 7));
  assert.equal(wednesday.length, 1, "Wednesday was just added -- it must appear immediately");
});

test("required test: an override on a weekday REMOVED from the recurrence is never deleted by the edit itself -- it simply stops surfacing (safely orphaned, historical record preserved)", () => {
  const task = multiDayTask();
  const thursdayOverride = buildTaskOccurrenceOverride(task, "2026-01-08", null, { scheduledTime: "08:30" }, NOW);
  const overrides: TaskOccurrenceOverride[] = [thursdayOverride];

  // Edit: drop Thursday from the template.
  let draft = taskDraftFromTask(task);
  draft = toggleRecurrenceDayInDraft(draft, 4);
  const edited = buildTaskFromDraft(draft, task, "2026-01-02T00:00:00.000Z");

  // The override record itself is untouched by the edit -- editing a
  // Task never reads or writes TaskOccurrenceOverride storage at all.
  assert.deepEqual(overrides, [thursdayOverride], "the edit must never delete or mutate any existing override record");
  // But it no longer surfaces on the Flexible Daily Routine, since
  // Thursday is no longer one of the task's own recurrence days.
  const thursdayPlan = resolveDailyPlan([edited], overrides, [], "2026-01-08", new Date(2026, 0, 8));
  assert.equal(thursdayPlan.length, 0);
});

test("required test: an override on a weekday the task STILL occurs on survives editing the OTHER days untouched", () => {
  const task = multiDayTask();
  const sundayOverride = buildTaskOccurrenceOverride(task, "2026-01-04", null, { scheduledTime: "09:15", expectedDurationMinutes: 45 }, NOW);
  const overrides: TaskOccurrenceOverride[] = [sundayOverride];

  // Edit: drop Thursday, Sunday/Tuesday stay exactly as they were.
  let draft = taskDraftFromTask(task);
  draft = toggleRecurrenceDayInDraft(draft, 4);
  const edited = buildTaskFromDraft(draft, task, "2026-01-02T00:00:00.000Z");

  const effective = resolveEffectiveOccurrence(edited, "2026-01-04", overrides);
  assert.equal(effective.scheduledTime, "09:15", "Sunday's own override must still apply exactly as before, unaffected by Thursday being removed");
  assert.equal(effective.expectedDurationMinutes, 45);
});

test("required test: resolveNextTaskStartOccurrence (the task's own start alarm) finds the NEAREST of several selected weekdays, never only the first one in the array", () => {
  const wednesday = new Date("2026-01-07T09:00:00"); // a Wednesday, local time; daysOfWeek: Sun/Tue/Thu
  const task = multiDayTask();
  const next = resolveNextTaskStartOccurrence(task, wednesday);
  assert.ok(next);
  assert.equal(next!.getDay(), 4, "Thursday is the nearest qualifying day after Wednesday among [Sun, Tue, Thu]");
  assert.equal(next!.getDate(), 8);
  assert.equal(next!.getHours(), 7);
});

test("required test: resolveNextTaskStartOccurrence re-targets immediately once a weekday is edited OUT of the recurrence -- never still pointing at the old (now invalid) day", () => {
  const wednesday = new Date("2026-01-07T09:00:00");
  const task = multiDayTask(); // Sun/Tue/Thu
  let draft = taskDraftFromTask(task);
  draft = toggleRecurrenceDayInDraft(draft, 4); // remove Thursday -- only Sun/Tue left
  const edited = buildTaskFromDraft(draft, task, "2026-01-02T00:00:00.000Z");

  const next = resolveNextTaskStartOccurrence(edited, wednesday);
  assert.ok(next);
  assert.notEqual(next!.getDay(), 4, "Thursday was just removed -- the next alarm occurrence must never still land on it");
  assert.equal(next!.getDay(), 0, "Sunday (the 6th, the next remaining qualifying day after this Wednesday) is next");
});

test("required test: 'select all days' makes every weekday qualify, and the task remains ONE record -- resolveNextTaskStartOccurrence then always finds tomorrow at the latest", () => {
  const wednesday = new Date("2026-01-07T22:00:00"); // today's own time already passed
  const draft = selectAllRecurrenceDaysInDraft({ ...createEmptyTaskDraft(), title: "יומי", firstAction: "להתחיל", recurrenceKind: "recurring" as const, scheduledTime: "07:00" });
  const task = buildTaskFromDraft(draft, { ...createEmptyTask("t2", "", "", NOW) }, NOW);
  const next = resolveNextTaskStartOccurrence(task, wednesday);
  assert.ok(next);
  assert.equal(next!.getDate(), 8, "today's own 07:00 already passed -- the very next day (every day qualifies) is tomorrow");
});

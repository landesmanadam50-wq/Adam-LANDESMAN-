import test from "node:test";
import assert from "node:assert/strict";

import { archiveTask, createEmptyTask, startTask, postponeTask, completeTask, type Task } from "./tasks.ts";
import { buildTodaySections, listTasksScheduledThisWeek, resolveArcWindowClockTime, resolveMostUrgentEntry, resolveNextTaskEntry } from "./todaySchedule.ts";
import type { TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { buildTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "./taskOccurrenceOverride.ts";
import type { TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";
import { resolveDailyPlan } from "./dailyPlan.ts";
import { resetWeekOccurrenceOverrides } from "./weeklyRoutine.ts";

// Fixed reference "now": Monday 2026-01-05, 12:00 local.
const NOW = new Date(2026, 0, 5, 12, 0, 0);
const TODAY = "2026-01-05";
const YESTERDAY = "2026-01-04";
const TOMORROW = "2026-01-06";

function task(overrides: Partial<Task> = {}): Task {
  const base = createEmptyTask(overrides.id ?? `t-${Math.random()}`, "כותרת", "פעולה ראשונה", "2026-01-01T00:00:00.000Z");
  return { ...base, ...overrides };
}

test("a one-time task scheduled today with a future time is laterToday AND is the nextTask (no current candidate -- nothing is active)", () => {
  const t = task({ scheduledDate: TODAY, scheduledTime: "18:00" });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.nextTask?.task.id, t.id);
  assert.deepEqual(sections.laterToday, []);
});

// Task-categorization fix: this is the exact bug report -- a task whose
// scheduled time has passed, but was never started, must NEVER appear
// under "current" ("המשימה עכשיו"). It belongs in "overdue" only.
test("a one-time task scheduled today with a past time, never started, is overdue -- NEVER promoted to current", () => {
  const t = task({ scheduledDate: TODAY, scheduledTime: "08:00" });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.current, null, "an un-started overdue task must never be shown as the current task");
  assert.equal(sections.overdue.length, 1);
  assert.equal(sections.overdue[0].task.id, t.id);
});

test("a one-time task scheduled yesterday, never started, is overdue -- never current", () => {
  const t = task({ scheduledDate: YESTERDAY, scheduledTime: "08:00" });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.overdue[0]?.task.id, t.id);
});

test("a one-time task scheduled tomorrow never appears on today's screen", () => {
  const t = task({ scheduledDate: TOMORROW });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.nextTask, null);
  assert.deepEqual(sections.overdue, []);
  assert.deepEqual(sections.laterToday, []);
});

test("a one-time task with no scheduledDate is unscheduled", () => {
  const t = task({ scheduledDate: null });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.unscheduled.length, 1);
  assert.equal(sections.unscheduled[0].task.id, t.id);
  assert.equal(sections.current, null, "unscheduled tasks are never promoted to current");
  assert.equal(sections.nextTask, null, "unscheduled tasks have no clock time, so they can never be the next task either");
});

test("a one-time task completed today is completedToday; completed on an earlier day disappears from today entirely", () => {
  const completedToday = completeTask(task({ id: "a" }), new Date(2026, 0, 5, 9, 0).toISOString());
  const completedYesterday = completeTask(task({ id: "b" }), new Date(2026, 0, 4, 9, 0).toISOString());
  const sections = buildTodaySections([completedToday, completedYesterday], [], NOW);
  assert.deepEqual(sections.completedToday.map((e) => e.task.id), ["a"]);
});

// Requirement 4: a completed task stays completed and never becomes active again, even across a reload (classification is a pure function of the persisted status/completedAt fields -- there is no path back to "current").
test("a completed task is never promoted to current, even if its original scheduled time would otherwise make it look overdue", () => {
  const completed = completeTask(task({ scheduledDate: YESTERDAY, scheduledTime: "08:00" }), NOW.toISOString());
  const sections = buildTodaySections([completed], [], NOW);
  assert.equal(sections.current, null);
  assert.deepEqual(sections.overdue, []);
});

test("requirement 1 + 'starting a late task manually makes it the active task': an ACTIVE task is promoted to current, and REMOVED from overdue/laterToday -- never shown in both places", () => {
  const overdueTask = task({ id: "overdue", scheduledDate: TODAY, scheduledTime: "07:00" });
  const activeTask = startTask(task({ id: "active", scheduledDate: TODAY, scheduledTime: "20:00" }), NOW.toISOString());
  const sections = buildTodaySections([overdueTask, activeTask], [], NOW);
  assert.equal(sections.current?.task.id, "active");
  // The still-overdue, non-active task keeps its own, separate place -- it is NOT swallowed by "current".
  assert.equal(sections.overdue.length, 1);
  assert.equal(sections.overdue[0].task.id, "overdue");
});

test("starting an overdue task moves it OUT of 'overdue' and INTO 'current' -- the exact 'start a late task manually' requirement", () => {
  const overdueTask = task({ id: "late", scheduledDate: TODAY, scheduledTime: "06:30" });
  const beforeStart = buildTodaySections([overdueTask], [], NOW);
  assert.equal(beforeStart.current, null);
  assert.equal(beforeStart.overdue[0]?.task.id, "late");

  const started = startTask(overdueTask, NOW.toISOString());
  const afterStart = buildTodaySections([started], [], NOW);
  assert.equal(afterStart.current?.task.id, "late");
  assert.deepEqual(afterStart.overdue, []);
});

// Task-categorization fix, the core bug report: at 13:43, a task scheduled
// for 06:30 that was never started must show under "overdue", never under
// "המשימה עכשיו" -- reproduced directly with the reported numbers.
test("bug report reproduction: at 13:43, a task scheduled for 06:30 and never started is overdue, not current", () => {
  const reportedNow = new Date(2026, 0, 5, 13, 43, 0);
  const workout = task({ id: "workout", title: "לעשות כושר בבית", scheduledDate: TODAY, scheduledTime: "06:30" });
  const sections = buildTodaySections([workout], [], reportedNow);
  assert.equal(sections.current, null, "no active task exists, so 'המשימה עכשיו' must show nothing");
  assert.equal(sections.overdue[0]?.task.id, "workout");
});

test("requirement 3: the earliest-timed upcoming task is singled out as nextTask, distinct from and never duplicated in laterToday, even when an overdue task exists (overdue never qualifies as 'next')", () => {
  const laterTask = task({ id: "later", scheduledDate: TODAY, scheduledTime: "20:00" });
  const overdueTask = task({ id: "overdue", scheduledDate: TODAY, scheduledTime: "07:00" });
  const sections = buildTodaySections([laterTask, overdueTask], [], NOW);
  assert.equal(sections.current, null, "nothing is active");
  assert.equal(sections.nextTask?.task.id, "later", "the overdue task's time has already passed, so it can never be 'the next' task");
  assert.deepEqual(sections.overdue.map((e) => e.task.id), ["overdue"]);
  assert.deepEqual(sections.laterToday, [], "the sole upcoming task is singled out as nextTask, not duplicated in laterToday");
});

test("laterToday and overdue sort chronologically, time-less tasks sort last, and the earliest-timed upcoming task becomes nextTask (never 'current', since nothing is active)", () => {
  const noon = task({ id: "noon", scheduledDate: TODAY, scheduledTime: "12:30" });
  const evening = task({ id: "evening", scheduledDate: TODAY, scheduledTime: "21:00" });
  const noTime = task({ id: "no-time", scheduledDate: TODAY, scheduledTime: null });
  const sections = buildTodaySections([evening, noTime, noon], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.nextTask?.task.id, "noon");
  assert.deepEqual(sections.laterToday.map((e) => e.task.id), ["evening", "no-time"]);
});

test("an archived task never appears on today's screen, even if it would otherwise be overdue", () => {
  const archived = archiveTask(task({ scheduledDate: YESTERDAY }), NOW.toISOString());
  const sections = buildTodaySections([archived], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.nextTask, null);
  assert.deepEqual(sections.overdue, []);
});

test("a recurring task not scheduled on today's weekday never appears", () => {
  const notToday = task({ recurrence: { kind: "recurring", daysOfWeek: [2] } }); // Tuesday only; NOW is Monday
  const sections = buildTodaySections([notToday], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.nextTask, null);
  assert.deepEqual(sections.overdue, []);
  assert.deepEqual(sections.laterToday, []);
});

test("a recurring task scheduled today, past time, never started, behaves like a one-time task -- overdue, never current", () => {
  const recurring = task({ recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" }); // Monday, past time
  const sections = buildTodaySections([recurring], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.overdue[0]?.task.id, recurring.id);
});

// Day-transition / recurring-task safety: an ACTIVE recurring task must
// never disappear from Today just because its own recurrence calendar no
// longer names today's weekday (e.g. it was started before midnight and
// is still running after midnight rolled into a day it isn't scheduled
// for). Requirement 1 ("started and still active") always wins.
test("an ACTIVE recurring task still shows as current even on a day its own recurrence calendar does not name (crossing midnight while still running)", () => {
  const recurring = startTask(task({ recurrence: { kind: "recurring", daysOfWeek: [2] } }), NOW.toISOString()); // Tuesday only; NOW is Monday
  const sections = buildTodaySections([recurring], [], NOW);
  assert.equal(sections.current?.task.id, recurring.id, "an active task must never vanish from Today, even if today isn't one of its scheduled weekdays");
});

test("a recurring task whose TODAY occurrence is already completed is completedToday, never overdue or current", () => {
  const recurring = task({ id: "rec", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" });
  const completions: TaskOccurrenceCompletion[] = [{ taskId: "rec", occurrenceDateLocal: TODAY, completedAt: NOW.toISOString() }];
  const sections = buildTodaySections([recurring], completions, NOW);
  assert.equal(sections.completedToday.length, 1);
  assert.equal(sections.completedToday[0].task.id, "rec");
  assert.equal(sections.current, null);
  assert.deepEqual(sections.overdue, []);
});

test("completing a recurring task's occurrence never marks a DIFFERENT day's occurrence complete (it reappears, overdue, today -- never current without being started)", () => {
  const recurring = task({ id: "rec", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" });
  const completions: TaskOccurrenceCompletion[] = [{ taskId: "rec", occurrenceDateLocal: YESTERDAY, completedAt: "irrelevant" }];
  const sections = buildTodaySections([recurring], completions, NOW);
  assert.equal(sections.current, null, "yesterday's completion must not suppress today's occurrence, but it also must not be shown as current without being started");
  assert.equal(sections.overdue[0]?.task.id, "rec", "today's occurrence must still appear, as overdue");
});

test("a postponed task with no returnAt is unscheduled -- the spec's explicit 'move to unscheduled' outcome", () => {
  const postponed = postponeTask(task(), "practical", null, NOW.toISOString());
  const sections = buildTodaySections([postponed], [], NOW);
  assert.equal(sections.unscheduled.length, 1);
});

test("a postponed task with a past returnAt today is overdue (a return reminder due now, not yet started) -- never current", () => {
  const postponed = postponeTask(task(), "practical", new Date(2026, 0, 5, 9, 0).toISOString(), NOW.toISOString());
  const sections = buildTodaySections([postponed], [], NOW);
  assert.equal(sections.current, null);
  assert.equal(sections.overdue[0]?.task.id, postponed.id);
});

test("a postponed task returning on a future day never appears on today's screen", () => {
  const postponed = postponeTask(task(), "practical", new Date(2026, 0, 10, 9, 0).toISOString(), NOW.toISOString());
  const sections = buildTodaySections([postponed], [], NOW);
  assert.equal(sections.current, null);
  assert.deepEqual(sections.overdue, []);
  assert.deepEqual(sections.unscheduled, []);
});

test("unscheduled tasks sort oldest-created first (stable FIFO), and are never silently dropped", () => {
  const second = task({ id: "second", scheduledDate: null, createdAt: "2026-01-02T00:00:00.000Z" });
  const first = task({ id: "first", scheduledDate: null, createdAt: "2026-01-01T00:00:00.000Z" });
  const sections = buildTodaySections([second, first], [], NOW);
  assert.deepEqual(sections.unscheduled.map((e) => e.task.id), ["first", "second"]);
});

test("completedToday sorts most-recently-completed first", () => {
  const earlier = completeTask(task({ id: "earlier" }), new Date(2026, 0, 5, 8, 0).toISOString());
  const later = completeTask(task({ id: "later" }), new Date(2026, 0, 5, 11, 0).toISOString());
  const sections = buildTodaySections([earlier, later], [], NOW);
  assert.deepEqual(sections.completedToday.map((e) => e.task.id), ["later", "earlier"]);
});

// Requirement 5 (skipped tasks): "Skip Task" (live/ActiveTaskScreen.tsx's
// handleSkipTask) deliberately never changes Task.status -- see
// live/taskLiveNavigation.test.ts for that contract. From this module's
// own point of view, a "skipped" task is simply a task whose status was
// never touched: it must keep showing up in its natural bucket (overdue
// if its time passed), and must NEVER be mistaken for completed.
test("requirement 5: a 'skipped' task (status left untouched, no completion recorded) stays overdue -- never completedToday, never silently dropped", () => {
  const skipped = task({ id: "skipped-one", scheduledDate: TODAY, scheduledTime: "07:00" });
  const sections = buildTodaySections([skipped], [], NOW);
  assert.equal(sections.overdue[0]?.task.id, "skipped-one");
  assert.deepEqual(sections.completedToday, []);
});

// Requirement: "status persistence after reopening the app" -- classification depends only on the Task's own persisted fields, so a round-trip through JSON (simulating an AsyncStorage reload) must classify identically.
test("classification is a pure function of the task's own persisted fields -- a JSON round-trip (simulating a reload from storage) classifies identically", () => {
  const original = startTask(task({ id: "reload-me", scheduledDate: TODAY, scheduledTime: "06:30" }), NOW.toISOString());
  const reloaded = JSON.parse(JSON.stringify(original)) as Task;
  const sections = buildTodaySections([reloaded], [], NOW);
  assert.equal(sections.current?.task.id, "reload-me");
});

// ARC-system upgrade task, Part J: resolveNextTaskEntry -- the single
// "what's next" calculation shared by "Next Task", "Skip Task", and the
// post-completion auto-advance. This is a NAVIGATION concept (what to
// jump to), deliberately distinct from Today's own display sections --
// it still falls back to the nearest overdue task when nothing is
// active, via resolveMostUrgentEntry, exactly as before this fix.
test("resolveNextTaskEntry finds the next-due task excluding the given one, even while the excluded task is still 'active' (falls back to the nearest overdue task)", () => {
  const current = startTask(task({ id: "current", scheduledDate: TODAY, scheduledTime: "08:00" }), NOW.toISOString());
  const next = task({ id: "next", scheduledDate: TODAY, scheduledTime: "09:00" });
  const entry = resolveNextTaskEntry([current, next], [], "current", NOW);
  assert.equal(entry?.task.id, "next");
});

test("resolveNextTaskEntry returns null when nothing else is eligible today", () => {
  const current = task({ id: "current", scheduledDate: TODAY, scheduledTime: "08:00" });
  const entry = resolveNextTaskEntry([current], [], "current", NOW);
  assert.equal(entry, null);
});

test("resolveNextTaskEntry picks the earliest-due (most urgent, i.e. overdue-first) task among several remaining ones, not just list order", () => {
  const current = task({ id: "current", scheduledDate: TODAY, scheduledTime: "08:00" });
  const later = task({ id: "later", scheduledDate: TODAY, scheduledTime: "18:00" });
  const sooner = task({ id: "sooner", scheduledDate: TODAY, scheduledTime: "09:00" });
  const entry = resolveNextTaskEntry([current, later, sooner], [], "current", NOW);
  assert.equal(entry?.task.id, "sooner");
});

test("resolveMostUrgentEntry: current wins over overdue and nextTask when something is actually active", () => {
  const active = startTask(task({ id: "active", scheduledDate: TODAY, scheduledTime: "20:00" }), NOW.toISOString());
  const overdueTask = task({ id: "overdue", scheduledDate: TODAY, scheduledTime: "07:00" });
  const sections = buildTodaySections([active, overdueTask], [], NOW);
  assert.equal(resolveMostUrgentEntry(sections)?.task.id, "active");
});

test("resolveMostUrgentEntry: falls back to the earliest overdue task, then to nextTask, when nothing is active", () => {
  const overdueTask = task({ id: "overdue", scheduledDate: TODAY, scheduledTime: "07:00" });
  const sections = buildTodaySections([overdueTask], [], NOW);
  assert.equal(resolveMostUrgentEntry(sections)?.task.id, "overdue");

  const upcomingOnly = buildTodaySections([task({ id: "upcoming", scheduledDate: TODAY, scheduledTime: "20:00" })], [], NOW);
  assert.equal(resolveMostUrgentEntry(upcomingOnly)?.task.id, "upcoming");
});

// ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן"), Part 2:
// resolveArcWindowClockTime -- the window's own clock moment, never
// auto-derived for a task that never set arcWindowMinutesBefore.

test("resolveArcWindowClockTime is null when no window was ever set, even for a fully-scheduled task", () => {
  const t = task({ scheduledDate: TODAY, scheduledTime: "09:00" });
  assert.equal(resolveArcWindowClockTime(t, TODAY), null);
});

test("resolveArcWindowClockTime is exactly arcWindowMinutesBefore earlier than the task's own clock time", () => {
  const t = task({ scheduledDate: TODAY, scheduledTime: "09:00", arcWindowMinutesBefore: 5 });
  const windowClock = resolveArcWindowClockTime(t, TODAY);
  assert.equal(windowClock?.getHours(), 8);
  assert.equal(windowClock?.getMinutes(), 55);
});

test("resolveArcWindowClockTime is null when the task itself has no resolvable clock time, even if a window is set", () => {
  const t = task({ arcWindowMinutesBefore: 5 });
  assert.equal(resolveArcWindowClockTime(t, TODAY), null);
});

// --- ARCHI -- Unified Development Specification task, Part 8 ("LINK INSIGHTS TO EXISTING TASKS") ---

test("listTasksScheduledThisWeek includes a one-time task scheduled later this week, and excludes one scheduled next week or with no scheduledDate at all", () => {
  const thisWeek = task({ scheduledDate: "2026-01-08" }); // Thursday, 3 days after TODAY (Monday)
  const nextWeek = task({ scheduledDate: "2026-01-13" }); // the following Tuesday -- outside the 7-day window
  const unscheduled = task({ scheduledDate: null });
  const result = listTasksScheduledThisWeek([thisWeek, nextWeek, unscheduled], [], NOW);
  assert.deepEqual(result.map((entry) => entry.task.id), [thisWeek.id]);
  assert.equal(result[0].occurrenceDateLocal, "2026-01-08");
});

test("listTasksScheduledThisWeek de-duplicates a recurring task down to its FIRST qualifying occurrence this week -- never listed twice even though it recurs on multiple days within the window", () => {
  const recurring = task({ recurrence: { kind: "recurring", daysOfWeek: [1, 3] } }); // Monday (today) and Wednesday
  const result = listTasksScheduledThisWeek([recurring], [], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].occurrenceDateLocal, TODAY, "the first (earliest) qualifying occurrence this week is today itself");
});

test("listTasksScheduledThisWeek reuses buildTodaySections's own recurrence resolution -- a recurring task with no matching weekday this week is correctly excluded", () => {
  const neverThisWeek = task({ recurrence: { kind: "recurring", daysOfWeek: [] } });
  const result = listTasksScheduledThisWeek([neverThisWeek], [], NOW);
  assert.deepEqual(result, []);
});

// --- Flexible Daily / Fixed Weekly sync fix: a weekly-origin task removed for TODAY's date alone must never resurface via buildTodaySections/resolveNextTaskEntry (bug report) ---

test("1. removing a weekly-origin task's occurrence for today excludes it from EVERY section, and the next-task mechanism moves on to the next real task -- never the removed one, never back to the Fixed Weekly template", () => {
  const removedTask = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" }); // Monday, overdue by clock
  const stillThere = task({ id: "still-there", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "18:00" });
  const overrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removedTask, TODAY, [], "2026-01-01T00:00:00.000Z")];

  const sections = buildTodaySections([removedTask, stillThere], [], NOW, overrides);
  assert.equal(sections.overdue.length, 0, "the removed task must not appear in overdue");
  assert.equal(sections.nextTask?.task.id, "still-there");

  const next = resolveNextTaskEntry([removedTask, stillThere], [], "some-other-active-task", NOW, overrides);
  assert.equal(next?.task.id, "still-there", "the next-task mechanism must skip the removed occurrence and pick the next REAL task on today's own list");
});

test("2. removing SEVERAL weekly-origin occurrences for today preserves the correct new sequence among whatever remains", () => {
  const removed1 = task({ id: "r1", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  const removed2 = task({ id: "r2", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "10:00" });
  const kept = task({ id: "kept", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "11:00" });
  const now = "2026-01-01T00:00:00.000Z";
  const overrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removed1, TODAY, [], now), markTaskOccurrenceRemoved(removed2, TODAY, [], now)];

  const sections = buildTodaySections([removed1, removed2, kept], [], NOW, overrides);
  const allShown = [...sections.overdue, ...(sections.nextTask ? [sections.nextTask] : []), ...sections.laterToday].map((entry) => entry.task.id);
  assert.deepEqual(allShown, ["kept"], "only the never-removed task remains on today's own sequence");
});

test("3. reordering a weekly-origin task for today (an override's own effective `order`) is reflected immediately in today's sort -- never only on the Flexible Daily Routine's own separate screen", () => {
  const taskA = task({ id: "a", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "14:00" });
  const taskB = task({ id: "b", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "15:00" });
  // Without any override, A (earlier clock time) would naturally sort before B.
  const naturalOrder = buildTodaySections([taskA, taskB], [], NOW, []);
  assert.deepEqual([naturalOrder.nextTask?.task.id, naturalOrder.laterToday[0]?.task.id], ["a", "b"]);

  // An explicit reorder-for-today override flips B ahead of A via effective `order`, the SAME mechanism arc/dailyPlan.ts's own reordering already writes.
  const now = "2026-01-01T00:00:00.000Z";
  const overrides: TaskOccurrenceOverride[] = [
    buildTaskOccurrenceOverride(taskB, TODAY, null, { order: 0 }, now),
    buildTaskOccurrenceOverride(taskA, TODAY, null, { order: 1 }, now),
  ];
  const reordered = buildTodaySections([taskA, taskB], [], NOW, overrides);
  assert.deepEqual([reordered.nextTask?.task.id, reordered.laterToday[0]?.task.id], ["b", "a"], "the manually reordered sequence must win over raw clock time");
});

test("4. adding a new task mid-day (a one-time task scheduled for today) enters the sequence at its own clock position, alongside any weekly-origin removals already in effect", () => {
  const removedWeekly = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  const addedMidDay = task({ id: "added", scheduledDate: TODAY, scheduledTime: "14:00" });
  const overrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removedWeekly, TODAY, [], "2026-01-01T00:00:00.000Z")];

  const sections = buildTodaySections([removedWeekly, addedMidDay], [], NOW, overrides);
  assert.equal(sections.nextTask?.task.id, "added", "the newly added task takes its place in the sequence, and the removed weekly task never resurfaces alongside it");
});

test("5. closing and reopening the app (a fresh buildTodaySections call reading the SAME persisted overrides) never restores a removed occurrence", () => {
  const removedTask = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  const persistedOverrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removedTask, TODAY, [], "2026-01-01T00:00:00.000Z")];

  // Simulates two independent "cold reads" of the exact same persisted override list -- e.g. app close/reopen, or a second screen's own reload().
  const firstRead = buildTodaySections([removedTask], [], NOW, persistedOverrides);
  const secondRead = buildTodaySections([removedTask], [], NOW, persistedOverrides);
  assert.equal(firstRead.nextTask, null);
  assert.equal(secondRead.nextTask, null, "the removal must stay excluded on every subsequent read, never silently reappearing");
});

test("6. switching between the Fixed Weekly Routine screen's own resolveDailyPlan and Today's own buildTodaySections: both agree on the exact same removed/kept set for the identical overrides", () => {
  const removedTask = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  const keptTask = task({ id: "kept", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "10:00" });
  const overrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removedTask, TODAY, [], "2026-01-01T00:00:00.000Z")];

  const dailyPlanIds = resolveDailyPlan([removedTask, keptTask], overrides, [], TODAY, new Date(`${TODAY}T00:00:00`)).map((entry) => entry.task.id);
  const todaySections = buildTodaySections([removedTask, keptTask], [], NOW, overrides);
  const todayIds = [...todaySections.overdue, ...(todaySections.nextTask ? [todaySections.nextTask] : []), ...todaySections.laterToday].map((entry) => entry.task.id);

  assert.deepEqual(dailyPlanIds, ["kept"]);
  assert.deepEqual(todayIds, ["kept"], "the Flexible Daily Routine screen and Today's own next-task mechanism must never disagree about which occurrences exist for this date");
});

test("7. a removed occurrence is excluded from the SAME pool timer/alarm-triggering navigation (resolveNextTaskEntry) reads -- never leaving a stale next-task pointing at a cancelled occurrence", () => {
  const removedTask = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" });
  const realNext = task({ id: "real-next", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  const overrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removedTask, TODAY, [], "2026-01-01T00:00:00.000Z")];

  const next = resolveNextTaskEntry([removedTask, realNext], [], "currently-active-task-id", NOW, overrides);
  assert.equal(next?.task.id, "real-next");
});

test("8. an explicit week reset (resetWeekOccurrenceOverrides) -- and ONLY that explicit action -- restores a removed occurrence back to the Fixed Weekly template, without duplicating it", () => {
  const removedTask = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  let overrides: TaskOccurrenceOverride[] = [markTaskOccurrenceRemoved(removedTask, TODAY, [], "2026-01-01T00:00:00.000Z")];

  const beforeReset = buildTodaySections([removedTask], [], NOW, overrides);
  assert.equal(beforeReset.nextTask, null, "still removed before any explicit reset action");

  overrides = resetWeekOccurrenceOverrides(overrides, TODAY); // TODAY (Monday) is this week's own start date
  const afterReset = buildTodaySections([removedTask], [], NOW, overrides);
  assert.equal(afterReset.overdue[0]?.task.id, "removed", "the explicit week reset restores the template occurrence (09:00 is overdue by NOW=12:00)");
  assert.equal(afterReset.overdue.length + (afterReset.nextTask ? 1 : 0) + afterReset.laterToday.length, 1, "restored exactly once -- never duplicated");
});

test("a non-removed override's effective scheduledTime is also used for today's own clock-bucket classification (overdue vs. laterToday), not just the raw template time", () => {
  const retimed = task({ id: "retimed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" }); // template says 08:00 -- overdue by NOW (12:00)
  const overrides: TaskOccurrenceOverride[] = [buildTaskOccurrenceOverride(retimed, TODAY, null, { scheduledTime: "18:00" }, "2026-01-01T00:00:00.000Z")];
  const sections = buildTodaySections([retimed], [], NOW, overrides);
  assert.equal(sections.overdue.length, 0, "the effective (overridden) time is 18:00, still ahead of NOW -- must not be misclassified as overdue");
  assert.equal(sections.nextTask?.task.id, "retimed");
});

test("buildTodaySections/resolveNextTaskEntry/listTasksScheduledThisWeek all default `overrides` to [] -- a caller that hasn't been updated degrades to the old template-only behavior rather than crashing", () => {
  const removedTask = task({ id: "removed", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00" });
  const sections = buildTodaySections([removedTask], [], NOW); // no overrides argument at all
  assert.equal(sections.overdue[0]?.task.id, "removed");
  assert.equal(resolveNextTaskEntry([removedTask], [], "x", NOW)?.task.id, "removed");
});

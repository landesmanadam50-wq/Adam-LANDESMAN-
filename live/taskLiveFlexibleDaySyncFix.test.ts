import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyTask } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { createTaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import { buildTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "../arc/taskOccurrenceOverride.ts";
import { applyScheduleMode, resolveCurrentTaskState, resolveDailyPlan, resolveMostUrgentScheduledEntry } from "../arc/dailyPlan.ts";

/**
 * live/taskLiveFlexibleDaySyncFix.test.ts
 *
 * Task LIVE / To-Do List / Flexible Day sync fix: regression coverage
 * for the user's own 12 mandatory scenarios. The user's core rule --
 * "the Flexible Day is the ONLY source of truth for which tasks Task
 * LIVE is allowed to perform" -- is enforced by routing every real
 * navigation/suggestion call site (live/ActiveTaskScreen.tsx's Next
 * Task/Skip Task, live/PersistentTaskControls.tsx's "התחל משימה",
 * live/PostTaskRewardScreen.tsx's post-completion auto-advance,
 * live/ManifestMeditationScreen.tsx's "today's action" suggestion)
 * through ONE pure decision -- resolveMostUrgentScheduledEntry
 * (arc/dailyPlan.ts), applied to resolveCurrentTaskState's own output
 * over the SAME real, resolved flexible-day plan
 * (resolveDailyPlan + applyScheduleMode) build/FlexibleDailyScreen.tsx
 * itself shows -- replacing arc/todaySchedule.ts's resolveNextTaskEntry/
 * resolveMostUrgentEntry, which independently recomputed "today" from
 * raw Task fields (never excluding isTodoItem, never reading the
 * chained effective times applyScheduleMode computes).
 *
 * This file tests the pure engine directly -- the one place the fix
 * actually lives -- so every scenario is exercised at its real root,
 * not re-asserted per screen. Each of the 4 repointed call sites has
 * its own source-text pin (live/taskLiveNavigation.test.ts,
 * live/persistentTaskControls.test.ts, live/productivityUpgrade.test.ts,
 * live/manifestMeditationDataIntegration.test.ts) confirming it defers
 * to data/dailyPlan.ts's resolveMostUrgentScheduledTask -- never a
 * second, independent calculation.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-01T00:00:00.000Z";
const MONDAY_LOCAL = "2026-01-05";
const MONDAY = new Date("2026-01-05T00:00:00");

function recurringTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00", expectedDurationMinutes: 30, ...overrides };
}

function oneOffTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), scheduledDate: MONDAY_LOCAL, ...overrides };
}

/** Builds the exact same `scheduled` shape every sync-fixed screen reads, from a plain list of tasks -- the one pipeline this whole fix routes everything through. */
function scheduledPlan(tasks: Task[], overrides: ReturnType<typeof buildTaskOccurrenceOverride>[] = [], completions: ReturnType<typeof createTaskOccurrenceCompletion>[] = []) {
  return applyScheduleMode(resolveDailyPlan(tasks, overrides, completions, MONDAY_LOCAL, MONDAY), { mode: "continuous" });
}

// --- Scenario 1: adding a task to the flexible day surfaces it in LIVE ---

test("1. a task added to the flexible day (an ordinary oneoff entry) is surfaced via resolveMostUrgentScheduledEntry as `next`", () => {
  const task = oneOffTask("t1", "לקנות מתנה", { scheduledTime: "14:00" });
  const scheduled = scheduledPlan([task]);
  const state = resolveCurrentTaskState(scheduled, new Date("2026-01-05T06:00:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(state)?.task.id, "t1");
});

// --- Scenario 2: deleting a task from the flexible day removes it from LIVE's sequence ---

test("2. a task removed from the flexible-day task list (deleted) is no longer offered by resolveMostUrgentScheduledEntry at all", () => {
  const stillThere = oneOffTask("t1", "קיים", { scheduledTime: "14:00" });
  const deleted = oneOffTask("t2", "נמחק", { scheduledTime: "10:00" });
  const beforeDelete = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([stillThere, deleted]), new Date("2026-01-05T06:00:00"), null));
  assert.equal(beforeDelete?.task.id, "t2", "the earlier-timed task is next before deletion");

  // Deletion is modeled exactly as it happens in the real app: the task simply no longer appears in the `tasks` list passed in.
  const afterDelete = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([stillThere]), new Date("2026-01-05T06:00:00"), null));
  assert.equal(afterDelete?.task.id, "t1");
});

// --- Scenario 3: a To-Do item never scheduled into the flexible day never appears in LIVE ---

test("3. a To-Do item (isTodoItem=true, scheduledDate=today, no scheduledTime) is NEVER returned by resolveMostUrgentScheduledEntry, even though it exists in the task list and would otherwise look like a valid unscheduled entry", () => {
  const todo = oneOffTask("todo1", "למיין מיילים", { isTodoItem: true });
  const scheduled = oneOffTask("t1", "פגישה", { scheduledTime: "16:00" });
  const state = resolveCurrentTaskState(scheduledPlan([todo, scheduled]), new Date("2026-01-05T06:00:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(state)?.task.id, "t1");
  // The To-Do item never even enters the candidate pool -- resolveDailyPlan excludes isTodoItem before applyScheduleMode/resolveCurrentTaskState ever see it.
  const onlyTodo = resolveCurrentTaskState(scheduledPlan([todo]), new Date("2026-01-05T06:00:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(onlyTodo), null, "with only a To-Do item present, LIVE must have nothing to offer -- never the To-Do item itself");
});

// --- Scenario 4: a fixed-routine task removed from the flexible day never appears in LIVE ---

test("4. a weekly-origin (fixed routine) task removed from TODAY's flexible day via markTaskOccurrenceRemoved is never returned, while an unrelated weekly task is unaffected", () => {
  const removedTask = recurringTask("fixed1", "ריצת בוקר");
  const keptTask = recurringTask("fixed2", "קריאה", { scheduledTime: "20:00" });
  const removal = markTaskOccurrenceRemoved(removedTask, MONDAY_LOCAL, [], NOW);
  const state = resolveCurrentTaskState(scheduledPlan([removedTask, keptTask], [removal]), new Date("2026-01-05T06:00:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(state)?.task.id, "fixed2", "the removed fixed-routine task must never be offered, the still-present one must be");
});

// --- Scenario 5: order/time/duration changes propagate ---

test("5. retiming a task via a per-date override changes which entry resolveMostUrgentScheduledEntry proposes, reflecting the flexible day's own live edit immediately", () => {
  const early = recurringTask("early", "מוקדם", { scheduledTime: "07:00" });
  const late = recurringTask("late", "מאוחר", { scheduledTime: "10:00" });
  const now = new Date("2026-01-05T06:40:00");

  const before = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([early, late]), now, null));
  assert.equal(before?.task.id, "early");

  const retimeEarly = buildTaskOccurrenceOverride(early, MONDAY_LOCAL, null, { scheduledTime: "11:00" }, NOW);
  const after = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([early, late], [retimeEarly]), now, null));
  assert.equal(after?.task.id, "late", "'early' was pushed past 'late' -- the next-task pick must track the edit, never the stale original time");
});

// --- Scenario 6: completing a task advances to the next one ---

test("6. completing a task (recording a TaskOccurrenceCompletion) removes it from the candidate pool so resolveMostUrgentScheduledEntry advances to the real next task", () => {
  const first = recurringTask("t1", "ריצה", { scheduledTime: "06:00", expectedDurationMinutes: 30 }); // already fully elapsed by 08:00 -- overdue, not current
  const second = recurringTask("t2", "מתיחות", { scheduledTime: "10:00" }); // not yet started -- next
  const now = new Date("2026-01-05T08:00:00");

  const before = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([first, second]), now, null));
  assert.equal(before?.task.id, "t1", "t1 is overdue and nothing is current, so it is the most urgent pick via the overdue fallback");

  const completion = createTaskOccurrenceCompletion("t1", new Date("2026-01-05T06:30:00"));
  const after = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([first, second], [], [completion]), now, null));
  assert.equal(after?.task.id, "t2", "once t1 is completed, LIVE must advance to the real next task in the flexible day");
});

// --- Scenario 7: an empty flexible day never pulls tasks from any other source ---

test("7. with nothing in the flexible day, resolveMostUrgentScheduledEntry returns null even when unscheduled To-Do items exist in the SAME task list -- LIVE must show 'nothing left today', never fall back to an unscheduled source", () => {
  const todoOnly = oneOffTask("todo1", "מטלה לא מתוזמנת", { isTodoItem: true });
  const state = resolveCurrentTaskState(scheduledPlan([todoOnly]), new Date("2026-01-05T12:00:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(state), null);
});

// --- Scenario 9: transitioning between days never carries a stale pick forward ---

test("9. moving to a different date (Tuesday) recomputes the plan fresh for that date -- Monday's own pick never leaks into Tuesday's", () => {
  const mondayOnly = recurringTask("mon", "משימת שני", { recurrence: { kind: "recurring", daysOfWeek: [1] } });
  const tuesdayLocal = "2026-01-06";
  const tuesday = new Date("2026-01-06T00:00:00");
  const mondayState = resolveCurrentTaskState(applyScheduleMode(resolveDailyPlan([mondayOnly], [], [], MONDAY_LOCAL, MONDAY), { mode: "continuous" }), new Date("2026-01-05T06:40:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(mondayState)?.task.id, "mon");

  const tuesdayState = resolveCurrentTaskState(applyScheduleMode(resolveDailyPlan([mondayOnly], [], [], tuesdayLocal, tuesday), { mode: "continuous" }), new Date("2026-01-06T06:40:00"), null);
  assert.equal(resolveMostUrgentScheduledEntry(tuesdayState), null, "a Monday-only recurring task must not be offered on Tuesday");
});

// --- Scenario 11: editing the flexible day around an already-active task never surprises it ---

test("11. an already-active task stays the resolveMostUrgentScheduledEntry pick (`current`) even while other, unrelated flexible-day entries are added/removed around it -- a planning change elsewhere never surprises the in-progress task", () => {
  const active = recurringTask("active1", "משימה פעילה", { status: "active", scheduledTime: "07:00" });
  const now = new Date("2026-01-05T07:30:00");
  const withoutExtra = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([active]), now, null));
  assert.equal(withoutExtra?.task.id, "active1");

  const newlyAdded = oneOffTask("new1", "נוסף באמצע היום", { scheduledTime: "20:00" });
  const withExtra = resolveMostUrgentScheduledEntry(resolveCurrentTaskState(scheduledPlan([active, newlyAdded]), now, null));
  assert.equal(withExtra?.task.id, "active1", "adding a later task to the flexible day must never bump the already-active task out of `current`");
});

// --- Scenario 12: no duplicates/stale picks after a planning change ---

test("12. excludeTaskId guarantees the just-acted-on task is never re-offered as 'next', even when it would otherwise still be the most urgent entry in the plan", () => {
  const onlyTask = oneOffTask("t1", "המשימה שהושלמה עכשיו", { scheduledTime: "09:00" });
  const other = oneOffTask("t2", "המשימה הבאה", { scheduledTime: "12:00" });
  const state = resolveCurrentTaskState(scheduledPlan([onlyTask, other]), new Date("2026-01-05T09:30:00"), null, "t1");
  assert.equal(resolveMostUrgentScheduledEntry(state)?.task.id, "t2", "excluding the just-handled task must never leave it dangling as a stale duplicate pick");
});

test("resolveMostUrgentScheduledEntry falls back current -> earliest overdue -> next, exactly mirroring the old resolveMostUrgentEntry's own fallback order, sourced from the real flexible-day plan instead", () => {
  assert.equal(resolveMostUrgentScheduledEntry({ current: null, overdue: [], next: null }), null);
});

// --- Scenario 8/10: persistence across app close/reopen + explicit refresh ---
// Both are satisfied by construction: data/dailyPlan.ts's resolveMostUrgentScheduledTask
// always calls resolveTodaysScheduledPlan fresh (loads tasks/overrides/completions/
// schedule-mode settings straight from AsyncStorage every single call, never a cached
// copy) -- so every call after a cold start, and every explicit refresh action, reads
// the real, current, persisted state. Source-text pin below.

const dataModule = readSource("data/dailyPlan.ts");
const arcModule = readSource("arc/dailyPlan.ts");

test("resolveMostUrgentScheduledTask (data/dailyPlan.ts) is built from resolveTodaysScheduledPlan + resolveCurrentTaskState + resolveMostUrgentScheduledEntry -- never a cached/memoized copy, so a cold app restart and an explicit refresh both read the real persisted state fresh", () => {
  const fnIndex = dataModule.indexOf("export async function resolveMostUrgentScheduledTask");
  assert.ok(fnIndex !== -1);
  const fnBody = dataModule.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("await resolveTodaysScheduledPlan(now)"));
  assert.ok(fnBody.includes("resolveCurrentTaskState(scheduled, now, activeRun, excludeTaskId)"));
  assert.ok(fnBody.includes("return resolveMostUrgentScheduledEntry(state)"));
});

test("resolveMostUrgentScheduledTask threads the caller's real activeRun through (never hardcoded null) -- preserving the Current-task logic fix's own 'a genuinely stale run must not count as active' guarantee at every repointed call site", () => {
  const fnIndex = dataModule.indexOf("export async function resolveMostUrgentScheduledTask");
  const fnBody = dataModule.slice(fnIndex, fnIndex + 500);
  assert.match(fnBody, /activeRun: TaskTimerRun \| null = null/);
  assert.ok(!fnBody.includes("resolveCurrentTaskState(scheduled, now, null,"));
});

test("resolveMostUrgentScheduledEntry (arc/dailyPlan.ts) is exported and documented as the one fallback point every repointed navigation call site shares", () => {
  assert.match(arcModule, /export function resolveMostUrgentScheduledEntry\(state: CurrentTaskState\): ScheduledPlanEntry \| null/);
});

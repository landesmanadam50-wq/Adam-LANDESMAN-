import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceDailyVisualizationProgress,
  buildDailyVisualizationSteps,
  buildImmediateActionTaskFields,
  buildReinforcementTaskFields,
  bypassDailyVisualizationProgress,
  createDailyVisualizationDailyProgress,
  createEmptyDailyVisualizationProfile,
  DAILY_VISUALIZATION_ALARM_MINUTES_BEFORE,
  detectLateStartConflicts,
  findBodyScanNote,
  isDailyVisualizationCompletedForToday,
  isDailyVisualizationDoneForToday,
  isVisualizationStartedLate,
  normalizeDailyVisualizationDailyProgress,
  normalizeDailyVisualizationProfile,
  resolveCurrentStep,
  resolveDailyVisualizationAlarmTime,
  resolveFirstTaskClockTimeToday,
  resolveResumableProgress,
  resolveTodaysVisualizationTasks,
  upsertBodyScanNote,
  type DailyVisualizationDailyProgress,
} from "./dailyVisualization.ts";
import { createEmptyTask, type Task } from "./tasks.ts";
import { createTaskActionStage } from "./taskStage.ts";

const NOW_ISO = "2026-11-10T08:00:00.000Z"; // a Tuesday

function makeTask(overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(`task-${Math.random()}`, "כותרת", "פעולה", NOW_ISO), ...overrides };
}

// --- buildDailyVisualizationSteps / resolveCurrentStep ---

test("buildDailyVisualizationSteps produces a single stageKind-'main' visualize/body_scan pair for each LEGACY (no configured stages) task, in order, followed by feeling/end_of_day_visualize/movement/reinforcement_action/final -- 'Task Visualization -> Quick Body Scan -> Next Task' repeated until all tasks are covered, preserving the pre-existing per-task behavior exactly and adding the Morning Flow Simplification task's own 2 new closing steps", () => {
  const steps = buildDailyVisualizationSteps(["t1", "t2"], [makeTask({ id: "t1" }), makeTask({ id: "t2" })]);
  assert.deepEqual(steps, [
    { kind: "task_stage_visualize", taskIndex: 0, stageKind: "main" },
    { kind: "task_body_scan", taskIndex: 0 },
    { kind: "task_stage_visualize", taskIndex: 1, stageKind: "main" },
    { kind: "task_body_scan", taskIndex: 1 },
    { kind: "feeling" },
    { kind: "end_of_day_visualize" },
    { kind: "movement" },
    { kind: "reinforcement_action" },
    { kind: "final" },
  ]);
});

test("buildDailyVisualizationSteps with zero tasks still ends with feeling/end_of_day_visualize/movement/reinforcement_action/final -- a day with nothing scheduled still gets the feeling-setting ritual", () => {
  assert.deepEqual(buildDailyVisualizationSteps([], []), [
    { kind: "feeling" },
    { kind: "end_of_day_visualize" },
    { kind: "movement" },
    { kind: "reinforcement_action" },
    { kind: "final" },
  ]);
});

test("Unified Task Stages task: a task with a configured trigger+small+main breakdown expands into trigger, trigger_cue, small, main visualize steps (in that fixed order) followed by exactly ONE body scan -- never a body scan between individual stages", () => {
  const staged = makeTask({
    id: "staged",
    actionStages: [
      createTaskActionStage("s-trigger", "trigger", "לוקח את הספר ומניח אותו על השולחן", 2, "הספר מונח על השולחן"),
      createTaskActionStage("s-small", "small", "פותח את הספר וקורא פסקה אחת", 3),
      createTaskActionStage("s-main", "main", "ממשיך לקרוא את הספר", 25),
    ],
  });
  const steps = buildDailyVisualizationSteps(["staged"], [staged]);
  assert.deepEqual(steps, [
    { kind: "task_stage_visualize", taskIndex: 0, stageKind: "trigger" },
    { kind: "task_stage_visualize", taskIndex: 0, stageKind: "trigger_cue" },
    { kind: "task_stage_visualize", taskIndex: 0, stageKind: "small" },
    { kind: "task_stage_visualize", taskIndex: 0, stageKind: "main" },
    { kind: "task_body_scan", taskIndex: 0 },
    { kind: "feeling" },
    { kind: "end_of_day_visualize" },
    { kind: "movement" },
    { kind: "reinforcement_action" },
    { kind: "final" },
  ]);
});

test("a task configured with ONLY a main action (no trigger, no small) still produces exactly one visualize step, stageKind 'main'", () => {
  const staged = makeTask({ id: "staged", actionStages: [createTaskActionStage("s-main", "main", "ממשיך לקרוא את הספר", 25)] });
  const steps = buildDailyVisualizationSteps(["staged"], [staged]);
  assert.deepEqual(
    steps.filter((step) => step.kind === "task_stage_visualize"),
    [{ kind: "task_stage_visualize", taskIndex: 0, stageKind: "main" }]
  );
});

test("buildDailyVisualizationSteps falls back to a single 'main' visualize step for a task index with no resolvable Task object (deleted mid-exercise) -- never crashes, never desyncs the step count from taskIds.length", () => {
  const steps = buildDailyVisualizationSteps(["deleted-task-id"], []);
  assert.deepEqual(steps.filter((step) => step.kind === "task_stage_visualize"), [{ kind: "task_stage_visualize", taskIndex: 0, stageKind: "main" }]);
});

test("resolveCurrentStep reads the step at stepIndex, clamped so a stale/out-of-range index can never read past the end", () => {
  const progress = createDailyVisualizationDailyProgress("2026-11-10", ["t1"], NOW_ISO, false);
  const tasks = [makeTask({ id: "t1" })];
  assert.deepEqual(resolveCurrentStep(progress, tasks), { kind: "task_stage_visualize", taskIndex: 0, stageKind: "main" });
  assert.deepEqual(resolveCurrentStep({ ...progress, stepIndex: 99 }, tasks), { kind: "final" });
});

// --- advance / bypass ---

test("advanceDailyVisualizationProgress steps forward one at a time, and marks the record completed (with completedAt set) only once the FINAL step itself is passed", () => {
  const tasks = [makeTask({ id: "t1" })];
  let progress = createDailyVisualizationDailyProgress("2026-11-10", ["t1"], NOW_ISO, false);
  // 7 steps total for one legacy task: visualize, body_scan, feeling,
  // end_of_day_visualize, movement, reinforcement_action, final.
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:01:00.000Z");
  assert.equal(progress.stepIndex, 1);
  assert.equal(progress.status, "in_progress");
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:02:00.000Z");
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:03:00.000Z");
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:04:00.000Z");
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:05:00.000Z");
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:06:00.000Z");
  assert.equal(progress.status, "in_progress", "still on 'final' itself -- not yet completed");
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:07:00.000Z");
  assert.equal(progress.status, "completed");
  assert.equal(progress.completedAt, "2026-11-10T08:07:00.000Z");
});

test("bypassDailyVisualizationProgress marks the record bypassed without touching taskIds/stepIndex -- an honest trace of how far the trainee actually got before skipping", () => {
  const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
  let progress = createDailyVisualizationDailyProgress("2026-11-10", ["t1", "t2"], NOW_ISO, false);
  progress = advanceDailyVisualizationProgress(progress, tasks, "2026-11-10T08:01:00.000Z");
  const bypassed = bypassDailyVisualizationProgress(progress, "2026-11-10T08:10:00.000Z");
  assert.equal(bypassed.status, "bypassed");
  assert.equal(bypassed.completedAt, "2026-11-10T08:10:00.000Z");
  assert.equal(bypassed.stepIndex, 1, "never resets/advances stepIndex just because of a bypass");
  assert.deepEqual(bypassed.taskIds, ["t1", "t2"]);
});

// --- Once-per-day completion ---

test("isDailyVisualizationDoneForToday is true only for TODAY's own record, and only once completed or bypassed -- a record still in_progress, or one from an earlier day, both count as 'not done yet'", () => {
  const completedToday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-10", [], NOW_ISO, false), status: "completed", completedAt: NOW_ISO };
  const bypassedToday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-10", [], NOW_ISO, false), status: "bypassed", completedAt: NOW_ISO };
  const inProgressToday = createDailyVisualizationDailyProgress("2026-11-10", ["t1"], NOW_ISO, false);
  const completedYesterday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-09", [], NOW_ISO, false), status: "completed", completedAt: NOW_ISO };

  assert.equal(isDailyVisualizationDoneForToday(completedToday, "2026-11-10"), true);
  assert.equal(isDailyVisualizationDoneForToday(bypassedToday, "2026-11-10"), true);
  assert.equal(isDailyVisualizationDoneForToday(inProgressToday, "2026-11-10"), false);
  assert.equal(isDailyVisualizationDoneForToday(completedYesterday, "2026-11-10"), false, "stale/earlier-day record is never treated as today's own");
  assert.equal(isDailyVisualizationDoneForToday(null, "2026-11-10"), false);
});

// Nine Functional Improvements task, Improvement 6: "skipping means 'not now', never 'completed' or 'never today.'"
test("isDailyVisualizationCompletedForToday is true ONLY for an actually completed TODAY record -- a bypassed-today record (merely skipped) is NOT 'completed', unlike isDailyVisualizationDoneForToday above which treats them the same", () => {
  const completedToday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-10", [], NOW_ISO, false), status: "completed", completedAt: NOW_ISO };
  const bypassedToday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-10", [], NOW_ISO, false), status: "bypassed", completedAt: NOW_ISO };
  const inProgressToday = createDailyVisualizationDailyProgress("2026-11-10", ["t1"], NOW_ISO, false);
  const completedYesterday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-09", [], NOW_ISO, false), status: "completed", completedAt: NOW_ISO };

  assert.equal(isDailyVisualizationCompletedForToday(completedToday, "2026-11-10"), true);
  assert.equal(isDailyVisualizationCompletedForToday(bypassedToday, "2026-11-10"), false, "merely skipped must never count as completed");
  assert.equal(isDailyVisualizationCompletedForToday(inProgressToday, "2026-11-10"), false);
  assert.equal(isDailyVisualizationCompletedForToday(completedYesterday, "2026-11-10"), false, "stale/earlier-day record is never treated as today's own");
  assert.equal(isDailyVisualizationCompletedForToday(null, "2026-11-10"), false);
});

// --- Interrupted-exercise resume ---

test("resolveResumableProgress resumes an in_progress record from TODAY specifically -- never a stale in_progress record left over from an earlier day (that day is over; a fresh exercise starts instead), and never a completed one", () => {
  const inProgressToday = createDailyVisualizationDailyProgress("2026-11-10", ["t1"], NOW_ISO, false);
  const inProgressYesterday = createDailyVisualizationDailyProgress("2026-11-09", ["t1"], NOW_ISO, false);
  const completedToday: DailyVisualizationDailyProgress = { ...createDailyVisualizationDailyProgress("2026-11-10", [], NOW_ISO, false), status: "completed", completedAt: NOW_ISO };

  assert.deepEqual(resolveResumableProgress(inProgressToday, "2026-11-10"), inProgressToday);
  assert.equal(resolveResumableProgress(inProgressYesterday, "2026-11-10"), null);
  assert.equal(resolveResumableProgress(completedToday, "2026-11-10"), null);
  assert.equal(resolveResumableProgress(null, "2026-11-10"), null);
});

// Nine Functional Improvements task, Improvement 6: "skipping means 'not now'" -- a bypassed-with-real-progress record resumes exactly where it was; a bypassed-before-ever-opening placeholder (empty taskIds) does not, so reopening later snapshots the ACTUAL current schedule instead of freezing into zero tasks.
test("resolveResumableProgress ALSO resumes a bypassed record from TODAY that has real progress (non-empty taskIds) -- the in-exercise skip button preserves stepIndex/taskIds exactly, so coming back later continues from the SAME point rather than restarting", () => {
  const bypassedMidExercise: DailyVisualizationDailyProgress = {
    ...createDailyVisualizationDailyProgress("2026-11-10", ["t1", "t2"], NOW_ISO, false),
    stepIndex: 3,
    status: "bypassed",
    completedAt: NOW_ISO,
  };
  assert.deepEqual(resolveResumableProgress(bypassedMidExercise, "2026-11-10"), bypassedMidExercise);
});

test("resolveResumableProgress does NOT resume a bypassed record with an empty taskIds placeholder (bypassDailyVisualizationForToday's own 'skipped before ever opening' record) -- reopening must snapshot today's real, current tasks fresh, never freeze into the empty snapshot that existed at skip time", () => {
  const bypassedBeforeOpening: DailyVisualizationDailyProgress = {
    ...createDailyVisualizationDailyProgress("2026-11-10", [], NOW_ISO, false),
    status: "bypassed",
    completedAt: NOW_ISO,
  };
  assert.equal(resolveResumableProgress(bypassedBeforeOpening, "2026-11-10"), null);
});

test("resolveResumableProgress never resumes a bypassed record from a stale, earlier day", () => {
  const bypassedYesterday: DailyVisualizationDailyProgress = {
    ...createDailyVisualizationDailyProgress("2026-11-09", ["t1"], NOW_ISO, false),
    status: "bypassed",
    completedAt: NOW_ISO,
  };
  assert.equal(resolveResumableProgress(bypassedYesterday, "2026-11-10"), null);
});

// --- Backward compatibility ---

test("normalizeDailyVisualizationProfile backfills missing fields to '' without crashing, for a record saved before this feature (or the reinforcement fields) existed", () => {
  const legacy = {} as unknown as Parameters<typeof normalizeDailyVisualizationProfile>[0];
  const normalized = normalizeDailyVisualizationProfile(legacy);
  assert.equal(normalized.desiredFeeling, "");
  assert.equal(normalized.bodyMovement, "");
  assert.equal(normalized.reinforcementAction, "");
  assert.equal(normalized.reinforcementTime, "");
  assert.equal(typeof normalized.updatedAt, "string");
});

test("createEmptyDailyVisualizationProfile starts every field blank", () => {
  const profile = createEmptyDailyVisualizationProfile(NOW_ISO);
  assert.equal(profile.desiredFeeling, "");
  assert.equal(profile.bodyMovement, "");
  assert.equal(profile.reinforcementAction, "");
  assert.equal(profile.reinforcementTime, "");
});

test("normalizeDailyVisualizationDailyProgress backfills missing fields without crashing", () => {
  const legacy = { dateLocal: "2026-11-10", startedAt: NOW_ISO } as unknown as DailyVisualizationDailyProgress;
  const normalized = normalizeDailyVisualizationDailyProgress(legacy);
  assert.deepEqual(normalized.taskIds, []);
  assert.equal(normalized.stepIndex, 0);
  assert.equal(normalized.status, "in_progress");
  assert.equal(normalized.completedAt, null);
  assert.equal(normalized.startedLate, false);
  assert.equal(normalized.reinforcementTaskId, null);
  assert.equal(normalized.immediateActionTaskId, null);
  assert.deepEqual(normalized.bodyScanNotes, []);
});

// --- Final Morning Flow Requirements Audit task, section 2: per-task body-scan notes ---

test("upsertBodyScanNote saves a trimmed note for a task, replacing (never duplicating) any existing note for that SAME task, and leaves other tasks' notes untouched", () => {
  let notes = upsertBodyScanNote([], "t1", "  כבדות בכתפיים  ");
  notes = upsertBodyScanNote(notes, "t2", "קלילות בבטן");
  assert.deepEqual(notes, [
    { taskId: "t1", note: "כבדות בכתפיים" },
    { taskId: "t2", note: "קלילות בבטן" },
  ]);
  notes = upsertBodyScanNote(notes, "t1", "לחץ בחזה");
  assert.deepEqual(notes, [
    { taskId: "t2", note: "קלילות בבטן" },
    { taskId: "t1", note: "לחץ בחזה" },
  ]);
});

test("upsertBodyScanNote with a blank note REMOVES that task's existing note entirely -- never saves an empty string", () => {
  const notes = upsertBodyScanNote([{ taskId: "t1", note: "משהו" }], "t1", "   ");
  assert.deepEqual(notes, []);
});

test("findBodyScanNote returns '' (never undefined) when no note was ever saved for a task, and the exact saved note otherwise -- different tasks/dates never share a note since each DailyVisualizationDailyProgress is already scoped to one date", () => {
  const notes = [{ taskId: "t1", note: "כבדות" }];
  assert.equal(findBodyScanNote(notes, "t1"), "כבדות");
  assert.equal(findBodyScanNote(notes, "t2"), "");
  assert.equal(findBodyScanNote([], "t1"), "");
});

// --- Final Morning Flow Requirements Audit task, section 3: the immediate priority action ---

test("buildImmediateActionTaskFields returns null when the action text is blank -- optional, never forced", () => {
  assert.equal(buildImmediateActionTaskFields("", "2026-11-10"), null);
  assert.equal(buildImmediateActionTaskFields("   ", "2026-11-10"), null);
});

test("buildImmediateActionTaskFields trims the action text and schedules it for today's own date, with no time field at all -- 'immediate' means right now, never a chosen later time (that is the SEPARATE end-of-day reinforcement action's own job)", () => {
  assert.deepEqual(buildImmediateActionTaskFields("  ישור הגב  ", "2026-11-10"), { title: "ישור הגב", scheduledDate: "2026-11-10" });
});

// --- Today's real, scheduled, relevant tasks, in chronological order ---

test("resolveTodaysVisualizationTasks orders today's own relevant tasks chronologically regardless of status bucket (overdue/current/laterToday), and excludes completed-today and unscheduled tasks", () => {
  const now = new Date(NOW_ISO); // 08:00
  const overdue = makeTask({ id: "overdue", scheduledDate: "2026-11-10", scheduledTime: "07:00" });
  const upcoming = makeTask({ id: "upcoming", scheduledDate: "2026-11-10", scheduledTime: "10:00" });
  const active = makeTask({ id: "active", scheduledDate: "2026-11-10", scheduledTime: "07:50", status: "active" });
  const completedToday = makeTask({ id: "completed", scheduledDate: "2026-11-10", scheduledTime: "06:00", status: "completed", completedAt: NOW_ISO });
  const unscheduled = makeTask({ id: "unscheduled", scheduledDate: null });

  const ordered = resolveTodaysVisualizationTasks([upcoming, completedToday, overdue, unscheduled, active], [], now);
  assert.deepEqual(ordered.map((task) => task.id), ["overdue", "active", "upcoming"]);
});

test("resolveFirstTaskClockTimeToday returns null when nothing is scheduled today, and the earliest resolvable time otherwise", () => {
  const now = new Date(NOW_ISO);
  assert.equal(resolveFirstTaskClockTimeToday([], [], now), null);

  const early = makeTask({ scheduledDate: "2026-11-10", scheduledTime: "07:00" });
  const later = makeTask({ scheduledDate: "2026-11-10", scheduledTime: "09:00" });
  const first = resolveFirstTaskClockTimeToday([later, early], [], now);
  assert.equal(first?.getHours(), 7);
});

// --- Alarm timing (30 minutes before the first task) ---

test("resolveDailyVisualizationAlarmTime is exactly 30 minutes before the given first-task time, and null when there is no first task", () => {
  assert.equal(DAILY_VISUALIZATION_ALARM_MINUTES_BEFORE, 30);
  const firstTask = new Date("2026-11-10T08:00:00.000Z");
  const alarmTime = resolveDailyVisualizationAlarmTime(firstTask);
  assert.equal(alarmTime?.toISOString(), "2026-11-10T07:30:00.000Z");
  assert.equal(resolveDailyVisualizationAlarmTime(null), null);
});

// --- Late start & scheduling conflicts ---

test("isVisualizationStartedLate is false within the grace threshold and true once meaningfully overdue, and always false when there was no alarm time to compare against", () => {
  const alarmAt = new Date("2026-11-10T07:30:00.000Z");
  assert.equal(isVisualizationStartedLate(alarmAt, new Date("2026-11-10T07:35:00.000Z")), false, "5 minutes late is within the grace threshold");
  assert.equal(isVisualizationStartedLate(alarmAt, new Date("2026-11-10T07:45:00.000Z")), true, "15 minutes late exceeds it");
  assert.equal(isVisualizationStartedLate(null, new Date("2026-11-10T09:00:00.000Z")), false);
});

test("detectLateStartConflicts flags only tasks whose OWN scheduled time has already passed by completion time -- never flags a task still ahead, and never flags anything just because the start was late with nothing yet passed", () => {
  const completedAt = new Date("2026-11-10T08:00:00.000Z");
  const alreadyPassed = makeTask({ id: "passed", scheduledDate: "2026-11-10", scheduledTime: "07:45" });
  const stillAhead = makeTask({ id: "ahead", scheduledDate: "2026-11-10", scheduledTime: "09:00" });

  assert.deepEqual(detectLateStartConflicts([alreadyPassed, stillAhead], completedAt).map((task) => task.id), ["passed"]);
  assert.deepEqual(detectLateStartConflicts([stillAhead], completedAt), [], "nothing passed yet -- no conflict even though the exercise itself may have started late");
});

// --- End-of-day reinforcement action (Morning Flow Simplification task, section 4 step 6) ---

test("buildReinforcementTaskFields returns null when the action text is blank -- optional, never forced, never scheduling an empty task", () => {
  assert.equal(buildReinforcementTaskFields("", "20:00", "2026-11-10"), null);
  assert.equal(buildReinforcementTaskFields("   ", "20:00", "2026-11-10"), null);
});

test("buildReinforcementTaskFields trims the action text, schedules it for today's own date, and treats a blank time as 'no time chosen' (null), never inventing a default time", () => {
  assert.deepEqual(buildReinforcementTaskFields("  לכתוב ביומן  ", "20:00", "2026-11-10"), { title: "לכתוב ביומן", scheduledDate: "2026-11-10", scheduledTime: "20:00" });
  assert.deepEqual(buildReinforcementTaskFields("לכתוב ביומן", "   ", "2026-11-10"), { title: "לכתוב ביומן", scheduledDate: "2026-11-10", scheduledTime: null });
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/dailyOverrideExecutionIntegration.test.ts
 *
 * Flexible Daily Routine / Task LIVE integration fix: source-text
 * regression guard proving today's EFFECTIVE occurrence (template +
 * any per-date override) is what Task LIVE actually executes against
 * -- never the Fixed Weekly Routine template's raw fields alone, and
 * never leaking back into the shared Task record.
 *
 * The alarm-side half of this same fix is covered directly, with real
 * numbers (09:00/60min template, 11:00/20min override -> alarm at
 * 11:00), by arc/taskScheduledStart.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

test("requirement 3: reload() merges today's effective occurrence (resolveEffectiveOccurrence) onto the loaded task, and `task` state is set from that merged result -- never the raw loaded task directly", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 4000);
  assert.ok(reloadBody.includes("loadTaskOccurrenceOverrides()"));
  assert.ok(reloadBody.includes("resolveEffectiveOccurrence(loadedTask, todayLocal, overrides)"));
  assert.ok(reloadBody.includes("setTask(effectiveTask);"));
  assert.ok(!reloadBody.includes("setTask(loadedTask);"), "the raw, un-merged task must never be the one set as screen state");
});

test("requirement 2/3: the merged effectiveTask carries the OVERRIDE's scheduledTime/expectedDurationMinutes/order (never the raw task's own), so performStart's duration calculation (task.expectedDurationMinutes) and every other reader of `task` already gets today's effective values for free", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 4000);
  assert.ok(
    reloadBody.includes(
      "{ ...loadedTask!, scheduledTime: effective.scheduledTime, expectedDurationMinutes: effective.expectedDurationMinutes, order: effective.order }"
    )
  );
  const performStartIndex = screen.indexOf("async function performStart()");
  // Window widened (8300 -> 8800): the BodySensation task's own
  // markSupportiveBodySensationUsagesTaskOutcome call/comment, inserted
  // near the top of performStart, pushed every later line further from the anchor.
  const performStartBody = screen.slice(performStartIndex, performStartIndex + 8800);
  // Smart To-Do List task, section 6, and ARCHI -- To-Do Bank +
  // Duration/Split Selection task, section 3/4: the duration
  // calculation also checks pendingSplitSegment/isTodoSplit now, but
  // still falls back to task.expectedDurationMinutes ?? 25 for every
  // ordinary (non-split) task exactly as before.
  assert.ok(
    performStartBody.includes(
      "const durationMinutes = firstStage\n      ? firstStage.durationMinutes\n      : pendingSplitSegment\n      ? pendingSplitSegment.durationMinutes\n      : isTodoSplit\n      ? splitMinutes\n      : task.expectedDurationMinutes ?? 25;"
    )
  );
});

test("requirement 4: the merged effectiveTask (not the raw loaded task) is what showFloatingTimerOverlay restores with on every focus -- the floating overlay's own duration/title must agree with today's effective occurrence", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // ARCHI -- To-Do Bank + Duration/Split Selection task, section 4:
  // widened to cover the new setSplitProgress(...) line added just
  // before this call.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 6100);
  assert.ok(reloadBody.includes("showFloatingTimerOverlay(restMatch ?? taskMatch!, effectiveTask, relevantStageProgress, nextScheduledTaskForOverlayRef.current);"));
});

test("requirement 6: a removed-for-today occurrence falls back to the template's own raw values here (never blocks opening the task directly) -- 'removed' only hides it from the Flexible Daily Routine's own list", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 3700);
  assert.ok(reloadBody.includes("effective && !effective.removed"));
});

test("requirements 6/7/8 (no template corruption, no duplicates): persistTask restores the RAW template's own scheduledTime/expectedDurationMinutes/order before writing to the shared Task record -- every start/pause/complete/subtask-toggle on an overridden occurrence must never overwrite the Fixed Weekly Routine template with today's one-off numbers", () => {
  const fnIndex = screen.indexOf("async function persistTask(next: Task)");
  const fnEndIndex = screen.indexOf("\n  }", fnIndex);
  const fnBody = screen.slice(fnIndex, fnEndIndex);
  assert.ok(fnBody.includes("const raw = rawTaskRef.current;"));
  assert.ok(
    fnBody.includes(
      "{ ...next, scheduledTime: raw.scheduledTime, expectedDurationMinutes: raw.expectedDurationMinutes, order: raw.order }"
    )
  );
  assert.ok(fnBody.includes("await upsertTask(toPersist);"));
  assert.ok(!fnBody.includes("await upsertTask(next);"), "must never persist the (possibly override-merged) `next` object as-is");
});

test("rawTaskRef is populated from the RAW loadedTask (never the merged effectiveTask) on every reload, so persistTask always has the true template values to restore", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 4000);
  assert.ok(reloadBody.includes("rawTaskRef.current = loadedTask;"));
});

test("every persistTask call site derives `next` from the (merged) `task` state as before -- this fix only changes what gets WRITTEN to storage, never the existing start/pause/subtask call sites themselves", () => {
  assert.ok(screen.includes('await persistTask({ ...startTask(task, new Date().toISOString()), notificationId: null, notificationScheduledFor: null });'));
  assert.ok(screen.includes("await persistTask(pauseTaskRecord(task, new Date().toISOString()));"));
});

test("requirement 5, completion fix: a recurring task's completion records only TODAY's occurrence (append-only, never the shared status) and returns the shared Task to 'planned' -- never 'completed', which would permanently disarm every FUTURE occurrence's own alarm; a one-time task's own single completion is unaffected", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 6500);
  // Smart To-Do List task, section 6: this branch is now an `else if`
  // (a new To-Do split-progress branch comes first), but every
  // recurring (non-split) task's own behavior is unchanged.
  assert.ok(fnBody.includes('} else if (task.recurrence.kind === "recurring") {'));
  assert.ok(fnBody.includes("appendTaskOccurrenceCompletion(createTaskOccurrenceCompletion(task.id, new Date(now)));"));
  assert.ok(fnBody.includes('completedTask = { ...task, status: "planned", postponementReason: null, returnAt: null, notificationId: null, notificationScheduledFor: null, updatedAt: now };'));
  assert.ok(fnBody.includes("completedTask = { ...completeTask(task, now), notificationId: null, notificationScheduledFor: null };"));
});

test("requirement 1/6, completion fix: after completing a recurring task's occurrence, the alarm is immediately re-synced for the NEXT occurrence via scheduleTaskAlarm, reading the RAW (un-overridden) task from rawTaskRef -- never today's now-stale overridden time", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 7500);
  assert.ok(fnBody.includes('if (task.recurrence.kind === "recurring" && rawTaskRef.current) {'));
  assert.ok(fnBody.includes("scheduleTaskAlarm(rawTaskRef.current, new Date())"));
});

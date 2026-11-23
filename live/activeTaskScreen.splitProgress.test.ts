import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/activeTaskScreen.splitProgress.test.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 4 (end-to-end): source-text regression guard for
 * live/ActiveTaskScreen.tsx's To-Do duration redirect and split-segment
 * auto-advance wiring (task #535) -- this file isn't callable from a
 * plain `node --test` run (React Native component, same convention as
 * every other screen test in this codebase); the pure split-plan/
 * split-progress math itself is exercised directly in
 * arc/taskSplitPlan.test.ts / arc/taskSplitProgress.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

test("required: handleStart redirects an isTodoItem task to the duration-selection route, UNLESS this is the return trip (splitMinutes handed back, or a matching, not-yet-complete TaskSplitProgress already persisted) -- never for a non-To-Do (fixed/scheduled) task", () => {
  const fnIndex = screen.indexOf("async function handleStart()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const hasPendingSplitPlan = splitProgress !== null && splitProgress.taskId === task.id && !isTaskSplitProgressComplete(splitProgress);"));
  assert.ok(fnBody.includes('if (task.isTodoItem && splitMinutes === null && !hasPendingSplitPlan) {'));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/duration", params: { id: task.id } });'));
});

test("required: performStart's duration derivation checks a pendingSplitSegment (from a persisted TaskSplitProgress) -- outranking isTodoSplit's own splitMinutes reuse, but still outranked by a configured stage's own firstStage duration", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(
    fnBody.includes(
      "const pendingSplitSegment = task.isTodoItem && splitProgress && splitProgress.taskId === task.id ? currentSplitSegment(splitProgress) : null;"
    )
  );
  assert.ok(
    fnBody.includes(
      "const durationMinutes = firstStage\n      ? firstStage.durationMinutes\n      : pendingSplitSegment\n      ? pendingSplitSegment.durationMinutes\n      : isTodoSplit\n      ? splitMinutes\n      : task.expectedDurationMinutes ?? 25;"
    )
  );
});

test("required: the segment-advance useEffect recomputes its own 'ended' signal from timerRun/restRun/now directly (never the later timerRunEnded/restRunEnded consts), so it is declared BEFORE the `if (!task)` early render bail-out -- otherwise it would violate the Rules of Hooks on a render where task is still null", () => {
  const effectIndex = screen.indexOf(
    "if (!task || !task.isTodoItem || !splitProgress || splitProgress.taskId !== task.id) return;"
  );
  assert.ok(effectIndex > 0, "the segment-advance effect's guard must exist");
  const bailOutIndex = screen.indexOf("if (!task) {\n    return (");
  assert.ok(bailOutIndex > 0, "the early render bail-out must exist");
  assert.ok(effectIndex < bailOutIndex, "the segment-advance effect must be declared before the early render bail-out");
});

test("required: the segment-advance effect fires on EITHER a naturally-completed OR an early-finished run (both converge on completedAt/status.complete), guarded by a per-runId ref so it can never fire twice for the same ended run", () => {
  const effectIndex = screen.indexOf("if (!task || !task.isTodoItem || !splitProgress || splitProgress.taskId !== task.id) return;");
  const effectBody = screen.slice(effectIndex, screen.indexOf("}, [task, splitProgress, timerRun, restRun, now]);", effectIndex));
  assert.ok(effectBody.includes("const endedRun = restRun ?? timerRun;"));
  assert.ok(effectBody.includes("const ended = endedRun.completedAt !== null || statusNow.complete === true;"));
  assert.ok(effectBody.includes("if (!ended || segmentAdvancedForRunId.current === endedRun.runId) return;"));
  assert.ok(effectBody.includes("segmentAdvancedForRunId.current = endedRun.runId;"));
  assert.ok(effectBody.includes("advanceToNextSplitSegment(endedRun);"));
});

test("required: advanceToNextSplitSegment is a deliberate no-op once there is no next segment (the split's own last, always-work segment) -- the real, unmodified handleComplete() path then takes over via the existing end-of-timer UI, exactly as for a non-split task", () => {
  const fnIndex = screen.indexOf("async function advanceToNextSplitSegment(endedRun: TaskTimerRun)");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const nextSegment = currentSplitSegment(advanced);"));
  assert.ok(fnBody.includes("if (!nextSegment) return;"));
});

test("required: advanceToNextSplitSegment persists the advanced TaskSplitProgress and starts the next segment's own fresh TaskTimerRun -- work segments get kind 'task', break segments get kind 'rest', and a break segment plays the mute-aware break-start sound exactly once per segment", () => {
  const fnIndex = screen.indexOf("async function advanceToNextSplitSegment(endedRun: TaskTimerRun)");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("await saveTaskSplitProgress(advanced);"));
  assert.ok(fnBody.includes("setSplitProgress(advanced);"));
  assert.ok(fnBody.includes('const kind = nextSegment.kind === "break" ? "rest" : "task";'));
  assert.ok(fnBody.includes("createTaskTimerRun(task.id, generateTaskTimerRunId(), nextSegment.durationMinutes, new Date().toISOString(), kind)"));
  assert.ok(fnBody.includes('if (kind === "rest") {'));
  assert.ok(fnBody.includes("await playBreakStartSound(await loadBreakSoundEnabled());"), "the mute setting must be read fresh, never hardcoded true");
  assert.ok(fnBody.includes("setRestRun(nextRunWithNotification);"));
  assert.ok(fnBody.includes("setTimerRun(null);"));
  assert.ok(fnBody.includes("setTimerRun(nextRunWithNotification);"));
  assert.ok(fnBody.includes("setRestRun(null);"));
});

test("required: advanceToNextSplitSegment never duplicates a pending OS alarm for the ended run before starting the next segment", () => {
  const fnIndex = screen.indexOf("async function advanceToNextSplitSegment(endedRun: TaskTimerRun)");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("await cancelTaskTimerEndAlarm(endedRun.notificationId);"));
});

test("required: reload() loads the persisted TaskSplitProgress (scoped to this exact task id) alongside the existing TaskTimerRun/TaskStageProgress loads -- a split progress belonging to a DIFFERENT task never leaks in", () => {
  assert.ok(screen.includes("loadTaskSplitProgress(),"));
  assert.ok(screen.includes("setSplitProgress(loadedSplitProgress && loadedSplitProgress.taskId === taskId ? loadedSplitProgress : null);"));
});

test("required: a non-To-Do (fixed/scheduled) task's own handleStart/performStart paths are completely untouched -- the redirect and the pendingSplitSegment branch both gate on task.isTodoItem", () => {
  const handleStartIndex = screen.indexOf("async function handleStart()");
  const handleStartBody = screen.slice(handleStartIndex, screen.indexOf("\n  }", handleStartIndex));
  assert.ok(handleStartBody.includes("if (task.isTodoItem && splitMinutes === null && !hasPendingSplitPlan) {"));
  const performStartIndex = screen.indexOf("async function performStart()");
  const performStartBody = screen.slice(performStartIndex, screen.indexOf("\n  }", performStartIndex));
  assert.ok(performStartBody.includes("const pendingSplitSegment = task.isTodoItem &&"));
});

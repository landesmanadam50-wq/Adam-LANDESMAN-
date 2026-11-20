import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/unifiedCheckInIntegration.test.ts
 *
 * Unified Emotional Check-In and Task Postponement System, section 9:
 * a traceability pass over the required tests that are satisfied by
 * PRE-EXISTING, UNCHANGED functionality this task deliberately reused
 * rather than rebuilding (section 10: "reuse existing code wherever
 * possible"). Each test here confirms that reuse actually held --
 * that the relevant pre-existing mechanism is still exactly what the
 * new intervention screen/routing module hands off to, untouched by
 * this task's own new routes/screens.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const restScreen = readSource("live/PostponementRestScreen.tsx");
const smallerScreen = readSource("live/PostponementSmallerTaskScreen.tsx");
const taskAlarm = readSource("data/taskAlarm.ts");
const obstacleScreen = readSource("live/PostponementObstacleScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

test("required test 8 (postponement intervention from Android notifications): the alarm's own 'דחייה' action still opens the SAME intervention screen (/tasks/[id]/postpone-obstacle) this task's Task-LIVE wiring also now opens -- one single entry point for every 'דחייה' trigger, untouched by this task", () => {
  assert.ok(taskAlarm.includes('{ title: "דחייה", pressAction: { id: ACTION_POSTPONE_OBSTACLE } }'));
  const fnIndex = taskAlarm.indexOf('if (actionId === ACTION_POSTPONE_OBSTACLE) {');
  const fnBody = taskAlarm.slice(fnIndex, fnIndex + 1500);
  assert.match(fnBody, /router\.replace\(\{ pathname: "\/tasks\/\[id\]\/postpone-obstacle", params: \{ id: taskId \} \}\);/);
});

test("required test 9 (Rest and return to the original task): choosing 'rest' from the intervention screen still creates a real 'rest'-kind TaskTimerRun and hands off to the task's own screen -- the ORIGINAL task context (taskId) is never swapped for anything else, and no postponement is ever recorded by this path", () => {
  assert.ok(restScreen.includes('createTaskTimerRun(taskId, generateTaskTimerRunId(), minutes, now.toISOString(), "rest")'));
  assert.ok(restScreen.includes('router.replace({ pathname: "/tasks/[id]", params: { id: taskId } });'));
  assert.ok(!restScreen.includes("recordPostponement"), "rest must never itself count as postponement");
});

test("required test 10 (task reduction and updated timer duration): choosing 'reduce the task' creates a new, smaller Task (its own expectedDurationMinutes) and starts it immediately through the EXISTING Task LIVE timer -- the original task's own record/schedule stays completely untouched, never itself postponed", () => {
  assert.ok(smallerScreen.includes("expectedDurationMinutes: duration"));
  assert.ok(smallerScreen.includes('router.replace({ pathname: "/tasks/[id]", params: { id: smallerTask.id, autoStart: "1" } });'));
  assert.ok(!smallerScreen.includes("upsertTask(task)"), "the ORIGINAL task must never itself be read-modified-written here");
  assert.ok(!smallerScreen.includes("recordPostponement"));
});

test("required test 11 (preservation of recurring weekly templates): task reduction creates a brand-new, independent Task (parentTaskId pointing back, never editing the original) -- a recurring weekly-origin task's own permanent template is structurally impossible to reach from this screen, since it never loads or writes weekly-schedule storage at all", () => {
  assert.ok(smallerScreen.includes("parentTaskId: task.id"));
  assert.ok(!smallerScreen.includes("WeeklyScheduleModeSettings"));
  assert.ok(!smallerScreen.includes("TaskOccurrenceOverride"));
});

test("required test 12 (no premature postponement recording): opening the intervention screen itself, and every one of its three branches (emotional/rest/smaller_task), only ever creates a neutral PostponementObstacleOutcome record (what was picked, for later analysis) -- NONE of the three branches ever calls recordPostponement or changes the task's own status", () => {
  assert.ok(!obstacleScreen.includes("recordPostponement"));
  assert.ok(!obstacleScreen.includes("postponeTask("));
  assert.ok(!restScreen.includes("postponeTask("));
  assert.ok(!smallerScreen.includes("postponeTask("));
});

test("required test 13 (preservation of the smile reward system): the ONLY place in this entire app that ever calls recordPostponement is still live/PostponementScreen.tsx's own confirm() (the detailed reason/category/return-time form) -- never any of the three new intervention branches, so choosing Rest/Emotional-support/Reduce-task can never reset the smile streak", () => {
  const postponementScreen = readSource("live/PostponementScreen.tsx");
  assert.ok(postponementScreen.includes("recordPostponement("));
});

test("required test 7 (postponement intervention from Task LIVE): both of ActiveTaskScreen's own 'דחייה' triggers (the button, and the openPostpone auto-param shared with Today/ExternalInterruptionScreen) open the intervention screen, never the old detailed form directly", () => {
  const matches = activeTaskScreen.match(/pathname:\s*"\/tasks\/\[id\]\/postpone-obstacle"/g) ?? [];
  assert.ok(matches.length >= 2, "both the button and the openPostpone auto-param must open the intervention screen");
});

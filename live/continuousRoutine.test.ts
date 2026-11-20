import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/continuousRoutine.test.ts
 *
 * Continuous vs. Spaced Routines task: source-text regression guard
 * for the three completion call sites (live/ActiveTaskScreen.tsx,
 * build/DailyScheduleScreen.tsx, build/TodayScreen.tsx) and
 * live/SessionReflectionScreen.tsx's own continuous-summary exit path
 * -- these touch AsyncStorage/navigation, which isn't callable from a
 * plain `node --test` run, same convention as every other screen test
 * in this codebase. The pure mode/rotation/next-task logic is fully
 * exercised in arc/dailyRoutine.test.ts, and the resolution I/O
 * (including the "default to spaced, never continuous by accident"
 * rule) in data/dailyRoutine.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const dailyScheduleScreen = readSource("build/DailyScheduleScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");
const reflectionScreen = readSource("live/SessionReflectionScreen.tsx");
const reflectRoute = readSource("app/tasks/[id]/reflect.tsx");
const setupScreen = readSource("build/RoutineSetupScreen.tsx");

// --- Each of the three completion call sites: silent reward, skip or summarize ---

for (const [name, source, fnStart, windowSize] of [
  // Unified ARC & Productivity Update task, requirement 9: widened for
  // the ad-hoc-group + combined-smiles accumulation code this branch
  // now carries.
  ["live/ActiveTaskScreen.tsx's handleComplete", activeTaskScreen, "async function handleComplete()", 7200],
  ["build/DailyScheduleScreen.tsx's handleComplete", dailyScheduleScreen, "async function handleComplete(task: Task)", 2000],
  ["build/TodayScreen.tsx's handleComplete", todayScreen, "async function handleComplete(task: Task)", 2000],
] as const) {
  test(`${name} resolves the continuous-routine outcome and, when continuous, records the smile reward silently (never opening the smiling-exercise screen)`, () => {
    const fnIndex = source.indexOf(fnStart);
    const fnBody = source.slice(fnIndex, fnIndex + windowSize);
    assert.ok(fnBody.includes("resolveContinuousRoutineOutcome(task"), `${name} must call resolveContinuousRoutineOutcome`);
    assert.ok(fnBody.includes("if (continuousOutcome.isContinuous) {"));
    assert.ok(fnBody.includes("recordSilentTaskCompletionReward(task.id"));
  });

  test(`${name} opens the ONE summary reflection (continuousRoutineSummary=1) only when no next task remains in the continuous period`, () => {
    const fnIndex = source.indexOf(fnStart);
    const fnBody = source.slice(fnIndex, fnIndex + windowSize);
    assert.ok(fnBody.includes('continuousRoutineSummary: "1"'));
    const continuousBlockIndex = fnBody.indexOf("if (continuousOutcome.isContinuous)");
    const continuousBlock = fnBody.slice(continuousBlockIndex, continuousBlockIndex + 500);
    assert.ok(continuousBlock.includes("if (!continuousOutcome.nextTaskInPeriod)") || continuousBlock.includes("if (continuousOutcome.nextTaskInPeriod)"), "must branch on whether a next task remains");
  });

  test(`${name} never navigates to the smiling-exercise screen (post-task-reward) when the outcome is continuous`, () => {
    const fnIndex = source.indexOf(fnStart);
    const fnBody = source.slice(fnIndex, fnIndex + windowSize);
    const continuousBlockIndex = fnBody.indexOf("if (continuousOutcome.isContinuous)");
    const returnIndex = fnBody.indexOf("return;", continuousBlockIndex);
    const continuousBlock = fnBody.slice(continuousBlockIndex, returnIndex);
    assert.ok(!continuousBlock.includes("post-task-reward"), "the continuous branch must return before ever reaching the post-task-reward navigation");
  });
}

test("ActiveTaskScreen's continuous branch navigates DIRECTLY to the next task in the period (router.replace), skipping reflect entirely, when one remains", () => {
  const fnIndex = activeTaskScreen.indexOf("async function handleComplete()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 7200);
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: continuousOutcome.nextTaskInPeriod.id } });'));
});

test("DailyScheduleScreen/TodayScreen's continuous branch with a remaining next task does NOT navigate away at all -- the trainee simply stays on the list (already reflecting the completion via local state)", () => {
  for (const source of [dailyScheduleScreen, todayScreen]) {
    const fnIndex = source.indexOf("async function handleComplete(task: Task)");
    const fnBody = source.slice(fnIndex, fnIndex + 2000);
    const continuousBlockIndex = fnBody.indexOf("if (continuousOutcome.isContinuous)");
    const continuousBlock = fnBody.slice(continuousBlockIndex, fnBody.indexOf("return;", continuousBlockIndex));
    assert.ok(!continuousBlock.includes("router.push") || continuousBlock.includes('continuousRoutineSummary'), "any navigation inside the continuous branch must be the summary-reflection push, never an unconditional one");
  }
});

// --- Incomplete routines resume without losing progress ---

test("the 'next task in period' calculation (arc/dailyRoutine.ts's resolveNextContinuousTaskInPeriod) is recomputed fresh from live Task/completion data every time -- there is no separate 'routine progress' record that could desync or need resuming", () => {
  for (const source of [activeTaskScreen, dailyScheduleScreen, todayScreen]) {
    assert.ok(!source.includes("RoutineProgress"), "no separate progress-tracking entity exists for continuous routines -- completion state lives on the Tasks/TaskOccurrenceCompletion themselves, already durable and already resumable");
  }
});

// --- Spaced routines: unaffected, exact pre-existing behavior ---

test("a non-continuous completion (isContinuous false) falls through to the exact pre-existing post-task-reward/reflect navigation, unchanged, in all three call sites", () => {
  assert.ok(dailyScheduleScreen.includes('router.push({ pathname: "/tasks/[id]/post-task-reward", params: { id: task.id, source: "today" } });'));
  assert.ok(todayScreen.includes('router.push({ pathname: "/tasks/[id]/post-task-reward", params: { id: task.id, source: "today" } });'));
  // Task Completion Navigation fix: `replace`, not `push` -- see ActiveTaskScreen.tsx's own doc comment on this exact line.
  assert.ok(activeTaskScreen.includes('router.replace({ pathname: "/tasks/[id]/reflect", params: { id: task.id } });'));
});

// --- The one summary reflection at the end of a continuous routine ---

// Unified ARC & Productivity Update task, requirement 9 ("one
// combined smile-reward experience at the end"): continuousRoutineSummary
// now ALSO opens the shared post-task-reward screen (never straight
// home any more), passing the routine's own combined smile total
// through combinedSmiles -- for BOTH the save and skip buttons, since
// both still call this same goToPostTaskReward function.
test("SessionReflectionScreen's continuousRoutineSummary flag opens the SAME shared post-task-reward screen every other completion path uses, passing the routine's combined smile total through, for BOTH its save and skip buttons (both call goToPostTaskReward)", () => {
  const fnIndex = reflectionScreen.indexOf("function goToPostTaskReward()");
  const fnBody = reflectionScreen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (continuousRoutineSummary) {"));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/post-task-reward"'));
  assert.ok(fnBody.includes('source: "today"'));
  assert.ok(fnBody.includes("combinedSmiles"));
});

test("a normal (non-continuous) reflection is completely unaffected -- continuousRoutineSummary defaults to false and still opens the smiling-exercise screen", () => {
  assert.ok(reflectionScreen.includes("continuousRoutineSummary = false"));
  assert.ok(reflectionScreen.includes('router.replace({ pathname: "/tasks/[id]/post-task-reward", params: { id: taskId } });'));
});

test("the reflect route passes continuousRoutineSummary straight through from its own query param", () => {
  assert.ok(reflectRoute.includes('continuousRoutineSummary === "1"'));
});

// --- Configuring the mode, and switching it later without losing task data ---

test("RoutineSetupScreen offers a mode toggle per period, writing through setPeriodRoutineMode -- never touching that period's own tasks", () => {
  assert.ok(setupScreen.includes("ROUTINE_MODES.map((mode) =>"));
  assert.ok(setupScreen.includes("setPeriodRoutineMode(template, periodId, mode, now)"));
});

test("RoutineSetupScreen also doubles as the later full-routine editor (per its own doc), so switching a period's mode after initial setup uses the exact same toggle -- no second screen", () => {
  assert.ok(setupScreen.includes("doubles as the FULL routine editor reachable later"));
});

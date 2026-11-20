import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/floatingTimerOverlayWiring.test.ts
 *
 * Floating task timer task: source-text regression guard for WHERE
 * live/ActiveTaskScreen.tsx calls into data/floatingTimerOverlay.ts --
 * every point this task's own requirement 4/5/7/test-list cares about
 * (start, pause, resume, finish-early, complete, skip, the "start_arc"
 * end-choice, rest start/finish, and restoring on reload/app reopen).
 * No React Native component test renderer exists in this codebase, so
 * this checks the real source text, matching every other screen test's
 * own convention.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

test("imports the floating-overlay bridge from data/floatingTimerOverlay.ts, never a second/local reimplementation", () => {
  assert.match(
    screen,
    /import\s*\{[\s\S]*?showFloatingTimerOverlay[\s\S]*?showIdleFloatingOverlayPanel[\s\S]*?updateFloatingTimerOverlay[\s\S]*?\}\s*from\s*["']\.\.\/data\/floatingTimerOverlay\.ts["']/
  );
});

test("requirements 1+6: performStart (reached via handleStart's required-before-tasks gate from both a plain tap and the task-alarm's own autoStart) shows the overlay the instant a timer actually starts", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const fnBody = screen.slice(fnIndex, fnIndex + 7400);
  assert.ok(fnBody.includes("await showFloatingTimerOverlay(runWithNotification, task, freshStageProgress, nextScheduledTaskForOverlay);"));
});

test("requirement 5: pausing (e.g. for ARC/rest) updates the overlay to the frozen/paused state -- never hides it", () => {
  const fnIndex = screen.indexOf("async function handlePause()");
  const fnBody = screen.slice(fnIndex, fnIndex + 800);
  assert.ok(fnBody.includes("await updateFloatingTimerOverlay(paused, task, stageProgress, nextScheduledTaskForOverlay);"));
  assert.ok(!fnBody.includes("hideFloatingTimerOverlay"));
});

test("resuming re-syncs the overlay to the freshly-resumed run", () => {
  const fnIndex = screen.indexOf("async function handleResume()");
  const fnBody = screen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("await updateFloatingTimerOverlay(resumedWithNotification, task, stageProgress, nextScheduledTaskForOverlay);"));
});

test("finishing a run early updates the overlay too -- an early finish is an end state, shown the same as naturally reaching zero", () => {
  const fnIndex = screen.indexOf("async function handleFinishEarly()");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("await updateFloatingTimerOverlay(finished, task, stageProgress, nextScheduledTaskForOverlay);"));
});

test("test 12: completing the task hides the overlay (and with it, the ongoing notification) -- no active timer left for this task", () => {
  // Task Completion Navigation fix: handleComplete no longer calls
  // hideFloatingTimerOverlay directly -- it delegates to the shared
  // clearEndedTimer() (which itself calls hideFloatingTimerOverlay,
  // asserted by the "clearEndedTimer ... hides the overlay" test below),
  // so the overlay is still cleared, just via one shared cleanup path.
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 2300);
  assert.ok(fnBody.includes("await clearEndedTimer();"));
});

test("ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: skipping the task switches the overlay to its IDLE state (3 moods, next scheduled task) rather than hiding it outright -- 'the interface must update automatically'", () => {
  const fnIndex = screen.indexOf("async function handleSkipTask()");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("await showIdleFloatingOverlayPanel(nextScheduledTaskForOverlay);"));
  assert.ok(!fnBody.includes("hideFloatingTimerOverlay"));
});

test("ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: clearEndedTimer (dismissing the end-of-timer prompt / finishing a rest period with nothing more to pick) switches the overlay to its IDLE state, never hides it outright", () => {
  const fnIndex = screen.indexOf("async function clearEndedTimer()");
  const fnBody = screen.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("await showIdleFloatingOverlayPanel(nextScheduledTaskForOverlay);"));
  assert.ok(!fnBody.includes("hideFloatingTimerOverlay"));
});

test("ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: choosing 'start_arc' from the end-of-timer prompt also switches the overlay to IDLE before navigating into ARC -- the main timer run is cleared there too, so there's no current task left for the panel to show", () => {
  const startArcIndex = screen.indexOf('if (choice === "start_arc")');
  const startArcBody = screen.slice(startArcIndex, startArcIndex + 300);
  assert.ok(startArcBody.includes("showIdleFloatingOverlayPanel(nextScheduledTaskForOverlay);"));
});

test("starting a rest period updates the overlay to the new rest run, and finishing the rest period early updates it again to the ended state", () => {
  const restStartIndex = screen.indexOf('createTaskTimerRun(task.id, generateTaskTimerRunId(), minutes, new Date().toISOString(), "rest")');
  assert.ok(screen.slice(restStartIndex, restStartIndex + 550).includes("await updateFloatingTimerOverlay(restWithNotification, task, null, nextScheduledTaskForOverlay);"));

  const restFinishIndex = screen.indexOf("await cancelTaskTimerEndAlarm(restRun.notificationId);");
  assert.ok(screen.slice(restFinishIndex, restFinishIndex + 400).includes("await updateFloatingTimerOverlay(finished, task, null, nextScheduledTaskForOverlay);"));
});

test("requirement 7: reload() (every focus, including after ARCHI itself was reopened) re-shows the overlay for whichever run (task or rest) is actually persisted -- never a fresh independent count, always the one loaded TaskTimerRun", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 5500);
  assert.ok(reloadBody.includes("showFloatingTimerOverlay(restMatch ?? taskMatch!, effectiveTask, relevantStageProgress, nextScheduledTaskForOverlayRef.current);"));
  assert.ok(reloadBody.includes("if (effectiveTask && (taskMatch || restMatch)) {"));
});

// --- ARCHI -- Unified Floating Overlay & Mini ARC Improvements task ---

test("the screen accepts nextTask/addInsight props (the unified floating panel's own new deep-link params), both defaulting to false so every pre-existing caller/test is unaffected", () => {
  const defIndex = screen.indexOf("export default function ActiveTaskScreen({");
  const defBody = screen.slice(defIndex, defIndex + 900);
  assert.ok(defBody.includes("nextTask = false,"));
  assert.ok(defBody.includes("addInsight = false,"));
});

test("nextTask=1 reuses handleNextTask() verbatim -- never a second transition implementation -- and addInsight=1 opens the existing insight editor with this task as its return context, never a second insight editor", () => {
  const effectIndex = screen.indexOf("useEffect(() => {\n    if (autoActionConsumed.current) return;");
  const effectBody = screen.slice(effectIndex, screen.indexOf("}, [task, timerRun, restRun,", effectIndex));
  assert.ok(effectBody.includes("if (nextTask) {"));
  assert.ok(effectBody.includes("handleNextTask();"));
  assert.ok(effectBody.includes("if (addInsight) {"));
  assert.ok(effectBody.includes('router.push({ pathname: "/insights/new", params: { returnToTaskId: task.id } });'));
});

test("the route wrapper (app/tasks/[id].tsx) reads completeStage, nextTask and addInsight from the URL and threads all three through -- the pre-existing completeStage prop was declared on this screen but never actually wired from the route until this task", () => {
  const route = readSource("app/tasks/[id].tsx");
  assert.ok(route.includes("completeStage={completeStage === \"1\"}"));
  assert.ok(route.includes("nextTask={nextTask === \"1\"}"));
  assert.ok(route.includes("addInsight={addInsight === \"1\"}"));
});

test("nextScheduledTaskForOverlay (both the ref and the render-time value) now carries durationMinutes from the real scheduled task, never a hardcoded/omitted value", () => {
  assert.ok(screen.includes("durationMinutes: nextScheduledTask.task.expectedDurationMinutes"));
});

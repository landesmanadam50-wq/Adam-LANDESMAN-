import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/activeTaskScreen.test.ts
 *
 * Hebrew BUILD/LIVE rework spec, Stage E: source-text regression guard
 * for the Tasks routes and the active-task timer screen -- this
 * codebase has no React Native component test renderer, so this
 * asserts directly on the real source text. The timer's own pure logic
 * is covered by arc/taskTimer.test.ts; the end-of-timer choice logic by
 * arc/taskTimerEndChoice.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");
const listScreen = readSource("build/TasksListScreen.tsx");
const taskRoute = readSource("app/tasks/[id].tsx");
const listRoute = readSource("app/tasks/index.tsx");
const layout = readSource("app/_layout.tsx");

test("both routes are registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/index"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]"/);
});

test("the timer status is computed via the shared pure arc/taskTimer.ts functions -- never a duplicated/local elapsed-time calculation", () => {
  assert.match(screen, /import\s*\{[\s\S]*?getTaskTimerStatus[\s\S]*?\}\s*from\s*["']\.\.\/arc\/taskTimer\.ts["']/);
  assert.ok(screen.includes("getTaskTimerStatus("));
  // Must re-render on an interval (not a one-shot read) so the timer stays live.
  assert.match(screen, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/);
});

test("on focus, the screen checks for an already-persisted TaskTimerRun for THIS task before anything else -- resume, never duplicate", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 3700);
  assert.ok(reloadBody.includes("loadTaskTimerRun()"));
  assert.ok(reloadBody.includes("loadedRun.taskId === taskId"));
});

test("'הטיימר הסתיים' and 'המשימה הושלמה' are kept separate -- reaching the end-of-timer prompt never itself calls completeTask", () => {
  const endPromptIndex = screen.indexOf("{timerEnded && !taskCompleting && (");
  assert.ok(endPromptIndex !== -1);
  const endPromptBlockStart = screen.indexOf("<View style={styles.endPromptBlock}>", endPromptIndex);
  const endPromptBlockEnd = screen.indexOf("{restRun && status && (", endPromptBlockStart);
  const endPromptBlock = screen.slice(endPromptBlockStart, endPromptBlockEnd);
  assert.ok(!endPromptBlock.includes("completeTask"), "the end-of-timer prompt must never mark the task complete on its own");
  assert.ok(screen.includes("onPress={handleComplete}"), "marking complete must remain its own, separate, always-available action");
  const handleCompleteIndex = screen.indexOf("async function handleComplete()");
  assert.ok(screen.slice(handleCompleteIndex, handleCompleteIndex + 3700).includes("completedTask = { ...completeTask(task, now)"));
});

test("the three end-of-timer choices are rendered from the shared TASK_TIMER_END_CHOICE_LABELS -- never a duplicated/local label set", () => {
  assert.match(screen, /import\s*\{[\s\S]*?TASK_TIMER_END_CHOICE_LABELS[\s\S]*?\}\s*from\s*["']\.\.\/arc\/taskTimerEndChoice\.ts["']/);
  assert.ok(screen.includes("Object.keys(TASK_TIMER_END_CHOICE_LABELS)"));
});

test("Simplified-architecture task, Phase 1: the ARC choice always opens the clearly labeled placeholder, regardless of any linked ArcBuild -- never the old LIVE chooser or a BUILD-linked session", () => {
  assert.ok(!screen.includes("resolveArcChoiceDestination"), "the old per-build branching must be removed from ActiveTaskScreen for Phase 1");
  const startArcIndex = screen.indexOf('if (choice === "start_arc")');
  const startArcBody = screen.slice(startArcIndex, startArcIndex + 700);
  assert.ok(startArcBody.includes('pathname: "/tasks/[id]/arc", params: { id: task.id }'));
  assert.ok(!startArcBody.includes('"/live"') && !startArcBody.includes('"/live/select"') && !startArcBody.includes('"/build'));
});

test("pause/resume/finish-early are wired to the shared pure functions, never a local reimplementation", () => {
  assert.ok(screen.includes("pauseTaskTimerRun(timerRun"));
  assert.ok(screen.includes("resumeTaskTimerRun(timerRun"));
  assert.ok(screen.includes("finishTaskTimerRunEarly(timerRun"));
});

// Unified Emotional Check-In and Task Postponement System, section 4:
// EVERY "דחייה" entry point (Task LIVE's own button, and Today's/
// ExternalInterruptionScreen's openPostpone param, which both land
// here too) now opens the intervention screen FIRST -- "מה מונע ממך
// להתחיל את המשימה?" -- never the old detailed reason/category/
// return-time form (live/PostponementScreen.tsx) directly. That form
// remains fully intact, still reachable, just no longer the first
// screen "דחייה" opens.
test("'דחיית המשימה' opens the postponement intervention screen (live/PostponementObstacleScreen.tsx), never a bare inline reason-only prompt and never the old detailed form directly", () => {
  const matches = screen.match(/pathname:\s*"\/tasks\/\[id\]\/postpone-obstacle",\s*params:\s*\{\s*id:\s*task\.id\s*\}/g) ?? [];
  assert.ok(matches.length >= 1, "the postpone button must open the intervention screen");
  const autoMatches = screen.match(/pathname:\s*"\/tasks\/\[id\]\/postpone-obstacle",\s*params:\s*\{\s*id:\s*taskId\s*\}/g) ?? [];
  assert.ok(autoMatches.length >= 1, "Today's/ExternalInterruption's openPostpone param must also land on the intervention screen");
});

test("the Tasks list screen creates a task via arc/tasks.ts's createEmptyTask + data/storage.ts's upsertTask, never a parallel creation path, and navigates to the detail route by id", () => {
  assert.match(listScreen, /import\s*\{[\s\S]*?createEmptyTask[\s\S]*?\}\s*from\s*["']\.\.\/arc\/tasks\.ts["']/);
  assert.ok(listScreen.includes("upsertTask(task)"));
  assert.match(listScreen, /pathname:\s*"\/tasks\/\[id\]"/);
});

test("the detail route passes the id param straight through to ActiveTaskScreen", () => {
  assert.match(taskRoute, /from ["']\.\.\/\.\.\/live\/ActiveTaskScreen\.tsx["']/);
  assert.ok(taskRoute.includes("taskId={id}"));
});

test("the list route renders TasksListScreen", () => {
  assert.match(listRoute, /from ["']\.\.\/\.\.\/build\/TasksListScreen\.tsx["']/);
});

// --- Floating task timer task: task-timer-completion ring (requirement 4) ----

test("starting/resuming the timer arms the real ~10s end-of-timer ring (data/taskAlarm.ts's armTaskTimerEndAlarm) for the exact remaining duration, and never claims one will arrive (its own null-on-failure contract is respected, never overridden)", () => {
  assert.match(screen, /import\s*\{[\s\S]*?armTaskTimerEndAlarm[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const scheduleFnIndex = screen.indexOf("async function scheduleTaskTimerNotification");
  const scheduleFnBody = screen.slice(scheduleFnIndex, scheduleFnIndex + 500);
  assert.ok(scheduleFnBody.includes("armTaskTimerEndAlarm(currentTask.id, currentTask.title"));
  assert.ok(screen.includes("scheduleTaskTimerNotification(run, task)"), "handleStart must schedule");
  assert.ok(screen.includes("scheduleTaskTimerNotification(resumed, task)"), "handleResume must re-schedule for the remaining time");
});

test("pausing and finishing early both cancel the armed end-of-timer ring -- never leaving a stale one armed", () => {
  assert.match(screen, /import\s*\{[\s\S]*?cancelTaskTimerEndAlarm[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const pauseIndex = screen.indexOf("async function handlePause");
  assert.ok(screen.slice(pauseIndex, pauseIndex + 200).includes("cancelTaskTimerEndAlarm(timerRun.notificationId)"));
  const finishIndex = screen.indexOf("async function handleFinishEarly");
  assert.ok(screen.slice(finishIndex, finishIndex + 200).includes("cancelTaskTimerEndAlarm(timerRun.notificationId)"));
});

// --- Productivity roadmap, Stage J ------------------------------------

test("subtasks are rendered with a completion toggle (toggleTaskSubtaskCompletion) and a separate 'select as current action' tap (setTaskCurrentAction) -- never the same gesture", () => {
  assert.match(screen, /import\s*\{[\s\S]*?setTaskCurrentAction[\s\S]*?toggleTaskSubtaskCompletion[\s\S]*?\}\s*from\s*["']\.\.\/arc\/tasks\.ts["']/);
  assert.ok(screen.includes("toggleTaskSubtaskCompletion(task, subtask.id, new Date().toISOString())"));
  assert.ok(screen.includes("setTaskCurrentAction(task, subtask.title, new Date().toISOString())"));
});

test("the rest sub-timer is persisted through the SAME timestamp-based TaskTimerRun storage as the main timer, tagged kind 'rest' -- it must survive backgrounding/app-restart exactly like the main timer already does", () => {
  assert.match(screen, /import\s*\{[\s\S]*?saveTaskTimerRun[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
  const startRestIndex = screen.indexOf('createTaskTimerRun(task.id, generateTaskTimerRunId(), minutes, new Date().toISOString(), "rest")');
  assert.ok(startRestIndex !== -1, "starting a rest period must create a run explicitly tagged kind \"rest\"");
  const nearbyBody = screen.slice(startRestIndex, startRestIndex + 500);
  assert.ok(nearbyBody.includes("await saveTaskTimerRun(restWithNotification)"), "the rest run must be persisted, not kept as local-only React state");
});

test("on reload, a persisted run tagged kind 'rest' restores into restRun, never timerRun -- resuming mid-rest after an app restart must not look like the main timer restarting", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 4200);
  assert.ok(reloadBody.includes('matchingRun.kind === "rest"'));
  assert.ok(reloadBody.includes("setRestRun(restMatch)"));
});

test("app/_layout.tsx's handleReminderResponse deep-links a tapped 'taskTimerEnded' notification straight to that task's own screen -- the spec's own sanctioned fallback when not all three choices fit in the notification itself", () => {
  const kindCheckIndex = layout.indexOf('kind === "taskTimerEnded"');
  assert.ok(kindCheckIndex !== -1);
  const branchBody = layout.slice(kindCheckIndex, kindCheckIndex + 320);
  assert.match(branchBody, /pathname:\s*"\/tasks\/\[id\]"/);
});

// --- Floating ARC button task -----------------------------------------

test("test 2: the route accepts and forwards needArc, and the screen consumes it in its own auto-action effect, routing to the task's existing ARC chooser (never a new one, never hardcoding Full or Mini)", () => {
  assert.match(taskRoute, /needArc\?:\s*string/);
  assert.ok(taskRoute.includes('needArc={needArc === "1"}'));
  assert.match(screen, /needArc\?:\s*boolean/);
  const needArcFnIndex = screen.indexOf("async function handleNeedArc()");
  assert.ok(needArcFnIndex !== -1);
  const needArcFnBody = screen.slice(needArcFnIndex, screen.indexOf("\n  }", needArcFnIndex));
  assert.ok(needArcFnBody.includes('router.push({ pathname: "/tasks/[id]/arc-window", params: { id: task.id } })'));
});

test("test 3: handleNeedArc pauses the work timer via the SAME handlePause() condition handleNextTask already uses -- never a duplicated pause path, never a reset", () => {
  const needArcFnIndex = screen.indexOf("async function handleNeedArc()");
  const needArcFnBody = screen.slice(needArcFnIndex, screen.indexOf("\n  }", needArcFnIndex));
  const nextTaskFnIndex = screen.indexOf("async function handleNextTask()");
  const nextTaskFnBody = screen.slice(nextTaskFnIndex, screen.indexOf("\n  }", nextTaskFnIndex));
  const pauseCondition = "if (timerRun && !restRun && status && !status.paused && !timerRunEnded) await handlePause();";
  assert.ok(nextTaskFnBody.includes(pauseCondition), "sanity check: this is the exact existing condition being reused");
  assert.ok(needArcFnBody.includes(pauseCondition));
});

test("the auto-action effect checks needArc before the 'a timer is already running' early-return (unlike autoStart, needArc must act WHILE a timer is running), and marks autoActionConsumed synchronously so a second deep-link into the same screen instance can never trigger it twice", () => {
  const effectIndex = screen.indexOf("useEffect(() => {\n    if (autoActionConsumed.current) return;");
  assert.ok(effectIndex !== -1);
  const effectBody = screen.slice(effectIndex, screen.indexOf("}, [task, timerRun, restRun, autoStart, openPostpone, needArc, taskId]);", effectIndex));
  const needArcIndex = effectBody.indexOf("if (needArc) {");
  const timerRunCheckIndex = effectBody.indexOf("if (timerRun || restRun) {");
  assert.ok(needArcIndex !== -1 && timerRunCheckIndex !== -1 && needArcIndex < timerRunCheckIndex, "needArc must be checked BEFORE the timer-already-running early-return");
  const needArcBranch = effectBody.slice(needArcIndex, timerRunCheckIndex);
  assert.ok(needArcBranch.includes("autoActionConsumed.current = true;"));
  assert.ok(needArcBranch.includes("handleNeedArc();"));
});

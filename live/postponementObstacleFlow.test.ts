import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postponementObstacleFlow.test.ts
 *
 * Smart Postponement Flow: source-text regression guard for the
 * notification-driven obstacle-identification flow (requirements
 * 1-5, 8.5-8.6) -- these screens touch AsyncStorage/notifee, which
 * isn't callable from a plain `node --test` run (same constraint as
 * every other screen/data test in this codebase), so this checks the
 * real source text instead of actually rendering/invoking it. The
 * pure outcome-record model itself is fully exercised in
 * arc/postponementObstacle.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const taskAlarm = readSource("data/taskAlarm.ts");
const obstacleScreen = readSource("live/PostponementObstacleScreen.tsx");
const restScreen = readSource("live/PostponementRestScreen.tsx");
const smallerScreen = readSource("live/PostponementSmallerTaskScreen.tsx");
const obstacleRoute = readSource("app/tasks/[id]/postpone-obstacle.tsx");
const restRoute = readSource("app/tasks/[id]/postpone-rest.tsx");
const smallerRoute = readSource("app/tasks/[id]/postpone-smaller.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const rewardScreen = readSource("live/PostTaskRewardScreen.tsx");
const returnScreen = readSource("live/PostponementReturnScreen.tsx");
const returnRoute = readSource("app/tasks/[id]/postpone-return.tsx");

// --- Requirement 1 + 3: the notification action and its deep link ---

test("the task-start alarm notification has exactly two actions (Start, Postpone) -- requirement 1: never a silent automatic delay", () => {
  const fnIndex = taskAlarm.indexOf("export async function armTaskAlarm");
  const fnBody = taskAlarm.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes('{ title: "התחל משימה", pressAction: { id: ACTION_START_TASK } }'));
  assert.ok(fnBody.includes('{ title: "דחייה", pressAction: { id: ACTION_POSTPONE_OBSTACLE } }'));
});

test("pressing Postpone routes directly to the dedicated postponement screen for THIS task -- requirement 3: linked to the specific scheduled task, no dashboard in between", () => {
  const fnIndex = taskAlarm.indexOf("if (actionId === ACTION_POSTPONE_OBSTACLE)");
  const fnBody = taskAlarm.slice(fnIndex, fnIndex + 1300);
  assert.match(fnBody, /router\.replace\(\{ pathname: "\/tasks\/\[id\]\/postpone-obstacle", params: \{ id: taskId \} \}\);/);
});

test("the Postpone action uses router.replace, not push -- a double press (notification action racing the lock-screen button) can never stack two copies of the postponement screen (requirement 3: 'no duplicate sessions')", () => {
  const fnIndex = taskAlarm.indexOf("if (actionId === ACTION_POSTPONE_OBSTACLE)");
  const fnBody = taskAlarm.slice(fnIndex, fnIndex + 1000);
  assert.ok(fnBody.includes("router.replace("));
  assert.ok(!fnBody.includes("router.push("));
});

test("the Postpone action is dispatched through the SAME handleTaskAlarmEvent router already wired to notifee.onBackgroundEvent (killed/backgrounded) AND onForegroundEvent (open) -- requirement 3: works in all three app states with no new plumbing", () => {
  assert.match(taskAlarm, /if \(actionId === ACTION_START_TASK\) \{/);
  assert.match(taskAlarm, /if \(actionId === ACTION_POSTPONE_OBSTACLE\) \{/);
  const dispatchIndex = taskAlarm.indexOf("await handleTaskAlarmAction(event.detail.pressAction.id, taskId);");
  assert.ok(dispatchIndex !== -1, "both ACTION_START_TASK and ACTION_POSTPONE_OBSTACLE are handled inside the one handleTaskAlarmAction function, reached from the one shared event dispatcher");
});

test("the full-screen lock-screen alarm UI offers the same Postpone action id as the notification button -- one implementation, not two", () => {
  const screen = readSource("live/TaskAlarmScreen.tsx");
  assert.ok(screen.includes('press("postpone_obstacle")'));
});

// --- Requirement 2, Option 1 (Emotional Difficulty) ---

// Unified Emotional Check-In and Task Postponement System, section 3,
// Option B: "מצב רגשי" now opens the dedicated two-smiley Full/Shortened
// ARC screen (live/PostponementEmotionalScreen.tsx), never the generic
// spontaneous/full/mini ARC-window chooser this branch used to open --
// that chooser remains fully intact at its own existing entry point
// (a task's optional arcWindowMinutesBefore window), just no longer
// reached from here.
test("choosing 'emotional' records the outcome BEFORE navigating (so the choice is captured even if the trainee abandons immediately after), then opens the dedicated Full/Shortened ARC smiley screen -- never a second ARC implementation", () => {
  const fnIndex = obstacleScreen.indexOf("async function choose");
  const fnBody = obstacleScreen.slice(fnIndex, fnIndex + 1700);
  const createIndex = fnBody.indexOf("createPostponementObstacleOutcome(generatePostponementObstacleOutcomeId(), taskId, reason, now)");
  const saveIndex = fnBody.indexOf("await upsertPostponementObstacleOutcome(outcome);");
  const navIndex = fnBody.indexOf('router.replace({ pathname: "/tasks/[id]/postpone-emotional", params: { id: taskId, outcomeId: outcome.id } });');
  assert.ok(createIndex !== -1 && saveIndex !== -1 && navIndex !== -1);
  assert.ok(createIndex < saveIndex && saveIndex < navIndex, "the outcome must be created and saved before any navigation happens");
});

test("live/PostponementObstacleScreen.tsx never duplicates or reimplements the ARC protocol -- it only navigates to the existing route", () => {
  assert.ok(!obstacleScreen.includes("NewArcLiveSessionState"));
  assert.ok(!obstacleScreen.includes("createNewArcLiveSessionState"));
});

// --- Requirement 2, Option 2 (Need for Rest) ---

test("choosing a rest duration creates a REAL 'rest'-kind TaskTimerRun, arms its own end-of-rest alarm, records the chosen duration on the outcome, then hands off to the task's own screen -- reusing live/ActiveTaskScreen.tsx's existing restRun rendering rather than building a second countdown UI", () => {
  const fnIndex = restScreen.indexOf("async function chooseDuration");
  const fnBody = restScreen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('createTaskTimerRun(taskId, generateTaskTimerRunId(), minutes, now.toISOString(), "rest")'));
  assert.ok(fnBody.includes('armTaskTimerEndAlarm(taskId, task?.title ?? "", new Date(now.getTime() + minutes * 60 * 1000), "זמן המנוחה הסתיים")'));
  assert.ok(fnBody.includes("recordInterventionDuration(outcome, minutes, now.toISOString())"));
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: taskId } });'));
});

test("live/PostponementRestScreen.tsx never builds its own countdown/timer-ending UI -- that remains live/ActiveTaskScreen.tsx's own restRun block, unchanged", () => {
  assert.ok(!restScreen.includes("getTaskTimerStatus"));
  assert.ok(!restScreen.includes("setInterval"));
});

// --- Requirement 2, Option 3 (Make the Task Smaller) ---

test("creating a smaller task sets parentTaskId to the ORIGINAL task's id, is a one-time task for today, and never touches/rewrites the original task record", () => {
  const fnIndex = smallerScreen.indexOf("async function createAndStart");
  const fnBody = smallerScreen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("parentTaskId: task.id,"));
  assert.ok(!fnBody.includes("upsertTask(task)"), "the original task object itself must never be passed to upsertTask here");
  const upsertCalls = fnBody.match(/await upsertTask\(/g) ?? [];
  assert.equal(upsertCalls.length, 1, "only the new smaller task is ever written, never the original");
});

test("the smaller task is immediately startable in Task LIVE -- navigates to the normal /tasks/[id] route with autoStart, never a second 'mini task' screen", () => {
  assert.match(smallerScreen, /router\.replace\(\{ pathname: "\/tasks\/\[id\]", params: \{ id: smallerTask\.id, autoStart: "1" \} \}\);/);
});

test("the smaller task's duration and its link to the original are recorded on the postponement outcome", () => {
  const fnIndex = smallerScreen.indexOf("async function createAndStart");
  const fnBody = smallerScreen.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("recordInterventionDuration(outcome, duration, nowIso)"));
  assert.ok(fnBody.includes("recordSmallerTaskCreated(withDuration, smallerTask.id, nowIso)"));
});

// --- Requirement 5: return to the original task ---

test("after completing a smaller step, PostTaskRewardScreen offers to continue with the ORIGINAL task (never the generic next-task calculation) and records that the step was completed -- the original task itself is not modified, only the outcome record and navigation", () => {
  const fnIndex = rewardScreen.indexOf("async function advanceToNextTask");
  const fnBody = rewardScreen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("if (task?.parentTaskId) {"));
  assert.ok(fnBody.includes("recordSmallerStepCompleted(outcome, true, new Date().toISOString())"));
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]/postpone-return", params: { id: task.parentTaskId } });'));
});

test("the parentTaskId redirect is checked BEFORE the generic resolveNextTaskEntry calculation -- a smaller step never falls through to 'what's next' instead of its own parent", () => {
  const fnIndex = rewardScreen.indexOf("async function advanceToNextTask");
  const fnBody = rewardScreen.slice(fnIndex, fnIndex + 1400);
  const parentCheckIndex = fnBody.indexOf("task?.parentTaskId");
  const resolveIndex = fnBody.indexOf("resolveNextTaskEntry(");
  assert.ok(parentCheckIndex !== -1 && resolveIndex !== -1 && parentCheckIndex < resolveIndex);
});

// --- Requirement 5: the shared "are you ready to start?" screen ---

test("PostponementReturnScreen shows the exact question text and the primary 'start original task' action", () => {
  assert.ok(returnScreen.includes("האם אתה מוכן להתחיל את המשימה?"));
  assert.match(returnScreen, /router\.replace\(\{ pathname: "\/tasks\/\[id\]", params: \{ id: taskId, autoStart: "1" \} \}\);/);
});

test("PostponementReturnScreen only offers 'continue with the smaller step' when one was actually passed in AND it isn't already completed/archived", () => {
  const fnIndex = returnScreen.indexOf("const showContinueSmaller");
  const line = returnScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(line.includes('smallerTask.status !== "completed"'));
  assert.ok(line.includes('smallerTask.status !== "archived"'));
});

test("PostponementReturnScreen's 'return to schedule' explicitly records startedOriginalTaskAfter=false, rather than leaving it ambiguous -- requirement 6: only ever set by an explicit action", () => {
  const fnIndex = returnScreen.indexOf("async function returnToSchedule");
  const fnBody = returnScreen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("recordStartedOriginalTaskAfter(latest, false, new Date().toISOString())"));
});

test("the rest flow's 'סיום המנוחה' button, when a 'rest' postponement is still pending for this task, lands on the Return screen instead of silently falling back to the plain pre-start view -- an ordinary (non-postponement) rest end is unaffected", () => {
  const fnIndex = activeTaskScreen.indexOf('<Text style={styles.primaryButtonText}>סיום המנוחה</Text>');
  const nearby = activeTaskScreen.slice(Math.max(0, fnIndex - 900), fnIndex);
  assert.ok(nearby.includes('pending.reason === "rest" && pending.startedOriginalTaskAfter === null'));
  assert.ok(nearby.includes('router.replace({ pathname: "/tasks/[id]/postpone-return", params: { id: task!.id } });'));
});

test("the postpone-return route is registered and passes id/smallerTaskId straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone-return"/);
  assert.ok(returnRoute.includes("<PostponementReturnScreen taskId={id} smallerTaskId={smallerTaskId ?? null} />"));
});

// --- Requirement 6: measuring whether the trainee started afterward ---

test("ActiveTaskScreen's performStart (reached via handleStart's required-before-tasks gate) records 'started afterward' on the latest PENDING postponement outcome for this task, as the very first thing it does -- covers every path that ends in actually starting the task (ARC's own menu, the rest screen's hand-off, or just opening the task normally), without threading an outcome id through any of them", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 200);
  assert.match(fnBody, /async function performStart\(\) \{\s*if \(!task\) return;\s*await markOriginalTaskStartedIfPending\(task\.id, new Date\(\)\.toISOString\(\)\);/);
});

test("markOriginalTaskStartedIfPending never overwrites an outcome that's already been resolved, and is a no-op when no postponement is pending for the task", () => {
  const fnIndex = activeTaskScreen.indexOf("async function markOriginalTaskStartedIfPending");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (!latest || latest.startedOriginalTaskAfter !== null) return;"));
});

// --- Requirements 8.6: interrupted-flow / persistence safety ---

test("none of the three new screens ever delete a task or a postponement outcome -- abandoning the flow mid-way must leave both the task and whatever outcome exists untouched (requirement 5: 'if the user leaves the flow before finishing, preserve the task and intervention state')", () => {
  for (const source of [obstacleScreen, restScreen, smallerScreen]) {
    assert.ok(!source.includes("deleteTask("));
    assert.ok(!source.includes("archiveTask("));
  }
});

test("the three new routes are registered in app/_layout.tsx, and each route file passes id/outcomeId straight through with no extra logic of its own", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone-obstacle"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone-rest"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone-smaller"/);
  assert.ok(obstacleRoute.includes("<PostponementObstacleScreen taskId={id} />"));
  assert.ok(restRoute.includes("<PostponementRestScreen taskId={id} outcomeId={outcomeId} />"));
  assert.ok(smallerRoute.includes("<PostponementSmallerTaskScreen taskId={id} outcomeId={outcomeId} />"));
});

test("the pre-existing, more detailed postponement flow (/tasks/[id]/postpone, live/PostponementScreen.tsx) is untouched and still registered -- the new flow is reached ONLY from the alarm's own Postpone action, never replacing the old one", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone" options=\{\{ title: "דחיית המשימה" \}\}/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskAlarmScreen.test.ts
 *
 * Task-alarm task: source-text regression guard for the full-screen
 * ringing UI -- no React Native component test renderer exists in
 * this codebase (every other screen test follows the same
 * convention), so this checks the real source text instead of
 * actually rendering it.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/TaskAlarmScreen.tsx");
const route = readSource("app/tasks/[id]/alarm.tsx");
const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");

test("the route is registered (header hidden -- this is a full-screen takeover, not an ordinary stacked screen) and passes the id param straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/alarm" options=\{\{ title: "שעון מעורר", headerShown: false \}\}/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/TaskAlarmScreen\.tsx["']/);
  assert.ok(route.includes("<TaskAlarmScreen taskId={id} />"));
});

test("requirement 4: the task's own name is shown on the alarm screen", () => {
  assert.ok(screen.includes("{task?.title ?? \"\"}"));
});

test("all three buttons are present (Start, Postpone, Turn off), each calling handleTaskAlarmAction with its own action id -- the exact same handler a notification press would use, never a second, duplicated implementation; Smart Postponement Flow, requirement 1: the old fixed-delay snooze button is gone, replaced by Postpone", () => {
  assert.ok(screen.includes('press("start_task")'));
  assert.ok(screen.includes('press("postpone_obstacle")'));
  assert.ok(screen.includes('press("turn_off")'));
  assert.ok(!screen.includes('press("snooze")'));
  assert.match(screen, /function press\(actionId: string\) \{\s*handleTaskAlarmAction\(actionId, taskId\);/);
});

test("opening the alarm screen itself never starts the task, completes it, or touches the alarm's own armed/ringing state -- only pressing one of the three buttons does anything", () => {
  assert.ok(!screen.includes("startTask") && !screen.includes("completeTask") && !screen.includes("armTaskAlarm") && !screen.includes("disarmTaskAlarm"));
});

// Task-alarm task: starting a task through the NORMAL "התחלה" button
// (live/ActiveTaskScreen.tsx) -- not the alarm's own "Start Task"
// action -- must also silence an alarm currently ringing/pending for
// it, since cancelScheduledNotification alone only knows about
// expo-notifications' own reminders.
test("ActiveTaskScreen's performStart (reached via handleStart's required-before-tasks gate) also silences any notifee-based task alarm, in addition to the pre-existing expo-notifications cancellation", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  // Window widened (6400 -> 6900): the BodySensation task's own
  // markSupportiveBodySensationUsagesTaskOutcome call/comment, inserted
  // near the top of performStart, pushed this line further from the anchor.
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 6900);
  assert.ok(fnBody.includes("await cancelScheduledNotification(task.notificationId);"));
  assert.ok(fnBody.includes("await cancelAnyAlarmFor(task.id);"));
});

// Critical-bug fix ("שעון מעורר אוטומטי לכל משימה"), requirement 4:
// completing/skipping/archiving a task must each cancel its OWN native
// alarm too, not just the old expo-notifications reminder -- otherwise
// a task finished (or thrown away) before its scheduled time still
// rings later, for a task that's already done.
test("ActiveTaskScreen's handleComplete also silences any notifee-based task alarm, in addition to the pre-existing expo-notifications cancellation", () => {
  const fnIndex = activeTaskScreen.indexOf("async function handleComplete()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 3000);
  assert.ok(fnBody.includes("await cancelScheduledNotification(task.notificationId);"));
  assert.ok(fnBody.includes("await cancelAnyAlarmFor(task.id);"));
});

test("ActiveTaskScreen's handleSkipTask cancels the native alarm for THIS occurrence, clearing the task's own notificationId bookkeeping too", () => {
  const fnIndex = activeTaskScreen.indexOf("async function handleSkipTask()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("await cancelAnyAlarmFor(task.id);"));
  assert.ok(fnBody.includes("notificationId: null, notificationScheduledFor: null"));
});

test("TaskEditorScreen's handleArchive also silences any notifee-based task alarm, in addition to the pre-existing expo-notifications cancellation", () => {
  const fnIndex = taskEditorScreen.indexOf("async function handleArchive()");
  const fnBody = taskEditorScreen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("await cancelScheduledNotification(existingTask.notificationId);"));
  assert.ok(fnBody.includes("await cancelAnyAlarmFor(existingTask.id);"));
});

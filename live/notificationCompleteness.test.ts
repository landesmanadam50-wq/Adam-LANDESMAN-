import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/notificationCompleteness.test.ts
 *
 * Productivity roadmap, Stage AB: source-text regression guard for the
 * new notification kinds (rest timer ended, postponed-task return),
 * the contextual in-app permission explanation, and cancellation of
 * obsolete notifications on complete/archive/resume/re-postpone.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const storage = readSource("data/storage.ts");
const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const postponementScreen = readSource("live/PostponementScreen.tsx");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");

test("ReminderKind includes restTimerEnded and postponedTaskReturn, alongside the existing taskTimerEnded", () => {
  assert.match(storage, /"restTimerEnded"/);
  assert.match(storage, /"postponedTaskReturn"/);
});

test("tapping a restTimerEnded or postponedTaskReturn notification deep-links to the task's own screen, the same sanctioned fallback as taskTimerEnded", () => {
  const branchIndex = layout.indexOf('kind === "taskTimerEnded" || kind === "restTimerEnded" || kind === "postponedTaskReturn"');
  assert.ok(branchIndex !== -1);
  assert.match(layout.slice(branchIndex, branchIndex + 250), /pathname:\s*"\/tasks\/\[id\]"/);
});

test("starting the rest sub-timer schedules a 'restTimerEnded' notification, mirroring the main timer's own pattern", () => {
  const fnIndex = activeTaskScreen.indexOf("async function scheduleRestTimerNotification");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes('kind: "restTimerEnded"'));
  assert.ok(fnBody.includes("taskId: currentTask.id"));
});

test("resuming (handleStart) and completing a task both cancel any stale notification already on the task record (e.g. a postponed-return reminder)", () => {
  const startIndex = activeTaskScreen.indexOf("async function handleStart()");
  assert.ok(activeTaskScreen.slice(startIndex, startIndex + 400).includes("if (task.notificationId) await cancelScheduledNotification(task.notificationId)"));
  const completeIndex = activeTaskScreen.indexOf("async function handleComplete()");
  assert.ok(activeTaskScreen.slice(completeIndex, completeIndex + 200).includes("if (task.notificationId) await cancelScheduledNotification(task.notificationId)"));
});

test("re-postponing cancels any EXISTING postponed-return notification before scheduling the new one, never stacking two", () => {
  assert.ok(postponementScreen.includes("await cancelScheduledNotification(task.notificationId)"));
  const fnIndex = postponementScreen.indexOf("async function confirm()");
  const fnBody = postponementScreen.slice(fnIndex, fnIndex + 2000);
  assert.ok(fnBody.includes('kind: "postponedTaskReturn"'));
  assert.ok(fnBody.includes("postponedDraft.returnAt"), "should only schedule when returnAt is a real, specific time -- never for the 'unscheduled' outcome");
});

test("archiving a task cancels any pending notification too", () => {
  const fnIndex = taskEditorScreen.indexOf("async function handleArchive()");
  assert.ok(taskEditorScreen.slice(fnIndex, fnIndex + 250).includes("if (existingTask.notificationId) await cancelScheduledNotification(existingTask.notificationId)"));
});

test("a clear in-app explanation is shown before the OS permission dialog would first appear, dismissible, persisted so it is never shown again", () => {
  assert.match(storage, /export async function hasSeenNotificationExplanation/);
  assert.match(storage, /export async function markNotificationExplanationSeen/);
  assert.ok(activeTaskScreen.includes("showNotificationExplanation &&"));
  assert.ok(activeTaskScreen.includes("await markNotificationExplanationSeen();"));
});

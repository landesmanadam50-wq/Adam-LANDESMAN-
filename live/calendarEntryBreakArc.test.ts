import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/calendarEntryBreakArc.test.ts
 *
 * Fixed Weekly Routine / Flexible Daily Routine task, direct Break/ARC
 * calendar actions: source-text regression guard for
 * live/ActiveTaskScreen.tsx's own performStart handling of
 * Task.calendarEntryKind -- not callable from a plain `node --test`
 * run (React Native component), same convention as every other screen
 * test in this codebase.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

test("a standalone ARC calendar entry (calendarEntryKind === 'arc') never starts a work timer -- performStart routes straight to /tasks/[id]/arc and returns before any TaskTimerRun is created", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const arcBranchIndex = screen.indexOf('if (task.calendarEntryKind === "arc")', fnIndex);
  assert.ok(arcBranchIndex !== -1 && arcBranchIndex > fnIndex, "the arc branch must be inside performStart");
  const branchBody = screen.slice(arcBranchIndex, arcBranchIndex + 220);
  assert.ok(branchBody.includes('router.push({ pathname: "/tasks/[id]/arc", params: { id: task.id } });'));
  assert.ok(branchBody.includes("return;"));
  // Must come before the normal timer-creation code, which this early return guards.
  const timerCreationIndex = screen.indexOf("const run = createTaskTimerRun(task.id, generateTaskTimerRunId(), durationMinutes", fnIndex);
  assert.ok(arcBranchIndex < timerCreationIndex);
});

test("a standalone break calendar entry (calendarEntryKind === 'break') starts a REST timer immediately, reusing createTaskTimerRun's own 'rest' kind and scheduleRestTimerNotification -- never a second timer implementation, never the normal work-timer path", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const breakBranchIndex = screen.indexOf('if (task.calendarEntryKind === "break")', fnIndex);
  assert.ok(breakBranchIndex !== -1 && breakBranchIndex > fnIndex);
  const branchBody = screen.slice(breakBranchIndex, breakBranchIndex + 600);
  assert.ok(branchBody.includes('createTaskTimerRun(task.id, generateTaskTimerRunId(), restMinutes, new Date().toISOString(), "rest")'));
  assert.ok(branchBody.includes("scheduleRestTimerNotification(rest, task)"));
  assert.ok(branchBody.includes("setRestRun(restWithNotification)"));
  assert.ok(branchBody.includes("updateFloatingTimerOverlay(restWithNotification, task, null, nextScheduledTaskForOverlay)"));
  assert.ok(branchBody.includes("return;"));
});

test("the break branch's own rest duration comes from the task's expectedDurationMinutes (set when the break was added to the calendar), falling back to 5 minutes only if that's somehow missing", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const breakBranchIndex = screen.indexOf('if (task.calendarEntryKind === "break")', fnIndex);
  const branchBody = screen.slice(breakBranchIndex, breakBranchIndex + 300);
  assert.ok(branchBody.includes("const restMinutes = task.expectedDurationMinutes ?? 5;"));
});

test("both the arc and break branches sit AFTER the manifest-task early return and BEFORE the normal postponed-notification/alarm-cancellation code, so a standalone calendar entry can never accidentally be treated as a manifest task or inherit unrelated cancellation side effects meant for a real work session", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const manifestIndex = screen.indexOf('if (task.taskKind === "manifest")', fnIndex);
  const arcBranchIndex = screen.indexOf('if (task.calendarEntryKind === "arc")', fnIndex);
  const breakBranchIndex = screen.indexOf('if (task.calendarEntryKind === "break")', fnIndex);
  const postponedNotificationIndex = screen.indexOf("if (task.notificationId) await cancelScheduledNotification(task.notificationId);", fnIndex);
  assert.ok(manifestIndex < arcBranchIndex);
  assert.ok(arcBranchIndex < breakBranchIndex);
  assert.ok(breakBranchIndex < postponedNotificationIndex);
});

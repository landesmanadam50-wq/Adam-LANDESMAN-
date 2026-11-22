import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskSyncActionSelector.test.ts
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: source-text regression
 * guard for live/NewArcLiveScreen.tsx's renderActionSelector() and
 * resolveMinutesUntilNextTask(), matching this codebase's own
 * established convention for screens with no React Native renderer --
 * the real DECISION logic (arc/dailyPlan.ts's resolveCurrentTaskState)
 * has its own genuine, fully-executed unit tests in arc/dailyPlan.test.ts.
 * This file only guards that the screen reads through that ONE central
 * function -- never a second, competing lookup -- and renders the
 * required current-vs-next labels and empty state.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

test("renderActionSelector resolves current/next through the ONE central resolveCurrentTaskState, never the superseded resolveNextScheduledTaskAfter/isScheduledPlanEntryOverdue pair", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("resolveCurrentTaskState(dailyPlanEntries, nowDate, null, taskId)"));
  assert.ok(!fnBody.includes("resolveNextScheduledTaskAfter("), "must never call the superseded lookup");
  assert.ok(!fnBody.includes("isScheduledPlanEntryOverdue("), "must never call the superseded overdue check");
});

test("renderActionSelector shows the genuinely active/current entry labeled 'המשימה כרגע', and only falls back to the nearest not-yet-started entry labeled 'המשימה הקרובה' when nothing is current", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("{currentEntry && ("));
  assert.ok(fnBody.includes("המשימה כרגע"));
  assert.ok(fnBody.includes("{!currentEntry && nextEntry && ("));
  assert.ok(fnBody.includes("המשימה הקרובה"));
});

test("renderActionSelector shows an explicit 'nothing left today' message instead of silently showing nothing when neither current nor next exists", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("{!currentEntry && !nextEntry && ("));
  assert.ok(fnBody.includes("אין משימות נוספות מתוכננות להיום."));
});

test("renderActionSelector's own 'other scheduled tasks today' list excludes whichever entry is already shown as current/next, never double-listing it", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("const shownEntryId = currentEntry?.task.id ?? nextEntry?.task.id ?? null;"));
  assert.ok(fnBody.includes("const laterCandidates = shownEntryId ? candidates.filter((entry) => entry.task.id !== shownEntryId) : candidates;"));
});

test("resolveMinutesUntilNextTask (the temporary-action duration clamp) also reads through resolveCurrentTaskState, so it never clamps against an already-elapsed task", () => {
  const fnIndex = screen.indexOf("function resolveMinutesUntilNextTask(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("resolveCurrentTaskState(scheduled, now, null, excludeTaskId)"));
});

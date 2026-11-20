import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/taskEditorOverride.test.ts
 *
 * Fixed Weekly Routine / Flexible Daily Routine task, "One Unified
 * Task Editor": source-text regression guard for
 * build/TaskEditorScreen.tsx's own occurrenceDate override branch --
 * editing a recurring task FROM the Flexible Daily Routine must touch
 * only that one date's TaskOccurrenceOverride, never the Task record
 * (the Fixed Weekly Routine template) itself.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/TaskEditorScreen.tsx");

test("isOverrideMode is true ONLY for an existing recurring task reached with an occurrenceDate param -- never for a brand-new task or for editing the template itself (no occurrenceDate)", () => {
  assert.match(
    screen,
    /const isOverrideMode = !isNew && occurrenceDate !== null && existingTask !== null && existingTask\.recurrence\.kind === "recurring";/
  );
});

test("handleOverrideSave writes the override via upsertTaskOccurrenceOverrideEntry, then reconciles today's alarm through the shared scheduleTaskAlarm -- never calling upsertTask with the override's own scheduledTime/duration baked onto the shared Task record", () => {
  const fnIndex = screen.indexOf("async function handleOverrideSave()");
  const fnEndIndex = screen.indexOf("\n  }", fnIndex);
  const fnBody = screen.slice(fnIndex, fnEndIndex);
  assert.ok(fnBody.includes("buildTaskOccurrenceOverride(existingTask, occurrenceDate, existingOverride, patch, new Date().toISOString())"));
  assert.ok(fnBody.includes("upsertTaskOccurrenceOverrideEntry(next)"));
  // Integration fix: the alarm must re-sync to the just-saved override immediately.
  assert.ok(fnBody.includes("scheduleTaskAlarm(existingTask, new Date())"));
  assert.ok(fnBody.includes("upsertTask(reconciledTask)"), "only the ALARM reconciliation result (notificationId/notificationScheduledFor) is upserted, never a Task object carrying the override's own time/duration");
});

test("the override-mode render branch shows ONLY time/duration fields (never title/firstAction/recurrence), and explicitly tells the trainee the change is scoped to this date alone", () => {
  const branchIndex = screen.indexOf("if (isOverrideMode) {");
  const nextBranchIndex = screen.indexOf('<Text style={styles.title}>{isNew ? "משימה חדשה"', branchIndex);
  assert.ok(branchIndex !== -1 && nextBranchIndex > branchIndex);
  const branchBody = screen.slice(branchIndex, nextBranchIndex);
  assert.ok(branchBody.includes("עריכת היום הזה בלבד"));
  assert.ok(branchBody.includes("השינוי יחול רק על התאריך הזה"));
  assert.ok(branchBody.includes("overrideTime"));
  assert.ok(branchBody.includes("overrideDuration"));
  assert.ok(!branchBody.includes("draft.title"), "the override-mode branch must never render the full editor's own title field");
});

test("reload() pre-fills overrideTime/overrideDuration from resolveEffectiveOccurrence (template-or-override), never from the raw task fields directly, when occurrenceDate is set", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 1300);
  assert.ok(reloadBody.includes("resolveEffectiveOccurrence(task, occurrenceDate, overrides)"));
  assert.ok(reloadBody.includes("setOverrideTime(effective.scheduledTime ?? \"\")"));
  assert.ok(reloadBody.includes("setOverrideDuration(effective.expectedDurationMinutes !== null ? String(effective.expectedDurationMinutes) : \"\")"));
});

test("the /tasks/[id]/edit route passes occurrenceDate through from its own search params, defaulting to null", () => {
  const route = readSource("app/tasks/[id]/edit.tsx");
  assert.match(route, /occurrenceDate\?: string/);
  assert.match(route, /occurrenceDate=\{occurrenceDate \?\? null\}/);
});

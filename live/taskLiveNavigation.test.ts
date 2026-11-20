import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskLiveNavigation.test.ts
 *
 * ARC-system upgrade task, Part J ("תיקון ניווט המשימות"): source-text
 * regression guard for the three distinct Task LIVE navigation actions
 * -- "Next Task" (peek forward, never completes/skips), "Complete Task"
 * (existing handleComplete, unchanged by this part), and "Skip Task"
 * (new -- journal-only, never Task.status, never the identity-belief
 * flow). Also guards the fixed bug: the end-of-timer "next_task" choice
 * used to dead-end at the plain tasks list instead of opening the next
 * task directly.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");
const todaySchedule = readSource("arc/todaySchedule.ts");
const taskJournal = readSource("data/taskJournal.ts");
const tasksListScreen = readSource("build/TasksListScreen.tsx");
const tasksIndexRoute = readSource("app/tasks/index.tsx");

test("handleNextTask pauses an in-flight, not-yet-ended timer before navigating, then defers to the one shared next-task resolver -- never a second, competing lookup", () => {
  const fnIndex = screen.indexOf("async function handleNextTask()");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await handlePause()"));
  assert.ok(fnBody.includes("navigateToNextOrTasksList(task.id)"));
});

test("handleSkipTask records a plain 'task_skipped' journal entry and never touches Task.status, the timer run, or completeTask", () => {
  const fnIndex = screen.indexOf("async function handleSkipTask()");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes('kind: "task_skipped"'));
  assert.ok(!fnBody.includes("completeTask"));
  assert.ok(!fnBody.includes("clearTaskTimerRun"));
  assert.ok(fnBody.includes("navigateToNextOrTasksList(task.id)"));
});

test("navigateToNextOrTasksList uses resolveNextTaskEntry (never buildTodaySections directly, which would wrongly re-include the current task) and falls back to the tasks list with a flag when nothing is left", () => {
  const fnIndex = screen.indexOf("async function navigateToNextOrTasksList");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("resolveNextTaskEntry(allTasks, completions, excludeTaskId, new Date())"));
  assert.ok(fnBody.includes('pathname: "/tasks", params: { noMoreTasks: "1" }'));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]", params: { id: next.task.id }'));
});

test("the end-of-timer 'next_task' choice is wired to handleNextTask, fixing the bug where it dead-ended at the plain tasks list", () => {
  const nextTaskIndex = screen.indexOf('endChoice === "next_task"');
  const nextTaskBody = screen.slice(nextTaskIndex, nextTaskIndex + 700);
  assert.ok(nextTaskBody.includes("onPress={handleNextTask}"));
});

test("all three actions -- Complete, Next, Skip -- are offered as separate, clearly labeled buttons whenever the task isn't already completed", () => {
  const rowIndex = screen.lastIndexOf('task.status === "completed" || taskCompleting) ?');
  assert.ok(rowIndex !== -1);
  const notCompletedIndex = screen.indexOf(") : !showIdentityInsightPrompt && (", rowIndex);
  assert.ok(notCompletedIndex !== -1);
  const rowBody = screen.slice(notCompletedIndex, notCompletedIndex + 1000);
  assert.ok(rowBody.includes("onPress={handleComplete}"));
  assert.ok(rowBody.includes("onPress={handleNextTask}"));
  assert.ok(rowBody.includes("onPress={handleSkipTask}"));
});

test("resolveNextTaskEntry is exported from arc/todaySchedule.ts, reusing buildTodaySections rather than a second sort mechanism", () => {
  assert.match(todaySchedule, /export function resolveNextTaskEntry/);
  const fnIndex = todaySchedule.indexOf("export function resolveNextTaskEntry");
  const fnBody = todaySchedule.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("buildTodaySections("));
});

test("'task_skipped' is a recognized TaskJournalEntryKind, additive alongside the existing kinds", () => {
  assert.match(taskJournal, /"task_skipped"/);
});

test("the tasks list screen shows an explicit 'nothing left today' message when routed here with noMoreTasks=1, never a silent empty screen", () => {
  assert.match(tasksListScreen, /noMoreTasksToday/);
  assert.ok(tasksListScreen.includes("אין משימות נוספות להיום"));
  assert.match(tasksIndexRoute, /noMoreTasks === "1"/);
});

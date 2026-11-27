import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/manifestTaskLiveScreen.test.ts
 *
 * Productivity & Personal Development upgrade task, requirement 6:
 * source-text regression guard for the Manifest task kind's wiring --
 * route registration, the gate in live/ActiveTaskScreen.tsx that
 * routes a "manifest"-kind task's own "start" into the guided run
 * instead of the plain work timer, build/TaskEditorScreen.tsx's task-
 * kind picker and Step-A setup fields, and completion (recurring vs.
 * one-time). The step engine/copy are fully covered by
 * arc/manifestTaskSteps.test.ts/arc/manifestTaskCopy.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ManifestTaskLiveScreen.tsx");
const route = readSource("app/tasks/[id]/manifest.tsx");
const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");
const storage = readSource("data/storage.ts");

test("the manifest route is registered and passes the id param straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/manifest"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/ManifestTaskLiveScreen\.tsx["']/);
  assert.ok(route.includes("ManifestTaskLiveScreen taskId={id}"));
});

test("live/ActiveTaskScreen.tsx's performStart (reached via handleStart's required-before-tasks gate) routes a 'manifest'-kind task straight into its own guided run, never creating a TaskTimerRun, even via autoStart", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  // Window widened (2000 -> 2900 -> 3200): Action-Based Tasks task's own
  // recomputeTaskMemoryReminderNotification call/comment, then ARCHI --
  // Replan Time task's own recomputeReplanTimeNotification call/comment,
  // both inserted near the top of performStart, pushed this branch
  // further from the anchor.
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 3200);
  assert.ok(fnBody.includes('if (task.taskKind === "manifest")'));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/manifest"'));
});

test("the start button's own label reflects the task kind", () => {
  // ARC Focus task, then ARC Learning/Creativity Review tasks: this
  // ternary grew further branches -- the manifest branch itself is
  // unchanged, still checked first.
  const buttonIndex = activeTaskScreen.indexOf('{task.taskKind === "manifest"');
  const buttonBody = activeTaskScreen.slice(buttonIndex, buttonIndex + 400);
  assert.ok(buttonBody.includes('"התחלת תרגול Manifest"'));
  assert.ok(buttonBody.includes('task.taskKind === "arcFocus"'));
  assert.ok(buttonBody.includes('"התחלת ARC Focus"'));
});

test("build/TaskEditorScreen.tsx offers a deterministic task-kind chip picker (רגילה / Manifest), never free text", () => {
  assert.ok(taskEditorScreen.includes('onPress={() => setDraft({ ...draft, taskKind: "standard" })}'));
  assert.ok(taskEditorScreen.includes('onPress={() => setDraft({ ...draft, taskKind: "manifest" })}'));
});

test("the Step-A setup fields only render when taskKind is 'manifest'", () => {
  assert.match(taskEditorScreen, /\{draft\.taskKind === "manifest" && \(/);
  assert.ok(taskEditorScreen.includes("manifestLongTermGoal"));
  assert.ok(taskEditorScreen.includes("manifestDesiredResult"));
  assert.ok(taskEditorScreen.includes("manifestDesiredIdentity"));
  assert.ok(taskEditorScreen.includes("manifestBodyLanguageDescription"));
});

test("persistence: loadManifestRunState/saveManifestRunState/clearManifestRunState are all exported, single-slot, mirroring loadTaskTimerRun's own shape", () => {
  for (const fn of ["loadManifestRunState", "saveManifestRunState", "clearManifestRunState"]) {
    assert.match(storage, new RegExp(`export async function ${fn}\\(`));
  }
  assert.match(storage, /const MANIFEST_RUN_STATE_KEY = "archi\.manifestRunState\.v1";/);
});

test("the screen resumes an existing persisted run only when its own taskId matches -- otherwise starts a fresh one", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 500);
  assert.ok(reloadBody.includes("existing.taskId === taskId"));
});

test("finishing the run completes a one-time task via the shared completeTask, or a recurring task's TODAY occurrence via the shared createTaskOccurrenceCompletion -- never a third, competing completion mechanism", () => {
  const fnIndex = screen.indexOf("async function finishRun()");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('task.recurrence.kind === "recurring"'));
  assert.ok(fnBody.includes("createTaskOccurrenceCompletion(task.id, new Date())"));
  assert.ok(fnBody.includes("completeTask(task, now)"));
  assert.ok(fnBody.includes("clearManifestRunState()"));
});

test("no path through the Manifest flow ever opens ARC BUILD or the old LIVE chooser", () => {
  assert.ok(!screen.includes('"/build') && !screen.includes('"/live"') && !screen.includes('"/live/select"'));
});

test("Task model: taskKind/manifestProfile are additive -- every pre-existing Task normalizes to 'standard'/null, never breaking old stored data", () => {
  const tasksModule = readSource("arc/tasks.ts");
  assert.match(tasksModule, /taskKind: task\.taskKind \?\? "standard"/);
  assert.match(tasksModule, /manifestProfile: task\.manifestProfile \?\? null/);
});

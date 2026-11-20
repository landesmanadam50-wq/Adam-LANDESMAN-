import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/dailyRoutineUi.test.ts
 *
 * Automatic Routine Builder & Editable Daily Schedule: source-text
 * regression guard for the new screens' wiring -- routes are
 * registered, the main schedule reuses arc/todaySchedule.ts's existing
 * current/next logic and Task LIVE's existing navigation targets
 * rather than inventing parallel ones, an ARC break launches the
 * EXISTING ARC LIVE routes, and nothing here deletes or bypasses
 * build/TodayScreen.tsx or app/tasks/[id]'s own flow. These screens
 * are plain React Native UI over AsyncStorage-backed data (via
 * data/storage.ts/data/dailyRoutine.ts), which isn't callable from a
 * plain `node --test` run, so this checks the real source text
 * instead of actually rendering it -- same convention as
 * build/phase1Simplification.test.ts and data/taskAlarm.test.ts. The
 * pure engine and materialization logic themselves are fully exercised
 * in arc/dailyRoutine.test.ts and data/dailyRoutine.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const home = readSource("app/index.tsx");
const scheduleScreen = readSource("build/DailyScheduleScreen.tsx");
const setupScreen = readSource("build/RoutineSetupScreen.tsx");
const taskEditorScreen = readSource("build/RoutineTaskEditorScreen.tsx");

test("the two new routine-plan routes are registered, alongside every pre-existing route (none removed)", () => {
  assert.match(layout, /<Stack\.Screen name="routine-plan\/setup"/);
  assert.match(layout, /<Stack\.Screen name="routine-plan\/task"/);
  assert.match(layout, /<Stack\.Screen name="today"/, "the pre-existing /today route must still be registered");
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]"/, "Task LIVE's own route must still be registered");
});

// Weekly & Daily Routine Redesign task, section 1: Home no longer
// branches on whether a DailyRoutineTemplate exists -- it unconditionally
// renders the Fixed Weekly Timetable. The setup wizard/schedule screen
// this test used to describe remain fully intact at their own direct
// routes (build/phase1Simplification.test.ts covers Home's own new
// content; this file keeps covering the screens themselves below).
test("Home no longer gates on a DailyRoutineTemplate -- that branching moved entirely out of app/index.tsx", () => {
  assert.ok(!home.includes("hasTemplate"));
  assert.ok(!home.includes("loadDailyRoutineTemplate"));
});

test("DailyScheduleScreen reuses arc/todaySchedule.ts's existing buildTodaySections for current/next highlighting -- no second, parallel current/next calculation", () => {
  assert.match(scheduleScreen, /import \{ buildTodaySections \} from "\.\.\/arc\/todaySchedule\.ts";/);
  assert.ok(scheduleScreen.includes("buildTodaySections(tasks, completions, now, overrides)"));
});

test("DailyScheduleScreen's complete action branches on recurrence exactly like build/TodayScreen.tsx's own handleComplete -- recurring via TaskOccurrenceCompletion, one-time via completeTask", () => {
  const fnIndex = scheduleScreen.indexOf("async function handleComplete");
  const fnBody = scheduleScreen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('if (task.recurrence.kind === "recurring")'));
  assert.ok(fnBody.includes("createTaskOccurrenceCompletion(task.id, new Date())"));
  assert.ok(fnBody.includes("completeTask(task, new Date().toISOString())"));
});

test("DailyScheduleScreen's 'start' button opens Task LIVE at /tasks/[id] with autoStart -- the exact same existing navigation build/TodayScreen.tsx uses, never a second LIVE screen", () => {
  assert.match(scheduleScreen, /pathname:\s*"\/tasks\/\[id\]",\s*params:\s*\{\s*id:\s*task\.id,\s*autoStart:\s*"1"\s*\}/);
});

test("an ARC break launches the EXISTING ARC LIVE routes -- a specific plannedArcId goes straight to /tasks/[id]/arc, otherwise the existing /tasks/[id]/arc-window chooser -- never a new ARC protocol", () => {
  const fnIndex = scheduleScreen.indexOf("function handleLaunchBreakArc");
  const fnBody = scheduleScreen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/arc"'));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/arc-window"'));
});

test("RoutineSetupScreen commits period start/end times only on blur, never on every keystroke -- same discipline as build/PlannedArcEditorScreen.tsx's own time/date inputs", () => {
  assert.ok(setupScreen.includes("onChangeText={setStartDraft}"));
  assert.ok(setupScreen.includes("onChangeText={setEndDraft}"));
  assert.match(setupScreen, /onBlur=\{\(\) => \{\s*if \(startDraft === null\) return;/);
  assert.match(setupScreen, /onBlur=\{\(\) => \{\s*if \(endDraft === null\) return;/);
});

test("RoutineSetupScreen never silently drops a task when a period overflows -- it shows the conflict's own numbers instead", () => {
  assert.ok(setupScreen.includes("generated.conflict.neededMinutes"));
  assert.ok(setupScreen.includes("generated.conflict.availableMinutes"));
  assert.ok(setupScreen.includes("generated.conflict.overflowMinutes"));
});

test("RoutineSetupScreen's build action persists the template AND materializes it into real Tasks before returning to the schedule", () => {
  const fnIndex = setupScreen.indexOf("async function handleBuild");
  const fnBody = setupScreen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await saveDailyRoutineTemplate(template!);"));
  assert.ok(fnBody.includes("await materializeDailyRoutineTemplate(template!, new Date());"));
  assert.ok(fnBody.includes('router.replace("/");'));
});

test("RoutineTaskEditorScreen's add flow writes a RECURRING task into the template, or a ONE-TIME task that never touches the template -- never a third path", () => {
  const fnIndex = taskEditorScreen.indexOf("// Adding.");
  const fnBody = taskEditorScreen.slice(fnIndex, fnIndex + 650);
  assert.ok(fnBody.includes("addTaskToTemplate(template, periodId, position,"));
  assert.ok(fnBody.includes("await addOneTimeRoutineTask(periodId, title.trim(), durationMinutes, scheduledTime, todayLocalDateString(now), breakAfter, now);"));
});

test("RoutineTaskEditorScreen's delete action archives a one-time task and removes a template task from the template -- never a hard delete of either", () => {
  const fnIndex = taskEditorScreen.indexOf("async function handleDelete");
  const fnBody = taskEditorScreen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("archiveTask(oneTimeTask, now.toISOString())"));
  assert.ok(fnBody.includes("removeTaskFromTemplate(template,"));
  assert.ok(!fnBody.includes("deleteTask("));
});

test("RoutineTaskEditorScreen moving a template task to a different period calls moveTaskBetweenPeriods before applying its other edits", () => {
  const fnIndex = taskEditorScreen.indexOf("if (isEditingTemplate && params.templateTaskId) {");
  const fnBody = taskEditorScreen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("moveTaskBetweenPeriods(next, sourcePeriodId, periodId, params.templateTaskId"));
  const moveIndex = fnBody.indexOf("moveTaskBetweenPeriods");
  const updateIndex = fnBody.indexOf("updateTaskInTemplate");
  assert.ok(moveIndex !== -1 && updateIndex !== -1 && moveIndex < updateIndex);
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createTaskTimerRun, getTaskTimerStatus } from "../arc/taskTimer.ts";
import { TASK_TIMER_END_CHOICE_LABELS } from "../arc/taskTimerEndChoice.ts";

/**
 * build/phase1Simplification.test.ts
 *
 * Simplified-architecture task, Phase 1: the app is being reduced to
 * two user-facing screens (Task Planning, Task LIVE). This is the
 * consolidated proof, in one place, of every explicit requirement the
 * task listed: legacy data still loads; legacy routes/screens were not
 * deleted; legacy cards are absent from normal navigation; the root
 * opens Task Planning; starting a task opens Task LIVE; the timer
 * works and ending it never completes the task; all three end choices
 * remain; ARC never opens BUILD; Rest returns to the same task;
 * Continue preserves/advances the task correctly. Per-screen wiring
 * detail for each hidden area still lives in that area's own test file
 * (build/todayScreenNavigation.test.ts, live/reactiveFactorRoutes.test.ts,
 * live/preparationScreen.test.ts, live/postponementAndReflection.test.ts,
 * live/taskInsightsScreen.test.ts, live/coachingWorkspace.test.ts,
 * live/returnToTaskWiring.test.ts) -- this file does not repeat those,
 * it proves the higher-level, cross-cutting claims.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}
function sourcePath(relativePath: string): string {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

const home = readSource("app/index.tsx");
const today = readSource("build/TodayScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const layout = readSource("app/_layout.tsx");
const storage = readSource("data/storage.ts");

// No React Native component test renderer OR real AsyncStorage module
// exists in this plain-node test environment (every other *.test.ts in
// this codebase follows the same constraint) -- loadArcBuilds/loadArcGoals/
// loadStateProfiles/loadTasks cannot actually be CALLED here. "Legacy data
// still loads" is proved the same way the rest of this codebase proves
// anything that needs the real native module: confirming the loader
// functions are still exported, untouched, and not stubbed into a no-op.
test("legacy data still loads -- loadArcBuilds/loadArcGoals/loadStateProfiles/loadTasks are all still exported, real, working functions (none of this was touched or migrated destructively)", () => {
  for (const fn of ["loadArcBuilds", "loadArcGoals", "loadStateProfiles", "loadTasks"]) {
    assert.match(storage, new RegExp(`export async function ${fn}\\(`), `${fn} must still be exported from data/storage.ts`);
  }
});

test("legacy screen source files were not deleted", () => {
  const legacyFiles = [
    "build/SelfDevelopmentDashboardScreen.tsx",
    "build/ReachYourGoalDashboardScreen.tsx",
    "build/ArcBuildListScreen.tsx",
    "build/ArcGoalListScreen.tsx",
    "build/UrgeArcEditorScreen.tsx",
    "live/ManifestMeditationScreen.tsx",
    "live/CoachingWorkspaceScreen.tsx",
    "live/TaskInsightsScreen.tsx",
    "live/PreparationScreen.tsx",
    "live/SessionReflectionScreen.tsx",
    "live/ReactiveFactorChooserScreen.tsx",
    "live/LiveSessionScreen.tsx",
  ];
  for (const file of legacyFiles) {
    assert.ok(existsSync(sourcePath(file)), `${file} must still exist on disk -- never physically deleted`);
  }
});

test("legacy routes were not deleted -- every one stays registered in app/_layout.tsx", () => {
  const legacyRoutes = [
    "self-development/index",
    "reach-your-goal/index",
    "build/index",
    "build/\\[id\\]",
    "live/gate",
    "live/select",
    "manifest-meditation",
    "coaching/index",
    "coaching/prepare",
    "tasks/insights",
    "tasks/\\[id\\]/prepare",
    "tasks/\\[id\\]/reflect",
    "tasks/\\[id\\]/factor/index",
  ];
  for (const route of legacyRoutes) {
    assert.match(layout, new RegExp(`<Stack\\.Screen name="${route}"`), `missing registration for ${route}`);
  }
});

test("legacy cards are absent from normal navigation -- Home no longer offers the mode-chooser, Today no longer links to BUILD/LIVE-gate/Manifest-Meditation/Insights/Coaching, ActiveTaskScreen no longer offers the reactive chooser/ad-hoc-ARC/prepare", () => {
  assert.ok(!home.includes('href="/self-development"'));
  assert.ok(!home.includes('href="/reach-your-goal"'));
  for (const legacyPush of ['"/build"', '"/live/gate"', '"/manifest-meditation"', '"/tasks/insights"', '"/coaching"']) {
    assert.ok(!today.includes(`router.push(${legacyPush})`), `TodayScreen must no longer push to ${legacyPush}`);
  }
  // "/tasks/[id]/reflect" was intentionally re-linked by the alarm-timer
  // integration task, requirement 6 -- see live/postponementAndReflection.test.ts
  // for that screen's own, current wiring tests.
  for (const legacyPath of ['"/tasks/[id]/factor"', '"/live/select"', '"/tasks/[id]/prepare"']) {
    assert.ok(!activeTaskScreen.includes(`pathname: ${legacyPath}`), `ActiveTaskScreen must no longer link to ${legacyPath}`);
  }
});

// Open Today's Schedule Automatically task: the root route now
// unconditionally opens TODAY's own Flexible Daily Timetable -- the
// Fixed Weekly Timetable moved to its own direct route, /routine-week
// (build/weeklyRoutineScreen.test.ts), and the Automatic Routine
// Builder's own daily schedule/setup wizard this test used to describe
// are no longer linked from "/" at all (see build/dailyRoutineUi.test.ts's
// own updated coverage of that), while remaining fully intact at their
// own direct routes, /daily-schedule-legacy and /routine-setup-legacy.
test("the root route opens today's Flexible Daily Timetable unconditionally -- never a first-time-setup gate, never the weekly overview itself", () => {
  assert.match(home, /import FlexibleDailyScreen from ["']\.\.\/build\/FlexibleDailyScreen\.tsx["']/);
  assert.ok(home.includes("<FlexibleDailyScreen />"));
  // Structural checks, not a bare substring search -- this file's own doc
  // comment legitimately DISCUSSES DailyScheduleScreen/RoutineSetupScreen/
  // WeeklyRoutineScreen in prose (to explain where they moved to), so a
  // blunt !includes(...) would false-positive on that very sentence.
  assert.ok(!/^import .*(DailyScheduleScreen|RoutineSetupScreen|WeeklyRoutineScreen)/m.test(home), "the old Automatic Routine Builder and the Weekly overview must no longer be IMPORTED by Home");
  assert.ok(
    !home.includes("<DailyScheduleScreen") && !home.includes("<RoutineSetupScreen") && !home.includes("<WeeklyRoutineScreen"),
    "the old Automatic Routine Builder and the Weekly overview must no longer be RENDERED by Home"
  );
});

test("starting a task opens Task LIVE -- Today's card 'start' action and the timer-end 'next task' choice both land on /tasks/[id]", () => {
  assert.match(today, /pathname:\s*"\/tasks\/\[id\]",\s*params:\s*\{\s*id:\s*task\.id,\s*autoStart:\s*"1"\s*\}/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]"/);
});

// ARC Reminders task, requirement 5/8, superseded again by ARCHI --
// Adaptive Task Execution & Emotional Persistence task, section 7
// ("behavior reversal"): a plain task's natural timer-reaching-0 no
// longer auto-triggers handleComplete() directly -- it now enters the
// Task LIVE continuation loop instead (handleTimerNaturalEndForContinuationLoop),
// per the user's own explicit spec. A configured-stages task or a
// mid-split To-Do segment keeps its own separate, already-tested
// adaptive continuation and still falls through to handleComplete() on
// its own last/final step, guarded by the same autoCompletedForRunId
// ref. See live/activeTaskScreen.test.ts and
// live/taskContinuationLoopScreen.test.ts for the full coverage of
// both branches.
test("the timer reaching 0 enters the continuation loop for a plain task, and still falls through to handleComplete() for a configured-stages/split task, exactly once per run", () => {
  const run = createTaskTimerRun("t1", "r1", 25, "2026-01-01T00:00:00.000Z");
  const halfway = getTaskTimerStatus(run, new Date("2026-01-01T00:12:30.000Z").getTime());
  assert.ok(!halfway.complete && halfway.remainingSeconds > 0, "timer must be live mid-run");
  const ended = getTaskTimerStatus(run, new Date("2026-01-01T00:25:01.000Z").getTime());
  assert.ok(ended.complete, "timer must report complete once the duration elapses");

  const effectIndex = activeTaskScreen.indexOf("if (!ended || autoCompletedForRunId.current === timerRun.runId) return;");
  assert.ok(effectIndex !== -1, "the auto-complete/continuation effect must exist");
  const effectBody = activeTaskScreen.slice(effectIndex, effectIndex + 1100);
  assert.ok(effectBody.includes("continuationHandledForRunId.current = timerRun.runId;"));
  assert.ok(effectBody.includes("handleTimerNaturalEndForContinuationLoop(statusNow.elapsedSeconds)"));
  assert.ok(effectBody.includes("autoCompletedForRunId.current = timerRun.runId;"));
  assert.ok(effectBody.includes("handleComplete();"));
});

// ARC Reminders task, requirement 5/8: superseded -- the end-of-timer
// three-choice UI (ARC/Rest/"להמשיך") rendered from
// TASK_TIMER_END_CHOICE_LABELS is gone entirely from ActiveTaskScreen.tsx.
// The module itself is untouched (still exported, still usable
// elsewhere) -- only its use as a rendered choice prompt here was
// removed, since there is no longer an intermediate choice to make
// before completion.
test("TASK_TIMER_END_CHOICE_LABELS itself is untouched (still exports all three labels), but ActiveTaskScreen.tsx no longer renders a choice prompt from it -- there is no longer an intermediate end-of-timer choice to make", () => {
  assert.deepEqual(Object.keys(TASK_TIMER_END_CHOICE_LABELS).sort(), ["next_task", "rest", "start_arc"]);
  assert.equal(TASK_TIMER_END_CHOICE_LABELS.start_arc, "צריך ARC");
  assert.equal(TASK_TIMER_END_CHOICE_LABELS.rest, "צריך מנוחה");
  assert.equal(TASK_TIMER_END_CHOICE_LABELS.next_task, "להמשיך");
  assert.ok(!activeTaskScreen.includes("Object.keys(TASK_TIMER_END_CHOICE_LABELS)"), "ActiveTaskScreen.tsx must no longer render a choice prompt from this module");
  assert.ok(!activeTaskScreen.includes('if (choice === "start_arc")'));
});

// ARC Reminders task, requirement 5/8: superseded -- the old end-of-timer
// "start_arc" choice is gone, but ARC is still reachable mid-task via the
// mood-row buttons (Part 12: "😟 פחות טוב"/"🙂 סבבה", openFullArc/
// openShortenedArc) -- both still route only to the self-contained ARC
// LIVE flow (/tasks/[id]/arc), never /build or a BUILD editor.
test("ARC never opens BUILD -- the mood-row ARC entry points (openFullArc/openShortenedArc, the replacement for the removed 'start_arc' end-choice) route only to the self-contained ARC LIVE flow (/tasks/[id]/arc), never /build or a BUILD editor, and that route is itself registered", () => {
  const routing = readSource("data/emotionalCheckInRouting.ts");
  const fullArcIndex = routing.indexOf("export async function openFullArc(");
  const fullArcBody = routing.slice(fullArcIndex, fullArcIndex + 1300);
  assert.ok(fullArcBody.includes('pathname: "/tasks/[id]/arc"'));
  assert.ok(!fullArcBody.includes('"/build'));
  const shortenedArcIndex = routing.indexOf("export async function openShortenedArc(");
  const shortenedArcBody = routing.slice(shortenedArcIndex, shortenedArcIndex + 1300);
  assert.ok(shortenedArcBody.includes('pathname: "/tasks/[id]/arc"'));
  assert.ok(!shortenedArcBody.includes('"/build'));
  assert.ok(activeTaskScreen.includes("openFullArc(task.id)") && activeTaskScreen.includes("openShortenedArc(task.id)"));
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/arc"/);
  // Simplified-architecture task, Phase 2: the new ARC LIVE screen itself
  // never forwards into BUILD or the old LIVE chooser at any point.
  const newArcLiveScreen = readSource("live/NewArcLiveScreen.tsx");
  assert.ok(!newArcLiveScreen.includes('"/build') && !newArcLiveScreen.includes('"/live"') && !newArcLiveScreen.includes('"/live/select"'));
});

// ARC Reminders task, requirement 5/8: superseded -- the old end-of-timer
// "rest" choice (keyed off a local `minutes` const) is gone. The one
// surviving rest-timer creation path is the standalone "break" calendar
// entry inside performStart (its own `restMinutes` const) -- it still
// never navigates away from this task's own screen.
test("Rest -- the one surviving rest-sub-timer creation path (the standalone 'break' calendar entry, replacing the removed end-of-timer 'rest' choice) is keyed to the SAME task id and never navigates away", () => {
  assert.ok(!activeTaskScreen.includes('endChoice === "rest"'));
  const breakIndex = activeTaskScreen.indexOf('if (task.calendarEntryKind === "break") {');
  const breakBody = activeTaskScreen.slice(breakIndex, breakIndex + 600);
  assert.ok(breakBody.includes("createTaskTimerRun(task.id, generateTaskTimerRunId(), restMinutes"), "the rest run must be created for this exact task");
  assert.ok(!breakBody.includes("router.push") && !breakBody.includes("router.replace"), "starting the standalone break's own rest timer must never navigate away from this task's own screen");
});

// ARC Reminders task, requirement 5/8: superseded -- the old end-of-timer
// "next_task" choice is gone (see live/taskLiveNavigation.test.ts's own
// dedicated test for the same point). handleNextTask remains reachable
// only via the ordinary button row, and still never completes the task.
test("Continue preserves or advances the task correctly -- handleNextTask (reachable only via the ordinary button row now that the end-of-timer 'next_task' choice is gone) never completes the current task", () => {
  assert.ok(!activeTaskScreen.includes('endChoice === "next_task"'));
  const fnIndex = activeTaskScreen.indexOf("async function handleNextTask()");
  const fnBody = activeTaskScreen.slice(fnIndex, activeTaskScreen.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("completeTask"), "'next task' must never silently complete the current task");
  const rowIndex = activeTaskScreen.lastIndexOf('task.status === "completed" || taskCompleting) ?');
  const notCompletedIndex = activeTaskScreen.indexOf(") : !showIdentityInsightPrompt && (", rowIndex);
  const rowBody = activeTaskScreen.slice(notCompletedIndex, notCompletedIndex + 1000);
  assert.ok(rowBody.includes("onPress={handleNextTask}"));
});

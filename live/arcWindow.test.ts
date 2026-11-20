import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcWindow.test.ts
 *
 * ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן"), Part 2:
 * source-text regression guard for the optional ARC-window feature --
 * the editor field, the Today-screen row, the Task LIVE pre-start
 * button, the post-completion redirect, the chooser screen itself, and
 * its route/registration. The underlying data (arc/tasks.ts,
 * arc/taskDraft.ts, arc/todaySchedule.ts) and the planned-ARC prefill
 * mechanism (arc/newArcLiveSteps.ts, arc/plannedArc.ts) are covered by
 * their own test files.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const editorScreen = readSource("build/TaskEditorScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const windowScreen = readSource("live/ArcWindowScreen.tsx");
const windowRoute = readSource("app/tasks/[id]/arc-window.tsx");
const layout = readSource("app/_layout.tsx");
const newArcLiveScreen = readSource("live/NewArcLiveScreen.tsx");

test("TaskEditorScreen offers a deterministic chip picker for the ARC window (ללא/5/10/15), never free-text minutes", () => {
  assert.ok(editorScreen.includes('onPress={() => setDraft({ ...draft, arcWindowMinutesBefore: "" })}'));
  assert.ok(editorScreen.includes('onPress={() => setDraft({ ...draft, arcWindowMinutesBefore: minutes })}'));
});

test("the ARC-window route is registered and passes the id param straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/arc-window"/);
  assert.match(windowRoute, /from ["']\.\.\/\.\.\/\.\.\/live\/ArcWindowScreen\.tsx["']/);
  assert.ok(windowRoute.includes("ArcWindowScreen taskId={id}"));
});

test("Today shows the ARC window as its own tappable row, computed from resolveArcWindowClockTime -- never rendered when the task has no window", () => {
  assert.ok(todayScreen.includes("resolveArcWindowClockTime(task, entry.occurrenceDateLocal)"));
  assert.ok(todayScreen.includes("{arcWindowClock && ("));
  assert.ok(todayScreen.includes('pathname: "/tasks/[id]/arc-window"'));
});

test("Task LIVE's pre-start block offers the ARC-window button ONLY when the task has one set, and the plain 'התחלה' button is never gated behind it", () => {
  const preStartIndex = activeTaskScreen.indexOf("{!showIdentityInsightPrompt && !timerRun && !restRun && !timerEnded && (");
  const preStartBlock = activeTaskScreen.slice(preStartIndex, preStartIndex + 2900);
  assert.ok(preStartBlock.includes("task.arcWindowMinutesBefore !== null && ("));
  assert.ok(preStartBlock.includes('pathname: "/tasks/[id]/arc-window"'));
  const startButtonIndex = preStartBlock.indexOf("onPress={handleStart}");
  const windowCheckIndex = preStartBlock.indexOf("task.arcWindowMinutesBefore !== null");
  assert.ok(startButtonIndex !== -1 && windowCheckIndex !== -1 && startButtonIndex < windowCheckIndex, "the window button must be ADDITIONAL, never required before the start button");
});

// Psychology/Smiling/Positive-Reinforcement task: advanceToNextTask moved
// from live/SessionReflectionScreen.tsx into live/PostTaskRewardScreen.tsx
// verbatim -- that screen is now what actually performs this redirect,
// once reached via reflect's own finish/skip (see live/postponementAndReflection.test.ts).
test("advanceToNextTask (live/PostTaskRewardScreen.tsx, reached after task completion) redirects to the next task's own ARC window ONLY when that specific task has one set -- never auto-inserted for a task that doesn't", () => {
  const rewardScreen = readSource("live/PostTaskRewardScreen.tsx");
  const fnIndex = rewardScreen.indexOf("async function advanceToNextTask");
  const fnBody = rewardScreen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes('const pathname = next.task.arcWindowMinutesBefore !== null ? "/tasks/[id]/arc-window" : "/tasks/[id]";'));
});

test("the chooser screen offers exactly three choices -- spontaneous (always), Full planned (only when drafts exist), and skip (never marks the task complete) -- ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task: the 'Mini ARC מתוכנן' menu entry is gone, since Mini ARC is no longer a user-choosable option anywhere", () => {
  assert.ok(windowScreen.includes("startSpontaneous"));
  assert.ok(windowScreen.includes("fullDrafts.length > 0 && ("));
  assert.ok(!windowScreen.includes("miniDrafts"), "the Mini-planned-ARC list/state must be gone entirely");
  const skipFnIndex = windowScreen.indexOf("function skip()");
  const skipFnBody = windowScreen.slice(skipFnIndex, skipFnIndex + 200);
  assert.ok(skipFnBody.includes('pathname: "/tasks/[id]"'));
  assert.ok(!skipFnBody.includes("completeTask") && !skipFnBody.includes("status"), "skip must never touch the task's own status/completion");
});

test("running a planned ARC only navigates with the draft's id -- ARC session-resume conflict fix: prefill-building and resume/conflict detection are centralized in NewArcLiveScreen.tsx's own reload(), never duplicated or pre-saved here", () => {
  const fnIndex = windowScreen.indexOf("function runPlannedArc");
  const fnBody = windowScreen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('{ id: taskId, plannedArcId: item.id, autoStartAfter: "1" }'));
  assert.ok(fnBody.includes("{ id: taskId, plannedArcId: item.id }"));
  assert.ok(!windowScreen.includes("saveNewArcLiveSession") && !windowScreen.includes("createSessionFromPlannedArcFields") && !windowScreen.includes("resolvePlannedArcPrefillFields"));
});

// Alarm-timer integration task, requirement 4: "the timer will start
// after ARC completes or is skipped" -- only when this screen was
// reached from the real alarm's own "Start Task" button (autoStartAfter).
test("autoStartAfter is forwarded (never invented) to every one of the three ARC-starting actions, and makes 'דילוג' auto-start the task's timer instead of landing on the plain pre-start screen", () => {
  const skipIndex = windowScreen.indexOf("function skip()");
  const skipBody = windowScreen.slice(skipIndex, skipIndex + 200);
  assert.ok(skipBody.includes('autoStartAfter ? { id: taskId, autoStart: "1" } : { id: taskId }'));

  const spontaneousIndex = windowScreen.indexOf("function startSpontaneous()");
  const spontaneousBody = windowScreen.slice(spontaneousIndex, spontaneousIndex + 300);
  assert.ok(spontaneousBody.includes("autoStartAfter: \"1\""));

  const runPlannedIndex = windowScreen.indexOf("function runPlannedArc");
  const runPlannedBody = windowScreen.slice(runPlannedIndex, runPlannedIndex + 400);
  assert.ok(runPlannedBody.includes("autoStartAfter: \"1\""));
});

test("every other, non-alarm entry point into this screen (autoStartAfter defaults to false) keeps skipping behave exactly as before -- landing on the plain pre-start screen, never auto-starting anything", () => {
  assert.match(windowScreen, /autoStartAfter = false/);
});

test("no path through the ARC-window screen ever opens /build or the old /live /live/select chooser", () => {
  assert.ok(!windowScreen.includes('"/build') && !windowScreen.includes('"/live"') && !windowScreen.includes('"/live/select"'));
});

test("the ARC-window screen never touches task start/completion state at all -- entering, completing, or skipping it can never delay or block the scheduled task itself", () => {
  assert.ok(!windowScreen.includes("startTask") && !windowScreen.includes("completeTask") && !windowScreen.includes("createTaskTimerRun") && !windowScreen.includes("handlePause"));
});

test("Unified ARC & Productivity Update task, requirement 4: no local mantra/belief drafts exist any more (the free-text belief-building screen is removed) -- mini_encoding reads miniBeliefText directly off the session itself, so a PlannedArc-prefilled belief still survives through to the final persisted value, with no local draft state to (re)initialize at all", () => {
  assert.ok(!newArcLiveScreen.includes("miniMantraDraft"), "the local mantra draft is gone entirely");
  assert.ok(!newArcLiveScreen.includes("miniBeliefDraft"), "the local belief draft is gone entirely");
  const caseIndex = newArcLiveScreen.indexOf('case "mini_encoding":');
  const nextCaseIndex = newArcLiveScreen.indexOf('\n      default:', caseIndex);
  const caseBody = newArcLiveScreen.slice(caseIndex, nextCaseIndex);
  assert.ok(caseBody.includes('setMiniEncoding(session!, resolveEncodingMantra(session!), session!.miniBeliefText ?? "", now)'));
});

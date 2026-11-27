/**
 * Source-text wiring checks for the ARC Addiction screens (React
 * Native components are not rendered under node --test in this repo).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function path(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}
function read(rel: string): string {
  return readFileSync(path(rel), "utf8");
}

const layout = read("app/_layout.tsx");
const session = read("live/ArcAddictionSessionScreen.tsx");
const runner = read("live/components/ArcAddictionArcRunner.tsx");
const home = read("build/ArcAddictionHomeScreen.tsx");
const editor = read("build/ArcAddictionProfileEditorScreen.tsx");
const progress = read("live/ArcAddictionProgressScreen.tsx");
const memory = read("live/components/ArcAddictionSuccessMemory.tsx");
const flexibleDaily = read("build/FlexibleDailyScreen.tsx");

test("routes exist and are registered in the root Stack", () => {
  for (const file of ["app/arc-addiction/index.tsx", "app/arc-addiction/session.tsx", "app/arc-addiction/profile/[id].tsx", "app/arc-addiction/progress/[id].tsx"]) {
    assert.ok(existsSync(path(file)), file);
  }
  for (const name of ["arc-addiction/index", "arc-addiction/profile/[id]", "arc-addiction/session", "arc-addiction/progress/[id]"]) {
    assert.ok(layout.includes(`<Stack.Screen name="${name}"`), name);
  }
});

test("ARC Addiction is listed among the ARC route cards on the home screen", () => {
  assert.match(flexibleDaily, /router\.push\("\/arc-addiction"\)/);
  assert.match(flexibleDaily, /ARC Addiction — מסוגלות, זמן וקבלה/);
});

test("home: one-tap quick start per saved profile, active session resume, conflict instead of a duplicate session", () => {
  assert.match(home, /מרגיש דחף עכשיו/);
  assert.match(home, /startAddictionSession\(profileId, taskId, \{ replaceExisting \}\)/);
  assert.match(home, /result\.status === "conflict"/);
  assert.match(home, /המשך התרגול הפעיל/);
  assert.match(home, /ARC_ADDICTION_DISCLAIMER/);
  assert.match(home, /returnToTaskId/);
});

test("profile editor: all profile fields, user-chosen initial wait (default 1), harm flag, editable pace", () => {
  for (const field of ["urgeSensation", "urgeBodyAreas", "mayCauseBodilyHarm", "waitTargetMinutes", "waitProgression", "durationProgression", "behaviorDurationTargetMinutes", "supportiveSensations"]) {
    assert.ok(editor.includes(field), field);
  }
  assert.match(editor, /initialWaitMinutes: DEFAULT_INITIAL_WAIT_MINUTES/);
  assert.match(editor, /להישאר באותו יעד/);
  assert.match(editor, /validateAddictionProfile\(profile\)/);
});

test("session screen: every change goes through the serialized session service", () => {
  assert.match(session, /dispatchAddictionEvent\(event\)/);
  assert.match(session, /subscribeAddictionSession\(/);
  assert.match(session, /loadCurrentAddictionSession\(\)/);
  assert.ok(!session.includes("AsyncStorage"), "the screen never writes storage directly");
});

test("session screen: the exact decision question with כן / לא, and the intensity question", () => {
  assert.match(session, /ARC_ADDICTION_DECISION_QUESTION/);
  assert.match(session, /choice: "not_act", episodeId/);
  assert.match(session, /choice: "act", episodeId/);
  assert.match(session, /ARC_ADDICTION_INTENSITY_QUESTION/);
  assert.match(session, /resolveIntensityChoices\(route\)/);
});

test("session screen: skip / end early / acted / end practice are always reachable", () => {
  assert.match(session, /type: "END_WAIT_EARLY"/);
  assert.match(session, /type: "ACTED"/);
  assert.match(session, /type: "END_SESSION"/);
  assert.match(session, /type: "SKIP_TO_WAIT"/);
  assert.match(runner, /דלג על התרגיל/);
  assert.match(session, /onSkip=\{\(\) => \{/);
});

test("session screen: the wait is wall-clock based and reaching zero advances once", () => {
  assert.match(session, /getWaitRemainingSeconds\(activeWait, new Date\(now\)\.toISOString\(\)\)/);
  assert.match(session, /elapsedDispatchedFor\.current === activeWait\.endsAt/);
  assert.match(session, /type: "WAIT_ELAPSED"/);
});

test("harmful behaviors: no stopwatch offered, retrospective logging only", () => {
  const behavior = session.slice(session.indexOf('case "behavior_log"'), session.indexOf('case "closing"'));
  assert.match(behavior, /\{!session!\.mayCauseBodilyHarm && \(/);
  assert.ok(behavior.indexOf("START_STOPWATCH") > behavior.indexOf("!session!.mayCauseBodilyHarm && ("));
  assert.match(behavior, /BEHAVIOR_LOG_HARM_NOTE/);
  assert.match(behavior, /durationMinutes: null/);
});

test("closing: progress shown without reset; success memory offered only after choosing not to act", () => {
  const closing = session.slice(session.indexOf('case "closing"'));
  assert.match(closing, /PROGRESS_NOT_RESET_NOTE/);
  assert.match(closing, /outcome === "resisted" && <ArcAddictionSuccessMemoryControls/);
  assert.match(closing, /type: "MEMORY_SAVED"/);
});

test("Task LIVE: a session started from a task returns to it; the wait screen can go back while the timer keeps running", () => {
  assert.match(session, /router\.replace\(\{ pathname: "\/tasks\/\[id\]", params: \{ id: taskId \} \}\)/);
  assert.match(session, /חזרה למשימה \(הטיימר ממשיך\)/);
});

test("ARC runner reuses the existing ARC components and the supportive-sensation bank", () => {
  assert.match(runner, /import ArcBodyMantraCircle from "\.\/ArcBodyMantraCircle\.tsx"/);
  assert.match(runner, /import BodyMapMagnifier from "\.\/BodyMapMagnifier\.tsx"/);
  assert.match(runner, /resolveSuggestedBodySensations\(\[contextKey\], usages, 4\)/);
  assert.match(runner, /recordBodySensationDiscovery\(/);
  assert.match(runner, /recordBodySensationRating\(/);
  assert.match(runner, /mergeHelpfulSupportiveSensation\(/);
  assert.match(runner, /SUPPORTIVE_SENSATION_OPTIONS/);
});

test("ARC runner: double completion is guarded", () => {
  assert.match(runner, /if \(completingRef\.current\) return;/);
});

test("success memory: saved once (ref guard), and offered in later efficacy ARCs via the shared selection history", () => {
  assert.match(memory, /if \(savingRef\.current\) return;/);
  assert.match(memory, /upsertPositiveMemoryEntry\(memory\)/);
  assert.match(memory, /recordPositiveMemorySelection\(history, picked\.id, "arc_addiction", profileId/);
  assert.match(session, /useAddictionSuccessMemory\(session\?\.episode\.profileId \?\? null, session\?\.stage === "efficacy_arc"\)/);
});

test("progress screen: every requested metric and pace control", () => {
  for (const label of ["זמן ההמתנה לפני ההתנהגות", "משך ההתנהגות בפועל", "תדירות ההתנהגות", "עוצמת הדחף", "תחושת המסוגלות", "קבלה עצמית", "פעמים שבחרת שלא לפעול", "היסטוריית תרגולים"]) {
    assert.ok(progress.includes(label), label);
  }
  assert.match(progress, /להישאר באותו יעד/);
  assert.match(progress, /להקטין את היעד בדקה/);
  assert.match(progress, /PROGRESS_NOT_RESET_NOTE/);
});

test("session screen: a stored echo of the running ARC never rolls back the local (possibly newer) copy", () => {
  const apply = session.slice(session.indexOf("const applySession = useCallback"), session.indexOf("const reload = useCallback"));
  assert.match(apply, /previous\.kind === incoming\.kind && previous\.startedAt === incoming\.startedAt\) return previous;/);
});

test("review fix: WAIT_ELAPSED is never dropped by the busy guard; pending ARC edits are flushed on unmount", () => {
  assert.match(session, /event\.type !== "ARC_UPDATE" && event\.type !== "WAIT_ELAPSED"/);
  assert.match(session, /if \(pendingArcRef\.current\) void dispatchAddictionEvent\(\{ type: "ARC_UPDATE", arc: pendingArcRef\.current \}\);/);
});

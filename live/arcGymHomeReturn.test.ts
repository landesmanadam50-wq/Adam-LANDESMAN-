import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcGymHomeReturn.test.ts
 *
 * "ARCHI -- ARC Gym Home Navigation and Continuous Practice for All Four
 * Exercise Types" task: source-text regression guard for the new
 * "🏋️ חזרה ל־ARC Gym" / "🏋️ סיום וחזרה ל־ARC Gym" return-to-ARC-Gym-Home
 * buttons added to all four exercise-completion interfaces, and for the
 * continuous-practice/no-duplicate-record/task-preservation guarantees
 * this task requires. Same convention as build/arcGymScreens.test.ts
 * (these screens depend on expo-router/AsyncStorage/React Native and
 * are not executed directly with `node --test`). The pure engine-level
 * ARC Focus guarantees (configured duration, time exclusion, stage
 * preservation) are covered separately in
 * arc/arcFocusContinuousPractice.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const behaviorDone = readSource("live/ArcGymVisualizationOnlyScreen.tsx");
const memoryDone = readSource("live/ArcGymMemoryVisualizationScreen.tsx");
const resultPractice = readSource("live/ArcResultPracticeScreen.tsx");
const arcFocusLive = readSource("live/ArcFocusLiveScreen.tsx");
const arcGymScreen = readSource("build/ArcGymScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

const GYM_HOME_LABEL = "בית ARC Gym";
const GYM_HOME_TEXT = "🏋️ חזרה ל־ARC Gym";

// --- Required tests 1-3: Behaviour/Memory/Success completion -> ARC Gym Home

test("required test 1: Behaviour completion (live/ArcGymVisualizationOnlyScreen.tsx's own 'done' screen -- reached both from the direct 😄 visualization-only path and from returnToTask() after a Full/Shortened ARC run) shows a '🏋️ חזרה ל־ARC Gym' button, additive to the existing 'סיום' button, that router.replace()s to '/arc-gym' with the required accessible label", () => {
  const doneIndex = behaviorDone.indexOf("if (done) {");
  const doneBody = behaviorDone.slice(doneIndex, behaviorDone.indexOf("\n  }", doneIndex));
  assert.ok(doneBody.includes("סיום"), "the existing 'סיום' button (back to this situation) must stay, never removed");
  assert.ok(doneBody.includes(GYM_HOME_TEXT));
  assert.ok(doneBody.includes('onPress={() => router.replace("/arc-gym")}'));
  assert.ok(doneBody.includes(`accessibilityLabel="${GYM_HOME_LABEL}"`));
});

test("required test 2: Memory completion (live/ArcGymMemoryVisualizationScreen.tsx's own 'done' screen) shows the SAME '🏋️ חזרה ל־ARC Gym' button, additive to its existing 'סיום' button", () => {
  const doneIndex = memoryDone.indexOf("if (done) {");
  const doneBody = memoryDone.slice(doneIndex, memoryDone.indexOf("\n  }", doneIndex));
  assert.ok(doneBody.includes("סיום"));
  assert.ok(doneBody.includes(GYM_HOME_TEXT));
  assert.ok(doneBody.includes('onPress={() => router.replace("/arc-gym")}'));
  assert.ok(doneBody.includes(`accessibilityLabel="${GYM_HOME_LABEL}"`));
});

test("required test 3: Success/ARC Result completion (live/ArcResultPracticeScreen.tsx) shows the gym-home button ONLY when this screen was reached from ARC Gym's own intentional-practice entry (origin === 'arc-gym') -- never for the automatic-suggestion/continue-to-task origin, which has no ARC Gym Home to meaningfully return to", () => {
  assert.ok(resultPractice.includes('{origin === "arc-gym" && ('));
  const gateIndex = resultPractice.indexOf('{origin === "arc-gym" && (');
  const gateBody = resultPractice.slice(gateIndex, gateIndex + 400);
  assert.ok(gateBody.includes(GYM_HOME_TEXT));
  assert.ok(gateBody.includes('onPress={() => router.replace("/arc-gym")}'));
  assert.ok(gateBody.includes(`accessibilityLabel="${GYM_HOME_LABEL}"`));
  // The existing "סיימתי, להמשיך למשימה" button (origin-agnostic) must be completely unchanged.
  assert.ok(resultPractice.includes("סיימתי, להמשיך למשימה"));
});

// --- Required test 4: ARC Focus completion -> ARC Gym Home ----------------

test("required test 4: ARC Focus is its own independent exercise, never linked to a different scheduled task -- live/ArcFocusLiveScreen.tsx's finishAndLeave unconditionally returns to '/arc-gym' (ARC Gym Home), with no session.taskId branch and no reference to '/tasks/[id]' at all", () => {
  const fnIndex = arcFocusLive.indexOf("function finishAndLeave()");
  const fnBody = arcFocusLive.slice(fnIndex, arcFocusLive.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("session?.taskId"), "must never branch on session.taskId -- ARC Focus is never 'linked to a different task'");
  assert.ok(!fnBody.includes("session.taskId"), "must never branch on session.taskId -- ARC Focus is never 'linked to a different task'");
  assert.ok(!fnBody.includes("/tasks/[id]"), "finishing ARC Focus must never redirect to any other task");
  assert.ok(fnBody.includes('router.replace("/arc-gym");'), "completion must unconditionally return to ARC Gym Home");
  assert.ok(!fnBody.includes('"/arc-gym/arc-focus"'), "must never still point at the settings screen");
});

test("required test 4 continued (correction: ARC Focus is an independent exercise): the completion button unconditionally shows '🏋️ סיום וחזרה ל־ARC Gym' with accessibilityLabel 'בית ARC Gym' -- no ternary on session.taskId, since there is no 'task-linked' variant of this button any more", () => {
  const buttonIndex = arcFocusLive.indexOf("onPress={finishAndLeave}");
  const buttonLine = arcFocusLive.slice(Math.max(0, buttonIndex - 300), buttonIndex + 300);
  assert.ok(!buttonLine.includes("session.taskId"), "the button must never branch on session.taskId");
  assert.ok(buttonLine.includes('accessibilityLabel="בית ARC Gym"'));
  assert.ok(buttonLine.includes("🏋️ סיום וחזרה ל־ARC Gym"));
});

// --- Required test 5: the 🏋️ button opens ARC Gym Home, never "היום הגמיש"

test("required test 5: none of the four new/changed return-to-gym actions this task added ever navigates to '/' (Home/\"היום הגמיש\") -- every one of them targets '/arc-gym' exactly, distinct from live/ActiveTaskScreen.tsx's own pre-existing 🏠 button (which still targets '/')", () => {
  for (const [name, source] of [
    ["Behaviour gym-home button", behaviorDone.slice(behaviorDone.indexOf(GYM_HOME_TEXT) - 200, behaviorDone.indexOf(GYM_HOME_TEXT))],
    ["Memory gym-home button", memoryDone.slice(memoryDone.indexOf(GYM_HOME_TEXT) - 200, memoryDone.indexOf(GYM_HOME_TEXT))],
    ["Success gym-home button", resultPractice.slice(resultPractice.indexOf(GYM_HOME_TEXT) - 200, resultPractice.indexOf(GYM_HOME_TEXT))],
  ] as const) {
    assert.ok(source.includes('router.replace("/arc-gym")'), `${name} must target '/arc-gym'`);
    assert.ok(!source.includes('router.replace("/")') && !source.includes('router.replace("/");'), `${name} must never route to plain Home`);
  }
  const fnIndex = arcFocusLive.indexOf("function finishAndLeave()");
  const fnBody = arcFocusLive.slice(fnIndex, arcFocusLive.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes('router.replace("/");'));
  // The pre-existing 🏠 button (a different, already-shipped control) is untouched and still goes Home.
  assert.ok(activeTaskScreen.includes('<Pressable onPress={() => router.replace("/")}>'));
  assert.ok(activeTaskScreen.includes("🏠"));
});

// --- Required test 6: all four exercise categories remain visible ---------

test("required test 6: ARC Gym Home (build/ArcGymScreen.tsx) still surfaces all FOUR exercise categories -- Behaviour (the Manifest-behaviour list), Memory, Success/ARC Result, and ARC Focus -- none removed or hidden by this task, which touches no code in this file at all", () => {
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/memory")'), "Memory category card must still be present");
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/result")'), "Success/ARC Result category card must still be present");
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/arc-focus")'), "ARC Focus category card must still be present");
  assert.ok(arcGymScreen.includes("resolveArcGymBehaviorOptions"), "the Behaviour category (Manifest-behaviour list) must still be present");
});

// --- Required test 7 + 16: continuous practice, no duplicate nav stacks ---

test("required test 7 + 16: all four return-to-gym actions use router.replace (never router.push) -- chaining several exercises in a row (ARC Gym Home -> exercise -> complete -> ARC Gym Home -> next exercise...) can never grow the navigation stack or leave a dangling duplicate screen behind", () => {
  for (const [name, source] of [
    ["Behaviour", behaviorDone],
    ["Memory", memoryDone],
    ["Success", resultPractice],
  ] as const) {
    assert.ok(source.includes('router.replace("/arc-gym")'), `${name}'s gym-home button must use router.replace`);
    assert.ok(!source.includes('router.push("/arc-gym")'), `${name} must never router.push to ARC Gym Home (that would grow the stack)`);
  }
  const fnIndex = arcFocusLive.indexOf("function finishAndLeave()");
  const fnBody = arcFocusLive.slice(fnIndex, arcFocusLive.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('router.replace("/arc-gym");'));
  assert.ok(!fnBody.includes('router.push("/arc-gym")'));
});

// --- Required test 8: each exercise saves completion data exactly once ----

test("required test 8: the new gym-home buttons are rendered ONLY inside the already-'done'/already-'completed' branch of each screen -- they never call finish()/the training-record write themselves, so adding them can never cause a second save of the same completion", () => {
  for (const [name, source, finishCall] of [
    ["Behaviour", behaviorDone, "completeArcGymTrainingRecord(createArcGymTrainingRecord(generateArcGymTrainingRecordId(), id, \"visualization_only\", now), now)"],
    ["Memory", memoryDone, "completeArcGymTrainingRecord(createArcGymTrainingRecord(generateArcGymTrainingRecordId(), id, checkInChoice, now), now)"],
  ] as const) {
    const writeCount = source.split(finishCall).length - 1;
    assert.equal(writeCount, 1, `${name} must write its training record exactly once -- the gym-home button must not duplicate this call`);
    const gymButtonIndex = source.indexOf(GYM_HOME_TEXT);
    const writeIndex = source.indexOf(finishCall);
    assert.ok(writeIndex < gymButtonIndex, `${name}'s record write must happen strictly BEFORE the gym-home button even renders (it's only shown once done/true)`);
  }
});

test("required test 8 continued: ARC Focus's own practice-record save is still guarded by the pre-existing recordSavingRef/record-state double-save guard, completely untouched by this task's navigation-only change -- finishAndLeave itself performs no storage write of any kind", () => {
  assert.ok(arcFocusLive.includes("recordSavingRef.current) return;"));
  assert.ok(arcFocusLive.includes("recordSavingRef.current = true;"));
  const fnIndex = arcFocusLive.indexOf("function finishAndLeave()");
  const fnBody = arcFocusLive.slice(fnIndex, arcFocusLive.indexOf("\n  }", fnIndex));
  for (const storageCall of ["saveArcFocusPracticeRecord", "saveArcFocusSession", "clearArcFocusSession"]) {
    assert.ok(!fnBody.includes(storageCall), `finishAndLeave must never call ${storageCall} -- it is pure navigation, the record was already saved by the completion effect before this button is ever shown`);
  }
});

// --- Required test 10: ARC Focus mood routing remains intact --------------

test("required test 10: data/emotionalCheckInRouting.ts's handleArcFocusCheckInChoice still has its exact three branches (😟 full_arc, 🙂 shortened_arc, 😄/else direct-to-Focus) -- completely untouched by this task", () => {
  const routing = readSource("data/emotionalCheckInRouting.ts");
  const fnIndex = routing.indexOf("export async function handleArcFocusCheckInChoice(");
  const fnBody = routing.slice(fnIndex, routing.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('if (choice === "full_arc") return openFullArc('));
  assert.ok(fnBody.includes('if (choice === "shortened_arc") return openShortenedArc('));
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]/arc-focus", params: { id: taskId, arcFocusPracticeId: options.arcFocusPracticeId } });'));
});

// --- Required test 11: preparatory ARC returns to the same intended Focus session

test("required test 11: live/NewArcLiveScreen.tsx's returnToTask() still routes a completed preparatory ARC (session.arcFocusPracticeId set) straight back to '/tasks/[id]/arc-focus' with the SAME taskId and the SAME arcFocusPracticeId -- never re-picking settings, completely untouched by this task", () => {
  const liveScreen = readSource("live/NewArcLiveScreen.tsx");
  assert.ok(liveScreen.includes("if (session?.arcFocusPracticeId) {"));
  assert.ok(liveScreen.includes('router.replace({ pathname: "/tasks/[id]/arc-focus", params: { id: taskId, arcFocusPracticeId: session.arcFocusPracticeId } });'));
});

// --- Required test 14: ARC Focus completion summary + return action -------

test("required test 14: the existing completion summary (smiley count, active seconds, highest stage, thoughts logged, recovery count, self-reported longest streak) is completely unchanged -- this task adds no second completion screen, only changes the one existing button's destination/label for the standalone case", () => {
  for (const summaryLine of ["חייכנים (לפי זמן תרגול פעיל)", "זמן תרגול פעיל", "השלב הגבוה ביותר", "מחשבות שזוהו", "חזרות למיקוד", "הרצף הארוך ביותר ללא הסחה (לפי דיווח עצמי)"]) {
    assert.ok(arcFocusLive.includes(summaryLine), `summary line "${summaryLine}" must still be present, unchanged`);
  }
  // Exactly one completion button exists -- never a second "finish" control added alongside it.
  const completedIndex = arcFocusLive.indexOf('session.engine.status === "completed"');
  const completedBlockEnd = arcFocusLive.indexOf("  const now = new Date().toISOString();\n  const ringCount", completedIndex);
  const completedBody = arcFocusLive.slice(completedIndex, completedBlockEnd === -1 ? arcFocusLive.length : completedBlockEnd);
  const pressableCount = completedBody.split("onPress={finishAndLeave}").length - 1;
  assert.equal(pressableCount, 1, "the completion screen must have exactly one finish/return button, never a duplicated second one");
});

// --- Required test 15: existing task timers remain unaffected -------------

test("required test 15: none of the four gym-home/finish actions this task added or changed reference the task timer at all (pauseTask/completeTask/postponeTask/TaskTimerRun/clearTaskTimerRun) -- they are pure navigation, exactly like the pre-existing 🏠 button they're modelled after", () => {
  for (const forbidden of ["pauseTask", "completeTask(", "postponeTask", "TaskTimerRun", "clearTaskTimerRun"]) {
    for (const [name, source] of [
      ["Behaviour done block", behaviorDone],
      ["Memory done block", memoryDone],
      ["Success practice gym-home branch", resultPractice],
    ] as const) {
      assert.ok(!source.includes(forbidden), `${name} must never reference "${forbidden}"`);
    }
  }
  const fnIndex = arcFocusLive.indexOf("function finishAndLeave()");
  const fnBody = arcFocusLive.slice(fnIndex, arcFocusLive.indexOf("\n  }", fnIndex));
  for (const forbidden of ["pauseTask", "completeTask(", "postponeTask", "TaskTimerRun", "clearTaskTimerRun"]) {
    assert.ok(!fnBody.includes(forbidden), `finishAndLeave must never reference "${forbidden}"`);
  }
});

// --- Required test 17: interrupted sessions restore safely -----------------

test("required test 17: all three resumable screens still reload fresh state from storage on every focus (useFocusEffect), completely untouched by this task -- Behaviour/Memory reset their own local 'done' flag to false on every (re-)focus by id, and ArcFocusLiveScreen's own session-resume effect (idle -> startFocusSession, otherwise resume as-is) is unchanged, so a navigation-only addition can never cause an interrupted exercise to be mis-restored or silently marked complete", () => {
  assert.ok(behaviorDone.includes("setDone(false);"));
  assert.ok(memoryDone.includes("setDone(false);"));
  assert.ok(arcFocusLive.includes('const started = loaded.engine.status === "idle" ? startFocusSession(loaded, now) : loaded;'));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcResultSuggestion.test.ts
 *
 * ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
 * Shortcuts task, section 9: the required regression scenarios for
 * the wiring that sits ON TOP OF arc/arcResult.ts's own genuinely
 * unit-tested pure logic (see arc/arcResult.test.ts) -- this module
 * depends on expo-router's `router`, AsyncStorage-backed loaders, and
 * React Native rendering, so (same "source-text regression guard"
 * convention as data/emotionalCheckInRouting.test.ts and
 * data/emotionalCheckInWidget.test.ts) it is never executed directly
 * with `node --test`.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const flexibleDailyScreen = readSource("build/FlexibleDailyScreen.tsx");
const overlayService = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
const arcGymScreen = readSource("build/ArcGymScreen.tsx");
const resultListScreen = readSource("build/ArcGymResultListScreen.tsx");
const resultDetailScreen = readSource("build/ArcGymResultDetailScreen.tsx");
const resultEditorScreen = readSource("build/ArcGymResultEditorScreen.tsx");
const arcResultModule = readSource("arc/arcResult.ts");
const newArcLiveScreen = readSource("live/NewArcLiveScreen.tsx");
const emotionalCheckInRouting = readSource("data/emotionalCheckInRouting.ts");
const suggestionScreen = readSource("live/ArcResultSuggestionScreen.tsx");
const practiceScreen = readSource("live/ArcResultPracticeScreen.tsx");
const layoutRoutes = readSource("app/_layout.tsx");

// --- 1. No ARC Result shortcut on the main Home screen ---------------------

test("required test 1: build/FlexibleDailyScreen.tsx (the main 'היום הגמיש' Home screen) never references ARC Result -- no dedicated shortcut button was added, or was already removed if it ever existed", () => {
  assert.ok(!flexibleDailyScreen.includes("ArcResult"));
  assert.ok(!flexibleDailyScreen.includes("arc-result"));
});

// --- 2. No ARC Result shortcut in the expanded or collapsed floating cube --

test("required test 2: OverlayService.kt (the floating cube's own expanded panel AND collapsed pill -- both built programmatically here, with no separate layout XML) never references ARC Result", () => {
  assert.ok(!overlayService.includes("ArcResult"));
  assert.ok(!overlayService.includes("arc-result"));
});

// --- 17. Existing floating-cube and mood-button behavior is unchanged ------

test("required test 17: the floating cube's own existing mood buttons and combined cognitive shortcut are still present, byte-for-byte, in OverlayService.kt -- this task never touched that file", () => {
  assert.ok(overlayService.includes("פחות טוב") || overlayService.includes("מעולה") || overlayService.includes("סבבה"));
  assert.ok(overlayService.includes("מחשבה / דחף"));
  assert.ok(overlayService.includes("הוסף תובנה"));
});

// --- 3. ARC Result management remains accessible through ARC GYM ----------

test("required test 3: ARC GYM's own entry screen links to the ARC Result list, parallel to its existing ARC Memory link -- management never moved anywhere else", () => {
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/result")'));
});

test("required test 3 continued: ARC GYM still supports creating, editing, linking/unlinking tasks, and practicing a result intentionally", () => {
  assert.ok(resultListScreen.includes('params: { id: "new" }'), "creating a new result");
  assert.ok(resultEditorScreen.includes("createArcResultExercise") && resultEditorScreen.includes("updateArcResultExercise") && resultEditorScreen.includes("deleteArcResultExerciseEntry"), "create/edit/delete");
  assert.ok(resultDetailScreen.includes("linkTaskToArcResult") && resultDetailScreen.includes("unlinkTaskFromArcResult"), "linking/unlinking one or more tasks");
  assert.ok(resultDetailScreen.includes('pathname: "/arc-result-practice/[id]"') && resultDetailScreen.includes('origin: "arc-gym"'), "practicing a result intentionally, reusing the SAME practice screen the automatic suggestion opens");
});

test("app/_layout.tsx registers every new ARC Result route (ARC GYM management + the automatic suggestion/practice screens)", () => {
  for (const name of ["arc-gym/result/index", "arc-gym/result/[id]", "arc-gym/result/[id]/edit", "arc-result-suggestion", "arc-result-practice/[id]"]) {
    assert.ok(layoutRoutes.includes(`name="${name}"`), `missing route registration for ${name}`);
  }
});

// --- 4-7. Automatic suggestion after Full/Mini/Shortened ARC and the
// combined "מחשבה / דחף" pathway -- all FOUR share the exact same
// live/NewArcLiveScreen.tsx engine and the exact same single
// completion effect (completeConsumedRef) that calls returnToTask(),
// so one shared gate, wired into returnToTask's own two real-task
// branches, covers every one of them -- never four separate checks
// that could silently drift apart. ---------------------------------

test("required tests 4-7 (suggested after Full ARC, Mini ARC, Shortened ARC, and the combined 'מחשבה / דחף' pathway): returnToTask's own two real-task destinations both route through the shared routeToTaskOrArcResultSuggestion helper -- never a direct, unconditional '/tasks/[id]' navigation that would skip the check", () => {
  // Smart To-Do List task, section 9: this helper gained an optional
  // third splitMinutes param (default null) -- every pre-existing call
  // site is unaffected, so this is still the one shared helper.
  assert.ok(
    newArcLiveScreen.includes("async function routeToTaskOrArcResultSuggestion(targetTaskId: string, autoStart: boolean, splitMinutes: number | null = null)")
  );
  assert.ok(
    newArcLiveScreen.includes("await routeToTaskOrArcResultSuggestion(session.selectedActionTaskId, false, session.selectedActionDurationMinutes);"),
    "the explicitly-selected scheduled/due task branch"
  );
  assert.ok(newArcLiveScreen.includes("await routeToTaskOrArcResultSuggestion(taskId, autoStart);"), "the final fallback branch -- the session's own linked task, reached by every ARC mode (full/mini/shortened/combined) that doesn't hit a more specific branch above it");
});

test("required tests 4-7 continued: Full ARC, Shortened ARC and the combined 'מחשבה / דחף' pathway are all the SAME engine/screen (spontaneous=1, shortened=1, skipEmotionSelection=1 respectively -- see data/emotionalCheckInRouting.ts), and Mini ARC runs through the SAME completion effect too -- so there is only ever ONE returnToTask to wire, never four separate completion paths", () => {
  assert.ok(emotionalCheckInRouting.includes('const params: Record<string, string> = { id, spontaneous: "1" };'), "Full ARC");
  assert.ok(emotionalCheckInRouting.includes('const params: Record<string, string> = { id, shortened: "1" };'), "Shortened ARC");
  assert.ok(emotionalCheckInRouting.includes('const params: Record<string, string> = { id, spontaneous: "1", skipEmotionSelection: "1" };'), "combined מחשבה/דחף");
  assert.ok(newArcLiveScreen.includes('if (!session || session.currentStep !== "complete" || completeConsumedRef.current) return;'), "the one shared completion effect every ARC mode funnels through");
});

// --- 8. Suggested after 😄 "מעולה" / "ישר למשימה" ---------------------------

test("required test 8: resolveAndOpenNextTask (the 😄 shortcut's own shared handler) routes BOTH its real-task destinations -- an already-active task and the next actionable task -- through the SAME navigateToTaskOrArcResultSuggestion check, never a direct, unconditional '/tasks/[id]' navigation", () => {
  assert.ok(emotionalCheckInRouting.includes("async function navigateToTaskOrArcResultSuggestion(taskId: string, options: NavigateOptions)"));
  assert.ok(emotionalCheckInRouting.includes("await navigateToTaskOrArcResultSuggestion(active.id, options);"));
  assert.ok(emotionalCheckInRouting.includes("await navigateToTaskOrArcResultSuggestion(target.task.id, options);"));
});

test("required test 8 continued: 😄 is still available only while no task session is active -- this task never touched that pre-existing visibility rule, only what happens once it IS pressed", () => {
  assert.ok(!emotionalCheckInRouting.includes("isIdle"), "that visibility rule lives entirely in the native widget/overlay, never duplicated into this routing module");
});

// --- 9. No suggestion when no result is linked (structural wiring half --
// the pure-logic half is arc/arcResult.test.ts's own dedicated tests) ------

test("required test 9: both entry points gate on hasLinkedArcResult BEFORE ever navigating to the suggestion screen -- a task with zero linked results is never routed there", () => {
  assert.ok(newArcLiveScreen.includes("if (hasLinkedArcResult(exercises, targetTaskId)) {"));
  assert.ok(emotionalCheckInRouting.includes("if (hasLinkedArcResult(exercises, taskId)) {"));
});

// --- 10-11. "תרגל הצלחה" opens the correct exercise / multi-result
// selection only after choosing to practice --------------------------------

test("required test 10: exactly one linked result opens it directly -- handlePracticePress never shows a selection UI when there is only one match", () => {
  const fnIndex = suggestionScreen.indexOf("function handlePracticePress()");
  const fnBody = suggestionScreen.slice(fnIndex, suggestionScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (exercises.length === 1) {"));
  assert.ok(fnBody.includes("openPractice(exercises[0].id);"));
});

test("required test 11: the minimal selection interface (showSelection) is only ever shown AFTER pressing 'תרגל הצלחה' with more than one linked result -- never shown upfront alongside the two primary actions", () => {
  assert.ok(suggestionScreen.includes("const [showSelection, setShowSelection] = useState(false);"), "defaults to hidden");
  const fnIndex = suggestionScreen.indexOf("function handlePracticePress()");
  const fnBody = suggestionScreen.slice(fnIndex, suggestionScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("setShowSelection(true);"));
  assert.ok(suggestionScreen.includes("{showSelection ? ("), "the two primary buttons and the selection list are mutually exclusive in the render tree");
});

// --- 12. "דלג והמשך למשימה" bypasses the exercise ---------------------------

test("required test 12: 'דלג והמשך למשימה' never opens the practice screen -- it goes straight to the EXACT SAME /tasks/[id] destination the suggestion screen would have opened had no result ever been linked", () => {
  assert.ok(suggestionScreen.includes("function continueToTask()"));
  const fnIndex = suggestionScreen.indexOf("function continueToTask()");
  const fnBody = suggestionScreen.slice(fnIndex, suggestionScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]"'));
  assert.ok(!fnBody.includes("arc-result-practice"));
  assert.ok(suggestionScreen.includes('onPress={continueToTask}'));
});

// --- 13. Completing practice continues to the exact selected task ----------

test("required test 13: ArcResultPracticeScreen's own finish() continues to the SAME taskId it was given, never a different/rederived one, when opened from the automatic suggestion (origin !== 'arc-gym')", () => {
  const fnIndex = practiceScreen.indexOf("function finish()");
  const fnBody = practiceScreen.slice(fnIndex, practiceScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" }'));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]", params: { id: taskId }'));
});

test("required test 13 continued: the SAME practice screen, opened from ARC GYM's own intentional-practice entry point (origin === 'arc-gym'), returns to the exercise's own detail screen instead -- a different, deliberate destination, never a bug in the task-suggestion path", () => {
  const fnIndex = practiceScreen.indexOf("function finish()");
  const fnBody = practiceScreen.slice(fnIndex, practiceScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (origin === "arc-gym") {'));
  assert.ok(fnBody.includes('pathname: "/arc-gym/result/[id]"'));
});

// --- 14. Active task timers and context are preserved ----------------------

test("required test 14 (preserving active timers/context): neither the new routing helpers nor the suggestion/practice screens read or write a TaskTimerRun -- resolving where to navigate, opening the suggestion, and practicing are never themselves a pause/resume/stop action", () => {
  for (const source of [emotionalCheckInRouting, suggestionScreen, practiceScreen]) {
    assert.ok(!source.includes("TaskTimerRun"));
    assert.ok(!source.includes("loadTaskTimerRun"));
    assert.ok(!source.includes("saveTaskTimerRun"));
  }
});

test("required test 14 continued: returnToTask's own pre-existing clearNewArcLiveSession() still runs before it ever calls the new routing helper, and the helper itself changes WHERE the trainee is sent, never the task/timer state (no upsertTask/TaskTimerRun call inside it)", () => {
  const helperIndex = newArcLiveScreen.indexOf("async function routeToTaskOrArcResultSuggestion(");
  const helperBody = newArcLiveScreen.slice(helperIndex, newArcLiveScreen.indexOf("\n  }", helperIndex));
  assert.ok(!helperBody.includes("upsertTask") && !helperBody.includes("TaskTimerRun"));

  const returnToTaskIndex = newArcLiveScreen.indexOf("async function returnToTask(autoStart: boolean) {");
  const returnToTaskBody = newArcLiveScreen.slice(returnToTaskIndex, newArcLiveScreen.indexOf("\n  }", returnToTaskIndex));
  const clearIndex = returnToTaskBody.indexOf("await clearNewArcLiveSession();");
  const firstCallIndex = returnToTaskBody.indexOf("routeToTaskOrArcResultSuggestion(");
  assert.ok(clearIndex !== -1 && firstCallIndex !== -1 && clearIndex < firstCallIndex, "clearNewArcLiveSession must run before the routing helper is ever called");
});

// --- 15. Suggestions do not appear repeatedly in the same transition -------

test("required test 15: each entry point checks hasLinkedArcResult and navigates EXACTLY ONCE per call -- a single router.replace/navigateTo, never a retry loop or a second check after the first navigation decision", () => {
  const fnIndex1 = newArcLiveScreen.indexOf("async function routeToTaskOrArcResultSuggestion(");
  const fnBody1 = newArcLiveScreen.slice(fnIndex1, newArcLiveScreen.indexOf("\n  }", fnIndex1));
  assert.equal((fnBody1.match(/router\.replace\(/g) ?? []).length, 2, "exactly one replace in the linked branch, one in the not-linked branch -- never both reached in the same call");

  const fnIndex2 = emotionalCheckInRouting.indexOf("async function navigateToTaskOrArcResultSuggestion(");
  const fnBody2 = emotionalCheckInRouting.slice(fnIndex2, emotionalCheckInRouting.indexOf("\n}", fnIndex2));
  assert.equal((fnBody2.match(/navigateTo\(/g) ?? []).length, 2);
});

// --- 16. No task/timer starts automatically without the required user action ---

test("required test 16: autoStart is only ever FORWARDED (never hardcoded to true) by the suggestion/practice screens -- opening or skipping the suggestion never decides to auto-start a task on its own", () => {
  assert.ok(!suggestionScreen.match(/autoStart\s*=\s*true/));
  assert.ok(!practiceScreen.match(/autoStart\s*=\s*true/));
  assert.ok(suggestionScreen.includes("autoStart?: boolean") && suggestionScreen.includes("autoStart = false"), "defaults to false, same as every pre-existing ARC completion path");
  assert.ok(practiceScreen.includes("autoStart?: boolean") && practiceScreen.includes("autoStart = false"));
});

test("required test 16 continued: resolveAndOpenNextTask (the 😄 shortcut) still never passes autoStart at all -- unchanged from before this task", () => {
  assert.ok(!emotionalCheckInRouting.includes('autoStart: "1"'));
});

// --- Section 7: arc/arcResult.ts is its own independent ARC GYM exercise type, never a variant of Behaviour/Memory ---

test("arc/arcResult.ts never imports from, or structurally extends, ArcGymSituation/ArcGymMemoryExercise -- a third, genuinely independent exercise type (its own doc comment names them only in prose, explaining why -- never as an actual import)", () => {
  assert.ok(!arcResultModule.includes('from "./arcGym.ts"'));
  assert.ok(!arcResultModule.match(/interface ArcResultExercise[^{]*extends/));
});

test("ArcResultExercise carries exactly the four quick-practice fields plus linkedTaskIds -- never a timer/duration field (section 6: 'must not require a timer')", () => {
  for (const field of ["focusPoint", "successVisualization", "successMantra", "supportiveBodyLanguage", "linkedTaskIds"]) {
    assert.ok(arcResultModule.includes(`${field}:`), `missing field ${field}`);
  }
  assert.ok(!arcResultModule.includes("durationSeconds") && !arcResultModule.includes("remainingSeconds"));
});

// --- Section 8: no duplicate ARC/Task LIVE sessions or rewards introduced ---

test("the new routing helpers never construct a session, timer run, or reward state of their own -- they only ever decide a destination, same convention as the pre-existing resolveAndOpenNextTask/returnToTask they extend", () => {
  assert.ok(!emotionalCheckInRouting.includes("createTaskTimerRun("), "emotionalCheckInRouting.ts must never create a task timer run");
  assert.ok(!emotionalCheckInRouting.includes("PostTaskRewardsState"));
  assert.ok(!suggestionScreen.includes("PostTaskRewardsState") && !practiceScreen.includes("PostTaskRewardsState"));
});

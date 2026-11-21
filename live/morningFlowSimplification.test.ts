import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/morningFlowSimplification.test.ts
 *
 * ARCHI — Morning Flow Simplification and Prioritization task:
 * source-text regression guard for the overlay/screen/routing wiring
 * (AsyncStorage/navigation, not callable under a plain `node --test`
 * run -- same convention as every other screen test in this
 * codebase). The pure logic itself (isDailyScheduleSuitable, the
 * Daily Visualization step order, buildReinforcementTaskFields) is
 * fully exercised, executed, in arc/dailyPlan.test.ts and
 * arc/dailyVisualization.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const overlay = readSource("live/DailyStartupSequenceOverlay.tsx");
const card = readSource("live/ManifestVisualizationCard.tsx");
const home = readSource("build/FlexibleDailyScreen.tsx");
const routing = readSource("data/emotionalCheckInRouting.ts");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const arcRoute = readSource("app/tasks/[id]/arc.tsx");
const visualizationScreen = readSource("live/DailyVisualizationScreen.tsx");
const dailyPlanModule = readSource("data/dailyPlan.ts");

// --- Section 1: emotional check-in first --------------------------------

test("section 1: the mount effect's own 'no active session' and error-fallback paths both land on the NEW first step, 'checkin' -- never 'fact' directly, EXCEPT the one Unified ARC & Productivity Update task, requirement 1 resume branch (already-answered check-in, ARC genuinely finished, OS killed the app in between)", () => {
  const fnIndex = overlay.indexOf('useEffect(() => {\n    logStartupStep("mount effect starting"');
  const fnEnd = overlay.indexOf("}, []);", fnIndex);
  const fnBody = overlay.slice(fnIndex, fnEnd);
  assert.ok(fnBody.includes('setStep("checkin");'));

  // The error-fallback (catch) path specifically must still land on
  // "checkin", never skip straight to "fact" just because something
  // failed to load.
  const catchIndex = fnBody.indexOf("} catch (error) {");
  const catchBody = fnBody.slice(catchIndex);
  assert.ok(catchBody.includes('setStep("checkin");'));
  assert.ok(!catchBody.includes('setStep("fact");'), "the error-fallback path must never land on 'fact' directly");

  // Exactly one legitimate exception is allowed: resuming a cold start
  // where the morning check-in's own ARC pathway was already chosen
  // and has since genuinely finished -- re-asking "checkin" there
  // would duplicate an already-answered question.
  const factOccurrences = fnBody.match(/setStep\("fact"\);/g) ?? [];
  assert.equal(factOccurrences.length, 1, 'exactly one setStep("fact") call is allowed in the mount effect -- the requirement-1 resume branch');
  const legitimateFactIndex = fnBody.indexOf('setStep("fact");');
  const precedingContext = fnBody.slice(Math.max(0, legitimateFactIndex - 3200), legitimateFactIndex);
  assert.ok(precedingContext.includes("morningFlowState.awaitingArcCompletion"), 'the one allowed setStep("fact") must be gated on the persisted morning-flow resume flag, never reachable unconditionally');
});

test("section 1: the checkin step asks the exact required question and offers all 3 smileys", () => {
  const checkinIndex = overlay.indexOf('{step === "checkin" &&');
  const checkinBody = overlay.slice(checkinIndex, checkinIndex + 900);
  assert.ok(checkinBody.includes("איך אתה מרגיש כרגע?"));
  assert.ok(checkinBody.includes('handleCheckInArc("full_arc")'));
  assert.ok(checkinBody.includes('handleCheckInArc("shortened_arc")'));
  assert.ok(checkinBody.includes("handleCheckInContinue"));
  assert.ok(checkinBody.includes("😟") && checkinBody.includes("🙂") && checkinBody.includes("😄"));
});

test("section 1: 'מעולה' continues the sequence DIRECTLY (step -> fact) -- never resolving a next task the way the Home check-in bar's own third choice does", () => {
  const fnIndex = overlay.indexOf("function handleCheckInContinue()");
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('setStep("fact");'));
  assert.ok(!fnBody.includes("resolveAndOpenNextTask"), "the morning-flow checkin's third choice must never reuse Home's 'find the next task' meaning");
});

test("section 1: 'פחות טוב'/'סבבה' hide the Modal immediately and route through the EXACT SAME shared handleEmotionalCheckInChoice/openFullArc/openShortenedArc Home's own check-in bar and the widget already use, tagged morningFlowCheckIn", () => {
  const fnIndex = overlay.indexOf('function handleCheckInArc(choice: "full_arc" | "shortened_arc")');
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('setAwaitingCheckInReturn(true);'));
  assert.ok(fnBody.includes('setStep("none");'), "the Modal must be hidden immediately, synchronously, before the async navigation even starts");
  assert.ok(fnBody.includes("handleEmotionalCheckInChoice(choice, null, { morningFlowCheckIn: true });"));
});

test("section 1: openFullArc/openShortenedArc thread morningFlowCheckIn into the /tasks/[id]/arc params exactly like arcGymSituationId -- never a second, parallel ARC-launching mechanism", () => {
  const fullArcBody = routing.slice(routing.indexOf("export async function openFullArc("), routing.indexOf("\n}", routing.indexOf("export async function openFullArc(")));
  assert.ok(fullArcBody.includes('if (options.morningFlowCheckIn) params.morningFlowCheckIn = "1";'));
  const shortenedArcBody = routing.slice(routing.indexOf("export async function openShortenedArc("), routing.indexOf("\n}", routing.indexOf("export async function openShortenedArc(")));
  assert.ok(shortenedArcBody.includes('if (options.morningFlowCheckIn) params.morningFlowCheckIn = "1";'));
});

test("section 1: the /tasks/[id]/arc route parses morningFlowCheckIn and threads it straight through to NewArcLiveScreen, alongside (never replacing) the existing params", () => {
  assert.match(arcRoute, /arcGymSituationId,\s*arcFocusPracticeId,\s*arcGymMemoryExerciseId,\s*arcPerspectiveId,\s*arcSavingBodyOptionId,\s*arcSavingExerciseId,\s*arcSavingTriggerIdForNewOption,\s*morningFlowCheckIn,?\s*\}\s*=\s*useLocalSearchParams/);
  assert.ok(arcRoute.includes('morningFlowCheckIn={morningFlowCheckIn === "1"}'));
});

test("section 1: returnToTask's own morningFlowCheckIn branch always goes back to Home ('/') -- checked before the standalone/task-linked destinations, so it overrides BOTH regardless of whether the session ended up attached to a real active task", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  // ARCHI -- Unified Final Specification task, section 6: widened from
  // 3000 to fit the two new selectedActionSource branches this
  // function grew. ARC Focus task: widened again (4700 -> 5300) to fit
  // the new arcFocusPracticeId branch. ARC Gym + ARC Goal Integration
  // task: widened again (5300 -> 6000) to fit the new
  // arcGymMemoryExerciseId branch, then again (6000 -> 7700) to fit the
  // combined Behaviour+Success scheduled-practice branching, then
  // again (7700 -> 8400) to fit the new arcPerspectiveId branch. ARC
  // Saving, Trigger Management & Quick-Action Buttons task: widened
  // again (8400 -> 10700) to fit the new
  // arcSavingBodyOptionId/arcSavingExerciseId/arcSavingTriggerIdForNewOption branch.
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 10700);
  const morningFlowIndex = fnBody.indexOf("if (morningFlowCheckIn) {");
  const standaloneIndex = fnBody.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  assert.ok(morningFlowIndex !== -1 && standaloneIndex !== -1 && morningFlowIndex < standaloneIndex, "the morningFlowCheckIn branch must be checked BEFORE the standalone-destination branch, so it overrides it");
  const morningFlowBody = fnBody.slice(morningFlowIndex, standaloneIndex);
  assert.ok(morningFlowBody.includes('router.replace("/");'));
});

test("section 1: morningFlowCheckIn is a pure navigation hint, never persisted on the session state or compared in sessionMatchesRequest -- unlike arcGymSituationId, it never affects WHAT the ARC session asks or shows, only where it returns to", () => {
  const newArcLiveTypes = readSource("arc/newArcLiveTypes.ts");
  assert.ok(!newArcLiveTypes.includes("morningFlowCheckIn"), "the session-state/request types must never know about this -- it lives only as a NewArcLiveScreen prop");
});

test("section 1 (no duplicate ARC sessions): the pathname-resume effect only ever acts when awaitingCheckInReturn was explicitly set -- an unrelated visit to '/' (before checkin was ever reached, or on any other ordinary navigation) is always a no-op, never a stray extra 'continue the sequence' trigger", () => {
  const effectIndex = overlay.indexOf("if (!awaitingCheckInReturn) return;");
  assert.ok(effectIndex !== -1);
  assert.ok(!overlay.includes("useFocusEffect"), "must never reuse a per-screen focus hook -- this overlay is a fixed Stack sibling, not a screen");
});

// --- Section 2: Manifest action is optional ------------------------------

test("section 2: the Manifest card's 'small action today' question is explicitly marked optional, and goNext advances regardless of whether actionText was ever filled in", () => {
  assert.ok(card.includes("מה הפעולה הקטנה שתוכל לעשות היום כדי להתנהג כך? (רשות)"));
  const addToScheduleIndex = card.indexOf("async function addToSchedule()");
  const addToScheduleBody = card.slice(addToScheduleIndex, addToScheduleIndex + 150);
  assert.ok(addToScheduleBody.includes("if (!actionText.trim() || saving) return;"), "only the EXPLICIT add-to-schedule action itself requires text -- advancing past the step (goNext) never does");
});

test("section 2: a labeled skip ('דילוג') is rendered for every step except the terminal one, and the action step is never excluded from that rule -- the Manifest action can always be skipped without completing it", () => {
  assert.match(card, /step !== "nextAction" && \(\s*<Pressable style=\{styles\.skipLink\} onPress=\{onClose\}>/);
});

test("section 2: the Manifest card's own onClose (both the 'דילוג' skip link and 'המשך' advancing past the terminal step) is never required to pass through a completed action -- it is a plain callback the caller controls entirely", () => {
  assert.match(card, /onClose: \(\) => void;/);
});

// --- Section 3: daily planning is skippable when already completed ------

test("section 3: continueToManifest's Manifest card now closes into the NEW planning-decision step (continueToPlanning), both for a resolved manifest and for the 'no manifest yet' card's own close/skip -- 'preserve the daily psychology fact and Manifest popups' while still inserting the new step after them", () => {
  assert.ok(overlay.includes("onClose={continueToPlanning}"));
  const noManifestIndex = overlay.indexOf("עדיין אין מניפסט");
  const noManifestBody = overlay.slice(noManifestIndex, noManifestIndex + 700);
  assert.ok(noManifestBody.includes("continueToPlanning();"));
  assert.ok(noManifestBody.includes("onPress={continueToPlanning}"));
});

test("section 3: the planning step resolves TODAY's effective scheduled plan via the shared resolveTodaysScheduledPlan/isDailyScheduleSuitable pair, never re-deriving 'what's scheduled today' with a THIRD, different algorithm", () => {
  const effectIndex = overlay.indexOf('if (step !== "planning") return;');
  const effectBody = overlay.slice(effectIndex, effectIndex + 500);
  assert.ok(effectBody.includes("resolveTodaysScheduledPlan()"));
  assert.ok(effectBody.includes("isDailyScheduleSuitable(scheduled)"));
});

test("section 3: a suitable schedule shows the EXACT required prominent button text, leading to finish() (continuing to preparation)", () => {
  const planningIndex = overlay.indexOf('{step === "planning" &&');
  const planningBody = overlay.slice(planningIndex, planningIndex + 1200);
  assert.ok(planningBody.includes("התוכנית שלי מוכנה — המשך להכנה"));
  assert.ok(planningBody.includes("onPress={finish}"));
});

test("section 3: an unsuitable schedule offers the Nine Functional Improvements task's own working '➕ הוסף משימה להיום' entry (Improvement 7 fixes the exact bug Improvement 2 also reports -- the OLD button was a plain navigation-free close with no task creation at all) WITH the required 'at least three tasks' recommendation, a 'המשך לוויזואליזציה' continue action, AND an explicit skip-planning link straight to finish() -- planning is never forced", () => {
  const planningIndex = overlay.indexOf('{step === "planning" &&');
  const planningBody = overlay.slice(planningIndex, planningIndex + 1700);
  assert.ok(planningBody.includes("מומלץ לבחור לפחות 3 משימות להיום"));
  assert.ok(planningBody.includes('onPress={() => setShowAddTaskForm((shown) => !shown)}'));
  assert.ok(planningBody.includes("➕ הוסף משימה להיום"));
  assert.ok(planningBody.includes("המשך לוויזואליזציה"));
  assert.ok(planningBody.includes("onPress={finish}"), "the skip-planning link must still be able to reach finish() even in the unsuitable-schedule branch");
});

test("section 3: a failed plan resolution fails OPEN straight to finish() -- never stuck on an empty planning card, same precedent as every other async step in this file", () => {
  const effectIndex = overlay.indexOf('if (step !== "planning") return;');
  const effectBody = overlay.slice(effectIndex, effectIndex + 700);
  assert.ok(effectBody.includes(".catch((error) => {"));
  assert.ok(effectBody.includes("finish();"));
});

// Nine Functional Improvements task, Improvement 7: supersedes the section-3 test above this one -- "➕ הוסף משימה להיום" now
// DOES create a real Task directly from inside this overlay (a deliberate fix, not a regression): the OLD "quick planning never
// touches a Task" behavior was itself the bug Improvement 2/7 both report. It still never recreates/re-enters anything for an
// EXISTING task -- this is additive creation only, via the exact same createEmptyTask+buildTaskFromDraft+upsertTask path
// build/TaskEditorScreen.tsx's own creation flow already uses.
test("Improvement 7: handleAddTaskToToday creates a NEW Task for TODAY specifically via the shared arc/taskDraft.ts pipeline (validateTaskDraft + buildTaskFromDraft), arms its alarm the same way TaskEditorScreen's own handleSave does, and is guarded against a rapid double-tap creating two tasks from one submit", () => {
  assert.ok(overlay.includes("import { createEmptyTask, generateTaskId } from \"../arc/tasks.ts\";"));
  assert.ok(overlay.includes("import { buildTaskFromDraft, createEmptyTaskDraft, validateTaskDraft } from \"../arc/taskDraft.ts\";"));
  const fnIndex = overlay.indexOf("async function handleAddTaskToToday()");
  assert.ok(fnIndex !== -1);
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (addingTask) return;"));
  assert.ok(fnBody.includes("validateTaskDraft(draftWithToday)"));
  assert.ok(fnBody.includes("buildTaskFromDraft(draftWithToday, base, now)"));
  assert.ok(fnBody.includes("scheduleTaskAlarm(built, new Date())"));
  assert.ok(fnBody.includes("await upsertTask(withAlarm);"));
  assert.ok(fnBody.includes("setAddingTask(true);"));
});

test("Improvement 7: the new task is scheduled for TODAY specifically (todayLocalDateString), and defaults to the status/once-recurrence createEmptyTask already produces -- the permanent weekly template is never touched by this path (no weeklyRoutine/routineTaskTemplateId write anywhere in this function)", () => {
  const fnIndex = overlay.indexOf("async function handleAddTaskToToday()");
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("todayLocalDateString(new Date())"));
  assert.ok(!fnBody.includes("routineTaskTemplateId") && !fnBody.includes("routinePeriodId"), "must never write to the permanent weekly routine template");
});

test("Improvement 7: after saving, the effective schedule is refreshed via the SAME resolveTodaysScheduledPlan the planning step's own effect already uses (never a second, differently-derived snapshot), so the new task is immediately visible in the review list and immediately available to Daily Visualization", () => {
  const fnIndex = overlay.indexOf("async function handleAddTaskToToday()");
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("resolveTodaysScheduledPlan(new Date())"));
  assert.ok(fnBody.includes("setPlanEntries(scheduled);"));
});

test("Improvement 7: the add-task form stays open after a successful save (the draft is cleared, not the form's visibility), so several tasks can be created consecutively without re-opening anything", () => {
  const fnIndex = overlay.indexOf("async function handleAddTaskToToday()");
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("setNewTaskDraft(createEmptyTaskDraft());"));
  assert.ok(!fnBody.includes("setShowAddTaskForm(false)"), "a successful save must not auto-close the form -- that would prevent adding a second task consecutively");
});

test("Improvement 7: validateTaskDraft's errors (e.g. a missing title) block the save and are shown rather than silently discarded -- a double-tap guard (addingTask) prevents a second submit from creating a duplicate task while the first is still saving", () => {
  const fnIndex = overlay.indexOf("async function handleAddTaskToToday()");
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (errors.length > 0) {"));
  assert.ok(fnBody.includes("setAddTaskError(errors[0]);"));
  assert.ok(fnBody.includes("return;"));
});

test("Improvement 7: the inline form offers exactly the 5 fields the spec requires -- name, scheduled starting time, planned duration, optional first action, optional location -- each bound to newTaskDraft and editable via a plain TextInput, never a second/competing task-creation UI", () => {
  const formIndex = overlay.indexOf("const addTaskForm = showAddTaskForm && (");
  assert.ok(formIndex !== -1);
  const formBody = overlay.slice(formIndex, overlay.indexOf("\n  );", formIndex));
  assert.ok(formBody.includes("value={newTaskDraft.title}"));
  assert.ok(formBody.includes("value={newTaskDraft.scheduledTime}"));
  assert.ok(formBody.includes("value={newTaskDraft.expectedDurationMinutes}"));
  assert.ok(formBody.includes("value={newTaskDraft.firstAction}"));
  assert.ok(formBody.includes("value={newTaskDraft.location}"));
  assert.ok(formBody.includes("onPress={handleAddTaskToToday}"));
});

test("Improvement 7: the '➕ הוסף משימה להיום' entry and its form are offered in BOTH planning-step cards (suitable and unsuitable) -- adding one more task is never blocked just because the schedule already looks 'suitable'", () => {
  const planningIndex = overlay.indexOf('{step === "planning" &&');
  const planningBody = overlay.slice(planningIndex, planningIndex + 1700);
  const occurrences = planningBody.split("➕ הוסף משימה להיום").length - 1;
  assert.equal(occurrences, 2, "both the suitable and unsuitable planning cards must offer the add-task entry");
  const formRefs = planningBody.split("{addTaskForm}").length - 1;
  assert.equal(formRefs, 2, "both cards must render the same shared addTaskForm block");
});

test("data/dailyPlan.ts's resolveTodaysScheduledPlan reuses the exact same tasks/overrides/completions/weekdaySettings/dateModeOverrides -> resolveEffectiveScheduleMode -> resolveDailyPlan -> applyScheduleMode pipeline as build/FlexibleDailyScreen.tsx's own reload()", () => {
  assert.ok(dailyPlanModule.includes("resolveEffectiveScheduleMode(weekday, dateLocal, weekdaySettings, dateModeOverrides)"));
  assert.ok(dailyPlanModule.includes("resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj)"));
  assert.ok(dailyPlanModule.includes("applyScheduleMode(plan, effectiveMode)"));
});

// --- Section 4: morning preparation is always prominently reachable -----

test("section 4: a persistent, always-visible Daily Visualization entry card exists on Home (isTodayMode only), independent of the cold-start sequence -- 'prominently accessible at the beginning of each day, even when Manifest actions and daily planning are skipped'", () => {
  const cardIndex = home.indexOf("handleOpenDailyVisualization");
  assert.ok(cardIndex !== -1);
  assert.ok(home.includes("🧘 הכנה יומית"));
  const pressableIndex = home.indexOf('onPress={handleOpenDailyVisualization}');
  const before = home.slice(Math.max(0, pressableIndex - 200), pressableIndex);
  assert.ok(before.includes("isTodayMode"), "gated the same way the check-in bar/ARC GYM card are -- Home only");
});

test("Nine Functional Improvements task, Improvement 6: the Home entry card's handler deliberately uses isDailyVisualizationCompletedNow() (completed ONLY), never isDailyVisualizationNeededNow() (completed OR bypassed) -- 'skipping means not now', so a bypassed-today exercise must still open and resume from here, never dead-end with 'already done'; only an ACTUALLY completed exercise blocks re-opening", () => {
  const fnIndex = home.indexOf("async function handleOpenDailyVisualization()");
  const fnBody = home.slice(fnIndex, home.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (!(await isDailyVisualizationCompletedNow())) {"));
  assert.ok(fnBody.includes('router.push("/daily-visualization");'));
  assert.ok(fnBody.includes("Alert.alert("), "when already fully completed today, it must acknowledge rather than silently restart the exercise from scratch");
  assert.ok(!home.includes('import { isDailyVisualizationNeededNow }'), "the Home entry must no longer IMPORT the completed-OR-bypassed check at all (a doc-comment mention explaining why it's NOT used is fine)");
  assert.ok(home.includes('import { isDailyVisualizationCompletedNow } from "../data/dailyVisualization.ts";'));
});

test("section 4: isDailyVisualizationNeededNow's own check is completely independent of today's SCHEDULE -- it never reads tasks/overrides/dailyPlan at all, so a fully-planned day never auto-skips mental preparation", () => {
  const dailyVisualizationModule = readSource("data/dailyVisualization.ts");
  const fnIndex = dailyVisualizationModule.indexOf("export async function isDailyVisualizationNeededNow(");
  const fnBody = dailyVisualizationModule.slice(fnIndex, dailyVisualizationModule.indexOf("\n}", fnIndex));
  assert.ok(!fnBody.includes("loadTasks") && !fnBody.includes("resolveDailyPlan") && !fnBody.includes("isDailyScheduleSuitable"));
  assert.ok(fnBody.includes("loadDailyVisualizationDailyProgress()"));
});

test("section 4: the required-before-tasks gate (live/ActiveTaskScreen.tsx) remains a SEPARATE, still-independent path into the SAME exercise -- morning prep stays reachable even if the trainee skips the cold-start sequence/planning entirely and goes straight to starting a task", () => {
  const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
  assert.ok(activeTaskScreen.includes("if (await isDailyVisualizationNeededNow()) {"));
});

test("section 4: the 6-step main preparation sequence is reached from finish() exactly as before -- isDailyVisualizationNeededNow gates whether to push /daily-visualization, unaffected by the new checkin/planning steps inserted ahead of it", () => {
  const fnIndex = overlay.indexOf("async function finish()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("isDailyVisualizationNeededNow(new Date())"));
  assert.ok(fnBody.includes('router.push("/daily-visualization");'));
});

test("section 4 continued: the new end_of_day_visualize/reinforcement_action steps render between feeling/movement and final, with the reinforcement action step explicitly marked optional, matching section 5's own 'never force'", () => {
  assert.ok(visualizationScreen.includes('step.kind === "end_of_day_visualize"'));
  assert.ok(visualizationScreen.includes('step.kind === "reinforcement_action"'));
  assert.ok(visualizationScreen.includes("איזו פעולת חיזוק תרצה לבצע בסוף היום, ובאיזו שעה? (רשות)"));
});

test("section 4 continued: leaving reinforcement_action persists the profile AND commits (creates/updates) the real reinforcement Task BEFORE advancing -- progressForAdvance carries the resulting reinforcementTaskId so advanceDailyVisualization never operates on a stale progress record", () => {
  const fnIndex = visualizationScreen.indexOf("async function handleContinue()");
  const fnBody = visualizationScreen.slice(fnIndex, visualizationScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (step.kind === "reinforcement_action") {'));
  assert.ok(fnBody.includes("await saveDailyVisualizationReinforcement(reinforcementActionDraft.trim(), reinforcementTimeDraft.trim());"));
  assert.ok(fnBody.includes("progressForAdvance = await commitDailyVisualizationReinforcementTask(session.progress, reinforcementActionDraft, reinforcementTimeDraft);"));
  const advanceIndex = fnBody.indexOf("await advanceDailyVisualization(progressForAdvance, session.tasks);");
  const commitIndex = fnBody.indexOf("progressForAdvance = await commitDailyVisualizationReinforcementTask");
  assert.ok(advanceIndex !== -1 && commitIndex !== -1 && commitIndex < advanceIndex);
});

// --- Section 5: keep the flow efficient ----------------------------------

test("section 5: commitDailyVisualizationReinforcementTask UPDATES the already-tracked Task (by progress.reinforcementTaskId) rather than creating a second one on a later edit -- 'prevent duplicate tasks'", () => {
  const dataModule = readSource("data/dailyVisualization.ts");
  const fnIndex = dataModule.indexOf("export async function commitDailyVisualizationReinforcementTask(");
  const fnBody = dataModule.slice(fnIndex, dataModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("const existingTask = progress.reinforcementTaskId ? await getTask(progress.reinforcementTaskId) : null;"));
  assert.ok(fnBody.includes("existingTask\n    ?"), "must branch on whether a task is already tracked -- update it, rather than always creating a fresh one");
});

test("section 5: saveDailyVisualizationFeelingAndMovement/saveDailyVisualizationReinforcement both merge over the EXISTING stored profile rather than constructing a fresh one from scratch -- editing one half of the profile can never silently wipe the other half saved earlier in the same run", () => {
  const dataModule = readSource("data/dailyVisualization.ts");
  const feelingFnIndex = dataModule.indexOf("export async function saveDailyVisualizationFeelingAndMovement(");
  const feelingFnBody = dataModule.slice(feelingFnIndex, dataModule.indexOf("\n}", feelingFnIndex));
  assert.ok(feelingFnBody.includes("const existing = await loadDailyVisualizationProfile();"));
  assert.ok(feelingFnBody.includes("...(existing ?? createEmptyDailyVisualizationProfile(now.toISOString())),"));
  const reinforcementFnIndex = dataModule.indexOf("export async function saveDailyVisualizationReinforcement(");
  const reinforcementFnBody = dataModule.slice(reinforcementFnIndex, dataModule.indexOf("\n}", reinforcementFnIndex));
  assert.ok(reinforcementFnBody.includes("const existing = await loadDailyVisualizationProfile();"));
});

test("section 5: the reinforcement action/time drafts are pre-filled from the saved profile exactly like feeling/movement, and remain freely editable plain TextInputs", () => {
  assert.ok(visualizationScreen.includes("setReinforcementActionDraft(loaded.profile.reinforcementAction);"));
  assert.ok(visualizationScreen.includes("setReinforcementTimeDraft(loaded.profile.reinforcementTime);"));
  assert.match(visualizationScreen, /<TextInput\s+style=\{styles\.textInput\}\s+value=\{reinforcementActionDraft\}\s+onChangeText=\{setReinforcementActionDraft\}/);
});

test("section 5: a labeled bypass remains available throughout the main preparation sequence, unaffected by the 2 new steps -- 'allow users to exit and resume preparation later without data loss'", () => {
  assert.match(visualizationScreen, /<Pressable style=\{styles\.bypassLink\} onPress=\{handleBypass\}/);
});

test("section 5: resuming an interrupted exercise never re-snapshots today's tasks and never re-asks already-saved feeling/movement/reinforcement -- loadOrStartDailyVisualizationSession still resumes via resolveResumableProgress exactly as before, untouched by this task", () => {
  const dataModule = readSource("data/dailyVisualization.ts");
  const fnIndex = dataModule.indexOf("export async function loadOrStartDailyVisualizationSession(");
  const fnBody = dataModule.slice(fnIndex, dataModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("resolveResumableProgress(existingProgress, todayDateLocal)"));
});

// --- Nine Functional Improvements task, Improvement 9 ("Configurable
// Morning Daily Visualization Alarm"): the one-time setup offer, shown
// before the first automatic morning preparation popup -----------------

test("checkpoint (before the FIRST automatic popup, ONE-TIME, never repeated): the mount effect loads MorningAlarmConfig and shows the 'alarmOffer' step only when hasOfferedSetup is still false -- strictly before the pre-existing active-session check hands off to 'checkin'", () => {
  const effectIndex = overlay.indexOf('useEffect(() => {\n    logStartupStep("mount effect starting"');
  const checkinIdx = overlay.indexOf('setStep("checkin");', effectIndex);
  const effectBody = overlay.slice(effectIndex, checkinIdx);
  assert.ok(effectBody.includes("loadMorningAlarmConfig()"));
  assert.ok(effectBody.includes("if (!alarmConfig.hasOfferedSetup) {"));
  assert.ok(effectBody.includes('setStep("alarmOffer");'));
});

test("checkpoint (configurable time/weekday repeat/enable toggle on the offer itself): the offer step renders an HH:MM time field and a full 7-day chip picker, seeded from the loaded config", () => {
  const stepIndex = overlay.indexOf('{step === "alarmOffer" && (');
  const stepBody = overlay.slice(stepIndex, stepIndex + 1500);
  assert.ok(stepBody.includes("value={alarmOfferTimeDraft}"));
  assert.ok(stepBody.includes("ALARM_OFFER_DAY_LABELS.map((label, dayOfWeek)"));
  assert.ok(stepBody.includes("toggleAlarmOfferDay(dayOfWeek)"));
  assert.match(overlay, /setAlarmOfferTimeDraft\(`\$\{String\(alarmConfig\.hour\)\.padStart\(2, "0"\)\}:\$\{String\(alarmConfig\.minute\)\.padStart\(2, "0"\)\}`\);/);
  assert.match(overlay, /setAlarmOfferDays\(alarmConfig\.recurrenceDays\);/);
});

test("checkpoint (genuinely ONE-TIME regardless of the choice made): finishAlarmOffer sets hasOfferedSetup: true UNCONDITIONALLY -- both the 'הפעלת שעון מעורר' button (enabled: true) and the 'לא עכשיו' link (enabled: false) call it, and either way the sequence continues to 'checkin', never getting stuck", () => {
  const stepIndex = overlay.indexOf('{step === "alarmOffer" && (');
  const stepBody = overlay.slice(stepIndex, stepIndex + 1500);
  assert.ok(stepBody.includes("onPress={() => finishAlarmOffer(true)}"));
  assert.ok(stepBody.includes("onPress={() => finishAlarmOffer(false)}"));
  const fnIndex = overlay.indexOf("async function finishAlarmOffer(enabled: boolean)");
  const fnBody = overlay.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("hasOfferedSetup: true,"));
  assert.ok(fnBody.includes("enabled,"));
  assert.ok(fnBody.includes("await saveMorningAlarmConfig(next);"));
  assert.ok(fnBody.includes("await syncMorningAlarm();"));
  assert.ok(fnBody.includes('setStep("checkin");'));
});

test("checkpoint (a malformed time draft never blocks finishing the offer): finishAlarmOffer falls back to the existing config's own hour/minute when the draft doesn't parse as HH:MM, rather than saving garbage or refusing to proceed", () => {
  const fnIndex = overlay.indexOf("async function finishAlarmOffer(enabled: boolean)");
  const fnBody = overlay.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("const validTime = parsedHour !== null && parsedMinute !== null"));
  assert.ok(fnBody.includes("hour: validTime ? parsedHour! : morningAlarmConfig.hour,"));
  assert.ok(fnBody.includes("minute: validTime ? parsedMinute! : morningAlarmConfig.minute,"));
});

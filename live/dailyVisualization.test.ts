import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/dailyVisualization.test.ts
 *
 * Daily Visualization task: source-text regression guard for the UI
 * layer and its wiring into the existing startup overlay and
 * ActiveTaskScreen -- same convention as every other screen test in
 * this codebase (React Native components aren't renderable under a
 * plain `node --test` run). The pure step/progress/scheduling logic
 * itself is fully exercised in arc/dailyVisualization.test.ts, and the
 * AsyncStorage/notifee orchestration in data/dailyVisualization.test.ts
 * and data/dailyVisualizationAlarm.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/DailyVisualizationScreen.tsx");
const route = readSource("app/daily-visualization.tsx");
const layout = readSource("app/_layout.tsx");
const overlay = readSource("live/DailyStartupSequenceOverlay.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const dailyScheduleScreen = readSource("build/DailyScheduleScreen.tsx");
const manifestMeditationScreen = readSource("live/ManifestMeditationScreen.tsx");
const manifestMeditationModule = readSource("arc/manifestMeditation.ts");

// --- Route registration ---

test("app/daily-visualization.tsx renders the screen, passing returnToTaskId through, and app/_layout.tsx registers the route", () => {
  assert.ok(route.includes("<DailyVisualizationScreen returnToTaskId={returnToTaskId} />"));
  assert.match(layout, /<Stack\.Screen name="daily-visualization" /);
});

// --- Exact required instruction texts (requirement 2-3: never invented, never reworded) ---

test("every required instruction/question text appears VERBATIM", () => {
  const required = [
    "דמיין את עצמך מבצע את המשימה הזאת.",
    "כעת בצע סריקת גוף מהירה.",
    "שים לב לתחושות בגוף שלך, מהראש ועד הרגליים, מבלי לנסות לשנות אותן.",
    "איך היית רוצה להרגיש בסוף היום?",
    "איזו תנועת גוף מייצגת עבורך את התחושה הזאת?",
  ];
  for (const text of required) {
    assert.ok(screen.includes(text), `missing required text: ${text}`);
  }
});

test("the gate's required prompt text and button label appear verbatim in live/ActiveTaskScreen.tsx", () => {
  assert.ok(activeTaskScreen.includes("לפני שנתחיל במשימות היום, נשלים את הוויזואליזציה היומית."));
  assert.ok(activeTaskScreen.includes('<Text style={styles.primaryButtonText}>התחל ויזואליזציה</Text>'));
});

test("the late-start message appears verbatim, shown only inside the already-completed branch", () => {
  assert.ok(screen.includes("התחלת את הוויזואליזציה מאוחר מהמתוכנן. כדאי לעדכן את לוח הזמנים שלך."));
});

// --- Task-by-task sequencing (requirement 2): uses real task fields, never invents content ---

test("the task-stage-visualize step's LEGACY (no configured stages) branch renders the task's own title/schedule/duration/first action verbatim -- never invented text or motivations", () => {
  const stepIndex = screen.indexOf('if (step.kind === "task_stage_visualize")');
  const stepBody = screen.slice(stepIndex, stepIndex + 1200);
  assert.ok(stepBody.includes("{task.title}"));
  assert.ok(stepBody.includes("{formatTaskSchedule(task)}"));
  assert.ok(stepBody.includes("task.firstAction.trim()"));
  assert.ok(stepBody.includes("{task.firstAction}"));
});

test("resolveCurrentStep (not a separately-tracked UI index) decides what to render -- the screen never re-derives step state independently of the persisted progress record", () => {
  assert.ok(screen.includes("const step = resolveCurrentStep(session.progress, session.tasks);"));
});

// --- Unified Task Stages task: stage-by-stage visualization ---

test("a task with configured action stages renders the Environmental Trigger, Environmental Cue, Small Action and Main Action instructions built ONLY from its own saved stage text -- never inventing content, and the cue falls back to the trigger's own description when no separate cue was saved", () => {
  const stepIndex = screen.indexOf('if (step.kind === "task_stage_visualize")');
  const stepBody = screen.slice(stepIndex, stepIndex + 2600);
  assert.ok(stepBody.includes("hasConfiguredActionStages(stages)"));
  assert.ok(stepBody.includes('step.stageKind === "trigger" && trigger'));
  assert.ok(stepBody.includes("`דמיין שאתה ${trigger.description}.`"));
  assert.ok(stepBody.includes('step.stageKind === "trigger_cue" && trigger'));
  assert.ok(stepBody.includes("trigger.cueDescription ? `דמיין את ${trigger.cueDescription} מולך.` : `דמיין את התוצאה של הפעולה: ${trigger.description}.`"));
  assert.ok(stepBody.includes('step.stageKind === "small" && small'));
  assert.ok(stepBody.includes("`דמיין שאתה ${small.description}.`"));
  assert.ok(stepBody.includes("`דמיין שאתה ${main.description}.`"));
});

test("the quick body scan step's own exact required text is completely unchanged by the stage extension", () => {
  assert.ok(screen.includes("כעת בצע סריקת גוף מהירה."));
  assert.ok(screen.includes("שים לב לתחושות בגוף שלך, מהראש ועד הרגליים, מבלי לנסות לשנות אותן."));
});

// --- Feeling/movement persistence (requirement 3: preserved across days, editable) ---

test("the feeling+movement profile is persisted exactly once, when leaving the 'movement' step -- by then both drafts are finalized", () => {
  const fnIndex = screen.indexOf("async function handleContinue");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.match(fnBody, /if \(step\.kind === "movement"\) \{\s*await saveDailyVisualizationFeelingAndMovement\(feelingDraft\.trim\(\), movementDraft\.trim\(\)\);/);
});

test("the feeling/movement text inputs are pre-filled from the saved profile and remain freely editable (plain TextInput, never read-only)", () => {
  assert.ok(screen.includes("setFeelingDraft(loaded.profile.desiredFeeling);"));
  assert.ok(screen.includes("setMovementDraft(loaded.profile.bodyMovement);"));
  assert.match(screen, /<TextInput style=\{styles\.textInput\} value=\{feelingDraft\} onChangeText=\{setFeelingDraft\}/);
  assert.match(screen, /<TextInput style=\{styles\.textInput\} value=\{movementDraft\} onChangeText=\{setMovementDraft\}/);
});

test("the final step displays the saved feeling and movement, never inventing either", () => {
  const stepIndex = screen.indexOf("// step.kind === \"final\"");
  const stepBody = screen.slice(stepIndex, stepIndex + 600);
  assert.ok(stepBody.includes("{feelingDraft ||"));
  assert.ok(stepBody.includes("{movementDraft ||"));
});

// --- Completion is never task completion (section 2: "do not mark tasks as completed simply because the user visualized them") ---

test("nothing in this screen or its data layer ever calls completeTask/marks a Task's own status complete -- visualizing is preparation, never task completion", () => {
  assert.ok(!screen.includes("completeTask("));
  assert.ok(!screen.includes('status: "completed"'));
});

// --- Bypass (requirement 5): always available, clearly labeled, never deletes ---

test("a labeled bypass control is always rendered during the exercise, calling bypassDailyVisualization then navigating onward -- never deleting a task", () => {
  assert.match(screen, /<Pressable style=\{styles\.bypassLink\} onPress=\{handleBypass\}/);
  const fnIndex = screen.indexOf("async function handleBypass");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await bypassDailyVisualization(session.progress);"));
  assert.ok(fnBody.includes("navigateOnward();"));
});

// --- Late-start conflicts link to the EXISTING task editor (reuse, never a new conflict-resolution UI) ---

test("a detected late-start conflict links each affected task to the EXISTING /tasks/[id]/edit screen -- reusing existing scheduling/conflict-resolution UI, never a new one", () => {
  assert.match(screen, /pathname: "\/tasks\/\[id\]\/edit", params: \{ id: task\.id \}/);
});

test("with no conflicts detected, the screen proceeds without demanding any schedule edits -- 'only require schedule editing when there is a genuine conflict'", () => {
  const branchIndex = screen.indexOf("lateConflicts.length > 0 ? (");
  assert.ok(branchIndex !== -1);
  const branchBody = screen.slice(branchIndex, branchIndex + 1600);
  assert.ok(branchBody.includes(") : ("), "must have a plain, unconditional else-branch that proceeds without any conflict-editing demand");
});

// --- Navigation: returnToTaskId vs. the default daily-schedule destination ---

test("navigateOnward returns to the originating task (with autoStart=1) when returnToTaskId was given, and otherwise goes to the daily schedule", () => {
  const fnIndex = screen.indexOf("function navigateOnward()");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.match(fnBody, /pathname: "\/tasks\/\[id\]", params: \{ id: returnToTaskId, autoStart: "1" \}/);
  assert.ok(fnBody.includes('router.replace("/");'));
});

// --- Cold-start navigation: the overlay opens the exercise, never as a third popup ---

test("the startup overlay's finish() checks isDailyVisualizationNeededNow and router.push's to /daily-visualization BEFORE closing the Modal (never after) -- a third POPUP never exists, this is a real navigated screen", () => {
  const fnIndex = overlay.indexOf("async function finish()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("isDailyVisualizationNeededNow(new Date())"));
  assert.ok(fnBody.includes('router.push("/daily-visualization");'));
  const pushIndex = fnBody.indexOf('router.push("/daily-visualization")');
  const closeIndex = fnBody.indexOf('setStep("done")');
  assert.ok(pushIndex !== -1 && closeIndex !== -1 && pushIndex < closeIndex, "must navigate before closing the Modal, never after");
});

test("a failed check fails open -- the Modal still closes and the trainee still reaches the daily schedule, never getting stuck", () => {
  const fnIndex = overlay.indexOf("async function finish()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("} catch (error) {"));
  assert.ok(fnBody.includes("} finally {"));
});

// --- Required-before-tasks gate (requirement 5) ---

test("live/ActiveTaskScreen.tsx's handleStart is the ONE gate every task-start path shares (the manual button AND the autoStart effect both call it), checking isDailyVisualizationNeededNow before ever delegating to performStart", () => {
  const fnIndex = activeTaskScreen.indexOf("async function handleStart()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (await isDailyVisualizationNeededNow()) {"));
  assert.ok(fnBody.includes("setShowVisualizationGate(true);"));
  assert.ok(fnBody.includes("await performStart();"));
  assert.match(activeTaskScreen, /handleStart\(\);/, "the autoStart effect must still call handleStart(), never performStart() directly (which would bypass the gate)");
});

test("the gate's own 'bypass' path records the bypass via bypassDailyVisualizationForToday, then proceeds to performStart immediately (not a second round-trip through handleStart)", () => {
  const fnIndex = activeTaskScreen.indexOf("async function handleBypassVisualizationFromGate");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await bypassDailyVisualizationForToday();"));
  assert.ok(fnBody.includes("await performStart();"));
});

test("opening the exercise from the gate passes returnToTaskId so completing/bypassing it there returns straight to THIS task", () => {
  const fnIndex = activeTaskScreen.indexOf("function handleOpenVisualizationFromGate");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 300);
  assert.match(fnBody, /pathname: "\/daily-visualization", params: \{ returnToTaskId: task\.id \}/);
});

test("the gate is presented through a real Modal (the proven top-of-screen presentation mechanism), never a bare inline block that could be occluded", () => {
  assert.match(activeTaskScreen, /<Modal visible=\{showVisualizationGate\} transparent animationType="fade" onRequestClose=\{\(\) => setShowVisualizationGate\(false\)\}>/);
});

// --- Alarm reconciliation wired into the daily schedule's own existing reload ---

test("build/DailyScheduleScreen.tsx reconciles the Daily Visualization alarm on every focus, alongside the existing task/ARC alarm reconciles -- never a separate, un-reconciled code path", () => {
  assert.ok(dailyScheduleScreen.includes("reconcileDailyVisualizationAlarm()"));
});

// --- Manifest Meditation stays untouched and separate (requirement 7) ---

test("Manifest Meditation is completely untouched -- it never references any Daily Visualization concept, and this feature never restructures its own stage sequence", () => {
  for (const source of [manifestMeditationModule, manifestMeditationScreen]) {
    assert.ok(!source.includes("DailyVisualization"));
    assert.ok(!source.includes("dailyVisualization"));
  }
});

// --- Unified Task Stages task: visualizing a task's stages never touches TaskStageProgress or completion ---

test("the Daily Visualization screen and its pure step model never reference TaskStageProgress or completeTask -- visualizing a task's stages is preparation only, never stage or task completion", () => {
  const dailyVisualizationModule = readSource("arc/dailyVisualization.ts");
  const dailyVisualizationDataModule = readSource("data/dailyVisualization.ts");
  for (const source of [screen, dailyVisualizationModule, dailyVisualizationDataModule]) {
    assert.ok(!source.includes("TaskStageProgress"));
    assert.ok(!source.includes("markStageCompleted"));
    assert.ok(!source.includes("completeTask("));
  }
});

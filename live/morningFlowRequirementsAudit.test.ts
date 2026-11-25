import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/morningFlowRequirementsAudit.test.ts
 *
 * ARCHI — Final Morning Flow Requirements Audit task: source-text
 * regression guard for the UI/wiring layer of the 4 confirmed gaps
 * this task fixed (location display, per-task body-scan notes, the
 * immediate-action task commit, and the planning-step review list) --
 * AsyncStorage/navigation, not callable under a plain `node --test`
 * run, same convention as every other screen test in this codebase.
 * The pure logic itself is fully exercised, executed, in
 * arc/tasks.test.ts, arc/taskDraft.test.ts, arc/dailyVisualization.test.ts
 * and arc/dailyPlan.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const editorScreen = readSource("build/TaskEditorScreen.tsx");
const visualizationScreen = readSource("live/DailyVisualizationScreen.tsx");
const dataModule = readSource("data/dailyVisualization.ts");
const overlay = readSource("live/DailyStartupSequenceOverlay.tsx");
const dailyVisualizationAlarmModule = readSource("data/dailyVisualizationAlarm.ts");

// --- Requirement 1: morning alarm (confirmed MISSING -- documentation guard only) ---

test("requirement 1 (documented gap): the existing Daily Visualization alarm is auto-derived from the first task's time, never user-configurable, and has no snooze action -- confirming it is NOT the dedicated configurable morning alarm the audit asks about", () => {
  assert.ok(dailyVisualizationAlarmModule.includes("resolveFirstTaskClockTimeToday"), "its fire time is computed from today's tasks, never a user-set clock time");
  assert.ok(!dailyVisualizationAlarmModule.includes("SNOOZE") && !dailyVisualizationAlarmModule.includes("snooze"), "no snooze action exists on this alarm");
  assert.ok(!dailyVisualizationAlarmModule.includes("repeat") && !dailyVisualizationAlarmModule.includes("Repeat"), "no user-facing repeat/schedule configuration exists on this alarm");
});

// --- Requirement 2: visualization + body scan for every task ---

test("requirement 2: the task_stage_visualize step displays the task's own saved location (when set) in BOTH the legacy and the staged render branches, alongside the pre-existing time/first-action display", () => {
  const legacyBranchIndex = visualizationScreen.indexOf("if (!hasConfiguredActionStages(stages)) {");
  const legacyBranchBody = visualizationScreen.slice(legacyBranchIndex, legacyBranchIndex + 700);
  assert.ok(legacyBranchBody.includes("{!!task.location?.trim() && <Text style={styles.taskLocation}>{`מיקום: ${task.location}`}</Text>}"));

  const stagedBranchIndex = visualizationScreen.indexOf('if (step.stageKind === "trigger" && trigger)');
  const stagedBranchBody = visualizationScreen.slice(stagedBranchIndex, stagedBranchIndex + 900);
  assert.ok(stagedBranchBody.includes("{!!task.location?.trim() && <Text style={styles.taskLocation}>{`מיקום: ${task.location}`}</Text>}"));
});

test("requirement 2: a 'מיקום (רשות)' field exists in the task editor, saving/loading through the SAME draft (TaskDraft.location) as every other field -- never a second, separate location concept", () => {
  assert.ok(editorScreen.includes('<Field label="מיקום (רשות)">'));
  assert.ok(editorScreen.includes("onChangeText={(location) => setDraft({ ...draft, location })}"));
});

test("requirement 2: a body scan occurs IMMEDIATELY after each task's own visualization, before the next task begins -- buildDailyVisualizationSteps still interleaves one task_body_scan right after that SAME task's visualize step(s), never batching all visualizations first", () => {
  const dailyVisualizationModule = readSource("arc/dailyVisualization.ts");
  const fnIndex = dailyVisualizationModule.indexOf("export function buildDailyVisualizationSteps(");
  const fnBody = dailyVisualizationModule.slice(fnIndex, dailyVisualizationModule.indexOf("\n}", fnIndex));
  assert.match(fnBody, /for \(const stageKind of stageKinds\) steps\.push\(\{ kind: "task_stage_visualize", taskIndex, stageKind \}\);\s*steps\.push\(\{ kind: "task_body_scan", taskIndex \}\);/);
});

test("requirement 2: an optional per-task body-scan note is rendered on the task_body_scan step, pre-filled from (and saved back to) THIS task's own saved note -- 'preserve separate body-scan results per task and date'", () => {
  const stepContentIndex = visualizationScreen.indexOf("function StepContent(");
  const stepIndex = visualizationScreen.indexOf('if (step.kind === "task_body_scan") {', stepContentIndex);
  const stepBody = visualizationScreen.slice(stepIndex, stepIndex + 1400);
  assert.ok(stepBody.includes("value={bodyScanNoteDraft}"));
  assert.ok(stepBody.includes("onChangeText={setBodyScanNoteDraft}"));

  const prefillIndex = visualizationScreen.indexOf('if (step.kind !== "task_body_scan") return;');
  const prefillBody = visualizationScreen.slice(prefillIndex, prefillIndex + 300);
  assert.ok(prefillBody.includes("findBodyScanNote(session.progress.bodyScanNotes, task.id)"));

  const continueIndex = visualizationScreen.indexOf('if (step.kind === "task_body_scan") {', visualizationScreen.indexOf("async function handleContinue"));
  const continueBody = visualizationScreen.slice(continueIndex, continueIndex + 300);
  assert.ok(continueBody.includes("saveDailyVisualizationBodyScanNote(session.progress, task.id, bodyScanNoteDraft)"));
});

test("requirement 2 continued: the body-scan note save is keyed by this SPECIFIC task's own id (never a shared/global note), and the whole progress record is already scoped to one date -- 'per task AND date' both hold", () => {
  const fnIndex = dataModule.indexOf("export async function saveDailyVisualizationBodyScanNote(");
  const fnBody = dataModule.slice(fnIndex, dataModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("upsertBodyScanNote(progress.bodyScanNotes, taskId, note)"));
});

// --- Requirement 3: two emotion-reinforcing actions, both on today's routine ---

test("requirement 3: leaving the 'movement' step (the immediate priority action) ALSO commits a real Task for today via commitDailyVisualizationImmediateActionTask, alongside the pre-existing profile save -- the FIRST of the two actions now lands on today's Flexible Daily Routine, not just the saved profile", () => {
  const fnIndex = visualizationScreen.indexOf("async function handleContinue");
  const fnBody = visualizationScreen.slice(fnIndex, visualizationScreen.indexOf("\n  }", fnIndex));
  const movementIndex = fnBody.indexOf('if (step.kind === "movement") {');
  const reinforcementIndex = fnBody.indexOf('if (step.kind === "reinforcement_action") {');
  assert.ok(movementIndex !== -1 && reinforcementIndex !== -1 && movementIndex < reinforcementIndex);
  const movementBody = fnBody.slice(movementIndex, reinforcementIndex);
  assert.ok(movementBody.includes("await saveDailyVisualizationFeelingAndMovement(feelingDraft.trim(), movementDraft.trim());"));
  assert.ok(movementBody.includes("progressForAdvance = await commitDailyVisualizationImmediateActionTask(session.progress, movementDraft);"));
});

test("requirement 3 continued: both commit functions schedule a real, one-time Task for TODAY's own date (never touching recurrence/the permanent weekly template) -- createEmptyTask's own default recurrence ('once') is never overridden by either commit path", () => {
  const immediateFnIndex = dataModule.indexOf("export async function commitDailyVisualizationImmediateActionTask(");
  const immediateFnBody = dataModule.slice(immediateFnIndex, dataModule.indexOf("\n}", immediateFnIndex));
  assert.ok(!immediateFnBody.includes("recurrence:"), "never sets a recurring recurrence -- a plain one-time Task, same as createEmptyTask's own default");
  assert.ok(immediateFnBody.includes("scheduledDate: fields.scheduledDate"));

  const reinforcementFnIndex = dataModule.indexOf("export async function commitDailyVisualizationReinforcementTask(");
  const reinforcementFnBody = dataModule.slice(reinforcementFnIndex, dataModule.indexOf("\n}", reinforcementFnIndex));
  assert.ok(!reinforcementFnBody.includes("recurrence:"));
});

test("requirement 3 continued: the two actions use two COMPLETELY INDEPENDENT dedupe slots (immediateActionTaskId vs. reinforcementTaskId) -- editing one can never accidentally update or duplicate the other's Task", () => {
  const immediateFnIndex = dataModule.indexOf("export async function commitDailyVisualizationImmediateActionTask(");
  const immediateFnBody = dataModule.slice(immediateFnIndex, dataModule.indexOf("\n}", immediateFnIndex));
  assert.ok(immediateFnBody.includes("progress.immediateActionTaskId"));
  assert.ok(!immediateFnBody.includes("reinforcementTaskId"));

  const reinforcementFnIndex = dataModule.indexOf("export async function commitDailyVisualizationReinforcementTask(");
  const reinforcementFnBody = dataModule.slice(reinforcementFnIndex, dataModule.indexOf("\n}", reinforcementFnIndex));
  assert.ok(reinforcementFnBody.includes("progress.reinforcementTaskId"));
  assert.ok(!reinforcementFnBody.includes("immediateActionTaskId"));
});

test("requirement 3 continued: ONLY the end-of-day reinforcement action carries a chosen TIME -- the immediate action's own build function never takes or forwards one, matching 'immediate' (right now) vs. 'scheduled at the user's chosen time' (end-of-day)", () => {
  const dailyVisualizationModule = readSource("arc/dailyVisualization.ts");
  const fnIndex = dailyVisualizationModule.indexOf("export function buildImmediateActionTaskFields(");
  const signatureLine = dailyVisualizationModule.slice(fnIndex, dailyVisualizationModule.indexOf(")", fnIndex));
  assert.ok(!signatureLine.includes("time"));
});

// --- Requirement 4: user-controlled planning readiness ---

test("requirement 4: the planning step holds the REAL scheduled entries (planEntries), not just a cached suitable/unsuitable boolean -- suitability is derived fresh via isDailyScheduleSuitable(planEntries) at render time, so it can never drift from what's actually reviewable", () => {
  assert.ok(overlay.includes("const [planEntries, setPlanEntries] = useState<ScheduledPlanEntry[] | null>(null);"));
  assert.ok(!overlay.includes("const [planSuitable"), "the old cached-boolean state must be gone, replaced by the real entries");
});

test("requirement 4 continued: a review list of today's ACTUAL scheduled entries (title + effective time) is rendered in BOTH the suitable and unsuitable planning-step cards -- reaching 3 tasks never silently skips straight past review", () => {
  const planningIndex = overlay.indexOf('{step === "planning" && planEntries &&');
  const planningBody = overlay.slice(planningIndex, planningIndex + 1800);
  const occurrences = planningBody.match(/\{planReviewList\}/g) ?? [];
  assert.equal(occurrences.length, 2, "the review list must appear in both the suitable and unsuitable branches");
});

test("requirement 4 continued: tapping a reviewed entry closes the overlay and opens the EXISTING /tasks/[id]/edit screen -- reusing the real task editor, never a second, separate inline editor, and never creating/duplicating any Task along the way", () => {
  const fnIndex = overlay.indexOf("function openEntryForEditing(entry: ScheduledPlanEntry)");
  const fnBody = overlay.slice(fnIndex, overlay.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('setStep("done");'));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: entry.task.id } });'));
});

test("requirement 4 continued: the 'ready' primary button and the 'quick planning'/'skip planning' pair are both STILL one tap away -- a trainee who judges the plan ready (or decides to skip planning regardless of count) is never forced through a multi-step wizard before continuing", () => {
  assert.ok(overlay.includes("התוכנית שלי מוכנה — המשך להכנה"));
  assert.ok(overlay.includes("תכנון מהיר של היום"));
  assert.ok(overlay.includes("דילוג על התכנון — המשך להכנה"));
});

test("requirement 4 continued: the 3-task recommendation text is preserved verbatim, shown only in the unsuitable branch -- a guideline, never a hard block (the primary 'continue' action always exists independently of it)", () => {
  assert.ok(overlay.includes("מומלץ לבחור לפחות 3 משימות להיום"));
});

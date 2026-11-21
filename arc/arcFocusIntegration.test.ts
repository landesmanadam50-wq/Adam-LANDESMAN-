import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * arc/arcFocusIntegration.test.ts
 *
 * ARC Focus task: source-text regression guard for the feature's own
 * wiring into ARCHI's EXISTING systems -- route registration, the mood
 * check-in -> preliminary ARC -> auto-resume chain, the task-kind gate
 * in live/ActiveTaskScreen.tsx, the scheduling creation recipe, and the
 * explicit "no edit needed" guarantee for data/taskAlarm.ts/
 * arc/taskOccurrenceOverride.ts/arc/dailyPlan.ts/arc/weeklyRoutine.ts/
 * arc/postTaskRewards.ts. The pure engine/session state machine is
 * fully covered by arc/arcFocusEngine.test.ts/arc/arcFocusSession.test.ts;
 * this file only ever asserts structural wiring, following this
 * codebase's own established pattern for a screen a full RN renderer
 * can't drive directly (compare live/manifestTaskLiveScreen.test.ts,
 * build/arcGymScreens.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const newArcLiveScreen = readSource("live/NewArcLiveScreen.tsx");
const arcRoute = readSource("app/tasks/[id]/arc.tsx");
const arcFocusRoute = readSource("app/tasks/[id]/arc-focus.tsx");
const arcFocusCheckInRoute = readSource("app/tasks/[id]/arc-focus/check-in.tsx");
const arcGymArcFocusRoute = readSource("app/arc-gym/arc-focus.tsx");
const emotionalCheckInRouting = readSource("data/emotionalCheckInRouting.ts");
const tasksModule = readSource("arc/tasks.ts");
const newArcLiveTypes = readSource("arc/newArcLiveTypes.ts");
const storage = readSource("data/storage.ts");
const arcGymScreen = readSource("build/ArcGymScreen.tsx");
const arcFocusSettingsScreen = readSource("build/ArcFocusSettingsScreen.tsx");
const arcFocusCheckInScreen = readSource("live/ArcFocusCheckInScreen.tsx");
const arcFocusLiveScreen = readSource("live/ArcFocusLiveScreen.tsx");
const taskAlarm = readSource("data/taskAlarm.ts");
const taskOccurrenceOverride = readSource("arc/taskOccurrenceOverride.ts");
const dailyPlan = readSource("arc/dailyPlan.ts");
const weeklyRoutine = readSource("arc/weeklyRoutine.ts");
const postTaskRewards = readSource("data/postTaskRewards.ts");

test("required test 1: ARC GYM lists a dedicated 'ARC Focus' nav card, reaching its own settings route -- never from Home or the floating cube", () => {
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/arc-focus")'));
  assert.ok(arcGymScreen.includes("ARC Focus"));
});

test("required test 2: every new ARC Focus route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="arc-gym\/arc-focus"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/arc-focus\/check-in"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/arc-focus"/);
});

test("required test 3: the three route wrappers forward their params straight through, same 2-line pattern as app/tasks/[id]/manifest.tsx", () => {
  assert.ok(arcGymArcFocusRoute.includes("ArcFocusSettingsScreen taskId={taskId ?? null}"));
  assert.ok(arcFocusRoute.includes("ArcFocusLiveScreen taskId={id} arcFocusPracticeId={arcFocusPracticeId}"));
  assert.ok(arcFocusCheckInRoute.includes("ArcFocusCheckInScreen id={id} arcFocusPracticeId={arcFocusPracticeId}"));
});

test("required test 4: TaskKind is extended with 'arcFocus', additive to 'standard'/'manifest'", () => {
  assert.match(tasksModule, /export type TaskKind = "standard" \| "manifest" \| "arcFocus" \| "arcLearningReview" \| "arcCreativityReview" \| "arcWriting";/);
});

test("required test 5: NewArcLiveSessionState/ArcSessionRequest/sessionMatchesRequest/createNewArcLiveSessionState all carry arcFocusPracticeId alongside arcGymSituationId", () => {
  assert.match(newArcLiveTypes, /arcFocusPracticeId: string \| null;/);
  assert.ok(newArcLiveTypes.includes("session.arcFocusPracticeId === request.arcFocusPracticeId"));
  assert.ok(newArcLiveTypes.includes("arcFocusPracticeId: null,"));
});

test("required test 6: data/storage.ts's loadNewArcLiveSession backfills arcFocusPracticeId for a session saved before this field existed", () => {
  assert.ok(storage.includes("arcFocusPracticeId: parsed.arcFocusPracticeId ?? null,"));
});

test("required test 7: data/storage.ts exposes the full ARC Focus CRUD -- settings (default + per-task), the single resumable session slot, and the append-only practice history", () => {
  for (const fn of [
    "export async function loadArcFocusSettings",
    "export async function saveArcFocusSettings",
    "export async function loadArcFocusSession",
    "export async function saveArcFocusSession",
    "export async function clearArcFocusSession",
    "export async function loadArcFocusPracticeHistory",
    "export async function saveArcFocusPracticeRecord",
  ]) {
    assert.ok(storage.includes(fn), `expected data/storage.ts to export ${fn}`);
  }
});

test("required test 8: handleArcFocusCheckInChoice routes 😟/🙂 through the EXISTING openFullArc/openShortenedArc (never a duplicated ARC flow) and 😄 straight into ARC Focus with no preliminary ARC session at all", () => {
  const fnIndex = emotionalCheckInRouting.indexOf("export async function handleArcFocusCheckInChoice");
  const fnBody = emotionalCheckInRouting.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('if (choice === "full_arc") return openFullArc(taskId, { arcFocusPracticeId: options.arcFocusPracticeId });'));
  assert.ok(fnBody.includes('if (choice === "shortened_arc") return openShortenedArc(taskId, { arcFocusPracticeId: options.arcFocusPracticeId });'));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/arc-focus"'));
  assert.ok(fnBody.includes("options.returnToTaskId ?? STANDALONE_ARC_TASK_ID"));
});

test("required test 9: openFullArc/openShortenedArc thread arcFocusPracticeId as a sibling param WITHOUT forcing the standalone sentinel (unlike arcGymSituationId's own override)", () => {
  const fnIndex = emotionalCheckInRouting.indexOf("export async function openFullArc");
  const fnBody = emotionalCheckInRouting.slice(fnIndex, fnIndex + 650);
  assert.ok(fnBody.includes("options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId"));
  assert.ok(fnBody.includes("if (options.arcFocusPracticeId) params.arcFocusPracticeId = options.arcFocusPracticeId;"));
  assert.ok(!fnBody.includes("options.arcFocusPracticeId ? STANDALONE_ARC_TASK_ID"), "arcFocusPracticeId must never force the standalone id the way arcGymSituationId does");
});

test("required test 10: app/tasks/[id]/arc.tsx parses and forwards arcFocusPracticeId exactly like arcGymSituationId", () => {
  assert.match(arcRoute, /arcFocusPracticeId\?: string;/);
  assert.ok(arcRoute.includes("arcFocusPracticeId={arcFocusPracticeId ?? null}"));
});

test("required test 11: live/ActiveTaskScreen.tsx's performStart routes an 'arcFocus'-kind task straight to the mood check-in, creating the planned ArcFocusSession first -- placed before the calendarEntryKind branches, so it is reached by both a manual start and an alarm-triggered autoStart", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  const manifestIndex = activeTaskScreen.indexOf('if (task.taskKind === "manifest")', fnIndex);
  const arcFocusIndex = activeTaskScreen.indexOf('if (task.taskKind === "arcFocus")', fnIndex);
  const calendarArcIndex = activeTaskScreen.indexOf('if (task.calendarEntryKind === "arc")', fnIndex);
  assert.ok(manifestIndex > fnIndex && arcFocusIndex > manifestIndex && calendarArcIndex > arcFocusIndex, "the arcFocus branch must sit between the manifest branch and the calendarEntryKind branches");
  const fnBody = activeTaskScreen.slice(arcFocusIndex, arcFocusIndex + 500);
  assert.ok(fnBody.includes("await loadArcFocusSettings(task.id)"));
  assert.ok(fnBody.includes("generateArcFocusPracticeId()"));
  assert.ok(fnBody.includes("await saveArcFocusSession(createArcFocusSession(practiceId, task.id, settings, now))"));
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/arc-focus/check-in"'));
});

test("required test 12: the start button's own label reflects the arcFocus task kind too", () => {
  const buttonIndex = activeTaskScreen.indexOf('{task.taskKind === "manifest"');
  const buttonBody = activeTaskScreen.slice(buttonIndex, buttonIndex + 400);
  assert.ok(buttonBody.includes('"התחלת תרגול Manifest"'));
  assert.ok(buttonBody.includes('task.taskKind === "arcFocus"'));
  assert.ok(buttonBody.includes('"התחלת ARC Focus"'));
});

test("required test 13: an arcFocus-kind task's own Task Details/LIVE screen offers a link back to its own settings (duration/rhythm/attention-checks), re-opening the SAME settings screen keyed by this task's id -- never a second, task-specific settings screen", () => {
  assert.ok(activeTaskScreen.includes('task.taskKind === "arcFocus" && ('));
  assert.ok(activeTaskScreen.includes('pathname: "/arc-gym/arc-focus", params: { taskId: task.id }'));
});

test("required test 14: live/NewArcLiveScreen.tsx's returnToTask() checks arcFocusPracticeId immediately after the arcGymSituationId branch and before morningFlowCheckIn -- both are 'this ARC run was a preliminary step, never a normal task completion' cases", () => {
  const fnIndex = newArcLiveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  const arcGymIndex = newArcLiveScreen.indexOf("if (session?.arcGymSituationId)", fnIndex);
  const arcFocusIndex = newArcLiveScreen.indexOf("if (session?.arcFocusPracticeId)", fnIndex);
  const morningFlowIndex = newArcLiveScreen.indexOf("if (morningFlowCheckIn)", fnIndex);
  assert.ok(arcGymIndex > fnIndex && arcFocusIndex > arcGymIndex && morningFlowIndex > arcFocusIndex, "branch order must be: arcGymSituationId, then arcFocusPracticeId, then morningFlowCheckIn");
  const branchBody = newArcLiveScreen.slice(arcFocusIndex, morningFlowIndex);
  assert.ok(branchBody.includes('pathname: "/tasks/[id]/arc-focus"'));
  assert.ok(branchBody.includes("id: taskId"), "must preserve whatever taskId is already in scope (real task or the standalone sentinel) -- never force it");
});

test("required test 15: the mood check-in screen offers exactly the three standard choices (😟 פחות טוב / 🙂 סבבה / 😄 מעולה), dispatching through handleArcFocusCheckInChoice -- never a fourth, ARC-Focus-specific choice", () => {
  assert.ok(arcFocusCheckInScreen.includes('choose("full_arc")'));
  assert.ok(arcFocusCheckInScreen.includes('choose("shortened_arc")'));
  assert.ok(arcFocusCheckInScreen.includes('choose("direct")'));
  assert.ok(arcFocusCheckInScreen.includes("פחות טוב"));
  assert.ok(arcFocusCheckInScreen.includes("סבבה"));
  assert.ok(arcFocusCheckInScreen.includes("מעולה"));
  assert.ok(arcFocusCheckInScreen.includes("handleArcFocusCheckInChoice"));
});

test("required test 16: ArcFocusSettingsScreen's scheduling path creates a real Task (taskKind 'arcFocus') with the EXACT SAME recipe build/FlexibleDailyScreen.tsx's own handleAddDirect uses -- buildTaskFromDraft + upsertTask + reconcileTaskAlarms -- never a second task-creation mechanism or a second calendar/record", () => {
  assert.ok(arcFocusSettingsScreen.includes('taskKind: "arcFocus" as const'));
  assert.ok(arcFocusSettingsScreen.includes("buildTaskFromDraft(draft, emptyTaskBase(newTaskId, now), now)"));
  assert.ok(arcFocusSettingsScreen.includes("await upsertTask(task)"));
  assert.ok(arcFocusSettingsScreen.includes("await reconcileTaskAlarms()"));
});

test("required test 17: ArcFocusSettingsScreen's immediate-start path never creates a Task at all -- a standalone practice is a persisted ArcFocusSession with taskId null, exactly like every other ARC GYM quick practice", () => {
  const fnIndex = arcFocusSettingsScreen.indexOf("async function handleStartNow()");
  const fnBody = arcFocusSettingsScreen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("createArcFocusSession(practiceId, null, settings, now)"));
  assert.ok(!fnBody.includes("upsertTask"), "the immediate-start path must never create a real Task");
});

test("required test 18: on finishing (naturally or early), the live screen saves the practice record and ONLY THEN clears the in-progress session -- a crash in between must resume into the summary, never silently drop or double-save the result", () => {
  const effectBody = arcFocusLiveScreen.slice(
    arcFocusLiveScreen.indexOf("useEffect(() => {\n    if (!session || session.engine.status"),
    arcFocusLiveScreen.indexOf("useEffect(() => {\n    if (!session || session.engine.status") + 700
  );
  const saveIndex = effectBody.indexOf("saveArcFocusPracticeRecord");
  const clearIndex = effectBody.indexOf("clearArcFocusSession");
  assert.ok(saveIndex !== -1 && clearIndex !== -1 && saveIndex < clearIndex, "saveArcFocusPracticeRecord must run, and resolve, before clearArcFocusSession");
});

test("required test 19 (no parallel/duplicate systems): data/taskAlarm.ts, arc/taskOccurrenceOverride.ts, arc/dailyPlan.ts, arc/weeklyRoutine.ts, and data/postTaskRewards.ts needed NO edit at all for ARC Focus -- an ordinary Task row flows through every one of them completely unchanged", () => {
  for (const [name, source] of [
    ["data/taskAlarm.ts", taskAlarm],
    ["arc/taskOccurrenceOverride.ts", taskOccurrenceOverride],
    ["arc/dailyPlan.ts", dailyPlan],
    ["arc/weeklyRoutine.ts", weeklyRoutine],
    ["data/postTaskRewards.ts", postTaskRewards],
  ] as const) {
    assert.ok(!source.includes("arcFocus") && !source.includes("ArcFocus"), `${name} must stay completely untouched by ARC Focus`);
  }
});

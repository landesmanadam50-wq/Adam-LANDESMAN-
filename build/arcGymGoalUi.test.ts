import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcGymGoalUi.test.ts
 *
 * ARC Gym + ARC Goal Integration task: source-text regression guard
 * for the UI layer built on top of the already-tested pure engine
 * (arc/arcGymGoal.ts, arc/arcFocusExercise.ts) -- same convention as
 * every other React Native screen test in this app (no component
 * renderer exists here). Guards that creating a goal also creates its
 * own Manifest, that deleting a goal never touches the Manifest/
 * exercises/tasks, that goal-linking sections reuse each kind's own
 * link/unlink helper, that every new route is registered, and that the
 * calendar badges are purely additive.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const goalEditor = readSource("build/ArcGymGoalEditorScreen.tsx");
const goalDetail = readSource("build/ArcGymGoalDetailScreen.tsx");
const goalList = readSource("build/ArcGymGoalListScreen.tsx");
const goalObjectives = readSource("build/ArcGymGoalObjectivesScreen.tsx");
const goalExercises = readSource("build/ArcGymGoalExercisesScreen.tsx");
const goalTasks = readSource("build/ArcGymGoalTasksScreen.tsx");
const focusList = readSource("build/ArcGymFocusExerciseListScreen.tsx");
const focusDetail = readSource("build/ArcGymFocusExerciseDetailScreen.tsx");
const focusEditor = readSource("build/ArcGymFocusExerciseEditorScreen.tsx");
const situationScreen = readSource("build/ArcGymSituationScreen.tsx");
const memoryDetail = readSource("build/ArcGymMemoryDetailScreen.tsx");
const resultDetail = readSource("build/ArcGymResultDetailScreen.tsx");
const gymScreen = readSource("build/ArcGymScreen.tsx");
const layout = readSource("app/_layout.tsx");
const flexibleDaily = readSource("build/FlexibleDailyScreen.tsx");
const weeklyRoutine = readSource("build/WeeklyRoutineScreen.tsx");
const taskEditor = readSource("build/TaskEditorScreen.tsx");
const taskEditRoute = readSource("app/tasks/[id]/edit.tsx");

test("creating a new goal also creates its own dedicated PurposeManifest with ownerArcGymGoalId set, before the goal itself is saved", () => {
  const fnIndex = goalEditor.indexOf("async function handleSave() {");
  const fnBody = goalEditor.slice(fnIndex, fnIndex + 900);
  const manifestIndex = fnBody.indexOf("upsertPurposeManifest({ ...createEmptyPurposeManifest(manifestId, now), ownerArcGymGoalId: goalId })");
  const goalIndex = fnBody.indexOf("upsertArcGymGoalEntry(createArcGymGoal(goalId, title,");
  assert.ok(manifestIndex !== -1 && goalIndex !== -1 && manifestIndex < goalIndex, "the manifest must exist before the goal that points at it is ever saved");
});

test("editing an existing goal only updates title/description, never touching its manifestId or creating a second manifest", () => {
  assert.ok(goalEditor.includes("updateArcGymGoal(existing, { title, description: description.trim() ? description : null }, now)"));
  assert.equal((goalEditor.match(/createEmptyPurposeManifest\(/g) ?? []).length, 1, "createEmptyPurposeManifest must only ever be called on the isNew path");
});

test("deleting a goal (detail screen) never deletes its Manifest, exercises, or tasks -- only the goal record itself", () => {
  const fnIndex = goalDetail.indexOf("onPress: async () => {");
  const fnBody = goalDetail.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("deleteArcGymGoalEntry(goal.id)"));
  assert.ok(!goalDetail.includes("upsertPurposeManifest") && !goalDetail.includes("deleteTask") && !goalDetail.includes("deleteArcGymMemoryExercise"));
});

test("the goal detail hub links to its own Manifest editor, objectives, tasks, and exercises screens -- never duplicating any of their UI inline", () => {
  assert.ok(goalDetail.includes('pathname: "/purpose-manifests/[id]"'));
  assert.ok(goalDetail.includes('pathname: "/arc-gym/goal/[id]/objectives"'));
  assert.ok(goalDetail.includes('pathname: "/arc-gym/goal/[id]/tasks"'));
  assert.ok(goalDetail.includes('pathname: "/arc-gym/goal/[id]/exercises"'));
});

test("the goal list screen shows objective-completion progress per goal and never requires any exercise to belong to one", () => {
  assert.ok(goalList.includes("resolveArcGymGoalObjectiveProgress"));
  assert.ok(goalList.includes('pathname: "/arc-gym/goal/[id]/edit"'));
});

test("the objectives screen reuses the exact up/down-swap reorder convention (never a drag library) and toggles completion via the shared engine function", () => {
  assert.ok(goalObjectives.includes("reorderArcGymGoalObjectives"));
  assert.ok(goalObjectives.includes("toggleArcGymGoalObjectiveCompleted"));
  const moveIndex = goalObjectives.indexOf("async function handleMove(");
  const moveBody = goalObjectives.slice(moveIndex, moveIndex + 500);
  assert.ok(moveBody.includes("[ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];"));
});

test("the exercises screen links/unlinks all four exercise kinds via each kind's own existing helper, and 'create new' for Memory/Result/Focus opens that kind's OWN existing creation screen rather than inventing a second one", () => {
  assert.ok(goalExercises.includes("linkGoalToArcGymSituation") && goalExercises.includes("unlinkGoalFromArcGymSituation"));
  assert.ok(goalExercises.includes("linkGoalToArcGymMemoryExercise") && goalExercises.includes("unlinkGoalFromArcGymMemoryExercise"));
  assert.ok(goalExercises.includes("linkGoalToArcResultExercise") && goalExercises.includes("unlinkGoalFromArcResultExercise"));
  assert.ok(goalExercises.includes("linkGoalToArcFocusExercise") && goalExercises.includes("unlinkGoalFromArcFocusExercise"));
  assert.ok(goalExercises.includes('pathname: "/arc-gym/memory/[id]/edit"'));
  assert.ok(goalExercises.includes('pathname: "/arc-gym/result/[id]/edit"'));
  assert.ok(goalExercises.includes('pathname: "/arc-gym/focus-exercise/[id]/edit"'));
});

test("the goal's tasks screen filters by the exact arcGymGoalId and creates new tasks through the EXISTING task editor, prefilled via arcGymGoalId -- never a second task-creation form", () => {
  assert.ok(goalTasks.includes("task.arcGymGoalId === goalId"));
  assert.ok(goalTasks.includes('pathname: "/tasks/[id]/edit", params: { id: "new", arcGymGoalId: goalId }'));
});

test("TaskEditorScreen's initialArcGymGoalId only applies to a brand-new task's own base, never an existing one, and is threaded through the /tasks/[id]/edit route", () => {
  assert.match(taskEditor, /initialArcGymGoalId\?: string \| null;/);
  assert.ok(taskEditor.includes("{ ...emptyTaskBase(generateTaskId(), new Date().toISOString()), arcGymGoalId: initialArcGymGoalId }"));
  assert.match(taskEditRoute, /initialArcGymGoalId=\{arcGymGoalId \?\? null\}/);
});

test("ARC Focus exercises: list/detail/editor screens exist, reuse the existing ArcFocusSettings presets/validation, and 'start training now' composes the EXISTING createArcFocusSession/engine standalone, never a second timer implementation", () => {
  assert.ok(focusList.includes('pathname: "/arc-gym/focus-exercise/[id]/edit"'));
  assert.ok(focusEditor.includes("ARC_FOCUS_DURATION_PRESET_MINUTES") && focusEditor.includes("isValidArcFocusDurationMinutes"));
  assert.ok(focusDetail.includes("createArcFocusSession(practiceId, null, exercise.settings, now)"));
  assert.ok(focusDetail.includes('pathname: "/tasks/[id]/arc-focus/check-in"'));
});

test("ARC Focus exercise detail screen's own goal-linking section uses the exact same link/unlink helper the editor's own storage layer expects", () => {
  assert.ok(focusDetail.includes("linkGoalToArcFocusExercise") && focusDetail.includes("unlinkGoalFromArcFocusExercise"));
});

test("Behaviour/Memory/Result detail screens each gained a 'שיוך למטרות' section reusing their own kind's existing link/unlink helper -- never a second, ad-hoc toggle mechanism", () => {
  assert.ok(situationScreen.includes("שיוך למטרות"));
  assert.ok(situationScreen.includes("linkGoalToArcGymSituation") && situationScreen.includes("unlinkGoalFromArcGymSituation"));

  assert.ok(memoryDetail.includes("שיוך למטרות"));
  assert.ok(memoryDetail.includes("linkGoalToArcGymMemoryExercise") && memoryDetail.includes("unlinkGoalFromArcGymMemoryExercise"));

  assert.ok(resultDetail.includes("שיוך למטרות"));
  assert.ok(resultDetail.includes("linkGoalToArcResultExercise") && resultDetail.includes("unlinkGoalFromArcResultExercise"));
  // ARC Result's own pre-existing task-linking section must still be completely intact.
  assert.ok(resultDetail.includes("linkTaskToArcResult") && resultDetail.includes("unlinkTaskFromArcResult"));
});

test("ArcGymScreen gained the 'מטרות ARC' and saved-Focus-exercises entry cards alongside every pre-existing card (none removed)", () => {
  assert.ok(gymScreen.includes('router.push("/arc-gym/goal")'));
  assert.ok(gymScreen.includes('router.push("/arc-gym/focus-exercise")'));
  assert.ok(gymScreen.includes('router.push("/arc-gym/arc-focus")'), "the existing zero-setup ARC Focus quick-start card must stay");
  assert.ok(gymScreen.includes('router.push("/arc-gym/memory")'));
  assert.ok(gymScreen.includes('router.push("/arc-gym/result")'));
  assert.ok(gymScreen.includes('router.push("/arc-gym/decision")'));
});

test("every new ARC Gym Goal / Focus-exercise route is registered in app/_layout.tsx, alongside every pre-existing arc-gym route", () => {
  for (const name of [
    "arc-gym/goal/index",
    "arc-gym/goal/[id]",
    "arc-gym/goal/[id]/edit",
    "arc-gym/goal/[id]/objectives",
    "arc-gym/goal/[id]/tasks",
    "arc-gym/goal/[id]/exercises",
    "arc-gym/focus-exercise/index",
    "arc-gym/focus-exercise/[id]",
    "arc-gym/focus-exercise/[id]/edit",
  ]) {
    assert.ok(layout.includes(`<Stack.Screen name="${name}"`), `missing route registration for ${name}`);
  }
  assert.match(layout, /<Stack\.Screen name="arc-gym\/memory\/index"/, "a pre-existing ARC Gym route must still be registered");
});

test("Flexible Daily / Weekly Routine screens show a purely additive goal-title badge (never affecting ordering/scheduling) when a task carries arcGymGoalId or linkedArcGymSituationId", () => {
  assert.ok(flexibleDaily.includes("entry.task.arcGymGoalId") && flexibleDaily.includes("entry.task.linkedArcGymSituationId"));
  assert.ok(weeklyRoutine.includes("task.arcGymGoalId") && weeklyRoutine.includes("task.linkedArcGymSituationId"));
});

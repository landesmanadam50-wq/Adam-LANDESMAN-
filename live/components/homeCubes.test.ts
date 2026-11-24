import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/homeCubes.test.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 5/6: source-text regression guard for
 * live/components/HomeCubes.tsx (TaskCube/FeelingCube) and
 * live/components/AddInfoMenu.tsx -- not callable from a plain
 * `node --test` run (React Native components, same convention as
 * every other screen/component test in this codebase). The pure
 * data-resolution logic behind TaskCube lives in data/taskCubeData.ts
 * and is exercised there.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const homeCubes = readSource("live/components/HomeCubes.tsx");
const addInfoMenu = readSource("live/components/AddInfoMenu.tsx");
const taskCubeData = readSource("data/taskCubeData.ts");
const flexibleDailyScreen = readSource("build/FlexibleDailyScreen.tsx");
const startupOverlay = readSource("live/DailyStartupSequenceOverlay.tsx");

test("required: TaskCube/FeelingCube/AddInfoMenu are each a SINGLE shared component, imported and mounted verbatim on BOTH the home screen (build/FlexibleDailyScreen.tsx) and the app's entry screen (live/DailyStartupSequenceOverlay.tsx) -- never two separate implementations", () => {
  assert.ok(flexibleDailyScreen.includes('import { FeelingCube, TaskCube } from "../live/components/HomeCubes.tsx";'));
  assert.ok(flexibleDailyScreen.includes('import AddInfoMenu from "../live/components/AddInfoMenu.tsx";'));
  assert.ok(startupOverlay.includes('import { FeelingCube, TaskCube } from "./components/HomeCubes.tsx";'));
  assert.ok(startupOverlay.includes('import AddInfoMenu from "./components/AddInfoMenu.tsx";'));
  assert.equal((flexibleDailyScreen.match(/<TaskCube \/>/g) ?? []).length, 1);
  assert.equal((flexibleDailyScreen.match(/<FeelingCube \/>/g) ?? []).length, 1);
  // The entry screen mounts the SAME pair on both of the planning step's own two card variants (suitable / not-yet-suitable).
  assert.equal((startupOverlay.match(/<TaskCube \/>/g) ?? []).length, 2);
  assert.equal((startupOverlay.match(/<FeelingCube \/>/g) ?? []).length, 2);
  assert.equal((startupOverlay.match(/<AddInfoMenu showHomeInsightButton={showHomeInsightButton} \/>/g) ?? []).length, 2);
});

test("required: TaskCube reads exclusively through data/taskCubeData.ts's resolveTaskCubeData -- never a second, independent scheduling/suggestion computation of its own", () => {
  assert.ok(homeCubes.includes('import { resolveTaskCubeData } from "../../data/taskCubeData.ts";'));
  assert.ok(homeCubes.includes("resolveTaskCubeData(new Date()).then(setData);"));
  assert.ok(!homeCubes.includes("resolveCurrentTaskState("), "TaskCube itself must never call the raw engine function directly -- only through the one data module");
});

test("required: resolveTaskCubeData is built from pre-existing pieces (resolveTodaysScheduledPlan, resolveNextScheduledTaskDisplay, resolveTodoList/resolveEffectiveTodoOrder, resolveCurrentTaskStateWithTodoSuggestion, resolveMostUrgentScheduledEntry, loadTaskTimerRun) -- never a new scheduling computation", () => {
  assert.ok(taskCubeData.includes('import { resolveNextScheduledTaskDisplay, resolveTodaysScheduledPlan } from "./dailyPlan.ts";'));
  assert.ok(taskCubeData.includes('import { resolveCurrentTaskState, resolveMostUrgentScheduledEntry } from "../arc/dailyPlan.ts";'));
  assert.ok(
    taskCubeData.includes(
      'import { resolveCurrentTaskStateWithTodoSuggestion, resolveEffectiveTodoOrder, resolveTodoList } from "../arc/todoList.ts";'
    )
  );
  assert.ok(taskCubeData.includes("const current = resolveMostUrgentScheduledEntry(state);"), "the SyncFix precedent's own urgent-entry fallback must be reused, not re-derived");
});

test("required: the cube's 'המשימה הבאה' row is resolved through the EXACT SAME resolveNextScheduledTaskDisplay(current.task.id, now) pipeline Task LIVE's own 'הבאה' row and the floating-timer overlay already use -- so a To-Do item woven into the free gap right after `current` (never only the next FIXED entry) surfaces here too, and the three can never disagree. null only when `current` itself is null (nothing fixed remains today at all, so a second To-Do suggestion for 'next' would only duplicate `todoSuggestion`)", () => {
  assert.ok(taskCubeData.includes("const next = current ? await resolveNextScheduledTaskDisplay(current.task.id, now) : null;"));
  const fnIndex = taskCubeData.indexOf("export async function resolveTaskCubeData");
  const fnBody = taskCubeData.slice(fnIndex, taskCubeData.indexOf("\n}", fnIndex));
  assert.ok(!fnBody.includes("next: state.next,"), "must never fall back to the plain next-FIXED-entry calculation once `current` is non-null");
});

test("required: HomeCubes.tsx's 'המשימה הבאה' row tags a To-Do item shown there with '(To-Do)', the same disambiguation the woven day list already gives To-Do entries, so two similarly-named tasks (one fixed, one a To-Do suggestion) are never shown as plain, indistinguishable text", () => {
  assert.ok(homeCubes.includes('data.next.task.isTodoItem ? " (To-Do)" : ""'));
});

test("required: a scheduled/overdue 'current' entry always wins over a To-Do suggestion for display -- the suggestion is only surfaced when current is null", () => {
  assert.ok(taskCubeData.includes("todoSuggestion: current === null ? withSuggestion.todoSuggestion : null,"));
});

test("required: the combined Tasks list for the cube's expand is built from the already-filtered scheduled plan and the already-filtered/ordered To-Do list -- never a second, independent filter that could re-admit a removed-for-today or never-placed item", () => {
  assert.ok(taskCubeData.includes("combinedTasksList: { scheduled, todo: resolveEffectiveTodoOrder(todoEntries) },"));
});

test("required: TaskCube's current-task button distinguishes a break (opens the existing timer, shown as restRun), an already-active run (opens the existing timer), and a not-yet-started task (auto-starts, which for a To-Do item lands on the duration-selection screen via handleStart's own existing redirect)", () => {
  const fnIndex = homeCubes.indexOf("function handlePressCurrent()");
  const fnBody = homeCubes.slice(fnIndex, homeCubes.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (data?.restRun) {"));
  assert.ok(fnBody.includes("if (data?.activeRun) {"));
  assert.ok(fnBody.includes('params: { id: currentTask.id, autoStart: "1" }'));
});

test("required: the 😄 ('מעולה') smiley is absent from FeelingCube -- only 😟/🙂 and '+ ARC Save' remain, all routed through the same shared handleEmotionalCheckInChoice dispatcher", () => {
  const fnIndex = homeCubes.indexOf("export function FeelingCube()");
  const fnBody = homeCubes.slice(fnIndex, homeCubes.indexOf("const styles = StyleSheet.create("));
  assert.ok(!fnBody.includes("😄"));
  assert.ok(fnBody.includes("😟"));
  assert.ok(fnBody.includes("🙂"));
  assert.ok(fnBody.includes('router.push("/arc-saving/activate")'));
});

test("required: each cube collapses/expands independently (its own local useState), and its header/title stays visible while collapsed", () => {
  assert.equal((homeCubes.match(/const \[collapsed, setCollapsed\] = useState\(false\);/g) ?? []).length, 2, "TaskCube and FeelingCube each need their own independent collapsed state");
  assert.ok(homeCubes.includes("{!collapsed && ("), "the header row itself must render unconditionally, only the body is gated on !collapsed");
});

test("required: AddInfoMenu centralizes the SAME four existing destinations/gating build/FlexibleDailyScreen.tsx's own former quickActionsRow had -- never deleted, only reorganized behind one '+ להוסיף מידע' button", () => {
  assert.ok(addInfoMenu.includes("+ להוסיף מידע"));
  assert.ok(addInfoMenu.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } });'));
  assert.ok(addInfoMenu.includes("showHomeInsightButton &&"));
  assert.ok(addInfoMenu.includes('router.push("/insights/new");'));
  assert.ok(addInfoMenu.includes('router.push("/positive-memories/new");'));
  assert.ok(addInfoMenu.includes('router.push("/arc-saving/activate");'));
});

test("required: FlexibleDailyScreen/DailyStartupSequenceOverlay mount AddInfoMenu with the real showHomeInsightButton setting -- never a hardcoded true, so Settings' own toggle is respected on both screens", () => {
  assert.ok(flexibleDailyScreen.includes("<AddInfoMenu showHomeInsightButton={showHomeInsightButton} />"));
  assert.ok(startupOverlay.includes("loadShowHomeInsightButtonSetting().then(setShowHomeInsightButton);"));
});

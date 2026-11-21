import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/spontaneousArcEntry.test.ts
 *
 * ARC-system upgrade task, Part B: source-text regression guard for the
 * global "ARC ספונטני" entry point -- available at any moment, not only
 * from within an already-open task. Covers the route registration, the
 * task-linked vs. standalone branch, the nav button on the tasks list,
 * and live/NewArcLiveScreen.tsx's own support for a taskId-less
 * standalone session (STANDALONE_ARC_TASK_ID).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const entryScreen = readSource("live/SpontaneousArcEntryScreen.tsx");
const route = readSource("app/arc-spontaneous.tsx");
const layout = readSource("app/_layout.tsx");
const tasksListScreen = readSource("build/TasksListScreen.tsx");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const types = readSource("arc/newArcLiveTypes.ts");

test("the route is registered and the tasks list offers a nav button to it, reachable from anywhere -- not nested under any one task", () => {
  assert.match(layout, /<Stack\.Screen name="arc-spontaneous"/);
  assert.match(route, /from ["']\.\.\/live\/SpontaneousArcEntryScreen\.tsx["']/);
  assert.ok(tasksListScreen.includes('router.push("/arc-spontaneous")'));
});

test("the entry screen asks task-linked vs. standalone BEFORE anything else, and both branches reuse the SAME /tasks/[id]/arc route with spontaneous=1 -- never a second, duplicated engine", () => {
  assert.ok(entryScreen.includes("האם זה מקושר למשימה"));
  const standaloneIndex = entryScreen.indexOf("function openStandalone()");
  const standaloneBody = entryScreen.slice(standaloneIndex, standaloneIndex + 300);
  assert.ok(standaloneBody.includes("pathname: \"/tasks/[id]/arc\""));
  assert.ok(standaloneBody.includes("id: STANDALONE_ARC_TASK_ID"));
  assert.ok(standaloneBody.includes('spontaneous: "1"'));

  const linkedIndex = entryScreen.indexOf("function openLinkedToTask(taskId: string)");
  const linkedBody = entryScreen.slice(linkedIndex, linkedIndex + 300);
  assert.ok(linkedBody.includes("pathname: \"/tasks/[id]/arc\""));
  assert.ok(linkedBody.includes("id: taskId"));
  assert.ok(linkedBody.includes('spontaneous: "1"'));
});

test("the task picker excludes completed and archived tasks -- only open tasks are offered to link to", () => {
  const reloadIndex = entryScreen.indexOf("const reload = useCallback");
  const reloadBody = entryScreen.slice(reloadIndex, reloadIndex + 300);
  assert.ok(reloadBody.includes('task.status !== "completed" && task.status !== "archived"'));
});

test("STANDALONE_ARC_TASK_ID is exported and is never a format a real generateTaskId() could produce", () => {
  assert.match(types, /export const STANDALONE_ARC_TASK_ID = "__standalone__";/);
});

test("the live screen's reload() uses a synthetic placeholder task for the standalone sentinel, never calling getTask() with it (which would always return null)", () => {
  const reloadIndex = liveScreen.indexOf("const reload = useCallback");
  const reloadBody = liveScreen.slice(reloadIndex, reloadIndex + 500);
  assert.ok(reloadBody.includes("taskId === STANDALONE_ARC_TASK_ID ? Promise.resolve("));
  assert.ok(reloadBody.includes('title: "", firstAction: ""'));
});

// Unified ARC & Productivity Update task, requirement 10 ("Standalone
// emotion-only -> safe originating screen"): Home is always a valid
// destination regardless of which real origin (Home check-in bar,
// this screen's own standalone button) the session actually came
// from -- never the non-existent /tasks/__standalone__ screen either.
test("returnToTask sends a standalone session back to Home, never to a non-existent /tasks/__standalone__ screen", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  // ARCHI -- Unified Final Specification task, section 6: widened from
  // 3000 to fit the two new selectedActionSource branches this
  // function grew. ARC Focus task: widened again (4700 -> 5300) to fit
  // the new arcFocusPracticeId branch. ARC Gym + ARC Goal Integration
  // task: widened again (5300 -> 6000) to fit the new
  // arcGymMemoryExerciseId branch. ARC Perspective task: widened again
  // (6000 -> 7900) to fit the new arcPerspectiveId branch.
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 8700);
  assert.ok(fnBody.includes("if (taskId === STANDALONE_ARC_TASK_ID) {"));
  assert.ok(fnBody.includes('router.replace("/");'));
});

test("goal_select only offers the Emotional track for a standalone session -- never Task/Combined, which would have no real task to act on", () => {
  // Two occurrences of this exact guard exist in the file now
  // (returnToTask's own early return, and this render branch) -- the
  // SECOND one is the goal_select render branch this test targets.
  const firstIfIndex = liveScreen.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  const standaloneIfIndex = liveScreen.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {", firstIfIndex + 1);
  assert.ok(standaloneIfIndex !== -1);
  const standaloneBranch = liveScreen.slice(standaloneIfIndex, liveScreen.indexOf("\n        }\n", standaloneIfIndex));
  assert.ok(standaloneBranch.includes('onPress={() => withTrigger("emotion_only")}'));
  assert.ok(!standaloneBranch.includes('withTrigger("action")'), "the standalone branch must never offer the Task track");
  assert.ok(!standaloneBranch.includes('withTrigger("combined")'), "the standalone branch must never offer the Combined track");
});

test("a persisted insight from a standalone session stores taskId: null, never the sentinel itself", () => {
  // Part 5: this persistence now runs from the automatic
  // completeConsumedRef effect (fired on currentStep === "complete"),
  // not from inside the render switch's "complete" case anymore.
  const insightCallIndex = liveScreen.indexOf("if (session.emotionalInsightText) {");
  assert.ok(insightCallIndex !== -1);
  const insightBlock = liveScreen.slice(insightCallIndex, insightCallIndex + 1200);
  assert.ok(insightBlock.includes("taskId: session.taskId === STANDALONE_ARC_TASK_ID ? null : session.taskId,"));
});

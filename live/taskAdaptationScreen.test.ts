import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskAdaptationScreen.test.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * section 6: source-text regression guard for
 * live/TaskAdaptationScreen.tsx (route /tasks/[id]/adapt) -- shrinking
 * the original task into a smaller, linked child, mirroring
 * live/PostponementSmallerTaskScreen.tsx's own precedent.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const screen = readSource("live/TaskAdaptationScreen.tsx");
const route = readSource("app/tasks/[id]/adapt.tsx");
const layout = readSource("app/_layout.tsx");

test("the route is registered and wires taskId straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/adapt"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/TaskAdaptationScreen\.tsx["']/);
  assert.ok(route.includes("TaskAdaptationScreen taskId={id}"));
});

test("the suggested duration defaults to suggestHalvedDuration, editable before confirming", () => {
  assert.ok(screen.includes("import { buildAdaptedTaskDraft, suggestHalvedDuration } from \"../arc/taskAdaptation.ts\";"));
  assert.ok(screen.includes("setDurationDraft(String(suggestHalvedDuration(loaded.expectedDurationMinutes ?? 10)));"));
  assert.ok(screen.includes('value={durationDraft}') && screen.includes("onChangeText={setDurationDraft}"));
});

test("the chosen duration is clamped against the REAL free time before the next scheduled task -- resolveFreeMinutesUntilNextTask over today's resolved plan, the same shared computation every other adaptive-duration screen uses", () => {
  assert.ok(screen.includes('import { resolveFreeMinutesUntilNextTask } from "../arc/dailyPlan.ts";'));
  assert.ok(screen.includes('import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";'));
  const fnIndex = screen.indexOf("async function handleShrinkAndStart");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("freeMinutes !== null ? Math.max(5, Math.min(requested, freeMinutes)) : Math.max(5, requested)"));
});

test("confirming creates a brand-new child Task via buildAdaptedTaskDraft (parentTaskId pointing back) and persists it -- the ORIGINAL task is only ever read here, never upserted/mutated", () => {
  const fnIndex = screen.indexOf("async function handleShrinkAndStart");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("buildAdaptedTaskDraft(task, clamped, whatExactlyDraft.trim() || task.firstAction, now)"));
  assert.ok(fnBody.includes("await upsertTask(draft);"));
  assert.ok(!screen.includes("upsertTask(task)") && !screen.includes("upsertTask({ ...task"), "the original task object is never the argument to upsertTask");
});

test("after creating the child, navigation lands on the CHILD task's own id with NO autoStart -- 'התחלה' is still the one thing that ever starts a timer", () => {
  const fnIndex = screen.indexOf("async function handleShrinkAndStart");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: draft.id } });'));
  assert.ok(!fnBody.includes("autoStart"));
});

test("'השארה כפי שהיא' (keep unchanged) is a pure navigation back to the ORIGINAL task -- touches no data, no timer, never mutates the task", () => {
  const fnIndex = screen.indexOf("function handleKeepUnchanged");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: task.id } });'));
  assert.ok(!fnBody.includes("upsertTask"));
});

test("'מה בדיוק יבוצע' is a free-text field, defaulting to the original task's own first action but editable -- never required to differ", () => {
  assert.ok(screen.includes('setWhatExactlyDraft(loaded.firstAction ?? "");'));
  assert.ok(screen.includes("whatExactlyDraft.trim() || task.firstAction"));
});

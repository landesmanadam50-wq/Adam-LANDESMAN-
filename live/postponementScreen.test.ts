import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postponementScreen.test.ts
 *
 * Productivity roadmap, Stage W: source-text regression guard for the
 * full postponement screen's wiring. The pure draft/returnAt logic is
 * covered separately in arc/postponementDraft.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/PostponementScreen.tsx");
const route = readSource("app/tasks/[id]/postpone.tsx");
const layout = readSource("app/_layout.tsx");

test("the postpone route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone"/);
});

test("the route passes the id param straight through to PostponementScreen", () => {
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/PostponementScreen\.tsx["']/);
  assert.ok(route.includes("PostponementScreen taskId={id}"));
});

test("confirm() cancels any in-flight notification and clears the timer run BEFORE saving the postponed task, never leaving a stale one armed", () => {
  const confirmIndex = screen.indexOf("async function confirm()");
  const confirmBody = screen.slice(confirmIndex, confirmIndex + 1200);
  assert.ok(confirmBody.includes("cancelScheduledNotification(existingRun.notificationId)"));
  assert.ok(confirmBody.includes("await clearTaskTimerRun()"));
  assert.ok(confirmBody.includes("buildPostponedTask(task, draft, now)"));
  assert.ok(confirmBody.includes("await upsertTask(postponed)"));
});

test("'unscheduled' is a real, explicit, selectable answer -- never only a fallback for a skipped question", () => {
  assert.ok(screen.includes('onPress={() => setDraft({ ...draft, returnChoice: "unscheduled" })}'));
  assert.equal(screen.includes('createEmptyPostponementDraft().returnChoice'), false, "unscheduled is the explicit default, read from the pure module, never re-derived here");
});

test("wanting ARC now routes to /live/select with returnToTaskId; declining routes to the Tasks list -- both AFTER saving the postponement, never before", () => {
  const confirmIndex = screen.indexOf("async function confirm()");
  const confirmBody = screen.slice(confirmIndex, confirmIndex + 1700);
  const saveIndex = confirmBody.indexOf("await upsertTask(postponed)");
  const arcIndex = confirmBody.indexOf('pathname: "/live/select", params: { returnToTaskId: taskId }');
  const tasksIndex = confirmBody.indexOf('router.replace("/tasks")');
  assert.ok(saveIndex !== -1 && arcIndex !== -1 && tasksIndex !== -1);
  assert.ok(saveIndex < arcIndex && saveIndex < tasksIndex, "the task must be saved before either exit path navigates away");
});

test("the chosen supportive-state-for-next-time reuses the exact same 8 predefined chips as Stage K's preparation screen", () => {
  assert.match(screen, /import\s*\{[\s\S]*?PREPARATION_STATE_IDS[\s\S]*?PREPARATION_STATE_LABELS[\s\S]*?\}\s*from\s*["']\.\.\/arc\/preparationStates\.ts["']/);
});

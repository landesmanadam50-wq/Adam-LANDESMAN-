import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/dynamicPlanningTaskLiveEntry.test.ts
 *
 * ARCHI -- Rolling Dynamic Planning task, spec section 2: source-text
 * regression guard for live/components/DynamicPlanningTaskLiveEntry.tsx
 * (the "at the start of the fixed task, if not yet confirmed via the
 * notification, an edit panel appears" entry point inside Task LIVE),
 * and its mounting inside live/ActiveTaskScreen.tsx.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const entry = readSource("live/components/DynamicPlanningTaskLiveEntry.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

test("re-resolves resolveDynamicPlanningAction completely fresh on every focus, against THIS task's own id as the preceding fixed entry -- never trusts a stale snapshot", () => {
  assert.ok(entry.includes('import { resolveDynamicPlanningAction } from "../../arc/dynamicPlanning.ts";'));
  assert.ok(entry.includes("useFocusEffect("));
  const fnIndex = entry.indexOf("useFocusEffect(");
  const fnBody = entry.slice(fnIndex, fnIndex + 800);
  assert.ok(fnBody.includes("const preceding = scheduled.find((entry) => entry.task.id === taskId) ?? null;"));
  assert.ok(fnBody.includes("resolveDynamicPlanningAction(scheduled, todoEntries, preceding, null)"));
});

test("renders nothing at all once the gap is already planned/confirmed or no real gap exists -- the exact 'none' action, never a useless panel", () => {
  assert.ok(entry.includes('if (!decision || decision.action === "none") return null;'));
});

test("the label names the already-woven candidate by title when confirming it, or offers the plain planning action when nothing has been queued yet -- never a fabricated name", () => {
  const fnIndex = entry.indexOf("const label =");
  const fnBody = entry.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('decision.action === "confirm_next_todo"'));
  assert.ok(fnBody.includes("decision.candidate?.task.title"));
});

test("tapping the row opens the EXACT SAME confirmation screen the notification's own edit action opens (/tasks/[id]/plan-next), never a second decision UI", () => {
  assert.ok(entry.includes('router.push({ pathname: "/tasks/[id]/plan-next", params: { id: taskId } })'));
});

test("never touches the active task's own timer -- no pause/resume/cancel/upsertTask call anywhere in this component", () => {
  assert.ok(!entry.includes("upsertTask") && !entry.includes("pauseActiveTaskTimerIfAny") && !entry.includes("TaskTimerRun"));
});

test("checkpoint (mounting): live/ActiveTaskScreen.tsx mounts this entry right beside ArcAddictionTaskLiveEntry, gated to only a genuinely fixed (non-To-Do) task -- a To-Do item has no gap of its own until it is itself confirmed into one", () => {
  assert.ok(activeTaskScreen.includes('import DynamicPlanningTaskLiveEntry from "./components/DynamicPlanningTaskLiveEntry.tsx";'));
  assert.ok(activeTaskScreen.includes("{!task.isTodoItem && <DynamicPlanningTaskLiveEntry taskId={task.id} />}"));
});

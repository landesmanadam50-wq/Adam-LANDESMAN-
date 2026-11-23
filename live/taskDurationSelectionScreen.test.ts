import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskDurationSelectionScreen.test.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 3/4: source-text regression guard for
 * live/TaskDurationSelectionScreen.tsx (route /tasks/[id]/duration) and
 * its wiring. The pure split-plan math is covered directly in
 * arc/taskSplitPlan.test.ts/arc/taskSplitProgress.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/TaskDurationSelectionScreen.tsx");
const route = readSource("app/tasks/[id]/duration.tsx");
const layout = readSource("app/_layout.tsx");

test("the route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/duration"/);
});

test("the route wrapper forwards taskId and an optional suggestedMinutes param", () => {
  assert.ok(route.includes("<TaskDurationSelectionScreen taskId={id} suggestedMinutes={suggestedMinutes ? Number(suggestedMinutes) : null} />"));
});

test("required: offers exactly two modes -- עבודה רציפה and עבודה מחולקת", () => {
  assert.ok(screen.includes('useState<Mode>("continuous")'));
  assert.ok(screen.includes("עבודה רציפה"));
  assert.ok(screen.includes("עבודה מחולקת"));
});

test("required: both modes clamp their requested minutes against resolveFreeMinutesUntilNextTask -- never exceeding the free time before the next fixed task", () => {
  assert.ok(screen.includes('import { resolveFreeMinutesUntilNextTask } from "../arc/dailyPlan.ts";'));
  assert.ok(screen.includes("Math.max(1, Math.min(requestedContinuous, freeMinutes))"));
  assert.ok(screen.includes("splitExceedsFree = splitTotalMinutes !== null && freeMinutes !== null && splitTotalMinutes > freeMinutes"));
  assert.ok(screen.includes("disabled={!splitPlan || splitExceedsFree}"));
});

test("required: continuous mode reuses the EXISTING splitMinutes route param verbatim -- never new backend plumbing for this mode", () => {
  const fnIndex = screen.indexOf("async function handleStartContinuous(");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('params: { id: taskId, autoStart: "1", splitMinutes: String(clampedContinuous) }'));
});

test("required: split mode shows a preview of the work/break sequence BEFORE starting, built from buildSplitPlan", () => {
  assert.ok(screen.includes('import { buildSplitPlan, sumSplitPlanMinutes } from "../arc/taskSplitPlan.ts";'));
  assert.ok(screen.includes("רצף העבודה וההפסקות"));
  assert.ok(screen.includes("splitPlan.map((segment, index)"));
});

test("required: split mode persists a TaskSplitProgress BEFORE navigating, then auto-starts -- never a second, competing persistence mechanism", () => {
  assert.ok(screen.includes('import { createTaskSplitProgress } from "../arc/taskSplitProgress.ts";'));
  const fnIndex = screen.indexOf("async function handleStartSplit(");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("await saveTaskSplitProgress(createTaskSplitProgress(taskId, splitPlan));"));
  assert.ok(fnBody.includes('params: { id: taskId, autoStart: "1" }'));
});

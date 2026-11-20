import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/persistentTaskControls.test.ts
 *
 * Unified Task Stages task, requirement 5: source-text regression
 * guard for the persistent "ARC" / "התחל משימה" controls and where
 * they're mounted -- not callable from a plain `node --test` run
 * (React Native component, same convention as every other screen test).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const controls = readSource("live/PersistentTaskControls.tsx");
const dailyScheduleScreen = readSource("build/DailyScheduleScreen.tsx");
const tasksListScreen = readSource("build/TasksListScreen.tsx");

test("mounted near the top of both main hub screens -- Daily Schedule and Tasks List -- so it's available throughout ordinary navigation", () => {
  assert.ok(dailyScheduleScreen.includes('import PersistentTaskControls from "../live/PersistentTaskControls.tsx";'));
  assert.match(dailyScheduleScreen, /<Text style=\{styles\.title\}>התכנית היומית שלי<\/Text>\s*<PersistentTaskControls \/>/);
  assert.ok(tasksListScreen.includes('import PersistentTaskControls from "../live/PersistentTaskControls.tsx";'));
  assert.match(tasksListScreen, /<Text style=\{styles\.title\}>המשימות שלי<\/Text>\s*<PersistentTaskControls \/>/);
});

test("activeTaskId is resolved from the single persisted TaskTimerRun, excluding a REST run -- a rest period is never treated as 'a task is active' for these buttons", () => {
  const fnIndex = controls.indexOf("const reload = useCallback");
  const fnBody = controls.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('setActiveTaskId(run && run.kind !== "rest" ? run.taskId : null)'));
});

// --- ARCHI -- Consolidated Implementation Request, Part 10.1: the
// standalone "ARC" button (and its own handleArcPress dispatcher) is
// gone from this shared control -- "the user should not need a
// redundant standalone ARC button" now that the home screen's own
// mood-based entry points and the existing Thought/Urge shortcut
// already cover it. ---

test("the standalone 'ARC' button and its own handleArcPress dispatcher are gone -- 'התחל משימה' is the one remaining control", () => {
  assert.ok(!controls.includes("function handleArcPress()"));
  assert.ok(!controls.includes(">ARC<"));
});

// --- Start Task button: return to active task, or start the next relevant one via the existing gate ---

test("Start Task with an active task just returns to it -- no autoStart param, so pressing it can never create a second/competing timer", () => {
  const fnIndex = controls.indexOf("async function handleStartTaskPress()");
  const fnBody = controls.slice(fnIndex, fnIndex + 300);
  assert.match(fnBody, /pathname: "\/tasks\/\[id\]", params: \{ id: activeTaskId \}/);
});

test("Start Task with no active task resolves the next relevant scheduled task via the shared resolveNextTaskEntry and opens it with autoStart=1 -- which itself already respects the Daily Visualization gate", () => {
  const fnIndex = controls.indexOf("async function handleStartTaskPress()");
  const fnBody = controls.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("resolveNextTaskEntry(tasks, completions, "));
  assert.match(fnBody, /pathname: "\/tasks\/\[id\]", params: \{ id: next\.task\.id, autoStart: "1" \}/);
  assert.ok(fnBody.includes('router.push("/tasks");'), "falls back to the tasks list when nothing is left to start");
});

test("the Start Task button is a plain, always-visible Pressable, centered horizontally (Part 10.2) -- never conditionally hidden by timer state", () => {
  assert.ok(controls.includes("onPress={handleStartTaskPress}"));
  assert.ok(!controls.includes("activeTaskId &&"), "the button itself is never gated on activeTaskId -- only its BEHAVIOR branches on it");
  assert.match(controls, /row:\s*\{[^}]*justifyContent:\s*"center"/);
});

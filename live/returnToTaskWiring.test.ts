import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/returnToTaskWiring.test.ts
 *
 * Productivity roadmap, Stage J: originally proved `returnToTaskId`
 * was threaded from ActiveTaskScreen's own "משהו מפריע"/"בוא נעשה ARC
 * עכשיו" buttons through LiveModeSelectScreen's "ARC רגיל" push into
 * LiveSessionScreen's own completion routing.
 *
 * Simplified-architecture task, Phase 1: those two ActiveTaskScreen
 * buttons are now hidden (the first two tests below guard that), so
 * `returnToTaskId` is no longer threaded FROM ActiveTaskScreen -- but
 * LiveModeSelectScreen/LiveSessionScreen's own `returnToTaskId`
 * handling is legacy infrastructure, not deleted, and still correct if
 * anything else ever sets the param (the remaining tests below keep
 * guarding exactly that, unchanged).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const liveModeSelect = readSource("build/LiveModeSelectScreen.tsx");
const liveSession = readSource("live/LiveSessionScreen.tsx");

test("Simplified-architecture task, Phase 1: ActiveTaskScreen no longer pushes to /live/select at all -- 'משהו מפריע'/'בוא נעשה ARC עכשיו' are hidden, and the end-of-timer 'start_arc' choice no longer branches on a linked build", () => {
  assert.ok(!activeTaskScreen.includes('"/live/select"'));
  assert.ok(!activeTaskScreen.includes("resolveArcChoiceDestination"));
});

test("ActiveTaskScreen's end-of-timer ARC choice goes to the new placeholder with the task id, never /live, never the BUILD editor, regardless of any linked build", () => {
  assert.match(activeTaskScreen, /pathname:\s*"\/tasks\/\[id\]\/arc",\s*params:\s*\{\s*id:\s*task\.id\s*\}/);
  assert.ok(!activeTaskScreen.includes('pathname: "/live"'));
  assert.ok(!activeTaskScreen.includes('pathname: "/build/[id]"'));
});

test("LiveModeSelectScreen reads returnToTaskId and forwards it onto the ARC רגיל push to /live", () => {
  assert.match(liveModeSelect, /focusRouteId,\s*returnToTaskId\s*\}\s*=\s*useLocalSearchParams/);
  assert.ok(liveModeSelect.includes("returnToTaskId ? { buildId: selectedBuild.id, returnToTaskId } : { buildId: selectedBuild.id }"));
});

test("LiveSessionScreen reads returnToTaskId as its own independent param, mirroring the fourWeekGoalId/pdProgramId precedent", () => {
  assert.match(liveSession, /returnToTaskId:\s*returnToTaskIdParam,/);
  assert.ok(liveSession.includes('const returnToTaskId = typeof returnToTaskIdParam === "string" ? returnToTaskIdParam : null;'));
});

test("returnToTaskId only changes the PLAIN completion path's destination -- routine/thenIdentityGoalId/fourWeekGoalId/pdProgramId all still take priority, unaffected", () => {
  const primaryIndex = liveSession.indexOf("onCompletePrimary={");
  const primaryBlock = liveSession.slice(primaryIndex, primaryIndex + 700);
  const order = ["routine", "thenIdentityGoalId", "fourWeekGoalId", "pdProgramId", "returnToTaskId", "finishToSelfDevelopment"];
  let lastIndex = -1;
  for (const token of order) {
    const index = primaryBlock.indexOf(token, lastIndex + 1);
    assert.ok(index > lastIndex, `expected ${token} to appear in priority order within onCompletePrimary`);
    lastIndex = index;
  }
});

test("returnToTask() navigates to /tasks/[id] with the returnToTaskId, saving reflection fields first exactly like finishToSelfDevelopment does", () => {
  const fnIndex = liveSession.indexOf("const returnToTask = () => {");
  const fnBody = liveSession.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("updateLastSessionLogEntryGratitude("));
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: returnToTaskId! } });'));
});

test("the optional identity-extension continuation offer also returns to the task when returnToTaskId is set, never defaulting to /self-development in that case", () => {
  assert.match(liveSession, /returnToTaskId\s*\?\s*`\/tasks\/\$\{returnToTaskId\}`\s*:\s*"\/self-development"/);
});

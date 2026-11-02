import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/returnToTaskWiring.test.ts
 *
 * Productivity roadmap, Stage J: source-text regression guard proving
 * the `returnToTaskId` param is threaded, under the exact same name,
 * all the way from ActiveTaskScreen's own "משהו מפריע"/"בוא נעשה ARC
 * עכשיו" buttons, through LiveModeSelectScreen's "ARC רגיל" push, into
 * LiveSessionScreen's own completion routing -- and that it ONLY
 * changes the plain (no routine/thenIdentityGoalId/fourWeekGoalId/
 * pdProgramId) completion path, never any of those other special cases.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const liveModeSelect = readSource("build/LiveModeSelectScreen.tsx");
const liveSession = readSource("live/LiveSessionScreen.tsx");

test("every ActiveTaskScreen path into /live/select ('משהו מפריע', 'בוא נעשה ARC עכשיו', and the end-of-timer 'start_arc' choice with no linked build) forwards returnToTaskId: task.id", () => {
  const matches = activeTaskScreen.match(/pathname:\s*"\/live\/select",\s*params:\s*\{\s*returnToTaskId:\s*task\.id\s*\}/g) ?? [];
  assert.equal(matches.length, 3, "all three call sites must forward the same returnToTaskId param");
});

test("ActiveTaskScreen's 'open the linked practice' (start_arc, open_linked) goes straight to /live with buildId AND returnToTaskId, never the BUILD editor", () => {
  assert.match(activeTaskScreen, /pathname:\s*"\/live",\s*params:\s*\{\s*buildId:\s*destination\.arcBuildId,\s*returnToTaskId:\s*task\.id\s*\}/);
  assert.ok(!activeTaskScreen.includes('router.push({ pathname: "/build/[id]", params: { id: destination.arcBuildId } })'), "must no longer open the editor for 'open the linked practice'");
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

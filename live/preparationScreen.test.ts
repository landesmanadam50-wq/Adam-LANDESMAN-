import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/preparationScreen.test.ts
 *
 * Productivity roadmap, Stage K: source-text regression guard for the
 * preparation screen's wiring and entry points. All step CONTENT is
 * covered separately in arc/preparationStates.test.ts -- this only
 * checks routing/rendering decisions.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/PreparationScreen.tsx");
const route = readSource("app/tasks/[id]/prepare.tsx");
const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");

test("the prepare route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/prepare"/);
});

test("the route passes the id param straight through to PreparationScreen", () => {
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/PreparationScreen\.tsx["']/);
  assert.ok(route.includes("PreparationScreen taskId={id}"));
});

test("ActiveTaskScreen and TodayScreen both have a real 'הכנה' Pressable to the prepare route", () => {
  assert.match(activeTaskScreen, /pathname:\s*"\/tasks\/\[id\]\/prepare",\s*params:\s*\{\s*id:\s*task\.id\s*\}/);
  assert.match(todayScreen, /pathname:\s*"\/tasks\/\[id\]\/prepare",\s*params:\s*\{\s*id:\s*task\.id\s*\}/);
});

test("every protocol ends by opening the active task with autoStart -- never a dead end, never leaving the trainee stuck in the preparation screen", () => {
  const openTaskIndex = screen.indexOf("function openTask()");
  const openTaskBody = screen.slice(openTaskIndex, openTaskIndex + 700);
  assert.ok(openTaskBody.includes('pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" }'));
  // Every exit path (last step's primary button, the skip link on the steps screen, and the top-level "start directly" link) must call openTask.
  const openTaskCallCount = (screen.match(/onPress={openTask}/g) ?? []).length;
  assert.ok(openTaskCallCount >= 2, "both skip links must call the same openTask function");
});

test("'start directly'/'skip preparation' and the saved/chosen state's own steps never invent content -- all step text comes from arc/preparationStates.ts's pure resolver functions", () => {
  assert.match(screen, /import\s*\{[\s\S]*?resolvePreparationSource[\s\S]*?\}\s*from\s*["']\.\.\/arc\/preparationStates\.ts["']/);
  assert.ok(screen.includes("resolvePreparationSource(task.defaultSupportiveStateId, stateProfiles)"));
  assert.ok(screen.includes("getPreparationStepsForSource(source, task.firstAction)"));
});

test("the 'use the saved state' button only renders when resolvePreparationSource actually resolved to something -- never a dead button for a deleted/blank default", () => {
  const index = screen.indexOf("{savedSource && (");
  assert.ok(index !== -1);
});

test("Stage Y: using a preparation state logs a 'protocol_run_completed' journal entry with the chosen state's own label, but ONLY when a source was actually used (never for plain 'start directly')", () => {
  assert.match(screen, /import\s*\{[\s\S]*?appendTaskJournalEntry[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
  const openTaskIndex = screen.indexOf("function openTask()");
  const openTaskBody = screen.slice(openTaskIndex, openTaskIndex + 700);
  assert.ok(openTaskBody.includes("if (source) {"), "the journal write must be gated on a source actually being chosen");
  assert.ok(openTaskBody.includes("usedPreparationStateLabel: getPreparationSourceLabel(source)"));
});

test("TaskEditorScreen's supportive-state field is a deterministic chip picker over the 8 predefined states plus the trainee's own saved StateProfiles -- never free text", () => {
  assert.match(taskEditorScreen, /import\s*\{[\s\S]*?PREPARATION_STATE_IDS[\s\S]*?PREPARATION_STATE_LABELS[\s\S]*?\}\s*from\s*["']\.\.\/arc\/preparationStates\.ts["']/);
  assert.ok(taskEditorScreen.includes("PREPARATION_STATE_IDS.map((stateId)"));
  assert.ok(!taskEditorScreen.includes('value={draft.defaultSupportiveStateId}\n            onChangeText={(defaultSupportiveStateId) => setDraft({ ...draft, defaultSupportiveStateId })}'));
});

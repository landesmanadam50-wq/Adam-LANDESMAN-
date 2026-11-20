import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/manifestGoals.test.ts
 *
 * Manifest Goals & Automatic Task Scheduling task: source-text
 * regression guard for this module's AsyncStorage-backed orchestration
 * -- same convention as every other data/*.test.ts file in this
 * codebase (AsyncStorage isn't a callable mock under a plain `node
 * --test` run). The pure goal/scheduling logic itself is fully
 * exercised in arc/manifestGoals.test.ts and arc/manifestTaskScheduling.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/manifestGoals.ts");
const storageModule = readSource("data/storage.ts");

test("data/storage.ts owns the ManifestGoals AsyncStorage key and normalizes the parsed list the same defensive way every other collection is loaded", () => {
  assert.match(storageModule, /const MANIFEST_GOALS_KEY = "archi\.manifestGoals\.v1";/);
  const fnIndex = storageModule.indexOf("export async function loadManifestGoals");
  const fnBody = storageModule.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("Array.isArray(parsed) ? parsed : []"));
});

test("scheduleManifestTask loads the REAL routine template/tasks/occurrence completions and falls back to the default template's own period windows when routine setup was never completed -- never crashes just because first-time setup hasn't happened yet", () => {
  const fnIndex = module_.indexOf("export async function scheduleManifestTask");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("loadDailyRoutineTemplate(), loadTasks(), loadTaskOccurrenceCompletions()"));
  assert.ok(fnBody.includes("(routineTemplate ?? createEmptyDailyRoutineTemplate(now.toISOString())).periods"));
});

test("scheduleManifestTask creates NOTHING on a conflict -- it returns the pure scheduler's conflict result directly, before ever touching upsertTask", () => {
  const fnIndex = module_.indexOf("export async function scheduleManifestTask");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  const conflictReturnIndex = fnBody.indexOf('if (result.status === "conflict") return result;');
  const upsertIndex = fnBody.indexOf("await upsertTask(task);");
  assert.ok(conflictReturnIndex !== -1 && upsertIndex !== -1 && conflictReturnIndex < upsertIndex, "the conflict early-return must come BEFORE any task is created");
});

test("scheduleManifestTask, on a genuine fit, creates ONE ordinary Task through the SAME upsertTask every other task-creation path uses, carrying the manifest/goal link and the chosen schedule -- never a second, parallel task store", () => {
  const fnIndex = module_.indexOf("export async function scheduleManifestTask");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes("scheduledDate: result.dateLocal,"));
  assert.ok(fnBody.includes("scheduledTime: result.time,"));
  assert.ok(fnBody.includes("purposeManifestId: input.manifestId,"));
  assert.ok(fnBody.includes("purposeManifestGoalId: input.goalId,"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
});

test("deleteManifestGoal never deletes the trainee's own tasks -- it only clears their purposeManifestId/purposeManifestGoalId/purposeManifestTaskOrder via the SAME upsertTask update path, and never calls deleteTask", () => {
  const fnIndex = module_.indexOf("export async function deleteManifestGoal");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("purposeManifestId: null, purposeManifestGoalId: null, purposeManifestTaskOrder: null"));
  assert.ok(fnBody.includes("upsertTask("));
  assert.ok(!fnBody.includes("deleteTask("), "a goal deletion must never delete the task records it used to link to");
});

test("resolveManifestNextAction is a thin, always-fresh wrapper -- it loads goals/tasks/completions fresh every call (never caches), so completing/postponing/deleting a task anywhere else in the app is reflected the very next time this is read", () => {
  const fnIndex = module_.indexOf("export async function resolveManifestNextAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("loadManifestGoals(), loadTasks(), loadTaskOccurrenceCompletions()"));
  assert.ok(fnBody.includes("resolveNextManifestAction(manifestId, goals, tasks, completions, now)"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/continuousRoutineGroup.test.ts
 *
 * Unified ARC & Productivity Update task, requirement 9: source-text
 * regression guard for the AsyncStorage-backed orchestration layer
 * (not callable from a plain `node --test` run, same convention as
 * every other data/*.test.ts file). The pure model itself is fully
 * exercised in arc/continuousRoutineGroup.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/continuousRoutineGroup.ts");
const storageModule = readSource("data/storage.ts");

test("ContinuousRoutineGroup has its own dedicated storage key, completely separate from the pre-existing per-period DailyRoutineTemplate", () => {
  assert.match(storageModule, /const CONTINUOUS_ROUTINE_GROUPS_KEY = "archi\.continuousRoutineGroups\.v1";/);
  assert.match(storageModule, /export async function loadContinuousRoutineGroups\(\): Promise<ContinuousRoutineGroup\[\]>/);
  assert.match(storageModule, /export async function saveContinuousRoutineGroups\(groups: ContinuousRoutineGroup\[\]\): Promise<void>/);
});

test("the pending-combined-smiles accumulator has its own dedicated storage key too, as a plain groupKey -> number map", () => {
  assert.match(storageModule, /const CONTINUOUS_ROUTINE_PENDING_SMILES_KEY = "archi\.continuousRoutinePendingSmiles\.v1";/);
  assert.match(storageModule, /export async function loadContinuousRoutinePendingSmiles\(\): Promise<Record<string, number>>/);
});

test("saveNewContinuousRoutineGroup builds the group via arc/continuousRoutineGroup.ts's own createContinuousRoutineGroup and persists it through the dedup-aware upsertContinuousRoutineGroup -- never a raw array push that could double-group a task", () => {
  const fnIndex = module_.indexOf("export async function saveNewContinuousRoutineGroup");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const group = createContinuousRoutineGroup(taskIds, dateLocal, now.toISOString());"));
  assert.ok(fnBody.includes("await saveContinuousRoutineGroups(upsertContinuousRoutineGroup(groups, group));"));
});

test("deleteContinuousRoutineGroup removes only the grouping record -- the tasks themselves are never read or written here", () => {
  const fnIndex = module_.indexOf("export async function deleteContinuousRoutineGroup");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("removeContinuousRoutineGroup(groups, groupId)"));
  assert.ok(!fnBody.includes("upsertTask"), "must never touch a Task record");
});

test("addPendingContinuousRoutineSmiles is a silent no-op for 0 or negative smiles -- never writes a stray 0-valued entry, and never goes negative", () => {
  const fnIndex = module_.indexOf("export async function addPendingContinuousRoutineSmiles");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (smiles <= 0) return;"));
  assert.ok(fnBody.includes("map[groupKey] = (map[groupKey] ?? 0) + smiles;"));
});

test("takePendingContinuousRoutineSmiles reads AND clears the stored total in one step -- requirement 9's own 'prevent duplicate rewards', since a second call for the same groupKey can never see the same total again", () => {
  const fnIndex = module_.indexOf("export async function takePendingContinuousRoutineSmiles");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const pending = map[groupKey] ?? 0;"));
  assert.ok(fnBody.includes("delete map[groupKey];"));
  assert.ok(fnBody.includes("return pending;"));
});

test("loadContinuousRoutineGroupForTaskToday and loadContinuousRoutineGroupsForDate both read through the same loadContinuousRoutineGroups -- never a second, parallel read path", () => {
  const todayFnIndex = module_.indexOf("export async function loadContinuousRoutineGroupForTaskToday");
  const todayFnBody = module_.slice(todayFnIndex, todayFnIndex + 350);
  assert.ok(todayFnBody.includes("findGroupForTask(groups, todayLocalDateString(now), taskId)"));
  const dateFnIndex = module_.indexOf("export async function loadContinuousRoutineGroupsForDate");
  const dateFnBody = module_.slice(dateFnIndex, dateFnIndex + 350);
  assert.ok(dateFnBody.includes("groups.filter((group) => group.dateLocal === dateLocal)"));
});

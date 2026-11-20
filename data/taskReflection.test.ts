import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskReflection.test.ts
 *
 * Task Reflection Memory & Smart Notification Updates task:
 * source-text regression guard for the AsyncStorage-backed
 * orchestration layer (not callable from a plain `node --test` run,
 * same convention as every other data/*.test.ts file). The pure model
 * itself is fully exercised in arc/taskReflection.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskReflection.ts");
const storageModule = readSource("data/storage.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");

test("TaskReflection has its own dedicated storage key, completely separate from the append-only TaskJournalEntry log", () => {
  assert.match(storageModule, /const TASK_REFLECTIONS_KEY = "archi\.taskReflections\.v1";/);
  assert.match(storageModule, /export async function loadTaskReflections\(\): Promise<TaskReflection\[\]>/);
  assert.match(storageModule, /export async function saveTaskReflections\(reflections: TaskReflection\[\]\): Promise<void>/);
});

test("saveNewTaskReflection appends the new reflection (never overwriting prior history) and refreshes any already-armed notification for that exact task", () => {
  const fnIndex = module_.indexOf("export async function saveNewTaskReflection");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("await saveTaskReflections([...reflections, reflection]);"));
  assert.ok(fnBody.includes("await refreshTaskAlarmNotificationIfArmed(taskId, now);"));
});

test("saveNewTaskReflection never saves a blank answer -- the reflection stays entirely optional/skippable", () => {
  const fnIndex = module_.indexOf("export async function saveNewTaskReflection");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (!trimmed) return null;"));
});

test("editTaskReflection updates the EXISTING record's text in place (never appends a new history row for a correction) and refreshes that task's notification", () => {
  const fnIndex = module_.indexOf("export async function editTaskReflection");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("upsertReflectionInList(reflections, { ...existing, text: trimmed, updatedAt: now.toISOString() })"));
  assert.ok(fnBody.includes("await refreshTaskAlarmNotificationIfArmed(existing.taskId, now);"));
});

test("deleteTaskReflection removes exactly that one reflection and refreshes that task's notification so a newly-promoted latest reflection (or the default text) takes over", () => {
  const fnIndex = module_.indexOf("export async function deleteTaskReflection");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("removeReflectionFromList(reflections, id)"));
  assert.ok(fnBody.includes("await refreshTaskAlarmNotificationIfArmed(existing.taskId, now);"));
});

test("listReflectionsForTaskNewestFirst is the one function the history screen uses -- newest first, scoped to the given task only", () => {
  const fnIndex = module_.indexOf("export async function listReflectionsForTaskNewestFirst");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("sortReflectionsNewestFirst(reflectionsForTask(reflections, taskId))"));
});

test("TaskAlarmPreferences.showReflectionOnLockScreen defaults to true (requirement 2's behavior by default) and backfills a preference record saved before this field existed, via the same spread every other default in that function already uses -- no separate migration needed", () => {
  assert.match(storageModule, /const DEFAULT_TASK_ALARM_PREFERENCES: TaskAlarmPreferences = \{ soundEnabled: true, vibrationEnabled: true, showReflectionOnLockScreen: true \};/);
  const fnIndex = storageModule.indexOf("export async function loadTaskAlarmPreferences");
  const fnBody = storageModule.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("{ ...DEFAULT_TASK_ALARM_PREFERENCES, ...(JSON.parse(raw) as Partial<TaskAlarmPreferences>) }"), "a legacy stored record missing showReflectionOnLockScreen must fall back to the default true, never crash or read as undefined");
});

test("this module imports data/taskAlarm.ts in ONE direction only -- data/taskAlarm.ts never imports data/taskReflection.ts (it reads the pure primitives it needs directly from arc/taskReflection.ts and data/storage.ts instead), so the two files can never form an import cycle", () => {
  assert.ok(module_.includes('import { refreshTaskAlarmNotificationIfArmed } from "./taskAlarm.ts";'));
  assert.ok(!taskAlarmModule.includes('from "./taskReflection.ts"'), "data/taskAlarm.ts must never import data/taskReflection.ts");
});

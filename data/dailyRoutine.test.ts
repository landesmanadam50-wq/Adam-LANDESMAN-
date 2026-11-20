import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/dailyRoutine.test.ts
 *
 * Automatic Routine Builder: source-text regression guard for this
 * module's AsyncStorage-backed I/O, same convention as
 * data/taskAlarm.test.ts -- AsyncStorage isn't a callable mock under a
 * plain `node --test` run, so this checks the real source text
 * instead of actually invoking it. The pure schedule-generation logic
 * itself is unchanged and fully exercised in arc/dailyRoutine.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/dailyRoutine.ts");

test("materializeSlot preserves the existing Task's own identity/history fields when updating an already-materialized routine task", () => {
  const fnIndex = module_.indexOf("function materializeSlot");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.match(fnBody, /if \(existing\) \{\s*return \{\s*\.\.\.existing,/, "must spread the EXISTING task first, so status/completedAt/subtasks/etc. survive an update");
  assert.ok(fnBody.includes("title: slot.title,"));
  assert.ok(fnBody.includes("scheduledTime: slot.startTime,"));
  assert.ok(fnBody.includes("breakAfter: slot.breakAfter,"));
});

test("materializeSlot creates a brand-new task as RECURRING every day when none exists yet, linked back to its template id", () => {
  const fnIndex = module_.indexOf("function materializeSlot");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('recurrence: { kind: "recurring", daysOfWeek: EVERY_DAY_OF_WEEK },'));
  assert.ok(fnBody.includes("routineTaskTemplateId: slot.taskTemplateId,"));
});

test("materializeDailyRoutineTemplate archives (never deletes) a previously-materialized task whose template entry no longer exists", () => {
  const fnIndex = module_.indexOf("export async function materializeDailyRoutineTemplate");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("liveTemplateTaskIds.has(task.routineTaskTemplateId)"));
  assert.ok(fnBody.includes("archiveTask(task, nowIso)"));
  assert.ok(!fnBody.includes("deleteTask"), "a routine task falling out of the template must be archived, never hard-deleted");
});

test("materializeDailyRoutineTemplate matches an existing task back to its template entry before deciding create vs update", () => {
  const fnIndex = module_.indexOf("export async function materializeDailyRoutineTemplate");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("findMaterializedTask(tasks, slot.taskTemplateId)"));
});

test("materializeDailyRoutineTemplate persists via saveTasks and returns the full list", () => {
  const fnIndex = module_.indexOf("export async function materializeDailyRoutineTemplate");
  const fnBody = module_.slice(fnIndex, fnIndex + 1300);
  assert.ok(fnBody.includes("await saveTasks(tasks);"));
  assert.ok(fnBody.includes("return tasks;"));
});

test("addOneTimeRoutineTask creates a ONE-TIME task, never linked to a template entry, scoped to the given date", () => {
  const fnIndex = module_.indexOf("export async function addOneTimeRoutineTask");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('recurrence: { kind: "once" },'));
  assert.ok(fnBody.includes("routineTaskTemplateId: null,"));
  assert.ok(fnBody.includes("scheduledDate: scheduledDateLocal,"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
});

test("findMaterializedTask never matches an already-archived routine task", () => {
  const fnIndex = module_.indexOf("function findMaterializedTask");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('task.status !== "archived"'));
});

// Unified ARC & Productivity Update task, requirement 9: an ad-hoc
// continuous-routine GROUP (arc/continuousRoutineGroup.ts) is now
// checked FIRST, before the pre-existing per-period routineMode
// fallback below -- these three tests updated for that, and for the
// new pendingSmilesGroupKey field every return now carries.

test("resolveContinuousRoutineOutcome is non-continuous for any task not linked to a routine period at all AND not in any ad-hoc group -- every ad-hoc (non-grouped, non-routine) task keeps its existing behavior", () => {
  const fnIndex = module_.indexOf("export async function resolveContinuousRoutineOutcome");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("if (task.routinePeriodId === null) return { isContinuous: false, nextTaskInPeriod: null, pendingSmilesGroupKey: null };"));
});

test("resolveContinuousRoutineOutcome reads the period's OWN mode from the template, defaulting to 'spaced' when there is no template at all", () => {
  const fnIndex = module_.indexOf("export async function resolveContinuousRoutineOutcome");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('template?.periods[task.routinePeriodId]?.routineMode ?? "spaced"'));
  assert.ok(fnBody.includes('if (mode !== "continuous") return { isContinuous: false, nextTaskInPeriod: null, pendingSmilesGroupKey: null };'));
});

test("resolveContinuousRoutineOutcome delegates the actual 'next task in period' search to arc/dailyRoutine.ts's own resolveNextContinuousTaskInPeriod -- never a second, competing implementation", () => {
  const fnIndex = module_.indexOf("export async function resolveContinuousRoutineOutcome");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("resolveNextContinuousTaskInPeriod(tasks, completions, task.routinePeriodId, task.id, now)"));
});

test("resolveContinuousRoutineOutcome checks an ad-hoc continuous-routine group FIRST, via data/continuousRoutineGroup.ts's own loadContinuousRoutineGroupForTaskToday, and delegates its own 'next task in group' search to arc/continuousRoutineGroup.ts's resolveNextTaskInContinuousRoutineGroup -- never a second, competing implementation", () => {
  const fnIndex = module_.indexOf("export async function resolveContinuousRoutineOutcome");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("const group = await loadContinuousRoutineGroupForTaskToday(task.id, now);"));
  assert.ok(fnBody.includes("resolveNextTaskInContinuousRoutineGroup(tasks, completions, group, task.id, now)"));
  assert.ok(fnBody.includes('pendingSmilesGroupKey: `group:${group.id}`'));
});

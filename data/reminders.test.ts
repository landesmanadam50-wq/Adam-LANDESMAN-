import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/reminders.test.ts
 *
 * ARCHI -- Complete the Non-Interrupting Notification System task:
 * source-text regression guard for routeTappedReminder, the single
 * source of truth for "where does a tapped SOFT reminder navigate to"
 * -- extracted out of app/_layout.tsx's own handleReminderResponse so
 * BOTH the expo-notifications listener (for whatever remains on that
 * mechanism) and data/taskAlarm.ts's own handleTaskAlarmEvent (for
 * every reminder kind now delivered via notifee) can call the SAME
 * logic, never two competing switches. Like data/storage.ts/
 * data/notifications.ts, this module depends on native modules
 * (expo-router, AsyncStorage, notifee) and isn't unit-tested with
 * node --test by actually calling it -- this checks the real source
 * text instead, same constraint as every other I/O module here.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/reminders.ts");
const layoutModule = readSource("app/_layout.tsx");

test("routeTappedReminder is exported, and app/_layout.tsx imports it (never a second, re-derived switch of its own)", () => {
  assert.ok(module_.includes("export function routeTappedReminder(data: Record<string, unknown>): void {"));
  assert.ok(layoutModule.includes('import { routeTappedReminder } from "../data/reminders.ts";'));
});

test("routeTappedReminder returns immediately for anything that isn't a marked reminder -- never navigates on a stray/foreign notification's data", () => {
  const fnIndex = module_.indexOf("export function routeTappedReminder");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (data?.isReminder !== true) return;"));
});

test("routine kind: deep-links to /live with routineId, and fire-and-forget reconciles that SAME routine's own next occurrence -- never routed through resolveReminderRoute/cancelPendingReminder (PendingReminder's one-per-kind model doesn't fit a per-routine notification)", () => {
  const fnIndex = module_.indexOf("export function routeTappedReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  const branchIndex = fnBody.indexOf('if (kind === "routine") {');
  assert.ok(branchIndex !== -1);
  const branchBody = fnBody.slice(branchIndex, branchIndex + 250);
  assert.ok(branchBody.includes("reconcileRoutineNotifications();"));
  assert.ok(branchBody.includes('router.push({ pathname: "/live", params: { routineId } });'));
});

test("arcGoalTarget kind: deep-links straight to the tapped target's own screen, then reconciles that SAME target's own next occurrence", () => {
  const fnIndex = module_.indexOf("export function routeTappedReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  const branchIndex = fnBody.indexOf('if (kind === "arcGoalTarget") {');
  assert.ok(branchIndex !== -1);
  const branchBody = fnBody.slice(branchIndex, branchIndex + 350);
  assert.ok(branchBody.includes("getArcGoalTarget(targetId).then((target) => {"));
  assert.ok(branchBody.includes("if (target) reconcileArcGoalTargetNotification(target);"));
  assert.ok(branchBody.includes('router.push({ pathname: "/goals/target/[targetId]", params: { targetId } });'));
});

test("fourWeekProgramWeek/personalDevelopmentProgramWeek/arcGymReminder kinds each deep-link to their own dedicated screen -- own independent notification per entity, never PendingReminder's one-per-kind model", () => {
  const fnIndex = module_.indexOf("export function routeTappedReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('router.push({ pathname: "/goals/live/[goalId]", params: { goalId } });'));
  assert.ok(fnBody.includes('router.push({ pathname: "/personal-development-program/live/[id]", params: { id: programId } });'));
  assert.ok(fnBody.includes('{ pathname: "/arc-gym/memory/[id]", params: { id: exerciseId } }'));
  assert.ok(fnBody.includes('{ pathname: "/arc-gym/situation/[id]", params: { id: exerciseId } }'));
});

test("every other reminder kind (focusSuccess/arc/lifeManifestSubGoal/lifeManifestTarget) falls through to the generic PendingReminder path: cancelPendingReminder then resolveReminderRoute", () => {
  const fnIndex = module_.indexOf("export function routeTappedReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("cancelPendingReminder(kind);"));
  assert.ok(fnBody.includes("router.push(resolveReminderRoute(kind));"));
});

test("routeTappedReminder never handles taskTimerEnded/restTimerEnded/postponedTaskReturn/taskScheduledStart -- those four current-task kinds keep their own dedicated handling in app/_layout.tsx, never migrated here", () => {
  const fnIndex = module_.indexOf("export function routeTappedReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(!fnBody.includes("taskTimerEnded"));
  assert.ok(!fnBody.includes("restTimerEnded"));
  assert.ok(!fnBody.includes("postponedTaskReturn"));
  assert.ok(!fnBody.includes('"taskScheduledStart"'));
});

test("app/_layout.tsx's own handleReminderResponse still handles the four current-task kinds directly (expo-notifications never migrated for them), then delegates every other kind to routeTappedReminder", () => {
  const fnIndex = layoutModule.indexOf("function handleReminderResponse");
  const fnBody = layoutModule.slice(fnIndex, layoutModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('if (kind === "taskTimerEnded" || kind === "restTimerEnded" || kind === "postponedTaskReturn" || kind === "taskScheduledStart") {'));
  assert.ok(fnBody.includes("routeTappedReminder(data as Record<string, unknown>);"));
});

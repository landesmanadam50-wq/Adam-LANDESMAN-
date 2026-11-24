import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/arcReminderScheduler.test.ts
 *
 * ARC Reminders task, Phase 5: source-text regression guard for
 * topUpRemindersIfNeeded/topUpOneReminder (this module depends on
 * data/storage.ts's AsyncStorage-backed loaders and data/notifications.ts's
 * notifee-backed scheduler, so it isn't executed directly with
 * `node --test` -- same convention as every other data/*.test.ts file in
 * this app). The pure diffing it calls into
 * (arc/reminderRollingSchedule.ts's computeTopUpPlan/needsTopUp) already
 * has its own fully-executed test file.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/arcReminderScheduler.ts");

function fnBody(exportSignature: string, nextExportSignature: string | null): string {
  const start = module_.indexOf(exportSignature);
  assert.ok(start !== -1, `expected to find ${exportSignature}`);
  const end = nextExportSignature ? module_.indexOf(nextExportSignature) : module_.length;
  assert.ok(end !== -1 && end > start, `expected to find ${nextExportSignature} after ${exportSignature}`);
  return module_.slice(start, end);
}

test("topUpRemindersIfNeeded gates mantra top-up ONLY behind mantraRemindersEnabled -- never force-cancelling anything when the toggle is off, just skipping this pass's top-up for that one family", () => {
  const body = fnBody("export async function topUpRemindersIfNeeded", "async function topUpMantraReminder");
  assert.ok(body.includes("const settings = await loadArcTaskReminderSettings();"));
  assert.ok(body.includes("if (settings.mantraRemindersEnabled) {"));
  assert.ok(body.includes("const mantras = await loadArcMantraReminders();"));
  assert.ok(body.includes("mantras.map((reminder) => topUpMantraReminder(reminder, now))"));
});

test("topUpRemindersIfNeeded gates Active Recall top-up ONLY behind activeRecallRemindersEnabled, independently of the mantra gate above", () => {
  const body = fnBody("export async function topUpRemindersIfNeeded", "async function topUpMantraReminder");
  assert.ok(body.includes("if (settings.activeRecallRemindersEnabled) {"));
  assert.ok(body.includes("const recalls = await loadArcRecallReminders();"));
  assert.ok(body.includes("recalls.map((reminder) => topUpRecallReminder(reminder, now))"));
});

test("topUpMantraReminder/topUpRecallReminder each delegate to the ONE shared topUpOneReminder, passing their own reminder.schedule and their own delivery function -- never a second, parallel scheduling loop", () => {
  const mantraBody = fnBody("async function topUpMantraReminder", "async function topUpRecallReminder");
  assert.ok(mantraBody.includes("await topUpOneReminder(reminder.id, reminder.schedule, now, (fireAt) => deliverArcMantraReminder(reminder, fireAt));"));

  const recallBody = fnBody("async function topUpRecallReminder", null);
  assert.ok(recallBody.includes("await topUpOneReminder(reminder.id, reminder.schedule, now, (fireAt) => deliverArcRecallReminder(reminder, fireAt, now.toISOString()));"));
});

test("topUpOneReminder is a no-op (no cancels, no schedules, no storage write) once needsTopUp says the existing horizon is still far enough out", () => {
  const body = fnBody("async function topUpOneReminder", "export async function topUpRemindersIfNeeded");
  assert.ok(body.includes("if (!needsTopUp(furthest, now)) return;"));
  const needsTopUpIndex = body.indexOf("if (!needsTopUp(furthest, now)) return;");
  const firstCancelIndex = body.indexOf("cancelScheduledNotification");
  assert.ok(firstCancelIndex === -1 || needsTopUpIndex < firstCancelIndex, "the needsTopUp short-circuit must come before any cancel/schedule side effect");
});

test("topUpOneReminder's furthest-scheduled-time computation reduces over the EXISTING triggers' own fireAt timestamps, never a second fresh resolution of the schedule", () => {
  const body = fnBody("async function topUpOneReminder", "export async function topUpRemindersIfNeeded");
  assert.ok(body.includes("const existing = await loadArcReminderScheduledTriggers(reminderId);"));
  assert.ok(body.includes("const furthest = existing.reduce<Date | null>((max, trigger) => {"));
  assert.ok(body.includes("const fireAt = new Date(trigger.fireAt);"));
});

test("topUpOneReminder: a paused schedule cancels every existing trigger and clears storage to an empty list, WITHOUT calling computeTopUpPlan or deliver at all -- pause must never leave a stale trigger scheduled nor fabricate a new one", () => {
  const body = fnBody("async function topUpOneReminder", "export async function topUpRemindersIfNeeded");
  const pausedIndex = body.indexOf("if (schedule.paused) {");
  assert.ok(pausedIndex !== -1);
  const pausedBlock = body.slice(pausedIndex, body.indexOf("const plan = computeTopUpPlan"));
  assert.ok(pausedBlock.includes("await Promise.all(existing.map((trigger) => cancelScheduledNotification(trigger.notificationId)));"));
  assert.ok(pausedBlock.includes("await saveArcReminderScheduledTriggers(reminderId, []);"));
  assert.ok(pausedBlock.includes("return;"));
  assert.ok(pausedIndex < body.indexOf("const plan = computeTopUpPlan"), "the paused short-circuit must run before computeTopUpPlan is ever called");
});

test("topUpOneReminder (not paused): cancels exactly the ids computeTopUpPlan.toCancel names, by looking up EACH one's own notificationId from the existing list -- never cancelling by the deterministic triggerId itself (notifee only accepts the real notificationId it returned at schedule time)", () => {
  const body = fnBody("async function topUpOneReminder", "export async function topUpRemindersIfNeeded");
  assert.ok(body.includes("const plan = computeTopUpPlan(reminderId, existing.map((trigger) => trigger.triggerId), schedule, now);"));
  assert.ok(body.includes("plan.toCancel.map((triggerId) => {"));
  assert.ok(body.includes("const trigger = existing.find((item) => item.triggerId === triggerId);"));
  assert.ok(body.includes("return trigger ? cancelScheduledNotification(trigger.notificationId) : Promise.resolve();"));
});

test("topUpOneReminder: schedules exactly plan.toSchedule's new slots via the caller-supplied `deliver`, skipping (never persisting) a slot whose deliver() call returns null -- the read-through 'never fabricate content' contract propagating all the way up from data/arcMantraDelivery.ts/data/arcRecallDelivery.ts", () => {
  const body = fnBody("async function topUpOneReminder", "export async function topUpRemindersIfNeeded");
  assert.ok(body.includes("for (const slot of plan.toSchedule) {"));
  assert.ok(body.includes("const notificationId = await deliver(slot.time);"));
  assert.ok(body.includes("if (notificationId) added.push({ triggerId: slot.id, notificationId, fireAt: slot.time.toISOString() });"));
});

test("topUpOneReminder persists the final trigger list as kept (not cancelled) + newly added, in one single saveArcReminderScheduledTriggers write -- never two separate writes that could leave storage half-updated if the process dies mid-way", () => {
  const body = fnBody("async function topUpOneReminder", "export async function topUpRemindersIfNeeded");
  assert.ok(body.includes("const kept = existing.filter((trigger) => !plan.toCancel.includes(trigger.triggerId));"));
  assert.ok(body.includes("await saveArcReminderScheduledTriggers(reminderId, [...kept, ...added]);"));
  const writeCount = body.split("await saveArcReminderScheduledTriggers(reminderId,").length - 1;
  assert.equal(writeCount, 2, "exactly one write in the paused branch and one write in the normal-flow branch -- never more than one per call");
});

test("imports: topUpRemindersIfNeeded is the ONE scheduling entry point, built on the exact existing pure diffing + delivery + storage primitives -- no second scheduling mechanism introduced", () => {
  assert.match(module_, /import \{ computeTopUpPlan, needsTopUp \} from "\.\.\/arc\/reminderRollingSchedule\.ts";/);
  assert.match(module_, /import \{ deliverArcMantraReminder \} from "\.\/arcMantraDelivery\.ts";/);
  assert.match(module_, /import \{ deliverArcRecallReminder \} from "\.\/arcRecallDelivery\.ts";/);
  assert.match(module_, /import \{ cancelScheduledNotification \} from "\.\/notifications\.ts";/);
  assert.match(module_, /loadArcMantraReminders,\s*\n\s*loadArcRecallReminders,\s*\n\s*loadArcReminderScheduledTriggers,\s*\n\s*loadArcTaskReminderSettings,\s*\n\s*saveArcReminderScheduledTriggers,/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/arcReminderCrud.test.ts
 *
 * ARC Reminders task, Phase 5: source-text regression guard for the
 * one orchestration layer every create/edit/pause/resume/delete UI
 * action goes through (depends on data/storage.ts's AsyncStorage-backed
 * CRUD and data/notifications.ts's notifee-backed cancel, so it isn't
 * executed directly with `node --test` -- same convention as every
 * other data/*.test.ts file in this app).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/arcReminderCrud.ts");

function fnBody(signature: string, nextSignature: string | null): string {
  const start = module_.indexOf(signature);
  assert.ok(start !== -1, `expected to find ${signature}`);
  const end = nextSignature ? module_.indexOf(nextSignature) : module_.length;
  assert.ok(end !== -1 && end > start);
  return module_.slice(start, end);
}

test("saveArcMantraReminder/saveArcRecallReminder each upsert through the plain storage entry THEN re-run topUpRemindersIfNeeded() -- so create/edit/resume take effect in real scheduled notifications immediately, never only on the next app-foreground", () => {
  const mantraBody = fnBody("export async function saveArcMantraReminder", "export async function deleteArcMantraReminder");
  assert.ok(mantraBody.includes("await upsertArcMantraReminderEntry(reminder);"));
  assert.ok(mantraBody.includes("await topUpRemindersIfNeeded();"));
  assert.ok(mantraBody.indexOf("await upsertArcMantraReminderEntry(reminder);") < mantraBody.indexOf("await topUpRemindersIfNeeded();"));

  const recallBody = fnBody("export async function saveArcRecallReminder", "export async function deleteArcRecallReminder");
  assert.ok(recallBody.includes("await upsertArcRecallReminderEntry(reminder);"));
  assert.ok(recallBody.includes("await topUpRemindersIfNeeded();"));
});

test("cancelAllTriggersFor cancels EVERY currently-scheduled trigger for one reminder by its real notificationId, then clears that reminder's own ArcReminderScheduledTrigger record -- a stray, no-longer-cancellable notification is never left behind", () => {
  const fn = fnBody("async function cancelAllTriggersFor", "export async function saveArcMantraReminder");
  assert.ok(fn.includes("const triggers = await loadArcReminderScheduledTriggers(reminderId);"));
  assert.ok(fn.includes("await Promise.all(triggers.map((trigger) => cancelScheduledNotification(trigger.notificationId)));"));
  assert.ok(fn.includes("await clearArcReminderScheduledTriggers(reminderId);"));
  const cancelIndex = fn.indexOf("await Promise.all(triggers.map");
  const clearIndex = fn.indexOf("await clearArcReminderScheduledTriggers(reminderId);");
  assert.ok(cancelIndex < clearIndex, "must cancel the real notifications before clearing the bookkeeping that tracks them");
});

test("deleteArcMantraReminder/deleteArcRecallReminder both cancel all of that reminder's own triggers BEFORE deleting the reminder record itself -- never the other order, which would leave the triggers unreachable (no reminder left to look up their own ids from)", () => {
  const mantraDelete = fnBody("export async function deleteArcMantraReminder", "export async function saveArcRecallReminder");
  assert.ok(mantraDelete.includes("await cancelAllTriggersFor(id);"));
  assert.ok(mantraDelete.includes("await deleteArcMantraReminderEntry(id);"));
  assert.ok(mantraDelete.indexOf("await cancelAllTriggersFor(id);") < mantraDelete.indexOf("await deleteArcMantraReminderEntry(id);"));

  const recallDelete = fnBody("export async function deleteArcRecallReminder", null);
  assert.ok(recallDelete.includes("await cancelAllTriggersFor(id);"));
  assert.ok(recallDelete.includes("await deleteArcRecallReminderEntry(id);"));
  assert.ok(recallDelete.indexOf("await cancelAllTriggersFor(id);") < recallDelete.indexOf("await deleteArcRecallReminderEntry(id);"));
});

test("deleteArcMantraReminder/deleteArcRecallReminder never call topUpRemindersIfNeeded() -- a delete is a terminal action for that one reminder, never a reason to re-run the rolling top-up for every other reminder", () => {
  const mantraDelete = fnBody("export async function deleteArcMantraReminder", "export async function saveArcRecallReminder");
  assert.ok(!mantraDelete.includes("topUpRemindersIfNeeded"));
  const recallDelete = fnBody("export async function deleteArcRecallReminder", null);
  assert.ok(!recallDelete.includes("topUpRemindersIfNeeded"));
});

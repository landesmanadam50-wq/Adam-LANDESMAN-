import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/arcRecallDelivery.test.ts
 *
 * ARC Reminders task, Phase 4 (native inline-reply wiring): source-text
 * regression guard for deliverArcRecallReminder/recordArcRecallAnswer
 * (this module depends on data/storage.ts's AsyncStorage-backed loaders
 * and data/notifications.ts's notifee-backed scheduler, so it isn't
 * executed directly with `node --test` -- same convention as every
 * other data/*.test.ts file in this app). resolveArcRecallReminderQuestion's
 * own switch logic already has its real, fully-executed tests via the
 * pure generators it calls (arc/arcRecallQuestionGeneration.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/arcRecallDelivery.ts");

test("deliverArcRecallReminder skips silently (never a fabricated question/notification) when resolveArcRecallReminderQuestion returns null", () => {
  const fnIndex = module_.indexOf("export async function deliverArcRecallReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recordArcRecallAnswer"));
  assert.ok(fnBody.includes("const question = await resolveArcRecallReminderQuestion(reminder);"));
  assert.ok(fnBody.includes("if (!question) return null;"));
});

test("deliverArcRecallReminder appends a new, permanent ArcRecallChatMessage BEFORE scheduling the notification -- the message's own id is baked into the notification's data payload so the inline-reply handler can always find the exact right message", () => {
  const fnIndex = module_.indexOf("export async function deliverArcRecallReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recordArcRecallAnswer"));
  const messageIndex = fnBody.indexOf("const message = createArcRecallChatMessage(reminder.id, reminder.sourceRef, question.questionText, now);");
  const appendIndex = fnBody.indexOf("await appendArcRecallChatMessageEntry(message);");
  const scheduleIndex = fnBody.indexOf("return scheduleReminderNotification({");
  assert.ok(messageIndex !== -1 && appendIndex !== -1 && scheduleIndex !== -1);
  assert.ok(messageIndex < appendIndex && appendIndex < scheduleIndex, "must create+persist the chat message before scheduling, never after");
});

test("deliverArcRecallReminder reuses the EXACT SAME scheduleReminderNotification every other reminder kind already uses -- never a second, bespoke scheduling call -- carrying both arcReminderId (tap-to-open-chat) and arcRecallChatMessageId (inline-reply) in its payload", () => {
  assert.match(module_, /import \{ scheduleReminderNotification \} from "\.\/notifications\.ts";/);
  const fnIndex = module_.indexOf("export async function deliverArcRecallReminder");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recordArcRecallAnswer"));
  assert.ok(fnBody.includes('kind: "arcRecallQuestion",'));
  assert.ok(fnBody.includes("fireAt,"));
  assert.ok(fnBody.includes("body: question.questionText,"));
  assert.ok(fnBody.includes("arcRequested: false,"));
  assert.ok(fnBody.includes("arcReminderId: reminder.id,"));
  assert.ok(fnBody.includes("arcRecallChatMessageId: message.id,"));
});

test("recordArcRecallAnswer is the ONE write path -- loads the live chat history, finds the exact message by id, and routes through the EXACT SAME pure recordArcRecallChatAnswer (arc/arcReminders.ts) every answer path shares; a missing message id is a silent no-op, never a crash", () => {
  assert.match(module_, /import \{ createArcRecallChatMessage, recordArcRecallChatAnswer \} from "\.\.\/arc\/arcReminders\.ts";/);
  const fnIndex = module_.indexOf("export async function recordArcRecallAnswer");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("const messages = await loadArcRecallChatHistory();"));
  assert.ok(fnBody.includes("const message = messages.find((item) => item.id === chatMessageId);"));
  assert.ok(fnBody.includes("if (!message) return;"));
  assert.ok(fnBody.includes("await updateArcRecallChatMessageEntry(recordArcRecallChatAnswer(message, answerText, now));"));
});

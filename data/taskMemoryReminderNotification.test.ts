import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskMemoryReminderNotification.test.ts
 *
 * Action-Based Tasks task, section 4: source-text regression guard for
 * this module's notifee-backed reminder (notifee isn't callable from a
 * plain `node --test` run -- importing this module at all pulls in
 * @notifee/react-native and expo-router, which pull in react-native
 * itself -- same convention as every other notification module in this
 * app, see data/taskNotStartedNotification.test.ts). Even
 * buildTaskMemoryReminderBody, despite having no side effects of its
 * own, cannot be imported directly for that reason, so its exact
 * template is checked as source text instead.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskMemoryReminderNotification.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const tasksModule = readSource("arc/tasks.ts");

test("buildTaskMemoryReminderBody shows the trigger/action verbatim, never reworded, matching the user's own worked example exactly, one sentence per exercise joined by newlines (never any other separator)", () => {
  const fnIndex = module_.indexOf("export function buildTaskMemoryReminderBody");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function cancelArmedTaskMemoryReminderAlarm"));
  assert.ok(fnBody.includes('`כש${exercise.situationText}, תזכור ${exercise.actionText}.`'));
  assert.ok(fnBody.includes('.join("\\n")'));
});

test("the real, displayed reminder uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one, never stacking a second", () => {
  assert.match(module_, /const TASK_MEMORY_REMINDER_NOTIFICATION_ID = "archi-task-memory-reminder-notification";/);
  const fnIndex = module_.indexOf("export async function displayTaskMemoryReminderForTask");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeTaskMemoryReminderNotification"));
  assert.ok(fnBody.includes("id: TASK_MEMORY_REMINDER_NOTIFICATION_ID,"));
});

test("displayTaskMemoryReminderForTask is a silent no-op for a task that no longer exists, or that no longer has any linked exercise -- never a stale/empty notification", () => {
  const fnIndex = module_.indexOf("export async function displayTaskMemoryReminderForTask");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeTaskMemoryReminderNotification"));
  assert.ok(fnBody.includes("if (!task || task.linkedArcGymMemoryExerciseIds.length === 0) return;"));
  assert.ok(fnBody.includes("if (linkedExercises.length === 0) return;"));
});

test("armTaskMemoryReminderAlarm cancels any previous arm FIRST, then picks the SOONEST qualifying entry (linked exercises + a resolved, still-future (start - 5min) moment) -- never more than one armed at a time", () => {
  const fnIndex = module_.indexOf("async function armTaskMemoryReminderAlarm");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function displayTaskMemoryReminderForTask"));
  assert.ok(fnBody.includes("await cancelArmedTaskMemoryReminderAlarm();"));
  assert.ok(fnBody.includes("if (entry.task.linkedArcGymMemoryExerciseIds.length === 0) continue;"));
  assert.ok(fnBody.includes("if (!fireAt || fireAt.getTime() <= now.getTime()) continue;"));
  assert.ok(fnBody.includes("if (!soonest || fireAt.getTime() < soonest.fireAt.getTime()) soonest = { entry, fireAt };"));
  assert.ok(fnBody.includes("if (!soonest) return;"));
});

test("the 5-minute lead time is a named constant, used to compute the reminder's own fire moment from the entry's resolved start", () => {
  assert.match(module_, /const REMINDER_LEAD_MINUTES = 5;/);
  const fnIndex = module_.indexOf("function resolveReminderFireDate");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("startDate.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000"));
});

test("the arm is a SILENT placeholder (reuses the exact SILENT_DELIVERY_CHANNEL_ID/foreground-service/alarm-clock trigger pattern data/taskNotStartedNotification.ts's own arm already uses), carrying the exact taskId to display for on its own data -- never re-resolved against 'what's current/next now' at fire time", () => {
  const fnIndex = module_.indexOf("async function armTaskMemoryReminderAlarm");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function displayTaskMemoryReminderForTask"));
  assert.ok(fnBody.includes("id: TASK_MEMORY_REMINDER_ARM_ID,"));
  assert.ok(fnBody.includes('data: { kind: "taskMemoryReminderArm", taskId: soonest.entry.task.id },'));
  assert.ok(fnBody.includes("channelId: SILENT_DELIVERY_CHANNEL_ID,"));
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
});

test("recomputeTaskMemoryReminderNotification is the one exported entry point every mutation site calls -- re-resolves today's plan fresh and re-arms, never displays anything itself", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskMemoryReminderNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function handleTaskMemoryReminderAlarmFired"));
  assert.ok(fnBody.includes("const scheduled = await resolveTodaysScheduledPlan(now);"));
  assert.ok(fnBody.includes("await armTaskMemoryReminderAlarm(scheduled, now);"));
  assert.ok(!fnBody.includes("displayTaskMemoryReminderForTask"), "recompute only ever arms -- display happens via the arm's own fire handler or the immediate To-Do path, never from recompute directly");
});

test("handleTaskMemoryReminderAlarmFired (routed from the arm's own fire) displays the real reminder for the exact task the arm carried", () => {
  const fnIndex = module_.indexOf("export async function handleTaskMemoryReminderAlarmFired");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await displayTaskMemoryReminderForTask(taskId, now);"));
});

test("handleTaskMemoryReminderNotificationEvent (the real notification's own tap) cancels it and opens the exact task, the same bare-open convention every other reminder-style notification already follows", () => {
  const fnIndex = module_.indexOf("export async function handleTaskMemoryReminderNotificationEvent");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("if (event.type !== EventType.PRESS) return;"));
  assert.ok(fnBody.includes("await notifee.cancelNotification(TASK_MEMORY_REMINDER_NOTIFICATION_ID);"));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]", params: { id: taskId } });'));
});

test("data/taskAlarm.ts's foreground-service handler recognizes the arm placeholder (data.kind === 'taskMemoryReminderArm') and routes it to handleTaskMemoryReminderAlarmFired with the carried taskId, then cancels the placeholder -- the exact isTaskNotStartedArm pattern", () => {
  assert.match(taskAlarmModule, /const isTaskMemoryReminderArm = notification\.data\?\.kind === "taskMemoryReminderArm";/);
  assert.match(taskAlarmModule, /const taskMemoryReminderTaskId = typeof notification\.data\?\.taskId === "string" \? notification\.data\.taskId : null;/);
  const branchIndex = taskAlarmModule.indexOf("if (isTaskMemoryReminderArm && taskMemoryReminderTaskId) {");
  assert.ok(branchIndex !== -1);
  const branchBody = taskAlarmModule.slice(branchIndex, branchIndex + 300);
  assert.ok(branchBody.includes("handleTaskMemoryReminderAlarmFired(taskMemoryReminderTaskId, new Date())"));
  assert.ok(branchBody.includes("await notifee.cancelNotification(notificationId).catch(() => {});"));
});

test("data/taskAlarm.ts's shared handleTaskAlarmEvent dispatches the real notification's own tap (data.kind === 'taskMemoryReminder') through handleTaskMemoryReminderNotificationEvent, never a second onBackgroundEvent/onForegroundEvent registration", () => {
  assert.ok(taskAlarmModule.includes('import { handleTaskMemoryReminderAlarmFired, handleTaskMemoryReminderNotificationEvent } from "./taskMemoryReminderNotification.ts";'));
  const fnIndex = taskAlarmModule.indexOf("export async function handleTaskAlarmEvent");
  const branchIndex = taskAlarmModule.indexOf('if (data.kind === "taskMemoryReminder") {', fnIndex);
  assert.ok(branchIndex !== -1);
  const branchBody = taskAlarmModule.slice(branchIndex, branchIndex + 150);
  assert.ok(branchBody.includes("await handleTaskMemoryReminderNotificationEvent(event);"));
});

test("Task.linkedArcGymMemoryExerciseIds exists, defaults to [], and is backfilled on load -- same convention as every other id-array field", () => {
  assert.match(tasksModule, /linkedArcGymMemoryExerciseIds: string\[\];/);
  assert.ok(tasksModule.includes("linkedArcGymMemoryExerciseIds: [],"));
  assert.ok(tasksModule.includes("linkedArcGymMemoryExerciseIds: task.linkedArcGymMemoryExerciseIds ?? [],"));
});

test("build/TaskEditorScreen.tsx shows a multi-select 'תזכורות ARC Memory' chip row over every ArcGymMemoryExercise, toggling membership in draft.linkedArcGymMemoryExerciseIds through the normal save path", () => {
  const fieldIndex = taskEditorScreen.indexOf('<Field label="תזכורות ARC Memory (אופציונלי)">');
  assert.ok(fieldIndex >= 0);
  const fieldBody = taskEditorScreen.slice(fieldIndex, fieldIndex + 1200);
  assert.ok(fieldBody.includes("memoryExercises.map((exercise)"));
  assert.ok(fieldBody.includes("draft.linkedArcGymMemoryExerciseIds.includes(exercise.id)"));
  assert.ok(fieldBody.includes("linkedArcGymMemoryExerciseIds: linked"));
});

test("build/TaskEditorScreen.tsx recomputes the ARC-Memory reminder on every save/archive/override path -- handleSave, handleOverrideSave, and handleArchive each call recomputeTaskMemoryReminderNotification", () => {
  assert.ok(taskEditorScreen.includes('import { recomputeTaskMemoryReminderNotification } from "../data/taskMemoryReminderNotification.ts";'));
  const occurrences = taskEditorScreen.split("await recomputeTaskMemoryReminderNotification(new Date());").length - 1;
  assert.equal(occurrences, 3, "handleOverrideSave, handleSave, and handleArchive must each recompute the reminder");
});

test("live/ActiveTaskScreen.tsx's performStart re-arms the ARC-Memory reminder on every start, OR displays it immediately for a To-Do task with no scheduledTime (since no '5 minutes before' moment can ever be resolved for it)", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 2000);
  assert.ok(fnBody.includes('if (task.isTodoItem && !task.scheduledTime && task.linkedArcGymMemoryExerciseIds.length > 0) {'));
  assert.ok(fnBody.includes("void displayTaskMemoryReminderForTask(task.id);"));
  assert.ok(fnBody.includes("void recomputeTaskMemoryReminderNotification();"));
});

test("live/ActiveTaskScreen.tsx's handleComplete re-arms the ARC-Memory reminder paired with each of its two recomputeTaskNotStartedNotification call sites -- a completed task is no longer upcoming, so the next qualifying one must be armed fresh", () => {
  const pairedOccurrences = activeTaskScreen.split("await recomputeTaskNotStartedNotification();\n    await recomputeTaskMemoryReminderNotification();").length - 1;
  assert.equal(pairedOccurrences, 2, "both handleComplete-area call sites must be paired");
});

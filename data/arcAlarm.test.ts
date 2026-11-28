import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/arcAlarm.test.ts
 *
 * ARC alarm task ("הוספת שעון מעורר לתרגילי ARC מתוכננים"): source-text
 * regression guard for the planned-ARC/Mini-ARC exercise alarm, which
 * lives inside data/taskAlarm.ts itself (the one shared notifee
 * channel/foreground-service/event-router, extended with a 4th alarm
 * "kind" -- never a second, parallel native mechanism). Same
 * constraint as data/taskAlarm.test.ts: depends on the real
 * @notifee/react-native module, so this checks the real source text
 * instead of invoking it. The pure "when" date math is unchanged and
 * fully exercised in arc/plannedArcAlarm.test.ts and
 * arc/taskScheduledStart.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskAlarm.ts");
const layout = readSource("app/_layout.tsx");
const alarmScreen = readSource("live/ArcAlarmScreen.tsx");
const alarmRoute = readSource("app/planned-arcs/[id]/alarm.tsx");
const editorScreen = readSource("build/PlannedArcEditorScreen.tsx");
const listScreen = readSource("build/PlannedArcListScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");
const diagnosticsScreen = readSource("build/TaskAlarmDiagnosticsScreen.tsx");

test("every ARC alarm notification uses the SAME deterministic id for a given planned ARC -- arming one that already has an alarm structurally replaces it, never creating a second (requirement 7: 'אין הפעלה כפולה לאותו אירוע תרגול')", () => {
  assert.match(module_, /const ARC_ALARM_ID_PREFIX = "arc-alarm-";/);
  assert.match(module_, /function arcAlarmNotificationId\(plannedArcId: string\): string \{\s*return `\$\{ARC_ALARM_ID_PREFIX\}\$\{plannedArcId\}`;/);
});

test("armPlannedArcAlarm always cancels any existing alarm for the item FIRST, before creating the new trigger notification", () => {
  const fnIndex = module_.indexOf("export async function armPlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await cancelAnyArcAlarmFor(item.id);"));
  const cancelIndex = fnBody.indexOf("cancelAnyArcAlarmFor");
  const createIndex = module_.indexOf("await notifee.createTriggerNotification", fnIndex);
  assert.ok(cancelIndex !== -1 && createIndex !== -1 && fnIndex + cancelIndex < createIndex);
});

test("the ARC alarm reuses the exact same real-alarm mechanism as the task alarm -- buildAlarmAndroidConfig, the alarm-clock trigger -- never a parallel/simplified one", () => {
  const fnIndex = module_.indexOf("export async function armPlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1500);
  assert.ok(fnBody.includes("await ensureNotifeePermissionAsync();"));
  assert.ok(fnBody.includes("await ensureTaskAlarmChannelAsync();"));
  assert.ok(fnBody.includes("android: buildAlarmAndroidConfig("));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK }"));
});

test("requirement 5: all three required buttons are present with their own distinct action ids, and the title carries the exercise's own name", () => {
  const fnIndex = module_.indexOf("export async function armPlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("body: item.name,"));
  assert.ok(fnBody.includes('{ title: "התחל ARC", pressAction: { id: ACTION_START_ARC } }'));
  assert.ok(fnBody.includes("{ title: `נודניק ${SNOOZE_MINUTES} דקות`, pressAction: { id: ACTION_SNOOZE_ARC } }"));
  assert.ok(fnBody.includes('{ title: "סגור", pressAction: { id: ACTION_CLOSE_ARC } }'));
});

test("armPlannedArcAlarm never throws -- a failed native call is caught and returns the item with both notification fields cleared, the same honest-failure contract as armTaskAlarm", () => {
  const fnIndex = module_.indexOf("export async function armPlannedArcAlarm");
  const nextFnIndex = module_.indexOf("export async function disarmPlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, nextFnIndex);
  assert.ok(fnBody.includes("} catch (error) {"));
  assert.ok(fnBody.includes("return { ...item, arcAlarmNotificationId: null, arcAlarmScheduledFor: null };"));
});

test("disarmPlannedArcAlarm only ever clears the two notification-bookkeeping fields -- never arcAlarmEnabled/arcAlarmTimingKind/arcAlarmTime/arcAlarmDate/arcAlarmRecurrence (requirement 7: 'ביטול שעון מעורר מבטל את ההתראה בלבד ולא מוחק את תרגיל ARC')", () => {
  const fnIndex = module_.indexOf("export async function disarmPlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("return { ...item, arcAlarmNotificationId: null, arcAlarmScheduledFor: null };"));
});

test("schedulePlannedArcAlarm resolves the next occurrence via resolveNextPlannedArcAlarmOccurrence -- the one pure source of truth -- and disarms (never arms a bogus date) when nothing qualifies", () => {
  const fnIndex = module_.indexOf("export async function schedulePlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("resolveNextPlannedArcAlarmOccurrence(item, linkedTask, now)"));
  assert.ok(fnBody.includes("if (!nextOccurrence) return disarmPlannedArcAlarm(item);"));
});

test("turnOffPlannedArcAlarm ('סגור') never re-arms anything itself -- relies on resolveNextPlannedArcAlarmOccurrence's own 'strictly after now' rule so the next reconcile only ever lands on a LATER occurrence, never this same one -- and persists via upsertPlannedArc", () => {
  const fnIndex = module_.indexOf("export async function turnOffPlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("const cleared = await disarmPlannedArcAlarm(item);"));
  assert.ok(fnBody.includes("await upsertPlannedArc(cleared);"));
  assert.ok(!/(?<!dis)armPlannedArcAlarm\(/.test(fnBody), "turning off must never itself arm a new alarm");
});

test("snoozePlannedArcAlarm ('נודניק 5 דקות') arms exactly ONE fresh alarm 5 minutes later -- an ad-hoc override, never routed through resolveNextPlannedArcAlarmOccurrence, so the fixed practice time/future recurrence are never touched", () => {
  const fnIndex = module_.indexOf("export async function snoozePlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("SNOOZE_MINUTES * 60 * 1000"));
  assert.ok(fnBody.includes("armPlannedArcAlarm(item, snoozedFireAt)"));
  assert.ok(!fnBody.includes("resolveNextPlannedArcAlarmOccurrence"));
});

test("reconcilePlannedArcAlarms resolves every item's own next occurrence via the shared pure function, loads tasks once to resolve each item's own linkedTaskId, and persists with ONE batched savePlannedArcs call -- never one write per item", () => {
  const fnIndex = module_.indexOf("export async function reconcilePlannedArcAlarms");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("Promise.all([loadPlannedArcs(), loadTasks(), loadTaskOccurrenceOverrides()])"));
  assert.ok(fnBody.includes("resolveNextPlannedArcAlarmOccurrence(item, linkedTask, now, overrides)"));
  assert.ok(fnBody.includes("await savePlannedArcs(reconciled);"));
  assert.equal(fnBody.split("savePlannedArcs(").length - 1, 1, "must save exactly once for the whole batch");
});

test("reconcilePlannedArcAlarms's own 'already in sync' check requires isNativeArcAlarmId, not just 'non-null' -- the same fix reconcileTaskAlarms already applies for stale/foreign ids", () => {
  const fnIndex = module_.indexOf("export async function reconcilePlannedArcAlarms");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("isNativeArcAlarmId(item.arcAlarmNotificationId)"));
});

test("pauseActiveTaskTimerIfAny only ever pauses the main 'task' kind run, never a 'rest' sub-timer, and is a no-op when already paused or nothing is running -- section 6's own 'ARC ייפתח כתרגול עצמאי when nothing active' requirement", () => {
  const fnIndex = module_.indexOf("async function pauseActiveTaskTimerIfAny");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('if (!run || run.kind !== "task" || run.pausedAt !== null) return;'));
  assert.ok(fnBody.includes("pauseTaskTimerRun(run, now.toISOString())"));
  assert.ok(fnBody.includes("pauseTaskRecord(task, now.toISOString())"), "must pause the Task record too, mirroring ActiveTaskScreen's own handlePause");
});

test("handlePlannedArcAlarmAction's 'Start ARC' turns off this alarm, pauses any active task timer BEFORE navigating, and opens the exact saved exercise via plannedArcId -- never a new spontaneous session, never the generic ARC-window chooser", () => {
  const fnIndex = module_.indexOf("export async function handlePlannedArcAlarmAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  const startIndex = fnBody.indexOf("if (actionId === ACTION_START_ARC) {");
  const startBody = fnBody.slice(startIndex, fnBody.indexOf("if (actionId === ACTION_SNOOZE_ARC)"));
  assert.ok(startBody.includes("await turnOffPlannedArcAlarm(item);"));
  assert.ok(startBody.includes("await pauseActiveTaskTimerIfAny(new Date());"));
  const pauseIndex = startBody.indexOf("pauseActiveTaskTimerIfAny");
  const navIndex = startBody.indexOf("router.push(");
  assert.ok(pauseIndex !== -1 && navIndex !== -1 && pauseIndex < navIndex, "the timer must be paused BEFORE navigating to the ARC exercise");
  assert.ok(startBody.includes('pathname: "/tasks/[id]/arc"'));
  assert.ok(startBody.includes("plannedArcId: item.id"));
  assert.ok(startBody.includes("id: item.linkedTaskId ?? STANDALONE_ARC_TASK_ID"));
  assert.ok(!startBody.includes("spontaneous"), "Start ARC must never open a new spontaneous session");
});

test("handlePlannedArcAlarmAction's snooze/close branches call snoozePlannedArcAlarm/turnOffPlannedArcAlarm respectively, and every action stops the ring first", () => {
  const fnIndex = module_.indexOf("export async function handlePlannedArcAlarmAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("stopRinging();"));
  assert.ok(fnBody.includes("endForegroundServiceForId(arcAlarmNotificationId(plannedArcId));"));
  assert.ok(fnBody.includes("if (actionId === ACTION_SNOOZE_ARC) {"));
  assert.ok(fnBody.includes("await snoozePlannedArcAlarm(item);"));
  assert.ok(fnBody.includes("if (actionId === ACTION_CLOSE_ARC) {"));
});

test("the foreground-service handler gives the ARC alarm the SAME 2-minute ring cap as the task alarm (not a different/shorter one), and its automatic cutoff turns off via turnOffPlannedArcAlarmById -- the exact same path the trainee's own 'סגור' button uses", () => {
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (8700 -> 9900 -> 11200 -> 12300): ARCHI -- Replan
  // Time task's own isReplanTimeArm declaration/comment and early-return
  // branch, then ARCHI -- Rolling Dynamic Planning task's own
  // isDynamicPlanningArm declaration/comment and early-return branch,
  // both inserted earlier in the function, pushed this branch's own
  // offset further from fnIndex than before -- same function, same content.
  const fnBody = module_.slice(fnIndex, fnIndex + 12300);
  assert.ok(fnBody.includes('const isArcAlarm = notification.data?.kind === "arcAlarm";'));
  assert.ok(fnBody.includes("if (isArcAlarm) {"));
  const branchIndex = fnBody.indexOf("if (isArcAlarm) {", fnBody.indexOf("setTimeout(async () => {"));
  assert.ok(branchIndex !== -1);
  const branchBody = fnBody.slice(branchIndex, branchIndex + 200);
  assert.ok(branchBody.includes("await turnOffPlannedArcAlarmById(plannedArcId);"));
});

test("handleTaskAlarmEvent dispatches an ARC alarm's ACTION_PRESS to handlePlannedArcAlarmAction, and a plain PRESS to the ARC alarm's own full-screen route, before falling through to any task-alarm handling", () => {
  const fnIndex = module_.indexOf("export async function handleTaskAlarmEvent");
  const nextKindIndex = module_.indexOf('if (data.kind === "taskAlarmTest")', fnIndex);
  const fnBody = module_.slice(fnIndex, nextKindIndex);
  assert.ok(fnBody.includes('if (data.kind === "arcAlarm") {'));
  assert.ok(fnBody.includes("await handlePlannedArcAlarmAction(event.detail.pressAction.id, plannedArcId);"));
  assert.ok(fnBody.includes('router.push({ pathname: "/planned-arcs/[id]/alarm", params: { id: plannedArcId } });'));
});

// --- Registration / routing -------------------------------------------

test("app/_layout.tsx registers the planned-ARC alarm route as a full-screen route, exact mirror of tasks/[id]/alarm", () => {
  assert.match(layout, /<Stack\.Screen name="planned-arcs\/\[id\]\/alarm" options=\{\{ title: "שעון מעורר", headerShown: false \}\} \/>/);
});

test("live/ArcAlarmScreen.tsx's three buttons call handlePlannedArcAlarmAction with the exact action ids armPlannedArcAlarm wires into the notification", () => {
  assert.match(alarmScreen, /import\s*\{\s*handlePlannedArcAlarmAction\s*\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  assert.ok(alarmScreen.includes('press("start_arc")'));
  assert.ok(alarmScreen.includes('press("snooze_arc")'));
  assert.ok(alarmScreen.includes('press("close_arc")'));
});

test("the planned-ARC alarm route passes the id param straight through as plannedArcId", () => {
  assert.match(alarmRoute, /from ["']\.\.\/\.\.\/\.\.\/live\/ArcAlarmScreen\.tsx["']/);
  assert.ok(alarmRoute.includes("ArcAlarmScreen plannedArcId={id}"));
});

// --- Editor screen: "שעון מעורר לתרגול" section -------------------------

test("build/PlannedArcEditorScreen.tsx's alarm toggle defaults to off and every change re-syncs the real native alarm via schedulePlannedArcAlarm, never just a local state update", () => {
  assert.match(editorScreen, /import\s*\{[\s\S]*?disarmPlannedArcAlarm[\s\S]*?schedulePlannedArcAlarm[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const fnIndex = editorScreen.indexOf("async function persistAlarm");
  const fnBody = editorScreen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await schedulePlannedArcAlarm(next, next.linkedTaskId ? linkedTask : null, new Date());"));
  assert.ok(fnBody.includes("await upsertPlannedArc("));
});

test("the 'before_task' timing choice is only ever offered when canUseBeforeTaskAlarmTiming(item) is true -- never selectable for a standalone-origin draft with no linked task", () => {
  assert.ok(editorScreen.includes("{canUseBeforeTaskAlarmTiming(item) && ("));
  const sectionIndex = editorScreen.indexOf('onPress={() => persistAlarm({ ...item, arcAlarmTimingKind: "before_task" })}');
  assert.ok(sectionIndex !== -1);
});

test("deleting a planned ARC disarms its alarm FIRST, before removing the record itself -- never an orphaned native alarm pointing at a deleted exercise", () => {
  const fnIndex = editorScreen.indexOf("onPress={async () => {\n            await disarmPlannedArcAlarm(item);");
  assert.ok(fnIndex !== -1);
  const fnBody = editorScreen.slice(fnIndex, fnIndex + 200);
  const disarmIndex = fnBody.indexOf("disarmPlannedArcAlarm(item)");
  const deleteIndex = fnBody.indexOf("deletePlannedArc(item.id)");
  assert.ok(disarmIndex !== -1 && deleteIndex !== -1 && disarmIndex < deleteIndex);
});

// --- List screen: alarm badge (requirement 8) ---------------------------

test("the list screen shows the alarm badge only when arcAlarmEnabled, using the same shared resolveNextPlannedArcAlarmOccurrence and a recurrence/before-task indication -- never a bare, context-less time", () => {
  assert.match(listScreen, /import\s*\{\s*resolveNextPlannedArcAlarmOccurrence\s*\}\s*from\s*["']\.\.\/arc\/plannedArcAlarm\.ts["']/);
  assert.ok(listScreen.includes("item.arcAlarmEnabled &&"));
  assert.ok(listScreen.includes("resolveNextPlannedArcAlarmOccurrence(item, linkedTask, new Date())"));
  assert.ok(listScreen.includes("describeAlarmRecurrence(item)"));
});

// --- Reconciliation wiring (requirement 7) -------------------------------

test("TodayScreen reconciles planned-ARC alarms alongside task alarms on every focus, the same lazy reconcile-on-touch pattern", () => {
  assert.match(todayScreen, /import\s*\{\s*reconcilePlannedArcAlarms,\s*reconcileTaskAlarms\s*\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  assert.ok(todayScreen.includes("Promise.all([reconcileTaskAlarms(), reconcilePlannedArcAlarms(), loadTaskOccurrenceCompletions(), loadTaskOccurrenceOverrides(), loadTaskTimerRun()])"));
});

test("TaskEditorScreen reconciles planned-ARC alarms immediately after both saving a task's new schedule and archiving it -- a 'before_task' alarm linked to this task must never wait for Today's own next focus", () => {
  assert.match(taskEditorScreen, /import\s*\{\s*cancelAnyAlarmFor,\s*reconcilePlannedArcAlarms,\s*scheduleTaskAlarm\s*\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const saveFnIndex = taskEditorScreen.indexOf("async function handleSave()");
  const saveFnBody = taskEditorScreen.slice(saveFnIndex, taskEditorScreen.indexOf("async function handleArchive()"));
  assert.ok(saveFnBody.includes("await reconcilePlannedArcAlarms(new Date());"));
  const archiveFnIndex = taskEditorScreen.indexOf("async function handleArchive()");
  const archiveFnBody = taskEditorScreen.slice(archiveFnIndex, archiveFnIndex + 1000);
  assert.ok(archiveFnBody.includes("await reconcilePlannedArcAlarms(new Date());"));
});

// --- ARC alarm diagnostics task ("שעון ARC שאינו מצלצל") -------------------
// Root-cause investigation found no wiring difference between the task
// and ARC native scheduling calls themselves -- this section adds the
// exact diagnostic surface the spec's own section 2 asks for (so a real
// device can pinpoint whichever step actually fails) plus the real
// 2-minutes-out test from section 5, and fixes two concrete bugs found
// along the way: a keystroke-level race in the editor's own time/date
// inputs, and (for completeness/documentation) the Android 12+ exact-
// alarm permission surfaced even though every alarm here uses
// SET_ALARM_CLOCK, which Android itself exempts from that restriction.

test("isArcAlarmRegisteredWithOs checks notifee's own getTriggerNotificationIds -- the OS's own bookkeeping, never this app's own stored field -- and never throws", () => {
  const fnIndex = module_.indexOf("export async function isArcAlarmRegisteredWithOs");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await notifee.getTriggerNotificationIds();"));
  assert.ok(fnBody.includes("ids.includes(arcAlarmNotificationId(plannedArcId));"));
  assert.ok(fnBody.includes("} catch {"));
});

test("getExactAlarmPermissionStatus reads notifee's own getNotificationSettings().android.alarm, falling back to NOT_SUPPORTED (never throwing) on any native error", () => {
  const fnIndex = module_.indexOf("export async function getExactAlarmPermissionStatus");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("const settings = await notifee.getNotificationSettings();"));
  assert.ok(fnBody.includes("return settings.android.alarm;"));
  assert.ok(fnBody.includes("return AndroidNotificationSetting.NOT_SUPPORTED;"));
});

test("diagnosePlannedArcAlarm reuses the exact same resolveNextPlannedArcAlarmOccurrence every real scheduling call uses -- never a second 'when' calculation just for display", () => {
  const fnIndex = module_.indexOf("export async function diagnosePlannedArcAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("resolveNextPlannedArcAlarmOccurrence(item, linkedTask, now)"));
  assert.ok(fnBody.includes("isArcAlarmRegisteredWithOs(item.id)"));
  assert.ok(fnBody.includes("getExactAlarmPermissionStatus()"));
});

test("diagnoseAllPlannedArcAlarms only reports alarm-ENABLED items, and loads tasks once for the whole batch -- same discipline as reconcilePlannedArcAlarms, never one task-list load per item", () => {
  const fnIndex = module_.indexOf("export async function diagnoseAllPlannedArcAlarms");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("Promise.all([loadPlannedArcs(), loadTasks()])"));
  assert.ok(fnBody.includes("items.filter((item) => item.arcAlarmEnabled)"));
});

test("armRealPlannedArcAlarmTest's 'before_task' case creates and saves a REAL task with arcWindowMinutesBefore=0 at exactly 2 minutes out, so the before-task timing's own 'when' is entirely the task's, never computed a second way for the test", () => {
  const fnIndex = module_.indexOf("export async function armRealPlannedArcAlarmTest");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes("const fireAt = new Date(now.getTime() + 2 * 60 * 1000);"));
  assert.ok(fnBody.includes('if (kind === "before_task") {'));
  assert.ok(fnBody.includes("arcWindowMinutesBefore: 0,"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
  assert.ok(fnBody.includes('arcAlarmTimingKind: "before_task"'));
});

test("armRealPlannedArcAlarmTest's standalone/mini cases set a real standalone time+date 2 minutes out, with a one-time recurrence", () => {
  const fnIndex = module_.indexOf("export async function armRealPlannedArcAlarmTest");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes('arcAlarmTimingKind: "standalone", arcAlarmTime: fireAtClock, arcAlarmDate: todayLocalDateString(fireAt), arcAlarmRecurrence: { kind: "once" }'));
});

test("armRealPlannedArcAlarmTest arms through the EXACT SAME schedulePlannedArcAlarm every ordinary editor save uses -- never a parallel/simplified scheduling path -- and distinguishes a failed arm (no notificationId, no thrown exception) from a genuine success before checking OS registration", () => {
  const fnIndex = module_.indexOf("export async function armRealPlannedArcAlarmTest");
  const nextFnIndex = module_.indexOf("export async function refreshArcAlarmRealTestStatus");
  const fnBody = module_.slice(fnIndex, nextFnIndex);
  assert.ok(fnBody.includes("const scheduled = await schedulePlannedArcAlarm(item, linkedTask, now);"));
  assert.ok(fnBody.includes("if (!scheduled.arcAlarmNotificationId) {"));
  assert.ok(fnBody.includes("result.registeredWithOsAfterArm = await isArcAlarmRegisteredWithOs(item.id);"));
  assert.ok(fnBody.includes("} catch (error) {"));
  assert.ok(fnBody.includes("await saveArcAlarmRealTestResult(result);"));
});

test("refreshArcAlarmRealTestStatus re-checks OS registration without re-arming anything -- exact mirror of refreshRealTaskAlarmTestStatus", () => {
  const fnIndex = module_.indexOf("export async function refreshArcAlarmRealTestStatus");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const registeredNow = await isArcAlarmRegisteredWithOs(existing.plannedArcId);"));
  assert.ok(!fnBody.includes("armPlannedArcAlarm(") && !fnBody.includes("schedulePlannedArcAlarm("));
});

test("recordRealArcAlarmFiredIfTracked checks all three tracked kinds (standalone/before_task/mini) and only updates the one whose own plannedArcId matches -- never touching an unrelated ARC alarm's own test record", () => {
  const fnIndex = module_.indexOf("async function recordRealArcAlarmFiredIfTracked");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('["standalone", "before_task", "mini"] as const'));
  assert.ok(fnBody.includes("existing.plannedArcId === plannedArcId"));
});

// --- Bug fix: the editor's time/date inputs no longer arm on every keystroke ---

test("the standalone time input commits via onBlur, not onChangeText -- onChangeText only updates a local draft, never calling persistAlarm (a real native arm/cancel round-trip) on every character", () => {
  const timeInputIndex = editorScreen.indexOf('placeholder="09:30"');
  const timeInputBlock = editorScreen.slice(editorScreen.lastIndexOf("<TextInput", timeInputIndex), timeInputIndex);
  assert.ok(timeInputBlock.includes("onChangeText={setTimeDraft}"));
  assert.ok(!timeInputBlock.includes("onChangeText={(value) => persistAlarm("), "must never call the real native scheduling function on every keystroke");
  assert.ok(timeInputBlock.includes("onBlur={() => {"));
  assert.ok(timeInputBlock.includes('persistAlarm({ ...item, arcAlarmTimingKind: "standalone", arcAlarmTime: value });'));
});

test("the standalone date input follows the exact same draft+onBlur-commit pattern as the time input", () => {
  const dateInputIndex = editorScreen.indexOf('placeholder="2026-01-07"');
  const dateInputBlock = editorScreen.slice(editorScreen.lastIndexOf("<TextInput", dateInputIndex), dateInputIndex);
  assert.ok(dateInputBlock.includes("onChangeText={setDateDraft}"));
  assert.ok(!dateInputBlock.includes("onChangeText={(value) => persistAlarm("));
  assert.ok(dateInputBlock.includes("onBlur={() => {"));
});

test("the editor shows a LIVE, re-checked-on-change confirmation of whether the stored notification id is actually registered with the OS -- never just assuming success because a field got saved", () => {
  assert.match(editorScreen, /import\s*\{[\s\S]*?isArcAlarmRegisteredWithOs[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const effectIndex = editorScreen.indexOf("useEffect(() => {");
  const effectBody = editorScreen.slice(effectIndex, effectIndex + 400);
  assert.ok(effectBody.includes("isArcAlarmRegisteredWithOs(item.id).then(setRegisteredWithOs);"));
  assert.ok(effectBody.includes("[item?.id, item?.arcAlarmNotificationId]"));
});

// --- Diagnostics screen: ARC alarm section (sections 2 + 5) ---------------

test("the diagnostics screen loads live ARC-alarm diagnostics and the exact-alarm permission on every focus, and re-checks (never re-arms) any already-tracked real test for all three kinds", () => {
  assert.match(diagnosticsScreen, /import\s*\{[\s\S]*?diagnoseAllPlannedArcAlarms[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const reloadIndex = diagnosticsScreen.indexOf("const reload = useCallback(() => {");
  const reloadBody = diagnosticsScreen.slice(reloadIndex, diagnosticsScreen.indexOf("}, []);", reloadIndex));
  assert.ok(reloadBody.includes("getExactAlarmPermissionStatus().then(setExactAlarmPermission);"));
  assert.ok(reloadBody.includes("diagnoseAllPlannedArcAlarms().then(setArcDiagnostics);"));
  assert.ok(reloadBody.includes('for (const kind of ["standalone", "before_task", "mini"] as const) {'));
  assert.ok(reloadBody.includes("refreshArcAlarmRealTestStatus(kind)"));
});

test("three separate test buttons exist, one per kind, each calling armRealPlannedArcAlarmTest with its own kind -- section 5's explicit 'test standalone, before-task, AND Mini separately'", () => {
  assert.ok(diagnosticsScreen.includes("async function startArcTest(kind: ArcAlarmTestKind)"));
  const fnIndex = diagnosticsScreen.indexOf("async function startArcTest(kind: ArcAlarmTestKind)");
  const fnBody = diagnosticsScreen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await armRealPlannedArcAlarmTest(kind);"));
  assert.ok(diagnosticsScreen.includes('(["standalone", "before_task", "mini"] as const).map((kind) => {'));
});

test("the exact-alarm permission row shows a real settings-opening button only when the permission is actually DISABLED, and opens the dedicated exact-alarm settings screen -- NEVER the unrelated OEM power-manager screen the Xiaomi section above uses", () => {
  const rowIndex = diagnosticsScreen.indexOf("הרשאת Exact Alarm");
  const rowBlock = diagnosticsScreen.slice(rowIndex, rowIndex + 600);
  assert.ok(rowBlock.includes("exactAlarmPermission === AndroidNotificationSetting.DISABLED"));
  assert.ok(rowBlock.includes("onPress={() => openExactAlarmPermissionSettings()}"));
  assert.ok(!rowBlock.includes("openAlarmPowerManagerSettings()"), "must never open the OEM battery/background screen for this specific permission");
});

test("openExactAlarmPermissionSettings wraps notifee's own openAlarmPermissionSettings (the Android 12+ 'Alarms & reminders' screen) -- a DIFFERENT API from openAlarmPowerManagerSettings's openPowerManagerSettings -- and never throws", () => {
  const fnIndex = module_.indexOf("export async function openExactAlarmPermissionSettings");
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("await notifee.openAlarmPermissionSettings();"));
  assert.ok(fnBody.includes("} catch {"));
});

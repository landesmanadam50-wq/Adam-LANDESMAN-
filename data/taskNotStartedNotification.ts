/**
 * data/taskNotStartedNotification.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * section 2: the persistent, outside-the-app notification that fires
 * when a Flexible-Daily-Schedule task's own start time arrives and
 * nothing was actually started for it. Built as a direct structural
 * copy of data/taskTransitionNotification.ts (ONE stable, never-
 * regenerated notification id -- update in place, never a duplicate --
 * a settings-gated recompute function, a persisted state record, one
 * handler dispatched from data/taskAlarm.ts's own shared
 * handleTaskAlarmEvent), with ONE structural difference: because this
 * notification must fire at an EXACT future moment even if the app is
 * closed (never only the next time some other code happens to call
 * recompute), it is armed as a real notifee TriggerNotification for
 * that moment -- a direct SIBLING of data/taskAlarm.ts's own ARC-alarm
 * section (its own id, its own data.kind, its own channel), reusing
 * only the generic shared primitives every alarm kind already relies
 * on (ensureNotifeePermissionAsync, the SILENT_DELIVERY_CHANNEL_ID
 * startForeground() placeholder, ALARM_FOREGROUND_SERVICE_TYPES, the
 * one registered foreground service and the one onBackgroundEvent/
 * onForegroundEvent router already wired in app/_layout.tsx) -- never
 * merging into, or touching, the existing loud task-start alarm ring
 * (TASK_ALARM_CHANNEL_ID) itself.
 *
 * The one pure predicate behind every decision here,
 * arc/taskNotStartedAlert.ts's resolveTaskNotStartedAlert, already
 * encodes "nothing genuinely running for this exact task" correctly
 * (built on arc/dailyPlan.ts's own resolveCurrentTaskState, the one
 * central current/next decision every other consumer in this codebase
 * shares) -- this module adds NO second busy-check of its own, and the
 * Flexible Daily Schedule (resolveTodaysScheduledPlan, never the raw
 * weekly routine) is the single source of truth it's built on.
 *
 * "Never repeat the alert sound" on a redisplay for the SAME still-due
 * task is enforced structurally via `onlyAlertOnce: true` (the exact
 * same primitive data/floatingTimerOverlay.ts's own ongoing
 * notification already relies on for its own per-second updates),
 * never by manually tracking "was this already alerted" to suppress a
 * second sound call. "Never leave a stale notification once the next
 * task arrives" and "update/remove itself if the user starts another
 * way" both fall out of recomputeTaskNotStartedNotification's own
 * unconditional cancel-or-display branch, called from every mutation
 * site the spec names (task add/remove/reorder, performStart,
 * handleComplete, the AppState resync effect) exactly as
 * data/taskTransitionNotification.ts already is. The ONE re-arm, on
 * every such call, for whichever not-yet-started entry is now
 * genuinely next (never a fixed polling interval) is what gets this
 * notification to fire even while the app stays closed/backgrounded
 * the entire time in between.
 */

import notifee, { AlarmType, EventType, TriggerType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import { resolveCurrentTaskState } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { formatMinutesToClockTime } from "../arc/dailyRoutine.ts";
import { resolveFreeTimeWindowKey, resolveFreeTimeWindows, resolveFreeTimeWindowsAfter } from "../arc/freeTimeWindow.ts";
import type { FreeTimeWindow } from "../arc/freeTimeWindow.ts";
import { selectPositiveMemoryForTaskSuccess } from "../arc/positiveMemorySelection.ts";
import { recordPositiveMemorySelection } from "../arc/positiveMemorySelectionHistory.ts";
import { resolveTaskNotStartedAlert } from "../arc/taskNotStartedAlert.ts";
import { markTaskOccurrenceRemoved } from "../arc/taskOccurrenceOverride.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { resolveTodaysScheduledPlan } from "./dailyPlan.ts";
import { ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureTaskNotStartedChannelAsync, SILENT_DELIVERY_CHANNEL_ID, TASK_NOT_STARTED_CHANNEL_ID } from "./alarmChannel.ts";
import {
  deleteTask,
  loadArcTaskReminderSettings,
  loadPositiveMemories,
  loadPositiveMemorySelectionHistory,
  loadTaskNotStartedNotificationState,
  loadTaskOccurrenceOverrides,
  loadTaskTimerRun,
  saveTaskNotStartedNotificationState,
  savePositiveMemorySelectionHistory,
  clearTaskNotStartedNotificationState,
  upsertTaskOccurrenceOverrideEntry,
} from "./storage.ts";

const TASK_NOT_STARTED_NOTIFICATION_ID = "archi-task-not-started-notification";
const TASK_NOT_STARTED_ARM_ID = "archi-task-not-started-arm";
const TASK_NOT_STARTED_BODY = "האם אתה צריך פעולה תומכת?";
const SUCCESS_MOMENT_HEADING = "זוכר שהצלחת?";

const ACTION_NOT_STARTED_SUPPORT = "task_not_started_support";
const ACTION_NOT_STARTED_START = "task_not_started_start";
const ACTION_NOT_STARTED_SHORTEN = "task_not_started_shorten";
const ACTION_NOT_STARTED_FINISH_OR_GIVE_UP = "task_not_started_finish_or_give_up";

/** `effectiveStartTime` is always a plain "HH:MM" clock time FOR TODAY (applyScheduleMode's own output, resolved from `now`'s own date) -- never a second date-parsing convention. */
function resolveEntryStartDate(entry: ScheduledPlanEntry, now: Date): Date | null {
  if (!entry.effectiveStartTime) return null;
  const [hoursText, minutesText] = entry.effectiveStartTime.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

async function cancelArmedTaskNotStartedAlarm(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(TASK_NOT_STARTED_ARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Arms (or re-arms, replacing any previous one) the native trigger for
 * whichever entry resolveCurrentTaskState's own `next` field reports --
 * the SAME single "what's genuinely next" pick every other consumer in
 * this codebase shares, never a second, independently-sorted "what's
 * upcoming" scan -- so this notification can fire even while the app
 * stays closed. A no-op (and a clean cancel) once nothing today still
 * qualifies (every task started/completed/removed, or the day is over).
 */
async function armNextTaskNotStartedAlarm(scheduled: ScheduledPlanEntry[], now: Date, activeRun: TaskTimerRun | null): Promise<void> {
  await cancelArmedTaskNotStartedAlarm();
  const { next } = resolveCurrentTaskState(scheduled, now, activeRun, null);
  if (!next) return;
  const fireAt = resolveEntryStartDate(next, now);
  if (!fireAt || fireAt.getTime() <= now.getTime()) return;

  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: TASK_NOT_STARTED_ARM_ID,
        title: next.task.title,
        body: TASK_NOT_STARTED_BODY,
        data: { kind: "taskNotStartedArm" },
        android: {
          channelId: SILENT_DELIVERY_CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,
          pressAction: { id: "default" },
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
  } catch (error) {
    console.error("armNextTaskNotStartedAlarm failed", error);
  }
}

/**
 * ARCHI -- Extend Task-Not-Started Notification task, requirement 3:
 * "זוכר שהצלחת?" -- surfaces a relevant PAST SUCCESS for this exact
 * task through the SAME automatic-selection engine ARC Success already
 * uses (selectPositiveMemoryForTaskSuccess, arc/positiveMemorySelection.ts)
 * -- never a second, separately-authored memory picker, and never a
 * fabricated success when nothing documented actually matches (returns
 * null, leaving the notification body exactly as before). Recording the
 * pick into the SAME "arc_success"/taskId selection-history scope ARC
 * Success itself uses gives this surface the identical "avoid repeating
 * the same memory" variety behavior for free.
 */
async function resolveTaskNotStartedSuccessMomentText(taskId: string, now: Date): Promise<string | null> {
  const [memories, history] = await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);
  const memory = selectPositiveMemoryForTaskSuccess(memories, taskId, {}, history, []);
  if (!memory) return null;
  const updatedHistory = recordPositiveMemorySelection(history, memory.id, "arc_success", taskId, now.toISOString());
  await savePositiveMemorySelectionHistory(updatedHistory);
  return memory.successDescription?.trim() || memory.title.trim() || memory.whatWasSpecial.trim() || null;
}

/**
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
 * section 2: "יש לך חלון זמן פנוי בשעה HH:MM. להעביר את המשימה לשם?" --
 * a THIRD optional body block, appended after the existing two
 * (TASK_NOT_STARTED_BODY, then the success-moment block), never a 4th
 * notification button (Android's 3-action cap, and the user's own
 * explicit instruction). `moveWindow` is null whenever no later-today
 * window qualifies -- the body is then byte-identical to before this
 * task.
 */
function resolveMoveSuggestionBodyLine(moveWindow: FreeTimeWindow | null): string | null {
  if (!moveWindow) return null;
  return `יש לך חלון זמן פנוי בשעה ${formatMinutesToClockTime(moveWindow.startMinutes)}. להעביר את המשימה לשם?`;
}

async function displayTaskNotStartedNotification(entry: ScheduledPlanEntry, moveWindow: FreeTimeWindow | null, now: Date): Promise<void> {
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    const successMomentText = await resolveTaskNotStartedSuccessMomentText(entry.task.id, now);
    const bodyParts = [TASK_NOT_STARTED_BODY];
    if (successMomentText) bodyParts.push(`${SUCCESS_MOMENT_HEADING}\n${successMomentText}`);
    const moveSuggestionLine = resolveMoveSuggestionBodyLine(moveWindow);
    if (moveSuggestionLine) bodyParts.push(moveSuggestionLine);
    const body = bodyParts.join("\n\n");
    const moveSuggestionWindowKey = moveWindow ? resolveFreeTimeWindowKey(todayLocalDateString(now), moveWindow) : null;
    await notifee.displayNotification({
      id: TASK_NOT_STARTED_NOTIFICATION_ID,
      title: entry.task.title,
      body,
      data: { kind: "taskNotStarted", taskId: entry.task.id },
      android: {
        channelId: TASK_NOT_STARTED_CHANNEL_ID,
        onlyAlertOnce: true,
        autoCancel: false,
        pressAction: { id: "default" },
        actions: [
          { title: "התחל משימה", pressAction: { id: ACTION_NOT_STARTED_START } },
          { title: "קצר את המשימה", pressAction: { id: ACTION_NOT_STARTED_SHORTEN } },
          { title: "אני צריך פעולה תומכת", pressAction: { id: ACTION_NOT_STARTED_SUPPORT } },
        ],
      },
    });
    await saveTaskNotStartedNotificationState({
      notificationId: TASK_NOT_STARTED_NOTIFICATION_ID,
      alertedTaskId: entry.task.id,
      alertedAt: now.toISOString(),
      moveSuggestionWindowKey,
    });
  } catch (error) {
    console.error("displayTaskNotStartedNotification failed", entry.task.id, error);
  }
}

export async function cancelTaskNotStartedNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(TASK_NOT_STARTED_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
  await clearTaskNotStartedNotificationState();
}

/**
 * Re-resolves "is a task's start time due with nothing started" fresh
 * and either cancels (setting disabled, or genuinely nothing due right
 * now) or displays the ONE notification in place -- and, either way,
 * re-arms the native trigger for whatever is genuinely next. Called
 * from every mutation site the spec names (task add/remove/reorder,
 * live/ActiveTaskScreen.tsx's performStart/handleComplete, the AppState
 * resync effect) -- this is the one function every one of those sites
 * calls into, never a second recompute path.
 */
export async function recomputeTaskNotStartedNotification(now: Date = new Date()): Promise<void> {
  const settings = await loadArcTaskReminderSettings();
  if (!settings.taskNotStartedNotificationEnabled) {
    await cancelTaskNotStartedNotification();
    await cancelArmedTaskNotStartedAlarm();
    return;
  }

  const [scheduled, activeRun] = await Promise.all([resolveTodaysScheduledPlan(now), loadTaskTimerRun()]);
  await armNextTaskNotStartedAlarm(scheduled, now, activeRun);

  const due = resolveTaskNotStartedAlert(scheduled, now, activeRun);
  if (!due) {
    await cancelTaskNotStartedNotification();
    return;
  }

  // ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
  // section 2: a later-today window to move this overdue task into --
  // excludeTaskId=due.task.id so the windows are computed as if the
  // overdue task weren't still sitting in its own original slot (it's
  // the thing being moved FROM there), and minDurationMinutes is the
  // task's own expected duration (0 when unknown -- "assume it fits",
  // same convention arc/todoList.ts's own fit check uses).
  const windows = resolveFreeTimeWindows(scheduled, due.task.id);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const moveWindow = resolveFreeTimeWindowsAfter(windows, nowMinutes, due.task.expectedDurationMinutes ?? 0)[0] ?? null;
  await displayTaskNotStartedNotification(due, moveWindow, now);
}

/**
 * "סיום או ויתור על המשימה": replicates build/FlexibleDailyScreen.tsx's
 * own handleRemoveForToday(entry) EXACTLY (weekly-origin -> mark this
 * one date's occurrence removed, never touching the recurring
 * template; one-off -> delete the task outright) -- called from a
 * background notification handler, which cannot reach that screen's
 * own local function, so the identical logic is reproduced here rather
 * than a second, competing "give up on a task" mechanism.
 */
async function finishOrGiveUpTask(taskId: string, now: Date): Promise<void> {
  const scheduled = await resolveTodaysScheduledPlan(now);
  const entry = scheduled.find((candidate) => candidate.task.id === taskId);
  if (!entry) return;
  if (entry.origin === "weekly") {
    const overrides = await loadTaskOccurrenceOverrides();
    await upsertTaskOccurrenceOverrideEntry(markTaskOccurrenceRemoved(entry.task, entry.occurrenceDateLocal, overrides, now.toISOString()));
  } else {
    await deleteTask(entry.task.id);
  }
  const { reconcileTaskAlarms } = await import("./taskAlarm.ts");
  await reconcileTaskAlarms(now);
  await recomputeTaskNotStartedNotification(now);
  const { recomputeReplanTimeNotification } = await import("./replanTimeNotification.ts");
  await recomputeReplanTimeNotification(now);
  const { recomputeFreeTimeWindowNotification } = await import("./freeTimeWindowNotification.ts");
  await recomputeFreeTimeWindowNotification(now);
  // ARCHI -- Body-Sensation Discovery & Four-Component Learning task,
  // section 7: this is the genuine "given up / not started" outcome --
  // never the "mark done" path (which never reaches this function) --
  // so any still-unresolved usage under this task's own context is
  // resolved to taskStarted: false here.
  const { resolveBodySensationContextKeys } = await import("../arc/supportiveBodySensation.ts");
  const { markSupportiveBodySensationUsagesTaskOutcome } = await import("./storage.ts");
  await markSupportiveBodySensationUsagesTaskOutcome(
    resolveBodySensationContextKeys(
      { taskId: entry.task.id, arcGymSituationId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcFocusPracticeId: null },
      entry.task.linkedArcGymSituationId ?? null
    ),
    false,
    now.toISOString()
  );
}

/**
 * Routed in from data/taskAlarm.ts's shared handleTaskAlarmEvent
 * (data.kind === "taskNotStarted") -- same single-dispatcher discipline
 * every other notification kind in this app already follows. The
 * task id is read directly off THIS notification's own payload (never
 * re-resolved via "what's current/next now") -- every one of its three
 * actions is explicitly about the exact task this alert was raised
 * for, never whatever happens to be current at tap time.
 */
export async function handleTaskNotStartedNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  const data = event.detail.notification?.data;
  const taskId = typeof data?.taskId === "string" ? data.taskId : null;
  if (!taskId) return;
  const now = new Date();

  if (event.type === EventType.ACTION_PRESS) {
    const actionId = event.detail.pressAction?.id;
    if (actionId === ACTION_NOT_STARTED_START) {
      await cancelTaskNotStartedNotification();
      router.push({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
      return;
    }
    if (actionId === ACTION_NOT_STARTED_SUPPORT) {
      await cancelTaskNotStartedNotification();
      router.push({ pathname: "/tasks/[id]/supportive-action", params: { id: taskId } });
      return;
    }
    if (actionId === ACTION_NOT_STARTED_SHORTEN) {
      // ARCHI -- Extend Task-Not-Started Notification task, requirement
      // 3: "קצר את המשימה" reuses the EXISTING task-shrink screen
      // (TaskAdaptationScreen, already reachable from
      // live/SupportiveActionFlowScreen.tsx's own step 7) -- never a
      // second, separately-authored shrink mechanism.
      await cancelTaskNotStartedNotification();
      router.push({ pathname: "/tasks/[id]/adapt", params: { id: taskId } });
      return;
    }
    if (actionId === ACTION_NOT_STARTED_FINISH_OR_GIVE_UP) {
      await cancelTaskNotStartedNotification();
      await finishOrGiveUpTask(taskId, now);
      return;
    }
    return;
  }

  // EventType.PRESS: a bare tap on the notification body. ARCHI --
  // Dynamic Time Planning task, section 2: when a move suggestion was
  // offered for THIS exact alert (alertedTaskId matches), the tap
  // opens the confirm-move screen instead of the plain task screen --
  // never auto-applies the move itself, same "never auto-start/apply
  // just from a body tap" rule every other alarm/reminder kind here
  // already follows. Otherwise, the original bare-task-open behavior
  // is completely unchanged.
  const state = await loadTaskNotStartedNotificationState();
  if (state && state.alertedTaskId === taskId && state.moveSuggestionWindowKey) {
    router.push({ pathname: "/tasks/[id]/move-confirm", params: { id: taskId } });
    return;
  }
  router.push({ pathname: "/tasks/[id]", params: { id: taskId } });
}

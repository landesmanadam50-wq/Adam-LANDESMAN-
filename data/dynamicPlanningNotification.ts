/**
 * data/dynamicPlanningNotification.ts
 *
 * ARCHI -- Rolling Dynamic Planning task, spec sections 1+2+4: the real,
 * OS-level notification that fires 5 minutes before a fixed task's own
 * resolved start time, whenever its own upcoming gap still needs the
 * trainee's attention (arc/dynamicPlanning.ts's own
 * resolveDynamicPlanningAction) -- proactive, ahead of the gap even
 * opening, unlike data/freeTimeWindowNotification.ts's own REACTIVE
 * notification (which still exists unchanged, firing the moment a gap
 * actually opens, as a safety net for whenever this one wasn't acted
 * on in time). Built as a direct structural copy of
 * data/taskMemoryReminderNotification.ts's own 5-minutes-before arm
 * pattern (silent TriggerNotification placeholder, foreground-service
 * dispatch, cancel-then-rearm on every recompute) crossed with
 * data/freeTimeWindowNotification.ts's own "catch up and redisplay in
 * place" recompute shape -- never a parallel notification engine.
 *
 * "Skip" reuses arc/freeTimeWindowDismissal.ts's EXISTING
 * (dateLocal, precedingTaskId, followingTaskId)-keyed dismissal list
 * verbatim (arc/dynamicPlanning.ts's own resolveDynamicPlanningKey is
 * deliberately identical to resolveFreeTimeWindowKey) -- a trainee who
 * skips planning a given gap here, or says "not free" on the reactive
 * free-time-window notification for the exact same gap, suppresses
 * BOTH, since they are the same window for dedup purposes; never a
 * second, parallel dismissal mechanism.
 *
 * "Confirming" (the edit action's destination, live/DynamicPlanningConfirmScreen.tsx)
 * is what actually performs spec section 3's conversion -- this module
 * never writes to any Task itself, only displays/arms/dismisses.
 */

import notifee, { AlarmType, EventType, TriggerType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import type { DynamicPlanningDecision } from "../arc/dynamicPlanning.ts";
import { resolveDynamicPlanningActions, resolveDynamicPlanningKey } from "../arc/dynamicPlanning.ts";
import { formatMinutesToClockTime } from "../arc/dailyRoutine.ts";
import { isFreeTimeWindowDismissed, pruneFreeTimeWindowDismissals, recordFreeTimeWindowDismissal } from "../arc/freeTimeWindowDismissal.ts";
import { resolveTodoList } from "../arc/todoList.ts";
import { TIME_PLANNING_DEFAULT_DURATION_MINUTES } from "../arc/tasks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { resolveTodaysScheduledPlan } from "./dailyPlan.ts";
import { ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureTaskNotStartedChannelAsync, SILENT_DELIVERY_CHANNEL_ID, TASK_NOT_STARTED_CHANNEL_ID } from "./alarmChannel.ts";
import { loadFreeTimeWindowDismissals, loadTasks, saveFreeTimeWindowDismissals } from "./storage.ts";

export const DYNAMIC_PLANNING_NOTIFICATION_ID = "archi-dynamic-planning-notification";
const DYNAMIC_PLANNING_ARM_ID = "archi-dynamic-planning-arm";
const DYNAMIC_PLANNING_TITLE = "תכנון זמן";
const REMINDER_LEAD_MINUTES = 5;

export const ACTION_DYNAMIC_PLANNING_EDIT = "dynamic_planning_edit";
export const ACTION_DYNAMIC_PLANNING_SKIP = "dynamic_planning_skip";

function encodeNullableId(value: string | null): string {
  return value ?? "";
}
function decodeNullableId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Same helper every other 5-minutes-before reminder module owns its own copy of (data/taskMemoryReminderNotification.ts, data/taskNotStartedNotification.ts) -- `effectiveStartTime` is always a plain "HH:MM" clock time for today. */
function resolveEntryStartDate(decision: DynamicPlanningDecision, now: Date): Date | null {
  const time = decision.precedingEntry.effectiveStartTime;
  if (!time) return null;
  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

function resolveReminderFireDate(decision: DynamicPlanningDecision, now: Date): Date | null {
  const startDate = resolveEntryStartDate(decision, now);
  if (!startDate) return null;
  return new Date(startDate.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000);
}

async function cancelArmedDynamicPlanningAlarm(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(DYNAMIC_PLANNING_ARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

export async function cancelDynamicPlanningNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(DYNAMIC_PLANNING_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Arms exactly one silent placeholder for the soonest FUTURE, non-
 * dismissed decision's own (start - 5min) moment -- same cancel-then-
 * maybe-arm idiom every sibling alarm here already uses. The real
 * decision (is this gap still genuinely unplanned) is re-derived fresh
 * inside recomputeDynamicPlanningNotification at the moment this
 * actually fires (data/taskAlarm.ts's own "dynamicPlanningArm" branch),
 * never trusted stale from arm time.
 */
async function armDynamicPlanningAlarm(decisions: DynamicPlanningDecision[], now: Date): Promise<void> {
  await cancelArmedDynamicPlanningAlarm();

  let soonest: { decision: DynamicPlanningDecision; fireAt: Date } | null = null;
  for (const decision of decisions) {
    const fireAt = resolveReminderFireDate(decision, now);
    if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
    if (!soonest || fireAt.getTime() < soonest.fireAt.getTime()) soonest = { decision, fireAt };
  }
  if (!soonest) return;

  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: DYNAMIC_PLANNING_ARM_ID,
        title: DYNAMIC_PLANNING_TITLE,
        body: "",
        data: { kind: "dynamicPlanningArm" },
        android: {
          channelId: SILENT_DELIVERY_CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,
          pressAction: { id: "default" },
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: soonest.fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
  } catch (error) {
    console.error("armDynamicPlanningAlarm failed", error);
  }
}

/**
 * Exact wording per spec sections 1+2: names the fixed task about to
 * start, and -- only when a To-Do is already woven into the gap after
 * it (action "confirm_next_todo") -- its own name, suggested start time
 * (the gap's own start, i.e. the preceding task's effective end) and
 * suggested duration (its own remaining estimate, else the window's own
 * capacity capped at the app-wide default, mirroring
 * arc/todoList.ts's own "no estimate -> treat generously" convention).
 * "plan_gap" gets the plain free-time question instead -- never a
 * fabricated task name when nothing has been queued yet.
 */
export function buildDynamicPlanningBody(decision: DynamicPlanningDecision): string {
  const header = `"${decision.precedingEntry.task.title}" עומדת להתחיל.`;
  const window = decision.window;
  if (decision.action === "confirm_next_todo" && decision.candidate && window) {
    const suggestedStart = formatMinutesToClockTime(window.startMinutes);
    const suggestedDuration = decision.candidate.remainingMinutes ?? Math.min(window.durationMinutes ?? TIME_PLANNING_DEFAULT_DURATION_MINUTES, TIME_PLANNING_DEFAULT_DURATION_MINUTES);
    return `${header}\n\nאחריה מתוכננת "${decision.candidate.task.title}" ב-${suggestedStart}, למשך ${suggestedDuration} דקות.`;
  }
  const durationText = window && window.durationMinutes !== null ? `${window.durationMinutes} דקות` : "זמן פתוח";
  return `${header}\n\nיש לך ${durationText} פנויים אחריה. רוצה לתכנן מה לעשות בזמן הזה?`;
}

async function displayDynamicPlanningNotification(decision: DynamicPlanningDecision, dateLocal: string, now: Date): Promise<void> {
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    const windowKey = resolveDynamicPlanningKey(dateLocal, decision) ?? "";
    await notifee.displayNotification({
      id: DYNAMIC_PLANNING_NOTIFICATION_ID,
      title: DYNAMIC_PLANNING_TITLE,
      body: buildDynamicPlanningBody(decision),
      data: {
        kind: "dynamicPlanning",
        precedingTaskId: decision.precedingEntry.task.id,
        followingTaskId: encodeNullableId(decision.window?.followingTaskId ?? null),
        windowKey,
        dateLocal,
      },
      android: {
        channelId: TASK_NOT_STARTED_CHANNEL_ID,
        onlyAlertOnce: true,
        autoCancel: false,
        pressAction: { id: "default" },
        actions: [
          { title: decision.action === "confirm_next_todo" ? "ערוך זמנים" : "תכנן את הזמן", pressAction: { id: ACTION_DYNAMIC_PLANNING_EDIT } },
          { title: "דלג", pressAction: { id: ACTION_DYNAMIC_PLANNING_SKIP } },
        ],
      },
    });
  } catch (error) {
    console.error("displayDynamicPlanningNotification failed", error);
  }
}

/**
 * Re-resolves "does any upcoming fixed task's own gap still need
 * planning" completely fresh, re-arms the soonest qualifying one, and
 * either cancels or redisplays the ONE notification in place for
 * whichever decision's own reminder moment has already arrived (and is
 * still relevant -- its gap hasn't fully elapsed) but wasn't dismissed.
 * Called from every mutation site data/freeTimeWindowNotification.ts's
 * own recomputeFreeTimeWindowNotification already is (task add/remove/
 * start/complete/move, FlexibleDailyScreen's reload, TaskMoveConfirmationScreen's
 * own handleApplyMove), plus data/taskAlarm.ts's own "dynamicPlanningArm"
 * foreground-service branch at the moment an armed trigger actually
 * fires.
 */
export async function recomputeDynamicPlanningNotification(now: Date = new Date()): Promise<void> {
  const { hasActiveTaskConflict } = await import("./taskAlarm.ts");
  const busy = await hasActiveTaskConflict("", now);
  if (busy) {
    await cancelDynamicPlanningNotification();
    await cancelArmedDynamicPlanningAlarm();
    return;
  }

  const [scheduled, tasks, dismissals] = await Promise.all([resolveTodaysScheduledPlan(now), loadTasks(), loadFreeTimeWindowDismissals()]);
  const dateLocal = todayLocalDateString(now);
  const prunedDismissals = pruneFreeTimeWindowDismissals(dismissals, dateLocal);
  if (prunedDismissals.length !== dismissals.length) await saveFreeTimeWindowDismissals(prunedDismissals);

  const todoEntries = resolveTodoList(tasks, dateLocal);
  const decisions = resolveDynamicPlanningActions(scheduled, todoEntries).filter(
    (decision) => !isFreeTimeWindowDismissed(prunedDismissals, dateLocal, decision.window!)
  );

  await armDynamicPlanningAlarm(decisions, now);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const due =
    decisions.find((decision) => {
      const fireAt = resolveReminderFireDate(decision, now);
      if (!fireAt || fireAt.getTime() > now.getTime()) return false;
      const window = decision.window!;
      return window.endMinutes === null || nowMinutes < window.endMinutes;
    }) ?? null;

  if (!due) {
    await cancelDynamicPlanningNotification();
    return;
  }
  await displayDynamicPlanningNotification(due, dateLocal, now);
}

/**
 * Routed from data/taskAlarm.ts's own foreground-service dispatch once
 * the silent arm placeholder actually fires -- re-resolves fresh and
 * displays whatever is genuinely due now (never trusts the arm-time
 * snapshot), mirroring every other "...Arm" branch here exactly.
 */
export async function handleDynamicPlanningAlarmFired(now: Date = new Date()): Promise<void> {
  await recomputeDynamicPlanningNotification(now);
}

/**
 * Routed in from data/taskAlarm.ts's shared handleTaskAlarmEvent
 * (data.kind === "dynamicPlanning") -- the one action ("ערוך זמנים" /
 * "תכנן את הזמן") and a bare body tap both open the SAME confirm screen
 * (live/DynamicPlanningConfirmScreen.tsx, route /tasks/[id]/plan-next
 * with id = the preceding fixed task), never a second decision UI --
 * "skip" instead records a dismissal for this exact window (reusing
 * arc/freeTimeWindowDismissal.ts's existing list, never a second
 * mechanism) and recomputes, so a different gap can still be offered.
 */
export async function handleDynamicPlanningNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  const data = event.detail.notification?.data;
  const precedingTaskId = decodeNullableId(data?.precedingTaskId);
  const followingTaskId = decodeNullableId(data?.followingTaskId);
  const dateLocal = typeof data?.dateLocal === "string" && data.dateLocal !== "" ? data.dateLocal : null;
  const actionId = event.detail.pressAction?.id;

  if (actionId === ACTION_DYNAMIC_PLANNING_SKIP) {
    await cancelDynamicPlanningNotification();
    await cancelArmedDynamicPlanningAlarm();
    if (dateLocal) {
      const dismissals = await loadFreeTimeWindowDismissals();
      const updated = recordFreeTimeWindowDismissal(dismissals, dateLocal, { precedingTaskId, followingTaskId }, new Date().toISOString());
      await saveFreeTimeWindowDismissals(updated);
    }
    await recomputeDynamicPlanningNotification(new Date());
    return;
  }

  await cancelDynamicPlanningNotification();
  await cancelArmedDynamicPlanningAlarm();
  if (!precedingTaskId) {
    router.push("/");
    return;
  }
  router.push({ pathname: "/tasks/[id]/plan-next", params: { id: precedingTaskId } });
}

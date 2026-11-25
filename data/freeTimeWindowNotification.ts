/**
 * data/freeTimeWindowNotification.ts
 *
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
 * section 1: the real, OS-level notification that fires the moment a
 * free window opens between two Flexible-Daily-Schedule tasks (or after
 * the last one today), asking the trainee whether that time is
 * genuinely free for them -- and, if so, suggesting a matching To-Do
 * item. Built as a DIRECT structural copy of
 * data/taskNotStartedNotification.ts (the user's own superseding
 * clarification explicitly required this: "לשלב זאת במערכת ההתראות
 * הקיימת, ללא יצירת מנגנון מקביל" -- integrate into the existing
 * notification system, never a parallel mechanism): the same single
 * stable, never-regenerated notification id (update in place), the
 * same armed-TriggerNotification-for-a-future-moment pattern (so this
 * can fire even while the app is fully closed), the same
 * TASK_NOT_STARTED_CHANNEL_ID (reused, never a new channel -- this is
 * the same "scheduling suggestion" urgency tier), and the same
 * SILENT_DELIVERY_CHANNEL_ID placeholder/registerTaskAlarmForegroundService
 * foreground-service dance every other alarm kind here already uses.
 *
 * The one pure module behind every window decision,
 * arc/freeTimeWindow.ts's resolveFreeTimeWindows, is a sibling of
 * arc/dailyPlan.ts that mirrors resolveCurrentTaskState's own candidate
 * filtering exactly -- so "a window just opened" and "nothing is
 * currently scheduled-active" can never disagree. Picking the best-fit
 * suggestion inside a window reuses arc/todoList.ts's own
 * resolveRecommendedTodoAction completely unmodified -- the SAME
 * urgency/importance-sorted smart-fit algorithm the Smart To-Do List
 * task already built, never a second, competing picker.
 *
 * "Never interrupt an active task, a planned break, or ARC practice"
 * is enforced TWICE, deliberately redundantly: once via
 * resolveCurrentTaskState(...).current === null (the same schedule-
 * timing gate task-not-started's own resolveTaskNotStartedAlert uses),
 * and once via data/taskAlarm.ts's own hasActiveTaskConflict("", now)
 * -- the one existing "is ANYTHING busy" predicate the ARC/morning
 * alarm family already relies on for this exact strength of
 * suppression (any active task OR any non-stale ARC LIVE session
 * counts, regardless of whether it matches today's schedule at all,
 * covering an ad-hoc break or a spontaneous/unlinked ARC session
 * resolveCurrentTaskState alone could never see). Imported via a
 * DYNAMIC import inside the function body -- never a static top-level
 * import -- because data/taskAlarm.ts's own shared handleTaskAlarmEvent
 * dispatches INTO this module (see the "freeTimeWindow"/
 * "freeTimeWindowArm" branches added there), so a static import the
 * other way would be circular; the exact same technique
 * data/taskNotStartedNotification.ts's own finishOrGiveUpTask already
 * uses for reconcileTaskAlarms.
 *
 * "Never re-show a suggestion already declined for that exact same
 * window" is arc/freeTimeWindowDismissal.ts's own job, keyed by the
 * window's two bounding tasks (never raw minutes, so a window that
 * merely reflows by a few minutes after an unrelated scheduling change
 * is still "the same window" for this purpose). "הצע משימה אחרת" works
 * even with the app fully closed because `shownTaskIds` (this module's
 * own small persisted state, data/storage.ts's
 * FreeTimeWindowNotificationState) is saved on every display and
 * consulted on every recompute -- each tap just filters the candidate
 * list and redisplays the SAME notification id with updated content,
 * reusing notifee's own update-in-place semantics (never a duplicate
 * notification).
 */

import notifee, { AlarmType, EventType, TriggerType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import { resolveCurrentTaskState } from "../arc/dailyPlan.ts";
import {
  resolveFreeTimeWindowAt,
  resolveFreeTimeWindowKey,
  resolveFreeTimeWindows,
  resolveFreeTimeWindowsAfter,
} from "../arc/freeTimeWindow.ts";
import type { FreeTimeWindow } from "../arc/freeTimeWindow.ts";
import {
  isFreeTimeWindowDismissed,
  pruneFreeTimeWindowDismissals,
  recordFreeTimeWindowDismissal,
} from "../arc/freeTimeWindowDismissal.ts";
import type { FreeTimeWindowDismissal } from "../arc/freeTimeWindowDismissal.ts";
import { resolveRecommendedTodoAction, resolveTodoList } from "../arc/todoList.ts";
import type { TodoSuggestion } from "../arc/todoList.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { resolveTodaysScheduledPlan } from "./dailyPlan.ts";
import {
  ALARM_FOREGROUND_SERVICE_TYPES,
  ensureNotifeePermissionAsync,
  ensureTaskNotStartedChannelAsync,
  SILENT_DELIVERY_CHANNEL_ID,
  TASK_NOT_STARTED_CHANNEL_ID,
} from "./alarmChannel.ts";
import {
  clearFreeTimeWindowNotificationState,
  loadFreeTimeWindowDismissals,
  loadFreeTimeWindowNotificationState,
  loadTaskTimerRun,
  loadTasks,
  saveFreeTimeWindowDismissals,
  saveFreeTimeWindowNotificationState,
} from "./storage.ts";

export const FREE_TIME_WINDOW_NOTIFICATION_ID = "archi-free-time-window-notification";
const FREE_TIME_WINDOW_ARM_ID = "archi-free-time-window-arm";
const FREE_TIME_WINDOW_TITLE = "זמן פנוי";

export const ACTION_FREE_TIME_START = "free_time_window_start";
export const ACTION_FREE_TIME_DIFFERENT = "free_time_window_different";
export const ACTION_FREE_TIME_NOT_FREE = "free_time_window_not_free";

/** Null-less sentinel round-trip through notifee's string-only `data` payload -- a real task id is never "". */
function encodeNullableId(value: string | null): string {
  return value ?? "";
}
function decodeNullableId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function minutesToDateToday(now: Date, minutes: number): Date {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return new Date(base.getTime() + minutes * 60000);
}

async function cancelArmedFreeTimeWindowAlarm(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(FREE_TIME_WINDOW_ARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

export async function cancelFreeTimeWindowNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(FREE_TIME_WINDOW_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
  await clearFreeTimeWindowNotificationState();
}

/**
 * Arms (or re-arms, replacing any previous one) the native trigger for
 * the soonest FUTURE, non-dismissed qualifying window -- same
 * cancel-then-maybe-arm idiom data/taskNotStartedNotification.ts's own
 * armNextTaskNotStartedAlarm uses. A silent placeholder only: the real
 * decision (is this window still genuinely free, with nothing busy)
 * happens fresh inside recomputeFreeTimeWindowNotification, called from
 * the foreground-service handler at the moment this actually fires
 * (data/taskAlarm.ts's own "freeTimeWindowArm" branch) -- never
 * recomputed here at arm time, which could be stale by the time it
 * rings.
 */
async function armFreeTimeWindowAlarm(windows: FreeTimeWindow[], dismissals: FreeTimeWindowDismissal[], dateLocal: string, now: Date): Promise<void> {
  await cancelArmedFreeTimeWindowAlarm();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const future = resolveFreeTimeWindowsAfter(windows, nowMinutes + 1, null).find(
    (window) => window.startMinutes > nowMinutes && !isFreeTimeWindowDismissed(dismissals, dateLocal, window)
  );
  if (!future) return;
  const fireAt = minutesToDateToday(now, future.startMinutes);
  if (fireAt.getTime() <= now.getTime()) return;

  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: FREE_TIME_WINDOW_ARM_ID,
        title: FREE_TIME_WINDOW_TITLE,
        body: "",
        data: { kind: "freeTimeWindowArm" },
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
    console.error("armFreeTimeWindowAlarm failed", error);
  }
}

/** Never a fabricated suggestion: only "fits" or "split_suggested" (an actual candidate) renders a line -- "none_available"/"top_priority_does_not_fit"/"no_todo_items" leave the body exactly as the plain free-time question. */
function resolveSuggestionBodyLine(suggestion: TodoSuggestion): string | null {
  if (!suggestion.entry) return null;
  const title = suggestion.entry.task.title;
  if (suggestion.reason === "fits") return `מוצע: ${title}`;
  if (suggestion.reason === "split_suggested") return `מוצע: ${title} (${suggestion.suggestedDurationMinutes} דקות מתוך הזמן שיש)`;
  return null;
}

/** Exact wording the user's own clarification specified for a window bounded by a real next task; a generic trailing/open-ended window (nothing scheduled after it today) gets its own, equally plain phrasing -- never silently reusing a duration-anchored sentence with no duration to anchor it. */
function buildFreeTimeWindowBody(window: FreeTimeWindow, suggestion: TodoSuggestion): string {
  const header =
    window.followingTaskId !== null && window.durationMinutes !== null
      ? `יש לך ${window.durationMinutes} דקות עד המשימה הבאה. האם הזמן הזה פנוי עבורך?`
      : "נראה שיש לך זמן פנוי כרגע. האם הזמן הזה פנוי עבורך?";
  const suggestionLine = resolveSuggestionBodyLine(suggestion);
  return suggestionLine ? `${header}\n\n${suggestionLine}` : header;
}

async function displayFreeTimeWindowNotification(
  window: FreeTimeWindow,
  windowKey: string,
  dateLocal: string,
  suggestion: TodoSuggestion,
  shownTaskIds: string[],
  now: Date
): Promise<void> {
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    const body = buildFreeTimeWindowBody(window, suggestion);
    const suggestedTaskId = suggestion.entry?.task.id ?? null;
    const nextShownTaskIds = suggestedTaskId ? [...shownTaskIds, suggestedTaskId] : shownTaskIds;
    const splitMinutes = suggestion.reason === "split_suggested" && suggestion.suggestedDurationMinutes !== null ? String(suggestion.suggestedDurationMinutes) : "";

    await notifee.displayNotification({
      id: FREE_TIME_WINDOW_NOTIFICATION_ID,
      title: FREE_TIME_WINDOW_TITLE,
      body,
      data: {
        kind: "freeTimeWindow",
        windowKey,
        dateLocal,
        precedingTaskId: encodeNullableId(window.precedingTaskId),
        followingTaskId: encodeNullableId(window.followingTaskId),
        taskId: encodeNullableId(suggestedTaskId),
        splitMinutes,
      },
      android: {
        channelId: TASK_NOT_STARTED_CHANNEL_ID,
        onlyAlertOnce: true,
        autoCancel: false,
        pressAction: { id: "default" },
        actions: [
          { title: "התחל משימה", pressAction: { id: ACTION_FREE_TIME_START } },
          { title: "הצע משימה אחרת", pressAction: { id: ACTION_FREE_TIME_DIFFERENT } },
          { title: "הזמן לא פנוי", pressAction: { id: ACTION_FREE_TIME_NOT_FREE } },
        ],
      },
    });
    await saveFreeTimeWindowNotificationState({
      notificationId: FREE_TIME_WINDOW_NOTIFICATION_ID,
      windowKey,
      shownTaskIds: nextShownTaskIds,
      displayedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("displayFreeTimeWindowNotification failed", error);
  }
}

/**
 * Re-resolves "is a free window open right now, with nothing busy and
 * nothing already declined for it" completely fresh, and either
 * cancels or displays the ONE notification in place -- then, either
 * way, re-arms the native trigger for whatever qualifies next. Called
 * from every mutation site data/taskNotStartedNotification.ts's own
 * recomputeTaskNotStartedNotification already is (task add/remove/
 * start/complete, the AppState resync effect), plus
 * data/taskAlarm.ts's own "freeTimeWindowArm" foreground-service branch
 * at the moment an armed trigger actually fires -- this is the ONE
 * function every one of those call sites calls into, never a second
 * recompute path.
 */
export async function recomputeFreeTimeWindowNotification(now: Date = new Date()): Promise<void> {
  const { hasActiveTaskConflict } = await import("./taskAlarm.ts");
  const busy = await hasActiveTaskConflict("", now);
  if (busy) {
    await cancelFreeTimeWindowNotification();
    await cancelArmedFreeTimeWindowAlarm();
    return;
  }

  const [scheduled, tasks, activeRun, dismissals] = await Promise.all([
    resolveTodaysScheduledPlan(now),
    loadTasks(),
    loadTaskTimerRun(),
    loadFreeTimeWindowDismissals(),
  ]);

  const state = resolveCurrentTaskState(scheduled, now, activeRun, null);
  if (state.current !== null) {
    await cancelFreeTimeWindowNotification();
    await cancelArmedFreeTimeWindowAlarm();
    return;
  }

  const dateLocal = todayLocalDateString(now);
  const prunedDismissals = pruneFreeTimeWindowDismissals(dismissals, dateLocal);
  if (prunedDismissals.length !== dismissals.length) await saveFreeTimeWindowDismissals(prunedDismissals);

  const windows = resolveFreeTimeWindows(scheduled, null);
  await armFreeTimeWindowAlarm(windows, prunedDismissals, dateLocal, now);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openNow = resolveFreeTimeWindowAt(windows, nowMinutes);
  const candidateWindow =
    openNow && !isFreeTimeWindowDismissed(prunedDismissals, dateLocal, openNow)
      ? openNow
      : resolveFreeTimeWindowsAfter(windows, nowMinutes, null).find((window) => window.startMinutes <= nowMinutes && !isFreeTimeWindowDismissed(prunedDismissals, dateLocal, window)) ?? null;

  if (!candidateWindow) {
    await cancelFreeTimeWindowNotification();
    return;
  }

  const windowKey = resolveFreeTimeWindowKey(dateLocal, candidateWindow);
  const priorState = await loadFreeTimeWindowNotificationState();
  const shownTaskIds = priorState && priorState.windowKey === windowKey ? priorState.shownTaskIds : [];
  const todoEntries = resolveTodoList(tasks, dateLocal).filter((entry) => !shownTaskIds.includes(entry.task.id));
  const suggestion = resolveRecommendedTodoAction(todoEntries, candidateWindow.durationMinutes);
  await displayFreeTimeWindowNotification(candidateWindow, windowKey, dateLocal, suggestion, shownTaskIds, now);
}

/**
 * Routed in from data/taskAlarm.ts's shared handleTaskAlarmEvent
 * (data.kind === "freeTimeWindow") -- same single-dispatcher discipline
 * every other notification kind here already follows.
 */
export async function handleFreeTimeWindowNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  const data = event.detail.notification?.data;
  const now = new Date();

  if (event.type === EventType.PRESS) {
    // A bare tap on the body opens Home -- never auto-starts anything, same "never auto-start just from a body tap" rule every other alarm/reminder kind here already follows.
    await cancelFreeTimeWindowNotification();
    router.push("/");
    return;
  }

  const actionId = event.detail.pressAction?.id;

  if (actionId === ACTION_FREE_TIME_START) {
    const taskId = decodeNullableId(data?.taskId);
    await cancelFreeTimeWindowNotification();
    await cancelArmedFreeTimeWindowAlarm();
    if (!taskId) return;
    const splitMinutes = typeof data?.splitMinutes === "string" && data.splitMinutes !== "" ? data.splitMinutes : null;
    router.push({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1", ...(splitMinutes !== null ? { splitMinutes } : {}) } });
    return;
  }

  if (actionId === ACTION_FREE_TIME_NOT_FREE) {
    const dateLocal = typeof data?.dateLocal === "string" ? data.dateLocal : null;
    if (dateLocal) {
      const precedingTaskId = decodeNullableId(data?.precedingTaskId);
      const followingTaskId = decodeNullableId(data?.followingTaskId);
      const dismissals = await loadFreeTimeWindowDismissals();
      const updated = recordFreeTimeWindowDismissal(dismissals, dateLocal, { precedingTaskId, followingTaskId }, now.toISOString());
      await saveFreeTimeWindowDismissals(updated);
    }
    await cancelFreeTimeWindowNotification();
    await recomputeFreeTimeWindowNotification(now);
    return;
  }

  if (actionId === ACTION_FREE_TIME_DIFFERENT) {
    const windowKey = typeof data?.windowKey === "string" ? data.windowKey : null;
    const dateLocal = typeof data?.dateLocal === "string" ? data.dateLocal : null;
    if (!windowKey || !dateLocal) {
      await cancelFreeTimeWindowNotification();
      return;
    }
    const [scheduled, tasks] = await Promise.all([resolveTodaysScheduledPlan(now), loadTasks()]);
    const windows = resolveFreeTimeWindows(scheduled, null);
    const window = windows.find((candidate) => resolveFreeTimeWindowKey(dateLocal, candidate) === windowKey) ?? null;
    if (!window) {
      // The window no longer exists (a neighbor changed) -- fall back to a full, fresh recompute rather than offering a stale one.
      await cancelFreeTimeWindowNotification();
      await recomputeFreeTimeWindowNotification(now);
      return;
    }
    const priorState = await loadFreeTimeWindowNotificationState();
    const shownTaskIds = priorState && priorState.windowKey === windowKey ? priorState.shownTaskIds : [];
    const todoEntries = resolveTodoList(tasks, dateLocal).filter((entry) => !shownTaskIds.includes(entry.task.id));
    const suggestion = resolveRecommendedTodoAction(todoEntries, window.durationMinutes);
    await displayFreeTimeWindowNotification(window, windowKey, dateLocal, suggestion, shownTaskIds, now);
    return;
  }
}

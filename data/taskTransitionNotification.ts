/**
 * data/taskTransitionNotification.ts
 *
 * ARC Reminders task, requirement 5 (Task Reminders): the ONE
 * persistent, update-in-place notification shown whenever a task ends
 * automatically -- "ended task X, current task Y, next task Z," phrased
 * as a mantra (arc/taskTransitionMantra.ts), with exactly 3 directly-
 * visible actions (😟/🙂/Start task) plus a body-tap into an optional
 * "Finish + smile" screen, never a mandatory navigation.
 *
 * Reuses the exact infrastructure every other reminder kind in this app
 * already relies on: notifee's plain (non-alarm) displayNotification,
 * the SAME handleEmotionalCheckInChoice (data/emotionalCheckInRouting.ts)
 * every other check-in surface already uses for 😟/🙂, and the existing
 * `autoStart=1` deep-link convention (already used by
 * live/ArcResultPracticeScreen.tsx and others) for "Start task" -- no
 * new ARC-entry or task-start logic anywhere in this file.
 *
 * Single source of truth, never re-derived: `recomputeTaskTransitionNotification`
 * resolves current/next through `resolveCurrentAndNextTaskForTransition`
 * (data/dailyPlan.ts), the EXACT SAME priority chain
 * resolveNextScheduledTaskDisplay/the home cube already use -- this
 * notification can never disagree with the rest of the app about
 * what's current/next. A tap re-resolves this pipeline FRESH rather
 * than trusting the ids baked into the original notification payload,
 * so a flexible-day change between send and tap (reorder/delete/
 * postpone) is always reflected at the moment the trainee actually
 * acts, never a stale snapshot.
 *
 * "Update in place, never a duplicate" is enforced structurally by a
 * single stable, never-regenerated TASK_TRANSITION_NOTIFICATION_ID --
 * every redisplay call replaces the same OS notification, same
 * discipline as data/emotionalCheckInNotification.ts/
 * data/dailyVisualizationAlarm.ts. A normal, swipe-dismissible
 * notification (autoCancel, no asForegroundService, no `ongoing`) --
 * never an alarm, per the spec's own explicit instruction.
 */

import notifee, { AndroidVisibility, EventType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import { ensureNotifeePermissionAsync, ensureTaskTransitionChannelAsync, TASK_TRANSITION_CHANNEL_ID } from "./alarmChannel.ts";
import { resolveCurrentAndNextTaskForTransition } from "./dailyPlan.ts";
import { handleEmotionalCheckInChoice } from "./emotionalCheckInRouting.ts";
import type { EmotionalCheckInChoice } from "./emotionalCheckInRouting.ts";
import { ALL_DONE_TRANSITION_MANTRA, resolveTransitionMantra } from "../arc/taskTransitionMantra.ts";
import { loadArcTaskReminderSettings, loadTaskTimerRun, loadTaskTransitionNotificationState, saveTaskTransitionNotificationState } from "./storage.ts";

/** Task sync fix: the real, globally active run (excluding a rest/break run, which has no task-identity cross-check role here) -- threaded into resolveCurrentAndNextTaskForTransition below so a different task's leftover stale `status === "active"` field can never win the "current" slot this notification's own mantra names. */
async function loadRealActiveRunForTransition() {
  const run = await loadTaskTimerRun();
  return run && run.kind !== "rest" ? run : null;
}

const TASK_TRANSITION_NOTIFICATION_ID = "archi-task-transition-notification";
const TASK_TRANSITION_TITLE = "ARCHI — מעבר למשימה הבאה";

const ACTION_TRANSITION_LESS_GOOD = "transition_less_good";
const ACTION_TRANSITION_OKAY = "transition_okay";
const ACTION_TRANSITION_START_TASK = "transition_start_task";

const ACTION_TO_CHOICE: Record<string, EmotionalCheckInChoice> = {
  [ACTION_TRANSITION_LESS_GOOD]: "full_arc",
  [ACTION_TRANSITION_OKAY]: "shortened_arc",
};

/**
 * Re-resolves current/next and either cancels (setting disabled, or
 * genuinely nothing current/next to show) or redisplays the ONE
 * transition notification in place. Called from every mutation site
 * the plan names (task reorder/delete/add/postpone/duration change/
 * time-planning change, and `completeTask`'s own new automatic call
 * site) -- this is the one function every one of those sites calls
 * into, never a second recompute path.
 */
export async function recomputeTaskTransitionNotification(fromTaskId: string | null = null, now: Date = new Date()): Promise<void> {
  const settings = await loadArcTaskReminderSettings();
  if (!settings.transitionNotificationEnabled) {
    await cancelTaskTransitionNotification();
    return;
  }
  const { current, next } = await resolveCurrentAndNextTaskForTransition(null, now, await loadRealActiveRunForTransition());
  const body = resolveTransitionMantra(current, next);
  const allDone = current === null;

  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskTransitionChannelAsync();
    await notifee.displayNotification({
      id: TASK_TRANSITION_NOTIFICATION_ID,
      title: TASK_TRANSITION_TITLE,
      body,
      data: { kind: "taskTransition" },
      android: {
        channelId: TASK_TRANSITION_CHANNEL_ID,
        visibility: settings.hideContentOnLockScreen ? AndroidVisibility.PRIVATE : AndroidVisibility.PUBLIC,
        autoCancel: true,
        pressAction: { id: "default" },
        actions: allDone
          ? []
          : [
              { title: "😟 פחות טוב", pressAction: { id: ACTION_TRANSITION_LESS_GOOD } },
              { title: "🙂 סבבה", pressAction: { id: ACTION_TRANSITION_OKAY } },
              { title: "▶ התחל משימה", pressAction: { id: ACTION_TRANSITION_START_TASK } },
            ],
      },
    });
    await saveTaskTransitionNotificationState({
      notificationId: TASK_TRANSITION_NOTIFICATION_ID,
      fromTaskId,
      currentTaskId: current?.id ?? null,
      nextTaskId: next?.id ?? null,
      allDone,
      updatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("recomputeTaskTransitionNotification failed", error);
  }
}

export async function cancelTaskTransitionNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(TASK_TRANSITION_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Routed in from data/taskAlarm.ts's shared handleTaskAlarmEvent
 * (data.kind === "taskTransition") -- same single-dispatcher discipline
 * every other notification kind in this app already follows.
 *
 * 😟/🙂 dispatch into the SAME handleEmotionalCheckInChoice every other
 * check-in surface uses, carrying the FRESHLY re-resolved current task's
 * id (never the id baked into the original payload). "Start task" deep-
 * links to Task LIVE with the established `autoStart=1` convention. A
 * bare body tap (EventType.PRESS, never an action id) opens the
 * optional "Finish + smile" screen (PostTaskRewardScreen, extended to
 * accept an explicit from/to pair) -- requirement 8's "reflection/smile/
 * ARC/mood-check all become fully optional, reachable only via the
 * notification" is implemented exactly here: nothing else in this app
 * still forces that screen open.
 */
export async function handleTaskTransitionNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  const { current } = await resolveCurrentAndNextTaskForTransition(null, new Date(), await loadRealActiveRunForTransition());

  if (event.type === EventType.ACTION_PRESS) {
    const actionId = event.detail.pressAction?.id;
    if (!actionId) return;
    if (actionId === ACTION_TRANSITION_START_TASK) {
      if (current) router.push({ pathname: "/tasks/[id]", params: { id: current.id, autoStart: "1" } });
      return;
    }
    const choice = ACTION_TO_CHOICE[actionId];
    if (choice) await handleEmotionalCheckInChoice(choice, current?.id ?? null);
    return;
  }

  // EventType.PRESS: a bare tap on the notification body -- the one
  // path to the optional "Finish + smile" screen (§6.3(d)).
  const state = await loadTaskTransitionNotificationState();
  const fromTaskId = state?.fromTaskId ?? null;
  if (!fromTaskId && !current) return;
  router.push({
    pathname: "/tasks/[id]/post-task-reward",
    params: { id: fromTaskId ?? current?.id ?? "", source: "notification", toTaskId: current?.id ?? "" },
  });
}

export { ALL_DONE_TRANSITION_MANTRA };

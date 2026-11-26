/**
 * data/proactiveSupportNotification.ts
 *
 * ARCHI -- Proactive Support During Task LIVE task, sections 1-4: a
 * task-specific sibling of data/emotionalCheckInNotification.ts, fired
 * at the two moments a trainee is most likely to be wrestling with a
 * thought, an urge, or a dip in motivation mid-task -- pausing the
 * timer (live/ActiveTaskScreen.tsx's handlePause), or leaving the app
 * while the timer is running (the new AppState listener there). Every
 * action still routes through the SAME shared
 * data/emotionalCheckInRouting.ts's handleEmotionalCheckInChoice this
 * app already uses everywhere else -- this module never decides
 * anything new, it only decides WHEN to ask, with an explicit taskId
 * always carried through (never null, unlike the generic check-in).
 *
 * Android allows at most 3 notification action buttons. Per the user's
 * own explicit decision: the 3 real buttons are 😟 פחות טוב / 🙂 סבבה /
 * 🧠 מחשבה-דחף; "😄 מעולה" is demoted to the notification's own BODY
 * TAP, with the body text explicitly telling the trainee what tapping
 * it does. The body tap, in turn, only re-foregrounds Task LIVE for
 * the same active task (handleEmotionalCheckInChoice's own "next_task"
 * branch, verified to ignore taskId and just resolve whatever task is
 * currently active -- which, mid-task, is this exact task, and
 * route `/tasks/[id]` IS Task LIVE itself, with no autoStart, so the
 * timer is never touched) when `task.taskIsOnPhone` is false. When
 * it's true, the trainee is deliberately using the phone for something
 * else as part of doing the task -- the body tap then only cancels the
 * notification, never forcing the app to the foreground.
 *
 * Reuses EMOTIONAL_CHECKIN_CHANNEL_ID (same quiet, LOW-importance,
 * lock-screen-visible tier as the generic check-in) -- no new channel.
 * Single deterministic id, same "replace, never duplicate" discipline
 * every notification in this app already follows.
 */

import notifee, { AndroidVisibility, EventType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";

import { ensureEmotionalCheckInChannelAsync, ensureNotifeePermissionAsync, EMOTIONAL_CHECKIN_CHANNEL_ID } from "./alarmChannel.ts";
import { handleEmotionalCheckInChoice } from "./emotionalCheckInRouting.ts";
import { getTask } from "./storage.ts";

const PROACTIVE_SUPPORT_NOTIFICATION_ID = "archi-proactive-support-notification";

const ACTION_LESS_GOOD = "proactive_support_less_good";
const ACTION_OK = "proactive_support_ok";
const ACTION_URGE = "proactive_support_urge";

/**
 * Section 4's own "prevent duplicate notifications when the trainee
 * both pauses the timer AND exits the app" -- the single deterministic
 * id above already keeps the OS from ever showing two stacked cards
 * regardless; this in-memory (not persisted -- doesn't need to survive
 * a restart, and both trigger sites run in the same JS session) guard
 * only avoids pointlessly re-posting/re-alerting for the same episode.
 * Same "debounce constant" idiom modules/floating-timer-overlay's own
 * OverlayService.kt already uses repeatedly (e.g. MOOD_TAP_DEBOUNCE_MS).
 */
const DUPLICATE_SUPPRESSION_WINDOW_MS = 3000;
let lastDisplayedAtMs = 0;

/** Never throws -- a failed display just means the quiet prompt silently didn't appear this time, never a crash. Exported only for tests to reset the debounce window between cases. */
export function resetProactiveSupportDebounceForTests(): void {
  lastDisplayedAtMs = 0;
}

/**
 * The one exported entry point both trigger sites call (an explicit
 * pause always calls this unconditionally; the app-exit listener calls
 * it only after its own taskIsOnPhone/screen-lock checks pass -- this
 * function itself makes no such decision, it only displays).
 */
export async function displayProactiveSupportNotification(taskId: string, now: Date): Promise<void> {
  const nowMs = now.getTime();
  if (nowMs - lastDisplayedAtMs < DUPLICATE_SUPPRESSION_WINDOW_MS) return;
  lastDisplayedAtMs = nowMs;
  try {
    await ensureNotifeePermissionAsync();
    await ensureEmotionalCheckInChannelAsync();
    await notifee.displayNotification({
      id: PROACTIVE_SUPPORT_NOTIFICATION_ID,
      title: "איך הולך עם המשימה?",
      body: "האם יש מחשבה או דחף שמפריעים לך לבצע את המשימה? איך אתה מרגיש כרגע?\n\nלחיצה על ההתראה עצמה = 😄 מעולה — להמשיך במשימה.",
      data: { kind: "proactiveSupport", taskId },
      android: {
        channelId: EMOTIONAL_CHECKIN_CHANNEL_ID,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: true,
        pressAction: { id: "default" },
        actions: [
          { title: "😟 פחות טוב", pressAction: { id: ACTION_LESS_GOOD } },
          { title: "🙂 סבבה", pressAction: { id: ACTION_OK } },
          { title: "🧠 מחשבה / דחף", pressAction: { id: ACTION_URGE } },
        ],
      },
    });
  } catch (error) {
    console.error("displayProactiveSupportNotification failed", error);
  }
}

export async function cancelProactiveSupportNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(PROACTIVE_SUPPORT_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Routed in from data/taskAlarm.ts's own shared handleTaskAlarmEvent
 * (data.kind === "proactiveSupport") -- there is only ever ONE
 * onBackgroundEvent/onForegroundEvent registration app-wide; see
 * app/_layout.tsx's doc.
 */
export async function handleProactiveSupportNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  const data = event.detail.notification?.data;
  const taskId = typeof data?.taskId === "string" ? data.taskId : null;
  if (!taskId) return;

  if (event.type === EventType.ACTION_PRESS) {
    const actionId = event.detail.pressAction?.id;
    await cancelProactiveSupportNotification();
    if (actionId === ACTION_LESS_GOOD) {
      await handleEmotionalCheckInChoice("full_arc", taskId);
      return;
    }
    if (actionId === ACTION_OK) {
      await handleEmotionalCheckInChoice("shortened_arc", taskId);
      return;
    }
    if (actionId === ACTION_URGE) {
      await handleEmotionalCheckInChoice("urge", taskId);
    }
    return;
  }

  // EventType.PRESS: a bare tap on the notification body -- the
  // demoted-to-body-tap "😄 מעולה". See this file's own doc above for
  // why taskIsOnPhone is the one thing that changes this branch's
  // behavior: it never forces the app to the foreground while the
  // trainee is deliberately using the phone for something else.
  await cancelProactiveSupportNotification();
  const task = await getTask(taskId);
  if (task?.taskIsOnPhone) return;
  await handleEmotionalCheckInChoice("next_task", taskId);
}

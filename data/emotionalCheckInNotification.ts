/**
 * data/emotionalCheckInNotification.ts
 *
 * Nine Functional Improvements task, Improvement 8 ("Emotional
 * Check-In on the Android Lock Screen"): a FOURTH surface for the
 * exact same three choices every other entry point already offers
 * (Home's own "איך אתה מרגיש כרגע?" bar, the Android Home Screen
 * Widget, the Postponement screen's own emotional sub-choice) -- this
 * module never decides anything new; every action routes straight
 * through data/emotionalCheckInRouting.ts's own handleEmotionalCheckInChoice,
 * the one shared decision ARCHI already has.
 *
 * Deliberately a quiet, LOW-importance, deterministic-id notification
 * with AndroidVisibility.PUBLIC (asks Android to show its three
 * actions in full on the lock screen) -- NEVER data/taskAlarm.ts's
 * AlarmType.SET_ALARM_CLOCK + fullScreenAction treatment, which the
 * task's own explicit instructions rule out: "never use full-screen
 * alarm intents to display a permanent check-in," "never bypass
 * Android security." This never requests, and could not grant, any
 * ability to unlock the device or draw over the lock screen -- it only
 * ever asks the OS to reveal an ordinary notification's content and
 * actions on it, exactly the permission every ordinary Android app has.
 *
 * HONEST LIMITATION, investigated rather than assumed: whether the
 * three action buttons are actually tappable directly from a LOCKED
 * (not-yet-unlocked) screen depends on the device/OS/OEM skin, not on
 * anything this module controls --
 *  - Stock Android (and most OEMs) show a notification's actions on
 *    the lock screen once the trainee's own system "Notifications on
 *    lock screen" setting is set to show content, and the notification
 *    itself is not SECRET/PRIVATE (this one requests PUBLIC). Tapping
 *    an action there is generally honored WITHOUT first requiring a
 *    full unlock, by Android's own design, for an ordinary (non-alarm)
 *    notification.
 *  - Android 13+ requires the trainee to grant the runtime
 *    POST_NOTIFICATIONS permission at least once, or NOTHING from this
 *    app (this notification included) can be shown at all --
 *    ensureNotifeePermissionAsync (data/alarmChannel.ts) requests it,
 *    but a trainee who denies it sees nothing, silently, same as every
 *    other notification in this app.
 *  - Xiaomi/MIUI (and some other OEM skins) are documented to apply
 *    their OWN extra battery/background restrictions that can delay or
 *    suppress a quiet, LOW-importance notification while the app is
 *    backgrounded, and some MIUI versions hide notification action
 *    buttons on the lock screen behind an extra tap/swipe regardless of
 *    what this app requests. There is no public API this app can call
 *    to force MIUI to behave like stock Android here -- the most this
 *    module can honestly do is surface the EXISTING
 *    getAlarmPowerManagerInfo()/openAlarmPowerManagerSettings() escape
 *    hatch (data/taskAlarm.ts) so the trainee can grant the relevant
 *    OEM-specific background permission themselves, which is exactly
 *    what build/EmotionalCheckInNotificationSettingsScreen.tsx does.
 *
 * Single deterministic id (same "replace, never duplicate" discipline
 * as data/dailyVisualizationAlarm.ts) -- re-displaying updates the
 * same notification in place, it never stacks a second one.
 */

import notifee, { AndroidVisibility, EventType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";

import { ensureEmotionalCheckInChannelAsync, ensureNotifeePermissionAsync, EMOTIONAL_CHECKIN_CHANNEL_ID } from "./alarmChannel.ts";
import { handleEmotionalCheckInChoice } from "./emotionalCheckInRouting.ts";
import type { EmotionalCheckInChoice } from "./emotionalCheckInRouting.ts";
import { loadEmotionalCheckInNotificationSettings } from "./storage.ts";

const EMOTIONAL_CHECKIN_NOTIFICATION_ID = "archi-emotional-checkin-notification";

const ACTION_CHECKIN_FULL_ARC = "checkin_full_arc";
const ACTION_CHECKIN_SHORTENED_ARC = "checkin_shortened_arc";
const ACTION_CHECKIN_NEXT_TASK = "checkin_next_task";

const ACTION_TO_CHOICE: Record<string, EmotionalCheckInChoice> = {
  [ACTION_CHECKIN_FULL_ARC]: "full_arc",
  [ACTION_CHECKIN_SHORTENED_ARC]: "shortened_arc",
  [ACTION_CHECKIN_NEXT_TASK]: "next_task",
};

/** Never throws -- a failed display just means the quiet reminder silently didn't appear this time (e.g. notification permission denied), never a crash. */
export async function displayEmotionalCheckInNotification(): Promise<void> {
  try {
    await ensureNotifeePermissionAsync();
    await ensureEmotionalCheckInChannelAsync();
    await notifee.displayNotification({
      id: EMOTIONAL_CHECKIN_NOTIFICATION_ID,
      title: "איך אתה מרגיש כרגע?",
      body: "אפשר לבחור ישירות מההתראה הזו, גם ממסך הנעילה.",
      data: { kind: "emotionalCheckIn" },
      android: {
        channelId: EMOTIONAL_CHECKIN_CHANNEL_ID,
        visibility: AndroidVisibility.PUBLIC,
        autoCancel: true,
        pressAction: { id: "default" },
        actions: [
          { title: "😟 פחות טוב", pressAction: { id: ACTION_CHECKIN_FULL_ARC } },
          { title: "🙂 סבבה", pressAction: { id: ACTION_CHECKIN_SHORTENED_ARC } },
          { title: "😄 מעולה", pressAction: { id: ACTION_CHECKIN_NEXT_TASK } },
        ],
      },
    });
  } catch (error) {
    console.error("displayEmotionalCheckInNotification failed", error);
  }
}

export async function cancelEmotionalCheckInNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(EMOTIONAL_CHECKIN_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Called on app start (app/_layout.tsx) and immediately after the
 * trainee flips the toggle in build/EmotionalCheckInNotificationSettingsScreen.tsx
 * -- shows/refreshes the quiet notification when enabled, removes it
 * the moment it's turned off. autoCancel above means a tapped action
 * dismisses it; it reappears the next time the app starts/foregrounds
 * while still enabled, never requiring the trainee to dig back into
 * settings just to see it again tomorrow.
 */
export async function syncEmotionalCheckInNotification(): Promise<void> {
  const settings = await loadEmotionalCheckInNotificationSettings();
  if (settings.enabled) {
    await displayEmotionalCheckInNotification();
  } else {
    await cancelEmotionalCheckInNotification();
  }
}

/**
 * Routed in from data/taskAlarm.ts's own shared handleTaskAlarmEvent
 * (data.kind === "emotionalCheckIn") -- there is only ever ONE
 * onBackgroundEvent/onForegroundEvent registration app-wide (notifee's
 * own API; see app/_layout.tsx's doc), so every notification kind,
 * this one included, is dispatched from that single router, never a
 * second registration of its own.
 *
 * Pressing 😟/🙂/😄 routes through the SAME handleEmotionalCheckInChoice
 * every other entry point already uses -- including its own existing
 * "resume the active task/session, never a fresh countdown" behavior
 * for 😄, and its existing Full/Shortened ARC routing for 😟/🙂. A bare
 * tap on the notification body itself (pressAction.id === "default")
 * does nothing beyond what tapping any notification already does
 * (opening the app) -- there is no single "right" choice to guess at.
 */
export async function handleEmotionalCheckInNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS) return;
  const actionId = event.detail.pressAction?.id;
  if (!actionId) return;
  const choice = ACTION_TO_CHOICE[actionId];
  if (!choice) return;
  handleEmotionalCheckInChoice(choice);
}

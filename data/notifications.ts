/**
 * data/notifications.ts
 *
 * Thin, best-effort wrapper around expo-notifications, used ONLY for
 * one purpose: signaling that a timer (arc/actionTimer.ts /
 * data/storage.ts's TimerRun) has actually reached its persisted
 * absolute end time while the app was backgrounded, locked, or not
 * running JavaScript. It never drives foreground behavior -- the
 * foreground countdown/completion (live/screens.tsx) is derived purely
 * from wall-clock time against the persisted end timestamp, exactly as
 * it would be with no notification system at all.
 *
 * Like data/storage.ts, this depends on a native module and isn't
 * unit-tested with node --test -- it's exercised for real by running
 * the app. Every exported function here is deliberately non-throwing
 * and returns a safe fallback (null / no-op) on any failure: a denied
 * permission, an unsupported platform (e.g. Expo Go's notification
 * limitations), or any unexpected native error must never be treated
 * as a failure of the timer itself -- the persisted end timestamp
 * remains the source of truth regardless of whether a background
 * signal was ever delivered.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ReminderKind, TimerType } from "./storage.ts";

const ANDROID_CHANNEL_ID = "archi-timer-completions";
/** A separate channel from ANDROID_CHANNEL_ID above -- reminders use the OS's own default notification sound (no custom sound file registered for them), never the timer-completion chime, keeping the two signals distinct on Android the same way they already are on iOS (different sound files entirely). */
const ANDROID_REMINDER_CHANNEL_ID = "archi-reminders";
/**
 * Matches the sound file name after expo-notifications' config plugin
 * (app.json) copies assets/sounds/timer_complete.wav into the native
 * project. Underscore, not hyphen: Android resource names can't
 * contain hyphens, and expo-notifications validates this at Prebuild.
 */
const TIMER_COMPLETION_SOUND_FILE = "timer_complete.wav";

let handlerConfigured = false;

/**
 * Marks a scheduled notification's `data` payload as a reminder (see
 * scheduleReminderNotification below) -- what
 * ensureNotificationHandlerConfigured's handler below checks to decide
 * whether the OS should actually surface it.
 */
const REMINDER_DATA_FLAG = "isReminder";

/**
 * While ARCHI is in the foreground, a TIMER-COMPLETION notification is
 * never shown/played by the OS -- foreground completion is handled
 * entirely by data/timerSound.ts's own short sound (see
 * live/screens.tsx), so letting the OS ALSO surface the notification
 * here would risk a second, redundant signal for the same completion.
 * A REMINDER notification (scheduleReminderNotification below) is
 * different: there's no simultaneous in-app signal it would duplicate
 * -- the whole point is to reach the trainee at a moment they are NOT
 * actively looking at ARCHI -- so it's always shown/sounded by the OS,
 * foreground or not. The two are told apart by REMINDER_DATA_FLAG on
 * the notification's own data payload, never by a second handler
 * (there can only ever be one registered at a time). Configuring this
 * is idempotent and cheap, so every scheduling call re-asserts it
 * rather than requiring a separate app-startup wiring step.
 */
function ensureNotificationHandlerConfigured(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isReminder = notification.request.content.data?.[REMINDER_DATA_FLAG] === true;
      return {
        shouldShowBanner: isReminder,
        shouldShowList: isReminder,
        shouldPlaySound: isReminder,
        shouldSetBadge: false,
      };
    },
  });
}

async function ensureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "השלמת טיימר",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: TIMER_COMPLETION_SOUND_FILE,
  });
}

async function ensureAndroidReminderChannelAsync(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
    name: "תזכורות",
    importance: Notifications.AndroidImportance.DEFAULT,
    // No custom `sound` here -- the OS default notification sound, distinct from the timer-completion chime above.
  });
}

/**
 * Requests notification permission at most once: if the OS has never
 * been asked (status "undetermined"), asks now; any other status
 * (already granted, already denied) is read back without prompting
 * again, so a timer starting for the 50th time never re-triggers the
 * permission dialog.
 */
async function ensurePermissionAsync(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status !== Notifications.PermissionStatus.UNDETERMINED) {
    return existing.granted;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export interface ScheduleTimerNotificationInput {
  timerType: TimerType;
  runId: string;
  endTime: Date;
  title: string;
}

/**
 * Schedules exactly one local notification for this specific timer
 * run's absolute end time -- never a relative "seconds from now" tick
 * count, so it fires at the correct wall-clock moment regardless of
 * any delay between computing endTime and this call actually running.
 * Returns the notification's identifier (for later cancellation) or
 * null when scheduling wasn't possible for any reason (permission
 * denied/unavailable, platform limitation, unexpected error) --
 * callers must treat null as "no background signal will arrive," not
 * as an error to surface to the trainee.
 */
export async function scheduleTimerCompletionNotification(input: ScheduleTimerNotificationInput): Promise<string | null> {
  try {
    ensureNotificationHandlerConfigured();
    await ensureAndroidChannelAsync();
    const granted = await ensurePermissionAsync();
    if (!granted) return null;

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: "הזמן שהוגדר הסתיים.",
        sound: Platform.OS === "ios" ? TIMER_COMPLETION_SOUND_FILE : undefined,
        data: { timerType: input.timerType, runId: input.runId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.endTime,
        channelId: Platform.OS === "android" ? ANDROID_CHANNEL_ID : undefined,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Best-effort cancellation -- used both when a timer's completion is
 * handled in the foreground (so the still-pending notification can
 * never fire a delayed, redundant signal afterward) and when a timer
 * is legitimately reset/cleared through existing ARCHI logic. A no-op
 * for a null id (nothing was ever scheduled) and silently ignores any
 * failure (already fired, already cancelled, unsupported) -- there is
 * nothing meaningful to recover from a cancellation failure.
 */
export async function cancelScheduledNotification(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Best-effort; already fired/cancelled/unsupported are all fine to ignore.
  }
}

export interface ScheduleReminderNotificationInput {
  kind: ReminderKind;
  fireAt: Date;
  title: string;
  body: string;
  /** Only meaningful for kind "focusSuccess" -- see data/storage.ts's PendingReminder. Carried into the notification's data payload so tapping it (data/reminders.ts's handleReminderNotificationResponse) knows which flow to open, without re-reading persisted state that may have since changed. */
  arcRequested: boolean;
  /** Only meaningful for kind "routine" (data/storage.ts's ScheduledRoutine) -- which specific routine this notification belongs to, so tapping it (app/_layout.tsx's handleReminderResponse) opens the correct routine's LIVE flow rather than a generic one. Omitted for every other kind. */
  routineId?: string;
}

/**
 * Schedules exactly one local notification for a FUTURE reminder --
 * reuses the exact same scheduleNotificationAsync/DATE-trigger
 * primitive scheduleTimerCompletionNotification above already relies
 * on, for a different purpose (a "come back later" nudge the trainee
 * chose, not a countdown completion signal), rather than a second,
 * competing scheduling mechanism. Always fires at the given absolute
 * wall-clock moment, regardless of any delay between computing fireAt
 * and this call actually running. Returns the notification's
 * identifier (for later cancellation -- see
 * data/storage.ts's PendingReminder.notificationId) or null when
 * scheduling wasn't possible for any reason (permission denied/
 * unavailable, platform limitation, unexpected error) -- callers must
 * treat null as "no reminder will arrive," not as an error to surface
 * to the trainee.
 */
export async function scheduleReminderNotification(input: ScheduleReminderNotificationInput): Promise<string | null> {
  try {
    ensureNotificationHandlerConfigured();
    await ensureAndroidReminderChannelAsync();
    const granted = await ensurePermissionAsync();
    if (!granted) return null;

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: {
          [REMINDER_DATA_FLAG]: true,
          kind: input.kind,
          arcRequested: input.arcRequested,
          ...(input.routineId !== undefined ? { routineId: input.routineId } : {}),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.fireAt,
        channelId: Platform.OS === "android" ? ANDROID_REMINDER_CHANNEL_ID : undefined,
      },
    });
  } catch {
    return null;
  }
}

/**
 * data/alarmChannel.ts
 *
 * The one shared notifee channel + permission-request primitives every
 * alarm kind in this app reuses (task-start, ARC, and now the Daily
 * Visualization reminder) -- extracted out of data/taskAlarm.ts (which
 * originally defined them privately) so data/dailyVisualizationAlarm.ts
 * can reuse them too WITHOUT creating a circular import: data/taskAlarm.ts's
 * own shared handleTaskAlarmEvent must dispatch INTO
 * data/dailyVisualizationAlarm.ts (there is only ever one
 * onBackgroundEvent/onForegroundEvent handler registered app-wide, per
 * notifee's own API -- see app/_layout.tsx), so the dependency could
 * never also run the other way. Behavior is byte-for-byte identical to
 * what data/taskAlarm.ts always did; only the file it lives in changed.
 */

import notifee, { AndroidForegroundServiceType, AndroidImportance } from "@notifee/react-native";

/**
 * ARCHI -- Unified Development Specification task, Part 12 ("CRITICAL:
 * TASK NOTIFICATIONS MUST APPEAR AT THE TOP OF THE SCREEN"): Android
 * locks a notification channel's importance (and every other setting)
 * the moment it is first created on a given device -- there is no API
 * to raise it later, only the trainee can do that manually from the
 * OS's own channel settings. This id already imported HIGH importance
 * from the very first time it was ever created, so no installed device
 * should actually have a stale lower-importance version of it -- but
 * the "-v2" suffix is kept anyway as a safe, explicit insurance policy
 * the spec itself asks for: if this channel's own settings are ever
 * found wrong again in the future, bump the suffix again rather than
 * editing the settings of an id that might already exist on real
 * devices. Never reuse a suffix once shipped.
 */
export const TASK_ALARM_CHANNEL_ID = "archi-task-alarm-v2";

let channelEnsured = false;

/** Requirement: "let it ring through Do Not Disturb" -- bypassDnd is set on this one dedicated channel only; every other reminder kind (data/notifications.ts) still always respects Do Not Disturb. */
export async function ensureTaskAlarmChannelAsync(): Promise<void> {
  if (channelEnsured) return;
  channelEnsured = true;
  await notifee.createChannel({
    id: TASK_ALARM_CHANNEL_ID,
    name: "שעון מעורר למשימות",
    importance: AndroidImportance.HIGH,
    sound: "default",
    vibration: true,
    bypassDnd: true,
  });
}

/**
 * Nine Functional Improvements task, Improvement 8 ("Emotional
 * Check-In on the Android Lock Screen"): a DELIBERATELY LOW-importance
 * channel -- no sound, no heads-up popup, respects Do Not Disturb
 * (never bypassDnd, unlike TASK_ALARM_CHANNEL_ID above) -- "a quiet,
 * optional... notification, never an intrusive alert." Its own
 * separate channel (never TASK_ALARM_CHANNEL_ID) so the trainee's own
 * Android-level channel settings for alarms are never silently also
 * controlling this unrelated, much gentler notification.
 */
export const EMOTIONAL_CHECKIN_CHANNEL_ID = "archi-emotional-checkin";

let checkInChannelEnsured = false;

export async function ensureEmotionalCheckInChannelAsync(): Promise<void> {
  if (checkInChannelEnsured) return;
  checkInChannelEnsured = true;
  await notifee.createChannel({
    id: EMOTIONAL_CHECKIN_CHANNEL_ID,
    name: "בדיקת מצב רגשי",
    importance: AndroidImportance.LOW,
  });
}

/**
 * ARCHI -- Complete the Non-Interrupting Notification System task,
 * Part 1/5/6: the "soft" reminder kinds (routine, ARC GYM, sub-goal
 * targets, four-week/personal-development-program weeks, life-manifest
 * sub-goals/targets, deferred "come back later" and Success Focus
 * reminders, and the Daily Visualization pre-task reminder) all move
 * from expo-notifications' scheduleNotificationAsync to notifee's
 * createTriggerNotification + asForegroundService, specifically so
 * data/taskAlarm.ts's own registerTaskAlarmForegroundService callback
 * runs (via notifee's HeadlessTask mechanism, confirmed by reading
 * node_modules/@notifee/react-native's own HeadlessTask.java --
 * createReactContextAndScheduleTask starts a FRESH React instance when
 * none exists, i.e. even after the whole app process was killed) and
 * can check the persisted busy state BEFORE the notification is ever
 * shown -- never only while JS happens to already be running. Reuses
 * the exact same NATIVE id ("archi-reminders-v2") the pre-existing
 * expo-notifications reminder channel already created, so there is
 * still only ONE real Android channel (and one "תזכורות" entry in the
 * trainee's own channel settings) -- Android channels are a single,
 * OS-level object keyed by id regardless of which JS library's wrapper
 * created it, so this call is a safe, idempotent no-op on a device
 * where expo's own call already created it, and creates it correctly
 * (same settings) on a device where notifee's call happens first.
 */
export const NOTIFEE_REMINDER_CHANNEL_ID = "archi-reminders-v2";

let notifeeReminderChannelEnsured = false;

export async function ensureNotifeeReminderChannelAsync(): Promise<void> {
  if (notifeeReminderChannelEnsured) return;
  notifeeReminderChannelEnsured = true;
  await notifee.createChannel({
    id: NOTIFEE_REMINDER_CHANNEL_ID,
    name: "תזכורות",
    importance: AndroidImportance.HIGH,
  });
}

/**
 * The non-intrusive fallback a suppressible reminder is redisplayed on
 * while the trainee is busy (Part 3: "ensure its actual Android channel
 * and vibration settings are non-intrusive... do not post a supposedly
 * silent notification to an existing high-importance channel that can
 * still cause a sound"). LOW importance -- no heads-up, no sound, no
 * vibration -- and its OWN id, never NOTIFEE_REMINDER_CHANNEL_ID itself
 * reconfigured in place (Android locks a channel's importance/sound at
 * creation; the exact same "never mutate, always version" discipline
 * every other channel in this file already follows). Still respects Do
 * Not Disturb (no bypassDnd), same as every other reminder channel.
 */
export const QUIET_REMINDER_CHANNEL_ID = "archi-reminders-quiet-v1";

let quietReminderChannelEnsured = false;

export async function ensureQuietReminderChannelAsync(): Promise<void> {
  if (quietReminderChannelEnsured) return;
  quietReminderChannelEnsured = true;
  await notifee.createChannel({
    id: QUIET_REMINDER_CHANNEL_ID,
    name: "תזכורות שקטות (בזמן עיסוק)",
    importance: AndroidImportance.LOW,
  });
}

/**
 * ARC Reminders task: the ONE task-transition notification's own
 * channel (data/taskTransitionNotification.ts) -- HIGH importance (a
 * heads-up pop-up, since "the timer just ended, here's what's current/
 * next" is time-sensitive), but never bypassDnd, unlike
 * TASK_ALARM_CHANNEL_ID -- the ARC Reminders spec explicitly calls this
 * an ordinary, swipe-dismissible notification, never an alarm. Its own
 * separate channel so a trainee's Android-level channel settings for
 * this notification specifically (e.g. muting it) never also silence
 * the real task-start alarm.
 */
export const TASK_TRANSITION_CHANNEL_ID = "archi-task-transition-v1";

let taskTransitionChannelEnsured = false;

export async function ensureTaskTransitionChannelAsync(): Promise<void> {
  if (taskTransitionChannelEnsured) return;
  taskTransitionChannelEnsured = true;
  await notifee.createChannel({
    id: TASK_TRANSITION_CHANNEL_ID,
    name: "מעבר בין משימות",
    importance: AndroidImportance.HIGH,
  });
}

/**
 * ARCHI -- Final Critical Check: Prevent Sound Before Busy-State
 * Evaluation task. CONFIRMED by decompiling notifee's own
 * app.notifee.core.ForegroundService.class (bytecode, not guessed):
 * `onStartCommand` calls `Service.startForeground(id, notification,
 * type)` SYNCHRONOUSLY, using the Notification built directly from
 * whatever was scheduled (title/body/channel/sound), and ONLY AFTER
 * that constructs and dispatches the ForegroundServiceEvent that
 * eventually reaches our JS registerForegroundService callback.
 * `asForegroundService: true` alone therefore does NOT prevent the
 * originally-scheduled notification from being posted -- with its
 * channel's own sound/heads-up -- before hasActiveTaskConflict ever
 * runs. This channel exists ONLY to satisfy Android's hard
 * startForeground() requirement (a foreground service must post SOME
 * notification within seconds of starting) with zero user-facing
 * effect: no sound, no vibration, LOW importance (no heads-up), never
 * bypassDnd. Every alarm/reminder kind that waits on a busy-state
 * decision (task-start, ARC, morning, every notifee-native reminder,
 * Daily Visualization) schedules its TRIGGER on this channel; the
 * REAL, user-facing notification is then explicitly displayed (loud or
 * quiet, per the decision) from inside the JS callback, after
 * hasActiveTaskConflict resolves -- never from the initial post.
 */
export const SILENT_DELIVERY_CHANNEL_ID = "archi-silent-delivery-v1";

let silentDeliveryChannelEnsured = false;

export async function ensureSilentDeliveryChannelAsync(): Promise<void> {
  if (silentDeliveryChannelEnsured) return;
  silentDeliveryChannelEnsured = true;
  await notifee.createChannel({
    id: SILENT_DELIVERY_CHANNEL_ID,
    name: "מסירה שקטה (בדיקת מצב עיסוק)",
    importance: AndroidImportance.LOW,
  });
}

/**
 * ARCHI -- Final Critical Check task, Part 2 (foreground-service
 * constraints): notifee's own bundled native Service
 * (app.notifee.core.ForegroundService, inside its .aar) declares itself
 * in ITS OWN manifest with android:foregroundServiceType="shortService"
 * (confirmed by unzipping core-*.aar and reading AndroidManifest.xml
 * directly -- the exact same technique data/taskAlarm.ts's own
 * TASK_ALARM_FOREGROUND_SERVICE_TYPES comment documents). EVERY
 * asForegroundService: true notification in this app -- task-start/ARC/
 * morning alarms, every notifee-native "soft" reminder
 * (data/notifications.ts), and Daily Visualization
 * (data/dailyVisualizationAlarm.ts) -- is handled by this exact same
 * Service class, so they must all request this exact same type, never a
 * mismatched or omitted one, for the identical Android-14+ reason
 * data/taskAlarm.ts's own alarms already had to fix. Shared here (rather
 * than each module keeping its own private copy) so the one type value
 * can never silently drift between them.
 */
export const ALARM_FOREGROUND_SERVICE_TYPES = [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE];

let permissionRequested = false;

/** notifee has its OWN permission-request API, separate from expo-notifications' (data/notifications.ts's ensurePermissionAsync) -- asked at most once per app run. */
export async function ensureNotifeePermissionAsync(): Promise<void> {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    await notifee.requestPermission();
  } catch {
    // Best-effort -- if this throws, the actual createTriggerNotification call below will surface its own error.
  }
}

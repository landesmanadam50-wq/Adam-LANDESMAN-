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
import notifee, { AlarmType, AndroidVisibility, TriggerType } from "@notifee/react-native";
import type { AndroidInput } from "@notifee/react-native";
import { Platform } from "react-native";
import { loadArcTaskReminderSettings } from "./storage.ts";
import type { ReminderKind, TimerType } from "./storage.ts";
// Intentional circular import with ./taskAlarm.ts (which imports
// cancelScheduledNotification from here) -- safe for the exact same
// reason data/morningAlarm.ts's own circular import of taskAlarm.ts is
// safe: hasActiveTaskConflict is a plain, hoisted `export async
// function` declaration, never invoked at either module's own top
// level, only from inside ensureNotificationHandlerConfigured's
// handler below, long after both modules have finished loading.
import { hasActiveTaskConflict } from "./taskAlarm.ts";
import { ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureNotifeeReminderChannelAsync, ensureQuietReminderChannelAsync, ensureSilentDeliveryChannelAsync, NOTIFEE_REMINDER_CHANNEL_ID, QUIET_REMINDER_CHANNEL_ID, SILENT_DELIVERY_CHANNEL_ID } from "./alarmChannel.ts";

const ANDROID_CHANNEL_ID = "archi-timer-completions";
/**
 * A separate channel from ANDROID_CHANNEL_ID above -- reminders use the
 * OS's own default notification sound (no custom sound file registered
 * for them), never the timer-completion chime, keeping the two signals
 * distinct on Android the same way they already are on iOS (different
 * sound files entirely).
 *
 * ARCHI -- Unified Development Specification task, Part 12 ("CRITICAL:
 * TASK NOTIFICATIONS MUST APPEAR AT THE TOP OF THE SCREEN"): this
 * channel was DEFAULT importance, which Android never shows as a
 * heads-up banner regardless of anything else configured on the
 * notification itself -- one concrete, confirmed root cause of
 * "reminders not appearing as visible heads-up banners" for every
 * reminder kind that goes through it (taskTimerEnded included).
 * Android locks a channel's importance at creation and this id may
 * already exist at the old importance on a real device, so the fix is
 * a brand-new versioned id at HIGH importance, never an in-place edit
 * of the old one's settings.
 */
const ANDROID_REMINDER_CHANNEL_ID = "archi-reminders-v2";
/**
 * Matches the sound file name after expo-notifications' config plugin
 * (app.json) copies assets/sounds/timer_complete.wav into the native
 * project. Underscore, not hyphen: Android resource names can't
 * contain hyphens, and expo-notifications validates this at Prebuild.
 */
const TIMER_COMPLETION_SOUND_FILE = "timer_complete.wav";

/**
 * Task-start alarm vibration task: Android locks a notification
 * channel's sound/vibration the moment it's first created -- there is
 * no API to change an existing channel's settings later, only the
 * trainee can do that from the OS's own channel settings. So instead of
 * one mutable "task start" channel, there are four fixed channels here,
 * one per sound/vibration combination (see
 * resolveTaskStartChannelId below) -- picking the right ALREADY-correct
 * channel at schedule time, rather than trying to reconfigure one
 * channel per trainee preference, is what actually makes "turn sound
 * and vibration on/off separately" (requirement 7) take effect
 * immediately, not just for channels created after a future OS update.
 * Importance HIGH so the alarm is far more likely to actually alert
 * (heads-up + sound/vibration) even with the screen locked (requirement
 * 2) -- still fully subject to the OS's own Do Not Disturb/permission
 * rules, since `bypassDnd` is never set here (requirement 8).
 */
const ANDROID_TASK_START_CHANNEL_SOUND_VIBRATION_ID = "archi-task-start-sound-vibration";
const ANDROID_TASK_START_CHANNEL_SOUND_ONLY_ID = "archi-task-start-sound-only";
const ANDROID_TASK_START_CHANNEL_VIBRATION_ONLY_ID = "archi-task-start-vibration-only";
const ANDROID_TASK_START_CHANNEL_SILENT_ID = "archi-task-start-silent";

/**
 * A short, clearly-felt triple pulse (requirement 3: "רצף קצר ומורגש
 * של רטטים, ולא רטט בודד חלש") -- [delay, on, off, on, off, on] in
 * milliseconds, never the OS's own single-buzz default.
 */
const TASK_START_ALARM_VIBRATION_PATTERN = [0, 350, 150, 350, 150, 350];

function resolveTaskStartChannelId(soundEnabled: boolean, vibrationEnabled: boolean): string {
  if (soundEnabled && vibrationEnabled) return ANDROID_TASK_START_CHANNEL_SOUND_VIBRATION_ID;
  if (soundEnabled) return ANDROID_TASK_START_CHANNEL_SOUND_ONLY_ID;
  if (vibrationEnabled) return ANDROID_TASK_START_CHANNEL_VIBRATION_ONLY_ID;
  return ANDROID_TASK_START_CHANNEL_SILENT_ID;
}

async function ensureAndroidTaskStartChannelAsync(soundEnabled: boolean, vibrationEnabled: boolean): Promise<string> {
  const channelId = resolveTaskStartChannelId(soundEnabled, vibrationEnabled);
  if (Platform.OS !== "android") return channelId;
  await Notifications.setNotificationChannelAsync(channelId, {
    name: "שעון מעורר למשימות",
    importance: Notifications.AndroidImportance.HIGH,
    sound: soundEnabled ? TIMER_COMPLETION_SOUND_FILE : null,
    enableVibrate: vibrationEnabled,
    vibrationPattern: vibrationEnabled ? TASK_START_ALARM_VIBRATION_PATTERN : null,
  });
  return channelId;
}

let handlerConfigured = false;

/**
 * Marks a scheduled notification's `data` payload as a reminder (see
 * scheduleReminderNotification below) -- what
 * ensureNotificationHandlerConfigured's handler below checks to decide
 * whether the OS should actually surface it. Exported so
 * data/taskAlarm.ts's own registerTaskAlarmForegroundService/
 * handleTaskAlarmEvent can recognize a notifee-delivered reminder by the
 * exact SAME flag, never a second, re-derived one.
 */
export const REMINDER_DATA_FLAG = "isReminder";

/**
 * ARCHI -- Complete the Non-Interrupting Notification System task,
 * Part 1/6: these four kinds are about the task the trainee is ALREADY
 * doing -- a timer they started reaching its end, a postponed task's
 * own chosen return time, or (taskScheduledStart) the superseded,
 * no-longer-called predecessor of data/taskAlarm.ts's own native
 * task-start alarm. None of these is "an unrelated reminder" the
 * busy-state policy is meant to guard against (spec: "Keep current-task
 * timer completion notifications working: they belong to the task the
 * user is already performing and are not unrelated interruptions"), so
 * they stay on the ORIGINAL expo-notifications delivery path, completely
 * untouched by this task -- lowest possible risk to something that
 * already works correctly, and no busy check is even meaningful for
 * them (suppressing a task's own timer-end signal because that SAME
 * task is "active" would be nonsensical).
 *
 * Every OTHER reminder kind (routine, ARC GYM, sub-goal target,
 * four-week/personal-development-program week, life-manifest, deferred
 * "come back later," Success Focus) is a genuinely UNRELATED scheduled
 * exercise/goal -- exactly what the busy-state policy must suppress.
 */
const CURRENT_TASK_REMINDER_KINDS: ReadonlySet<ReminderKind> = new Set(["taskTimerEnded", "restTimerEnded", "postponedTaskReturn", "taskScheduledStart"]);

/**
 * True for every reminder kind that must respect the busy-state policy
 * (never ring/heads-up/sound on top of an active task or ARC session),
 * false for the four current-task kinds above. The single source of
 * truth both scheduleReminderNotification below (which native mechanism
 * to use) and data/taskAlarm.ts's own delivery dispatcher (whether to
 * apply the busy check) read, so the two can never silently disagree
 * about which kinds are "interruptive."
 */
export function isInterruptiveReminderKind(kind: ReminderKind): boolean {
  return !CURRENT_TASK_REMINDER_KINDS.has(kind);
}

/**
 * Tells a notifee-native reminder id (minted by
 * scheduleNativeReminderNotification below) apart from every other id
 * this module hands out -- expo-notifications auto-generates its own
 * UUID-shaped ids, which never start with this prefix -- so
 * cancelScheduledNotification can route a given id to the correct
 * underlying mechanism without guessing. Exactly the same deterministic-
 * prefix discipline data/taskAlarm.ts's own isNativeAlarmId already
 * uses for the same reason.
 */
const REMINDER_NATIVE_ID_PREFIX = "reminder-";

function generateReminderNativeId(): string {
  return `${REMINDER_NATIVE_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The non-intrusive fallback a suppressible reminder (or the Daily
 * Visualization alarm, data/dailyVisualizationAlarm.ts) is redisplayed
 * on while the trainee is busy -- Part 3: "ensure its actual Android
 * channel and vibration settings are non-intrusive... do not post a
 * supposedly silent notification to an existing high-importance channel
 * that can still cause a sound." Never deletes the reminder outright --
 * it stays reachable in the notification shade, satisfying "preserve
 * the scheduled reminder information... as a silent notification."
 * Called from data/taskAlarm.ts's own delivery dispatcher, never a
 * second notification-building implementation of its own.
 */
export interface ReminderRedisplayOptions {
  /**
   * Preserves a scheduled notification's own action buttons (e.g.
   * data/dailyVisualizationAlarm.ts's "התחל ויזואליזציה") across the
   * redisplay -- omitted for every kind that never had one of its own.
   * `input` (ARC Reminders task, requirement -- Active Recall inline
   * reply): notifee's own existing `AndroidInput` support, never
   * exercised in this repo before this -- an action carrying it lets
   * the trainee type an answer directly from the notification/lock
   * screen, with no screen opened. Omitted for every action that isn't
   * the one inline-reply action.
   */
  actions?: { title: string; pressAction: { id: string }; input?: true | AndroidInput }[];
  pressAction?: { id: string };
  /** ARC Reminders task: carries the original trigger notification's own lock-screen visibility through to the real, user-facing redisplay -- same read-back pattern as `actions`/`pressAction` above, never a second decision point. Omitted (native default, PRIVATE) for every kind scheduled before this setting existed. */
  visibility?: AndroidVisibility;
}

export async function redisplayReminderQuiet(id: string, title: string, body: string, data: Record<string, string | number | object>, options?: ReminderRedisplayOptions): Promise<void> {
  try {
    await ensureQuietReminderChannelAsync();
    await notifee.displayNotification({
      id,
      title,
      body,
      data,
      android: {
        channelId: QUIET_REMINDER_CHANNEL_ID,
        autoCancel: true,
        pressAction: options?.pressAction ?? { id: "default" },
        actions: options?.actions,
        visibility: options?.visibility,
      },
    });
  } catch (error) {
    console.error("redisplayReminderQuiet failed", error);
  }
}

/** The normal, audible/heads-up redisplay used when the trainee is NOT busy -- the loud counterpart to redisplayReminderQuiet above, same shared primitive, same reasons. */
export async function redisplayReminderLoud(id: string, title: string, body: string, data: Record<string, string | number | object>, options?: ReminderRedisplayOptions): Promise<void> {
  try {
    await ensureNotifeeReminderChannelAsync();
    await notifee.displayNotification({
      id,
      title,
      body,
      data,
      android: {
        channelId: NOTIFEE_REMINDER_CHANNEL_ID,
        autoCancel: true,
        pressAction: options?.pressAction ?? { id: "default" },
        actions: options?.actions,
        visibility: options?.visibility,
      },
    });
  } catch (error) {
    console.error("redisplayReminderLoud failed", error);
  }
}

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
 *
 * ARCHI -- Regression Audit, Part 1 (notification audit): this handler
 * is the actual DELIVERY boundary for every reminder kind that goes
 * through expo-notifications rather than notifee (routine, ARC GYM,
 * sub-goal target, four-week-program-week, personal-development-
 * program-week, life-manifest, and the superseded-but-still-reachable
 * taskScheduledStart) -- the exact same principle data/taskAlarm.ts's
 * own registerForegroundService already applies to its own alarms.
 * Previously this handler decided shouldShowBanner/shouldPlaySound
 * purely from isReminder, with NO regard for whether the trainee is
 * currently mid-task or mid-ARC -- a confirmed gap matching the audit's
 * explicit "ARC GYM reminders... verify all relevant reminders respect
 * active task and ARC states" requirement. Busy now suppresses the
 * banner and sound (never an "unrelated reminder sound" or "intrusive
 * heads-up alert" on top of an active session) while still setting
 * shouldShowList: true -- the notification is never deleted, only
 * quieted, so it stays reachable in the notification shade afterward
 * (never silently lost, same "preserve... so it remains accessible"
 * principle as the task-alarm suppression path). A reminder with its
 * own taskId (taskScheduledStart) excludes that task from the "another
 * task is active" check, exactly as a real task-start alarm does; every
 * other reminder kind has no task of its own, so "" (never a real
 * generated task id) means no exclusion at all.
 *
 * HONEST LIMITATION: this JS-level handler only runs while the app's
 * own JavaScript is alive (foregrounded, or backgrounded with the
 * process still running) -- it can never run for a fully killed app,
 * where the OS decides purely from the channel's own fixed importance
 * with no app code involved at all, same documented limitation every
 * other alarm/reminder kind in this codebase already carries.
 */
function ensureNotificationHandlerConfigured(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isReminder = notification.request.content.data?.[REMINDER_DATA_FLAG] === true;
      if (!isReminder) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      const reminderTaskId = typeof notification.request.content.data?.taskId === "string" ? notification.request.content.data.taskId : "";
      const busy = await hasActiveTaskConflict(reminderTaskId);
      return {
        shouldShowBanner: !busy,
        shouldShowList: true,
        shouldPlaySound: !busy,
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
    importance: Notifications.AndroidImportance.HIGH,
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
  // A notifee-native reminder (see scheduleNativeReminderNotification
  // below) is cancelled through notifee's own API -- expo-notifications'
  // cancelScheduledNotificationAsync has no idea these ids even exist.
  if (notificationId.startsWith(REMINDER_NATIVE_ID_PREFIX)) {
    try {
      await notifee.cancelTriggerNotification(notificationId);
      await notifee.cancelNotification(notificationId);
    } catch {
      // Best-effort -- nothing to cancel is not an error.
    }
    return;
  }
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
  /** Sub-goal execution task: only meaningful for kind "arcGoalTarget" -- which specific ArcGoalTarget this notification belongs to, so tapping it deep-links straight to that target's own screen (spec section 9: "Deep-link to the exact target"), never a generic one. Omitted for every other kind. */
  targetId?: string;
  /** Sub-goal execution task: only meaningful for kind "fourWeekProgramWeek" -- which ArcGoal's own four-week dashboard to open. Omitted for every other kind. */
  arcGoalId?: string;
  /** Phase 9: only meaningful for kind "personalDevelopmentProgramWeek" -- which Personal Development program's own four-week dashboard to open. Omitted for every other kind. */
  personalDevelopmentProgramId?: string;
  /** Hebrew BUILD/LIVE rework spec: only meaningful for kind "taskTimerEnded" -- which specific Task this notification belongs to, so tapping it deep-links straight to that task's own screen. Omitted for every other kind. */
  taskId?: string;
  /** Task-start alarm vibration task, requirement 7: only meaningful for kind "taskScheduledStart" -- the trainee's own saved preference (data/storage.ts's TaskAlarmPreferences), read by the caller and passed in here rather than this module reaching into storage itself. Both default to true (sound AND vibration, requirement 1) when omitted, so every OTHER reminder kind's existing call sites are entirely unaffected. */
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  /** ARCHI -- Unified Development Specification task, Part 2: only meaningful for kind "arcGymReminder" -- which exercise type/id to deep-link to when tapped (app/_layout.tsx's handleReminderResponse). Omitted for every other kind. */
  arcGymExerciseKind?: "behaviour" | "memory";
  arcGymExerciseId?: string;
  /** ARC Reminders task: only meaningful for the "arcMantra*"/"arcRecallQuestion" kinds -- which specific ArcMantraReminder/ArcRecallReminder this notification belongs to (arc/arcReminders.ts), so tapping an "arcRecallQuestion" notification (data/reminders.ts's routeTappedReminder) opens that exact reminder's own chat thread. Omitted for every other kind. */
  arcReminderId?: string;
  /** ARC Reminders task: only meaningful for kind "arcRecallQuestion" -- the exact ArcRecallChatMessage (arc/arcReminders.ts) this specific delivered notification corresponds to, so an inline-reply typed from this notification (data/taskAlarm.ts's own handleTaskAlarmEvent) records the answer against the SAME message a tap would open, never a different/ambiguous one. Omitted for every other kind. */
  arcRecallChatMessageId?: string;
}

/** ARC Reminders task: the one inline-reply action's own id -- data/taskAlarm.ts's handleTaskAlarmEvent checks for this exact id (with event.detail.input present) before ever falling through to the generic routeTappedReminder tap handling every other soft reminder kind already uses. */
export const ACTION_ARC_RECALL_ANSWER = "arc_recall_answer";

/**
 * ARCHI -- Complete the Non-Interrupting Notification System task,
 * Part 1: schedules a suppressible reminder through notifee's
 * createTriggerNotification with asForegroundService: true -- the
 * SAME native mechanism data/taskAlarm.ts's task-start/ARC/morning
 * alarms already use, reused rather than a second, parallel alarm
 * engine. This is the one change that makes the busy-state check
 * reliable even when the whole app process has been killed: read
 * node_modules/@notifee/react-native/android/src/main/java/io/invertase/notifee/HeadlessTask.java
 * directly (the same "confirm the actual native code, don't assume"
 * technique already used elsewhere in this codebase) and confirmed
 * createReactContextAndScheduleTask starts a FRESH React instance when
 * none currently exists -- i.e. notifee's own foreground-service
 * trigger mechanism boots JS and runs the registered
 * registerForegroundService callback BEFORE the notification is ever
 * shown, even from a cold, previously-killed process. A plain
 * expo-notifications scheduled notification has no equivalent hook --
 * the OS shows it straight from the channel's own fixed settings with
 * zero app code involved when the process is dead, which is exactly
 * the gap this migration closes.
 *
 * Never rings, never shows full screen, never uses the task-alarm
 * channel -- data/taskAlarm.ts's own dispatcher explicitly branches
 * reminder-kind notifications away from the ring-based `proceed()`
 * machinery into its own quiet-or-loud redisplay decision (see that
 * file's own isInterruptiveReminder handling).
 */
async function scheduleNativeReminderNotification(input: ScheduleReminderNotificationInput): Promise<string | null> {
  try {
    await ensureNotifeePermissionAsync();
    // ARCHI -- Final Critical Check task: the channel used here only
    // needs to satisfy Android's startForeground() requirement (the
    // notification this produces is replaced by redisplayReminderQuiet/
    // Loud inside data/taskAlarm.ts's own dispatcher, AFTER
    // hasActiveTaskConflict resolves) -- it must never be the loud
    // NOTIFEE_REMINDER_CHANNEL_ID, confirmed (by decompiling notifee's own
    // ForegroundService.class) to post synchronously, with whatever
    // sound/importance its channel carries, BEFORE the busy check ever
    // runs. ensureNotifeeReminderChannelAsync() is still called later, by
    // redisplayReminderLoud itself, when the loud channel is actually used.
    await ensureSilentDeliveryChannelAsync();
    // ARC Reminders task: one shared settings toggle
    // (ArcTaskReminderSettings.hideContentOnLockScreen) applies uniformly
    // to every reminder kind scheduled through this one function -- read
    // fresh here (never cached) so a later settings change takes effect
    // on the very next notification scheduled, with no re-arming step.
    const settings = await loadArcTaskReminderSettings();
    const visibility = settings.hideContentOnLockScreen ? AndroidVisibility.PRIVATE : AndroidVisibility.PUBLIC;
    const id = generateReminderNativeId();
    await notifee.createTriggerNotification(
      {
        id,
        title: input.title,
        body: input.body,
        data: {
          // notifee's own Notification.data type is { [key]: string | object | number }
          // -- no boolean -- so both flags are carried as strings here (the
          // only place either is ever read back is the dispatcher's own
          // truthiness check; nothing reads arcRequested off a
          // notifee-delivered reminder's data payload at all).
          [REMINDER_DATA_FLAG]: "true",
          kind: input.kind,
          arcRequested: String(input.arcRequested),
          ...(input.routineId !== undefined ? { routineId: input.routineId } : {}),
          ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
          ...(input.arcGoalId !== undefined ? { arcGoalId: input.arcGoalId } : {}),
          ...(input.personalDevelopmentProgramId !== undefined ? { personalDevelopmentProgramId: input.personalDevelopmentProgramId } : {}),
          ...(input.arcGymExerciseKind !== undefined ? { arcGymExerciseKind: input.arcGymExerciseKind } : {}),
          ...(input.arcGymExerciseId !== undefined ? { arcGymExerciseId: input.arcGymExerciseId } : {}),
          ...(input.arcReminderId !== undefined ? { arcReminderId: input.arcReminderId } : {}),
          ...(input.arcRecallChatMessageId !== undefined ? { arcRecallChatMessageId: input.arcRecallChatMessageId } : {}),
        },
        android: {
          channelId: SILENT_DELIVERY_CHANNEL_ID,
          asForegroundService: true,
          // ARCHI -- Final Critical Check task, Part 2: matches the exact
          // type notifee's own bundled Service class declares in its
          // manifest -- see data/alarmChannel.ts's own doc on
          // ALARM_FOREGROUND_SERVICE_TYPES for why an omitted/mismatched
          // type here risks the same Android-14+ startForeground()
          // failure data/taskAlarm.ts's own alarms already had to fix.
          foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,
          autoCancel: true,
          pressAction: { id: "default" },
          visibility,
          // ARC Reminders task, Active Recall inline reply: the ONE
          // action notifee's existing (never-before-exercised in this
          // repo) AndroidInput powers -- answering directly from the
          // notification/lock screen, no screen opened. data/taskAlarm.ts's
          // own handleTaskAlarmEvent reads this answer straight out of
          // the ACTION_PRESS event before it would otherwise fall through
          // to the generic routeTappedReminder tap handling. Carried
          // through this SAME trigger notification's own `android.actions`
          // by data/taskAlarm.ts's existing `redisplayOptions = { actions:
          // notification.android?.actions, ... }` read-back (see that
          // file) -- never duplicated at redisplay time. Every other kind
          // gets no actions at all, exactly as before this task.
          actions:
            input.kind === "arcRecallQuestion"
              ? [{ title: "השב", pressAction: { id: ACTION_ARC_RECALL_ANSWER }, input: { allowFreeFormInput: true, placeholder: "התשובה שלך..." } }]
              : undefined,
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: input.fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
    return id;
  } catch (error) {
    console.error("scheduleNativeReminderNotification failed", error);
    return null;
  }
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
 * to the trainee. ONLY still used for the four current-task kinds
 * (isInterruptiveReminderKind false) -- every other kind is redirected
 * to scheduleNativeReminderNotification above.
 */
export async function scheduleReminderNotification(input: ScheduleReminderNotificationInput): Promise<string | null> {
  // ARCHI -- Complete the Non-Interrupting Notification System task,
  // Part 1/6: every kind subject to the busy-state policy is scheduled
  // through notifee's own createTriggerNotification + asForegroundService
  // instead -- see scheduleNativeReminderNotification's own doc for why.
  // The four current-task kinds below this branch are completely
  // unaffected, still scheduled exactly as they always were.
  if (isInterruptiveReminderKind(input.kind)) {
    return scheduleNativeReminderNotification(input);
  }
  try {
    ensureNotificationHandlerConfigured();
    const granted = await ensurePermissionAsync();
    if (!granted) return null;

    // Task-start alarm vibration task: its own dedicated channel
    // (sound AND vibration, requirement 1) instead of the shared
    // reminder channel above -- see ensureAndroidTaskStartChannelAsync's
    // own doc for why this can't just be a config tweak to that one
    // channel. Every other reminder kind below is completely unchanged.
    if (input.kind === "taskScheduledStart") {
      const soundEnabled = input.soundEnabled ?? true;
      const vibrationEnabled = input.vibrationEnabled ?? true;
      const channelId = await ensureAndroidTaskStartChannelAsync(soundEnabled, vibrationEnabled);
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: input.title,
          body: input.body,
          sound: Platform.OS === "ios" && soundEnabled ? TIMER_COMPLETION_SOUND_FILE : undefined,
          data: {
            [REMINDER_DATA_FLAG]: true,
            kind: input.kind,
            arcRequested: input.arcRequested,
            ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: input.fireAt,
          channelId: Platform.OS === "android" ? channelId : undefined,
        },
      });
    }

    await ensureAndroidReminderChannelAsync();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: {
          [REMINDER_DATA_FLAG]: true,
          kind: input.kind,
          arcRequested: input.arcRequested,
          ...(input.routineId !== undefined ? { routineId: input.routineId } : {}),
          ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
          ...(input.arcGoalId !== undefined ? { arcGoalId: input.arcGoalId } : {}),
          ...(input.personalDevelopmentProgramId !== undefined ? { personalDevelopmentProgramId: input.personalDevelopmentProgramId } : {}),
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          ...(input.arcGymExerciseKind !== undefined ? { arcGymExerciseKind: input.arcGymExerciseKind } : {}),
          ...(input.arcGymExerciseId !== undefined ? { arcGymExerciseId: input.arcGymExerciseId } : {}),
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

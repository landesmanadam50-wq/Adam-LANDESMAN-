/**
 * data/morningAlarm.ts
 *
 * Nine Functional Improvements task, Improvement 9 ("Configurable
 * Morning Daily Visualization Alarm"): a REAL, user-configured,
 * recurring Android alarm (sound/vibration/Snooze/Dismiss, full-screen
 * wake, survives reboot) that opens ARCHI's own existing morning flow
 * -- never a second morning-preparation engine, and deliberately
 * SEPARATE from Improvement 8's own quiet lock-screen check-in
 * notification (data/emotionalCheckInNotification.ts): different
 * channel, different id, different purpose (this one is a real wake-up
 * alarm; that one is a gentle, optional, swipeable reminder).
 *
 * Reuses, rather than reimplements:
 *  - buildAlarmAndroidConfig/ensureNotifeePermissionAsync/
 *    ensureTaskAlarmChannelAsync/AlarmType.SET_ALARM_CLOCK -- the EXACT
 *    same real-alarm native primitives data/taskAlarm.ts's task-start
 *    alarm and data/arcAlarm-equivalent (handlePlannedArcAlarmAction)
 *    already prove out, including reboot recovery (notifee's own
 *    trigger-notification persistence) and the registerForegroundService/
 *    onBackgroundEvent/onForegroundEvent pipeline already wired in
 *    app/_layout.tsx -- never a second registration.
 *  - arc/routines.ts's resolveNextOccurrenceDate for the next-fire-time
 *    math -- MorningAlarmConfig's hour/minute/recurrenceDays are the
 *    SAME shape as ScheduledRoutine's own, so the identical,
 *    already-tested 14-day-scan logic (today if still ahead, otherwise
 *    the next matching weekday, correct across month/year boundaries)
 *    applies unchanged. This directly answers "handle time changes" --
 *    editing the config and reconciling simply recomputes from the new
 *    hour/minute/recurrenceDays, and "handle timezone" -- it's real
 *    Date arithmetic in device-local time throughout, never a raw
 *    UTC-offset calculation that could drift across a DST boundary.
 *
 * HONEST LIMITATION (same investigated, non-guaranteed territory as
 * data/emotionalCheckInNotification.ts's own doc, and as
 * data/taskAlarm.ts's pre-existing Xiaomi/MIUI doc on getAlarmPowerManagerInfo):
 * AlarmType.SET_ALARM_CLOCK is Android's own EXACT-ALARM-EXEMPT trigger
 * type, and notifee's trigger notifications are already re-registered
 * on device reboot -- but an OEM skin's own aggressive background
 * killing (Xiaomi/MIUI chief among them) can still prevent the
 * foreground service itself from starting reliably while the app has
 * been killed/restricted; this module surfaces the SAME
 * getAlarmPowerManagerInfo/openAlarmPowerManagerSettings escape hatch
 * every other real alarm in this app already relies on
 * (build/MorningAlarmSettingsScreen.tsx), never a new, unproven
 * mitigation of its own.
 */

import notifee, { AlarmType, TriggerType } from "@notifee/react-native";
import { router } from "expo-router";

import { resolveNextOccurrenceDate } from "../arc/routines.ts";
// Intentional circular import with ./taskAlarm.ts (which imports
// handleMorningAlarmAction/turnOffMorningAlarm from here) -- safe
// because both imports below are plain, hoisted `export function`
// declarations that are never invoked at either module's own top
// level, only from inside other functions called long after both
// modules have finished loading (same guarantee JS gives any circular
// import of hoisted function bindings).
import { buildAlarmAndroidConfig, endForegroundServiceForId } from "./taskAlarm.ts";
import { stopRinging } from "./taskAlarmSound.ts";
import { ensureNotifeePermissionAsync, ensureSilentDeliveryChannelAsync, ensureTaskAlarmChannelAsync, SILENT_DELIVERY_CHANNEL_ID } from "./alarmChannel.ts";
import { loadMorningAlarmConfig, saveMorningAlarmConfig } from "./storage.ts";
import type { MorningAlarmConfig } from "./storage.ts";

const MORNING_ALARM_ID = "morning-alarm";
const SNOOZE_MINUTES = 5;

const ACTION_START_MORNING = "start_morning";
const ACTION_SNOOZE_MORNING = "snooze_morning";
const ACTION_CLOSE_MORNING = "close_morning";

/** Cancels whatever is currently armed/displayed/ringing (a no-op if nothing was) -- the one shared cleanup primitive every arm/disarm/snooze/turn-off below funnels through, same discipline as data/taskAlarm.ts's own cancelAnyAlarmFor. */
async function cancelMorningAlarm(): Promise<void> {
  stopRinging();
  endForegroundServiceForId(MORNING_ALARM_ID);
  try {
    await notifee.cancelTriggerNotification(MORNING_ALARM_ID);
    await notifee.cancelNotification(MORNING_ALARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/** Arms (replacing any previous one) a real alarm at the given absolute moment. Never throws -- a failed native call is logged and caught, leaving the returned bookkeeping at null (an honest "nothing is actually armed"), same contract as every other arm* function in this app. */
async function armMorningAlarm(fireAt: Date): Promise<{ notificationId: string | null; scheduledFor: string | null }> {
  await cancelMorningAlarm();
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskAlarmChannelAsync();
    await ensureSilentDeliveryChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: MORNING_ALARM_ID,
        title: "זמן להתחיל את ההכנה הבוקר",
        body: "בדיקה רגשית, דמיון היום, ותכנון קצר -- לפני שמתחילים.",
        data: { kind: "morningAlarm" },
        // ARCHI -- Final Critical Check task: SILENT_DELIVERY_CHANNEL_ID
        // here, not TASK_ALARM_CHANNEL_ID -- see data/taskAlarm.ts's own
        // armTaskAlarm comment and data/alarmChannel.ts's doc for why.
        // data/taskAlarm.ts's registerTaskAlarmForegroundService upgrades
        // this to the loud channel once hasActiveTaskConflict clears.
        android: buildAlarmAndroidConfig(
          [
            { title: "התחל הכנה יומית", pressAction: { id: ACTION_START_MORNING } },
            { title: `נודניק ${SNOOZE_MINUTES} דקות`, pressAction: { id: ACTION_SNOOZE_MORNING } },
            { title: "סגור", pressAction: { id: ACTION_CLOSE_MORNING } },
          ],
          SILENT_DELIVERY_CHANNEL_ID
        ),
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
    return { notificationId: MORNING_ALARM_ID, scheduledFor: fireAt.toISOString() };
  } catch (error) {
    console.error("armMorningAlarm failed", error);
    return { notificationId: null, scheduledFor: null };
  }
}

export async function handleMorningAlarmAction(actionId: string): Promise<void> {
  stopRinging();
  endForegroundServiceForId(MORNING_ALARM_ID);

  if (actionId === ACTION_SNOOZE_MORNING) {
    await snoozeMorningAlarm(new Date());
    return;
  }
  if (actionId === ACTION_CLOSE_MORNING) {
    await turnOffMorningAlarm(new Date());
    return;
  }
  // ACTION_START_MORNING, or a bare tap on the notification body
  // ("default") -- both open Home, where the existing morning flow
  // (live/DailyStartupSequenceOverlay.tsx) and its own already-correct
  // resume logic take over exactly as they do for every other entry
  // point. Never a second morning-preparation engine of its own.
  await turnOffMorningAlarm(new Date());
  router.push("/");
}

export async function snoozeMorningAlarm(now: Date): Promise<void> {
  const config = await loadMorningAlarmConfig();
  const snoozedFireAt = new Date(now.getTime() + SNOOZE_MINUTES * 60 * 1000);
  const armed = await armMorningAlarm(snoozedFireAt);
  await saveMorningAlarmConfig({ ...config, ...armed });
}

/**
 * "סגור"/ring-timeout/Start: stops the ring and re-arms the NEXT
 * qualifying occurrence (strictly after `now`, so today's already-
 * fired one is correctly skipped) -- never marks anything about Daily
 * Visualization itself (dismissing/snoozing this alarm must never be
 * confused with completing the exercise; this module never touches
 * that status at all).
 */
export async function turnOffMorningAlarm(now: Date): Promise<void> {
  const config = await loadMorningAlarmConfig();
  await saveMorningAlarmConfig(await reconcileMorningAlarm({ ...config, notificationId: null, scheduledFor: null }, now));
}

/**
 * Re-syncs the native alarm with the trainee's own CONFIGURED
 * enabled/hour/minute/recurrenceDays -- called on app start
 * (app/_layout.tsx), right after saving an edited config
 * (build/MorningAlarmSettingsScreen.tsx, the one-time offer step), and
 * by turnOffMorningAlarm above. Idempotent: already-in-sync is a
 * no-op, same "never a redundant re-arm" discipline as
 * reconcilePlannedArcAlarms.
 */
export async function reconcileMorningAlarm(config: MorningAlarmConfig, now: Date = new Date()): Promise<MorningAlarmConfig> {
  if (!config.enabled || config.recurrenceDays.length === 0) {
    await cancelMorningAlarm();
    return { ...config, notificationId: null, scheduledFor: null };
  }
  const nextOccurrence = resolveNextOccurrenceDate({ hour: config.hour, minute: config.minute, recurrenceDays: config.recurrenceDays }, now);
  if (!nextOccurrence) {
    await cancelMorningAlarm();
    return { ...config, notificationId: null, scheduledFor: null };
  }
  const targetIso = nextOccurrence.toISOString();
  if (config.scheduledFor === targetIso && config.notificationId === MORNING_ALARM_ID) return config;
  const armed = await armMorningAlarm(nextOccurrence);
  return { ...config, ...armed };
}

/** Loads the stored config, reconciles it, and persists the result -- the one call app/_layout.tsx and the settings/offer screens all use, so re-syncing is always this exact same round trip. */
export async function syncMorningAlarm(now: Date = new Date()): Promise<MorningAlarmConfig> {
  const config = await loadMorningAlarmConfig();
  const reconciled = await reconcileMorningAlarm(config, now);
  await saveMorningAlarmConfig(reconciled);
  return reconciled;
}


/**
 * data/taskAlarm.ts
 *
 * Task-alarm task ("הפיכת התראות המשימות לשעון מעורר אמיתי"): replaces
 * the previous short, one-shot "it's time to start this task"
 * notification (data/taskScheduledStart.ts, still present but no
 * longer called by anything -- see that file's own doc for why it was
 * deliberately left in place rather than deleted) with a REAL alarm:
 * a sustained, repeating ring (data/taskAlarmSound.ts) shown via a
 * full-screen, lock-screen-capable notification (notifee), with three
 * actions (Start Task / Snooze 5 min / Turn off).
 *
 * Reuses arc/taskScheduledStart.ts's pure "when should the next alarm
 * fire" date math UNCHANGED -- only the native scheduling/display
 * mechanism underneath it changed, never the recurrence/one-time
 * timing rules (requirement: "לכל משימה חוזרת יופעל שעון מעורר לפי
 * מועדי החזרה שלה").
 *
 * Single-slot discipline, same convention as every other
 * Task-level notification field in this codebase: a task's own
 * notificationId/notificationScheduledFor describe AT MOST ONE armed
 * alarm at a time. The notifee notification id is always the SAME
 * deterministic string for a given task (taskAlarmNotificationId),
 * never a fresh random one -- so arming a task that already has an
 * armed alarm structurally REPLACES it rather than creating a second,
 * duplicate one (requirement: "מניעת הפעלה כפולה").
 *
 * Like data/notifications.ts and data/taskAlarmSound.ts, this depends
 * on native modules (notifee) and isn't unit-tested with node --test.
 *
 * Alarm reliability task ("שחזור שעונים לאחר הפעלה מחדש של הטלפון"):
 * every alarm armed here -- task-start, ARC (data/taskAlarm.ts's own
 * ARC-alarm section below), and timer-end alike -- goes through
 * notifee's own createTriggerNotification, which persists the trigger
 * in notifee's OWN native database (never AsyncStorage) keyed by OUR
 * deterministic id. notifee bundles its own BOOT_COMPLETED/
 * QUICKBOOT_POWERON receivers (app.notifee.core.RebootBroadcastReceiver/
 * NotificationAlarmReceiver, confirmed present -- and the
 * RECEIVE_BOOT_COMPLETED permission they need already merged in --
 * by unzipping notifee's own bundled .aar and reading its
 * AndroidManifest.xml directly, the same technique already used
 * elsewhere in this file for the foreground-service-type bug) which
 * re-register every still-persisted trigger with AlarmManager on boot,
 * with NO app code of ours involved and NO app open required. Because
 * the trigger id is the same deterministic one we always use, a
 * reboot can never produce a DUPLICATE alarm, and because recurrence/
 * day-of-week settings live in OUR OWN Task/PlannedArc records (never
 * inside the native trigger itself), they are never lost either --
 * the next time this app's own reconcile runs (Today's own focus
 * effect), it recomputes the true next occurrence from those records
 * exactly as it always does.
 *
 * One honest, CONFIRMED limitation of that bundled native mechanism
 * (verified by decompiling its own re-arm bytecode, not guessed): it
 * re-registers using whichever timestamp was LAST stored, with no
 * visible check against the current time before calling
 * AlarmManager(Compat).setAlarmClock/setExact. If a device stays off
 * past an alarm's own due time and is then rebooted, the OS is likely
 * to fire that now-past trigger almost immediately on boot, rather
 * than silently dropping it -- i.e. a genuinely late "once" alarm CAN
 * still ring once, shortly after the reboot, instead of never ringing
 * at all. Fixing that would mean patching/replacing notifee's own
 * bundled native receiver (a real native-code change needing an
 * Android device or emulator to verify, which this project's build
 * environment does not have); it is reported here rather than
 * silently claimed as solved.
 */

import notifee, { AlarmType, AndroidCategory, AndroidForegroundServiceType, AndroidImportance, AndroidNotificationSetting, EventType, TriggerType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";

/** Not re-exported from the package root -- inferred from notifee's own getPowerManagerInfo() return type rather than a fragile deep import into its dist/ internals. */
export type AlarmPowerManagerInfo = Awaited<ReturnType<typeof notifee.getPowerManagerInfo>>;
import { router } from "expo-router";

import { resolveNextTaskStartOccurrence } from "../arc/taskScheduledStart.ts";
import { resolveNextPlannedArcAlarmOccurrence } from "../arc/plannedArcAlarm.ts";
import { createEmptyTask, generateTaskId, pauseTask as pauseTaskRecord } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { isAnotherTaskActive, pauseTaskTimerRun } from "../arc/taskTimer.ts";
import { STANDALONE_ARC_TASK_ID, isNewArcLiveSessionStale } from "../arc/newArcLiveTypes.ts";
import { generatePlannedArcId } from "../arc/plannedArc.ts";
import type { PlannedArc, PlannedArcAlarmTimingKind } from "../arc/plannedArc.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  getTask,
  loadArcAlarmRealTestResults,
  loadPlannedArcs,
  upsertPlannedArc,
  loadTaskAlarmPreferences,
  loadTaskAlarmRealTaskTestResult,
  loadTaskAlarmTestResult,
  loadTaskOccurrenceOverrides,
  loadTaskReflections,
  loadTasks,
  loadTaskTimerRun,
  loadNewArcLiveSession,
  savePlannedArcs,
  saveArcAlarmRealTestResult,
  saveTaskAlarmRealTaskTestResult,
  saveTaskAlarmTestResult,
  saveTasks,
  saveTaskTimerRun,
  upsertTask,
} from "./storage.ts";
import type { ArcAlarmRealTestResult, ArcAlarmTestKind, TaskAlarmRealTaskTestResult, TaskAlarmTestResult } from "./storage.ts";
import { startRinging, stopRinging } from "./taskAlarmSound.ts";
import { ACTION_ARC_RECALL_ANSWER, cancelScheduledNotification, isInterruptiveReminderKind, redisplayReminderLoud, redisplayReminderQuiet, REMINDER_DATA_FLAG } from "./notifications.ts";
import { recordArcRecallAnswer } from "./arcRecallDelivery.ts";
import type { ReminderKind } from "./storage.ts";
import { routeTappedReminder } from "./reminders.ts";
import { handleDailyVisualizationAlarmEvent } from "./dailyVisualizationAlarm.ts";
import { handleEmotionalCheckInNotificationEvent } from "./emotionalCheckInNotification.ts";
import { handleTaskTransitionNotificationEvent } from "./taskTransitionNotification.ts";
import { handleTaskNotStartedNotificationEvent, recomputeTaskNotStartedNotification } from "./taskNotStartedNotification.ts";
import { handleFreeTimeWindowNotificationEvent, recomputeFreeTimeWindowNotification } from "./freeTimeWindowNotification.ts";
import { handleProactiveSupportNotificationEvent } from "./proactiveSupportNotification.ts";
import { handleMorningAlarmAction, turnOffMorningAlarm } from "./morningAlarm.ts";
import { resolveLatestReflectionForTask, resolveTaskAlarmNotificationContent } from "../arc/taskReflection.ts";

import { TASK_ALARM_CHANNEL_ID, ensureNotifeePermissionAsync, ensureSilentDeliveryChannelAsync, ensureTaskAlarmChannelAsync, SILENT_DELIVERY_CHANNEL_ID } from "./alarmChannel.ts";
const TASK_ALARM_RING_TIMEOUT_MS = 2 * 60 * 1000; // Requirement: rings until turned off OR 2 minutes pass, whichever is first.
const SNOOZE_MINUTES = 5;

const ACTION_START_TASK = "start_task";
const ACTION_SNOOZE = "snooze";
const ACTION_TURN_OFF = "turn_off";
/** Smart Postponement Flow, requirement 1: "do not simply delay the task automatically" -- replaces this alarm's own former snooze button. Pressing it opens live/PostponementObstacleScreen.tsx directly (never a silent delay) through the exact same proven onBackgroundEvent/onForegroundEvent pipeline ACTION_START_TASK already uses, so it works identically whether the app is foregrounded, backgrounded, or killed. */
const ACTION_POSTPONE_OBSTACLE = "postpone_obstacle";

/** This prefix is also how reconcileTaskAlarms below tells a REAL native-alarm id apart from a stale id left over by the superseded expo-notifications mechanism (data/taskScheduledStart.ts) -- never just "is notificationId non-null". */
const NATIVE_ALARM_ID_PREFIX = "task-alarm-";

function taskAlarmNotificationId(taskId: string): string {
  return `${NATIVE_ALARM_ID_PREFIX}${taskId}`;
}

/**
 * Floating task timer task, requirement 4 ("רטט של 10 שניות בסיום
 * הטיימר... זהו מנגנון נפרד משעון המעורר שמופעל בתחילת המשימה"): the
 * task's own WORK TIMER reaching 00:00 gets its own short ring -- same
 * proven native mechanism as the start-of-task alarm above (same
 * channel family, same startRinging/stopRinging sustained ring, same
 * registerForegroundService dispatch), but its own id prefix (so it can
 * never collide with or be confused for the start alarm above), its own
 * much shorter cap, and a single "עצור" action instead of three. Armed/
 * canceled from the exact same lifecycle points live/ActiveTaskScreen.tsx
 * already uses for the OLD expo-notifications-based end reminder
 * (handleStart/handleResume/the rest-duration picker arm it;
 * handlePause/handleFinishEarly/clearEndedTimer/the rest's own early-
 * finish cancel it) -- this REPLACES that old one-shot reminder for the
 * task timer's own end, never runs alongside it (requirement: "יש למנוע
 * הפעלה כפולה של הרטט או הצליל").
 */
const TASK_TIMER_END_ALARM_ID_PREFIX = "task-timer-end-";
const TASK_TIMER_END_RING_TIMEOUT_MS = 10 * 1000;
const ACTION_STOP_TIMER_END = "stop_timer_end";

function taskTimerEndAlarmNotificationId(taskId: string): string {
  return `${TASK_TIMER_END_ALARM_ID_PREFIX}${taskId}`;
}

/**
 * Critical-bug fix: a task saved/scheduled before this feature existed
 * (or before it was swapped from the one-shot expo-notifications
 * mechanism to this native one) still carries ITS OWN notificationId --
 * a plain expo-notifications id, not one of ours. Treating ANY non-null
 * id as "already armed, nothing to do" (as reconcileTaskAlarms almost
 * did) would silently skip arming the real native alarm forever for
 * that task. Only an id with this module's own prefix counts.
 */
function isNativeAlarmId(id: string | null): boolean {
  return id !== null && id.startsWith(NATIVE_ALARM_ID_PREFIX);
}

/**
 * ARCHI -- Unified Development Specification task, Part 13 ("STOP TASK
 * ALARMS IMMEDIATELY WHEN TASKS START"): the orphaning bug this closes
 * -- reconcileTaskAlarms/armTaskAlarm/disarmTaskAlarm below all
 * OVERWRITE task.notificationId the moment they (re-)arm or clear the
 * NATIVE alarm, via cancelAnyAlarmFor(task.id) (notifee-only, keyed by
 * the task's own DETERMINISTIC native id, never the task's current
 * notificationId value). If the task's existing notificationId was
 * instead a STALE id left over from the superseded expo-notifications
 * mechanism (data/taskScheduledStart.ts, isNativeAlarmId(...) false),
 * overwriting the field without ALSO explicitly cancelling that old id
 * orphans it: nothing ever points to it again, yet the OS still has it
 * scheduled and will deliver it -- with its own independent sound and
 * vibration -- at its original fire time, regardless of whether the
 * task is later started or completed. Called before every such
 * overwrite so the orphan can never form in the first place.
 */
async function cancelStaleLegacyNotification(task: Task): Promise<void> {
  if (task.notificationId && !isNativeAlarmId(task.notificationId)) {
    await cancelScheduledNotification(task.notificationId);
  }
}

/**
 * Registered once, as early as possible (app/_layout.tsx, module
 * scope -- never inside a component, per notifee's own requirement).
 * Keeps the alarm's native foreground service "running" (so Android
 * doesn't kill the sustained ring) for exactly as long as the ring
 * itself lasts: the 2-minute cap, or until an action handler below
 * calls the matching resolver early.
 */
const pendingForegroundServiceStops = new Map<string, () => void>();

/**
 * Smart Alarm Conflict Management task, requirement 3 ("critical"):
 * the one IO wrapper every conflict check reads through -- the
 * PERSISTED single-slot TaskTimerRun (loadTaskTimerRun), never
 * temporary React component state, so this is correct even when
 * live/ActiveTaskScreen.tsx isn't mounted at all (the app backgrounded
 * or killed while a different task is running/paused/resting). Reuses
 * arc/taskTimer.ts's own isAnotherTaskActive predicate -- never a
 * second, re-derived definition of "is another task currently active."
 *
 * ARCHI -- Regression Audit and Recovery task, Part 2 fix: a task
 * timer conflict is NOT the only "busy" state a scheduled task alarm
 * must respect. "An ARC exercise is active" is its own, independent
 * condition -- a Full/Mini/Shortened ARC session started standalone
 * (e.g. from Home's own mood check-in, or an ARC GYM training run)
 * carries NO TaskTimerRun at all, so the task-timer check alone would
 * silently let a different task's alarm interrupt it. The persisted,
 * single-slot NewArcLiveSessionState (loadNewArcLiveSession, the exact
 * same storage live/NewArcLiveScreen.tsx's own reload()/returnToTask()
 * already read/clear) is checked too, for the SAME reason the task-
 * timer check reads persisted storage rather than component state:
 * correct even with the ARC screen unmounted or the app backgrounded/
 * killed. A session only ever counts as "active" while genuinely in
 * progress -- completedAt is still null AND clearNewArcLiveSession()
 * (called from returnToTask(), only once the exercise has actually
 * ended and the trainee is leaving) hasn't run yet.
 *
 * ARCHI -- Regression Audit, Part 2 (stale-session gap): completedAt
 * === null alone is NOT enough to call a session "active" -- it is
 * also what an ABANDONED session looks like (app killed/force-stopped
 * mid-ARC, no completion ever recorded). Without a staleness check, a
 * single abandoned session from days ago would suppress EVERY future
 * task alarm forever. Reuses arc/newArcLiveTypes.ts's own
 * isNewArcLiveSessionStale -- the EXACT same "not completed AND
 * created today" rule live/DailyStartupSequenceOverlay.tsx already
 * relies on to decide whether a persisted session is still genuinely
 * resumable -- rather than inventing a second, competing staleness
 * definition here. This keeps legitimate same-day session recovery
 * (reload()/buildFresh() resuming an in-progress ARC after the app was
 * merely backgrounded) completely unaffected: only a session that is
 * ALSO too old to be resumed loses its "busy" status.
 */
export async function hasActiveTaskConflict(excludeTaskId: string, now: Date = new Date()): Promise<boolean> {
  const run = await loadTaskTimerRun();
  if (isAnotherTaskActive(run, excludeTaskId, now)) return true;
  const arcSession = await loadNewArcLiveSession();
  return arcSession !== null && !isNewArcLiveSessionStale(arcSession, now);
}

export function registerTaskAlarmForegroundService(): void {
  notifee.registerForegroundService(
    (notification) =>
      new Promise<void>((resolve) => {
        const notificationId = notification.id;
        const taskId = typeof notification.data?.taskId === "string" ? notification.data.taskId : null;
        const isTestAlarm = notification.data?.kind === "taskAlarmTest";
        const isTimerEndAlarm = notification.data?.kind === "taskTimerEnd";
        const isArcAlarm = notification.data?.kind === "arcAlarm";
        const plannedArcId = typeof notification.data?.plannedArcId === "string" ? notification.data.plannedArcId : null;
        // Nine Functional Improvements task, Improvement 9.
        const isMorningAlarm = notification.data?.kind === "morningAlarm";
        // Smart Alarm Conflict Management task: a real task-START alarm
        // is a candidate for conflict suppression below -- never the
        // timer-end/test kinds, which have nothing to do with "another
        // task is already active" (timer-end is about the CURRENT
        // task's own timer; test alarms are deliberately, manually
        // triggered from Settings for diagnostics, not a surprise
        // interruption).
        //
        // ARCHI -- Regression Audit, Part 1 (notification audit)
        // continuation: a Planned ARC alarm and the morning wake-up
        // alarm are JUST AS capable of interrupting an already-active
        // task/ARC as a task-start alarm is -- neither carries a taskId
        // (ARC alarms key off plannedArcId, morning off its own fixed
        // singleton id), so the ORIGINAL isTaskStartAlarm-only gate
        // silently let both ring straight through an active session.
        // Both are now suppressible on the exact same busy check.
        const isTaskStartAlarm = taskId !== null && !isTimerEndAlarm;
        const isSuppressibleAlarm = isTaskStartAlarm || isArcAlarm || isMorningAlarm;

        // ARCHI -- Complete the Non-Interrupting Notification System
        // task, Part 1/5/6: every "soft" reminder (routine/ARC GYM/
        // sub-goal/four-week/personal-development-program/life-manifest/
        // deferred/Success-Focus) now scheduled via
        // data/notifications.ts's own scheduleNativeReminderNotification,
        // plus the Daily Visualization pre-task reminder
        // (data/dailyVisualizationAlarm.ts), share this one gate -- NEVER
        // the ring-based proceed() machinery below, which is specific to
        // the task-start/ARC/morning alarm family (startRinging, the
        // 2-minute cap, three actions). A reminder never rings/vibrates;
        // it is either shown normally (available) or redisplayed on the
        // quiet, LOW-importance channel (busy), then the brief foreground
        // service this notification started ends immediately -- never a
        // continuously running service.
        const isGenericReminder = Boolean(notification.data?.[REMINDER_DATA_FLAG]);
        const reminderKind = typeof notification.data?.kind === "string" ? (notification.data.kind as ReminderKind) : null;
        const isSuppressibleReminder = isGenericReminder && reminderKind !== null && isInterruptiveReminderKind(reminderKind);
        const isDailyVisualizationAlarm = notification.data?.kind === "dailyVisualizationAlarm";

        // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
        // section 2: this silent placeholder is Android's own
        // startForeground() requirement, exactly like every other
        // busy-state-gated kind above -- the REAL decision (is this
        // task's own start time still due with nothing started) is
        // entirely data/taskNotStartedNotification.ts's own
        // recomputeTaskNotStartedNotification, never duplicated here.
        const isTaskNotStartedArm = notification.data?.kind === "taskNotStartedArm";

        // ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
        // section 1: the free-time-window notification's own silent arm
        // placeholder -- exactly the isTaskNotStartedArm pattern above.
        // The real decision (is this window still genuinely free, with
        // nothing busy) is entirely
        // data/freeTimeWindowNotification.ts's own
        // recomputeFreeTimeWindowNotification, re-derived fresh at this
        // exact fire moment, never duplicated here.
        const isFreeTimeWindowArm = notification.data?.kind === "freeTimeWindowArm";

        const stop = () => {
          if (notificationId) pendingForegroundServiceStops.delete(notificationId);
          resolve();
        };
        if (notificationId) pendingForegroundServiceStops.set(notificationId, stop);

        if (isSuppressibleReminder || isDailyVisualizationAlarm) {
          const title = notification.title ?? "";
          const body = notification.body ?? "";
          const data = notification.data ?? {};
          // Preserves a kind's own action buttons (e.g. Daily
          // Visualization's "התחל ויזואליזציה") and press-action id
          // across the redisplay -- never silently dropped just because
          // the delivery decision now runs through this shared gate.
          const redisplayOptions = { actions: notification.android?.actions, pressAction: notification.android?.pressAction, visibility: notification.android?.visibility };
          hasActiveTaskConflict("").then(async (conflict) => {
            if (notificationId) {
              await notifee.cancelNotification(notificationId).catch(() => {});
              if (conflict) {
                await redisplayReminderQuiet(notificationId, title, body, data, redisplayOptions);
              } else {
                await redisplayReminderLoud(notificationId, title, body, data, redisplayOptions);
              }
            }
            stop();
          });
          return;
        }

        if (isTaskNotStartedArm) {
          recomputeTaskNotStartedNotification(new Date()).then(async () => {
            if (notificationId) await notifee.cancelNotification(notificationId).catch(() => {});
            stop();
          });
          return;
        }

        if (isFreeTimeWindowArm) {
          recomputeFreeTimeWindowNotification(new Date()).then(async () => {
            if (notificationId) await notifee.cancelNotification(notificationId).catch(() => {});
            stop();
          });
          return;
        }

        const proceed = () => {
          loadTaskAlarmPreferences().then((preferences) => startRinging(preferences.soundEnabled, preferences.vibrationEnabled));

          // Diagnostics, Step 2/3 ("לזהות אם השעון הופעל בפועל"): this is
          // the one OBJECTIVE signal that the whole native chain actually
          // fired -- the foreground service only ever starts if
          // AlarmManager, the BroadcastReceiver, and startForeground() all
          // succeeded. Recorded the INSTANT ringing begins, never inferred
          // from scheduling having merely been requested without error.
          // Also recorded for a REAL task's own alarm (not just the
          // isolated test one), but ONLY into the diagnostic record for
          // the one real-task test currently tracked -- a no-op for every
          // ordinary task alarm that isn't that diagnostic task.
          if (isTestAlarm) recordTestAlarmFired(new Date().toISOString());
          else if (isArcAlarm) {
            if (plannedArcId) recordRealArcAlarmFiredIfTracked(plannedArcId, new Date().toISOString());
          } else if (taskId && !isTimerEndAlarm) recordRealTaskAlarmFiredIfTracked(taskId, new Date().toISOString());

          // Floating task timer task, requirement 4: the work-timer's own
          // end-of-timer ring is a SEPARATE, much shorter cap than the
          // start-of-task alarm above -- 10 seconds, auto-stopping with a
          // plain cancel (never turnOffTaskAlarm, which is specific to the
          // START alarm's own task-status semantics and has nothing to do
          // with a timer simply reaching 00:00).
          if (isTimerEndAlarm) {
            setTimeout(async () => {
              stopRinging();
              if (notificationId) await cancelTaskTimerEndAlarm(notificationId);
              stop();
            }, TASK_TIMER_END_RING_TIMEOUT_MS);
            return;
          }

          setTimeout(async () => {
            stopRinging();
            if (isArcAlarm) {
              if (plannedArcId) await turnOffPlannedArcAlarmById(plannedArcId);
            } else if (isMorningAlarm) {
              await turnOffMorningAlarm(new Date());
            } else if (taskId) {
              const task = await getTask(taskId);
              if (task) await turnOffTaskAlarm(task, new Date());
            } else if (isTestAlarm) {
              await cancelAnyAlarmFor("test");
            }
            stop();
          }, TASK_ALARM_RING_TIMEOUT_MS);
        };

        // Smart Alarm Conflict Management task, requirement 3 ("critical"):
        // checked at the actual alarm-DELIVERY boundary, against the
        // authoritative persisted active-task state -- if a DIFFERENT
        // task is genuinely still active (running, paused, or resting),
        // this task-start alarm must never ring/vibrate/light up the
        // screen. The notification notifee already created (and would
        // otherwise ring/show full-screen for) is canceled outright
        // rather than merely silenced -- startRinging() is never called,
        // and this task's own notificationId/notificationScheduledFor in
        // storage are left completely untouched (nothing here writes to
        // Task/alarm storage), so the next reconcileTaskAlarms pass
        // (Today's own focus effect) arms this task's TRUE next
        // occurrence exactly as resolveNextTaskStartOccurrence computes
        // it -- never a retroactive ring for the occurrence just
        // suppressed here (spec: "do not automatically ring the missed
        // alarm retroactively").
        // excludeTaskId is the alarm's own taskId when it has one (a task-start
        // alarm must never treat ITS OWN task's timer as "another" task); ARC/
        // morning alarms have no taskId of their own, so "" (never a real
        // generated task id) means "no exclusion -- any active task or ARC
        // session counts."
        if (isSuppressibleAlarm) {
          hasActiveTaskConflict(taskId ?? "").then(async (conflict) => {
            if (conflict) {
              if (notificationId) notifee.cancelNotification(notificationId).catch(() => {});
              stop();
              return;
            }
            // ARCHI -- Final Critical Check task: the notification posted
            // so far (to satisfy Android's startForeground() requirement,
            // confirmed via decompiling notifee's own ForegroundService
            // class -- see data/alarmChannel.ts's own doc) sat on the
            // SILENT delivery channel, never the real alarm one. Now that
            // the busy check has cleared, upgrade it to the loud channel
            // BEFORE startRinging() (inside proceed() below) plays
            // anything, so the heads-up/channel sound only ever happens
            // once the trainee is genuinely available. Deliberately never
            // asForegroundService here: this callback is already running
            // INSIDE the one foreground service this notification id
            // started; setting the flag again would attempt to start a
            // second one for the same id.
            if (notificationId) {
              await notifee
                .displayNotification({
                  id: notificationId,
                  title: notification.title ?? "",
                  body: notification.body ?? "",
                  data: notification.data,
                  android: buildAlarmNotificationContent(notification.android?.actions ?? [], TASK_ALARM_CHANNEL_ID),
                })
                .catch(() => {});
            }
            proceed();
          });
          return;
        }

        proceed();
      })
  );
}

/** The shared primitive both endForegroundServiceFor (task alarms) and endForegroundServiceForArc (ARC alarms, below) delegate to -- keyed by the real notifee notification id directly, never re-derived differently per alarm kind. Exported so data/morningAlarm.ts (Improvement 9) can end ITS OWN alarm's foreground service early too, the same way. */
export function endForegroundServiceForId(notificationId: string): void {
  pendingForegroundServiceStops.get(notificationId)?.();
}

/** Ends the native foreground service early -- called by the three action handlers below right after stopRinging(), so the service doesn't needlessly keep "running" (silently) until the full 2-minute cap. */
function endForegroundServiceFor(taskId: string): void {
  endForegroundServiceForId(taskAlarmNotificationId(taskId));
}

/**
 * Cancels whatever is currently armed/displayed/ringing for this task
 * (a no-op if nothing was armed) -- the one shared "make sure this
 * task has no active alarm" primitive every other function here builds
 * on, so a re-arm, a snooze, a manual task start, and an explicit
 * turn-off all funnel through the exact same cleanup. Exported
 * directly (not just via disarmTaskAlarm's Task-returning wrapper) for
 * live/ActiveTaskScreen.tsx's own handleStart: starting a task through
 * the NORMAL "התחלה" button -- not the alarm's own "Start Task" action
 * -- must also silence an alarm that's currently ringing/pending for
 * it; that screen already clears the Task's own notificationId/
 * notificationScheduledFor fields itself, so only the native
 * cancellation/ringing side is needed here, never a second write to
 * the same fields.
 */
export async function cancelAnyAlarmFor(taskId: string): Promise<void> {
  const id = taskAlarmNotificationId(taskId);
  stopRinging();
  endForegroundServiceFor(taskId);
  try {
    await notifee.cancelTriggerNotification(id);
    await notifee.cancelNotification(id);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Floating task timer task, requirement 4: cancels the end-of-timer
 * ring for this exact notification id (a no-op if null/nothing was
 * armed). Takes the raw id directly -- every call site already has it
 * in hand on TaskTimerRun.notificationId (live/ActiveTaskScreen.tsx),
 * never re-derived from a taskId, since the main run and a
 * subsequent rest run reuse the very same field for two different
 * underlying alarms in sequence (never concurrently).
 */
export async function cancelTaskTimerEndAlarm(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  stopRinging();
  pendingForegroundServiceStops.get(notificationId)?.();
  try {
    await notifee.cancelTriggerNotification(notificationId);
    await notifee.cancelNotification(notificationId);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Arms the ~10-second end-of-timer ring at the given moment, returning
 * the notifee id to store on the TaskTimerRun (never throws -- a failed
 * arm just means no ring, the same honest-failure contract as
 * armTaskAlarm above). Reuses the exact same channel/ring/foreground-
 * service mechanism as the start-of-task alarm, just a different id
 * prefix, a single "עצור" action, and the much shorter cap handled in
 * registerTaskAlarmForegroundService above -- never a parallel,
 * simplified mechanism.
 */
export async function armTaskTimerEndAlarm(taskId: string, body: string, fireAt: Date, notificationTitle = "הזמן למשימה הסתיים"): Promise<string | null> {
  const id = taskTimerEndAlarmNotificationId(taskId);
  await cancelTaskTimerEndAlarm(id);
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskAlarmChannelAsync();
    await notifee.createTriggerNotification(
      {
        id,
        title: notificationTitle,
        body,
        data: { kind: "taskTimerEnd", taskId },
        android: buildAlarmAndroidConfig([{ title: "עצור", pressAction: { id: ACTION_STOP_TIMER_END } }]),
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
    return id;
  } catch (error) {
    console.error("armTaskTimerEndAlarm failed", taskId, error);
    return null;
  }
}

/**
 * Critical-bug fix: notifee's own bundled native Service
 * (app.notifee.core.ForegroundService, inside its .aar) is declared in
 * ITS OWN manifest with android:foregroundServiceType="shortService" --
 * confirmed by unzipping core-*.aar and reading AndroidManifest.xml
 * directly. Requesting ANY other type at runtime (this code originally
 * asked for MEDIA_PLAYBACK) is a type MISMATCH against that fixed
 * manifest declaration. On Android 14+ this makes the OS's own
 * startForeground() call fail at the exact moment the alarm tries to
 * fire -- entirely inside native code, with NO exception ever visible
 * to this file, which is why the previous build produced zero sound,
 * zero vibration, and no visible notification at all on a modern
 * device. FOREGROUND_SERVICE_TYPE_SHORT_SERVICE is the ONLY type that
 * actually matches the library's own Service class.
 */
const TASK_ALARM_FOREGROUND_SERVICE_TYPES = [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE];

/** Exported so data/morningAlarm.ts (Improvement 9) can reuse the EXACT same real-alarm Android config every other alarm kind here already uses, rather than a second, slightly-different hand-rolled one. */
/**
 * The content/visuals every real alarm notification shares, independent
 * of whether THIS post is the one that starts the foreground service.
 * Extracted so the post-busy-check LOUD redisplay below (never
 * asForegroundService -- see that code's own doc for why setting it
 * again there would be dangerous) can reuse the exact same alarm
 * look/actions as the original scheduled notification, just via a
 * plain displayNotification call instead of createTriggerNotification.
 */
function buildAlarmNotificationContent(actions: { title: string; pressAction: { id: string } }[], channelId: string) {
  return {
    channelId,
    category: AndroidCategory.ALARM,
    importance: AndroidImportance.HIGH,
    ongoing: true,
    autoCancel: false,
    lightUpScreen: true,
    pressAction: { id: "default" },
    fullScreenAction: { id: "default" },
    actions,
  };
}

/**
 * ARCHI -- Final Critical Check task: channelId now defaults to
 * TASK_ALARM_CHANNEL_ID (unchanged behavior for the timer-end/test
 * alarm kinds below, which never wait on a busy-state decision and may
 * ring the instant they're scheduled, exactly as before) but task-
 * start/ARC/morning alarms -- the three kinds gated by
 * hasActiveTaskConflict -- now pass SILENT_DELIVERY_CHANNEL_ID
 * explicitly here, so the notification Android's startForeground()
 * requirement forces this module to post BEFORE the busy check runs is
 * silent and non-heads-up. See data/alarmChannel.ts's own doc for the
 * confirmed native evidence this is actually necessary.
 */
export function buildAlarmAndroidConfig(actions: { title: string; pressAction: { id: string } }[], channelId: string = TASK_ALARM_CHANNEL_ID) {
  return {
    ...buildAlarmNotificationContent(actions, channelId),
    asForegroundService: true,
    foregroundServiceTypes: TASK_ALARM_FOREGROUND_SERVICE_TYPES,
  };
}

/**
 * Arms (or re-arms, replacing any previous one -- see this file's own
 * doc on the deterministic notification id) a real alarm for this
 * task at the given absolute moment. Callers must persist the returned
 * Task (never the original), same contract as the superseded
 * rescheduleTaskStartNotification.
 *
 * Critical-bug fix: every notifee call below is now wrapped so a
 * failure for ONE task (a permission edge case, an OEM quirk, any
 * native error) can never silently break reconciliation for every
 * OTHER task, nor leave a task's own save/edit hanging -- it is
 * logged (visible via `adb logcat` or the EAS build's own device
 * logs) and this returns the task with notificationId/
 * notificationScheduledFor left at null: an honest "nothing is
 * actually armed", never a false claim of success.
 *
 * Task Reflection Memory task, requirements 2+6: title/body are read
 * fresh from the task's own LATEST saved reflection (arc/
 * taskReflection.ts's resolveTaskAlarmNotificationContent) every single
 * time this function runs -- never a value computed once and cached --
 * so a brand-new reflection is picked up automatically the next time
 * this task's alarm is (re-)armed, whether that's an immediate refresh
 * (data/taskReflection.ts's refreshTaskAlarmNotificationIfArmed, right
 * after the reflection is saved) or a later recurring occurrence being
 * armed for the first time. Requirement 7 (privacy): withholding the
 * reflection when the trainee's own preference is off happens entirely
 * inside that one content function, never duplicated here.
 */
export async function armTaskAlarm(task: Task, fireAt: Date): Promise<Task> {
  await cancelStaleLegacyNotification(task);
  await cancelAnyAlarmFor(task.id);
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskAlarmChannelAsync();
    await ensureSilentDeliveryChannelAsync();

    const id = taskAlarmNotificationId(task.id);
    const [reflections, alarmPreferences] = await Promise.all([loadTaskReflections(), loadTaskAlarmPreferences()]);
    const latestReflection = resolveLatestReflectionForTask(reflections, task.id);
    const { title, body } = resolveTaskAlarmNotificationContent(task.title, latestReflection?.text ?? null, alarmPreferences.showReflectionOnLockScreen);
    await notifee.createTriggerNotification(
      {
        id,
        title,
        body,
        data: { kind: "taskAlarm", taskId: task.id },
        // ARCHI -- Final Critical Check task: this is the notification Android's
        // startForeground() requirement forces onto the SILENT channel, before
        // hasActiveTaskConflict ever runs -- never the loud one. See
        // data/alarmChannel.ts's own doc and registerTaskAlarmForegroundService's
        // own post-busy-check redisplay below for the rest of this fix.
        android: buildAlarmAndroidConfig(
          [
            { title: "התחל משימה", pressAction: { id: ACTION_START_TASK } },
            { title: "דחייה", pressAction: { id: ACTION_POSTPONE_OBSTACLE } },
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

    return { ...task, notificationId: id, notificationScheduledFor: fireAt.toISOString() };
  } catch (error) {
    console.error("armTaskAlarm failed", task.id, error);
    return { ...task, notificationId: null, notificationScheduledFor: null };
  }
}

/**
 * Task Reflection Memory task, requirements 3+6: refreshes the BODY
 * TEXT of a task's own already-armed alarm the instant a new
 * reflection is saved/edited/deleted for it, through the exact same
 * cancel+recreate-with-the-SAME-deterministic-id primitive armTaskAlarm
 * already uses for every other re-arm in this file (so this can never
 * create a duplicate -- requirement 5 of the "prevent duplicates"
 * family), passing back the EXACT SAME fireAt the task already had
 * (never recomputed), so its scheduled time never changes just because
 * its reflection did.
 *
 * A task with no currently-armed native alarm, or whose armed moment
 * has already passed (so the notification has either already been
 * delivered or is no longer meaningfully "pending"), is left
 * completely untouched -- "do not attempt to rewrite a delivered
 * notification retroactively." That task's NEXT occurrence is still
 * covered: reconcileTaskAlarms/armTaskAlarm always reads the latest
 * reflection fresh regardless, whenever it next arms.
 */
export async function refreshTaskAlarmNotificationIfArmed(taskId: string, now: Date = new Date()): Promise<void> {
  const task = await getTask(taskId);
  if (!task || task.status !== "planned") return;
  if (!isNativeAlarmId(task.notificationId) || !task.notificationScheduledFor) return;
  const fireAt = new Date(task.notificationScheduledFor);
  if (fireAt.getTime() <= now.getTime()) return;
  const armed = await armTaskAlarm(task, fireAt);
  const tasks = await loadTasks();
  await saveTasks(tasks.map((candidate) => (candidate.id === armed.id ? armed : candidate)));
}

/** Cancels this task's own alarm (if any) and clears its notification fields -- used when the task is started through ANY path (not just the alarm's own "Start Task" button), and by turnOffTaskAlarm/reconcile below. Never marks the task complete or touches anything else about it. */
export async function disarmTaskAlarm(task: Task): Promise<Task> {
  await cancelStaleLegacyNotification(task);
  await cancelAnyAlarmFor(task.id);
  return { ...task, notificationId: null, notificationScheduledFor: null };
}

const ACTION_STOP_TEST = "stop_test";

async function recordTestAlarmFired(firedAt: string): Promise<void> {
  const existing = await loadTaskAlarmTestResult();
  if (!existing) return;
  await saveTaskAlarmTestResult({ ...existing, firedAt });
}

/**
 * Critical-bug task, Step 2 ("בדיקת שעון מעורר"): schedules a REAL
 * alarm one minute out, through the EXACT SAME code path as a real
 * task's own alarm (same channel, same foreground-service/full-screen
 * config, same AlarmManager alarm-clock trigger) -- the whole point is
 * to prove the real mechanism works, never a simplified stand-in that
 * could pass while the real one is still broken. Unlike armTaskAlarm,
 * this does NOT swallow a scheduling error: it's returned verbatim for
 * the diagnostic screen to show (requirement: "יש להציג שגיאות במקום
 * להתעלם מהן").
 */
export async function armTestAlarm(now: Date = new Date()): Promise<TaskAlarmTestResult> {
  const fireAt = new Date(now.getTime() + 60 * 1000);
  const result: TaskAlarmTestResult = {
    scheduledAt: now.toISOString(),
    fireAt: fireAt.toISOString(),
    armError: null,
    firedAt: null,
    soundHeard: null,
    vibrationFelt: null,
    alarmScreenShown: null,
  };
  try {
    await cancelAnyAlarmFor("test");
    await ensureNotifeePermissionAsync();
    await ensureTaskAlarmChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: taskAlarmNotificationId("test"),
        title: "בדיקת שעון מעורר",
        body: "זהו שעון בדיקה -- אם הכל עובד, תוך דקה הוא יצלצל וירטוט.",
        data: { kind: "taskAlarmTest" },
        android: buildAlarmAndroidConfig([{ title: "עצור בדיקה", pressAction: { id: ACTION_STOP_TEST } }]),
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
  } catch (error) {
    result.armError = error instanceof Error ? error.message : String(error);
    console.error("armTestAlarm failed", error);
  }
  await saveTaskAlarmTestResult(result);
  return result;
}

/** Persists one of the trainee's own self-reported answers (sound/vibration/screen) without touching the rest of the record. */
export async function recordTestAlarmSelfReport(patch: Partial<Pick<TaskAlarmTestResult, "soundHeard" | "vibrationFelt" | "alarmScreenShown">>): Promise<TaskAlarmTestResult | null> {
  const existing = await loadTaskAlarmTestResult();
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await saveTaskAlarmTestResult(updated);
  return updated;
}

/**
 * Alarm reliability task ("שחזור שעונים לאחר הפעלה מחדש... התחשבות
 * במגבלות Android וברקע במכשירי Xiaomi"): a thin, non-throwing wrapper
 * around notifee's own getPowerManagerInfo() -- the device
 * manufacturer/model, and (when the OEM has one) the name of a vendor-
 * specific "let this app run in the background" settings screen
 * (Xiaomi/MIUI's Security app, Huawei's Battery manager, etc).
 * `activity` is null when no such screen exists for this device (a
 * stock/AOSP device, or iOS) -- an honest "nothing more to do here",
 * never a guessed fallback. Verified present in the notifee version
 * this project depends on (its own TypeScript definitions document
 * this exact API); never a custom native addition of our own.
 */
export async function getAlarmPowerManagerInfo(): Promise<AlarmPowerManagerInfo | null> {
  try {
    return await notifee.getPowerManagerInfo();
  } catch {
    return null;
  }
}

/** Opens the exact settings screen getAlarmPowerManagerInfo() identified (notifee's own openPowerManagerSettings()) -- a documented no-op when that info's `activity` was null. Never throws. */
export async function openAlarmPowerManagerSettings(): Promise<void> {
  try {
    await notifee.openPowerManagerSettings();
  } catch {
    // Best-effort -- nothing to open is not an error.
  }
}

/**
 * ARC alarm diagnostics task, section 2: opens Android's own "Alarms &
 * reminders" special-access screen (notifee's openAlarmPermissionSettings)
 * -- a DIFFERENT settings screen from openAlarmPowerManagerSettings above
 * (that one is the OEM's own battery/background-restriction screen, e.g.
 * Xiaomi's Security app; this one is the Android-12+ exact-alarm toggle
 * every app sees in stock Settings). A no-op on Android < 12, per
 * notifee's own documented contract. Never throws.
 */
export async function openExactAlarmPermissionSettings(): Promise<void> {
  try {
    await notifee.openAlarmPermissionSettings();
  } catch {
    // Best-effort -- nothing to open is not an error.
  }
}

/** Checks the OS's own bookkeeping (notifee's getTriggerNotificationIds, backed by Android's AlarmManager -- never this app's own Task.notificationId field) for whether a task's alarm is actually still scheduled. Non-throwing: a failed check reports "not registered" rather than crashing the diagnostic screen. */
export async function isAlarmRegisteredWithOs(taskId: string): Promise<boolean> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    return ids.includes(taskAlarmNotificationId(taskId));
  } catch {
    return false;
  }
}

async function recordRealTaskAlarmFiredIfTracked(taskId: string, firedAt: string): Promise<void> {
  const existing = await loadTaskAlarmRealTaskTestResult();
  if (!existing || existing.taskId !== taskId) return;
  await saveTaskAlarmRealTaskTestResult({ ...existing, firedAt });
}

/** ARC alarm diagnostics task: exact mirror of recordRealTaskAlarmFiredIfTracked, for whichever of the three tracked kinds (standalone/before_task/mini) this plannedArcId belongs to -- a no-op for an ordinary ARC alarm that isn't currently tracked by a diagnostic test. */
async function recordRealArcAlarmFiredIfTracked(plannedArcId: string, firedAt: string): Promise<void> {
  const results = await loadArcAlarmRealTestResults();
  for (const kind of ["standalone", "before_task", "mini"] as const) {
    const existing = results[kind];
    if (existing && existing.plannedArcId === plannedArcId) {
      await saveArcAlarmRealTestResult({ ...existing, firedAt });
    }
  }
}

/**
 * Critical-bug task ("Test Alarm Works, Scheduled Task Alarm Does
 * Not"), Step 3: creates and saves a REAL task (persisted via the
 * exact same upsertTask every other task uses), scheduled 2 minutes
 * out, then arms its alarm through scheduleTaskAlarm below -- the
 * EXACT SAME function build/TaskEditorScreen.tsx's own handleSave
 * calls, never a parallel or simplified mechanism. Immediately checks
 * isAlarmRegisteredWithOs so "never scheduled" (armError set) and
 * "scheduled but the OS doesn't actually have it" (armError null,
 * registeredWithOsAfterArm false) are visibly DIFFERENT outcomes, not
 * conflated into one.
 */
export async function armRealTaskAlarmTest(now: Date = new Date()): Promise<TaskAlarmRealTaskTestResult> {
  const fireAt = new Date(now.getTime() + 2 * 60 * 1000);
  const task: Task = {
    ...createEmptyTask(generateTaskId(), "משימת בדיקה לשעון מעורר", "לבדוק שהשעון צילצל", now.toISOString()),
    scheduledDate: todayLocalDateString(fireAt),
    scheduledTime: `${String(fireAt.getHours()).padStart(2, "0")}:${String(fireAt.getMinutes()).padStart(2, "0")}`,
  };

  const result: TaskAlarmRealTaskTestResult = {
    taskId: task.id,
    taskTitle: task.title,
    scheduledDate: task.scheduledDate!,
    scheduledTime: task.scheduledTime!,
    savedAt: now.toISOString(),
    fireAt: null,
    armError: null,
    registeredWithOsAfterArm: false,
    registeredWithOsOnLastCheck: false,
    firedAt: null,
  };

  try {
    await upsertTask(task);
    const armed = await scheduleTaskAlarm(task, now);
    await upsertTask(armed);
    result.fireAt = armed.notificationScheduledFor;
    if (!armed.notificationId) {
      // scheduleTaskAlarm/armTaskAlarm never throws -- a failed native
      // call is caught internally and surfaces here as a cleared
      // notificationId, never as a thrown error this function could
      // itself catch. Reported as its own distinct outcome, never
      // confused with a genuine "no error, truly armed" result.
      result.armError = "התזמון נכשל (הפונקציה החזירה משימה ללא שעון פעיל, ללא חריגה -- ראו את יומן השגיאות של armTaskAlarm).";
    } else {
      result.registeredWithOsAfterArm = await isAlarmRegisteredWithOs(task.id);
      result.registeredWithOsOnLastCheck = result.registeredWithOsAfterArm;
    }
  } catch (error) {
    result.armError = error instanceof Error ? error.message : String(error);
    console.error("armRealTaskAlarmTest failed", error);
  }

  await saveTaskAlarmRealTaskTestResult(result);
  return result;
}

/** Re-checks the OS's own registration for the currently-tracked real-task test -- called on every diagnostics-screen focus, so "still registered" vs. "disappeared before it should have" is visible without re-arming anything. */
export async function refreshRealTaskAlarmTestStatus(): Promise<TaskAlarmRealTaskTestResult | null> {
  const existing = await loadTaskAlarmRealTaskTestResult();
  if (!existing) return null;
  const registeredNow = await isAlarmRegisteredWithOs(existing.taskId);
  const updated = { ...existing, registeredWithOsOnLastCheck: registeredNow };
  await saveTaskAlarmRealTaskTestResult(updated);
  return updated;
}

/**
 * Single-task equivalent of reconcileTaskAlarms below, for a SINGLE
 * just-edited/just-created task (build/TaskEditorScreen.tsx's own save
 * flow) -- mirrors the superseded rescheduleTaskStartNotification's
 * exact contract: arms the next qualifying occurrence, or disarms when
 * nothing qualifies anymore. Callers must persist the returned Task.
 */
export async function scheduleTaskAlarm(task: Task, now: Date = new Date()): Promise<Task> {
  // Flexible Daily Routine task, integration fix: the effective daily
  // occurrence (today's own per-date override, if any) is the source
  // of truth for the alarm's own fire time -- loaded fresh here so a
  // just-saved override (build/TaskEditorScreen.tsx's own
  // handleOverrideSave, which calls this right after upserting it) is
  // reflected immediately, never waiting for a later reconcile pass.
  const overrides = await loadTaskOccurrenceOverrides();
  const nextOccurrence = resolveNextTaskStartOccurrence(task, now, overrides);
  if (!nextOccurrence) return disarmTaskAlarm(task);
  return armTaskAlarm(task, nextOccurrence);
}

/**
 * "כבה" (turn off): stops the ring and clears the alarm WITHOUT
 * scheduling anything else for this same occurrence. Requirement:
 * "אין להפעיל מחדש שעון שכבר כובה באותו מועד" -- satisfied structurally,
 * never by a special-cased flag: resolveNextTaskStartOccurrence always
 * computes the next occurrence STRICTLY AFTER "now", so calling it
 * again right after turning off (now already past the original fire
 * time) can only ever produce a LATER occurrence (tomorrow's, for a
 * recurring task, or none, for a one-time task) -- the just-dismissed
 * occurrence itself can never be recomputed and re-armed.
 */
export async function turnOffTaskAlarm(task: Task, now: Date = new Date()): Promise<void> {
  const cleared = await disarmTaskAlarm(task);
  const tasks = await loadTasks();
  await saveTasks(tasks.map((candidate) => (candidate.id === cleared.id ? cleared : candidate)));
  void now; // kept for signature symmetry with the other action handlers; nothing here depends on the current moment.
}

/** "דחה ב-5 דקות": stops the current ring and arms exactly ONE fresh alarm 5 minutes from now -- an ad-hoc override, never routed through resolveNextTaskStartOccurrence (this is not "the next scheduled occurrence", it's a deliberate short deferral of THIS one). */
export async function snoozeTaskAlarm(task: Task, now: Date = new Date()): Promise<void> {
  const snoozedFireAt = new Date(now.getTime() + SNOOZE_MINUTES * 60 * 1000);
  const armed = await armTaskAlarm(task, snoozedFireAt);
  const tasks = await loadTasks();
  await saveTasks(tasks.map((candidate) => (candidate.id === armed.id ? armed : candidate)));
}

/**
 * Same lazy "reconcile on next relevant touch" pattern
 * reconcileTaskScheduledStartNotifications used -- called whenever
 * Today gains focus. Requirement: "אם המשתמש כבר התחיל את המשימה, אין
 * להפעיל את השעון מחדש" is satisfied the same way it always was --
 * resolveNextTaskStartOccurrence returns null for anything that isn't
 * "planned" (started/paused/postponed/completed/archived all qualify),
 * so an already-started task is simply disarmed here, never re-armed.
 *
 * Critical-bug fix: "in sync, nothing to do" used to mean only
 * `notificationScheduledFor === targetIso && notificationId !== null`
 * -- true even when notificationId was a STALE id left over from the
 * superseded expo-notifications mechanism (any task scheduled before
 * this native alarm existed, or before it replaced that one). That
 * silently skipped arming the real native alarm forever for such a
 * task. isNativeAlarmId(...) below closes that gap: only this module's
 * own id prefix counts as "already armed."
 *
 * Smart Alarm Conflict Management task, requirement 3: this is the
 * SCHEDULING boundary the spec asks to also check against the
 * currently-active-task conflict (the other check is at the actual
 * delivery boundary, inside registerTaskAlarmForegroundService above).
 * Deliberately, an active-task conflict changes NOTHING here: every
 * "planned" task's alarm is still armed/kept in sync for its own true
 * next occurrence exactly as if no other task were active -- the
 * schedule itself, and every future recurring occurrence, must never
 * be silently disarmed or skipped merely because something else is
 * running right now (spec: "the next scheduled task's own scheduled
 * time/status is preserved"). Suppressing the actual RING is entirely
 * the delivery boundary's job; this boundary's own job is making sure
 * that suppression can never be mistaken for a reason to withhold or
 * cancel the schedule itself (see this file's own reconcileTaskAlarms
 * conflict-regression test for the exact guarantee).
 */
export async function reconcileTaskAlarms(now: Date = new Date()): Promise<Task[]> {
  const [tasks, overrides] = await Promise.all([loadTasks(), loadTaskOccurrenceOverrides()]);
  const reconciled = await Promise.all(
    tasks.map(async (task) => {
      if (task.status !== "planned") {
        return task.notificationId ? disarmTaskAlarm(task) : task;
      }
      const targetIso = resolveNextTaskStartOccurrence(task, now, overrides)?.toISOString() ?? null;
      const inSync = task.notificationScheduledFor === targetIso && (targetIso === null || isNativeAlarmId(task.notificationId));
      if (inSync) return task;
      if (!targetIso) return disarmTaskAlarm(task);
      return armTaskAlarm(task, new Date(targetIso));
    })
  );
  await saveTasks(reconciled);
  return reconciled;
}

/** Re-arms EVERY "planned" task's alarm unconditionally -- used right after the trainee changes their sound/vibration preference, mirroring the superseded rescheduleAllTaskStartNotifications, so the change is reflected on every already-pending alarm immediately. The sound/vibration choice itself is read fresh, at RING time, by registerTaskAlarmForegroundService above -- re-arming here is only about keeping notificationId/notificationScheduledFor correct, not about the preference value itself. */
export async function rearmAllTaskAlarms(now: Date = new Date()): Promise<void> {
  const tasks = await loadTasks();
  const rearmed = await Promise.all(
    tasks.map(async (task) => {
      if (task.status !== "planned" || !task.notificationScheduledFor) return task;
      return armTaskAlarm(task, new Date(task.notificationScheduledFor));
    })
  );
  await saveTasks(rearmed);
}

// --- ARC alarm task ("שעון מעורר לתרגילי ARC מתוכננים") -------------------
//
// A planned ARC/Mini ARC exercise's own "שעון מעורר לתרגול" -- reuses
// every native primitive above (the one shared channel, buildAlarmAndroidConfig,
// ensureNotifeePermissionAsync/ensureTaskAlarmChannelAsync, startRinging/
// stopRinging, the one registered foreground service and the one
// onBackgroundEvent/onForegroundEvent router already wired in
// app/_layout.tsx) rather than a second, parallel native mechanism --
// only its own id prefix, its own data.kind, and its own three actions
// are new. The "when" is never computed here: arc/plannedArcAlarm.ts's
// resolveNextPlannedArcAlarmOccurrence (which itself delegates to
// arc/taskScheduledStart.ts for the "before_task" case) is the only
// source of truth.

const ARC_ALARM_ID_PREFIX = "arc-alarm-";
const ACTION_START_ARC = "start_arc";
const ACTION_SNOOZE_ARC = "snooze_arc";
const ACTION_CLOSE_ARC = "close_arc";

function arcAlarmNotificationId(plannedArcId: string): string {
  return `${ARC_ALARM_ID_PREFIX}${plannedArcId}`;
}

/** Mirrors isNativeAlarmId exactly, for this module's own ARC-alarm id prefix. */
function isNativeArcAlarmId(id: string | null): boolean {
  return id !== null && id.startsWith(ARC_ALARM_ID_PREFIX);
}

/** Mirrors cancelAnyAlarmFor exactly, for a planned ARC's own alarm id. */
async function cancelAnyArcAlarmFor(plannedArcId: string): Promise<void> {
  const id = arcAlarmNotificationId(plannedArcId);
  stopRinging();
  endForegroundServiceForId(id);
  try {
    await notifee.cancelTriggerNotification(id);
    await notifee.cancelNotification(id);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Arms (or re-arms, replacing any previous one) a real alarm for this
 * planned ARC at the given absolute moment -- same honest-failure
 * contract as armTaskAlarm: a failed native call is logged and caught,
 * never thrown, leaving arcAlarmNotificationId/arcAlarmScheduledFor at
 * null (an honest "nothing is actually armed"). Callers must persist
 * the returned PlannedArc.
 */
export async function armPlannedArcAlarm(item: PlannedArc, fireAt: Date): Promise<PlannedArc> {
  await cancelAnyArcAlarmFor(item.id);
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskAlarmChannelAsync();
    await ensureSilentDeliveryChannelAsync();

    const id = arcAlarmNotificationId(item.id);
    await notifee.createTriggerNotification(
      {
        id,
        title: "הגיע הזמן לתרגול ARC",
        body: item.name,
        data: { kind: "arcAlarm", plannedArcId: item.id },
        // See armTaskAlarm's own comment -- the SILENT channel here is
        // what Android's startForeground() requirement forces this module
        // to post before hasActiveTaskConflict ever runs.
        android: buildAlarmAndroidConfig(
          [
            { title: "התחל ARC", pressAction: { id: ACTION_START_ARC } },
            { title: `נודניק ${SNOOZE_MINUTES} דקות`, pressAction: { id: ACTION_SNOOZE_ARC } },
            { title: "סגור", pressAction: { id: ACTION_CLOSE_ARC } },
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

    return { ...item, arcAlarmNotificationId: id, arcAlarmScheduledFor: fireAt.toISOString() };
  } catch (error) {
    console.error("armPlannedArcAlarm failed", item.id, error);
    return { ...item, arcAlarmNotificationId: null, arcAlarmScheduledFor: null };
  }
}

/** Cancels this planned ARC's own alarm (if any) and clears its notification fields. Never touches arcAlarmEnabled/arcAlarmTimingKind/arcAlarmTime/arcAlarmDate/arcAlarmRecurrence -- disarming is purely a native-scheduling concern, never a silent change to the trainee's own configured preference (requirement: "ביטול שעון מעורר מבטל את ההתראה בלבד ולא מוחק את תרגיל ARC"). */
export async function disarmPlannedArcAlarm(item: PlannedArc): Promise<PlannedArc> {
  await cancelAnyArcAlarmFor(item.id);
  return { ...item, arcAlarmNotificationId: null, arcAlarmScheduledFor: null };
}

/**
 * Single-item equivalent of reconcilePlannedArcAlarms below, for a
 * JUST-edited item (build/PlannedArcEditorScreen.tsx's own save flow)
 * -- arms the next qualifying occurrence, or disarms when nothing
 * qualifies (alarm turned off, before_task with no/archived linked
 * task, standalone with no time or no recurrence day). Callers must
 * persist the returned PlannedArc.
 */
export async function schedulePlannedArcAlarm(item: PlannedArc, linkedTask: Task | null, now: Date = new Date()): Promise<PlannedArc> {
  const nextOccurrence = resolveNextPlannedArcAlarmOccurrence(item, linkedTask, now);
  if (!nextOccurrence) return disarmPlannedArcAlarm(item);
  return armPlannedArcAlarm(item, nextOccurrence);
}

/** "סגור": stops the ring and clears the alarm WITHOUT scheduling anything else for this same occurrence -- same structural guarantee as turnOffTaskAlarm (resolveNextPlannedArcAlarmOccurrence's own "strictly after now" rule means the next reconcile can only ever land on a LATER occurrence). Persists immediately. */
export async function turnOffPlannedArcAlarm(item: PlannedArc): Promise<void> {
  const cleared = await disarmPlannedArcAlarm(item);
  await upsertPlannedArc(cleared);
}

async function turnOffPlannedArcAlarmById(plannedArcId: string): Promise<void> {
  const items = await loadPlannedArcs();
  const item = items.find((candidate) => candidate.id === plannedArcId);
  if (item) await turnOffPlannedArcAlarm(item);
}

/** "נודניק 5 דקות": stops the current ring and arms exactly ONE fresh alarm 5 minutes from now -- an ad-hoc override, never routed through resolveNextPlannedArcAlarmOccurrence, and never changes arcAlarmTime/arcAlarmRecurrence/arcAlarmTimingKind (requirement: "אינו משנה את שעת התרגול הקבועה או את החזרות העתידיות"). */
export async function snoozePlannedArcAlarm(item: PlannedArc, now: Date = new Date()): Promise<void> {
  const snoozedFireAt = new Date(now.getTime() + SNOOZE_MINUTES * 60 * 1000);
  const armed = await armPlannedArcAlarm(item, snoozedFireAt);
  await upsertPlannedArc(armed);
}

/**
 * Same lazy "reconcile on next relevant touch" pattern as
 * reconcileTaskAlarms -- called wherever Today gains focus
 * (build/TodayScreen.tsx), so a linked task's own time change,
 * recurrence change, deletion, or archival is reflected on every
 * "before_task" ARC alarm without the trainee having to reopen that
 * exercise's own editor. One batched savePlannedArcs call, same as
 * reconcileTaskAlarms's own single saveTasks -- never one write per item.
 */
export async function reconcilePlannedArcAlarms(now: Date = new Date()): Promise<PlannedArc[]> {
  const [items, tasks, overrides] = await Promise.all([loadPlannedArcs(), loadTasks(), loadTaskOccurrenceOverrides()]);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const reconciled = await Promise.all(
    items.map(async (item) => {
      const linkedTask = item.linkedTaskId ? tasksById.get(item.linkedTaskId) ?? null : null;
      const targetIso = resolveNextPlannedArcAlarmOccurrence(item, linkedTask, now, overrides)?.toISOString() ?? null;
      const inSync = item.arcAlarmScheduledFor === targetIso && (targetIso === null || isNativeArcAlarmId(item.arcAlarmNotificationId));
      if (inSync) return item;
      if (!targetIso) return disarmPlannedArcAlarm(item);
      return armPlannedArcAlarm(item, new Date(targetIso));
    })
  );
  await savePlannedArcs(reconciled);
  return reconciled;
}

/**
 * ARC alarm task, section 6 ("שילוב עם משימה פעילה"): pauses the one
 * globally-active task timer (if any, and only the main "task" kind,
 * never a "rest" sub-timer) exactly the way live/ActiveTaskScreen.tsx's
 * own handlePause already does for its "צריך ARC" button -- the exact
 * same pure pauseTaskTimerRun/pauseTask, the exact same notification
 * cleanup. The timer is only ever PAUSED, never reset, so the trainee
 * can resume it with its real remaining time once the ARC exercise
 * finishes or is skipped and they navigate back to that task. A no-op
 * when no task timer is running, or it's already paused, or it's a
 * rest sub-timer -- "ARC ייפתח כתרגול עצמאי" when nothing is active.
 */
async function pauseActiveTaskTimerIfAny(now: Date): Promise<void> {
  const run = await loadTaskTimerRun();
  if (!run || run.kind !== "task" || run.pausedAt !== null) return;
  const task = await getTask(run.taskId);
  if (!task) return;
  await cancelTaskTimerEndAlarm(run.notificationId);
  const paused = { ...pauseTaskTimerRun(run, now.toISOString()), notificationId: null };
  await saveTaskTimerRun(paused);
  await upsertTask(pauseTaskRecord(task, now.toISOString()));
}

/**
 * The one shared handler for all three ARC-alarm actions, however
 * triggered -- a notifee background/foreground event, or the in-app
 * live/ArcAlarmScreen.tsx's own buttons calling this directly. "התחל
 * ARC" never starts a new spontaneous session: it opens the EXACT
 * saved exercise this alarm was armed for, the same
 * `plannedArcId`-driven navigation live/ArcWindowScreen.tsx's own
 * runPlannedArc already uses -- live/NewArcLiveScreen.tsx itself
 * resolves Full vs. Mini from that saved item's own `kind`, never a
 * route param guessed here. Falls back to STANDALONE_ARC_TASK_ID when
 * this item has no linkedTaskId, exactly like
 * live/SpontaneousArcEntryScreen.tsx's own standalone entry.
 */
export async function handlePlannedArcAlarmAction(actionId: string, plannedArcId: string): Promise<void> {
  const items = await loadPlannedArcs();
  const item = items.find((candidate) => candidate.id === plannedArcId);
  if (!item) return;
  stopRinging();
  endForegroundServiceForId(arcAlarmNotificationId(plannedArcId));

  if (actionId === ACTION_START_ARC) {
    await turnOffPlannedArcAlarm(item);
    await pauseActiveTaskTimerIfAny(new Date());
    router.push({ pathname: "/tasks/[id]/arc", params: { id: item.linkedTaskId ?? STANDALONE_ARC_TASK_ID, plannedArcId: item.id } });
    return;
  }
  if (actionId === ACTION_SNOOZE_ARC) {
    await snoozePlannedArcAlarm(item);
    return;
  }
  if (actionId === ACTION_CLOSE_ARC) {
    await turnOffPlannedArcAlarm(item);
    return;
  }
}

// --- ARC alarm diagnostics ("שעון ARC שאינו מצלצל") ------------------------
//
// Exact mirror of the task-alarm diagnostics above (isAlarmRegisteredWithOs/
// armRealTaskAlarmTest/refreshRealTaskAlarmTestStatus), covering every step
// the spec's own section 1 names: is the alarm enabled, what time was
// actually computed, is a notification id actually stored, is it ACTUALLY
// registered with the OS (notifee's own getTriggerNotificationIds -- never
// just our own saved data), and is the Android 12+ exact-alarm permission
// on. All read-only except the three real-test functions, which schedule a
// REAL alarm 2 minutes out through the EXACT SAME schedulePlannedArcAlarm/
// armPlannedArcAlarm production path -- never a simplified stand-in.

/** Checks the OS's own bookkeeping for whether a planned ARC's alarm is actually still scheduled -- exact mirror of isAlarmRegisteredWithOs. Non-throwing. */
export async function isArcAlarmRegisteredWithOs(plannedArcId: string): Promise<boolean> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    return ids.includes(arcAlarmNotificationId(plannedArcId));
  } catch {
    return false;
  }
}

/**
 * Section 2 ("בדוק שהרשאת Exact Alarm מופעלת"): notifee's own
 * getNotificationSettings().android.alarm -- ENABLED/DISABLED/
 * NOT_SUPPORTED (Android < 12 has no such setting and is always usable).
 * Every alarm in this app uses AlarmType.SET_ALARM_CLOCK, which Android
 * itself exempts from this Android-12+ restriction (unlike SET_EXACT/
 * SET_EXACT_AND_ALLOW_WHILE_IDLE) -- so DISABLED here is unlikely to be
 * why an alarm silently fails to ring, but it's surfaced anyway, exactly
 * as asked, rather than assumed safe without checking.
 */
export async function getExactAlarmPermissionStatus(): Promise<AndroidNotificationSetting> {
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.android.alarm;
  } catch {
    return AndroidNotificationSetting.NOT_SUPPORTED;
  }
}

export interface PlannedArcAlarmDiagnostics {
  enabled: boolean;
  timingKind: PlannedArcAlarmTimingKind;
  /** Freshly recomputed right now via resolveNextPlannedArcAlarmOccurrence -- the same "when" resolveNextPlannedArcAlarmOccurrence/reconcilePlannedArcAlarms themselves use, never a second calculation. */
  computedNextFireAt: string | null;
  storedNotificationId: string | null;
  storedScheduledFor: string | null;
  isRegisteredWithOs: boolean;
  exactAlarmPermission: AndroidNotificationSetting;
}

/** Diagnostics for one specific planned ARC's own alarm -- the caller supplies its already-resolved linkedTask (or null), same convention as schedulePlannedArcAlarm/reconcilePlannedArcAlarms, never loaded twice. */
export async function diagnosePlannedArcAlarm(item: PlannedArc, linkedTask: Task | null, now: Date = new Date()): Promise<PlannedArcAlarmDiagnostics> {
  const computed = resolveNextPlannedArcAlarmOccurrence(item, linkedTask, now);
  const [isRegisteredWithOs, exactAlarmPermission] = await Promise.all([
    item.arcAlarmNotificationId ? isArcAlarmRegisteredWithOs(item.id) : Promise.resolve(false),
    getExactAlarmPermissionStatus(),
  ]);
  return {
    enabled: item.arcAlarmEnabled,
    timingKind: item.arcAlarmTimingKind,
    computedNextFireAt: computed ? computed.toISOString() : null,
    storedNotificationId: item.arcAlarmNotificationId,
    storedScheduledFor: item.arcAlarmScheduledFor,
    isRegisteredWithOs,
    exactAlarmPermission,
  };
}

/** Diagnostics for EVERY currently alarm-enabled planned ARC, for the diagnostics screen's own overview list. Loads tasks once for every item's own linkedTaskId, same batching discipline as reconcilePlannedArcAlarms. */
export async function diagnoseAllPlannedArcAlarms(now: Date = new Date()): Promise<{ item: PlannedArc; diagnostics: PlannedArcAlarmDiagnostics }[]> {
  const [items, tasks] = await Promise.all([loadPlannedArcs(), loadTasks()]);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const enabled = items.filter((item) => item.arcAlarmEnabled);
  return Promise.all(
    enabled.map(async (item) => {
      const linkedTask = item.linkedTaskId ? tasksById.get(item.linkedTaskId) ?? null : null;
      const diagnostics = await diagnosePlannedArcAlarm(item, linkedTask, now);
      return { item, diagnostics };
    })
  );
}

/** A disposable, minimal-but-valid PlannedArc for the real-alarm diagnostic tests below -- never shown in the real ARC library UI (it has no spontaneous-session origin a trainee would recognize), but a REAL record, saved and scheduled through the exact same production functions as any other planned ARC. */
function createArcAlarmTestFixture(kind: ArcAlarmTestKind, linkedTaskId: string | null): PlannedArc {
  const now = new Date().toISOString();
  const name = kind === "mini" ? "בדיקת שעון Mini ARC" : kind === "before_task" ? "בדיקת שעון ARC לפני משימה" : "בדיקת שעון ARC עצמאי";
  return {
    id: generatePlannedArcId(),
    name,
    kind: kind === "mini" ? "mini" : "full",
    track: "emotion_only",
    triggerText: null,
    selectedEmotion: null,
    customEmotionText: null,
    urgeText: null,
    thoughtText: null,
    thoughtTimeOrientation: null,
    interpretationText: null,
    supportiveBodyArea: null,
    supportiveSensation: null,
    positiveMovement: null,
    emotionalActionText: null,
    identityActionText: null,
    linkedTaskId,
    mantraText: null,
    activeEmotionalBeliefId: null,
    activeIdentityBeliefId: null,
    sourceSpontaneousExerciseId: now,
    createdAt: now,
    updatedAt: now,
    arcAlarmEnabled: true,
    arcAlarmTimingKind: "standalone",
    arcAlarmTime: null,
    arcAlarmDate: null,
    arcAlarmRecurrence: { kind: "once" },
    arcAlarmNotificationId: null,
    arcAlarmScheduledFor: null,
  };
}

/**
 * Section 5: "אני רוצה אפשרות לבדוק שעון ARC שמצלצל בעוד שתי דקות... חייב
 * להשתמש באותו מסלול תזמון והפעלה של שעון ARC אמיתי" -- creates and
 * saves a REAL PlannedArc (and, for "before_task", a REAL linked Task
 * too, exactly mirroring armRealTaskAlarmTest's own disposable test
 * task), then arms it via the EXACT SAME schedulePlannedArcAlarm every
 * ordinary save in build/PlannedArcEditorScreen.tsx calls -- never a
 * parallel or simplified scheduling path. For "before_task", the test
 * task's own arcWindowMinutesBefore is 0, so its ARC window lands
 * exactly at the task's own scheduledTime (2 minutes out) -- the
 * before_task timing's own "when" is entirely the task's, never
 * computed a second way here.
 */
export async function armRealPlannedArcAlarmTest(kind: ArcAlarmTestKind, now: Date = new Date()): Promise<ArcAlarmRealTestResult> {
  const fireAt = new Date(now.getTime() + 2 * 60 * 1000);
  const fireAtClock = `${String(fireAt.getHours()).padStart(2, "0")}:${String(fireAt.getMinutes()).padStart(2, "0")}`;

  let item: PlannedArc;
  let linkedTaskId: string | null = null;
  let linkedTask: Task | null = null;

  if (kind === "before_task") {
    const task: Task = {
      ...createEmptyTask(generateTaskId(), "משימת בדיקה לשעון ARC", "לבדוק שהשעון צילצל", now.toISOString()),
      scheduledDate: todayLocalDateString(fireAt),
      scheduledTime: fireAtClock,
      arcWindowMinutesBefore: 0,
    };
    await upsertTask(task);
    linkedTaskId = task.id;
    linkedTask = task;
    item = { ...createArcAlarmTestFixture(kind, linkedTaskId), arcAlarmTimingKind: "before_task" };
  } else {
    item = { ...createArcAlarmTestFixture(kind, null), arcAlarmTimingKind: "standalone", arcAlarmTime: fireAtClock, arcAlarmDate: todayLocalDateString(fireAt), arcAlarmRecurrence: { kind: "once" } };
  }

  await upsertPlannedArc(item);

  const result: ArcAlarmRealTestResult = {
    kind,
    plannedArcId: item.id,
    linkedTaskId,
    savedAt: now.toISOString(),
    fireAt: null,
    armError: null,
    registeredWithOsAfterArm: false,
    registeredWithOsOnLastCheck: false,
    firedAt: null,
  };

  try {
    const scheduled = await schedulePlannedArcAlarm(item, linkedTask, now);
    await upsertPlannedArc(scheduled);
    result.fireAt = scheduled.arcAlarmScheduledFor;
    if (!scheduled.arcAlarmNotificationId) {
      result.armError = "התזמון נכשל (הפונקציה החזירה תרגיל ללא שעון פעיל, ללא חריגה -- ראו את יומן השגיאות של armPlannedArcAlarm).";
    } else {
      result.registeredWithOsAfterArm = await isArcAlarmRegisteredWithOs(item.id);
      result.registeredWithOsOnLastCheck = result.registeredWithOsAfterArm;
    }
  } catch (error) {
    result.armError = error instanceof Error ? error.message : String(error);
    console.error("armRealPlannedArcAlarmTest failed", error);
  }

  await saveArcAlarmRealTestResult(result);
  return result;
}

/** Re-checks OS registration for an existing tracked ARC-alarm test, without re-arming anything -- exact mirror of refreshRealTaskAlarmTestStatus. */
export async function refreshArcAlarmRealTestStatus(kind: ArcAlarmTestKind): Promise<ArcAlarmRealTestResult | null> {
  const results = await loadArcAlarmRealTestResults();
  const existing = results[kind];
  if (!existing) return null;
  const registeredNow = await isArcAlarmRegisteredWithOs(existing.plannedArcId);
  const updated = { ...existing, registeredWithOsOnLastCheck: registeredNow };
  await saveArcAlarmRealTestResult(updated);
  return updated;
}

/**
 * The one shared handler for all three alarm actions, however they
 * were triggered -- a notifee background/foreground event (pressed
 * directly from the notification/lock screen, app possibly not even
 * open), or the in-app live/TaskAlarmScreen.tsx's own buttons (called
 * directly, bypassing notifee's event system entirely, since the UI is
 * already open). "Start Task" deliberately does NOT call startTask()
 * itself here -- it only clears the alarm and navigates onward, reusing
 * existing, already-tested flows for the actual status transition,
 * rather than a second, competing "start a task" implementation.
 *
 * Alarm-timer integration task, requirement 4: if the task has its own
 * optional ARC window set, "Start Task" goes there FIRST (never
 * straight to the timer) -- the window's own "דילוג"/ARC-completion
 * paths carry the autoStartAfter intent onward so the timer still
 * starts automatically once that step is done, with zero extra taps.
 * A task with no ARC window behaves exactly as before: straight to
 * Task LIVE with autoStart=1.
 */
export async function handleTaskAlarmAction(actionId: string, taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  stopRinging();
  endForegroundServiceFor(taskId);

  if (actionId === ACTION_START_TASK) {
    await disarmTaskAlarm(task).then(async (cleared) => {
      const tasks = await loadTasks();
      await saveTasks(tasks.map((candidate) => (candidate.id === cleared.id ? cleared : candidate)));
    });
    if (task.arcWindowMinutesBefore !== null) {
      router.push({ pathname: "/tasks/[id]/arc-window", params: { id: taskId, autoStartAfter: "1" } });
      return;
    }
    router.push({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
    return;
  }
  if (actionId === ACTION_SNOOZE) {
    await snoozeTaskAlarm(task);
    return;
  }
  if (actionId === ACTION_TURN_OFF) {
    await turnOffTaskAlarm(task);
    return;
  }
  if (actionId === ACTION_POSTPONE_OBSTACLE) {
    // Smart Postponement Flow, requirement 1: never a silent delay --
    // this occurrence's own alarm is done (ringing already stopped
    // above); disarming here is the same "this specific ring has been
    // handled" bookkeeping turnOffTaskAlarm does, and a still-planned
    // recurring task is re-armed for its next occurrence the next time
    // reconcileTaskAlarms runs (Today/DailyScheduleScreen's own focus
    // reload), exactly like every other action here.
    await disarmTaskAlarm(task).then(async (cleared) => {
      const tasks = await loadTasks();
      await saveTasks(tasks.map((candidate) => (candidate.id === cleared.id ? cleared : candidate)));
    });
    // replace, not push: a double press (e.g. one from the lock-screen
    // full-screen UI's own button, racing the notification action)
    // must never stack two copies of this screen on the nav stack.
    router.replace({ pathname: "/tasks/[id]/postpone-obstacle", params: { id: taskId } });
    return;
  }
}

/**
 * Routes a notifee event to handleTaskAlarmAction when it's one of
 * this alarm's own three actions, or to the full-screen alarm UI when
 * the notification/full-screen action itself was pressed (never
 * auto-starting the task just from opening the alarm screen -- only
 * the explicit "Start Task" button does that). Shared by both
 * onBackgroundEvent and onForegroundEvent (app/_layout.tsx) so the
 * exact same handling applies whether the app was killed, backgrounded,
 * or already open.
 */
export async function handleTaskAlarmEvent(event: Event): Promise<void> {
  const data = event.detail.notification?.data;
  if (!data) return;

  // Daily Visualization task: this reminder's own single action, or the
  // plain notification press -- both just open the Daily Visualization
  // screen directly (it has no ringing/foreground-service state of its
  // own to stop first, unlike every other alarm kind here).
  if (data.kind === "dailyVisualizationAlarm") {
    await handleDailyVisualizationAlarmEvent(event);
    return;
  }

  // Nine Functional Improvements task, Improvement 8: the quiet
  // lock-screen emotional check-in notification's own three actions --
  // routes through the shared handleEmotionalCheckInNotificationEvent
  // (data/emotionalCheckInNotification.ts), never a second
  // onBackgroundEvent/onForegroundEvent registration.
  if (data.kind === "emotionalCheckIn") {
    await handleEmotionalCheckInNotificationEvent(event);
    return;
  }

  // ARC Reminders task: the one task-transition notification's own
  // actions (😟/🙂/Start task) and body-tap (optional "Finish + smile")
  // -- routes through the shared handleTaskTransitionNotificationEvent
  // (data/taskTransitionNotification.ts), never a second
  // onBackgroundEvent/onForegroundEvent registration.
  if (data.kind === "taskTransition") {
    await handleTaskTransitionNotificationEvent(event);
    return;
  }

  // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
  // section 2: the one "task not started" notification's own three
  // actions (support/start/finish-or-give-up) and body-tap -- routes
  // through the shared handleTaskNotStartedNotificationEvent
  // (data/taskNotStartedNotification.ts), never a second
  // onBackgroundEvent/onForegroundEvent registration.
  if (data.kind === "taskNotStarted") {
    await handleTaskNotStartedNotificationEvent(event);
    return;
  }

  // ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
  // section 1: the free-time-window notification's own three actions
  // (start/different suggestion/not free) and body-tap -- routes
  // through the shared handleFreeTimeWindowNotificationEvent
  // (data/freeTimeWindowNotification.ts), never a second
  // onBackgroundEvent/onForegroundEvent registration.
  if (data.kind === "freeTimeWindow") {
    await handleFreeTimeWindowNotificationEvent(event);
    return;
  }

  // ARCHI -- Proactive Support During Task LIVE task: the mid-task
  // support notification's own three actions (😟/🙂/🧠 מחשבה-דחף) and
  // body-tap (demoted 😄 מעולה) -- routes through the shared
  // handleProactiveSupportNotificationEvent
  // (data/proactiveSupportNotification.ts), never a second
  // onBackgroundEvent/onForegroundEvent registration.
  if (data.kind === "proactiveSupport") {
    await handleProactiveSupportNotificationEvent(event);
    return;
  }

  // Nine Functional Improvements task, Improvement 9: this alarm's own
  // three actions (Start/Snooze/Close), or the full-screen alarm UI
  // when the notification itself was pressed -- mirrors the "arcAlarm"
  // branch above exactly.
  if (data.kind === "morningAlarm") {
    if (event.type === EventType.ACTION_PRESS && event.detail.pressAction) {
      await handleMorningAlarmAction(event.detail.pressAction.id);
      return;
    }
    if (event.type === EventType.PRESS) {
      await handleMorningAlarmAction("default");
    }
    return;
  }

  // ARC alarm task: this planned-ARC-exercise alarm's own three
  // actions, or the full-screen alarm UI when the notification itself
  // was pressed -- mirrors the "taskAlarm" branch below exactly, just
  // keyed by plannedArcId instead of taskId and routed to its own
  // screen/handler.
  if (data.kind === "arcAlarm") {
    const plannedArcId = typeof data.plannedArcId === "string" ? data.plannedArcId : null;
    if (!plannedArcId) return;
    if (event.type === EventType.ACTION_PRESS && event.detail.pressAction) {
      await handlePlannedArcAlarmAction(event.detail.pressAction.id, plannedArcId);
      return;
    }
    if (event.type === EventType.PRESS) {
      router.push({ pathname: "/planned-arcs/[id]/alarm", params: { id: plannedArcId } });
    }
    return;
  }

  // Diagnostics, Step 2: the test alarm's own single "עצור בדיקה"
  // action/press -- just stop ringing, never any task/navigation logic.
  if (data.kind === "taskAlarmTest") {
    if (event.type === EventType.ACTION_PRESS || event.type === EventType.PRESS) {
      stopRinging();
      endForegroundServiceFor("test");
      await cancelAnyAlarmFor("test");
    }
    return;
  }

  // Floating task timer task, requirement 4: the work-timer's own
  // end-of-timer ring has a single "עצור" action and no navigation of
  // its own -- the end-of-timer 3-choice prompt is already on screen
  // (live/ActiveTaskScreen.tsx's own timerEnded block) whether or not
  // this notification is ever pressed at all.
  if (data.kind === "taskTimerEnd") {
    if (event.type === EventType.ACTION_PRESS || event.type === EventType.PRESS) {
      const id = typeof event.detail.notification?.id === "string" ? event.detail.notification.id : null;
      stopRinging();
      if (id) {
        pendingForegroundServiceStops.get(id)?.();
        await cancelTaskTimerEndAlarm(id);
      }
    }
    return;
  }

  // ARC Reminders task, Active Recall inline reply: checked BEFORE the
  // generic soft-reminder tap branch right below, since an inline
  // answer is itself an ACTION_PRESS and must never ALSO fall through
  // to routeTappedReminder's plain "open the chat" navigation --
  // answering from the notification/lock screen stays exactly there,
  // no screen opened. event.detail.input is only ever populated by
  // notifee when the pressed action actually carried an AndroidInput
  // (data/notifications.ts's own ACTION_ARC_RECALL_ANSWER action), so
  // this never misfires for a plain tap on this same notification.
  if (
    data.kind === "arcRecallQuestion" &&
    event.type === EventType.ACTION_PRESS &&
    event.detail.pressAction?.id === ACTION_ARC_RECALL_ANSWER &&
    typeof event.detail.input === "string" &&
    event.detail.input.trim().length > 0
  ) {
    const chatMessageId = typeof data.arcRecallChatMessageId === "string" ? data.arcRecallChatMessageId : null;
    if (chatMessageId) await recordArcRecallAnswer(chatMessageId, event.detail.input, new Date().toISOString());
    const notificationId = event.detail.notification?.id;
    if (notificationId) await notifee.cancelNotification(notificationId).catch(() => {});
    return;
  }

  // ARCHI -- Complete the Non-Interrupting Notification System task:
  // a "soft" reminder redisplayed via redisplayReminderQuiet/Loud above
  // (routine/ARC GYM/sub-goal/four-week/personal-development-program/
  // life-manifest/deferred/Success-Focus) is tapped through notifee's
  // own event system now, not expo-notifications' -- routes through the
  // EXACT same routeTappedReminder data/reminders.ts already defines
  // (and app/_layout.tsx's own expo-notifications listener still uses
  // for the four current-task kinds that remain on that mechanism),
  // never a second, re-derived switch here.
  if (Boolean(data[REMINDER_DATA_FLAG])) {
    if (event.type === EventType.ACTION_PRESS || event.type === EventType.PRESS) {
      routeTappedReminder(data);
    }
    return;
  }

  if (data.kind !== "taskAlarm") return;
  const taskId = typeof data.taskId === "string" ? data.taskId : null;
  if (!taskId) return;

  if (event.type === EventType.ACTION_PRESS && event.detail.pressAction) {
    await handleTaskAlarmAction(event.detail.pressAction.id, taskId);
    return;
  }
  if (event.type === EventType.PRESS) {
    // The trainee tapped the notification/full-screen alarm itself (not one of the three buttons) -- show the task's name on the alarm screen, requirement 4, without touching the alarm's own ringing state.
    router.push({ pathname: "/tasks/[id]/alarm", params: { id: taskId } });
  }
}

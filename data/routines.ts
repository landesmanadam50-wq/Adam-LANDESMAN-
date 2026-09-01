/**
 * data/routines.ts
 *
 * The I/O half of "Multiple Scheduled ARC + Success Focus Routines" --
 * scheduling/cancelling each routine's own next-occurrence local
 * notification. Deliberately NOT built on data/reminders.ts's
 * PendingReminder (kind "focusSuccess" | "arc"): that model is
 * one-record-per-KIND by construction (see its own doc), which cannot
 * represent "any number of independently-scheduled routines, including
 * several at the exact same clock time, none of which may ever
 * overwrite another's notification or completion state" -- a hard
 * requirement of this feature. Instead each ScheduledRoutine
 * (data/storage.ts) owns its OWN nextOccurrenceNotificationId/
 * nextOccurrenceScheduledFor pair, and this file reuses the exact same
 * underlying scheduleReminderNotification/cancelScheduledNotification
 * primitives (data/notifications.ts) every other reminder in this app
 * already relies on -- one absolute-DATE-trigger notification per
 * routine's next occurrence, cancelled and replaced on every
 * reschedule, never a parallel notification system.
 */

import { resolveNextOccurrenceDate } from "../arc/routines.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import { loadScheduledRoutines, saveScheduledRoutines } from "./storage.ts";
import type { ScheduledRoutine } from "./storage.ts";

const ROUTINE_NOTIFICATION_TITLE = "ARCHI";

function routineNotificationBody(routine: ScheduledRoutine): string {
  return `הגיע הזמן ל: ${routine.title}`;
}

/**
 * Cancels this routine's currently-scheduled next-occurrence
 * notification (if any -- a no-op otherwise), then, only when the
 * routine is enabled with notifications on and still has a future
 * occurrence, schedules a fresh one for that occurrence. Returns the
 * routine with its notification fields updated to match -- callers
 * persist the returned value (see reconcileRoutineNotifications below,
 * and the create/edit/delete/toggle flows in app/routines/index.tsx),
 * never the original.
 */
export async function rescheduleRoutineNotification(routine: ScheduledRoutine, now: Date = new Date()): Promise<ScheduledRoutine> {
  await cancelScheduledNotification(routine.nextOccurrenceNotificationId);

  if (!routine.enabled || !routine.notificationsEnabled) {
    return { ...routine, nextOccurrenceNotificationId: null, nextOccurrenceScheduledFor: null };
  }

  const nextOccurrence = resolveNextOccurrenceDate(routine, now);
  if (!nextOccurrence) {
    return { ...routine, nextOccurrenceNotificationId: null, nextOccurrenceScheduledFor: null };
  }

  const notificationId = await scheduleReminderNotification({
    kind: "routine",
    fireAt: nextOccurrence,
    title: ROUTINE_NOTIFICATION_TITLE,
    body: routineNotificationBody(routine),
    arcRequested: true,
    routineId: routine.id,
  });

  return { ...routine, nextOccurrenceNotificationId: notificationId, nextOccurrenceScheduledFor: nextOccurrence.toISOString() };
}

/**
 * Brings every persisted routine's scheduled notification back in sync
 * with a freshly-computed next occurrence -- called on the routines
 * screen's own focus (app/routines/index.tsx), since (like every other
 * reminder in this app) a notification firing is never trusted as the
 * sole signal: absolute persisted timestamps are the source of truth,
 * the notification is only a best-effort background nudge. A routine
 * whose already-scheduled notification still targets the correct
 * (freshly recomputed) next occurrence is left completely untouched --
 * no needless cancel+reschedule churn -- so this is safe and cheap to
 * call on every focus. Only a genuinely stale/missing one (the
 * occurrence just passed, the routine was just created/edited/toggled
 * outside this reconciliation, or nothing was ever scheduled) is
 * refreshed.
 */
export async function reconcileRoutineNotifications(now: Date = new Date()): Promise<ScheduledRoutine[]> {
  const routines = await loadScheduledRoutines();
  const reconciled = await Promise.all(
    routines.map(async (routine) => {
      if (!routine.enabled || !routine.notificationsEnabled) {
        return routine.nextOccurrenceNotificationId !== null || routine.nextOccurrenceScheduledFor !== null
          ? rescheduleRoutineNotification(routine, now)
          : routine;
      }
      const nextOccurrence = resolveNextOccurrenceDate(routine, now);
      const targetIso = nextOccurrence ? nextOccurrence.toISOString() : null;
      const inSync = routine.nextOccurrenceScheduledFor === targetIso && (targetIso === null || routine.nextOccurrenceNotificationId !== null);
      return inSync ? routine : rescheduleRoutineNotification(routine, now);
    })
  );
  await saveScheduledRoutines(reconciled);
  return reconciled;
}

/** Cancels and clears a routine's own scheduled notification -- used when a routine is deleted, so its notification can never fire after it no longer exists. */
export async function cancelRoutineNotification(routine: ScheduledRoutine): Promise<void> {
  await cancelScheduledNotification(routine.nextOccurrenceNotificationId);
}

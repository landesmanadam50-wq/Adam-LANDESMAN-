/**
 * data/arcMantraDelivery.ts
 *
 * ARC Reminders task: given one ArcMantraReminder, loads its real
 * source record fresh from storage and resolves the exact text to
 * schedule as that mantra's notification body -- the one place that
 * bridges `ArcMantraReminder.sourceRef` (arc/arcReminders.ts, a pure
 * reference id, never a copy of text) to the pure content resolvers in
 * arc/arcMantraContent.ts. Returns `null` when there is nothing to
 * show yet (never fabricates content) -- callers (data/arcReminderScheduler.ts)
 * must skip scheduling that slot silently, never send an empty/invented
 * notification in its place.
 *
 * Content is resolved at SCHEDULING time (when the rolling-window
 * top-up computes the next ~72h of trigger notifications), not
 * literally at the OS's own display instant -- notifee's trigger
 * notifications bake their title/body in at creation time, same as
 * every other reminder kind in this app. Because the rolling top-up
 * re-runs on every edit of the underlying source record (and on every
 * app foreground), this stays close to "fresh" in practice; it is
 * HONESTLY not the same as re-rendering at the literal moment of
 * display, which would require intercepting data/taskAlarm.ts's own
 * delivery dispatcher (handleTaskAlarmEvent) -- deliberately left
 * untouched here, since that function is the single most delicate,
 * already-hardened piece of this app's entire notification system.
 */

import {
  resolveArcMemoryMantra,
  resolveDesiredFeelingMantra,
  resolveFirstIncompleteObjectiveMantra,
  resolveFutureIdentityMantra,
  resolvePresentIdentityMantra,
} from "../arc/arcMantraContent.ts";
import type { ArcMantraReminder } from "../arc/arcReminders.ts";
import { scheduleReminderNotification } from "./notifications.ts";
import { loadArcGymGoals, loadArcGymGoalObjectives, loadArcGymMemoryExercises, loadArcInsights, loadDailyVisualizationProfile, loadProfile } from "./storage.ts";
import type { ReminderKind } from "./storage.ts";

/** Loads whichever source record(s) the reminder's own subtype/sourceRef names, and resolves the exact text to schedule -- `null` means skip this delivery entirely. */
export async function resolveArcMantraReminderText(reminder: ArcMantraReminder): Promise<string | null> {
  switch (reminder.sourceRef.kind) {
    case "desired_feeling": {
      const profile = await loadDailyVisualizationProfile();
      return resolveDesiredFeelingMantra(profile);
    }
    case "arc_memory": {
      const memoryExerciseId = reminder.sourceRef.memoryExerciseId;
      const memories = await loadArcGymMemoryExercises();
      const memory = memories.find((item) => item.id === memoryExerciseId) ?? null;
      return resolveArcMemoryMantra(memory);
    }
    case "present_identity": {
      const insights = await loadArcInsights();
      const identityInsights = insights.filter((insight) => insight.beliefKind === "identity");
      const pinnedId = reminder.sourceRef.insightId;
      const insight = pinnedId ? (identityInsights.find((item) => item.id === pinnedId) ?? null) : (identityInsights.at(-1) ?? null);
      return resolvePresentIdentityMantra(insight);
    }
    case "future_identity": {
      const profile = await loadProfile();
      return resolveFutureIdentityMantra(profile, "identity");
    }
    case "arc_goal": {
      const goalId = reminder.sourceRef.goalId;
      const [goals, objectives] = await Promise.all([loadArcGymGoals(), loadArcGymGoalObjectives()]);
      const goal = goals.find((item) => item.id === goalId) ?? null;
      return resolveFirstIncompleteObjectiveMantra(goal, objectives);
    }
  }
}

/** Maps each ArcMantraSubtype to its own ReminderKind (data/storage.ts) -- the 5 distinct `arcMantra*` kinds data/reminders.ts's own routeTappedReminder already matches via `kind.startsWith("arcMantra")`. */
const MANTRA_SUBTYPE_TO_REMINDER_KIND: Record<ArcMantraReminder["subtype"], ReminderKind> = {
  desired_feeling: "arcMantraDesiredFeeling",
  arc_memory: "arcMantraMemory",
  present_identity: "arcMantraPresentIdentity",
  future_identity: "arcMantraFutureIdentity",
  arc_goal: "arcMantraGoal",
};

/**
 * Resolves this reminder's live mantra text, skipping silently (never a
 * fabricated mantra) when `resolveArcMantraReminderText` returns `null`;
 * otherwise schedules the real OS notification for `fireAt` through the
 * SAME `scheduleReminderNotification` every other reminder kind already
 * uses. Mantras never require a response (see data/reminders.ts's
 * routeTappedReminder, which just opens the central ARC Reminders
 * screen on tap) -- no chat message, no inline reply, unlike
 * data/arcRecallDelivery.ts's own deliverArcRecallReminder.
 */
export async function deliverArcMantraReminder(reminder: ArcMantraReminder, fireAt: Date): Promise<string | null> {
  const text = await resolveArcMantraReminderText(reminder);
  if (!text) return null;
  return scheduleReminderNotification({
    kind: MANTRA_SUBTYPE_TO_REMINDER_KIND[reminder.subtype],
    fireAt,
    title: "ARCHI — תזכורת",
    body: text,
    arcRequested: false,
    arcReminderId: reminder.id,
  });
}

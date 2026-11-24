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
import { loadArcGymGoals, loadArcGymGoalObjectives, loadArcGymMemoryExercises, loadArcInsights, loadDailyVisualizationProfile, loadProfile } from "./storage.ts";

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

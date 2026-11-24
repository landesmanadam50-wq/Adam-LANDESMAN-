/**
 * arc/arcMantraContent.ts
 *
 * ARC Reminders task: one resolver per ARC Mantra subtype, each
 * returning the exact text to deliver as that mantra's notification
 * body, built ONLY from the trainee's own already-saved content (never
 * fabricated). Every resolver returns `null` for "nothing to show yet"
 * (the source record doesn't exist, or hasn't been filled in) --
 * data/arcMantraDelivery.ts's job is to skip delivery silently on
 * `null`, never to send an empty/invented notification in its place.
 *
 * Deliberately NOT a single generic "resolve mantra text" dispatcher
 * over sourceRef.kind -- each resolver takes the already-loaded, real
 * record (or `null`) directly, so data/arcMantraDelivery.ts stays the
 * one place that knows how to load each kind of record; this module
 * never touches storage itself.
 */

import type { DailyVisualizationProfile } from "./dailyVisualization.ts";
import type { ArcGymMemoryExercise } from "./arcGym.ts";
import type { ArcInsight } from "./arcInsightBelief.ts";
import type { ArcBuildProfile, DevelopmentLayer } from "./types.ts";
import { getFutureOrientedMantraLine } from "./futureOrientedMantra.ts";
import type { ArcGymGoal, ArcGymGoalObjective } from "./arcGymGoal.ts";
import { resolveFirstIncompleteArcGymGoalObjective } from "./arcGymGoal.ts";

/** `DailyVisualizationProfile.desiredFeeling` is "" until the trainee ever sets it -- that's "nothing to show yet," never an empty mantra. */
export function resolveDesiredFeelingMantra(profile: DailyVisualizationProfile | null): string | null {
  const text = profile?.desiredFeeling.trim();
  if (!text) return null;
  return `אתה רוצה להרגיש בסוף היום: ${text}`;
}

/** `ArcGymMemoryExercise.actionText` IS the "remember to do X" sentence, read back verbatim, same discipline resolveArcGymMemoryMantraSteps (arc/arcGym.ts) already follows for the in-exercise mantra sequence -- this is a separate, SHORT reminder-style rendering for a push notification, never a rewritten/invented action. */
export function resolveArcMemoryMantra(memory: ArcGymMemoryExercise | null): string | null {
  const actionText = memory?.actionText.trim();
  if (!actionText) return null;
  return `תזכור: ${actionText}`;
}

/** The insight's own verbatim text, never restructured into an invented "you are X because Y" template the raw free text doesn't actually support. `null` when no identity-tagged insight has been saved yet (or the pinned one was deleted). */
export function resolvePresentIdentityMantra(insight: ArcInsight | null): string | null {
  if (!insight) return null;
  const text = insight.text.trim();
  if (!text || insight.beliefKind !== "identity") return null;
  return `תזכורת לזהות שלך: ${text}`;
}

/** Wraps the existing getFutureOrientedMantraLine (arc/futureOrientedMantra.ts) -- already renders a full, framed sentence or null, never reworded here. */
export function resolveFutureIdentityMantra(profile: Pick<ArcBuildProfile, "identityFutureOrientedMantra"> | null, layer: DevelopmentLayer = "identity"): string | null {
  if (!profile) return null;
  return getFutureOrientedMantraLine(profile, layer);
}

/** Wraps the new resolveFirstIncompleteArcGymGoalObjective (arc/arcGymGoal.ts) -- null once every objective is complete, or the goal has none yet, exactly mirroring that resolver's own null case rather than inventing a "you're all done" line here (the ARC Task Reminders screen's own "all done" message, §6.4 of the plan, is the one place that owns that wording). */
export function resolveFirstIncompleteObjectiveMantra(goal: ArcGymGoal | null, objectives: ArcGymGoalObjective[]): string | null {
  if (!goal) return null;
  const next = resolveFirstIncompleteArcGymGoalObjective(objectives, goal.id);
  if (!next) return null;
  return `היעד הקרוב שלך ב"${goal.title}": ${next.title}`;
}

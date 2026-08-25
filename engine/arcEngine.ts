/**
 * engine/arcEngine.ts
 *
 * The ARC Engine state machine. Every function here is pure:
 * (profile, session) -> answer. No React, no side effects, no I/O.
 *
 * This is deliberate: TRAIN and the future meditation-generation
 * module are both expected to reuse this same logic (per the
 * product spec), so nothing here may assume it's being driven by
 * the LIVE screens specifically.
 */

import type { ArcProfile, LiveSession } from "./types.ts";
import { LiveStage, STAGE_ORDER } from "./types.ts";
import { getIntensityBand } from "./thresholds.ts";

/**
 * Decides whether a given stage should be shown at all, based on the
 * trainee's profile and what's been answered so far in this session.
 * This is the single source of truth for every "skip" rule in the spec.
 */
export function shouldShowStage(
  stage: LiveStage,
  session: LiveSession,
  profile: ArcProfile
): boolean {
  switch (stage) {
    case LiveStage.PreventiveActionCheck:
      // Spec §18: only relevant if a preventive action was ever defined.
      return !!profile.preventiveAction;

    case LiveStage.EmotionGate:
    case LiveStage.PresenceCheck:
      return true;

    case LiveStage.ArcThoughtAwareness:
    case LiveStage.ArcThoughtCombinedAttention:
    case LiveStage.ArcThoughtExpansion:
    case LiveStage.ArcThoughtPresenceRecheck:
      // Spec §9: only enter ARC Thought if presence is below threshold.
      if (session.presenceLevel === null) return false;
      return session.presenceLevel < profile.presenceThreshold;

    case LiveStage.BodyLocation:
      // Spec §19: body location is used in State/Identity ARC, not Habit ARC.
      return profile.arcType !== "habit";

    case LiveStage.IntensityCheck:
    case LiveStage.AcceptanceCheck:
      return true;

    case LiveStage.StayBreathAwareness:
      if (session.intensityLevel === null) return false;
      return getIntensityBand(session.intensityLevel, profile.intensityThresholds) === "stay";

    case LiveStage.Regulation:
      if (session.intensityLevel === null) return false;
      return getIntensityBand(session.intensityLevel, profile.intensityThresholds) === "regulate";

    case LiveStage.Encoding:
      if (session.intensityLevel === null) return false;
      return getIntensityBand(session.intensityLevel, profile.intensityThresholds) === "encode";

    case LiveStage.BeneficialAction:
    case LiveStage.Reward:
      return true;

    case LiveStage.SuccessFocus:
      // Spec §25: only if the trainee opts in after the main action.
      return session.wantsSuccessFocus === true;

    case LiveStage.InterferingAction:
      // Spec §29-32: only if a reduction plan exists AND the trainee
      // opts to use the window now. Positive-first: this can only be
      // reached after Reward (and optionally SuccessFocus) in STAGE_ORDER.
      return !!profile.interferingAction && session.wantsToUseInterferingActionWindow === true;

    case LiveStage.Finish:
      return true;

    default:
      return true;
  }
}

/**
 * Given the current stage, walks forward through STAGE_ORDER and
 * returns the next stage that should actually be shown. Falls back
 * to Finish if nothing else qualifies.
 */
export function getNextStage(
  currentStage: LiveStage,
  session: LiveSession,
  profile: ArcProfile
): LiveStage {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  for (let i = currentIndex + 1; i < STAGE_ORDER.length; i++) {
    const candidate = STAGE_ORDER[i];
    if (shouldShowStage(candidate, session, profile)) {
      return candidate;
    }
  }

  return LiveStage.Finish;
}

/** Convenience for starting a session: the first stage that should be shown. */
export function getFirstStage(session: LiveSession, profile: ArcProfile): LiveStage {
  for (const stage of STAGE_ORDER) {
    if (shouldShowStage(stage, session, profile)) {
      return stage;
    }
  }
  return LiveStage.Finish;
}

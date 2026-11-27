/**
 * arc/arcAddictionProgression.ts
 *
 * The gradual, two-metric progression of ARC Addiction:
 *
 *   זמן ההמתנה  – each episode in which a waiting round reached its
 *                 target (without being ended early) grows the next
 *                 target by `waitProgression.stepMinutes` (default +1
 *                 minute), unless the user chose "hold".
 *   משך ההתנהגות – each logged behavior duration that is at or below the
 *                 current gentle reduction target lowers the next target
 *                 by `durationProgression.stepMinutes` (default 1
 *                 minute, never below 1). The first logged duration
 *                 seeds the target.
 *
 * Core rule: NOTHING here ever resets or automatically lowers the
 * user's wait progress, and nothing raises the duration target as a
 * "penalty". Not meeting a target simply leaves it where it was. Only
 * explicit user edits (holdTarget / decrease / set) move a target the
 * other way. Progression is applied exactly once per episode.
 */

import type { AddictionEpisode, AddictionProfile, AddictionProgressionMode } from "./arcAddiction.ts";
import {
  clampDurationTargetMinutes,
  clampInteger,
  clampWaitMinutes,
  isEpisodeWaitTargetMet,
  MAX_DURATION_STEP_MINUTES,
  MAX_WAIT_STEP_MINUTES,
  MIN_DURATION_TARGET_MINUTES,
} from "./arcAddiction.ts";

export interface ProgressionResult {
  profile: AddictionProfile;
  episode: AddictionEpisode;
  waitTargetChanged: boolean;
  durationTargetChanged: boolean;
}

export function computeNextWaitTarget(profile: AddictionProfile, targetMet: boolean): number {
  if (!targetMet || profile.waitProgression.mode === "hold") return profile.waitTargetMinutes;
  return clampWaitMinutes(profile.waitTargetMinutes + profile.waitProgression.stepMinutes);
}

/**
 * Duration target after logging `loggedMinutes` (null = not stated => unchanged).
 * The first logged duration seeds the target; a duration at or below the
 * target lowers it by one step; a longer duration leaves it untouched.
 */
export function computeNextDurationTarget(profile: AddictionProfile, loggedMinutes: number | null): number | null {
  const current = profile.behaviorDurationTargetMinutes;
  if (loggedMinutes === null || !Number.isFinite(loggedMinutes) || loggedMinutes < 0) return current;
  if (current === null) return clampDurationTargetMinutes(Math.max(MIN_DURATION_TARGET_MINUTES, Math.round(loggedMinutes)));
  if (profile.durationProgression.mode === "hold") return current;
  if (loggedMinutes <= current) return clampDurationTargetMinutes(current - profile.durationProgression.stepMinutes);
  return current;
}

/** Applies a closed episode to its profile – idempotent (a second call with the same episode is a no-op). */
export function applyEpisodeToProfile(profile: AddictionProfile, episode: AddictionEpisode, now: string): ProgressionResult {
  if (episode.progressionAppliedAt !== null || episode.profileId !== profile.id) {
    return { profile, episode, waitTargetChanged: false, durationTargetChanged: false };
  }
  const nextWait = computeNextWaitTarget(profile, isEpisodeWaitTargetMet(episode));
  const nextDuration = episode.outcome === "acted" ? computeNextDurationTarget(profile, episode.behavior?.durationMinutes ?? null) : profile.behaviorDurationTargetMinutes;
  const waitTargetChanged = nextWait !== profile.waitTargetMinutes;
  const durationTargetChanged = nextDuration !== profile.behaviorDurationTargetMinutes;
  const nextProfile: AddictionProfile =
    waitTargetChanged || durationTargetChanged ? { ...profile, waitTargetMinutes: nextWait, behaviorDurationTargetMinutes: nextDuration, updatedAt: now } : profile;
  return {
    profile: nextProfile,
    episode: { ...episode, waitTargetAfter: nextWait, durationTargetAfter: nextDuration, progressionAppliedAt: now },
    waitTargetChanged,
    durationTargetChanged,
  };
}

// ---------------------------------------------------------------------------
// Explicit user edits – the only way a target moves "backwards"
// ---------------------------------------------------------------------------

export function setWaitTarget(profile: AddictionProfile, minutes: number, now: string): AddictionProfile {
  return { ...profile, waitTargetMinutes: clampWaitMinutes(minutes), updatedAt: now };
}

export function decreaseWaitTarget(profile: AddictionProfile, byMinutes: number, now: string): AddictionProfile {
  return setWaitTarget(profile, profile.waitTargetMinutes - Math.max(1, Math.round(byMinutes)), now);
}

export function setWaitProgression(profile: AddictionProfile, mode: AddictionProgressionMode, stepMinutes: number, now: string): AddictionProfile {
  return { ...profile, waitProgression: { mode, stepMinutes: clampInteger(stepMinutes, 1, MAX_WAIT_STEP_MINUTES) }, updatedAt: now };
}

export function setDurationTarget(profile: AddictionProfile, minutes: number | null, now: string): AddictionProfile {
  return { ...profile, behaviorDurationTargetMinutes: minutes === null ? null : clampDurationTargetMinutes(minutes), updatedAt: now };
}

export function setDurationProgression(profile: AddictionProfile, mode: AddictionProgressionMode, stepMinutes: number, now: string): AddictionProfile {
  return { ...profile, durationProgression: { mode, stepMinutes: clampInteger(stepMinutes, 1, MAX_DURATION_STEP_MINUTES) }, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Trend (shown as a direction, never as a grade)
// ---------------------------------------------------------------------------

export type AddictionTrend = "improving" | "steady" | "not_yet" | "insufficient_data";

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Compares the mean of the latest `window` values with the `window`
 * before it. `lowerIsBetter` for behavior duration, false for wait time.
 * "not_yet" (rather than "worse") when the direction is the other way –
 * the copy never frames it as failure.
 */
export function computeTrend(valuesOldestFirst: number[], lowerIsBetter: boolean, window = 5): AddictionTrend {
  if (valuesOldestFirst.length < 2) return "insufficient_data";
  const size = Math.min(window, Math.floor(valuesOldestFirst.length / 2));
  const recent = valuesOldestFirst.slice(-size);
  const previous = valuesOldestFirst.slice(-2 * size, -size);
  const delta = mean(recent) - mean(previous);
  const threshold = Math.max(0.05 * Math.abs(mean(previous)), 0.01);
  if (Math.abs(delta) <= threshold) return "steady";
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return better ? "improving" : "not_yet";
}

/**
 * arc/arcAddiction.ts
 *
 * ARC Addiction – מסוגלות, זמן וקבלה: the pure data model for the
 * behavior profiles and practice episodes of the ARC Addiction route.
 *
 * The route has three mechanisms:
 *   1. מסוגלות – an ARC exercise that builds the capacity to bear the
 *      bodily sensation tied to the urge (arc/arcAddictionArc.ts).
 *   2. זמן – a waiting timer whose target grows gradually, plus gentle
 *      tracking of a shrinking behavior duration
 *      (arc/arcAddictionProgression.ts).
 *   3. קבלה – a full self-acceptance ARC after acting on the urge,
 *      never conditional on success (arc/arcAddictionArc.ts).
 *
 * The session state machine itself lives in arc/arcAddictionFlow.ts.
 * Everything here is pure (no storage, no React) so it is unit-tested
 * directly; persistence lives in data/arcAddictionStorage.ts.
 *
 * Nothing in this model ever stores "failure", "relapse" or a
 * resettable streak: acting on the urge is an outcome to document,
 * never a reason to lower or reset the user's progress.
 */

import type { BodyScanRegion } from "./bodyScanRegions.ts";
import { BODY_SCAN_ALL_REGIONS } from "./bodyScanRegions.ts";
import type { BodyScanSide } from "./bodyScanSelection.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ADDICTION_RATING_MIN = 0;
export const ADDICTION_RATING_MAX = 10;
/** Every 0..10 value, for chip rows. */
export const ADDICTION_RATING_VALUES: readonly number[] = Array.from({ length: ADDICTION_RATING_MAX + 1 }, (_, index) => index);

export const DEFAULT_INITIAL_WAIT_MINUTES = 1;
export const DEFAULT_WAIT_STEP_MINUTES = 1;
export const MIN_WAIT_MINUTES = 1;
export const MAX_WAIT_MINUTES = 240;
export const MAX_WAIT_STEP_MINUTES = 30;

export const DEFAULT_DURATION_STEP_MINUTES = 1;
export const MIN_DURATION_TARGET_MINUTES = 1;
export const MAX_DURATION_MINUTES = 24 * 60;
export const MAX_DURATION_STEP_MINUTES = 30;

/** Quick-pick durations (minutes) for the retrospective behavior log. */
export const BEHAVIOR_DURATION_QUICK_PICKS: readonly number[] = [1, 3, 5, 10, 15, 30, 60];

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface AddictionBodyArea {
  region: BodyScanRegion;
  side: BodyScanSide;
}

/** A supportive sensation the user pinned on the profile (in addition to the automatic ranking from the shared supportive-sensation bank). */
export interface AddictionSupportiveSensation {
  region: BodyScanRegion | null;
  side: BodyScanSide;
  label: string;
  movementLabel: string | null;
}

export type AddictionProgressionMode = "increase" | "hold";

export interface AddictionProgressionSettings {
  /** "increase": each met target grows the next one by `stepMinutes`. "hold": stay on the same target. */
  mode: AddictionProgressionMode;
  stepMinutes: number;
}

export interface AddictionProfile {
  id: string;
  /** שם ההתנהגות */
  name: string;
  /** התחושה הגופנית הקשורה לדחף (free text, e.g. "עקצוץ ולחץ באוזניים"). */
  urgeSensation: string;
  /** האזורים בגוף שבהם מורגשת התחושה. */
  urgeBodyAreas: AddictionBodyArea[];
  supportiveSensations: AddictionSupportiveSensation[];
  /** true => only retrospective logging of the behavior, never a timer that runs while it happens. */
  mayCauseBodilyHarm: boolean;
  /** יעד זמן ההמתנה הנוכחי, minutes. */
  waitTargetMinutes: number;
  waitProgression: AddictionProgressionSettings;
  /** Gentle reduction target for the behavior's own duration; null until the first logged duration (it is then seeded from that value). */
  behaviorDurationTargetMinutes: number | null;
  durationProgression: AddictionProgressionSettings;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function generateAddictionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateAddictionProfileId(): string {
  return generateAddictionId("addiction-profile");
}

export function generateAddictionEpisodeId(): string {
  return generateAddictionId("addiction-episode");
}

export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampWaitMinutes(value: number): number {
  return clampInteger(value, MIN_WAIT_MINUTES, MAX_WAIT_MINUTES);
}

export function clampDurationTargetMinutes(value: number): number {
  return clampInteger(value, MIN_DURATION_TARGET_MINUTES, MAX_DURATION_MINUTES);
}

export function createAddictionProfile(
  id: string,
  fields: {
    name: string;
    urgeSensation?: string;
    urgeBodyAreas?: AddictionBodyArea[];
    supportiveSensations?: AddictionSupportiveSensation[];
    mayCauseBodilyHarm?: boolean;
    initialWaitMinutes?: number;
  },
  now: string
): AddictionProfile {
  return {
    id,
    name: fields.name.trim(),
    urgeSensation: (fields.urgeSensation ?? "").trim(),
    urgeBodyAreas: dedupeAreas(fields.urgeBodyAreas ?? []),
    supportiveSensations: fields.supportiveSensations ?? [],
    mayCauseBodilyHarm: fields.mayCauseBodilyHarm ?? false,
    waitTargetMinutes: clampWaitMinutes(fields.initialWaitMinutes ?? DEFAULT_INITIAL_WAIT_MINUTES),
    waitProgression: { mode: "increase", stepMinutes: DEFAULT_WAIT_STEP_MINUTES },
    behaviorDurationTargetMinutes: null,
    durationProgression: { mode: "increase", stepMinutes: DEFAULT_DURATION_STEP_MINUTES },
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export interface AddictionProfileValidation {
  valid: boolean;
  errors: string[];
}

export function validateAddictionProfile(profile: Pick<AddictionProfile, "name" | "waitTargetMinutes">): AddictionProfileValidation {
  const errors: string[] = [];
  if (profile.name.trim().length === 0) errors.push("יש לתת שם להתנהגות.");
  if (!Number.isInteger(profile.waitTargetMinutes) || profile.waitTargetMinutes < MIN_WAIT_MINUTES || profile.waitTargetMinutes > MAX_WAIT_MINUTES) {
    errors.push(`זמן ההמתנה צריך להיות בין ${MIN_WAIT_MINUTES} ל־${MAX_WAIT_MINUTES} דקות.`);
  }
  return { valid: errors.length === 0, errors };
}

export function updateAddictionProfile(profile: AddictionProfile, patch: Partial<Omit<AddictionProfile, "id" | "createdAt">>, now: string): AddictionProfile {
  const merged: AddictionProfile = { ...profile, ...patch, id: profile.id, createdAt: profile.createdAt, updatedAt: now };
  return normalizeAddictionProfile(merged);
}

export function areaKey(area: { region: BodyScanRegion | null; side: BodyScanSide }): string {
  return `${area.region ?? ""}::${area.side ?? ""}`;
}

function dedupeAreas(areas: AddictionBodyArea[]): AddictionBodyArea[] {
  const seen = new Set<string>();
  const out: AddictionBodyArea[] = [];
  for (const area of areas) {
    const key = areaKey(area);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(area);
  }
  return out;
}

/** Toggle one (region, side) in a list of areas – used by the body maps. */
export function toggleAddictionBodyArea(areas: readonly AddictionBodyArea[], region: BodyScanRegion, side: BodyScanSide): AddictionBodyArea[] {
  const key = areaKey({ region, side });
  if (areas.some((area) => areaKey(area) === key)) return areas.filter((area) => areaKey(area) !== key);
  return [...areas, { region, side }];
}

function isBodyScanRegion(value: unknown): value is BodyScanRegion {
  return typeof value === "string" && (BODY_SCAN_ALL_REGIONS as string[]).includes(value);
}

function normalizeSide(value: unknown): BodyScanSide {
  return value === "left" || value === "right" ? value : null;
}

function normalizeProgression(raw: unknown, maxStep: number, defaultStep: number): AddictionProgressionSettings {
  const value = (raw ?? {}) as Partial<AddictionProgressionSettings>;
  const mode: AddictionProgressionMode = value.mode === "hold" ? "hold" : "increase";
  const step = typeof value.stepMinutes === "number" ? clampInteger(value.stepMinutes, 1, maxStep) : defaultStep;
  return { mode, stepMinutes: step };
}

/** Defensive normalization applied on every load – a damaged or older record never crashes the route. */
export function normalizeAddictionProfile(raw: AddictionProfile): AddictionProfile {
  const value = (raw ?? {}) as Partial<AddictionProfile>;
  const now = new Date(0).toISOString();
  const areas = Array.isArray(value.urgeBodyAreas)
    ? value.urgeBodyAreas.filter((area) => area && isBodyScanRegion(area.region)).map((area) => ({ region: area.region, side: normalizeSide(area.side) }))
    : [];
  const supportive = Array.isArray(value.supportiveSensations)
    ? value.supportiveSensations
        .filter((entry) => entry && typeof entry.label === "string" && entry.label.trim().length > 0)
        .map((entry) => ({
          region: isBodyScanRegion(entry.region) ? entry.region : null,
          side: normalizeSide(entry.side),
          label: entry.label.trim(),
          movementLabel: typeof entry.movementLabel === "string" && entry.movementLabel.trim() ? entry.movementLabel.trim() : null,
        }))
    : [];
  const durationTarget =
    typeof value.behaviorDurationTargetMinutes === "number" && Number.isFinite(value.behaviorDurationTargetMinutes)
      ? clampDurationTargetMinutes(value.behaviorDurationTargetMinutes)
      : null;
  return {
    id: typeof value.id === "string" ? value.id : generateAddictionProfileId(),
    name: typeof value.name === "string" ? value.name : "",
    urgeSensation: typeof value.urgeSensation === "string" ? value.urgeSensation : "",
    urgeBodyAreas: dedupeAreas(areas),
    supportiveSensations: supportive,
    mayCauseBodilyHarm: value.mayCauseBodilyHarm === true,
    waitTargetMinutes: typeof value.waitTargetMinutes === "number" ? clampWaitMinutes(value.waitTargetMinutes) : DEFAULT_INITIAL_WAIT_MINUTES,
    waitProgression: normalizeProgression(value.waitProgression, MAX_WAIT_STEP_MINUTES, DEFAULT_WAIT_STEP_MINUTES),
    behaviorDurationTargetMinutes: durationTarget,
    durationProgression: normalizeProgression(value.durationProgression, MAX_DURATION_STEP_MINUTES, DEFAULT_DURATION_STEP_MINUTES),
    archived: value.archived === true,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
}

export function upsertAddictionProfileInList(profiles: readonly AddictionProfile[], profile: AddictionProfile): AddictionProfile[] {
  const index = profiles.findIndex((existing) => existing.id === profile.id);
  if (index === -1) return [...profiles, profile];
  const next = [...profiles];
  next[index] = profile;
  return next;
}

export function deleteAddictionProfileFromList(profiles: readonly AddictionProfile[], id: string): AddictionProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}

// ---------------------------------------------------------------------------
// Ratings & the urge-intensity routing rule
// ---------------------------------------------------------------------------

export function isValidAddictionRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= ADDICTION_RATING_MIN && value <= ADDICTION_RATING_MAX;
}

export function normalizeRating(value: unknown): number | null {
  return isValidAddictionRating(value) ? value : null;
}

/**
 * The intensity rule after the user chose NOT to act on the urge:
 *   0     => "zero": may finish the practice and document a success.
 *   1..4  => "low":  continue the regular activity, or another waiting timer.
 *   5..10 => "high": an additional efficacy ARC is offered (never forced),
 *                    followed by another waiting timer.
 * Anything else (negative, > 10, fractional, NaN, non-number) => null,
 * so the screen keeps "continue" disabled instead of guessing.
 */
export type AddictionIntensityRoute = "zero" | "low" | "high";

export function resolveIntensityRoute(intensity: unknown): AddictionIntensityRoute | null {
  if (!isValidAddictionRating(intensity)) return null;
  if (intensity === 0) return "zero";
  if (intensity <= 4) return "low";
  return "high";
}

/** The choices offered for each route, primary (suggested) choice first. Every route can always end the practice. */
export type AddictionIntensityChoice = "finish_success" | "continue_routine" | "extra_wait" | "extra_arc" | "end";

export function resolveIntensityChoices(route: AddictionIntensityRoute): AddictionIntensityChoice[] {
  switch (route) {
    case "zero":
      return ["finish_success", "extra_wait"];
    case "low":
      return ["continue_routine", "extra_wait", "extra_arc"];
    case "high":
      return ["extra_arc", "extra_wait", "end"];
  }
}

// ---------------------------------------------------------------------------
// Episode (one entry into the route = one history record)
// ---------------------------------------------------------------------------

export type AddictionArcKind = "efficacy" | "acceptance";

export interface AddictionArcRound {
  kind: AddictionArcKind;
  startedAt: string;
  completedAt: string | null;
  skipped: boolean;
  /** efficacy: "how able do you feel to bear the sensation now" 0..10. acceptance: "how much do you accept yourself now" (after). */
  ratingAfter: number | null;
  /** acceptance only: self-acceptance before the exercise. */
  ratingBefore: number | null;
}

export interface AddictionWaitRound {
  startedAt: string;
  targetMinutes: number;
  endsAt: string;
  /** Set when the user ended the timer before endsAt. */
  endedEarlyAt: string | null;
  /** Set when the wait reached endsAt (in-app tick, notification, or reconcile on open). */
  elapsedAt: string | null;
  answeredAt: string | null;
  choice: "act" | "not_act" | null;
  intensityAfter: number | null;
}

export type AddictionEpisodeOutcome = "resisted" | "acted" | "ended_by_user" | "abandoned";

export interface AddictionBehaviorLog {
  /** null when the user chose not to state a duration. */
  durationMinutes: number | null;
  loggedRetrospectively: boolean;
  /** Only for non-harmful behaviors that used the optional count-up stopwatch. */
  stopwatchStartedAt: string | null;
  loggedAt: string;
}

export interface AddictionEpisode {
  id: string;
  profileId: string;
  /** The Task LIVE task this episode was started from, if any. */
  taskId: string | null;
  startedAt: string;
  endedAt: string | null;
  initialIntensity: number | null;
  arcRounds: AddictionArcRound[];
  waitRounds: AddictionWaitRound[];
  outcome: AddictionEpisodeOutcome | null;
  behavior: AddictionBehaviorLog | null;
  /** Self-acceptance reactions named during the acceptance ARC (e.g. "בושה"). */
  acceptanceReactions: string[];
  savedPositiveMemoryId: string | null;
  waitTargetBefore: number;
  waitTargetAfter: number | null;
  durationTargetBefore: number | null;
  durationTargetAfter: number | null;
  /** Guard: progression is applied to the profile exactly once per episode. */
  progressionAppliedAt: string | null;
}

export function createAddictionEpisode(id: string, profile: AddictionProfile, taskId: string | null, now: string): AddictionEpisode {
  return {
    id,
    profileId: profile.id,
    taskId,
    startedAt: now,
    endedAt: null,
    initialIntensity: null,
    arcRounds: [],
    waitRounds: [],
    outcome: null,
    behavior: null,
    acceptanceReactions: [],
    savedPositiveMemoryId: null,
    waitTargetBefore: profile.waitTargetMinutes,
    waitTargetAfter: null,
    durationTargetBefore: profile.behaviorDurationTargetMinutes,
    durationTargetAfter: null,
    progressionAppliedAt: null,
  };
}

/** A wait round "met the target" when it reached its end time without the user ending it early (whatever was chosen afterwards). */
export function isWaitRoundTargetMet(round: AddictionWaitRound): boolean {
  return round.endedEarlyAt === null && round.elapsedAt !== null;
}

export function isEpisodeWaitTargetMet(episode: AddictionEpisode): boolean {
  return episode.waitRounds.some(isWaitRoundTargetMet);
}

/** Total seconds actually waited across all rounds (an early end counts up to the moment it was ended). */
export function computeEpisodeWaitSeconds(episode: AddictionEpisode, now: string): number {
  const nowMs = Date.parse(now);
  let total = 0;
  for (const round of episode.waitRounds) {
    const start = Date.parse(round.startedAt);
    const endCandidate = round.endedEarlyAt ?? round.elapsedAt ?? (round.answeredAt ? round.endsAt : null);
    const end = endCandidate ? Date.parse(endCandidate) : Math.min(nowMs, Date.parse(round.endsAt));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) total += Math.round((end - start) / 1000);
  }
  return total;
}

export function countNotActChoices(episode: AddictionEpisode): number {
  return episode.waitRounds.filter((round) => round.choice === "not_act").length;
}

function normalizeArcRound(raw: AddictionArcRound): AddictionArcRound {
  return {
    kind: raw?.kind === "acceptance" ? "acceptance" : "efficacy",
    startedAt: typeof raw?.startedAt === "string" ? raw.startedAt : new Date(0).toISOString(),
    completedAt: typeof raw?.completedAt === "string" ? raw.completedAt : null,
    skipped: raw?.skipped === true,
    ratingAfter: normalizeRating(raw?.ratingAfter),
    ratingBefore: normalizeRating(raw?.ratingBefore),
  };
}

function normalizeWaitRound(raw: AddictionWaitRound): AddictionWaitRound {
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    startedAt: str(raw?.startedAt) ?? new Date(0).toISOString(),
    targetMinutes: typeof raw?.targetMinutes === "number" ? clampWaitMinutes(raw.targetMinutes) : DEFAULT_INITIAL_WAIT_MINUTES,
    endsAt: str(raw?.endsAt) ?? str(raw?.startedAt) ?? new Date(0).toISOString(),
    endedEarlyAt: str(raw?.endedEarlyAt),
    elapsedAt: str(raw?.elapsedAt),
    answeredAt: str(raw?.answeredAt),
    choice: raw?.choice === "act" || raw?.choice === "not_act" ? raw.choice : null,
    intensityAfter: normalizeRating(raw?.intensityAfter),
  };
}

const OUTCOMES: AddictionEpisodeOutcome[] = ["resisted", "acted", "ended_by_user", "abandoned"];

export function normalizeAddictionEpisode(raw: AddictionEpisode): AddictionEpisode {
  const value = (raw ?? {}) as Partial<AddictionEpisode>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const behavior = value.behavior && typeof value.behavior === "object"
    ? {
        durationMinutes: num(value.behavior.durationMinutes),
        loggedRetrospectively: value.behavior.loggedRetrospectively !== false,
        stopwatchStartedAt: typeof value.behavior.stopwatchStartedAt === "string" ? value.behavior.stopwatchStartedAt : null,
        loggedAt: typeof value.behavior.loggedAt === "string" ? value.behavior.loggedAt : new Date(0).toISOString(),
      }
    : null;
  return {
    id: typeof value.id === "string" ? value.id : generateAddictionEpisodeId(),
    profileId: typeof value.profileId === "string" ? value.profileId : "",
    taskId: typeof value.taskId === "string" ? value.taskId : null,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : new Date(0).toISOString(),
    endedAt: typeof value.endedAt === "string" ? value.endedAt : null,
    initialIntensity: normalizeRating(value.initialIntensity),
    arcRounds: Array.isArray(value.arcRounds) ? value.arcRounds.map(normalizeArcRound) : [],
    waitRounds: Array.isArray(value.waitRounds) ? value.waitRounds.map(normalizeWaitRound) : [],
    outcome: OUTCOMES.includes(value.outcome as AddictionEpisodeOutcome) ? (value.outcome as AddictionEpisodeOutcome) : null,
    behavior,
    acceptanceReactions: Array.isArray(value.acceptanceReactions) ? value.acceptanceReactions.filter((r): r is string => typeof r === "string") : [],
    savedPositiveMemoryId: typeof value.savedPositiveMemoryId === "string" ? value.savedPositiveMemoryId : null,
    waitTargetBefore: typeof value.waitTargetBefore === "number" ? clampWaitMinutes(value.waitTargetBefore) : DEFAULT_INITIAL_WAIT_MINUTES,
    waitTargetAfter: num(value.waitTargetAfter),
    durationTargetBefore: num(value.durationTargetBefore),
    durationTargetAfter: num(value.durationTargetAfter),
    progressionAppliedAt: typeof value.progressionAppliedAt === "string" ? value.progressionAppliedAt : null,
  };
}

export function upsertAddictionEpisodeInList(episodes: readonly AddictionEpisode[], episode: AddictionEpisode): AddictionEpisode[] {
  const index = episodes.findIndex((existing) => existing.id === episode.id);
  if (index === -1) return [...episodes, episode];
  const next = [...episodes];
  next[index] = episode;
  return next;
}

/** Soft cap so the history key can never grow without bound: keeps the newest `maxPerProfile` episodes of each profile. */
export const MAX_EPISODES_PER_PROFILE = 2000;

export function pruneAddictionEpisodes(episodes: readonly AddictionEpisode[], maxPerProfile = MAX_EPISODES_PER_PROFILE): AddictionEpisode[] {
  const byProfile = new Map<string, AddictionEpisode[]>();
  for (const episode of episodes) {
    const list = byProfile.get(episode.profileId) ?? [];
    list.push(episode);
    byProfile.set(episode.profileId, list);
  }
  const keep = new Set<string>();
  for (const list of byProfile.values()) {
    const newestFirst = [...list].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    for (const episode of newestFirst.slice(0, maxPerProfile)) keep.add(episode.id);
  }
  return episodes.filter((episode) => keep.has(episode.id));
}

/** Context key in the shared supportive-body-sensation bank (arc/supportiveBodySensation.ts) – one per profile and ARC kind, so what helped bear THIS urge is suggested again for this urge. */
export function resolveAddictionSensationContextKey(profileId: string, kind: AddictionArcKind): string {
  return kind === "efficacy" ? `addiction:${profileId}` : `addictionAcceptance:${profileId}`;
}

/**
 * arc/supportiveBodySensation.ts
 *
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task. The
 * fourth component, alongside the external task (arc/tasks.ts), the
 * pre-chosen supportive feeling and the pre-chosen internal action
 * (both arc/supportiveFeelings.ts): a supportive BODY sensation the
 * trainee discovers DURING an ARC session's own body-work steps
 * (supportive_area_select / short_body_marking / mini_acceptance_transition
 * -- the existing screens that already set NewArcLiveSessionState's
 * supportiveBodyArea/supportiveSensation/positiveMovement fields, see
 * arc/newArcLiveTypes.ts). This module never touches that in-session
 * capture -- it only remembers, ranks, and suggests what was captured,
 * as a flat, append-only history, the exact same style as
 * arc/internalActionRating.ts's own InternalActionUsage[] (deliberately
 * a SEPARATE type, not a field bolted onto that one -- a body-sensation
 * discovery is a structurally different event: it happens mid-session,
 * not before it, and carries fields InternalActionUsage has no business
 * holding: a readiness-improved flag and a later-resolved task-started
 * outcome).
 *
 * No AsyncStorage, no navigation, no React here; data/storage.ts is the
 * thin I/O wrapper.
 */

import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanSide } from "./bodyScanSelection.ts";

export const SUPPORTIVE_BODY_SENSATION_RATING_MIN = 0;
export const SUPPORTIVE_BODY_SENSATION_RATING_MAX = 10;

export function isValidSupportiveBodySensationRating(value: number): boolean {
  return Number.isInteger(value) && value >= SUPPORTIVE_BODY_SENSATION_RATING_MIN && value <= SUPPORTIVE_BODY_SENSATION_RATING_MAX;
}

export function assertSupportiveBodySensationRating(value: number, fieldName: string): void {
  if (!isValidSupportiveBodySensationRating(value)) {
    throw new Error(`${fieldName} must be an integer between ${SUPPORTIVE_BODY_SENSATION_RATING_MIN} and ${SUPPORTIVE_BODY_SENSATION_RATING_MAX}, got ${value}`);
  }
}

export type SupportiveBodySensationArcTrack = "full" | "shortened" | "mini";

/**
 * Minimal shape of the session fields this module reads to build a
 * context key -- kept intentionally narrower than the full
 * NewArcLiveSessionState (arc/newArcLiveTypes.ts) so this module never
 * needs to import that much larger type and the two stay decoupled.
 */
export interface BodySensationContextSource {
  taskId: string;
  arcGymSituationId: string | null;
  arcGymMemoryExerciseId: string | null;
  arcPerspectiveId: string | null;
  arcFocusPracticeId: string | null;
}

/** The standalone-ARC sentinel task id (arc/newArcLiveTypes.ts's STANDALONE_ARC_TASK_ID) is never a real context -- callers pass the real id string, this module just excludes it by the same spelling to avoid an import cycle. */
const STANDALONE_SENTINEL = "__standalone__";

/**
 * Ordered, most-specific-first list of context keys a discovery/suggestion
 * lookup should use. A real task gets "task:<id>" first; additionally,
 * when the task is linked to an ARC Behaviour situation
 * (Task.linkedArcGymSituationId, arc/tasks.ts -- already built for ARC
 * Goal), "arcGymSituation:<id>" is appended, so a situation proactively
 * rehearsed in advance (section 10: ARC Behaviour / Daily Visualization)
 * surfaces its own history as a suggestion during a later real-time,
 * task-linked session with zero extra plumbing. A session with no
 * task/trigger context at all (pure spontaneous, no link) resolves to an
 * empty array -- correctly meaning "no suggestions, nothing to learn
 * from yet," never an error.
 */
export function resolveBodySensationContextKeys(source: BodySensationContextSource, linkedArcGymSituationId?: string | null): string[] {
  const keys: string[] = [];
  if (source.taskId && source.taskId !== STANDALONE_SENTINEL) keys.push(`task:${source.taskId}`);
  if (source.arcGymSituationId) keys.push(`arcGymSituation:${source.arcGymSituationId}`);
  if (source.arcGymMemoryExerciseId) keys.push(`arcGymMemory:${source.arcGymMemoryExerciseId}`);
  if (source.arcPerspectiveId) keys.push(`arcPerspective:${source.arcPerspectiveId}`);
  if (source.arcFocusPracticeId) keys.push(`arcFocusPractice:${source.arcFocusPracticeId}`);
  if (linkedArcGymSituationId && !keys.includes(`arcGymSituation:${linkedArcGymSituationId}`)) {
    keys.push(`arcGymSituation:${linkedArcGymSituationId}`);
  }
  return keys;
}

/**
 * One real-time discovery of one supportive body sensation, in service
 * of one task/trigger context -- a flat, append-only history row.
 * `sensationEffectivenessRating`/`readinessImproved` are null from the
 * moment of discovery (recordBodySensationDiscovery) until the trainee
 * actually answers the in-ARC effect-check (recordBodySensationRating);
 * `taskStarted` is null until resolved from OUTSIDE ARC entirely, by
 * whichever of performStart()/finishOrGiveUpTask() fires first for this
 * context (see data/storage.ts's markSupportiveBodySensationUsagesTaskOutcome).
 * A session abandoned before any of these three fires must never be
 * silently treated as a failure -- it is simply excluded from ranking
 * math (see computeBodySensationRanking below), same as a brand-new,
 * never-yet-tried sensation.
 */
export interface SupportiveBodySensationUsage {
  id: string;
  contextKey: string;
  region: BodyScanRegion | null;
  side: BodyScanSide;
  sensationLabel: string | null;
  movementLabel: string | null;
  arcTrackChosen: SupportiveBodySensationArcTrack;
  sensationEffectivenessRating: number | null;
  readinessImproved: boolean | null;
  taskStarted: boolean | null;
  discoveredAt: string;
  ratedAt: string | null;
  startedCheckedAt: string | null;
}

function generateUsageId(): string {
  return `body-sensation-usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordBodySensationDiscovery(
  contextKey: string,
  region: BodyScanRegion | null,
  side: BodyScanSide,
  sensationLabel: string | null,
  movementLabel: string | null,
  arcTrackChosen: SupportiveBodySensationArcTrack,
  now: string
): SupportiveBodySensationUsage {
  return {
    id: generateUsageId(),
    contextKey,
    region,
    side,
    sensationLabel,
    movementLabel,
    arcTrackChosen,
    sensationEffectivenessRating: null,
    readinessImproved: null,
    taskStarted: null,
    discoveredAt: now,
    ratedAt: null,
    startedCheckedAt: null,
  };
}

export function recordBodySensationRating(usage: SupportiveBodySensationUsage, rating: number, readinessImproved: boolean, now: string): SupportiveBodySensationUsage {
  assertSupportiveBodySensationRating(rating, "SupportiveBodySensationUsage.sensationEffectivenessRating");
  return { ...usage, sensationEffectivenessRating: rating, readinessImproved, ratedAt: now };
}

export function recordBodySensationTaskStartedOutcome(usage: SupportiveBodySensationUsage, taskStarted: boolean, now: string): SupportiveBodySensationUsage {
  return { ...usage, taskStarted, startedCheckedAt: now };
}

export interface RankedBodySensation {
  region: BodyScanRegion | null;
  side: BodyScanSide;
  sensationLabel: string | null;
  movementLabel: string | null;
  /** null for a never-yet-rated discovery -- always still returned, always still suggestable, just carries no score to sort by (placed after every scored entry, never excluded, never implied "ineffective"). */
  score: number | null;
  tryCount: number;
}

/**
 * Same Bayesian-shrinkage-toward-a-neutral-prior style as
 * arc/internalActionRating.ts's own computeInternalActionRanking --
 * score = (sum(ratings) + PRIOR_WEIGHT * PRIOR_MEAN) / (count + PRIOR_WEIGHT),
 * so one lucky 10/1-try discovery never outranks a consistent
 * 8-average/many-try one. Distinct (region, side, sensationLabel)
 * combinations are ranked as separate entries -- the same free-text
 * sensation on a different region is a genuinely different discovery.
 */
const RANKING_PRIOR_MEAN = (SUPPORTIVE_BODY_SENSATION_RATING_MIN + SUPPORTIVE_BODY_SENSATION_RATING_MAX) / 2;
const RANKING_PRIOR_WEIGHT = 3;

function groupKey(usage: SupportiveBodySensationUsage): string {
  return `${usage.region ?? ""}::${usage.side ?? ""}::${usage.sensationLabel ?? ""}`;
}

/**
 * Ranks every distinct body sensation ever discovered under any of the
 * given context keys, by accumulated effectiveness experience -- never
 * by last-rating-only. A sensation with zero RATED discoveries (never
 * tried, or tried but abandoned before rating) gets `score: null` and
 * sorts after every scored sensation, but is NEVER excluded and never
 * implied to be unhelpful -- "every option always stays selectable."
 */
export function computeBodySensationRanking(contextKeys: string[], usages: SupportiveBodySensationUsage[]): RankedBodySensation[] {
  const relevant = usages.filter((usage) => contextKeys.includes(usage.contextKey));
  const byGroup = new Map<string, SupportiveBodySensationUsage[]>();
  for (const usage of relevant) {
    const key = groupKey(usage);
    const list = byGroup.get(key) ?? [];
    list.push(usage);
    byGroup.set(key, list);
  }
  const ranked: RankedBodySensation[] = [];
  for (const groupUsages of byGroup.values()) {
    const [{ region, side, sensationLabel, movementLabel }] = groupUsages;
    const rated = groupUsages.filter((usage): usage is SupportiveBodySensationUsage & { sensationEffectivenessRating: number } => usage.sensationEffectivenessRating !== null);
    if (rated.length === 0) {
      ranked.push({ region, side, sensationLabel, movementLabel, score: null, tryCount: groupUsages.length });
      continue;
    }
    const sum = rated.reduce((total, usage) => total + usage.sensationEffectivenessRating, 0);
    const score = (sum + RANKING_PRIOR_WEIGHT * RANKING_PRIOR_MEAN) / (rated.length + RANKING_PRIOR_WEIGHT);
    ranked.push({ region, side, sensationLabel, movementLabel, score, tryCount: groupUsages.length });
  }
  return ranked.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
}

/** The top `limit` ranked sensations for these context keys -- what the body-work screens actually render as "הצעות מהעבר," never auto-applied, only ever offered. */
export function resolveSuggestedBodySensations(contextKeys: string[], usages: SupportiveBodySensationUsage[], limit: number): RankedBodySensation[] {
  if (contextKeys.length === 0) return [];
  return computeBodySensationRanking(contextKeys, usages).slice(0, limit);
}

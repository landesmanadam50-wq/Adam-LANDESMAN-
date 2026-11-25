/**
 * arc/internalActionRating.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 5: effectiveness rating + personal, on-device learning for which
 * internal actions (arc/supportiveFeelings.ts) actually help a trainee
 * strengthen a given supportive feeling. Deliberately a NEW 0-10 scale
 * (the user's own explicit spec), not a reuse of arc/ratings.ts's 1-10
 * RATING_MIN/MAX -- that file's constants back a completely different,
 * unrelated ARC-engine field, and changing its bounds would be a breaking
 * change to that other feature. The flat-append-only-history-array style
 * (never an aggregate, comparisons computed on demand) mirrors
 * arc/factorRating.ts's own FactorRating[] convention.
 *
 * No AsyncStorage, no navigation, no React here; data/internalActionUsages.ts
 * is the thin I/O wrapper.
 */

export const INTERNAL_ACTION_RATING_MIN = 0;
export const INTERNAL_ACTION_RATING_MAX = 10;

export function isValidInternalActionRating(value: number): boolean {
  return Number.isInteger(value) && value >= INTERNAL_ACTION_RATING_MIN && value <= INTERNAL_ACTION_RATING_MAX;
}

export function assertInternalActionRating(value: number, fieldName: string): void {
  if (!isValidInternalActionRating(value)) {
    throw new Error(`${fieldName} must be an integer between ${INTERNAL_ACTION_RATING_MIN} and ${INTERNAL_ACTION_RATING_MAX}, got ${value}`);
  }
}

/** Clamps and rounds to the nearest valid rating -- for sanitizing input before it reaches storage, not a substitute for UI-level prevention (a fixed 0-10 picker). */
export function normalizeInternalActionRating(value: number): number {
  return Math.min(INTERNAL_ACTION_RATING_MAX, Math.max(INTERNAL_ACTION_RATING_MIN, Math.round(value)));
}

export type InternalState = "bad" | "fine" | "great";
export type ArcTrackChosen = "full" | "shortened" | "none";

/**
 * One real-time use of one internal action, in service of one supportive
 * feeling, for one task -- a flat, append-only history row. `effectivenessRating`
 * is null from the moment the action is chosen (recordInternalActionUsageStart)
 * until the trainee actually rates it (recordInternalActionUsageRating) --
 * an action abandoned mid-flow (never rated) must never be silently
 * treated as a 0; it is simply excluded from ranking math entirely (see
 * computeInternalActionRanking below), same as a brand-new,
 * never-yet-tried action.
 */
export interface InternalActionUsage {
  id: string;
  taskId: string;
  feelingId: string;
  actionId: string;
  internalStateAtStart: InternalState;
  arcTrackChosen: ArcTrackChosen;
  effectivenessRating: number | null;
  startedAt: string;
  ratedAt: string | null;
}

function generateUsageId(): string {
  return `internal-action-usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordInternalActionUsageStart(
  taskId: string,
  feelingId: string,
  actionId: string,
  internalStateAtStart: InternalState,
  arcTrackChosen: ArcTrackChosen,
  now: string
): InternalActionUsage {
  return { id: generateUsageId(), taskId, feelingId, actionId, internalStateAtStart, arcTrackChosen, effectivenessRating: null, startedAt: now, ratedAt: null };
}

export function recordInternalActionUsageRating(usage: InternalActionUsage, rating: number, now: string): InternalActionUsage {
  assertInternalActionRating(rating, "InternalActionUsage.effectivenessRating");
  return { ...usage, effectivenessRating: rating, ratedAt: now };
}

export interface RankedAction {
  actionId: string;
  /** null for a never-yet-rated action -- it is still always returned, always selectable, just carries no score to sort by (placed after every scored entry, never excluded, never implied "low"). */
  score: number | null;
  tryCount: number;
}

/**
 * Bayesian/Wilson-style shrinkage toward a neutral prior, so a single
 * lucky 10/1-try action never outranks a consistent 8-average/20-try
 * one: score = (sum(ratings) + PRIOR_WEIGHT * PRIOR_MEAN) / (count + PRIOR_WEIGHT).
 * PRIOR_MEAN sits at the exact midpoint of the 0-10 scale (neither
 * optimistic nor pessimistic by default); PRIOR_WEIGHT is "worth" this
 * many hypothetical neutral tries before real experience takes over.
 */
const RANKING_PRIOR_MEAN = (INTERNAL_ACTION_RATING_MIN + INTERNAL_ACTION_RATING_MAX) / 2;
const RANKING_PRIOR_WEIGHT = 3;

/**
 * Ranks every internal action ever used for this feeling, by accumulated
 * effectiveness experience -- never by last-rating-only. An action with
 * zero RATED usages (either never tried, or tried but abandoned before
 * rating) gets `score: null` and is sorted AFTER every scored action,
 * but is NEVER excluded from the result and never implied to be
 * ineffective -- "every action always stays selectable" (user's own
 * explicit requirement).
 */
export function computeInternalActionRanking(feelingId: string, usages: InternalActionUsage[]): RankedAction[] {
  const relevant = usages.filter((usage) => usage.feelingId === feelingId);
  const byAction = new Map<string, InternalActionUsage[]>();
  for (const usage of relevant) {
    const list = byAction.get(usage.actionId) ?? [];
    list.push(usage);
    byAction.set(usage.actionId, list);
  }
  const ranked: RankedAction[] = [];
  for (const [actionId, actionUsages] of byAction) {
    const rated = actionUsages.filter((usage): usage is InternalActionUsage & { effectivenessRating: number } => usage.effectivenessRating !== null);
    if (rated.length === 0) {
      ranked.push({ actionId, score: null, tryCount: actionUsages.length });
      continue;
    }
    const sum = rated.reduce((total, usage) => total + usage.effectivenessRating, 0);
    const score = (sum + RANKING_PRIOR_WEIGHT * RANKING_PRIOR_MEAN) / (rated.length + RANKING_PRIOR_WEIGHT);
    ranked.push({ actionId, score, tryCount: actionUsages.length });
  }
  return ranked.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
}

/**
 * Section 4 step 2's own explicit requirement: "prioritizing ones that
 * were effective for this task's context before." Splits the ranking
 * into two groups -- actions this exact task has used before (ranked
 * among themselves first) and every other action linked to the feeling
 * (ranked among themselves, appended after) -- rather than a single
 * global ranking that could bury a task-proven action under an
 * unrelated task's lucky rating.
 */
export function resolveActionsForFeelingRankedForTask(
  feelingId: string,
  taskId: string,
  actionIds: string[],
  usages: InternalActionUsage[]
): string[] {
  const taskUsages = usages.filter((usage) => usage.feelingId === feelingId && usage.taskId === taskId);
  const taskActionIds = new Set(taskUsages.map((usage) => usage.actionId));
  const forThisTask = actionIds.filter((id) => taskActionIds.has(id));
  const everythingElse = actionIds.filter((id) => !taskActionIds.has(id));

  const rankWithin = (ids: string[], usagePool: InternalActionUsage[]): string[] => {
    const ranking = computeInternalActionRanking(feelingId, usagePool);
    const order = new Map(ranking.map((entry, index) => [entry.actionId, index]));
    return [...ids].sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
  };

  return [...rankWithin(forThisTask, taskUsages), ...rankWithin(everythingElse, usages.filter((usage) => usage.feelingId === feelingId))];
}

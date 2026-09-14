/**
 * arc/projectionCompletion.ts
 *
 * Adaptive ARC architecture task, decision 4 ("definition of a completed
 * session"): revives and generalizes program/progress.ts's own
 * `recordValidLiveCompletion`/`LiveCompletionInput` concept (its
 * `reachedAct`/`actionCompleted` two-flag gate -- "opening a session and
 * abandoning it does not count") across every projection kind
 * (Full/Mini/Link/Action-only) and both tracks (Self Development/ARC
 * Goal), rather than inventing an unrelated signal. The SAME two-flag
 * idea is reused here under arc/types.ts's ArcLiveState's own current
 * field names, `actionReached`/`realActionCompleted` -- the modern,
 * actively-used equivalent of program/progress.ts's `reachedAct`/
 * `actionCompleted` (that module itself stays untouched; this is a
 * parallel, generalized module, not an edit to it).
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet. A later phase wires a real caller (the LIVE completion handler)
 * to build a ProjectionCompletionInput from the actual session and pass
 * it through evaluateProjectionCompletion, then
 * applyProjectionCompletionToProgress to persist the result.
 */

import type { IdentityExtensionTrack } from "./identityExtension.ts";

export type ArcProjectionKind = "full" | "mini" | "link" | "action_only";

/** The same two-flag gate program/progress.ts's LiveCompletionInput already uses, renamed to match arc/types.ts's ArcLiveState's own current field names. */
export interface ActionCompletionSignal {
  actionReached: boolean;
  realActionCompleted: boolean;
}

/**
 * Whether Identity was part of THIS session at all. `selected: false`
 * means the trainee never opted into (or was never offered) an Identity
 * continuation this session -- distinct from `selected: true` with the
 * action left incomplete, which IS an attempted-but-abandoned Identity
 * continuation (decision 4's own "preserve separate information showing
 * State completion even if the optional Identity continuation was
 * abandoned").
 */
export interface IdentityCompletionSignal extends ActionCompletionSignal {
  selected: boolean;
}

/**
 * ARC Link never requires a real-world action (decision 4: "ARC Link
 * does not require a real-world action unless that specific Link
 * configuration explicitly contains one... Do not require
 * actionActuallyCompleted for a purely imagined ARC Link"). Its own,
 * separate completion signal:
 * - reachedFinalStage: the composed rehearsal sequence's own last stage
 *   was reached (arc/futureArcLink.ts's own stage order ends at
 *   "transition" -- the future phase's projection-aware Link composer
 *   will supply this).
 * - requiredDwellsCompleted: every imagery/dwell stage the specific
 *   composed sequence required was genuinely completed, not skipped.
 * - completionAcknowledged: the trainee explicitly completed the
 *   sequence (mirrors ArcLiveState.futureLinkAcknowledged's own "set
 *   the moment the trainee continues past the stage" shape) -- never
 *   inferred merely from navigating away.
 */
export interface LinkCompletionSignal {
  reachedFinalStage: boolean;
  requiredDwellsCompleted: boolean;
  completionAcknowledged: boolean;
}

export type ProjectionCompletionInput =
  | {
      projection: "full" | "mini" | "action_only";
      track: IdentityExtensionTrack;
      sessionId: string;
      state: ActionCompletionSignal;
      /** null only when Identity genuinely has no role in this projection at all (never used for ARC Goal, where Identity is always mandatory -- see evaluateProjectionCompletion's own doc). */
      identity: IdentityCompletionSignal | null;
    }
  | {
      projection: "link";
      track: IdentityExtensionTrack;
      sessionId: string;
      link: LinkCompletionSignal;
    };

export interface ProjectionCompletionResult {
  /**
   * Whether the STATE portion alone was genuinely completed -- always
   * computed (even when the overall session doesn't qualify for full
   * progression credit), so partial progress is never silently lost
   * (decision 4: "preserve partial-progress information, but do not
   * increment the completed Goal-session counter" / "preserve separate
   * information showing State completion"). For a Link projection this
   * mirrors the Link's own completion (there is no separate "state
   * action" concept inside a purely imagined rehearsal).
   */
  stateCompleted: boolean;
  /**
   * Whether the IDENTITY portion was genuinely completed, when Identity
   * was part of this session at all. null when Identity was never
   * selected/applicable this session -- never conflated with "selected
   * but abandoned" (which is `false`). Always null for a Link
   * projection (Link has no separate Identity completion concept in
   * this phase).
   */
  identityCompleted: boolean | null;
  /**
   * Whether this session counts as a fully completed session for
   * progression-counter purposes. See evaluateProjectionCompletion's
   * own doc for the exact per-track/per-projection rule.
   */
  countsForProgression: boolean;
}

/**
 * The single evaluation rule, per decision 4:
 *
 * - Full/Mini/Action-only, personal_development (Self Development)
 *   track, Identity NOT selected this session: stateCompleted alone is
 *   sufficient -- "Completing the State action is sufficient for the
 *   core session count."
 * - Full/Mini/Action-only, personal_development track, Identity
 *   selected: BOTH stateCompleted AND identityCompleted are required --
 *   "the selected Identity action must also be completed for the
 *   Identity-inclusive route to count as fully completed."
 * - Full/Mini/Action-only, goal_achievement (ARC Goal) track: Identity
 *   is always mandatory (decision 4: "A Goal session is not fully
 *   completed if only the State action was completed") -- BOTH are
 *   required regardless of the input's own `identity.selected` flag; a
 *   missing/null `identity` input degrades to "not completed" rather
 *   than crashing, since a well-formed Goal session always supplies one.
 * - Link, either track: never requires realActionCompleted -- counts
 *   only when the rehearsal's own three signals (reachedFinalStage,
 *   requiredDwellsCompleted, completionAcknowledged) are all true.
 */
export function evaluateProjectionCompletion(input: ProjectionCompletionInput): ProjectionCompletionResult {
  if (input.projection === "link") {
    const { reachedFinalStage, requiredDwellsCompleted, completionAcknowledged } = input.link;
    const linkCompleted = reachedFinalStage && requiredDwellsCompleted && completionAcknowledged;
    return { stateCompleted: linkCompleted, identityCompleted: null, countsForProgression: linkCompleted };
  }

  const stateCompleted = input.state.actionReached && input.state.realActionCompleted;

  if (input.track === "goal_achievement") {
    const identityCompleted = input.identity !== null && input.identity.actionReached && input.identity.realActionCompleted;
    return { stateCompleted, identityCompleted, countsForProgression: stateCompleted && identityCompleted };
  }

  // personal_development (Self Development)
  const identitySelected = input.identity !== null && input.identity.selected;
  if (!identitySelected) {
    return { stateCompleted, identityCompleted: null, countsForProgression: stateCompleted };
  }
  const identityCompleted = input.identity!.actionReached && input.identity!.realActionCompleted;
  return { stateCompleted, identityCompleted, countsForProgression: stateCompleted && identityCompleted };
}

// ---------------------------------------------------------------------------
// Progress counters (decision 4's own "Progress counters" section, and
// decisions 14-15 of the earlier adaptive-architecture message): reactive
// progress is keyed by "interference item + linked State + linked
// Identity/version"; proactive progress is keyed by "State + linked
// Identity/version". Changing either the linked State or Identity
// produces a DIFFERENT key, so old progress is never silently merged
// into a changed mapping -- see the accompanying test for a literal
// proof of this.
// ---------------------------------------------------------------------------

export interface ReactiveMappingProgressKey {
  interferenceItemId: string;
  linkedStateId: string;
  /** null when this mapping has no linked Identity (or no particular version to distinguish) at all. */
  linkedIdentityVersion: string | null;
}

export interface ProactiveStateProgressKey {
  stateId: string;
  linkedIdentityVersion: string | null;
}

export function reactiveMappingProgressKeyToString(key: ReactiveMappingProgressKey): string {
  return `${key.interferenceItemId}::${key.linkedStateId}::${key.linkedIdentityVersion ?? "none"}`;
}

export function proactiveStateProgressKeyToString(key: ProactiveStateProgressKey): string {
  return `${key.stateId}::${key.linkedIdentityVersion ?? "none"}`;
}

export interface ProjectionProgressCounters {
  completedFullCount: number;
  completedMiniCount: number;
  completedLinkCount: number;
  completedActionOnlyCount: number;
  /** Idempotency guard (decision 4: "Make completion recording idempotent so the same session ID cannot increment progress twice"). */
  countedSessionIds: string[];
}

export function createEmptyProjectionProgressCounters(): ProjectionProgressCounters {
  return { completedFullCount: 0, completedMiniCount: 0, completedLinkCount: 0, completedActionOnlyCount: 0, countedSessionIds: [] };
}

/**
 * Applies one session's evaluated completion to a progress-counter
 * record, idempotently: a session id already present in
 * countedSessionIds is a no-op (never double-counted), and a session
 * that didn't qualify for progression credit (`countsForProgression`
 * false) is also a no-op -- only a valid, projection-aware completion
 * may increment a counter (decision 4's own closing requirement).
 */
export function applyProjectionCompletionToProgress(
  progress: ProjectionProgressCounters,
  sessionId: string,
  projection: ArcProjectionKind,
  result: ProjectionCompletionResult
): ProjectionProgressCounters {
  if (!result.countsForProgression) return progress;
  if (progress.countedSessionIds.includes(sessionId)) return progress;

  const next: ProjectionProgressCounters = { ...progress, countedSessionIds: [...progress.countedSessionIds, sessionId] };
  switch (projection) {
    case "full":
      return { ...next, completedFullCount: next.completedFullCount + 1 };
    case "mini":
      return { ...next, completedMiniCount: next.completedMiniCount + 1 };
    case "link":
      return { ...next, completedLinkCount: next.completedLinkCount + 1 };
    case "action_only":
      return { ...next, completedActionOnlyCount: next.completedActionOnlyCount + 1 };
  }
}

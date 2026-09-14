/**
 * arc/libraryProjectionContent.ts
 *
 * Adaptive ARC architecture task, Phase 5: connects the Phase 4
 * library-backed composer (arc/arcStateComposer.ts's
 * resolveArcStateEncodingContentFromLibrary, imported and reused
 * verbatim -- never duplicated) to arc/projectionCompletion.ts (Phase 2,
 * also imported and reused verbatim -- never modified), so each of the
 * four projections (Full/Mini/Link/Action-only) can resolve its own
 * content from a StateProfile, an optionally-selected InterferenceItem,
 * and an optionally-resolved IdentityProfile.
 *
 * Product correction (superseding an earlier draft of this phase): ARC
 * Link and Action-only are NOT permanently Identity-inapplicable. Both
 * follow the exact same track-based Identity policy as Full/Mini:
 *   - personal_development (Self Development): Identity is OPTIONAL --
 *     included only when the session explicitly selected it
 *     (`identitySelected`, an explicit pure input -- never guessed from
 *     whether an Identity happens to resolve or from non-empty text).
 *   - goal_achievement (ARC Goal): Identity is MANDATORY, regardless of
 *     `identitySelected`.
 * `identityApplicable` (present on every projection's own content shape)
 * is this POLICY decision alone -- a separate concern from whether the
 * Identity content actually resolved (see resolveIdentityApplicability's
 * own doc) and separate again from whether a physical Identity ACTION
 * was actually performed live (arc/projectionCompletion.ts's own
 * ActionCompletionSignal/IdentityCompletionSignal -- a session-observed
 * fact this pure module never invents).
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet. No storage I/O, no navigation, deterministic, and every
 * StateProfile/IdentityProfile/InterferenceItem input is read-only.
 */

import type { StateProfile } from "./stateProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import type { InterferenceItem, MiniOverrideConfig } from "./interferenceItem.ts";
import type { IdentityExtensionTrack } from "./types.ts";
import { isCompleteForGoalTrack, type LibraryValidationResult } from "./libraryRelationships.ts";
import { resolveArcStateEncodingContentFromLibrary } from "./arcStateComposer.ts";
import type { ArcStateLibraryEncodingContent } from "./arcStateComposer.ts";
import type { ArcProjectionKind, ProjectionCompletionInput } from "./projectionCompletion.ts";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Trims and treats a blank/whitespace-only string identically to
 * absent, returning the first genuinely non-blank value -- mirrors
 * arc/arcStateComposer.ts's own (unexported) resolveWithMiniFallback
 * pattern exactly, re-declared here only because that helper isn't
 * exported; the PRECEDENCE it implements for regulationCue/encodingCue/
 * action is never re-derived here (those three always come straight
 * from resolveArcStateEncodingContentFromLibrary's own output below,
 * already Mini-aware) -- this helper is only used for the fields Phase
 * 4 doesn't compute at all (recognitionCue override, preventiveStoppingAction
 * override, Mini's own identityCue/identityAction overrides).
 */
function firstNonBlankString(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

/** The item's own preventiveStoppingAction, when its category is "urge" (the only category with this field) -- null for every other category, and null for a blank/unset value. Mirrors arc/arcStateComposer.ts's isPreventiveStoppingRelevantForInterferenceItem's own source field, but returns the STRING value rather than a boolean relevance check (a genuinely new need, not a duplicate of that function). */
function resolveItemPreventiveStoppingAction(item: InterferenceItem | null): string | null {
  if (!item || item.category !== "urge") return null;
  return firstNonBlankString(item.preventiveStoppingAction);
}

/**
 * Mini override's own stateActionDurationOverrideMinutes, falling back
 * to the base StateProfile's own actionTimerConfig.durationMinutes, else
 * null. No InterferenceItem category has a duration field of its own
 * (mirroring arc/arcStateComposer.ts's own documented "no category has
 * an action field" gap for the analogous action/encodingCue fields) --
 * so there is no middle "item-specific" step for duration, only
 * Mini -> StateProfile -> null.
 */
function resolveStateActionDurationMinutes(mini: MiniOverrideConfig | null, state: StateProfile): number | null {
  if (mini?.stateActionDurationOverrideMinutes != null) return mini.stateActionDurationOverrideMinutes;
  return state.actionTimerConfig?.durationMinutes ?? null;
}

/** The resolved Identity's own action-timer duration -- gated by the exact same id-match safety Phase 4's identityEncodingCue/identityAction already use (never reads a stale/mismatched candidate's duration). */
function resolveIdentityActionDurationMinutes(identity: IdentityProfile | null, resolvedIdentityId: string | null): number | null {
  if (identity === null || identity.id !== resolvedIdentityId) return null;
  return identity.actionTimerConfig?.durationMinutes ?? null;
}

/**
 * The single Identity-applicability policy every projection resolver
 * and buildProjectionCompletionInput below shares -- "Content
 * applicability... is a separate concept" from whether Identity content
 * actually resolved (see each projection's own identityCue/identityAction
 * gating) and from whether a physical Identity action was actually
 * performed (arc/projectionCompletion.ts's own concern).
 *
 * - goal_achievement: always true (Identity is mandatory by policy,
 *   regardless of `identitySelected` -- ARC Goal has no "skip Identity"
 *   choice at all).
 * - personal_development: exactly `identitySelected` -- an explicit,
 *   caller-supplied pure input (never inferred from whether an Identity
 *   happens to resolve, and never from non-empty Identity text -- see
 *   this module's own header doc).
 */
export function resolveIdentityApplicability(track: IdentityExtensionTrack, identitySelected: boolean): boolean {
  return track === "goal_achievement" ? true : identitySelected;
}

/**
 * Whether this track+State/Identity combination is a VALID configuration
 * -- a separate, later check from resolveIdentityApplicability's own
 * POLICY decision above. Reuses arc/libraryRelationships.ts's
 * isCompleteForGoalTrack directly; never reimplements its precedence.
 *
 * - personal_development: always valid, with or without a resolved
 *   Identity (Self Development never fails this check).
 * - goal_achievement: valid only when `resolvedIdentityId` actually
 *   resolves to something -- otherwise a typed invalid result (reason
 *   "goal_requires_identity"), never a crash and never a silently-
 *   accepted State-only Goal session.
 *
 * Deliberately the SAME rule for every projection kind (Full/Mini/Link/
 * Action-only) -- ARC Link is not a special case: "ARC Link must be
 * capable of including Identity... Goal Link: Requires a resolved
 * Identity... Missing Identity returns typed invalid."
 */
export function validateProjectionIdentityRequirement(track: IdentityExtensionTrack, state: StateProfile, resolvedIdentityId: string | null): LibraryValidationResult {
  if (track === "personal_development") {
    return { valid: true, source: "new", reason: null };
  }
  return isCompleteForGoalTrack(state.id, resolvedIdentityId) ? { valid: true, source: "new", reason: null } : { valid: false, source: "new", reason: "goal_requires_identity" };
}

// ---------------------------------------------------------------------------
// Full
// ---------------------------------------------------------------------------

export interface FullProjectionContent {
  /**
   * Phase 4's own resolved content, reused verbatim -- NOT re-gated by
   * identityApplicable below. `content.identityEncodingCue`/
   * `content.identityAction` may still be non-null even when
   * identityApplicable is false (Self Development, not selected this
   * session) -- callers MUST check identityApplicable before reading
   * either field, exactly like they must already check
   * `content.resolvedIdentityId` before trusting a candidate Identity's
   * fields (Phase 4's own existing mismatch-safety).
   */
  content: ArcStateLibraryEncodingContent;
  identityApplicable: boolean;
}

/**
 * The thinnest possible wrapper: delegates content resolution entirely
 * to Phase 4's resolveArcStateEncodingContentFromLibrary (unmodified),
 * and pairs it with the Identity-applicability policy decision
 * (resolveIdentityApplicability above) as a separate, explicit flag.
 */
export function resolveFullProjectionContent(
  state: StateProfile,
  item: InterferenceItem | null,
  identity: IdentityProfile | null,
  track: IdentityExtensionTrack,
  identitySelected: boolean
): FullProjectionContent {
  return {
    content: resolveArcStateEncodingContentFromLibrary(state, item, identity),
    identityApplicable: resolveIdentityApplicability(track, identitySelected),
  };
}

// ---------------------------------------------------------------------------
// Mini
// ---------------------------------------------------------------------------

export interface MiniProjectionContent {
  recognitionCue: string | null;
  preventiveStoppingAction: string | null;
  regulationCue: string | null;
  encodingCue: string | null;
  action: string | null;
  actionDurationMinutes: number | null;
  identityApplicable: boolean;
  identityCue: string | null;
  identityAction: string | null;
}

/**
 * The situation-specific short form. regulationCue/encodingCue/action
 * are read STRAIGHT from resolveArcStateEncodingContentFromLibrary's own
 * output -- that function already applies the full Mini -> item's own
 * category-specific field -> base StateProfile precedence for these
 * three fields (Phase 4), so re-applying it here would duplicate logic
 * this module must not duplicate. Only the fields Phase 4 has no concept
 * of at all (recognitionCue, preventiveStoppingAction,
 * actionDurationMinutes, and Mini's own identity overrides) get their
 * own precedence chain here.
 *
 * identityCue/identityAction are entirely null when identityApplicable
 * is false (Self Development, Identity not selected this session) --
 * unlike FullProjectionContent's own raw, ungated `content`, this shape
 * is Phase 5's own and is pre-gated for a simpler caller contract.
 */
export function resolveMiniProjectionContent(
  state: StateProfile,
  item: InterferenceItem | null,
  identity: IdentityProfile | null,
  track: IdentityExtensionTrack,
  identitySelected: boolean
): MiniProjectionContent {
  const base = resolveArcStateEncodingContentFromLibrary(state, item, identity);
  const mini = item?.miniOverride ?? null;
  const identityApplicable = resolveIdentityApplicability(track, identitySelected);

  return {
    recognitionCue: firstNonBlankString(mini?.shortRecognitionCue, base.recognitionContext),
    preventiveStoppingAction: firstNonBlankString(mini?.preventiveStoppingActionOverride, resolveItemPreventiveStoppingAction(item)),
    regulationCue: base.regulationCue,
    encodingCue: base.encodingCue,
    action: base.action,
    actionDurationMinutes: resolveStateActionDurationMinutes(mini, state),
    identityApplicable,
    identityCue: identityApplicable ? firstNonBlankString(mini?.identityCueOverride, base.identityEncodingCue) : null,
    identityAction: identityApplicable ? firstNonBlankString(mini?.identityActionOverride, base.identityAction) : null,
  };
}

// ---------------------------------------------------------------------------
// ARC Link
// ---------------------------------------------------------------------------

export interface LinkProjectionContent {
  recognitionCue: string | null;
  preventiveStoppingAction: string | null;
  regulationCue: string | null;
  encodingCue: string | null;
  stateAction: string | null;
  identityApplicable: boolean;
  identityCue: string | null;
  identityAction: string | null;
}

/**
 * ARC Link rehearses the composed sequence the trainee must remember --
 * it is NOT permanently Identity-inapplicable (a prior draft of this
 * phase was corrected on exactly this point). This resolver exposes the
 * derivative-specific and Identity-specific content a LATER phase's
 * arc/futureArcLink.ts cue-sequence builder will need:
 *   - Thought/Belief/Urge/Emotion recognition all flow through via
 *     recognitionCue (== Phase 4's own recognitionContext, which already
 *     builds this per-category, Emotion included, without ever adding a
 *     duplicate "emotion component" -- see arc/arcStateComposer.ts's own
 *     Emotion-clarification doc).
 *   - preventiveStoppingAction is populated only for an Urge item.
 *   - regulationCue/encodingCue/stateAction are Phase 4's own resolved
 *     values, already Mini-aware.
 *   - identityCue/identityAction are populated only when identityApplicable
 *     is true (Self Development with Identity selected, or ARC Goal
 *     always) -- see resolveIdentityApplicability's own doc.
 *
 * This function does NOT generate cue copy, trigger text, arrows, or any
 * screen content -- arc/futureArcLink.ts remains completely untouched
 * and unreferenced by this module.
 */
export function resolveLinkProjectionContent(
  state: StateProfile,
  item: InterferenceItem | null,
  identity: IdentityProfile | null,
  track: IdentityExtensionTrack,
  identitySelected: boolean
): LinkProjectionContent {
  const base = resolveArcStateEncodingContentFromLibrary(state, item, identity);
  const identityApplicable = resolveIdentityApplicability(track, identitySelected);

  return {
    recognitionCue: base.recognitionContext,
    preventiveStoppingAction: resolveItemPreventiveStoppingAction(item),
    regulationCue: base.regulationCue,
    encodingCue: base.encodingCue,
    stateAction: base.action,
    identityApplicable,
    identityCue: identityApplicable ? base.identityEncodingCue : null,
    identityAction: identityApplicable ? base.identityAction : null,
  };
}

// ---------------------------------------------------------------------------
// Action-only
// ---------------------------------------------------------------------------

export interface ActionOnlyProjectionContent {
  stateAction: string | null;
  stateActionDurationMinutes: number | null;
  identityApplicable: boolean;
  identityAction: string | null;
  identityActionDurationMinutes: number | null;
}

/**
 * Bypasses Recognition/Stay/Acceptance/Regulation/Encoding entirely --
 * resolves only the action(s) and their durations. Self Development
 * always includes the State action; the Identity action/duration are
 * included only when identityApplicable is true. ARC Goal always
 * includes both the State action and the (mandatory) Identity action/
 * duration -- a missing Goal Identity is never silently degraded to a
 * State-only path here; that is exactly what
 * validateProjectionIdentityRequirement is for (callers must check it
 * before treating a Goal Action-only session as valid -- this resolver
 * itself never throws, per "safe defaults / typed results" ).
 *
 * This data is deliberately for Stage 4 progression's LATER use
 * (State timer -> optional/mandatory Identity timer) -- no timer UI or
 * screen sequencing is implemented in this phase.
 */
export function resolveActionOnlyProjectionContent(
  state: StateProfile,
  item: InterferenceItem | null,
  identity: IdentityProfile | null,
  track: IdentityExtensionTrack,
  identitySelected: boolean
): ActionOnlyProjectionContent {
  const base = resolveArcStateEncodingContentFromLibrary(state, item, identity);
  const mini = item?.miniOverride ?? null;
  const identityApplicable = resolveIdentityApplicability(track, identitySelected);

  return {
    stateAction: base.action,
    stateActionDurationMinutes: resolveStateActionDurationMinutes(mini, state),
    identityApplicable,
    identityAction: identityApplicable ? base.identityAction : null,
    identityActionDurationMinutes: identityApplicable ? resolveIdentityActionDurationMinutes(identity, base.resolvedIdentityId) : null,
  };
}

// ---------------------------------------------------------------------------
// Completion bridge
// ---------------------------------------------------------------------------

/**
 * Session-OBSERVED facts a real LIVE screen would report -- never
 * invented or inferred by this pure module. Every field here is a plain
 * boolean the caller already knows from having actually run the
 * session; this module only ever arranges them into the shape
 * arc/projectionCompletion.ts's evaluateProjectionCompletion expects.
 */
export interface ProjectionCompletionObservations {
  stateActionReached: boolean;
  stateRealActionCompleted: boolean;
  identityActionReached: boolean;
  identityRealActionCompleted: boolean;
  linkReachedFinalStage: boolean;
  linkRequiredDwellsCompleted: boolean;
  linkCompletionAcknowledged: boolean;
}

/**
 * Builds a ProjectionCompletionInput (arc/projectionCompletion.ts, Phase
 * 2, unmodified) from library-aware context, ready to hand to that
 * module's own evaluateProjectionCompletion.
 *
 * IMPORTANT -- Stage 2 vs. Stage 3 (do not conflate):
 * The "link" branch below represents ONLY a pure Stage 2 Link
 * rehearsal's own completion -- reachedFinalStage/requiredDwellsCompleted/
 * completionAcknowledged are the imagined-rehearsal's own three signals
 * (arc/projectionCompletion.ts's own LinkCompletionSignal), and this
 * function never adds a real-world action requirement to them ("ARC
 * Link does not require a real-world action unless that specific Link
 * configuration explicitly contains one").
 *
 * Stage 3 is a DIFFERENT, compound session -- Link rehearsal + a real
 * State action + State timer/completion + an optional (Self Development)
 * or mandatory (ARC Goal) Identity action + Identity timer/completion.
 * That compound completion is explicitly OUT OF SCOPE for this phase and
 * this function: it will be implemented in a later progression phase,
 * and must never be represented here as if it were a pure Link-only
 * completion. Nothing in this module builds, evaluates, or infers a
 * Stage 3 result.
 *
 * For full/mini/action_only: `identity` in the built input is null
 * exactly when resolveIdentityApplicability(track, identitySelected) is
 * false (Self Development, not selected) -- never omitted or included
 * based on whether Identity CONTENT happened to resolve (a separate
 * concern, see resolveIdentityApplicability's own doc). For ARC Goal,
 * `identity.selected` is always true (Goal has no "skip Identity" choice
 * at all).
 */
export function buildProjectionCompletionInput(
  projectionKind: ArcProjectionKind,
  track: IdentityExtensionTrack,
  sessionId: string,
  identitySelected: boolean,
  observed: ProjectionCompletionObservations
): ProjectionCompletionInput {
  if (projectionKind === "link") {
    return {
      projection: "link",
      track,
      sessionId,
      link: {
        reachedFinalStage: observed.linkReachedFinalStage,
        requiredDwellsCompleted: observed.linkRequiredDwellsCompleted,
        completionAcknowledged: observed.linkCompletionAcknowledged,
      },
    };
  }

  const identityApplicable = resolveIdentityApplicability(track, identitySelected);
  return {
    projection: projectionKind,
    track,
    sessionId,
    state: { actionReached: observed.stateActionReached, realActionCompleted: observed.stateRealActionCompleted },
    identity: identityApplicable
      ? { selected: true, actionReached: observed.identityActionReached, realActionCompleted: observed.identityRealActionCompleted }
      : null,
  };
}

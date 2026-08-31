/**
 * live/liveEventAdapter.ts
 *
 * The LIVE UI adapter: a pure, React-free translation layer between raw
 * UI events (a button tap, a scale value, a chip pick) and the ARC
 * Engine. It does two mechanical things, nothing more:
 *
 *   1. Shape a raw UI answer into an ArcLiveState patch (applyXxx below).
 *   2. Hand the patched state to arc/arcEngine.ts's getNextArcStage --
 *      the only place that decides what stage comes next -- and fold
 *      the result back into session state (advanceLiveSession).
 *
 * No threshold, route, or loop-safety rule lives here; every one of
 * those stays in arc/arcEngine.ts and arc/engine.ts. This file exists
 * so LiveSessionScreen.tsx can stay a dumb shell (render current stage,
 * forward events here) and so this translation is unit-testable without
 * a React rendering harness -- see live/liveEventAdapter.test.ts.
 */

import {
  getAvailableProactiveTargets,
  getAvailableReactiveExperiences,
  getNextArcStage,
  needsProactiveTargetSelection,
  needsReactiveStateSelection,
} from "../arc/arcEngine.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, TriggerType } from "../arc/types.ts";

export function applyTriggerSelection(session: ArcLiveState, triggerType: TriggerType): ArcLiveState {
  return { ...session, triggerType };
}

/**
 * Unknown-trigger refinement: a small, fixed, deterministic set of
 * "I don't know the trigger" responses -- matched exactly (after
 * trimming surrounding whitespace and trailing punctuation), never by
 * fuzzy/semantic guessing (this codebase has no NLP/AI service to do
 * that honestly -- see arc/evidence.ts's own doc on the same
 * principle). Covers the spec's own three examples plus their
 * grammatically-gendered counterparts (Hebrew requires gender
 * agreement, and a trainee of either gender should be recognized
 * equally) -- nothing broader, so a genuine specific trigger that
 * merely starts with "לא" (e.g. "לא הצלחתי להירדם") is never
 * misclassified as unknown.
 */
const KNOWN_UNKNOWN_TRIGGER_RESPONSES = ["לא יודע", "לא יודעת", "לא בטוח", "לא בטוחה", "אין לי מושג"];

function normalizeTriggerResponseForMatching(text: string): string {
  return text.trim().replace(/[.!?׃]+$/g, "").trim();
}

/**
 * Whether a trigger_context answer is one of the recognized "I don't
 * know" responses (#2) -- exported so it's independently testable and
 * so live/screens.tsx/live/liveEventAdapter.test.ts never have to
 * duplicate this matching logic.
 */
export function isUnknownTriggerResponse(text: string): boolean {
  return KNOWN_UNKNOWN_TRIGGER_RESPONSES.includes(normalizeTriggerResponseForMatching(text));
}

/**
 * The trigger_context stage's own free-text answer -- session-specific
 * only (ArcLiveState.triggerContext), never touching
 * ArcBuildProfile.challengeContext/identityChallengeContext (the
 * reusable, BUILD-configured context -- see arc/types.ts's
 * ArcLiveState.triggerContext doc). The trainee's raw text is always
 * preserved verbatim (trimmed), whatever it says -- "לא יודע" is never
 * discarded or rewritten. Unknown-trigger refinement: also resolves
 * the STRUCTURED ArcLiveState.triggerKnown signal a recognized "I
 * don't know" response (or a blank answer -- there's equally no known
 * trigger to imagine) resolves to false; any other non-empty answer
 * resolves to true. arc/stageCopy.ts's "observer_pause" case reads
 * ONLY this structured flag to choose its imagery, never triggerContext's
 * raw text, so "לא יודע" itself is never treated as if it were a
 * literal semantic trigger to imagine.
 */
export function applyTriggerContext(session: ArcLiveState, text: string): ArcLiveState {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ...session, triggerContext: null, triggerKnown: false };
  }
  if (isUnknownTriggerResponse(trimmed)) {
    return { ...session, triggerContext: trimmed, triggerKnown: false };
  }
  return { ...session, triggerContext: trimmed, triggerKnown: true };
}

/** presence_check and arc_thought_presence_recheck both feed presenceRating; desired_state_check feeds desiredStateRating. Same "scale0to10" input kind, different field -- this is the one piece of stage-specific routing an adapter necessarily does. */
export function applyScaleAnswer(stage: ArcStage, session: ArcLiveState, value: number): ArcLiveState {
  switch (stage) {
    case "presence_check":
    case "arc_thought_presence_recheck":
      return { ...session, presenceRating: value };
    case "desired_state_check":
      return { ...session, desiredStateRating: value };
    default:
      return session;
  }
}

export function applySensationAnswer(session: ArcLiveState, location: string | null, intensity: number): ArcLiveState {
  return { ...session, sensationLocation: location, sensationIntensity: intensity };
}

/**
 * Explicit, safe sentinel for "the trainee doesn't know where in the
 * body the sensation is" -- reuses the existing sensationLocation
 * field (string | null) rather than adding a new one, so ArcLiveState's
 * shape is untouched. Never confused with sensationLocation being null
 * (not yet answered): this is only ever written once the trainee has
 * explicitly chosen "לא ברור לי איפה".
 */
export const SENSATION_LOCATION_UNCLEAR = "לא ברור לי איפה";

/**
 * Body Sensation Check requires ONE explicit location response --
 * a preset chip, free text, or the explicit "I don't know where"
 * option -- before continuing, so the trainee is never forced to
 * invent a location, but also never silently skips past the question.
 * Pure so it can gate the UI (live/screens.tsx's SensationRatingScreen)
 * without a rendering harness to test it.
 */
export function hasSensationLocationResponse(preset: string, custom: string, unclear: boolean): boolean {
  return preset.trim().length > 0 || custom.trim().length > 0 || unclear;
}

/**
 * Resolves the trainee's three possible ways of answering into the one
 * sensationLocation value ArcLiveState already has. Free text wins over
 * a preset chip if somehow both are set (shouldn't happen -- the UI
 * clears one when the other is picked); "unclear" is stored explicitly
 * via SENSATION_LOCATION_UNCLEAR rather than guessed at or left
 * ambiguous with "not yet answered" (null).
 */
export function resolveSensationLocation(preset: string, custom: string, unclear: boolean): string | null {
  if (unclear) return SENSATION_LOCATION_UNCLEAR;
  const trimmedCustom = custom.trim();
  if (trimmedCustom.length > 0) return trimmedCustom;
  if (preset.length > 0) return preset;
  return null;
}

export function applyYesNoAnswer(stage: ArcStage, session: ArcLiveState, yes: boolean): ArcLiveState {
  switch (stage) {
    case "preventive_action_check":
      return { ...session, wantsPreventiveAction: yes };
    case "reactive_transition_check":
      return { ...session, regulationReady: yes };
    default:
      return session;
  }
}

/**
 * The Accept screen's "are you willing to accept this sensation as it
 * is?" question -- asked both as the stage's very first question and,
 * if answered "לא", again after each acceptance-of-unwillingness dwell
 * round (live/screens.tsx's AcceptScreen) -- shares this one handler
 * either way, rather than "accept" going through the generic
 * applyYesNoAnswer above (that only ever covers stages where every
 * answer routes through the SAME simple field write; Accept's "לא" also
 * needs to advance its own dedicated loop counter, see below).
 *
 * "כן" resolves the question (acceptanceNeeded false), letting the
 * screen proceed into the existing normal Acceptance dwell-then-rating
 * flow. "לא" records that another round of the unwillingness sub-flow
 * is starting, via its own dedicated counter
 * (acceptanceWillingnessLoopCount) -- deliberately separate from
 * loopIterationCount, which governs the UNRELATED accept ->
 * sensation_check intensity-recheck loop and must not be perturbed by
 * how many times the trainee said "not yet" here. Never itself advances
 * the ArcStage (still "accept" either way) -- only the eventual rating
 * selection or no-rating Continue does, exactly as answering "כן" alone
 * already worked before this addition.
 */
export function applyAcceptanceWillingnessAnswer(session: ArcLiveState, yes: boolean): ArcLiveState {
  if (yes) return { ...session, acceptanceNeeded: false };
  return { ...session, acceptanceNeeded: true, acceptanceWillingnessLoopCount: session.acceptanceWillingnessLoopCount + 1 };
}

export function applyTargetSelection(session: ArcLiveState, target: DevelopmentLayer): ArcLiveState {
  return { ...session, selectedTarget: target };
}

export function applyRegulationToolUsed(session: ArcLiveState, tool: string | null): ArcLiveState {
  if (!tool) return session;
  return { ...session, activeTools: [...session.activeTools, tool] };
}

export function applyActionCompletion(session: ArcLiveState, completed: boolean): ArcLiveState {
  return { ...session, realActionCompleted: completed };
}

/**
 * The Action-choice screen's "כן" branch: the trainee confirms they'll
 * perform the planned/mapped action as-is. Never touches selectedAction
 * -- leaving it null means resolveEncodingTarget resolves the real
 * planned action, not an override -- see arc/arcEngine.ts's
 * needsCurrentActionResolution.
 */
export function applyPlannedActionConfirmed(session: ArcLiveState): ArcLiveState {
  return { ...session, plannedActionConfirmed: true };
}

/**
 * The Action-choice screen's "לא" branch requires both a non-empty
 * alternative action AND a selected duration before the trainee can
 * continue -- never silently falls back to the planned action. Pure so
 * it can gate the UI (live/screens.tsx's ActionChoiceScreen) without a
 * rendering harness to test it.
 */
export function hasValidAlternativeAction(text: string, durationMinutes: number | null): boolean {
  return text.trim().length > 0 && durationMinutes !== null;
}

/**
 * Records a session-specific alternative action (and its own duration)
 * once validated -- only ever affects this LIVE session's ArcLiveState,
 * never the persisted BUILD action (ArcBuildProfile.internalAction/
 * identityAction/beneficialAction, untouched). See arc/arcEngine.ts's
 * resolveEncodingTarget (currentAction) and resolveActionDuration.
 */
export function applyAlternativeAction(session: ArcLiveState, text: string, durationMinutes: number | null): ArcLiveState {
  return { ...session, selectedAction: text.trim(), selectedActionDuration: durationMinutes };
}

/**
 * The Action Imagery screen's own Continue: only marks Imagery done,
 * mirroring applyPlannedActionConfirmed -- never advances the ArcStage
 * itself (still "act"; see arc/arcEngine.ts's resolveActPhase, which
 * moves straight on to "performing" once this is true -- the standalone
 * Action Preparation sub-phase that used to sit in between is removed).
 */
export function applyActionImageryCompleted(session: ArcLiveState): ArcLiveState {
  return { ...session, actionImageryCompleted: true };
}

/**
 * The Beneficial Action Timer's own live, in-session duration choice
 * (5-10 minutes, live/screens.tsx's BeneficialActionDurationChoiceScreen)
 * -- never advances the ArcStage itself (still "act"; see
 * arc/arcEngine.ts's resolveActionDuration, which now prefers this
 * value over ArcBuildProfile.actionDuration on the planned-action path).
 */
export function applyBeneficialActionDurationSelected(session: ArcLiveState, minutes: number): ArcLiveState {
  return { ...session, beneficialActionDurationMinutes: minutes };
}

/**
 * The Success Focus stage's own now/later choice
 * (live/screens.tsx's SuccessFocusChoiceScreen) -- never advances the
 * ArcStage itself (still "success_focus"); only decides which of that
 * stage's sub-views renders next (the existing timer/chip-picker flow,
 * or the deferral picker).
 */
export function applySuccessFocusChoice(session: ArcLiveState, choice: "now" | "later"): ArcLiveState {
  return { ...session, successFocusChoice: choice };
}

/**
 * The negative_action stage's explicit "begin" button: only marks the
 * Negative Action Timer as started -- never advances the ArcStage
 * itself (that stays "negative_action" until the trainee confirms
 * after the timer actually completes, mirroring applyActionCompletion).
 */
export function applyNegativeActionStarted(session: ArcLiveState): ArcLiveState {
  return { ...session, negativeActionStarted: true };
}

/**
 * When a proactive session lands on desired_state_check with no target
 * chosen yet and exactly one target is available, pick it automatically
 * instead of prompting for a choice with only one option. More than one
 * available target is left null -- the renderer shows a picker for that
 * case (see needsProactiveTargetSelection).
 */
function autoSelectSingleProactiveTarget(
  session: ArcLiveState,
  stage: ArcStage,
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile
): ArcLiveState {
  if (stage !== "desired_state_check" || session.selectedTarget !== null) return session;
  const targets = getAvailableProactiveTargets(activeLayers, profile);
  if (targets.length === 1) {
    return { ...session, selectedTarget: targets[0].layer };
  }
  return session;
}

/**
 * When a reactive_emotion session is sitting at trigger_selection with no
 * target chosen yet and exactly one reactive experience is mapped, resolve
 * it automatically instead of showing a one-option chooser. More than one
 * available experience is left null -- the renderer shows the chooser for
 * that case (see needsReactiveStateSelection). Must run BEFORE
 * getNextArcStage, unlike autoSelectSingleProactiveTarget: trigger_selection
 * itself decides where to route next based on selectedTarget, so the target
 * has to already be resolved by the time the engine looks at it.
 */
function autoSelectSingleReactiveExperience(
  session: ArcLiveState,
  currentStage: ArcStage,
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile
): ArcLiveState {
  if (currentStage !== "trigger_selection" || session.triggerType !== "reactive_emotion" || session.selectedTarget !== null) {
    return session;
  }
  const experiences = getAvailableReactiveExperiences(activeLayers, profile);
  if (experiences.length === 1) {
    return { ...session, selectedTarget: experiences[0].layer };
  }
  return session;
}

export interface AdvanceResult {
  session: ArcLiveState;
  stage: ArcStage;
}

/**
 * The single integration point: apply the engine's decision for what
 * comes after `currentStage` to `session`, fold in the actionReached
 * flag and any auto-selected proactive/reactive target, and return the
 * result. Call this after an applyXxx function above has already shaped
 * the raw answer into `session`.
 */
export function advanceLiveSession(
  currentStage: ArcStage,
  session: ArcLiveState,
  profile: ArcBuildProfile,
  activeLayers: DevelopmentLayer[]
): AdvanceResult {
  const resolvedSession = autoSelectSingleReactiveExperience(session, currentStage, activeLayers, profile);
  const outcome = getNextArcStage(currentStage, resolvedSession, profile, activeLayers);
  let nextSession: ArcLiveState = {
    ...resolvedSession,
    currentArcStage: outcome.stage,
    loopIterationCount: outcome.loopIterationCount,
    actionReached: resolvedSession.actionReached || outcome.stage === "act",
  };
  nextSession = autoSelectSingleProactiveTarget(nextSession, outcome.stage, activeLayers, profile);
  return { session: nextSession, stage: outcome.stage };
}

export { needsProactiveTargetSelection, getAvailableProactiveTargets, needsReactiveStateSelection, getAvailableReactiveExperiences };

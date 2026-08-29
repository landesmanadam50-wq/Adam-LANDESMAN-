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
    case "accept":
      return { ...session, acceptanceNeeded: !yes };
    case "preventive_action_check":
      return { ...session, wantsPreventiveAction: yes };
    case "reactive_transition_check":
      return { ...session, regulationReady: yes };
    default:
      return session;
  }
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
 * moves on to "preparation" once this is true).
 */
export function applyActionImageryCompleted(session: ArcLiveState): ArcLiveState {
  return { ...session, actionImageryCompleted: true };
}

/**
 * The Action Preparation screen's own Continue ("עכשיו בצע את הפעולה"):
 * only marks Preparation done. Once true, resolveActPhase moves "act"
 * to "performing" -- the actual timed Action -- and only then does the
 * Action Timer (arc/actionTimer.ts) begin.
 */
export function applyActionPreparationCompleted(session: ArcLiveState): ArcLiveState {
  return { ...session, actionPreparationCompleted: true };
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

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

import { getAvailableProactiveTargets, getNextArcStage, needsProactiveTargetSelection } from "../arc/arcEngine.ts";
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

export interface AdvanceResult {
  session: ArcLiveState;
  stage: ArcStage;
}

/**
 * The single integration point: apply the engine's decision for what
 * comes after `currentStage` to `session`, fold in the actionReached
 * flag and any auto-selected proactive target, and return the result.
 * Call this after an applyXxx function above has already shaped the raw
 * answer into `session`.
 */
export function advanceLiveSession(
  currentStage: ArcStage,
  session: ArcLiveState,
  profile: ArcBuildProfile,
  activeLayers: DevelopmentLayer[]
): AdvanceResult {
  const outcome = getNextArcStage(currentStage, session, profile);
  let nextSession: ArcLiveState = {
    ...session,
    currentArcStage: outcome.stage,
    loopIterationCount: outcome.loopIterationCount,
    actionReached: session.actionReached || outcome.stage === "act",
  };
  nextSession = autoSelectSingleProactiveTarget(nextSession, outcome.stage, activeLayers, profile);
  return { session: nextSession, stage: outcome.stage };
}

export { needsProactiveTargetSelection, getAvailableProactiveTargets };

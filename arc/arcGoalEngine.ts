/**
 * arc/arcGoalEngine.ts
 *
 * ARC Goal Live orchestration (spec sections 6-7) -- a thin layer ON TOP
 * of the existing, completely unmodified arc/arcEngine.ts, never a fork
 * or a second copy of it. An ARC Goal Live session runs TWO independent
 * instances of the SAME existing single-hop-per-call engine
 * (getNextArcStage/getFirstArcStage, via live/liveEventAdapter.ts's
 * advanceLiveSession), reused exactly as regular ARC already uses them:
 *
 *   - the OUTER run: a normal `triggerType: "proactive"` session against
 *     the goal's own referenced IDENTITY ArcBuildProfile
 *     (activeLayers: ["identity"]) -- Presence, ARC Thought,
 *     desired_state_check, the regulate loop, encode, act (where spec
 *     sections 4/5's extended Action Imagery already appears for free,
 *     via live/screens.tsx's ActionImageryScreen -- no ARC-Goal-specific
 *     code needed there), success_focus, complete.
 *   - the INNER run: a transient `triggerType: "reactive_emotion"`
 *     session against the SELECTED mapping's supportive-state
 *     ArcBuildProfile (activeLayers: ["state"], selectedTarget: "state"
 *     pre-set), started directly at "sensation_check" (never
 *     trigger_selection/presence_check -- Presence was already
 *     established once, at the outer level; see spec section 7 step 4,
 *     "begin with the existing sensation/intensity rating"), reusing
 *     Accept/Regulate/Encode exactly like regular reactive ARC.
 *
 * Neither run is ever modified: this file only decides WHEN to swap
 * between them, via new orchestration-local "meta stages" that are NOT
 * part of arc/types.ts's ArcStage union at all (they only ever apply
 * inside an ArcGoal session, never a regular one) -- ArcGoalUiStage. The
 * one insertion point into the outer run's own sequence is the exact
 * moment it would transition into "desired_state_check" (the real start
 * of the identity-target protocol, right after the shared
 * Presence/ARC-Thought phase, which is never target-specific) -- see
 * needsGoalInterferenceDetour/getNextGoalUiStage below.
 *
 * live/ArcGoalSessionScreen.tsx is the one caller: it owns the actual
 * React state (outer/inner ArcLiveState + ArcStage, plus this file's
 * own ArcGoalLiveState), calling the existing advanceLiveSession for
 * every normal ArcStage hop on whichever run is currently active, and
 * this file's getNextGoalUiStage only for the two new meta-stages that
 * need it (goal_interference_check/goal_interfering_state_select).
 * "inner"/"supportive_action_confirm"/"goal_action_confirm" transitions
 * are driven directly by the real engine's own return value (the moment
 * the inner run would reach "act") or by the trainee's own explicit
 * confirm tap -- see resolveAfterSupportiveActionConfirmed.
 */

import type { ArcGoal, ArcGoalInterferingMapping, ArcLiveState, ArcStage } from "./types.ts";
import { createEmptyLiveState } from "./types.ts";

export type ArcGoalUiStage =
  | "outer"
  | "goal_interference_check"
  | "goal_interfering_state_select"
  | "inner"
  | "supportive_action_confirm"
  | "goal_action_confirm";

export interface ArcGoalLiveState {
  uiStage: ArcGoalUiStage;
  /**
   * Once true, the outer run is never interrupted by the interference
   * detour again this session -- set either immediately (the trainee
   * answered "לא", or this goal has no interfering-state mappings to
   * offer at all) or once the supportive-action confirm is acknowledged
   * (the "כן" branch, see resolveAfterSupportiveActionConfirmed).
   */
  interferenceResolved: boolean;
  hasGoalInterference: boolean | null;
  selectedMappingId: string | null;
}

export function createEmptyArcGoalLiveState(): ArcGoalLiveState {
  return {
    uiStage: "outer",
    interferenceResolved: false,
    hasGoalInterference: null,
    selectedMappingId: null,
  };
}

/**
 * The outer run's own starting ArcLiveState -- triggerType pre-set to
 * "proactive" (ARC Goal is inherently goal-directed; the trainee is
 * never asked to pick a trigger the way a regular ARC session is). The
 * caller's very first advanceLiveSession("trigger_selection", ...) call
 * against this resolves straight through to "presence_check", the same
 * unconditional single hop a regular proactive session already makes
 * once its own triggerType is known -- no trigger_selection screen is
 * ever actually rendered for an ArcGoal session.
 */
export function createArcGoalOuterInitialSession(): ArcLiveState {
  return { ...createEmptyLiveState(), triggerType: "proactive" };
}

/**
 * The inner run's own starting ArcLiveState -- selectedTarget pre-set
 * to "state" (a mapping's supportive protocol is always a state-target
 * ArcBuild). The caller starts the inner run directly at
 * "sensation_check" (never trigger_selection/presence_check) by simply
 * never rendering those stages for this session -- see this file's own
 * module doc.
 */
export function createArcGoalInnerInitialSession(): ArcLiveState {
  return { ...createEmptyLiveState(), triggerType: "reactive_emotion", selectedTarget: "state" };
}

/**
 * Whether the outer run's transition into "desired_state_check" should
 * be intercepted by the goal_interference_check detour -- only once per
 * session (interferenceResolved), and only when this goal actually has
 * something to check for. A goal with an empty interferingMappings list
 * has nothing to offer, so the detour never triggers at all -- the
 * outer run simply continues straight into "desired_state_check",
 * exactly as if the trainee had answered "לא".
 */
export function needsGoalInterferenceDetour(goal: ArcGoal, goalState: ArcGoalLiveState): boolean {
  return !goalState.interferenceResolved && goal.interferingMappings.length > 0;
}

/** Whether the inner run's own transition should be intercepted -- the moment it would reach "act" (its own encode phase is already complete), substituting the supportive-action confirm in place of its normal act/success_focus/complete. */
export function shouldInterceptInnerAtAct(innerNextStage: ArcStage): boolean {
  return innerNextStage === "act";
}

/** The mapping currently selected for this session, or null. */
export function resolveSelectedMapping(goal: ArcGoal, goalState: ArcGoalLiveState): ArcGoalInterferingMapping | null {
  if (goalState.selectedMappingId === null) return null;
  return goal.interferingMappings.find((mapping) => mapping.id === goalState.selectedMappingId) ?? null;
}

/**
 * The single-hop transition for the two new orchestration-local stages
 * -- mirrors arc/arcEngine.ts's own getNextArcStage shape exactly (stays
 * put on unanswered input, transitions once answered):
 *
 *   goal_interference_check:
 *     unanswered              -> stays put
 *     "לא"                    -> "outer" (interferenceResolved: true) --
 *                                the outer run resumes at
 *                                "desired_state_check" immediately,
 *                                skipping the supportive-state protocol
 *                                and its supportive action entirely.
 *     "כן", exactly 1 mapping -> "inner", that ONE mapping auto-selected
 *                                (mirrors arc/arcEngine.ts's
 *                                needsReactiveStateSelection precedent:
 *                                no picker shown for a single option).
 *     "כן", 2+ mappings       -> "goal_interfering_state_select"
 *
 *   goal_interfering_state_select:
 *     unanswered  -> stays put
 *     answered    -> "inner"
 *
 * Every other ArcGoalUiStage value passed in is returned unchanged --
 * this function is never the source of truth for
 * "inner"/"supportive_action_confirm"/"goal_action_confirm"/"outer"'s
 * OWN transitions.
 */
export function getNextGoalUiStage(
  uiStage: ArcGoalUiStage,
  goal: ArcGoal,
  goalState: ArcGoalLiveState
): { uiStage: ArcGoalUiStage; goalState: ArcGoalLiveState } {
  switch (uiStage) {
    case "goal_interference_check": {
      if (goalState.hasGoalInterference === null) return { uiStage, goalState };
      if (goalState.hasGoalInterference === false) {
        return { uiStage: "outer", goalState: { ...goalState, interferenceResolved: true } };
      }
      if (goal.interferingMappings.length === 1) {
        return { uiStage: "inner", goalState: { ...goalState, selectedMappingId: goal.interferingMappings[0].id } };
      }
      return { uiStage: "goal_interfering_state_select", goalState };
    }
    case "goal_interfering_state_select":
      if (goalState.selectedMappingId === null) return { uiStage, goalState };
      return { uiStage: "inner", goalState };
    default:
      return { uiStage, goalState };
  }
}

/**
 * Called once the trainee acknowledges the supportive-action confirm --
 * marks the interference detour resolved (never interrupts the outer
 * run again this session) so the caller can discard the inner run and
 * resume the outer run, already paused at "desired_state_check", with
 * no re-ask of the identity protocol and no return to the home screen.
 */
export function resolveAfterSupportiveActionConfirmed(goalState: ArcGoalLiveState): ArcGoalLiveState {
  return { ...goalState, interferenceResolved: true };
}

export const GOAL_INTERFERENCE_CHECK_QUESTION = "האם יש כרגע מצב פנימי שמפריע לך לעבור לפעולה?";
export const GOAL_INTERFERENCE_CHECK_LABELS = { yes: "כן", no: "לא" };
export const GOAL_INTERFERING_STATE_SELECT_TITLE = "איזה מצב פנימי נמצא איתך כרגע?";

/** The supportive-action confirm's own copy -- the mapping's own bridge/trigger action (spec section 3), never that protocol's own internalAction. */
export function getSupportiveActionConfirmCopy(mapping: ArcGoalInterferingMapping): { title: string; body: string } {
  return { title: "פעולה תומכת", body: mapping.supportiveAction };
}

/** The final goal-action confirm's own copy -- the goal's OWN action/result (spec section 2's hierarchy: Identity protocol -> Goal-related action -> Desired result), distinct from the identity protocol's own identityAction. */
export function getGoalActionConfirmCopy(goal: ArcGoal): { title: string; body: string } {
  const resultLine = goal.desiredResult.trim() ? ` התוצאה הרצויה: ${goal.desiredResult.trim()}.` : "";
  return { title: "פעולת המטרה", body: `${goal.goalAction.trim()}${resultLine}` };
}

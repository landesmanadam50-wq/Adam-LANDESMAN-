/**
 * arc/arcGoalEngine.ts
 *
 * ARC Goal Live orchestration (spec sections 6-7, extended by the Urge
 * route / Supportive Desired-State route / Mini ARC integration task) --
 * a thin layer ON TOP of the existing, completely unmodified
 * arc/arcEngine.ts, never a fork or a second copy of it. An ARC Goal
 * Live session runs TWO independent instances of the SAME existing
 * single-hop-per-call engine (getNextArcStage/getFirstArcStage, via
 * live/liveEventAdapter.ts's advanceLiveSession), reused exactly as
 * regular ARC already uses them:
 *
 *   - the OUTER run: a normal `triggerType: "proactive"` session against
 *     the goal's own referenced IDENTITY ArcBuildProfile
 *     (activeLayers: ["identity"]) -- Presence, ARC Thought,
 *     desired_state_check, the regulate loop, encode, act (where
 *     Action Imagery already appears for free, via
 *     live/screens.tsx's ActionImageryScreen -- no ARC-Goal-specific
 *     code needed there), success_focus, complete.
 *   - the INNER run: a transient session against the SELECTED mapping's
 *     protocol -- either a real supportive-state ArcBuildProfile
 *     (triggerType "reactive_emotion", activeLayers: ["state"]) or an
 *     adapted habit-shaped ArcBuildProfile built from a UrgeArc by
 *     urgeArcToProfile below (triggerType "reactive_urge",
 *     activeLayers: ["habit"]) -- started directly at "sensation_check"
 *     (never trigger_selection/presence_check/need_identification --
 *     Presence was already established once at the outer level, and
 *     Need Identification for an urge already happened, once, via this
 *     file's own urge_need_identification meta-stage, ahead of ARC
 *     Thought), reusing Accept/Regulate/Encode exactly like regular
 *     reactive ARC.
 *
 * Neither run is ever modified: this file only decides WHEN to swap
 * between them, via new orchestration-local "meta stages" that are NOT
 * part of arc/types.ts's ArcStage union at all (they only ever apply
 * inside an ArcGoal session, never a regular one) -- ArcGoalUiStage.
 *
 * TWO interception points into the outer run's own sequence (see
 * live/ArcGoalSessionScreen.tsx's commitAdvanceOuter):
 *
 *   1. The moment presence_check resolves into "arc_thought_awareness"
 *      or "arc_thought_expand_presence" (proactive's own two possible
 *      entries into ARC Thought) -- if the trigger-identification
 *      prefix (spec sections 2-5: trigger id, third-person imagery +
 *      imagined Stop, and -- only when this goal has any urgeMappings
 *      -- Urge Need Identification) hasn't run yet this session, divert
 *      to "trigger_identification" instead. The outer session/stage ARE
 *      still committed to arc_thought_awareness/arc_thought_expand_presence
 *      right away (see needsTriggerPrefixDetour) -- only the RENDERING
 *      is diverted (goalState.uiStage) -- so once the prefix resolves
 *      and goalState.uiStage flips back to "outer", ARC Thought renders
 *      immediately, completely unmodified, exactly where the outer run
 *      already was.
 *   2. The moment the outer run would transition into
 *      "desired_state_check" (right after ARC Thought) -- divert to
 *      "reassessment" (spec section 7's 3-way question) instead of the
 *      old binary goal_interference_check, unless this goal has neither
 *      urgeMappings nor interferingMappings configured (nothing to
 *      offer -- see needsReassessmentDetour, mirroring the old
 *      needsGoalInterferenceDetour's own "nothing configured -> skip"
 *      rule).
 *
 * live/ArcGoalSessionScreen.tsx is the one caller: it owns the actual
 * React state (outer/inner ArcLiveState + ArcStage, plus this file's
 * own ArcGoalLiveState), calling the existing advanceLiveSession for
 * every normal ArcStage hop on whichever run is currently active, and
 * this file's pure helpers for every new meta-stage transition.
 */

import type {
  ArcBuildProfile,
  ArcGoal,
  ArcGoalInterferingMapping,
  ArcGoalUrgeMapping,
  ArcLiveState,
  ArcStage,
  ExecutionMode,
  UrgeArc,
} from "./types.ts";
import { createEmptyArcBuildProfile, createEmptyLiveState, IDENTIFIED_NEED_UNKNOWN } from "./types.ts";
import type { ArcStageCopy } from "./stageCopy.ts";
import type { InstructionSegment } from "./instructionTiming.ts";
import { INSTRUCTION_TIMING } from "./instructionTiming.ts";
import { resolveDwellSecondsFor, withTrailingDwellSegment } from "./dwellTimes.ts";

export type ArcGoalUiStage =
  | "outer"
  | "trigger_identification"
  | "third_person_imagery"
  | "urge_need_identification"
  | "reassessment"
  | "urge_select"
  | "supportive_state_select"
  | "execution_mode_choice"
  | "inner"
  | "mini_arc_embedded"
  | "urge_action_confirm"
  | "supportive_action_confirm"
  | "goal_action_confirm";

export type ReassessmentChoice = "urge" | "supportive" | "direct";

export interface ArcGoalLiveState {
  uiStage: ArcGoalUiStage;

  /** Once true, the trigger-identification prefix (trigger id / third-person imagery / optional Urge Need Identification) is never shown again this session -- set the moment it completes. */
  triggerPrefixResolved: boolean;
  /** The trainee's own recognition of what triggered this, spec section 2 -- a category label or free text, never invented. */
  triggerDescription: string | null;
  /** The need an identified urge is trying to answer, spec section 5 -- IDENTIFIED_NEED_UNKNOWN when the trainee doesn't yet know. null before urge_need_identification has been reached at all. */
  identifiedNeed: string | null;

  /**
   * Once true, the post-ARC-Thought reassessment detour is never
   * interrupted again this session -- set either immediately (this goal
   * has no urge/interfering mappings to offer at all) or once
   * reassessment's own answer is recorded, or once a bridge (Full/Mini,
   * urge or supportive) is confirmed and the caller resumes the outer
   * run at "desired_state_check".
   */
  reassessmentResolved: boolean;
  reassessmentChoice: ReassessmentChoice | null;

  /** The interfering-state mapping (ArcGoal.interferingMappings) selected for the supportive-state route this session, or null. */
  selectedMappingId: string | null;
  /** The urge mapping (ArcGoal.urgeMappings) selected for the urge route this session, or null. */
  selectedUrgeMappingId: string | null;

  /** The bridge's resolved execution mode for THIS pass through the urge/supportive route -- null until the inner run reaches its own "act" (see shouldInterceptInnerAtAct) and resolveExecutionMode/the live execution_mode_choice answer sets it. */
  executionMode: ExecutionMode | null;
  /** Which of the embedded Mini ARC's two reused steps is showing, or null when mini_arc_embedded isn't active. */
  miniArcStage: "regulation" | "encoding" | null;
}

export function createEmptyArcGoalLiveState(): ArcGoalLiveState {
  return {
    uiStage: "outer",
    triggerPrefixResolved: false,
    triggerDescription: null,
    identifiedNeed: null,
    reassessmentResolved: false,
    reassessmentChoice: null,
    selectedMappingId: null,
    selectedUrgeMappingId: null,
    executionMode: null,
    miniArcStage: null,
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
 * The supportive-state inner run's own starting ArcLiveState --
 * selectedTarget pre-set to "state" (a mapping's supportive protocol is
 * always a state-target ArcBuild). The caller starts the inner run
 * directly at "sensation_check" (never trigger_selection/presence_check)
 * by simply never rendering those stages for this session -- see this
 * file's own module doc.
 */
export function createArcGoalInnerInitialSession(): ArcLiveState {
  return { ...createEmptyLiveState(), triggerType: "reactive_emotion", selectedTarget: "state" };
}

/**
 * Urge route task: the urge inner run's own starting ArcLiveState --
 * triggerType "reactive_urge"/selectedTarget "habit", the same
 * unambiguous habit-layer pairing a regular reactive_urge session
 * always resolves to (arc/arcEngine.ts's resolveEncodingTarget: line
 * "return triggerType === 'reactive_urge' ? 'habit' : ..."). Also
 * started directly at "sensation_check" -- regular ARC's own
 * reactive_urge-specific "need_identification before presence_check"
 * detour (arc/arcEngine.ts's afterFirstStage) never applies here
 * because presence_check is never re-entered by the inner run at all;
 * Need Identification for this session already happened once, via this
 * file's own urge_need_identification meta-stage, ahead of ARC Thought.
 */
export function createArcGoalUrgeInnerInitialSession(): ArcLiveState {
  return { ...createEmptyLiveState(), triggerType: "reactive_urge", selectedTarget: "habit" };
}

/**
 * Urge route task: a pure, never-persisted adapter from a UrgeArc onto
 * the transient ArcBuildProfile shape the EXISTING, unmodified
 * arc/arcEngine.ts habit-layer path already reads (habit/
 * beneficialAction/regulationTool/preventiveAction -- see that file's
 * own "case 'habit'" branches for resolveTargetPreventiveAction/
 * resolveEncodingRegulationCue/resolveEncodingTarget). preventiveAction
 * is deliberately left null: the Stop already happened once, in this
 * file's own third-person-imagery prefix, before ARC Thought -- a
 * second Preventive Action check for the SAME already-stopped moment
 * would contradict "never ask the trainee to re-evoke/re-intensify the
 * urge". Every other ArcBuildProfile field is left at
 * createEmptyArcBuildProfile()'s own safe default: the habit layer
 * never reads them (see arc/arcEngine.ts's per-layer switch cases), so
 * leaving them null can never leak stray BUILD data into this session.
 * Deliberately never persisted anywhere -- this profile exists only for
 * the duration of one urge inner run.
 */
export function urgeArcToProfile(urgeArc: UrgeArc): ArcBuildProfile {
  return {
    ...createEmptyArcBuildProfile(),
    habit: urgeArc.interferingAction,
    beneficialAction: urgeArc.beneficialAlternativeAction,
    regulationTool: urgeArc.regulationAnchor,
    preventiveAction: null,
  };
}

/**
 * Interception point 1 -- see this file's own module doc. Only ever
 * true the FIRST time presence_check resolves into ARC Thought this
 * session: a later ARC-Thought loop-back into arc_thought_expand_presence
 * (arc/arcEngine.ts's own arc_thought_presence_recheck retry loop) is
 * never re-intercepted, since triggerPrefixResolved is already true by
 * then.
 *
 * Unified Presence/Mantra/Trigger/Imagery spec, section 4: a 7-10
 * Presence rating now resolves presence_check into the new
 * "presence_grounding" stage instead of arc_thought_awareness/
 * arc_thought_expand_presence (see arc/arcEngine.ts's "presence_check"
 * case) -- included here too, so this interception still fires exactly
 * once on that route as well, never silently skipped just because the
 * high-presence route no longer passes through ARC Thought.
 */
export function needsTriggerPrefixDetour(nextOuterStage: ArcStage, goalState: ArcGoalLiveState): boolean {
  return (
    !goalState.triggerPrefixResolved &&
    (nextOuterStage === "arc_thought_awareness" ||
      nextOuterStage === "arc_thought_expand_presence" ||
      nextOuterStage === "presence_grounding")
  );
}

/** trigger_identification's own answer -- moves on to third_person_imagery. Blank custom text (spec section 2 never forces one) is recorded as the same "unspecified" placeholder every other optional free-text answer in this app falls back to. */
export const TRIGGER_DESCRIPTION_UNSPECIFIED = "לא צוין";

export function resolveAfterTriggerIdentification(goalState: ArcGoalLiveState, description: string): ArcGoalLiveState {
  const trimmed = description.trim();
  return { ...goalState, triggerDescription: trimmed.length > 0 ? trimmed : TRIGGER_DESCRIPTION_UNSPECIFIED, uiStage: "third_person_imagery" };
}

/**
 * third_person_imagery's own Continue -- when this goal has any
 * urgeMappings configured, an urge MIGHT be present, so Urge Need
 * Identification (spec section 5) runs once here, ahead of ARC Thought;
 * a goal with no urgeMappings has nothing to map a need onto, so it's
 * skipped entirely (mirrors needsReassessmentDetour's own "nothing
 * configured -> skip" rule) and the prefix resolves immediately.
 */
export function resolveAfterThirdPersonImagery(goal: ArcGoal, goalState: ArcGoalLiveState): ArcGoalLiveState {
  if (goal.urgeMappings.length > 0) return { ...goalState, uiStage: "urge_need_identification" };
  return { ...goalState, uiStage: "outer", triggerPrefixResolved: true };
}

export function resolveAfterUrgeNeedIdentification(goalState: ArcGoalLiveState, need: string): ArcGoalLiveState {
  return { ...goalState, identifiedNeed: need, uiStage: "outer", triggerPrefixResolved: true };
}

/**
 * Interception point 2 -- see this file's own module doc. A goal with
 * neither urgeMappings nor interferingMappings has nothing to reassess
 * for, so the outer run continues straight into "desired_state_check",
 * exactly as if the trainee had answered "direct" -- generalizes the
 * original needsGoalInterferenceDetour's own rule to both mapping
 * types.
 */
export function needsReassessmentDetour(goal: ArcGoal, goalState: ArcGoalLiveState): boolean {
  if (goalState.reassessmentResolved) return false;
  return goal.urgeMappings.length > 0 || goal.interferingMappings.length > 0;
}

/**
 * reassessment's own 3-way answer (spec section 7). "direct" resumes
 * the outer run immediately, with no urge/supportive work at all --
 * never assumes the original emotion/urge is still present, exactly
 * matching spec's own "did not assume" requirement. "urge"/"supportive"
 * with exactly one configured mapping auto-selects it (mirrors
 * arc/arcEngine.ts's needsReactiveStateSelection precedent: no picker
 * shown for a single option) and goes straight to "inner" -- the
 * mapping's OWN execution mode (full/mini/choose) is resolved later,
 * only once the inner run reaches its own "act" (see
 * shouldInterceptInnerAtAct/resolveExecutionMode below), never here.
 */
export function resolveAfterReassessment(
  choice: ReassessmentChoice,
  goal: ArcGoal,
  goalState: ArcGoalLiveState
): { uiStage: ArcGoalUiStage; goalState: ArcGoalLiveState } {
  const resolved: ArcGoalLiveState = { ...goalState, reassessmentChoice: choice, reassessmentResolved: true };
  if (choice === "direct") return { uiStage: "outer", goalState: resolved };
  if (choice === "urge") {
    if (goal.urgeMappings.length === 1) {
      return { uiStage: "inner", goalState: { ...resolved, selectedUrgeMappingId: goal.urgeMappings[0].id } };
    }
    return { uiStage: "urge_select", goalState: resolved };
  }
  if (goal.interferingMappings.length === 1) {
    return { uiStage: "inner", goalState: { ...resolved, selectedMappingId: goal.interferingMappings[0].id } };
  }
  return { uiStage: "supportive_state_select", goalState: resolved };
}

/** urge_select's own answer. */
export function selectUrgeMapping(goalState: ArcGoalLiveState, urgeMappingId: string): ArcGoalLiveState {
  return { ...goalState, selectedUrgeMappingId: urgeMappingId, uiStage: "inner" };
}

/** supportive_state_select's own answer. */
export function selectSupportiveMapping(goalState: ArcGoalLiveState, mappingId: string): ArcGoalLiveState {
  return { ...goalState, selectedMappingId: mappingId, uiStage: "inner" };
}

/** The urge mapping currently selected for this session, or null. */
export function resolveSelectedUrgeMapping(goal: ArcGoal, goalState: ArcGoalLiveState): ArcGoalUrgeMapping | null {
  if (goalState.selectedUrgeMappingId === null) return null;
  return goal.urgeMappings.find((mapping) => mapping.id === goalState.selectedUrgeMappingId) ?? null;
}

/** The interfering-state mapping currently selected for this session, or null. */
export function resolveSelectedMapping(goal: ArcGoal, goalState: ArcGoalLiveState): ArcGoalInterferingMapping | null {
  if (goalState.selectedMappingId === null) return null;
  return goal.interferingMappings.find((mapping) => mapping.id === goalState.selectedMappingId) ?? null;
}

/** Whether the inner run's own transition should be intercepted -- the moment it would reach "act" (its own encode phase is already complete), substituting the urge/supportive bridge in place of its normal act/success_focus/complete. Shared by both the urge and supportive-state inner runs. */
export function shouldInterceptInnerAtAct(innerNextStage: ArcStage): boolean {
  return innerNextStage === "act";
}

/**
 * Mini ARC integration task (spec section 12, "handle deleted or
 * missing referenced protocols safely"): resolves a mapping's
 * CONFIGURED executionMode against whether its referenced Mini ARC
 * still actually exists. "choose" is returned as-is -- it's resolved
 * live, via execution_mode_choice, never by this function. "full" is
 * also returned as-is: the full protocol is the one every pre-existing
 * mapping already depended on (see arc/arcGoals.ts's normalizeArcGoal),
 * so there's no missing-reference case to fall back FROM here. Only
 * "mini" needs a safety net: if the configured Mini ARC was deleted
 * (miniArcId no longer resolves), fall back to "full" rather than
 * crash or silently show a broken screen.
 */
export function resolveExecutionMode(configuredMode: ExecutionMode, hasMiniArc: boolean): ExecutionMode {
  if (configuredMode === "mini" && !hasMiniArc) return "full";
  return configuredMode;
}

/** Where a resolved (never "choose") execution mode leads once the inner run reaches "act". */
export function resolveBridgeEntryUiStage(route: "urge" | "supportive", resolvedMode: "full" | "mini"): ArcGoalUiStage {
  if (resolvedMode === "mini") return "mini_arc_embedded";
  return route === "urge" ? "urge_action_confirm" : "supportive_action_confirm";
}

/** execution_mode_choice's own live answer. */
export function resolveAfterExecutionModeChoice(
  route: "urge" | "supportive",
  goalState: ArcGoalLiveState,
  pickedMode: "full" | "mini"
): { uiStage: ArcGoalUiStage; goalState: ArcGoalLiveState } {
  const resolved = { ...goalState, executionMode: pickedMode };
  const uiStage = resolveBridgeEntryUiStage(route, pickedMode);
  return { uiStage, goalState: pickedMode === "mini" ? { ...resolved, miniArcStage: "regulation" } : resolved };
}

/**
 * mini_arc_embedded's own Continue -- walks the embedded Mini ARC's two
 * reused steps ("regulation" then "encoding", see
 * live/screens.tsx's EmbeddedMiniArcScreen), then hands off to the
 * SAME urge/supportive bridge-confirm screen the Full route already
 * uses for its own final beneficial-alternative/supportive action (spec
 * sections 13-14: "end with configured supportive action"/"complete
 * beneficial alternative action" -- the mapping's own configured
 * action, never the Mini ARC build's own separate beneficialAction
 * field) -- this is the one mechanism that satisfies spec section 16
 * ("automatic transition ... after completing any bridge") for both
 * Full and Mini without duplicating the confirm screen.
 */
export function resolveAfterEmbeddedMiniArcStage(
  route: "urge" | "supportive",
  goalState: ArcGoalLiveState
): { uiStage: ArcGoalUiStage; goalState: ArcGoalLiveState } {
  if (goalState.miniArcStage === "regulation") {
    return { uiStage: "mini_arc_embedded", goalState: { ...goalState, miniArcStage: "encoding" } };
  }
  const uiStage: ArcGoalUiStage = route === "urge" ? "urge_action_confirm" : "supportive_action_confirm";
  return { uiStage, goalState: { ...goalState, miniArcStage: null } };
}

/**
 * Called once the trainee acknowledges the urge/supportive bridge
 * confirm (Full or Mini route, either bridge) -- marks the reassessment
 * detour resolved (never interrupts the outer run again this session)
 * so the caller can discard the inner run and resume the outer run,
 * already paused at "desired_state_check", with no re-ask of the
 * identity protocol and no return to the home screen. Spec section 16's
 * "automatic transition" -- shared by all four route/mode combinations
 * (urge/full, urge/mini, supportive/full, supportive/mini).
 */
export function resolveAfterBridgeConfirmed(goalState: ArcGoalLiveState): ArcGoalLiveState {
  return { ...goalState, reassessmentResolved: true, uiStage: "outer", executionMode: null, miniArcStage: null };
}

export const GOAL_INTERFERING_STATE_SELECT_TITLE = "איזה מצב פנימי נמצא איתך כרגע?";
export const URGE_SELECT_TITLE = "איזה דחף נמצא איתך כרגע?";

/** The supportive-action confirm's own copy -- the mapping's own bridge/trigger action (spec section 10), never that protocol's own internalAction. */
export function getSupportiveActionConfirmCopy(mapping: ArcGoalInterferingMapping): { title: string; body: string } {
  return { title: "פעולה תומכת", body: mapping.supportiveAction };
}

/** The urge-action confirm's own copy -- the referenced UrgeArc's own beneficial alternative action (spec section 9), the bridge into the Identity ARC. */
export function getUrgeActionConfirmCopy(urgeArc: UrgeArc): { title: string; body: string } {
  return { title: "פעולה מיטיבה חלופית", body: urgeArc.beneficialAlternativeAction };
}

/** The final goal-action confirm's own copy -- the goal's OWN action/result (Identity protocol -> Goal-related action -> Desired result), distinct from the identity protocol's own identityAction. */
export function getGoalActionConfirmCopy(goal: ArcGoal): { title: string; body: string } {
  const resultLine = goal.desiredResult.trim() ? ` התוצאה הרצויה: ${goal.desiredResult.trim()}.` : "";
  return { title: "פעולת המטרה", body: `${goal.goalAction.trim()}${resultLine}` };
}

// ---------------------------------------------------------------------------
// Trigger-identification prefix copy (spec sections 2-4) -- new text,
// verbatim from spec, reusing only the underlying dwell/timing
// MECHANISMS already built for arc/stageCopy.ts's own trigger_context/
// observer_pause cases (INSTRUCTION_TIMING.observerPerspective/
// observerPause, withTrailingDwellSegment,
// resolveDwellSecondsFor("stopImageryDwellSeconds", ...)) -- never
// editing arc/stageCopy.ts itself, so regular ARC's own copy is
// completely unaffected. The identity ArcBuildProfile (always loaded
// from the very start of an ArcGoal session, regardless of which route
// is later chosen) is the one profile this dwell resolves from.
// ---------------------------------------------------------------------------

export function getTriggerIdentificationCopy(): ArcStageCopy {
  return { title: "מה הפעיל אצלך את הרגש או את הדחף?", body: "", segments: null };
}

export function getThirdPersonImageryCopy(identityProfile: ArcBuildProfile): ArcStageCopy {
  const imageryLine = "דמיין את המצב מהצד, כאילו אתה צופה בעצמך בסיטואציה. שים לב למה שהפעיל את הרגש או הדחף, בלי לנסות להגביר אותו.";
  const stopLine = "דמיין שאתה מזהה את הרגע שבו הרגש או הדחף מתחילים ועוצר לפני הפעולה האוטומטית.";
  const instructionSegments: InstructionSegment[] = [
    { text: imageryLine, durationSeconds: INSTRUCTION_TIMING.observerPerspective },
    { text: stopLine, durationSeconds: INSTRUCTION_TIMING.observerPause },
  ];
  const stopImageryDwellSeconds = resolveDwellSecondsFor("stopImageryDwellSeconds", "identity", identityProfile);
  const segments = withTrailingDwellSegment(instructionSegments, stopImageryDwellSeconds);
  return {
    title: "מרחק ועצירה",
    body: segments
      .map((segment) => segment.text)
      .filter((text) => text.length > 0)
      .join(" "),
    segments,
  };
}

/** Spec section 5's own 9-item need list -- deliberately separate from arc/stageCopy.ts's regular-ARC need_identification's own 6-item NEED_IDENTIFICATION_PRESETS (live/screens.tsx), which stays unchanged. */
export const URGE_NEED_IDENTIFICATION_PRESETS = [
  "רגיעה",
  "מנוחה",
  "הנאה",
  "ביטחון",
  "חיבור",
  "שחרור מתח",
  "גירוי",
  "שליטה",
  "הימנעות מקושי",
];

export function getUrgeNeedIdentificationCopy(): ArcStageCopy {
  return { title: "על איזה צורך הדחף מנסה לענות?", body: "", segments: null };
}

/**
 * Spec section 5's own "show beneficial alternative action mapped to
 * selected need if one exists" preview -- the first urgeMapping (in
 * this goal's own order) whose own `need` matches the identified need,
 * resolved to its referenced UrgeArc via `urgeArcsById`. Returns null
 * (no preview) when nothing matches or the reference no longer
 * resolves -- never invents a mapping/urge that isn't actually
 * configured.
 */
export function findUrgeArcForNeed(goal: ArcGoal, urgeArcsById: Record<string, UrgeArc>, need: string): UrgeArc | null {
  if (need === IDENTIFIED_NEED_UNKNOWN) return null;
  const mapping = goal.urgeMappings.find((candidate) => candidate.need === need);
  if (!mapping) return null;
  return urgeArcsById[mapping.urgeArcId] ?? null;
}

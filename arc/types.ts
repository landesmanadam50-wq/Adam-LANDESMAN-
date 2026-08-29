export type DevelopmentLayer = "state" | "identity" | "habit";

export type TriggerType = "reactive_emotion" | "reactive_urge" | "proactive";

export type ArcStage =
  | "trigger_selection"
  | "presence_check"
  | "arc_thought_awareness"
  | "arc_thought_combined_attention"
  | "arc_thought_expand_presence"
  | "arc_thought_presence_recheck"
  | "preventive_action_check"
  | "preventive_action"
  | "sensation_check"
  | "stay"
  | "accept"
  | "reactive_transition_check"
  | "regulate"
  | "desired_state_check"
  | "encode"
  | "act"
  | "success_focus"
  /**
   * The trainee's own predefined interfering/negative behavior
   * (habit, below), timed to the current program week's gradually
   * reduced allowance -- see program/engine.ts's
   * resolveNegativeActionDuration. Only reached when the habit layer
   * is active and habit is configured (see arc/arcEngine.ts's
   * needsNegativeAction); every other session goes straight from
   * success_focus to complete exactly as before this stage existed.
   */
  | "negative_action"
  | "complete";

export interface EncodingProfile {
  target: string;
  bodySensationCue: string | null;
  breathCue: string | null;
  bodyLanguageCue: string | null;
  gazeCue?: string | null;
  mantra: string | null;
}

export interface ArcBuildProfile {
  programPath: string;
  /**
   * @deprecated Legacy two-track ("standard" vs "advanced") signal from
   * before program/ existed. Kept only so old stored profiles still parse
   * and can be migrated. The real source of truth for what a trainee
   * needs is the persisted ArcProgramSelection (program/programTypes.ts)
   * -- new code must not read this field to make decisions.
   */
  identityActionNeeded: boolean;

  /**
   * BUILD-GOAL: the positive direction the whole program moves toward
   * (Goal -> Habit -> Identity -> Desired State). Independent of which
   * layers (state/identity/habit) end up active -- every trainee has a
   * goal regardless of which program path it resolves to.
   */
  goal: string | null;

  /**
   * The ARC Map around the state-layer Desired State (supportiveState
   * below): where it's especially relevant (challengeContext), what
   * commonly interferes with it (interferingState), and what to do
   * about it (preventiveAction, further down). These are recognition/
   * mapping data only -- see arc/instructions.ts's containsInductionPattern
   * and getInterferingStateRecognitionPrompt/getChallengeContextRecognitionPrompt
   * for how LIVE is allowed to use them (recognition, never induction).
   */
  interferingState: string | null;
  /** The Desired State (BUILD-GOAL's last step) -- distinct from, and never combined with, interferingState. Intentionally activated only at Encoding. */
  supportiveState: string | null;
  challengeContext: string | null;
  /** The state layer's own Preventive Action -- resolved for a session targeting "state", never mixed with identityPreventiveAction/preventiveAction (habit's). See arc/arcEngine.ts's resolveTargetPreventiveAction. */
  statePreventiveAction: string | null;
  /**
   * The state layer's own lightweight regulation anchor that continues
   * during Encoding -- deliberately shorter than the Full Regulation
   * Cue (regulationTool, further down) used during the Regulation
   * stage itself, to avoid overloading attention there. Null means no
   * separate short cue was configured (either never asked, or the
   * trainee chose "use the same cue during Encoding"): resolveEncodingRegulationCue
   * (arc/arcEngine.ts) then falls back to regulationTool, so a profile
   * stored before this field existed behaves exactly as it did before.
   * Never mixed with identityEncodingRegulationCue.
   */
  stateEncodingRegulationCue: string | null;
  stateEncoding: EncodingProfile | null;
  internalAction: string | null;

  desiredIdentity: string | null;
  /** The identity layer's own ARC Map, parallel to challengeContext/interferingState above -- a second, independently editable ARC Map around a second Desired State (desiredIdentity), not a duplicate of the state layer's. */
  identityChallengeContext: string | null;
  identityInterferingEmotion: string | null;
  /** The identity layer's own Preventive Action, parallel to statePreventiveAction -- never mixed with it or with habit's preventiveAction. */
  identityPreventiveAction: string | null;
  /** The identity layer's own lightweight Encoding regulation anchor, parallel to stateEncodingRegulationCue -- never mixed with it. The habit layer has no equivalent of its own: a habit-targeted Encoding session always uses regulationTool directly, unchanged. */
  identityEncodingRegulationCue: string | null;
  identityEncoding: EncodingProfile | null;
  identityAction: string | null;

  habit: string | null;
  beneficialAction: string | null;
  /** The habit layer's own Preventive Action, resolved for a session targeting "habit" (reactive_urge). Parallel to statePreventiveAction/identityPreventiveAction -- see arc/arcEngine.ts's resolveTargetPreventiveAction. */
  preventiveAction: string | null;

  /**
   * The Full Regulation Cue -- the main regulation tool/process used
   * during the Regulation stage itself, global across every target
   * (unlike statePreventiveAction/identityPreventiveAction, this one
   * isn't split per ARC Map). Also the fallback Encoding uses for any
   * target with no stateEncodingRegulationCue/identityEncodingRegulationCue
   * of its own -- see arc/arcEngine.ts's resolveEncodingRegulationCue.
   */
  regulationTool: string | null;
  actionDuration: number | null;
  successFocusDuration: number | null;
  /**
   * The trainee's own configured base allowance (in minutes) for their
   * predefined negative/interfering action (habit, above) -- the
   * un-reduced starting amount, set once like actionDuration/
   * successFocusDuration. The amount actually permitted in a given
   * session is this base scaled down by the current program week's
   * reduction factor -- see program/engine.ts's
   * resolveNegativeActionDuration, which is the one place that scaling
   * happens; this field itself is never reduced or rewritten week to
   * week. null (the default for every existing profile) means no
   * Negative Action Timer duration was ever configured, so the
   * negative_action stage never gates on a timer -- consistent with
   * how actionDuration/successFocusDuration already behave when unset.
   */
  negativeActionBaseDurationMinutes: number | null;
}

export interface ArcProgramProgress {
  programPath: string;
  currentProgramWeek: number;
  completedProgramWeeks: number;
  activeLayers: DevelopmentLayer[];

  weekStartDate: string | null;
  trainingDatesThisWeek: string[];

  buildExtensionRequired: boolean;
  nextLayersToBuild: DevelopmentLayer[] | null;
  programCompleted: boolean;

  /** Guards completeProgramWeek() against double-crediting the same week. */
  lastCompletedWeek: number | null;
  /** Every LIVE session that reached "act", regardless of daily training credit (max 1/day). */
  liveSessionCount: number;
}

export interface ArcLiveState {
  triggerType: TriggerType | null;
  /**
   * Which DevelopmentLayer's encoding/action/Preventive Action this
   * session targets, set explicitly once (auto-picked when only one
   * target is available, or chosen by the trainee when more than one
   * is) rather than left for resolveEncodingTarget() to infer blind --
   * see arc/arcEngine.ts's needsProactiveTargetSelection() (proactive)
   * and needsReactiveStateSelection() (reactive_emotion, recognizing
   * which already-present mapped experience -- e.g. "Distraction" vs
   * "Craving" -- interferes with which positive target). Left null for
   * reactive_urge (unambiguous: always "habit") and for reactive_emotion/
   * proactive sessions with 0-1 available targets, where inference
   * alone is already deterministic and consistent.
   */
  selectedTarget: DevelopmentLayer | null;

  presenceRating: number | null;
  sensationLocation: string | null;
  sensationIntensity: number | null;
  desiredStateRating: number | null;

  selectedState: string | null;
  selectedIdentity: string | null;
  /**
   * A session-specific alternative action, set only on the "act"
   * stage's Action-choice screen when the trainee can't perform their
   * planned/mapped action right now -- never the persisted BUILD
   * action itself (that stays in ArcBuildProfile, untouched). See
   * arc/arcEngine.ts's needsCurrentActionResolution/resolveEncodingTarget.
   * Null both before the choice is made AND when the trainee confirms
   * they CAN perform the planned action (see plannedActionConfirmed,
   * which distinguishes that case from "not yet asked").
   */
  selectedAction: string | null;
  /** Paired with selectedAction: the alternative action's own session-specific duration, resolved by arc/arcEngine.ts's resolveActionDuration. Never overwrites ArcBuildProfile.actionDuration. */
  selectedActionDuration: number | null;
  /** Set once the trainee confirms they'll perform the planned/mapped action as-is (the "כן" branch of the Action-choice screen) -- distinct from selectedAction being null, which alone would be ambiguous between "not yet asked" and "asked, planned action confirmed". */
  plannedActionConfirmed: boolean;
  /**
   * Session-only flags gating the "act" stage's Imagery and Preparation
   * sub-phases -- see arc/arcEngine.ts's resolveActPhase, which stays at
   * "imagery" until this is true, then "preparation" until that one is,
   * then "performing" (the actual timed Action; see arc/actionTimer.ts).
   * Both false by default; never persisted to ArcBuildProfile, and never
   * read by resolveActionDuration or the Action Timer itself -- they only
   * sequence which screen shows next within "act", the same ArcStage
   * value throughout (no new ArcStage was added).
   */
  actionImageryCompleted: boolean;
  actionPreparationCompleted: boolean;

  /**
   * Set once the trainee explicitly taps "begin" on the negative_action
   * stage's predefined-action screen -- unlike the Beneficial Action
   * Timer (which starts automatically once Action Preparation
   * completes) and the Success Focus Timer (which starts automatically
   * on entering that stage), the Negative Action Timer requires an
   * explicit start action per spec. False by default; never reset back
   * to false once true within a session (no way back, same
   * one-directional shape as plannedActionConfirmed/
   * actionImageryCompleted above).
   */
  negativeActionStarted: boolean;

  acceptanceNeeded: boolean | null;
  regulationReady: boolean | null;
  regulationNeeded: boolean;
  wantsPreventiveAction: boolean | null;

  arcThoughtCompleted: boolean;
  /** Safety cap on the ARC Thought and reactive/proactive re-check loops -- see arc/arcEngine.ts. */
  loopIterationCount: number;
  activeTools: string[];
  currentArcStage: ArcStage;

  /** The protocol reached "act" this session (every completed session does, by construction). */
  actionReached: boolean;
  /** The trainee confirmed they actually performed the real-world action -- the only thing that earns Training Day credit. */
  realActionCompleted: boolean;
}

export function createEmptyLiveState(): ArcLiveState {
  return {
    triggerType: null,
    selectedTarget: null,
    presenceRating: null,
    sensationLocation: null,
    sensationIntensity: null,
    desiredStateRating: null,
    selectedState: null,
    selectedIdentity: null,
    selectedAction: null,
    selectedActionDuration: null,
    plannedActionConfirmed: false,
    actionImageryCompleted: false,
    actionPreparationCompleted: false,
    negativeActionStarted: false,
    acceptanceNeeded: null,
    regulationReady: null,
    regulationNeeded: false,
    wantsPreventiveAction: null,
    arcThoughtCompleted: false,
    loopIterationCount: 0,
    activeTools: [],
    currentArcStage: "trigger_selection",
    actionReached: false,
    realActionCompleted: false,
  };
}

export type DevelopmentLayer = "state" | "identity" | "habit";

export type TriggerType = "reactive_emotion" | "reactive_urge" | "proactive";

export type ArcStage =
  | "trigger_selection"
  /**
   * Reactive-only (#8 "Important Flow Distinction"): the session-specific
   * "what triggered this right now" recognition, asked once the reactive
   * target is resolved and before the existing Preventive Action -- see
   * arc/arcEngine.ts's module doc and ArcLiveState.triggerContext below.
   * Never reached for proactive sessions (Preserve Proactive Separation,
   * unchanged).
   */
  | "trigger_context"
  /**
   * Reactive-only: brief observer-perspective + imagined-pause
   * instruction, immediately after trigger_context and before the
   * existing Preventive Action -- recognition-only, never asks the
   * trainee to evoke/intensify the interfering state. See
   * arc/stageCopy.ts's "observer_pause" case.
   */
  | "observer_pause"
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
   * resolveNegativeActionDuration. Negative Action reduction is an
   * OPTIONAL, BUILD-configured tool (ArcBuildProfile.negativeActionReductionEnabled),
   * separate from the main ARC routine: this stage is never reached
   * through the main sequencer any more -- getNextArcStage's
   * "success_focus" case always continues straight to "complete",
   * unconditionally. The predefined-action/timer screens for this
   * stage (live/screens.tsx's NegativeActionStartScreen/
   * NegativeActionScreen, and this stage's own getStageCopy case) are
   * still reused, but only by the standalone entry point
   * (app/negative-action.tsx) the trainee opens intentionally --
   * see program/engine.ts's isNegativeActionAvailable.
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

/**
 * Personal, per-ARC-state dwell times (see arc/dwellTimes.ts) -- how
 * long, in seconds, a trainee wants to remain in each of five
 * experiential LIVE stages AFTER that stage's own instruction has
 * already finished revealing (never the instruction/explanation
 * duration itself -- see arc/instructionTiming.ts, untouched by this).
 * One full set per ARC Map (ArcBuildProfile.stateDwellTimes/
 * identityDwellTimes below) -- never one shared global profile, so a
 * trainee can configure e.g. "תשוקה" differently from "פיזור".
 */
export interface DwellTimes {
  sensationDwellSeconds: number;
  acceptanceDwellSeconds: number;
  regulationDwellSeconds: number;
  encodingDwellSeconds: number;
  actionImageryDwellSeconds: number;
  /**
   * Coordinated timer/dwell task (Part 16-19): how long, after the
   * Presence instruction (arc_thought_expand_presence) finishes
   * revealing, before the subtle dwell cue fires and the inline
   * Presence rating appears. Resolved differently from the five stages
   * above -- see arc/dwellTimes.ts's resolvePresenceDwellSeconds --
   * since a specific target layer isn't always resolved yet by the time
   * Presence is reached (reactive_urge/proactive sessions). Still
   * stored on the same per-ARC-map stateDwellTimes/identityDwellTimes
   * sets below, never a separate configuration structure.
   */
  presenceDwellSeconds: number;
  /**
   * Coordinated timer/dwell task (Part 20-23): "זמן שהייה בדמיון
   * העצירה" -- how long, after the Reactive observer/pause instruction
   * (observer_pause) finishes revealing, before the subtle dwell cue
   * fires and the existing Preventive Action becomes available.
   * Resolved via the SAME resolveDwellSecondsFor mechanism as the five
   * original categories, from the CURRENT reactive session's own
   * resolved layer -- see arc/arcEngine.ts's resolveObserverPauseLayer.
   */
  stopImageryDwellSeconds: number;
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
  /**
   * The Action Body Cue for the state layer's own internalAction -- a
   * physical cue the trainee performs and MAINTAINS while actually
   * doing internalAction, resolved by arc/arcEngine.ts's
   * resolveEncodingTarget alongside internalAction itself (never by
   * Encoding). Deliberately separate from stateEncoding.bodyLanguageCue
   * above: that one is Encoding's own embodiment segment, shown once,
   * before Identity/Mantra, regardless of what's ever performed
   * afterward; this one belongs to the "act" stage (Action Imagery, when
   * enabled, and the real timed Action screen) and is never copied from,
   * or into, stateEncoding.bodyLanguageCue automatically -- a trainee
   * may configure either, both (even with different values), or
   * neither. null (the default, and every profile stored before this
   * field existed) means no Action Body Cue was configured for this
   * target -- the "act" stage's copy simply omits it, never inventing a
   * substitute.
   */
  internalActionBodyCue: string | null;
  /**
   * The state layer's own configured dwell times (arc/dwellTimes.ts) --
   * null until BUILD-ARC's "זמן שהייה" step is saved for this target,
   * in which case every one of the five fields is resolved against
   * DEFAULT_DWELL_TIMES; a legacy profile stored before this feature
   * existed has this missing entirely (undefined once JSON.parse'd),
   * resolved the exact same way. Never mixed with identityDwellTimes.
   */
  stateDwellTimes: Partial<DwellTimes> | null;

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
  /** The identity layer's own Action Body Cue, parallel to internalActionBodyCue -- never mixed with it or with beneficialActionBodyCue. Like identityAction itself, not asked as its own BUILD question: derived from beneficialActionBodyCue (see build/profileWizard.ts's module doc on why identityAction shares beneficialAction). */
  identityActionBodyCue: string | null;
  /** The identity layer's own configured dwell times, parallel to stateDwellTimes above -- never mixed with it. */
  identityDwellTimes: Partial<DwellTimes> | null;

  habit: string | null;
  beneficialAction: string | null;
  /** The habit layer's Action Body Cue for beneficialAction -- also reused for the identity layer's identityAction (identityActionBodyCue), exactly mirroring how identityAction itself reuses beneficialAction rather than being asked twice. See internalActionBodyCue's doc for the full Action-Body-Cue-vs-Encoding-Body-Language distinction. */
  beneficialActionBodyCue: string | null;
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
   * week. null (the default when never configured) means no Negative
   * Action Timer duration was ever configured, so the negative_action
   * stage never gates on a timer -- consistent with how
   * actionDuration/successFocusDuration already behave when unset.
   * Coordinated timer/dwell task (Part 12): this is the ONE source of
   * truth for the current target Habit's real timer duration -- set via
   * BUILD-GOAL's own "negativeActionDuration" step (build/profileWizard.ts),
   * remaining optional there exactly like it always has been; LIVE never
   * asks for this duration again, it only resolves it (see
   * program/engine.ts's resolveNegativeActionDuration).
   */
  negativeActionBaseDurationMinutes: number | null;

  /**
   * Negative Action reduction task: whether this optional habit-
   * reduction tool is enabled for this program at all -- decoupled
   * from the "habit" DevelopmentLayer being active (that's about the
   * separate, POSITIVE Beneficial Action/Desired Habit track). false
   * (or a legacy-absent/undefined value that resolves to false, unless
   * a duration was already configured -- see program/engine.ts's
   * isNegativeActionReductionEnabled) means the standalone Negative
   * Action Timer (app/negative-action.tsx) is never offered/available,
   * and the main ARC routine (ARC -> Success Focus -> completion)
   * never depends on this field at all. Set explicitly in BUILD-GOAL's
   * own "negativeActionEnabledAsk" step (build/profileWizard.ts) --
   * only when true are the free-text negative action (habit, above)
   * and its 1-15 minute duration (negativeActionBaseDurationMinutes,
   * above) even asked for.
   */
  negativeActionReductionEnabled: boolean;
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

  /**
   * Reactive-flow-strengthening task (#1, #8): the session-specific
   * free-text answer to "מה הפעיל אצלך עכשיו את הרגש או הדחף?" -- what
   * specifically triggered THIS occurrence, right now. Deliberately
   * separate from, and never written back onto, the BUILD-configured
   * Challenge Context (ArcBuildProfile.challengeContext/
   * identityChallengeContext) -- that stays the reusable/preconfigured
   * context; this is the one-off, session-specific event. Optional
   * (null when left blank -- the trainee is never forced to elaborate),
   * set once on the "trigger_context" stage and never re-asked within
   * the same session. See data/sessionLog.ts's SessionEvidenceContext
   * for where this is safely carried forward at session completion.
   */
  triggerContext: string | null;
  /**
   * Unknown-trigger refinement: the STRUCTURED signal for whether the
   * trainee's trigger_context answer named a specific trigger (true) or
   * was recognized as an "I don't know" response, or left blank (false)
   * -- see live/liveEventAdapter.ts's isUnknownTriggerResponse/
   * applyTriggerContext. null only before trigger_context has been
   * answered at all (createEmptyLiveState's own initial value).
   * "לא יודע" itself is never treated as if it were a literal semantic
   * trigger -- triggerContext above still preserves exactly what the
   * trainee typed, verbatim, but arc/stageCopy.ts's "observer_pause"
   * case reads THIS field, not triggerContext's text, to decide which
   * observer-imagery phrasing to show, so an unknown answer never gets
   * treated as content to imagine.
   */
  triggerKnown: boolean | null;

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
   * Session-only flag gating the "act" stage's Imagery sub-phase -- see
   * arc/arcEngine.ts's resolveActPhase, which stays at "imagery" until
   * this is true, then "performing" (the actual timed Action; see
   * arc/actionTimer.ts). False by default; never persisted to
   * ArcBuildProfile, and never read by resolveActionDuration or the
   * Action Timer itself -- it only sequences which screen shows next
   * within "act", the same ArcStage value throughout (no new ArcStage
   * was added). The standalone Action Preparation sub-phase that used
   * to follow this one is removed -- Imagery now goes directly to
   * Performing.
   */
  actionImageryCompleted: boolean;
  /**
   * The trainee's own live, in-session choice of Beneficial Action
   * duration (1-10 minutes -- coordinated timer/dwell task, Part 1:
   * widened from the original 5-10 minute range, no minimum floor
   * anymore) -- see live/screens.tsx's
   * BeneficialActionDurationChoiceScreen and
   * arc/arcEngine.ts's resolveActionDuration. Null until chosen; only
   * ever asked on the PLANNED-action path (the alternative-action path
   * already has its own session-specific duration via
   * selectedActionDuration). Never reset once set within a session.
   */
  beneficialActionDurationMinutes: number | null;

  /**
   * Set once the trainee explicitly taps "begin" on the negative_action
   * stage's predefined-action screen -- unlike the Beneficial Action
   * Timer (which starts automatically once Action Imagery completes)
   * and the Success Focus Timer (which starts automatically on
   * entering that stage), the Negative Action Timer requires an
   * explicit start action per spec. False by default; never reset back
   * to false once true within a session (no way back, same
   * one-directional shape as plannedActionConfirmed/
   * actionImageryCompleted above).
   */
  negativeActionStarted: boolean;

  /**
   * Coordinated timer/dwell task (Part 2-4): the RETROSPECTIVE answer
   * to "כמה זמן המשכת בפעולה המיטיבה מעבר לזמן שתכננת?" -- how many
   * extra minutes, beyond the Beneficial Action Timer's own configured
   * duration, the trainee estimates they kept going before returning to
   * ARCHI. Never inferred/invented: null means "not yet answered" (the
   * retrospective screen is still showing), NOT zero -- 0 is a fully
   * valid, explicitly-submitted answer ("I didn't continue any
   * longer"). See live/screens.tsx's SuccessFocusRetrospectiveScreen.
   */
  successFocusExtraMinutes: number | null;
  /**
   * Coordinated timer/dwell task (Part 4): "האם תרצה לבצע מיקוד הצלחה
   * נוסף בהמשך?" -- asked only after successFocusExtraMinutes has been
   * recorded. null = not yet answered; false = continue the existing
   * downstream flow with no scheduling; true = the future-scheduling
   * sub-screen (date/time shortcut + duration) is shown next. See
   * live/screens.tsx's FutureSuccessFocusAskScreen/
   * FutureSuccessFocusScheduleScreen.
   */
  wantsFutureSuccessFocus: boolean | null;

  acceptanceNeeded: boolean | null;
  /**
   * Safety cap on the Acceptance "not ready yet" willingness loop (the
   * accept stage's "לא" -> unwillingness-acknowledgment -> dwell ->
   * readiness-recheck sub-flow -- see live/screens.tsx's AcceptScreen
   * and arc/arcEngine.ts's isAcceptanceWillingnessLoopCapped). Its own
   * dedicated counter, deliberately separate from loopIterationCount
   * (which governs the UNRELATED accept -> sensation_check intensity-
   * recheck loop) so this sub-flow can never perturb, or be perturbed
   * by, that other loop's own independent cap.
   */
  acceptanceWillingnessLoopCount: number;
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
    triggerContext: null,
    triggerKnown: null,
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
    beneficialActionDurationMinutes: null,
    negativeActionStarted: false,
    successFocusExtraMinutes: null,
    wantsFutureSuccessFocus: null,
    acceptanceNeeded: null,
    acceptanceWillingnessLoopCount: 0,
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

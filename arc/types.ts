import type { ArcLinkSettings, BodyImagery } from "./bodyImagery.ts";

export type DevelopmentLayer = "state" | "identity" | "habit";

/**
 * Coherent-architecture task (Value/Identity/Barrier/Bridge model,
 * #12): whether a mapped barrier is something to work through
 * internally (regulate/accept/encode) or a real external limitation
 * (injury, no time, no equipment, wrong location) that emotional
 * regulation can't solve. "practical" never auto-starts another
 * emotional protocol -- see the corresponding statePracticalAlternative/
 * identityPracticalAlternative fields on ArcBuildProfile below, offered
 * instead as a practical solution / habit adjustment / minimal version
 * / alternative action. null (a legacy build, or this step never
 * answered) is always treated as "not yet classified" -- never
 * defaulted to either value.
 */
export type BarrierType = "internal" | "practical";

export type TriggerType = "reactive_emotion" | "reactive_urge" | "proactive";

export type ArcStage =
  | "trigger_selection"
  /**
   * Urge-check task: "האם יש כרגע דחף לבצע את ההרגל המפריע?" -- reached
   * only from trigger_selection's reactive_urge (habit) branch, never by
   * reactive_emotion or proactive sessions. "Yes" continues into the
   * existing trigger_context/observer_pause (Stop)/Preventive Action
   * sequence below, completely unchanged; "No" skips all three of those
   * and goes straight to the existing presence_check. Session-only
   * (ArcLiveState.hasUrge below) -- never written back to the saved
   * program. See arc/arcEngine.ts's "urge_check"/"trigger_selection"
   * cases and arc/stageCopy.ts's "urge_check" case for the copy.
   */
  | "urge_check"
  /**
   * Reactive-only (#8 "Important Flow Distinction"): the session-specific
   * "what triggered this right now" recognition, asked once the reactive
   * target is resolved and before the existing Preventive Action -- see
   * arc/arcEngine.ts's module doc and ArcLiveState.triggerContext below.
   * Never reached for proactive sessions (Preserve Proactive Separation,
   * unchanged). For reactive_urge specifically, only reached once
   * urge_check (above) has been answered "יש דחף".
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
  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 4: reached
   * ONLY when presence_check's rating is 7-10 (shouldRunArcThought ===
   * false) -- a single short, untimed grounding line, replacing what
   * used to be a forced pass through arc_thought_expand_presence for
   * this route. None of the three ARC Thought/Presence sub-stages below,
   * their timers, or the presence-recheck loop ever run on this path;
   * this stage's own transition goes straight to afterArcThought(),
   * the exact same exit point the 1-5 route eventually reaches via
   * arc_thought_presence_recheck. See arc/stageCopy.ts's
   * "presence_grounding" case and arc/arcEngine.ts's "presence_check"
   * transition.
   */
  | "presence_grounding"
  | "arc_thought_awareness"
  | "arc_thought_combined_attention"
  | "arc_thought_expand_presence"
  | "arc_thought_presence_recheck"
  | "preventive_action_check"
  | "preventive_action"
  /**
   * Urge-check task: "מה אתה באמת צריך עכשיו?" -- reached only for a
   * reactive_urge session that confirmed an urge at urge_check,
   * immediately after Stop (observer_pause)/Preventive Action and before
   * Presence Rating (see arc/arcEngine.ts's afterHabitPreventiveStage,
   * used by "observer_pause"/"preventive_action_check"/"preventive_action").
   * Never forces an answer -- "אני עדיין לא יודע" is itself a valid,
   * continuing choice, distinct from "not yet answered". The need
   * belongs to the PERSON, never described as "the habit's need" -- see
   * arc/stageCopy.ts's "need_identification" case. Session-only
   * (ArcLiveState.identifiedNeed below); never changes the saved
   * beneficial action.
   */
  | "need_identification"
  | "sensation_check"
  /**
   * ARC-BUILD-to-LIVE connection task, repositioned by the Balanced
   * Alternative Interpretation task: Awareness of an already-present
   * interfering thought (the Limiting Belief mapped in BUILD --
   * stateLimitingBelief/identityLimitingBelief), reached only when the
   * resolved target has one configured (see arc/arcEngine.ts's
   * resolveTargetLimitingBelief and its shared resolveBeforeStay
   * helper) -- a legacy/unconfigured build skips it entirely. Now
   * reached BEFORE "stay" (from every edge that used to transition
   * straight into "stay" -- sensation_check's own classification and
   * reactive_transition_check's retry loop), never from "stay" itself
   * any more, so the cognitive sequence matches Identify Thought ->
   * Identify Belief -> Balanced Alternative Interpretation -> Stay.
   * Recognition-only, exactly like sensation_check/stay themselves:
   * never an instruction to imagine, evoke, strengthen, or remain
   * inside the thought. Once answered (any of the three choices),
   * continues to "balanced_alternative_interpretation" when one is
   * configured, else straight to "stay" -- and is never re-shown again
   * within the same session even across a later loop iteration (see
   * ArcLiveState.interferingThoughtChoice).
   */
  | "interfering_thought_check"
  /**
   * Balanced Alternative Interpretation task: an optional, third
   * Awareness step -- Identify Thought -> Identify Belief -> Balanced
   * Alternative Interpretation -> Stay. Reached only when the resolved
   * target has one configured (ArcBuildProfile.stateBalancedAlternativeInterpretation/
   * identityBalancedAlternativeInterpretation), immediately after
   * "interfering_thought_check" resolves (or in its place, when no
   * Limiting Belief is configured but an alternative interpretation
   * is) -- see arc/arcEngine.ts's resolveBeforeStay. Never placed in
   * Regulation or Encoding, and never replaces the Bridge Mantra (a
   * completely separate field, shown later at the end of Regulation --
   * see arc/mantras.ts). Recognition/offering-only: adds another
   * perspective alongside the original thought, never an instruction to
   * suppress, erase, reject, or forcibly replace it. Always continues
   * straight to "stay" -- see ArcLiveState.balancedAlternativeInterpretationSeen
   * for why it's never shown twice within the same session.
   */
  | "balanced_alternative_interpretation"
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
  /**
   * ARC Link task: optional custom body-imagery metadata for THIS
   * target's own bodyLanguageCue, used only by the new ARC Link
   * rehearsal mode's Encoding imagery screen (arc/arcLink.ts) -- never
   * read by normal ARC/Encoding itself. Optional so every existing
   * EncodingProfile object literal across the codebase (tests included)
   * keeps compiling unchanged; missing/undefined is always treated as
   * "no custom imagery saved" (arc/bodyImagery.ts's
   * getBodyImageryForText then falls back to a known preset match or a
   * safe generic instruction -- never a crash).
   */
  bodyImagery?: BodyImagery | null;
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
  /**
   * ARC Goal task: how long, after the successful-result imagery
   * instruction finishes revealing, before the subtle dwell cue fires
   * and the trainee can continue -- the Result Imagery half of the
   * extended Action Imagery sequence (see arc/successfulPerformance.ts),
   * distinct from actionImageryDwellSeconds above (the Process/Action
   * Imagery half). Resolved via the exact same resolveDwellSecondsFor
   * mechanism, from whichever layer's Successful Performance section is
   * configured -- today only ever "identity" (see
   * ArcBuildProfile.identitySuccessfulPerformance* below), but stored on
   * the shared DwellTimes shape rather than a bespoke field so it works
   * identically for any layer BUILD later extends this to. A legacy
   * profile stored before this field existed has it missing entirely
   * (`undefined` once JSON.parse'd), resolved the exact same way as
   * every other DwellTimes field: fall back to
   * DEFAULT_DWELL_TIMES.resultImageryDwellSeconds.
   */
  resultImageryDwellSeconds: number;
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
   * Presence Color task: this ONE ArcBuild's own answer to "באיזה צבע
   * מתמלאת הנוכחות שלך?" -- free Hebrew text (a preset chip or typed
   * entry, see build/ArcBuildEditorScreen.tsx), global to the whole
   * build (never per-target/per-layer the way stateEncoding/
   * identityEncoding are) since Presence itself is experienced once per
   * session, before any target is even resolved. Chosen once during
   * BUILD, never asked again during LIVE -- arc/stageCopy.ts's
   * "arc_thought_expand_presence" case (Presence Stage 3) activates it,
   * and arc/presenceColor.ts's getPresenceColorReminder threads a short,
   * grammatically-safe (never gender-inflected against arbitrary
   * user text) reminder through the rest of that LIVE session. null
   * means either a legacy ArcBuild created before this field existed,
   * or (should not happen for a build saved through the current
   * wizard, which requires it) never answered -- both cases are always
   * treated as "no color" everywhere this is read, never a crash and
   * never an invented default.
   */
  presenceColor: string | null;

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
  /** The identity layer's own lightweight Encoding regulation anchor, parallel to stateEncodingRegulationCue -- never mixed with it. The habit layer still has no regulation-cue equivalent of its own (a habit-targeted Encoding session always uses regulationTool directly, unchanged) -- only its optional body-language-cue/mantra Encoding content is configurable, via habitEncoding below. */
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
   * ARC Urge Stop Action/Encoding task: the habit layer's own Encoding
   * content, parallel to stateEncoding/identityEncoding -- null by
   * default for every ArcBuildProfile saved before this field existed
   * (no regular BUILD screen sets this directly yet). The one real
   * writer today is arc/arcGoalEngine.ts's urgeArcToProfile, which
   * builds it from a UrgeArc's own optional bodyLanguageCue/
   * encodingMantra fields when the trainee configured either -- see
   * that function's own doc. Reuses the EXACT same EncodingProfile
   * shape identity/state already use (never a second, parallel Encoding
   * concept); arc/arcEngine.ts's resolveEncodingTarget reads this for
   * its "habit" case exactly like it already reads identityEncoding/
   * stateEncoding for theirs.
   */
  habitEncoding: EncodingProfile | null;

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

  /**
   * ARC Link task: this ONE build's own optional trigger + Link
   * enablement -- "Trigger -> Open ARCHI -> Start the selected protocol
   * -> Perform the exact personalized protocol -> Begin the beneficial
   * action" rehearsal. Read only by the new entry-selection screen
   * (build/LiveModeSelectScreen.tsx, which decides whether to show/
   * enable "ARC Link") and by arc/arcLink.ts's content builder -- never
   * by normal ARC/LIVE, Presence routing, or any timer. Optional so
   * every existing ArcBuildProfile object literal keeps compiling
   * unchanged; missing/undefined is always disabled (arc/bodyImagery.ts's
   * hasConfiguredTrigger), matching a build saved before this feature
   * existed.
   */
  linkSettings?: ArcLinkSettings | null;
  /**
   * ARC Link task: optional custom body-imagery metadata for the Full
   * Regulation Cue (regulationTool, above) -- build-global, like
   * regulationTool itself, since Regulation isn't split per target.
   * Used only by ARC Link's Regulation imagery screen; never read by
   * normal ARC's own Regulation stage. Optional for the same
   * backward-compatibility reason as EncodingProfile.bodyImagery.
   */
  regulationBodyImagery?: BodyImagery | null;

  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 5: four new,
   * separate, optional mantras -- Stay Mantra, Acceptance Mantra,
   * Regulation Mantra, and the brand-new Bridge Mantra (there was no
   * pre-existing "Bridge Mantra" field anywhere in this codebase before
   * this task; it is built from scratch and lives here, at the end of
   * Regulation, never Encoding). All four are single, SHARED fields
   * (like regulationTool/presenceColor above), never split per layer --
   * Stay/Acceptance/Regulation are not per-layer stages today. See
   * arc/mantras.ts for their line-builders and arc/stageCopy.ts's
   * "stay"/"accept"/"regulate" cases for exact placement (Bridge Mantra
   * specifically is shown as part of "regulate"'s own copy, immediately
   * after Regulation Mantra, structurally before Encoding begins).
   * Optional/nullable, defaulting to null -- a legacy build without
   * these renders exactly as it always has, no empty screen/step.
   */
  stayMantra?: string | null;
  acceptanceMantra?: string | null;
  regulationMantra?: string | null;
  bridgeMantra?: string | null;

  /**
   * Coherent-architecture task (#1 "Add Value"): the "why" underneath
   * the whole build -- Value -> Identity -> Habit, e.g. "בריאות
   * וחופש". Build-global (like presenceColor/regulationTool), never
   * merged with desiredIdentity/supportiveState/beneficialAction --
   * BUILD keeps it a distinct, optional field, and normal ARC/LIVE
   * never requires it to be filled in. Optional for the same
   * backward-compatibility reason as linkSettings: every existing
   * ArcBuildProfile object literal (tests included) keeps compiling
   * unchanged, and a legacy build simply has no Value.
   */
  value?: string | null;

  /**
   * Coherent-architecture task (#2 "Separate Identity, Identity State
   * and Identity-Based Action"): HOW the trainee wants to feel/act
   * while expressing the identity (desiredIdentity, above) -- e.g.
   * desiredIdentity "אדם ממושמע" vs identityDesiredState "אנרגטיות
   * ונחישות". Deliberately its own field, never collapsed into
   * desiredIdentity or into identityEncoding.target (which stays the
   * identity itself, unchanged) -- a trainee may be able to perform
   * identityAction while NOT yet experiencing this state (e.g.
   * exercising while tired rather than energetic). Identity-only: the
   * state layer's own supportiveState already plays this role for
   * that layer, so there is no parallel "stateDesiredState" field.
   * Optional/never required, for the same backward-compatibility
   * reason as every other field in this block.
   */
  identityDesiredState?: string | null;

  /**
   * Coherent-architecture task (#5 "Separate Supporting Action from
   * Identity-Based Action"): a smaller action that creates better
   * conditions for the REAL Identity-Based Action (internalAction/
   * identityAction, above) -- e.g. "מדיטציה קצרה" before "פעילות
   * גופנית". Never a silent replacement for the Identity-Based Action
   * itself; BUILD and any future LIVE surface must always reconnect
   * the trainee to internalAction/identityAction afterward. Parallel
   * per-layer fields, like statePreventiveAction/identityPreventiveAction
   * above -- never mixed between layers. No habit-layer equivalent:
   * the habit layer's own beneficialAction stays the single, minimal
   * action it has always been.
   */
  stateSupportingAction?: string | null;
  identitySupportingAction?: string | null;

  /**
   * Coherent-architecture task (#6 "Limiting Belief and Bridge
   * Belief"): a thought/prediction that currently blocks action
   * (stateLimitingBelief/identityLimitingBelief -- e.g. "אני אפסיק
   * שוב, ולכן אין טעם להתחיל"), and a more believable, moderate,
   * progress-oriented reframe of it (stateBridgeBelief/
   * identityBridgeBelief -- e.g. "גם אימון קצר הוא התקדמות"). Kept as
   * two clearly separate fields, never merged into one "belief" field
   * or into identityEncoding.mantra (Identity Mantra, a different
   * sentence type -- see stateFutureOrientedMantra's doc below for the
   * full four-sentence-type distinction). Parallel per-layer fields,
   * like every other ARC-Map field on this profile; no habit-layer
   * equivalent (see stateSupportingAction's doc above).
   *
   * ARC-BUILD-to-LIVE connection task: the Limiting Belief (the
   * "interfering thought") is surfaced during Awareness, recognition-only,
   * on the new "interfering_thought_check" ArcStage -- see
   * arc/arcEngine.ts's resolveTargetLimitingBelief and that stage's own
   * doc. The Bridge Belief (the "empowering interpretation") is surfaced
   * later, during Encoding -- see resolveTargetBridgeBelief and
   * arc/stageCopy.ts's "encode" case. Never confused with each other:
   * the interfering thought is only ever recognized, never practised or
   * connected with; the empowering interpretation is the opposite --
   * something the trainee actively connects with, never shown during
   * Awareness/Acceptance.
   */
  stateLimitingBelief?: string | null;
  stateBridgeBelief?: string | null;
  identityLimitingBelief?: string | null;
  identityBridgeBelief?: string | null;

  /**
   * Balanced Alternative Interpretation task: an optional third Awareness
   * field, immediately after the Limiting Belief -- "another credible and
   * helpful way to understand the situation," never a replacement for the
   * original thought and never forcibly positive. Parallel per-layer
   * fields, like stateLimitingBelief/identityLimitingBelief just above;
   * no habit-layer equivalent. Surfaced during Awareness, recognition/
   * offering-only, on the new "balanced_alternative_interpretation"
   * ArcStage -- see arc/arcEngine.ts's resolveBeforeStay and
   * arc/stageCopy.ts's own case. Never confused with stateBridgeBelief/
   * identityBridgeBelief (the empowering interpretation, shown later
   * during Encoding) or with bridgeMantra (a completely separate,
   * single shared field shown at the end of Regulation) -- this field is
   * never merged into, and never replaces, either.
   */
  stateBalancedAlternativeInterpretation?: string | null;
  identityBalancedAlternativeInterpretation?: string | null;

  /**
   * Coherent-architecture task (#7/#8 "Future-Oriented Mantra"): the
   * direction of movement right now -- e.g. "אני אתחיל היום בצעד
   * קטן" -- distinct from Presence ("this is what's here now") and
   * from Identity Mantra (identityEncoding.mantra/stateEncoding.mantra
   * -- "the person I'm practicing becoming", said during Encoding).
   * ARC-BUILD-to-LIVE connection task: surfaced during Encoding, in the
   * existing mantra/identity part -- after the empowering interpretation
   * (Bridge Belief) and Value, alongside the older Identity Mantra (see
   * arc/futureOrientedMantra.ts / arc/stageCopy.ts's "encode" case).
   * Optional and never required -- omitted, Encoding's existing text is
   * completely unchanged. Parallel per-layer fields; no habit-layer
   * equivalent (see stateSupportingAction's doc above).
   */
  stateFutureOrientedMantra?: string | null;
  identityFutureOrientedMantra?: string | null;

  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 9: optional
   * imagery representing the desired emotion/state or identity --
   * per-layer, like the Future-Oriented Mantra above (Encoding is a
   * per-layer stage, unlike Stay/Accept/Regulate). Kept conceptually
   * separate from Energy Color (supports Presence), side observation
   * (creates distance from the current experience), and Action Imagery
   * (arc/successfulPerformance.ts, rehearses the beneficial action --
   * completely untouched by this field). Begins only during Encoding
   * (arc/stageCopy.ts's "encode" case), never earlier. "One shared
   * image for both" has no separate flag here -- see
   * arc/desiredImagery.ts's own doc for how BUILD's prefill + LIVE's
   * identical-description detection realize it without one. No
   * habit-layer equivalent (same reasoning as the Future-Oriented
   * Mantra above). Optional/nullable; a legacy build without these
   * skips the imagery segment cleanly, exactly as if it didn't exist.
   */
  stateDesiredImageryType?: "real" | "imagined" | null;
  stateDesiredImageryDescription?: string | null;
  identityDesiredImageryType?: "real" | "imagined" | null;
  identityDesiredImageryDescription?: string | null;

  /**
   * Coherent-architecture task (#12 "Internal Versus Practical
   * Barriers"): whether this layer's own mapped barrier is something
   * to work through internally, or a real external limitation
   * (injury, no time, no equipment, wrong location) -- see
   * arc/types.ts's BarrierType doc. When "practical",
   * statePracticalAlternative/identityPracticalAlternative holds the
   * trainee's own saved practical solution / habit adjustment /
   * minimal version / alternative action, never an emotional-
   * regulation instruction. null (a legacy build, or never answered)
   * is always treated as "not yet classified" -- BUILD and any future
   * LIVE surface must never assume either value. Parallel per-layer
   * fields; no habit-layer equivalent (see stateSupportingAction's doc
   * above).
   */
  stateBarrierType?: BarrierType | null;
  statePracticalAlternative?: string | null;
  identityBarrierType?: BarrierType | null;
  identityPracticalAlternative?: string | null;

  /**
   * ARC Goal task: an OPTIONAL extension to the Identity ARC's own
   * Action Imagery -- see arc/successfulPerformance.ts's
   * hasSuccessfulPerformanceConfigured/EXECUTION_QUALITY_PRESETS and
   * live/screens.tsx's ActionImageryScreen, which reads these fields
   * directly (never a copy of them). Identity-only, deliberately: this
   * is configured on Identity Build, general-purpose (usable by any
   * identity-layer session -- both a regular ARC identity session AND
   * ARC Goal's own referenced identity protocol get it "for free", the
   * same unmodified way), never a field on ArcGoal itself -- ARC Goal
   * only stores a REFERENCE to the identity ArcBuild
   * (ArcGoal.identityProtocolId), never a duplicate of its content (see
   * that interface's own doc for the full "reuse via reference" rule).
   * Every field here is fully optional -- when none of them are set for
   * this identity target, Action Imagery renders EXACTLY as it always
   * has (a single "דמיין את עצמך מתחיל X" instruction, no quality
   * clause, no Result Imagery, no mantra): this section can never
   * "leak" into a session that never configured it, satisfying "do not
   * force goal fields into regular ARC."
   *
   * - identitySuccessfulPerformanceAction: an optional override for
   *   which action is imagined here -- when null/blank, falls back to
   *   identityAction itself (the same action the "act" stage already
   *   performs), never invented separately.
   * - identitySuccessfulPerformanceQualities: a subset of
   *   EXECUTION_QUALITY_PRESETS (e.g. ["מדויקת","עקבית","מקצועית"]),
   *   read into the fixed Hebrew clause "אתה מבצע את הפעולה בצורה X, Y
   *   ו-Z."
   * - identitySuccessfulPerformanceCustomQuality: one additional
   *   trainee-written quality, appended alongside the presets above.
   * - identitySuccessfulPerformanceResult: the desired successful
   *   result -- when blank, the whole Result Imagery step is skipped
   *   entirely (nothing to imagine).
   * - identitySuccessMantra: distinct from identityEncoding.mantra
   *   (Identity Mantra -- "who I am practising being") and from
   *   stateFutureOrientedMantra/identityFutureOrientedMantra
   *   (Future-Oriented Mantra -- "the direction I'm moving toward
   *   now") -- this is confidence in the success of THIS upcoming
   *   action/result specifically, shown only after Result Imagery, and
   *   only ever if configured ("Do not display a mantra that the user
   *   did not configure").
   */
  identitySuccessfulPerformanceAction?: string | null;
  identitySuccessfulPerformanceQualities?: string[] | null;
  identitySuccessfulPerformanceCustomQuality?: string | null;
  identitySuccessfulPerformanceResult?: string | null;
  identitySuccessMantra?: string | null;
}

/**
 * ARC Builds task: a fresh, fully empty ArcBuildProfile for a brand-new
 * ArcBuild -- every field null/false exactly like a trainee who hasn't
 * answered anything yet, so the SAME BUILD-ARC wizard step machinery
 * (build/profileWizard.ts's shouldShowProfileStep/getFirstProfileStep)
 * that already knows how to walk an empty draft works completely
 * unchanged for a new standalone ArcBuild. programPath is a fixed,
 * unused placeholder (see ArcBuild's own doc, above): no ArcBuild is
 * ever validated against program/'s PROGRAM_DEFINITIONS.
 */
export function createEmptyArcBuildProfile(): ArcBuildProfile {
  return {
    programPath: "custom_arc_build",
    identityActionNeeded: false,
    goal: null,
    presenceColor: null,
    interferingState: null,
    supportiveState: null,
    challengeContext: null,
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    stateEncoding: null,
    internalAction: null,
    internalActionBodyCue: null,
    stateDwellTimes: null,
    desiredIdentity: null,
    identityChallengeContext: null,
    identityInterferingEmotion: null,
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
    identityEncoding: null,
    identityAction: null,
    identityActionBodyCue: null,
    identityDwellTimes: null,
    habit: null,
    beneficialAction: null,
    beneficialActionBodyCue: null,
    preventiveAction: null,
    habitEncoding: null,
    regulationTool: null,
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
    negativeActionReductionEnabled: false,
    linkSettings: null,
    regulationBodyImagery: null,
    stayMantra: null,
    acceptanceMantra: null,
    regulationMantra: null,
    bridgeMantra: null,
    value: null,
    identityDesiredState: null,
    stateSupportingAction: null,
    identitySupportingAction: null,
    stateLimitingBelief: null,
    stateBridgeBelief: null,
    identityLimitingBelief: null,
    identityBridgeBelief: null,
    stateBalancedAlternativeInterpretation: null,
    identityBalancedAlternativeInterpretation: null,
    stateFutureOrientedMantra: null,
    identityFutureOrientedMantra: null,
    stateDesiredImageryType: null,
    stateDesiredImageryDescription: null,
    identityDesiredImageryType: null,
    identityDesiredImageryDescription: null,
    stateBarrierType: null,
    statePracticalAlternative: null,
    identityBarrierType: null,
    identityPracticalAlternative: null,
    identitySuccessfulPerformanceAction: null,
    identitySuccessfulPerformanceQualities: null,
    identitySuccessfulPerformanceCustomQuality: null,
    identitySuccessfulPerformanceResult: null,
    identitySuccessMantra: null,
  };
}

/** Same stable-id-string pattern already used for ScheduledRoutine (arc/routines.ts's generateRoutineId) -- unique per build, never derived from array position, so an ArcBuild's identity survives reordering/deletion of any other build. */
export function generateArcBuildId(): string {
  return `arcbuild-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * ARC Goal task: one row of the ARC Goal linking page (spec section 3)
 * -- connects an interfering internal state to the supportive-state ARC
 * protocol needed in response, and the short bridge/trigger action that
 * carries the trainee from that protocol into the goal's Identity ARC.
 * `supportiveProtocolId` is a REFERENCE to an existing ArcBuild (its
 * `target` should be "state" -- resolved by whichever layer its own
 * needsState/needsIdentity/needsHabit flags mark active; the ARC Goal
 * build UI only ever offers state-targeted builds here) -- never a copy
 * of that build's content, so editing the referenced protocol later
 * (e.g. from `/build`) is immediately reflected here, and the same
 * supportive-state protocol may be reused by several mappings/goals at
 * once. `supportiveAction` is deliberately its own field, distinct from
 * that protocol's own internalAction: it's the lightweight, mapping-
 * level bridge shown once the supportive-state protocol's own Encoding
 * is complete, immediately before the trainee auto-continues into the
 * goal's Identity ARC (see arc/arcGoalEngine.ts) -- never the protocol's
 * full "act" stage.
 */
/**
 * ARC Goal task (Urge/Supportive-State routes): how a mapping's bridge
 * protocol runs live -- "full" always runs the Full protocol (state- or
 * habit-adapted engine run, see arc/arcGoalEngine.ts), "mini" always
 * runs the linked Mini ARC inline (never navigates to /mini-arc/live,
 * see EmbeddedMiniArcScreen), "choose" asks the trainee live, once per
 * session, via the new execution_mode_choice stage. Optional on
 * existing ArcGoalInterferingMapping rows -- missing/undefined always
 * normalizes to "full" (arc/arcGoals.ts's normalizeArcGoal), matching
 * exactly what every pre-existing mapping already does today.
 */
export type ExecutionMode = "full" | "mini" | "choose";

export interface ArcGoalInterferingMapping {
  id: string;
  interferingState: string;
  supportiveProtocolId: string;
  supportiveAction: string;
  /**
   * ARC Goal task (Mini ARC integration): an optional REFERENCE to an
   * existing MiniArcBuild (arc/miniArc.ts) -- never a copy of its
   * content. null means no Mini ARC is linked to this mapping, so
   * executionMode is always treated as "full" regardless of its own
   * saved value (see resolveExecutionMode, arc/arcGoalEngine.ts).
   */
  miniArcId?: string | null;
  executionMode?: ExecutionMode;
  /** Per-mapping override of ArcGoal.identityProtocolId/goalAction below -- null (the default) falls back to the goal-level field, so most mappings never need to set these. */
  identityProtocolId?: string | null;
  goalAction?: string | null;
}

/**
 * ARC Goal task (Urge route, spec sections 8-9, 15): one row of the ARC
 * Goal Urge mapping -- connects a trigger/urge to its UrgeArc protocol
 * (arc/types.ts's UrgeArc, below) and optionally a Mini ARC, exactly
 * parallel to ArcGoalInterferingMapping's own reference-only shape.
 * `need` is this mapping's own tag (one of the Need Identification
 * presets, or a custom need, or null) -- used only to preview this
 * mapping's UrgeArc.beneficialAlternativeAction once a matching need is
 * identified (spec section 5); it never gates or auto-selects this
 * mapping at urge_select, which the trainee always chooses explicitly.
 */
export interface ArcGoalUrgeMapping {
  id: string;
  urgeArcId: string;
  need: string | null;
  miniArcId?: string | null;
  executionMode?: ExecutionMode;
  identityProtocolId?: string | null;
  goalAction?: string | null;
}

/**
 * ARC Goal task (Urge route, spec section 9): a lightweight, standalone
 * protocol for a specific urge -- deliberately NOT a habit-target
 * ArcBuild ("do not treat the urge itself as an ordinary emotion") and
 * deliberately WITHOUT its own identityProtocolId/goalAction (kept at
 * the ArcGoalUrgeMapping level instead, mirroring how
 * ArcGoalInterferingMapping already keeps those off the referenced
 * supportive-state ArcBuild) -- so the same UrgeArc can be reused by
 * several different mappings/goals, each potentially bridging into a
 * different Identity ARC, without ever duplicating this protocol's own
 * content (spec section 19's "a protocol may support several targets
 * or goals", carried over from the original ARC Goal architecture).
 * Any number of these can exist at once, exactly like MiniArcBuild/
 * ArcBuild (data/storage.ts's loadUrgeArcs/saveUrgeArcs).
 */
export interface UrgeArc {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The interfering action/habit this urge drives toward -- recognition-only, never something LIVE asks the trainee to evoke or intensify. */
  interferingAction: string;
  mappedTriggers: string[];
  underlyingNeeds: string[];
  /**
   * ARC Urge Stop Action/Encoding task: this urge's own optional Stop
   * Action ("פעולת עצירה") -- a short, concrete action that safely
   * interrupts the automatic behavior and creates a moment of choice
   * (e.g. "להניח את הטלפון"), never an instruction to evoke, intensify,
   * or hold the urge itself. When set, shown on its own dedicated LIVE
   * screen right after this urge is selected/identified and before
   * Awareness (sensation_check) -- see arc/arcGoalEngine.ts's
   * getUrgeStopActionCopy/resolveUrgeEntryUiStage. null (the default,
   * and every UrgeArc saved before this became a dedicated screen) means
   * no Stop Action screen is shown for this urge at all -- the shared,
   * goal-level third-person-imagery/Stop prefix (which always runs once
   * per session regardless) is the only Stop moment, exactly as before
   * this task. Optional for legacy programs by construction.
   */
  stopCue: string | null;
  regulationAnchor: string;
  acceptanceContent: string | null;
  /**
   * ARC Urge Stop Action/Encoding task: this urge's own optional
   * Encoding body-language cue -- reuses the exact same concept as
   * identity/state's own EncodingProfile.bodyLanguageCue (never a
   * second, parallel Encoding system), surfaced through
   * arc/arcGoalEngine.ts's urgeArcToProfile onto ArcBuildProfile
   * .habitEncoding. null (the default) means the habit layer's Encoding
   * stage falls back to its existing generic body-language line,
   * unchanged.
   */
  bodyLanguageCue: string | null;
  /**
   * ARC Urge Stop Action/Encoding task: this urge's own optional short
   * Encoding mantra -- reuses EncodingProfile.mantra, the SAME field
   * identity/state Encoding already reads; deliberately never merged
   * with Identity Mantra (identityEncoding.mantra) or any other mantra
   * type in this app -- each stays its own independent, optional field.
   * null (the default) means no mantra line is added during this urge's
   * Encoding stage.
   */
  encodingMantra: string | null;
  /** The bridge action shown once this urge's own Full protocol run reaches (but does not itself perform) "act" -- see urge_action_confirm, arc/arcGoalEngine.ts. */
  beneficialAlternativeAction: string;
}

/**
 * ARC Goal task: a goal-oriented protocol connecting supportive states,
 * identity, action and result (spec sections 1-2). Any number of these
 * can exist at once, exactly like ArcBuild above (data/storage.ts's
 * loadArcGoals/saveArcGoals, a plain array keyed by its own stable id,
 * never by array position).
 *
 * Deliberately reference-only, never duplicating content (spec's own
 * "Reuse existing protocols through references instead of duplicating
 * their content" architecture rule): `identityProtocolId` points at an
 * existing ArcBuild (target "identity"), and each mapping in
 * `interferingMappings` points at an existing ArcBuild (target "state").
 * Successful-performance imagery, Result Imagery, and the Success
 * Mantra are NOT duplicated onto ArcGoal either -- they live entirely on
 * the referenced identity ArcBuildProfile's own
 * identitySuccessfulPerformance-prefixed fields and identitySuccessMantra
 * (see that interface's own doc), since Successful Performance is a general
 * Identity Build extension, not an ArcGoal-specific concept. A single
 * identity protocol (and a single supportive-state protocol) may be
 * referenced by several different ArcGoalInterferingMappings, several
 * different ArcGoals, or both at once -- editing the referenced
 * ArcBuild is immediately reflected everywhere it's referenced, with no
 * separate "keep in sync" step needed.
 *
 * `goalAction`/`desiredResult` are the goal's OWN fields, distinct from
 * the identity protocol's own identityAction -- per the spec's stated
 * hierarchy (Goal -> Identity protocol -> Supportive states -> Goal-
 * related action -> Desired result), the goal-related action is the
 * outermost, real-world action the trainee performs once the Identity
 * ARC (imagined practice) is complete -- see arc/arcGoalEngine.ts's
 * final "goal action" step, reached only after the outer identity run's
 * own "complete" stage.
 */
export type FourWeekProgramWeekNumber = 1 | 2 | 3 | 4;
export type FourWeekProgramWeekStatus = "not_started" | "active" | "completed";

/** One "I extended this week" event -- keeps the original planned end date visible even after it's been pushed out, per the Four-Week Program task's "preserve all completed practices and reflections" / never silently losing history. */
export interface ArcGoalWeekDateExtension {
  extendedAt: string;
  previousPlannedEndDate: string | null;
  newPlannedEndDate: string | null;
}

/**
 * Four-Week Program task correction: ARC Link/Mini ARC Link are their
 * OWN distinct guided linking practices, never interchangeable with the
 * Full ARC/Mini ARC session they lead into -- "kind" now names exactly
 * which of the five real practice types was actually run (plus the
 * generic real-world action confirmation and an ARCHI-support-used
 * flag), so "Track ARCHI ARC Link practices and Full ARC completions
 * separately" / "Track Mini ARC Link practices and Mini ARC completions
 * separately" is a real, queryable distinction on the record itself,
 * never just a difference in `label` text. "identity_recall" is Week
 * 3's own inline recall (never a full ARC Link or Full ARC session).
 */
export interface ArcGoalWeekPracticeRecord {
  id: string;
  kind: "full_arc" | "arc_link" | "mini_arc" | "mini_arc_link" | "identity_recall" | "action" | "archi_support";
  label: string;
  occurredAt: string;
}

/** The four weekly-reflection questions (spec section 9), answered once per week, right before confirming that week complete. */
export interface ArcGoalWeekReflection {
  whatHelped: string | null;
  whatWasHard: string | null;
  identityEvidence: string | null;
  readyToReduceSupport: boolean | null;
  answeredAt: string;
}

/**
 * Four-Week Program task: one week's own configuration + live progress.
 * plannedStartDate/plannedEndDate are the ONLY thing that unlocks
 * nothing by themselves -- reaching plannedEndDate only ever triggers a
 * decision prompt (arc/fourWeekProgram.ts's own doc), never automatic
 * advancement. datesManuallyEdited marks a week whose own dates the
 * trainee has directly edited, so a later cascade recalculation (after
 * an earlier week's dates change) skips it instead of silently
 * overwriting a deliberate choice.
 */
export interface ArcGoalProgramWeek {
  weekNumber: FourWeekProgramWeekNumber;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  datesManuallyEdited: boolean;
  practiceFrequency: string | null;
  recommendedPractice: string | null;
  remindersEnabled: boolean;
  reminderNotificationId: string | null;
  reminderScheduledFor: string | null;
  completionRequirement: string | null;
  notes: string | null;
  status: FourWeekProgramWeekStatus;
  actualCompletedAt: string | null;
  dateExtensions: ArcGoalWeekDateExtension[];
  practiceRecords: ArcGoalWeekPracticeRecord[];
  reflection: ArcGoalWeekReflection | null;
}

/**
 * Four-Week Program task, section 10 ("Optional support and return
 * context"): saved onto the ArcGoal itself right before the trainee
 * leaves the four-week LIVE dashboard for a support flow (Full ARC,
 * Mini ARC, ARC Link...) -- so where that flow ends up returning to can
 * be resolved even if the route params it was ALSO launched with
 * somehow don't survive the round trip (belt-and-suspenders; the route
 * params are the primary mechanism -- see live/LiveSessionScreen.tsx
 * and live/MiniArcLiveScreen.tsx's own fourWeekGoalId handling).
 */
export interface ArcGoalSupportReturnContext {
  week: FourWeekProgramWeekNumber;
  actionLabel: string;
  savedAt: string;
}

/**
 * Four-Week Program task: an ArcGoal's own OPTIONAL identity-and-habit
 * program (spec's "Core order": Life Manifest -> ARC Goal -> four-week
 * program -> sub-goals/targets in a later phase). `enabled` defaults to
 * false/null (see ArcGoal.fourWeekProgram's own doc) -- never silently
 * turned on for a legacy goal; the trainee always enables it explicitly
 * from the BUILD screen's own "תוכנית ארבעת השבועות" section.
 *
 * linkedMiniArcId is this program's own goal-level Mini ARC reference
 * (weeks 2-3), separate from any per-mapping miniArcId already used
 * elsewhere on ArcGoal -- set once, from the LIVE dashboard or BUILD,
 * never duplicated as a second Mini ARC per week.
 *
 * readyForSubGoalActivation is set true the moment Week 4 is confirmed
 * complete -- a safe integration point for the later sub-goal/calendar
 * phase to read (per this task's "prepare safe integration points,
 * without implementing" scope) and currently otherwise inert: nothing
 * in this phase reads it to auto-activate anything.
 */
export interface ArcGoalFourWeekProgram {
  enabled: boolean;
  currentWeek: FourWeekProgramWeekNumber;
  linkedMiniArcId: string | null;
  weeks: [ArcGoalProgramWeek, ArcGoalProgramWeek, ArcGoalProgramWeek, ArcGoalProgramWeek];
  startedAt: string | null;
  completedAt: string | null;
  readyForSubGoalActivation: boolean;
  returnContext: ArcGoalSupportReturnContext | null;
}

export interface ArcGoal {
  id: string;
  name: string;
  description: string | null;
  value: string | null;
  goalAction: string;
  desiredResult: string;
  identityProtocolId: string | null;
  interferingMappings: ArcGoalInterferingMapping[];
  /** ARC Goal task (Urge route): parallel to interferingMappings above, one row per mapped urge. Defaults to [] for every ArcGoal saved before this field existed -- see arc/arcGoals.ts's normalizeArcGoal. */
  urgeMappings: ArcGoalUrgeMapping[];
  /**
   * Four-Week Program task: null for every ArcGoal saved before this
   * field existed, and for every new ArcGoal until the trainee
   * explicitly enables it -- see arc/arcGoals.ts's normalizeArcGoal and
   * createEmptyArcGoal below. A null value means this goal behaves
   * EXACTLY as it always has: /arc-goal/select routes straight to
   * /arc-goal/live/[goalId], never through the new four-week dashboard.
   */
  fourWeekProgram?: ArcGoalFourWeekProgram | null;
  /**
   * Sub-goal↔ARC Goal connection task: an optional back-REFERENCE to the
   * Life Manifest Sub-goal (arc/lifeManifest.ts's SubGoal.id) this ArcGoal
   * was created for or has been linked to, when any -- null for every
   * ArcGoal created outside Life Manifest (the overwhelming majority) and
   * for every ArcGoal saved before this field existed (see
   * arc/arcGoals.ts's normalizeArcGoal). Never the other direction: the
   * Sub-goal's own connectedArcGoalId is the source of truth for "which
   * ArcGoal is this Sub-goal linked to" -- this field only lets the ArcGoal
   * screen show its owning context and a way back, and is kept in sync by
   * the same UI action that sets/clears the Sub-goal's own link (see
   * build/LifeManifestSubGoalScreen.tsx). Deleting an ArcGoal, or
   * unlinking it from its Sub-goal, never deletes the other side.
   */
  lifeManifestSubGoalId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Same stable-id-string pattern as generateArcBuildId. */
export function generateArcGoalId(): string {
  return `arcgoal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same id-pattern for a mapping row, scoped within its own ArcGoal (never reused across goals). */
export function generateArcGoalMappingId(): string {
  return `arcgoalmap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same id-pattern for an urge-mapping row -- a distinct prefix from generateArcGoalMappingId so the two are never confused when debugging stored data. */
export function generateArcGoalUrgeMappingId(): string {
  return `arcgoalurgemap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same id-pattern for a Four-Week Program practice/action record, scoped within its own week. */
export function generateArcGoalWeekPracticeRecordId(): string {
  return `arcgoalweekpractice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same stable-id-string pattern as generateArcBuildId/generateMiniArcId. */
export function generateUrgeArcId(): string {
  return `urgearc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh, empty ArcGoal for a brand-new goal -- every optional field null/[] exactly like a trainee who hasn't configured anything yet. */
export function createEmptyArcGoal(id: string, name: string, now: string): ArcGoal {
  return {
    id,
    name,
    description: null,
    value: null,
    goalAction: "",
    desiredResult: "",
    identityProtocolId: null,
    interferingMappings: [],
    urgeMappings: [],
    fourWeekProgram: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** A fresh, empty UrgeArc for a brand-new urge protocol. */
export function createEmptyUrgeArc(id: string, name: string, now: string): UrgeArc {
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    interferingAction: "",
    mappedTriggers: [],
    underlyingNeeds: [],
    stopCue: null,
    regulationAnchor: "",
    acceptanceContent: null,
    bodyLanguageCue: null,
    encodingMantra: null,
    beneficialAlternativeAction: "",
  };
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

/**
 * ARC Builds task: the unit BUILD and LIVE now operate on -- a single,
 * independently named, independently editable ARC protocol
 * configuration. Any number of these can exist at once (data/storage.ts's
 * loadArcBuilds/saveArcBuilds, a plain array, the same "keyed by its own
 * stable id, never by array position" pattern already used for
 * ScheduledRoutine), with no fixed limit and no requirement that one
 * exists before another can be created.
 *
 * Replaces the old two-step BUILD-GOAL -> BUILD-ARC flow, where a
 * single global ArcBuildProfile (below) was assigned a programPath via
 * a separately-persisted ArcProgramSelection and paced by program/'s
 * week-based ArcProgramProgress (above). An ArcBuild is fully
 * self-contained instead: `profile` is the SAME ArcBuildProfile shape
 * BUILD-ARC already produced (Desired State/Identity, their ARC Maps,
 * Encoding, actions, Action Body Cues, dwell times, Negative Action
 * configuration -- see that interface's own fields, none renamed or
 * removed), and `needsState`/`needsIdentity`/`needsHabit`/
 * `needsIdentityImmediately` are this ONE build's own needs-assessment
 * answers -- the same four fields program/programTypes.ts's
 * ArcProgramSelection already carries (minus its programPath, which
 * doesn't apply here), duplicated as plain fields rather than imported
 * from program/ to avoid a circular import (program/ already imports
 * FROM arc/types.ts, never the reverse). profile.programPath itself is
 * set to a fixed, unused placeholder for every ArcBuild -- LIVE resolves
 * an ArcBuild session's activeLayers directly from its own configured
 * fields (arc/arcEngine.ts's deriveActiveLayersForArcBuild), never from
 * program/'s week-based ArcProgramProgress, so no real program/
 * validation ever reads it. program/'s week-based progression and the
 * Stats screen are untouched and keep working for any pre-existing
 * legacy single-profile data, but are not wired into the ArcBuild flow.
 */
export interface ArcBuild {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  needsState: boolean;
  needsIdentity: boolean;
  needsHabit: boolean;
  needsIdentityImmediately: boolean;
  profile: ArcBuildProfile;
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

  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 6: the
   * session-specific answer to "מה הציף אותך או עורר את החוויה
   * הנוכחית?" -- deliberately broader than triggerContext's own "what
   * triggered this" framing: this may be a real event, something
   * imagined, a future expectation/scenario, a memory/internal image,
   * or a thought that appeared with no clear external event at all.
   * Set once on "trigger_context" (same stage, same position, strictly
   * before "observer_pause" and before ARC Thought -- nothing about
   * this stage's placement/routing changes), never re-asked, never
   * written back to ArcBuildProfile. Optional (null when left blank).
   */
  currentTriggerDescription: string | null;
  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 6: the
   * session-specific answer to "איזו מחשבה, פרשנות, אמונה או תמונה
   * עתידית מפריעה מופיעה עכשיו?" -- an interpretation, limiting belief,
   * imagined scenario, prediction, thought about another person, or
   * automatic thought, never presented as an objective fact. Set once
   * on "trigger_context" alongside currentTriggerDescription above.
   * When a BUILD-configured interfering thought (Limiting Belief)
   * exists for the resolved layer, the screen prefills this field with
   * it as an editable suggestion -- keeping it unedited, editing it, or
   * replacing it all stay purely session-specific: this field is never
   * written back onto the BUILD value. Optional (null when left blank).
   */
  currentInterferingThought: string | null;
  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 7: the
   * session-only answer to "כיצד תרצה להתבונן בעצמך מהצד?" -- "present"
   * (ברגע הזה) or "previous" (בסיטואציה שהתרחשה). Drives
   * arc/stageCopy.ts's "observer_pause" copy INSTEAD of the older
   * triggerKnown known/unknown fork (triggerKnown itself is untouched
   * structurally -- still set by trigger_context -- simply no longer
   * consulted for this stage's wording, since a trigger can now be
   * imagined/future/thought-only, so "was a specific trigger named" is
   * no longer the right axis for "should this be observed as present or
   * as a past situation"). null means "not yet answered" -- see
   * live/screens.tsx's SideObservationModeScreen.
   */
  sideObservationMode: "present" | "previous" | null;

  /**
   * Urge-check task: the session-only answer to "האם יש כרגע דחף לבצע
   * את ההרגל המפריע?" -- set once on "urge_check" (reactive_urge only)
   * and never re-asked within the same session. null means "not yet
   * answered" (the screen is still showing); true/false are both fully
   * valid, explicitly-submitted answers. Never persisted to
   * ArcBuildProfile or any saved program state -- applies only to THIS
   * LIVE session, exactly like triggerContext above.
   */
  hasUrge: boolean | null;
  /**
   * Urge-check task: the session-only answer to "מה אתה באמת צריך
   * עכשיו?" (need_identification, reactive_urge + hasUrge only) -- one
   * of the seven preset need labels, the trainee's own short custom text
   * (when "אחר" is chosen), or the "אני עדיין לא יודע" sentinel (see
   * live/liveEventAdapter.ts's IDENTIFIED_NEED_UNKNOWN) when the trainee
   * explicitly declines to identify one. null means "not yet answered"
   * (the screen is still showing) -- NEVER conflated with "אני עדיין לא
   * יודע", which is itself a real, continuing answer. Session-only,
   * never written back to ArcBuildProfile and never used to change the
   * saved beneficial action -- see arc/stageCopy.ts's "act" case for
   * where it's optionally surfaced (mentioned, never substituted) once
   * the beneficial action is presented.
   */
  identifiedNeed: string | null;

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

  /**
   * ARC-BUILD-to-LIVE connection task: the "interfering_thought_check"
   * stage's own answer -- "present" ("כן, היא נמצאת עכשיו"), "absent"
   * ("לא"), or "different" ("מופיעה מחשבה אחרת", with an optional
   * session-specific thought in interferingThoughtSessionText below).
   * null only before the stage has been answered at all (also its
   * "not yet reached"/"skipped because nothing was configured" value).
   * Once non-null, arc/arcEngine.ts's "stay" transition never re-routes
   * through the check stage again this session, even on a later loop
   * iteration -- the trainee is asked at most once per session.
   */
  interferingThoughtChoice: "present" | "absent" | "different" | null;
  /**
   * The optional free-text answer to "מופיעה מחשבה אחרת" -- session-only,
   * exactly like triggerContext never touches the BUILD-configured
   * Challenge Context: this NEVER overwrites
   * ArcBuildProfile.stateLimitingBelief/identityLimitingBelief. null
   * unless interferingThoughtChoice is "different" and the trainee typed
   * something.
   */
  interferingThoughtSessionText: string | null;

  /**
   * Balanced Alternative Interpretation task: whether the new
   * "balanced_alternative_interpretation" stage has already been shown
   * this session -- the same "shown at most once per session" role
   * interferingThoughtChoice plays for the Belief screen, but as a plain
   * flag rather than a real answer, since this stage takes no input
   * (recognition/offering-only, like presence_grounding). false until
   * the trainee continues past it once; never reset, so a later loop
   * iteration (the accept -> sensation_check recheck, or
   * reactive_transition_check's own retry loop) never shows it again --
   * see arc/arcEngine.ts's resolveBeforeStay.
   */
  balancedAlternativeInterpretationSeen: boolean;

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

/**
 * Urge-check task: the explicit sentinel ArcLiveState.identifiedNeed
 * carries when the trainee chooses "אני עדיין לא יודע" on
 * need_identification -- a real, continuing answer (never confused with
 * "not yet answered", i.e. null), but never a genuine identified need
 * either. Callers that DISPLAY the need (e.g. arc/stageCopy.ts's "act"
 * case) must skip this exact value rather than showing it as if it were
 * one; callers that only need to know whether the stage was ANSWERED
 * (arc/arcEngine.ts's "need_identification" case) treat it exactly like
 * any other non-null value.
 */
export const IDENTIFIED_NEED_UNKNOWN = "אני עדיין לא יודע";

export function createEmptyLiveState(): ArcLiveState {
  return {
    triggerType: null,
    selectedTarget: null,
    triggerContext: null,
    triggerKnown: null,
    currentTriggerDescription: null,
    currentInterferingThought: null,
    sideObservationMode: null,
    hasUrge: null,
    identifiedNeed: null,
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
    interferingThoughtChoice: null,
    interferingThoughtSessionText: null,
    balancedAlternativeInterpretationSeen: false,
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

/**
 * build/profileWizard.ts
 *
 * Pure (React-free) logic shared by the three phases of ONE ArcBuild's
 * editor (build/ArcBuildEditorScreen.tsx, route /build/[id]) -- GOAL,
 * STATE ARC, and IDENTITY ARC. These are NOT separate storage systems
 * or separate architectures: all three operate on the same
 * ArcBuildProfile, the same ProfileDraft shape, and the same
 * step-machinery pattern below (a fixed step order, a "should this
 * step show" gate, a "walk to the next visible step" function) --
 * just different step-order arrays and completeness checks over that
 * one shape, orchestrated in sequence by ArcBuildEditorScreen's own
 * `phase` state rather than as separate routes/screens (ARC Builds
 * task: the old two-route BUILD-GOAL -> BUILD-ARC flow, and the old
 * global single-profile storage it saved onto, are both gone -- every
 * ArcBuildProfile below now belongs to exactly one independently
 * created/edited/renamed/deleted ArcBuild, arc/types.ts).
 *
 * GOAL_STEP_ORDER defines the positive direction only -- Desired
 * Habit -> Identity -> Desired State -- plus the needs-assessment
 * questions (needsState / needsIdentityImmediately / needsIdentity)
 * that feed program/selection.ts's resolveCurrentPreset (still used to
 * resolve a value for ArcBuildProfile.programPath's shape, even though
 * no ArcBuild's programPath is ever validated against program/'s real
 * PROGRAM_DEFINITIONS -- see arc/types.ts's ArcBuild doc) and the
 * general-purpose fields every trainee needs regardless of which ARC
 * Map(s) end up mapped (preventiveAction, regulationTool -- see the
 * design note on GOAL_STEP_ORDER below for why these stay in GOAL
 * rather than ARC). There is no separate free-text "goal" question any
 * more -- the ArcBuild's own name (given once at creation) already
 * identifies it.
 *
 * STATE_ARC_STEP_ORDER/IDENTITY_ARC_STEP_ORDER create an ARC Map
 * around a Desired State/Identity the GOAL phase already established,
 * earlier in the SAME editing session (not a separately reached
 * screen/object any more). A trainee can have UP TO TWO independently
 * mappable targets -- the state layer's Desired State (supportiveState)
 * and the identity layer's Desired Identity (desiredIdentity), e.g. a
 * "Focus" state map and a separate "Discipline" identity map on the
 * SAME ArcBuild. STATE_ARC_STEP_ORDER and IDENTITY_ARC_STEP_ORDER
 * are the same shape (Challenge Context -> Interfering State -> Encoding
 * cues) over two parallel field sets on the one ProfileDraft --
 * challengeContext/interferingState/stateMantra/stateBodyLanguageCue
 * for state, identityChallengeContext/identityInterferingEmotion/
 * identityMantra/identityBodyLanguageCue for identity -- never two
 * copies of the same target, never a shared field two targets fight
 * over. build/ArcBuildEditorScreen.tsx is responsible for walking both
 * phases in sequence whenever both are needed, and for never
 * discarding one target's fields while saving the other's (both live
 * on the one `draft` object the whole screen session, so
 * buildProfileFromDraft always writes both back, whichever one was
 * just edited).
 *
 * identityAction was previously its own question ("מה הפעולה שמבטאת
 * את הזהות הזו?"), semantically duplicating beneficialAction ("מה
 * הפעולה המיטיבה שתרצה לבצע במקומו?") -- both were really asking for
 * the same "Desired Habit" behavioral target. identityAction is no
 * longer asked; buildProfileFromDraft derives it from beneficialAction
 * so the field arc/arcEngine.ts's resolveEncodingTarget already reads
 * for the identity layer keeps working unchanged.
 *
 * selectionFromDraft's returned ArcProgramSelection-shaped needs
 * (needsState/needsIdentity/needsHabit/needsIdentityImmediately) are
 * this ONE ArcBuild's own fields now (arc/types.ts's ArcBuild), never
 * a second, separately-persisted global ArcProgramSelection -- see
 * build/ArcBuildEditorScreen.tsx's finishAndSave.
 */

import type { ArcBuildProfile, DwellTimes, EncodingProfile } from "../arc/types.ts";
import type { ArcProgramSelection, KnownProgramPath } from "../program/programTypes.ts";
import { deriveNeedsFromLegacyProgramPath, resolveCurrentPreset } from "../program/selection.ts";
import { clampDwellSeconds, DEFAULT_DWELL_TIMES } from "../arc/dwellTimes.ts";
import {
  isNegativeActionReductionEnabled,
  NEGATIVE_ACTION_MAX_DURATION_MINUTES,
  NEGATIVE_ACTION_MIN_DURATION_MINUTES,
} from "../program/engine.ts";

const LEGACY_PROGRAM_PATHS: KnownProgramPath[] = [
  "standard_3_week",
  "advanced_2_week",
  "identity_habit_2_week",
  "habit_only_1_week",
];

function isKnownLegacyProgramPath(programPath: string): programPath is KnownProgramPath {
  return (LEGACY_PROGRAM_PATHS as string[]).includes(programPath);
}

export type ProfileStep =
  | "goal"
  /**
   * Presence Color task: "באיזה צבע מתמלאת הנוכחות שלך?" -- this
   * ArcBuild's own predefined Presence Color, chosen once here during
   * BUILD and never re-asked during LIVE (see arc/types.ts's
   * ArcBuildProfile.presenceColor doc). Required, not optional (see
   * isGoalDraftComplete below) -- a legacy ArcBuild saved before this
   * field existed simply has an empty draft value for it and so cannot
   * pass GOAL-phase completeness again until this step is answered,
   * which is how "ask the user to complete the new Presence Color field
   * when editing an old ArcBuild" is satisfied without any bespoke
   * migration-prompt logic.
   */
  | "presenceColor"
  /**
   * Negative Action reduction task: the explicit opt-in for the
   * OPTIONAL Negative Action Timer tool -- decides whether "habit" and
   * "negativeActionDuration" below are even asked (see
   * shouldShowProfileStep). Kept separate from the "habit"
   * DevelopmentLayer/needs-assessment questions further down: enabling
   * this tool has nothing to do with which layers end up active.
   */
  | "negativeActionEnabledAsk"
  | "habit"
  /**
   * Negative Action reduction task: the current target Habit's own
   * real timer duration, restricted to 1-15 minutes (chip picker, no
   * free numeric entry) -- the ONE place this is configured (LIVE never
   * asks for it again; see arc/types.ts's
   * ArcBuildProfile.negativeActionBaseDurationMinutes doc). Only shown
   * when negativeActionEnabledAsk was answered "כן".
   */
  | "negativeActionDuration"
  | "beneficialAction"
  /**
   * Action Body Cue task: the physical cue the trainee performs and
   * maintains WHILE actually doing beneficialAction (also reused, like
   * beneficialAction itself, for the identity layer's identityAction --
   * see the module doc). Deliberately separate from Encoding's own
   * Body-Language Cue (stateBodyLanguageCue/identityBodyLanguageCue,
   * further down) -- Body Cue belongs to the "act" stage (Action
   * Imagery + the real timed Action), never to Encoding. Always
   * optional (see OPTIONAL_TEXT_STEPS in build/ArcBuildEditorScreen.tsx).
   */
  | "beneficialActionBodyCue"
  | "needsState"
  | "needsIdentityImmediately"
  | "needsIdentityExplicit"
  | "desiredIdentity"
  | "supportiveState"
  | "internalAction"
  /** The state layer's own Action Body Cue, parallel to beneficialActionBodyCue above -- never mixed with it. Same optionality/role. */
  | "internalActionBodyCue"
  | "preventiveActionAsk"
  | "preventiveActionDescription"
  | "regulationTool"
  | "challengeContext"
  | "interferingState"
  | "statePreventiveAction"
  | "stateEncodingRegulationCueAsk"
  | "stateEncodingRegulationCue"
  | "stateMantra"
  | "stateBodyLanguageCue"
  | "identityChallengeContext"
  | "identityInterferingEmotion"
  | "identityPreventiveAction"
  | "identityEncodingRegulationCueAsk"
  | "identityEncodingRegulationCue"
  | "identityMantra"
  | "identityBodyLanguageCue"
  /** ARC Builds task: parallel to internalAction/internalActionBodyCue -- see ProfileDraft.identityAction's doc. */
  | "identityAction"
  | "identityActionBodyCue"
  | "dwellTimes"
  | "review";

/**
 * GOAL phase's step order: Desired Habit -> [needs assessment,
 * unavoidable -- it decides needsState/needsIdentity, this ArcBuild's
 * own fields now] -> Identity -> Desired State, plus
 * preventiveAction/regulationTool. Those last two stay in this phase
 * rather than STATE/IDENTITY ARC even though they're conceptually part
 * of an ARC Map (see the module doc): the engine uses regulationTool
 * for every "regulate" stage regardless of trigger, and preventiveAction
 * specifically for the reactive_habit route (arc/arcEngine.ts's
 * afterArcThought) -- neither is ARC-Map-exclusive, so an ArcBuild with
 * only a habit target (no state or identity ARC Map, never enters
 * those phases) still needs to be able to set them.
 *
 * ARC Builds task: there is no standalone free-text "goal" step/question
 * in this order any more -- an ArcBuild's own `name` (given once, at
 * creation, on the ARC Build list screen) already identifies it, so
 * asking "מה תרצה להשיג" again inside the wizard would be redundant.
 * buildProfileFromDraft still writes draft.goal (see below), just
 * auto-set from the build's name rather than asked here.
 *
 * Presence Color task: "presenceColor" is now this array's first entry,
 * ahead of negativeActionEnabledAsk -- asked before anything else in a
 * fresh BUILD, and required (see isGoalDraftComplete below), so
 * re-editing a legacy ArcBuild that never answered it lands right back
 * on this step until it's filled in.
 */
export const GOAL_STEP_ORDER: ProfileStep[] = [
  "presenceColor",
  "negativeActionEnabledAsk",
  "habit",
  "negativeActionDuration",
  "beneficialAction",
  "beneficialActionBodyCue",
  "needsState",
  "needsIdentityImmediately",
  "needsIdentityExplicit",
  "desiredIdentity",
  "supportiveState",
  "internalAction",
  "internalActionBodyCue",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
  "review",
];

/**
 * the STATE/IDENTITY ARC phase's step order around the state layer's Desired State
 * (supportiveState). Never re-asks supportiveState itself -- only
 * references it. statePreventiveAction sits right after the recognition
 * fields (Challenge Context / Interfering State) and before the
 * Encoding cues -- it's this target's own Preventive Action, surfaced
 * by LIVE before ARC Thought (see arc/arcEngine.ts's
 * resolveTargetPreventiveAction), never mixed with the identity
 * layer's or the habit layer's. stateEncodingRegulationCueAsk/Cue offer
 * this target's own lightweight Short Encoding Regulation Cue --
 * distinct from the Full Regulation Cue (GOAL_STEP_ORDER's
 * regulationTool, used during Regulation itself) -- see arc/arcEngine.ts's
 * resolveEncodingRegulationCue.
 */
export const STATE_ARC_STEP_ORDER: ProfileStep[] = [
  "challengeContext",
  "interferingState",
  "statePreventiveAction",
  "stateEncodingRegulationCueAsk",
  "stateEncodingRegulationCue",
  "stateMantra",
  "stateBodyLanguageCue",
  "dwellTimes",
  "review",
];

/** the STATE/IDENTITY ARC phase's step order around the identity layer's Desired State (desiredIdentity) -- the second, independently editable ARC Map. Never re-asks desiredIdentity itself. identityPreventiveAction/identityEncodingRegulationCueAsk/Cue are parallel to the state layer's own -- never mixed with it. */
export const IDENTITY_ARC_STEP_ORDER: ProfileStep[] = [
  "identityChallengeContext",
  "identityInterferingEmotion",
  "identityPreventiveAction",
  "identityEncodingRegulationCueAsk",
  "identityEncodingRegulationCue",
  "identityMantra",
  "identityBodyLanguageCue",
  "dwellTimes",
  "review",
];

export interface ProfileDraft {
  goal: string;
  /** Presence Color task -- see the "presenceColor" ProfileStep's doc and ArcBuildProfile.presenceColor's doc. Required, like goal. */
  presenceColor: string;

  needsState: boolean | null;
  needsIdentityImmediately: boolean | null;
  needsIdentityExplicit: boolean | null;

  supportiveState: string;
  interferingState: string;
  challengeContext: string;
  internalAction: string;
  /** Action Body Cue task -- see ArcBuildProfile.internalActionBodyCue's doc. */
  internalActionBodyCue: string;
  statePreventiveAction: string;
  /** null = not yet decided this BUILD session; true = "choose a shorter cue for Encoding" (B); false = "use the same cue during Encoding" (A). Draft-only -- never persisted itself, only its downstream effect on stateEncodingRegulationCue is. */
  stateWantsShortEncodingRegulationCue: boolean | null;
  stateEncodingRegulationCue: string;
  stateMantra: string;
  stateBodyLanguageCue: string;
  /**
   * The state layer's own configured dwell times (arc/dwellTimes.ts),
   * kept as strings for direct TextInput binding -- see the STATE/IDENTITY ARC phase's
   * "זמן שהייה" step (build/ArcBuildEditorScreen.tsx). Parsed and clamped into
   * ArcBuildProfile.stateDwellTimes only at buildProfileFromDraft time,
   * never earlier.
   */
  stateSensationDwellSeconds: string;
  stateAcceptanceDwellSeconds: string;
  stateRegulationDwellSeconds: string;
  stateEncodingDwellSeconds: string;
  stateActionImageryDwellSeconds: string;
  /** Coordinated timer/dwell task (Part 16-18, 20-23): the state layer's own Presence/Stop-Imagery dwell, parallel to the five original dwell fields above -- same string-for-TextInput-binding convention. */
  statePresenceDwellSeconds: string;
  stateStopImageryDwellSeconds: string;

  desiredIdentity: string;
  identityChallengeContext: string;
  identityInterferingEmotion: string;
  identityPreventiveAction: string;
  /** Parallel to stateWantsShortEncodingRegulationCue -- never mixed with it. */
  identityWantsShortEncodingRegulationCue: boolean | null;
  identityEncodingRegulationCue: string;
  identityMantra: string;
  identityBodyLanguageCue: string;
  /** ARC Builds task: the identity layer's own Action, asked directly for a standalone identity-targeted ArcBuild -- see ArcBuildProfile.identityAction's doc for the legacy beneficialAction-derivation fallback this preserves. */
  identityAction: string;
  /** Parallel to identityAction above -- see ArcBuildProfile.internalActionBodyCue's doc for the Action-Body-Cue-vs-Encoding-Body-Language distinction. */
  identityActionBodyCue: string;
  /** The identity layer's own configured dwell times, parallel to the state fields above -- never mixed with them. */
  identitySensationDwellSeconds: string;
  identityAcceptanceDwellSeconds: string;
  identityRegulationDwellSeconds: string;
  identityEncodingDwellSeconds: string;
  identityActionImageryDwellSeconds: string;
  /** Parallel to statePresenceDwellSeconds/stateStopImageryDwellSeconds -- never mixed with them. */
  identityPresenceDwellSeconds: string;
  identityStopImageryDwellSeconds: string;

  /** null = not yet decided this BUILD session (matches needsState/hasPreventiveAction's own tri-state pattern) -- must be explicitly answered before the GOAL phase can complete. */
  negativeActionReductionEnabled: boolean | null;
  habit: string;
  /** Negative Action reduction task: the current target Habit's own base timer allowance, restricted to 1-15 minutes -- set directly by a chip picker (build/ArcBuildEditorScreen.tsx), never free text, so no separate parse/validation step is needed. null = not yet chosen (only meaningful while negativeActionReductionEnabled is true). */
  negativeActionBaseDurationMinutes: number | null;
  beneficialAction: string;
  /** Action Body Cue task -- see ArcBuildProfile.beneficialActionBodyCue's doc. Also reused for the identity layer at buildProfileFromDraft time, exactly like beneficialAction itself. */
  beneficialActionBodyCue: string;
  hasPreventiveAction: boolean | null;
  preventiveActionDescription: string;

  regulationTool: string;
}

export function createEmptyDraft(): ProfileDraft {
  return {
    goal: "",
    presenceColor: "",
    needsState: null,
    needsIdentityImmediately: null,
    needsIdentityExplicit: null,
    supportiveState: "",
    interferingState: "",
    challengeContext: "",
    internalAction: "",
    internalActionBodyCue: "",
    statePreventiveAction: "",
    stateWantsShortEncodingRegulationCue: null,
    stateEncodingRegulationCue: "",
    stateMantra: "",
    stateBodyLanguageCue: "",
    stateSensationDwellSeconds: String(DEFAULT_DWELL_TIMES.sensationDwellSeconds),
    stateAcceptanceDwellSeconds: String(DEFAULT_DWELL_TIMES.acceptanceDwellSeconds),
    stateRegulationDwellSeconds: String(DEFAULT_DWELL_TIMES.regulationDwellSeconds),
    stateEncodingDwellSeconds: String(DEFAULT_DWELL_TIMES.encodingDwellSeconds),
    stateActionImageryDwellSeconds: String(DEFAULT_DWELL_TIMES.actionImageryDwellSeconds),
    statePresenceDwellSeconds: String(DEFAULT_DWELL_TIMES.presenceDwellSeconds),
    stateStopImageryDwellSeconds: String(DEFAULT_DWELL_TIMES.stopImageryDwellSeconds),
    desiredIdentity: "",
    identityChallengeContext: "",
    identityInterferingEmotion: "",
    identityPreventiveAction: "",
    identityWantsShortEncodingRegulationCue: null,
    identityEncodingRegulationCue: "",
    identityMantra: "",
    identityBodyLanguageCue: "",
    identityAction: "",
    identityActionBodyCue: "",
    identitySensationDwellSeconds: String(DEFAULT_DWELL_TIMES.sensationDwellSeconds),
    identityAcceptanceDwellSeconds: String(DEFAULT_DWELL_TIMES.acceptanceDwellSeconds),
    identityRegulationDwellSeconds: String(DEFAULT_DWELL_TIMES.regulationDwellSeconds),
    identityEncodingDwellSeconds: String(DEFAULT_DWELL_TIMES.encodingDwellSeconds),
    identityActionImageryDwellSeconds: String(DEFAULT_DWELL_TIMES.actionImageryDwellSeconds),
    identityPresenceDwellSeconds: String(DEFAULT_DWELL_TIMES.presenceDwellSeconds),
    identityStopImageryDwellSeconds: String(DEFAULT_DWELL_TIMES.stopImageryDwellSeconds),
    negativeActionReductionEnabled: null,
    habit: "",
    negativeActionBaseDurationMinutes: null,
    beneficialAction: "",
    beneficialActionBodyCue: "",
    hasPreventiveAction: null,
    preventiveActionDescription: "",
    regulationTool: "",
  };
}

export function draftFromProfileAndSelection(
  profile: ArcBuildProfile,
  selection: ArcProgramSelection | null
): ProfileDraft {
  // Prefer the persisted selection (the real source of truth). Only
  // infer from the profile/legacy programPath if no selection was
  // ever saved for this profile -- data from before ArcProgramSelection
  // persistence existed.
  const resolvedSelection: Omit<ArcProgramSelection, "programPath"> =
    selection ??
    (isKnownLegacyProgramPath(profile.programPath)
      ? deriveNeedsFromLegacyProgramPath(profile.programPath)
      : { needsState: false, needsIdentity: false, needsHabit: true, needsIdentityImmediately: false });

  const needsState = resolvedSelection.needsState;
  const needsIdentity = resolvedSelection.needsIdentity;

  return {
    goal: profile.goal ?? "",
    presenceColor: profile.presenceColor ?? "",
    needsState,
    needsIdentityImmediately: needsState ? resolvedSelection.needsIdentityImmediately : null,
    needsIdentityExplicit: needsState ? null : needsIdentity,
    supportiveState: profile.supportiveState ?? "",
    interferingState: profile.interferingState ?? "",
    challengeContext: profile.challengeContext ?? "",
    internalAction: profile.internalAction ?? "",
    internalActionBodyCue: profile.internalActionBodyCue ?? "",
    statePreventiveAction: profile.statePreventiveAction ?? "",
    // A stored short cue means the trainee previously chose "B" (a
    // shorter cue) -- default the choice back to that so re-editing
    // doesn't silently discard it. Left undecided (null, not "A"/false)
    // when nothing is stored: a legacy profile never saw this step at
    // all, so it's presented neutrally rather than presuming an answer.
    // Truthy check, not just "!== null": a profile stored before this
    // field existed has it missing entirely (undefined, not null) once
    // JSON.parse'd, and undefined !== null is true -- which would
    // wrongly presume "B" (a shorter cue) was chosen for a trainee who
    // never saw this step at all.
    stateWantsShortEncodingRegulationCue: profile.stateEncodingRegulationCue ? true : null,
    stateEncodingRegulationCue: profile.stateEncodingRegulationCue ?? "",
    stateMantra: profile.stateEncoding?.mantra ?? "",
    stateBodyLanguageCue: profile.stateEncoding?.bodyLanguageCue ?? "",
    stateSensationDwellSeconds: String(profile.stateDwellTimes?.sensationDwellSeconds ?? DEFAULT_DWELL_TIMES.sensationDwellSeconds),
    stateAcceptanceDwellSeconds: String(profile.stateDwellTimes?.acceptanceDwellSeconds ?? DEFAULT_DWELL_TIMES.acceptanceDwellSeconds),
    stateRegulationDwellSeconds: String(profile.stateDwellTimes?.regulationDwellSeconds ?? DEFAULT_DWELL_TIMES.regulationDwellSeconds),
    stateEncodingDwellSeconds: String(profile.stateDwellTimes?.encodingDwellSeconds ?? DEFAULT_DWELL_TIMES.encodingDwellSeconds),
    stateActionImageryDwellSeconds: String(
      profile.stateDwellTimes?.actionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.actionImageryDwellSeconds
    ),
    statePresenceDwellSeconds: String(profile.stateDwellTimes?.presenceDwellSeconds ?? DEFAULT_DWELL_TIMES.presenceDwellSeconds),
    stateStopImageryDwellSeconds: String(
      profile.stateDwellTimes?.stopImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.stopImageryDwellSeconds
    ),
    desiredIdentity: profile.desiredIdentity ?? "",
    identityChallengeContext: profile.identityChallengeContext ?? "",
    identityInterferingEmotion: profile.identityInterferingEmotion ?? "",
    identityPreventiveAction: profile.identityPreventiveAction ?? "",
    identityWantsShortEncodingRegulationCue: profile.identityEncodingRegulationCue ? true : null,
    identityEncodingRegulationCue: profile.identityEncodingRegulationCue ?? "",
    identityMantra: profile.identityEncoding?.mantra ?? "",
    identityBodyLanguageCue: profile.identityEncoding?.bodyLanguageCue ?? "",
    identityAction: profile.identityAction ?? "",
    identityActionBodyCue: profile.identityActionBodyCue ?? "",
    identitySensationDwellSeconds: String(profile.identityDwellTimes?.sensationDwellSeconds ?? DEFAULT_DWELL_TIMES.sensationDwellSeconds),
    identityAcceptanceDwellSeconds: String(profile.identityDwellTimes?.acceptanceDwellSeconds ?? DEFAULT_DWELL_TIMES.acceptanceDwellSeconds),
    identityRegulationDwellSeconds: String(profile.identityDwellTimes?.regulationDwellSeconds ?? DEFAULT_DWELL_TIMES.regulationDwellSeconds),
    identityEncodingDwellSeconds: String(profile.identityDwellTimes?.encodingDwellSeconds ?? DEFAULT_DWELL_TIMES.encodingDwellSeconds),
    identityActionImageryDwellSeconds: String(
      profile.identityDwellTimes?.actionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.actionImageryDwellSeconds
    ),
    identityPresenceDwellSeconds: String(
      profile.identityDwellTimes?.presenceDwellSeconds ?? DEFAULT_DWELL_TIMES.presenceDwellSeconds
    ),
    identityStopImageryDwellSeconds: String(
      profile.identityDwellTimes?.stopImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.stopImageryDwellSeconds
    ),
    // Negative Action reduction task: resolved via the same
    // legacy-fallback resolver LIVE itself uses (program/engine.ts's
    // isNegativeActionReductionEnabled) so BUILD and LIVE can never
    // disagree about whether this tool is enabled for a given profile.
    negativeActionReductionEnabled: isNegativeActionReductionEnabled(profile),
    habit: profile.habit ?? "",
    // Negative Action reduction task: clamped into the current 1-15
    // valid range -- a legacy profile configured before this
    // restriction existed (e.g. 20 or 30 minutes, or genuinely absent
    // as `undefined` on very old data) must still load into a valid
    // chip selection rather than an invalid/unselectable value or the
    // literal string "undefined".
    negativeActionBaseDurationMinutes: clampNegativeActionDurationMinutes(profile.negativeActionBaseDurationMinutes),
    beneficialAction: profile.beneficialAction ?? "",
    beneficialActionBodyCue: profile.beneficialActionBodyCue ?? "",
    hasPreventiveAction: profile.preventiveAction !== null,
    preventiveActionDescription: profile.preventiveAction ?? "",
    regulationTool: profile.regulationTool ?? "",
  };
}

/** True once the needs assessment resolves to "this trainee needs identity work". */
export function resolvesNeedsIdentity(draft: ProfileDraft): boolean {
  return draft.needsState === true ? true : draft.needsIdentityExplicit === true;
}

export function shouldShowProfileStep(step: ProfileStep, draft: ProfileDraft): boolean {
  switch (step) {
    case "habit":
    case "negativeActionDuration":
      return draft.negativeActionReductionEnabled === true;
    case "needsIdentityImmediately":
      return draft.needsState === true;
    case "needsIdentityExplicit":
      return draft.needsState === false;
    case "supportiveState":
    case "internalAction":
    case "internalActionBodyCue":
    case "challengeContext":
    case "interferingState":
    case "statePreventiveAction":
    case "stateEncodingRegulationCueAsk":
    case "stateMantra":
    case "stateBodyLanguageCue":
      return draft.needsState === true;
    case "stateEncodingRegulationCue":
      return draft.needsState === true && draft.stateWantsShortEncodingRegulationCue === true;
    case "desiredIdentity":
    case "identityChallengeContext":
    case "identityInterferingEmotion":
    case "identityPreventiveAction":
    case "identityEncodingRegulationCueAsk":
    case "identityMantra":
    case "identityBodyLanguageCue":
    case "identityAction":
    case "identityActionBodyCue":
      return resolvesNeedsIdentity(draft);
    case "identityEncodingRegulationCue":
      return resolvesNeedsIdentity(draft) && draft.identityWantsShortEncodingRegulationCue === true;
    case "preventiveActionDescription":
      return draft.hasPreventiveAction === true;
    default:
      return true;
  }
}

export function getFirstProfileStep(draft: ProfileDraft, stepOrder: ProfileStep[]): ProfileStep {
  for (const step of stepOrder) {
    if (shouldShowProfileStep(step, draft)) return step;
  }
  return "review";
}

export function getNextProfileStep(current: ProfileStep, draft: ProfileDraft, stepOrder: ProfileStep[]): ProfileStep {
  const currentIndex = stepOrder.indexOf(current);
  for (let i = currentIndex + 1; i < stepOrder.length; i++) {
    const candidate = stepOrder[i];
    if (shouldShowProfileStep(candidate, draft)) return candidate;
  }
  return "review";
}

export function getPreviousProfileStep(current: ProfileStep, draft: ProfileDraft, stepOrder: ProfileStep[]): ProfileStep | null {
  const currentIndex = stepOrder.indexOf(current);
  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = stepOrder[i];
    if (shouldShowProfileStep(candidate, draft)) return candidate;
  }
  return null;
}

/** the GOAL phase's own completeness check -- does not require any the STATE/IDENTITY ARC phase field from either target's ARC Map. */
export function isGoalDraftComplete(draft: ProfileDraft): boolean {
  if (draft.goal.trim().length === 0) return false;
  // Presence Color task: required, exactly like goal -- a legacy
  // ArcBuild that never answered it cannot pass this check again until
  // the trainee fills it in via the "presenceColor" step.
  if (draft.presenceColor.trim().length === 0) return false;
  if (draft.needsState === null) return false;
  if (draft.needsState === true && draft.needsIdentityImmediately === null) return false;
  if (draft.needsState === false && draft.needsIdentityExplicit === null) return false;

  if (draft.needsState === true) {
    if (draft.supportiveState.trim().length === 0) return false;
    if (draft.internalAction.trim().length === 0) return false;
  }

  if (resolvesNeedsIdentity(draft)) {
    if (draft.desiredIdentity.trim().length === 0) return false;
  }

  if (draft.negativeActionReductionEnabled === null) return false;
  if (draft.negativeActionReductionEnabled === true) {
    if (draft.habit.trim().length === 0) return false;
    if (draft.negativeActionBaseDurationMinutes === null) return false;
  }
  if (draft.beneficialAction.trim().length === 0) return false;
  if (draft.hasPreventiveAction === true && draft.preventiveActionDescription.trim().length === 0) return false;
  if (draft.regulationTool.trim().length === 0) return false;

  return true;
}

/**
 * The state layer's ARC Map completeness check -- only meaningful once
 * its Desired State is active (needsState); vacuously complete
 * otherwise, since there's nothing to map. Requires Challenge Context
 * and Interfering State (the two recognition fields LIVE actually
 * consumes); the Encoding cues (stateMantra/stateBodyLanguageCue) stay
 * optional, same as mantras always have been.
 */
export function isStateArcDraftComplete(draft: ProfileDraft): boolean {
  if (draft.needsState !== true) return true;
  if (draft.challengeContext.trim().length === 0) return false;
  if (draft.interferingState.trim().length === 0) return false;
  return true;
}

/** The identity layer's own ARC Map completeness check -- parallel to isStateArcDraftComplete, independent of it (a trainee can complete one without the other). */
export function isIdentityArcDraftComplete(draft: ProfileDraft): boolean {
  if (!resolvesNeedsIdentity(draft)) return true;
  if (draft.identityChallengeContext.trim().length === 0) return false;
  if (draft.identityInterferingEmotion.trim().length === 0) return false;
  return true;
}

/** Parses one dwell-time draft string, falling back to (and clamping into range around) DEFAULT_DWELL_TIMES' own value for that field -- never lets an emptied/invalid/out-of-range text field save a dwell value that would break the flow (#F). */
function parseDwellField(text: string, fallback: number): number {
  const trimmed = text.trim();
  // An emptied text field ("") coerces to 0 via Number(), not NaN -- checked
  // explicitly here so it falls back to this field's own default, the same
  // as a genuinely unparseable value, rather than being clamped to
  // MIN_DWELL_SECONDS like an intentionally-entered "0" would be.
  if (trimmed.length === 0) return fallback;
  return clampDwellSeconds(Number(trimmed), fallback);
}

/** Builds a full DwellTimes set (never a partial one) from this target's seven draft fields -- always saved as a complete set once the STATE/IDENTITY ARC phase's "זמן שהייה" step is reached, so resolveDwellSecondsFor's own per-field fallback (arc/dwellTimes.ts) is really only ever exercised for a profile that never visited this step at all. Coordinated timer/dwell task: extended with presence/stopImagery, parallel to the original five. */
function dwellTimesFromDraft(draft: {
  sensation: string;
  acceptance: string;
  regulation: string;
  encoding: string;
  actionImagery: string;
  presence: string;
  stopImagery: string;
}): DwellTimes {
  return {
    sensationDwellSeconds: parseDwellField(draft.sensation, DEFAULT_DWELL_TIMES.sensationDwellSeconds),
    acceptanceDwellSeconds: parseDwellField(draft.acceptance, DEFAULT_DWELL_TIMES.acceptanceDwellSeconds),
    regulationDwellSeconds: parseDwellField(draft.regulation, DEFAULT_DWELL_TIMES.regulationDwellSeconds),
    encodingDwellSeconds: parseDwellField(draft.encoding, DEFAULT_DWELL_TIMES.encodingDwellSeconds),
    actionImageryDwellSeconds: parseDwellField(draft.actionImagery, DEFAULT_DWELL_TIMES.actionImageryDwellSeconds),
    presenceDwellSeconds: parseDwellField(draft.presence, DEFAULT_DWELL_TIMES.presenceDwellSeconds),
    stopImageryDwellSeconds: parseDwellField(draft.stopImagery, DEFAULT_DWELL_TIMES.stopImageryDwellSeconds),
  };
}

/**
 * Negative Action reduction task: clamps any value (including a
 * legacy-configured one from before the 1-15 minute restriction
 * existed, or a genuinely absent/undefined legacy field) into the
 * current valid [1, 15] range -- null only when nothing was ever
 * configured at all. Never lets an out-of-range or non-finite value
 * flow into the draft/profile, so the chip picker always has a
 * selectable, valid value to show (or none).
 */
function clampNegativeActionDurationMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(Math.max(Math.round(value), NEGATIVE_ACTION_MIN_DURATION_MINUTES), NEGATIVE_ACTION_MAX_DURATION_MINUTES);
}

function buildEncodingProfile(target: string, mantra: string, bodyLanguageCue: string): EncodingProfile | null {
  const trimmedMantra = mantra.trim();
  const trimmedCue = bodyLanguageCue.trim();
  if (trimmedMantra.length === 0 && trimmedCue.length === 0) return null;
  return {
    target,
    bodySensationCue: null,
    breathCue: null,
    bodyLanguageCue: trimmedCue.length > 0 ? trimmedCue : null,
    mantra: trimmedMantra.length > 0 ? trimmedMantra : null,
  };
}

/** Builds the real source-of-truth ArcProgramSelection to persist alongside the profile. the GOAL phase only -- the STATE/IDENTITY ARC phase never touches program selection/progress. */
export function selectionFromDraft(draft: ProfileDraft): ArcProgramSelection {
  if (draft.needsState === null) {
    throw new Error("Cannot build an ArcProgramSelection from an incomplete draft");
  }
  return {
    needsState: draft.needsState,
    needsIdentity: resolvesNeedsIdentity(draft),
    needsHabit: true, // every one of today's four presets ends in a habit week
    needsIdentityImmediately: !!draft.needsIdentityImmediately,
    programPath: resolveCurrentPreset({
      needsState: draft.needsState,
      needsIdentityImmediately: draft.needsIdentityImmediately ?? false,
      needsIdentity: draft.needsIdentityExplicit ?? false,
    }),
  };
}

/**
 * Builds the full ArcBuildProfile from the full draft. Called by
 * the GOAL phase's finish() and by the STATE/IDENTITY ARC phase's finish() for EITHER target
 * -- in every case the draft was loaded once (draftFromProfileAndSelection)
 * and carries both ARC Maps' current fields together, so writing the
 * full profile back here never discards the target that wasn't just
 * edited: editing the state ("Focus") map leaves identityChallengeContext/
 * identityInterferingEmotion/identityEncoding exactly as loaded, and
 * vice versa. Guarded by isGoalDraftComplete only: either ARC Map
 * being unfilled (never visited yet, or only one target mapped so far)
 * is expected and valid, not an error.
 */
export function buildProfileFromDraft(draft: ProfileDraft): ArcBuildProfile {
  if (!isGoalDraftComplete(draft) || draft.needsState === null) {
    throw new Error("Cannot build an ArcBuildProfile from an incomplete the GOAL phase draft");
  }

  const needsIdentity = resolvesNeedsIdentity(draft);
  const programPath = resolveCurrentPreset({
    needsState: draft.needsState,
    needsIdentityImmediately: draft.needsIdentityImmediately ?? false,
    needsIdentity: draft.needsIdentityExplicit ?? false,
  });

  const supportiveState = draft.needsState ? draft.supportiveState.trim() : null;
  const desiredIdentity = needsIdentity ? draft.desiredIdentity.trim() : null;

  return {
    programPath,
    // Legacy field, kept only so old code paths reading it don't break.
    // The real source of truth is the persisted ArcProgramSelection
    // (see selectionFromDraft above) -- new code must read that instead.
    identityActionNeeded: needsIdentity,

    goal: draft.goal.trim(),
    // Presence Color task: required by isGoalDraftComplete, so always
    // non-empty by the time buildProfileFromDraft is reachable -- same
    // pattern as goal, right above.
    presenceColor: draft.presenceColor.trim(),

    // null (not "") until the STATE/IDENTITY ARC phase actually maps something -- a fresh
    // the GOAL phase-only save has no ARC Map yet for either target, which
    // is expected and valid (LIVE's recognition preamble and Encoding
    // both already treat a null/empty value as "nothing mapped").
    interferingState: draft.needsState && draft.interferingState.trim() ? draft.interferingState.trim() : null,
    supportiveState,
    challengeContext: draft.needsState && draft.challengeContext.trim() ? draft.challengeContext.trim() : null,
    statePreventiveAction: draft.needsState && draft.statePreventiveAction.trim() ? draft.statePreventiveAction.trim() : null,
    // Only persisted when the trainee explicitly chose "B" (a shorter
    // cue) AND actually typed one -- choosing "A", leaving it blank, or
    // never visiting this step at all all collapse to the same null,
    // which resolveEncodingRegulationCue then falls back to the Full
    // Regulation Cue (regulationTool) for, exactly like before this
    // field existed (see arc/types.ts's doc on this field).
    stateEncodingRegulationCue:
      draft.needsState && draft.stateWantsShortEncodingRegulationCue === true && draft.stateEncodingRegulationCue.trim()
        ? draft.stateEncodingRegulationCue.trim()
        : null,
    stateEncoding: draft.needsState && supportiveState ? buildEncodingProfile(supportiveState, draft.stateMantra, draft.stateBodyLanguageCue) : null,
    internalAction: draft.needsState ? draft.internalAction.trim() : null,
    internalActionBodyCue: draft.needsState && draft.internalActionBodyCue.trim() ? draft.internalActionBodyCue.trim() : null,
    stateDwellTimes: draft.needsState
      ? dwellTimesFromDraft({
          sensation: draft.stateSensationDwellSeconds,
          acceptance: draft.stateAcceptanceDwellSeconds,
          regulation: draft.stateRegulationDwellSeconds,
          encoding: draft.stateEncodingDwellSeconds,
          actionImagery: draft.stateActionImageryDwellSeconds,
          presence: draft.statePresenceDwellSeconds,
          stopImagery: draft.stateStopImageryDwellSeconds,
        })
      : null,

    desiredIdentity,
    identityChallengeContext: needsIdentity && draft.identityChallengeContext.trim() ? draft.identityChallengeContext.trim() : null,
    identityInterferingEmotion: needsIdentity && draft.identityInterferingEmotion.trim() ? draft.identityInterferingEmotion.trim() : null,
    identityPreventiveAction: needsIdentity && draft.identityPreventiveAction.trim() ? draft.identityPreventiveAction.trim() : null,
    identityEncodingRegulationCue:
      needsIdentity && draft.identityWantsShortEncodingRegulationCue === true && draft.identityEncodingRegulationCue.trim()
        ? draft.identityEncodingRegulationCue.trim()
        : null,
    identityEncoding: needsIdentity && desiredIdentity ? buildEncodingProfile(desiredIdentity, draft.identityMantra, draft.identityBodyLanguageCue) : null,
    // ARC Builds task: a standalone identity-targeted ArcBuild has no
    // habit target sharing its own action any more, so identityAction
    // is now its own directly-askable field (draft.identityAction) --
    // asked explicitly on the identity-focused editor path. Falls back
    // to the older derivation (the same Desired Habit as beneficialAction)
    // only when identityAction itself was never filled in -- preserves
    // legacy/migrated builds and profiles saved before this field
    // existed, which relied on that derivation, without requiring
    // re-entry.
    identityAction: needsIdentity
      ? draft.identityAction.trim()
        ? draft.identityAction.trim()
        : draft.beneficialAction.trim()
          ? draft.beneficialAction.trim()
          : null
      : null,
    identityActionBodyCue: needsIdentity
      ? draft.identityActionBodyCue.trim()
        ? draft.identityActionBodyCue.trim()
        : draft.beneficialActionBodyCue.trim()
          ? draft.beneficialActionBodyCue.trim()
          : null
      : null,
    identityDwellTimes: needsIdentity
      ? dwellTimesFromDraft({
          sensation: draft.identitySensationDwellSeconds,
          acceptance: draft.identityAcceptanceDwellSeconds,
          regulation: draft.identityRegulationDwellSeconds,
          encoding: draft.identityEncodingDwellSeconds,
          actionImagery: draft.identityActionImageryDwellSeconds,
          presence: draft.identityPresenceDwellSeconds,
          stopImagery: draft.identityStopImageryDwellSeconds,
        })
      : null,

    // Negative Action reduction task: both the free-text action and its
    // duration are only ever persisted while the tool is actually
    // enabled -- disabling it (or never having enabled it) clears both
    // to null rather than leaving a stale, hidden configuration behind
    // that isNegativeActionAvailable could later see. Reuses the exact
    // same "habit" field this app has always used to describe the
    // predefined negative/interfering action -- see arc/types.ts's
    // ArcBuildProfile.habit doc.
    habit: draft.negativeActionReductionEnabled === true && draft.habit.trim() ? draft.habit.trim() : null,
    beneficialAction: draft.beneficialAction.trim(),
    beneficialActionBodyCue: draft.beneficialActionBodyCue.trim() ? draft.beneficialActionBodyCue.trim() : null,
    preventiveAction: draft.hasPreventiveAction ? draft.preventiveActionDescription.trim() : null,

    regulationTool: draft.regulationTool.trim(),
    actionDuration: null,
    successFocusDuration: null,
    negativeActionReductionEnabled: draft.negativeActionReductionEnabled === true,
    negativeActionBaseDurationMinutes:
      draft.negativeActionReductionEnabled === true ? clampNegativeActionDurationMinutes(draft.negativeActionBaseDurationMinutes) : null,
  };
}

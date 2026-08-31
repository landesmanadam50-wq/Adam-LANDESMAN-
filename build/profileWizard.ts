/**
 * build/profileWizard.ts
 *
 * Pure (React-free) logic shared by BUILD's two distinct UX sections --
 * BUILD-GOAL (build/ProfileBuilderScreen.tsx, route /build) and
 * BUILD-ARC (build/ArcMapScreen.tsx, route /build-arc). They are NOT
 * separate storage systems or separate architectures: both operate on
 * the same ArcBuildProfile, the same ProfileDraft shape, and the same
 * step-machinery pattern below (a fixed step order, a "should this
 * step show" gate, a "walk to the next visible step" function) --
 * just different step-order arrays and completeness checks over that
 * one shape.
 *
 * BUILD-GOAL defines the positive direction only -- Goal -> Desired
 * Habit -> Identity -> Desired State -- plus the needs-assessment
 * questions (needsState / needsIdentityImmediately / needsIdentity)
 * that feed program/selection.ts's resolveCurrentPreset (how
 * programPath gets assigned) and the general-purpose fields every
 * trainee needs regardless of which ARC Map(s) end up mapped
 * (preventiveAction, regulationTool -- see the design note on
 * GOAL_STEP_ORDER below for why these stay in GOAL rather than ARC).
 *
 * BUILD-ARC creates an ARC Map around a Desired State BUILD-GOAL
 * already established. A trainee can have UP TO TWO independently
 * mappable targets -- the state layer's Desired State (supportiveState)
 * and the identity layer's Desired Identity (desiredIdentity), e.g. a
 * "Focus" state map and a separate "Discipline" identity map on an
 * advanced_2_week (2-week) program where both layers are active
 * together from week 1. STATE_ARC_STEP_ORDER and IDENTITY_ARC_STEP_ORDER
 * are the same shape (Challenge Context -> Interfering State -> Encoding
 * cues) over two parallel field sets on the one ProfileDraft --
 * challengeContext/interferingState/stateMantra/stateBodyLanguageCue
 * for state, identityChallengeContext/identityInterferingEmotion/
 * identityMantra/identityBodyLanguageCue for identity -- never two
 * copies of the same target, never a shared field two targets fight
 * over. build/ArcMapScreen.tsx is responsible for offering a target
 * picker whenever both are available, and for never discarding one
 * target's fields while saving the other's (both live on the one
 * `draft` object the whole screen session, so buildProfileFromDraft
 * always writes both back, whichever one was just edited).
 *
 * identityAction was previously its own question ("מה הפעולה שמבטאת
 * את הזהות הזו?"), semantically duplicating beneficialAction ("מה
 * הפעולה המיטיבה שתרצה לבצע במקומו?") -- both were really asking for
 * the same "Desired Habit" behavioral target. identityAction is no
 * longer asked; buildProfileFromDraft derives it from beneficialAction
 * so the field arc/arcEngine.ts's resolveEncodingTarget already reads
 * for the identity layer keeps working unchanged.
 *
 * The persisted ArcProgramSelection (program/programTypes.ts) is the
 * real source of truth for what a trainee needs -- ArcBuildProfile
 * .identityActionNeeded is legacy-only. draftFromProfileAndSelection
 * prefers a passed-in selection and only falls back to inferring from
 * the profile/legacy programPath when no selection was ever saved
 * (old data from before ArcProgramSelection persistence existed).
 */

import type { ArcBuildProfile, DwellTimes, EncodingProfile } from "../arc/types.ts";
import type { ArcProgramSelection, KnownProgramPath } from "../program/programTypes.ts";
import { deriveNeedsFromLegacyProgramPath, resolveCurrentPreset } from "../program/selection.ts";
import { clampDwellSeconds, DEFAULT_DWELL_TIMES } from "../arc/dwellTimes.ts";

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
  | "habit"
  /**
   * Coordinated timer/dwell task (Part 12): the current target Habit's
   * own real timer duration -- the ONE place this is configured (LIVE
   * never asks for it again; see arc/types.ts's
   * ArcBuildProfile.negativeActionBaseDurationMinutes doc). Optional,
   * exactly like it always has been: a trainee can leave it blank,
   * meaning no Negative Action Timer duration gates that stage this
   * program, same as every profile before this step existed.
   */
  | "negativeActionDuration"
  | "beneficialAction"
  | "needsState"
  | "needsIdentityImmediately"
  | "needsIdentityExplicit"
  | "desiredIdentity"
  | "supportiveState"
  | "internalAction"
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
  | "dwellTimes"
  | "review";

/**
 * BUILD-GOAL's step order: Goal -> Desired Habit -> [needs assessment,
 * unavoidable -- it decides programPath] -> Identity -> Desired State,
 * plus preventiveAction/regulationTool. Those last two stay in GOAL
 * rather than ARC even though they're conceptually part of an ARC Map
 * (see the module doc): the engine uses regulationTool for every
 * "regulate" stage regardless of trigger, and preventiveAction
 * specifically for the reactive_habit route (arc/arcEngine.ts's
 * afterArcThought) -- neither is ARC-Map-exclusive, so a trainee on a
 * habit-only program (no state or identity ARC Map, never visits
 * BUILD-ARC) still needs to be able to set them.
 */
export const GOAL_STEP_ORDER: ProfileStep[] = [
  "goal",
  "habit",
  "negativeActionDuration",
  "beneficialAction",
  "needsState",
  "needsIdentityImmediately",
  "needsIdentityExplicit",
  "desiredIdentity",
  "supportiveState",
  "internalAction",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
  "review",
];

/**
 * BUILD-ARC's step order around the state layer's Desired State
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

/** BUILD-ARC's step order around the identity layer's Desired State (desiredIdentity) -- the second, independently editable ARC Map. Never re-asks desiredIdentity itself. identityPreventiveAction/identityEncodingRegulationCueAsk/Cue are parallel to the state layer's own -- never mixed with it. */
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

  needsState: boolean | null;
  needsIdentityImmediately: boolean | null;
  needsIdentityExplicit: boolean | null;

  supportiveState: string;
  interferingState: string;
  challengeContext: string;
  internalAction: string;
  statePreventiveAction: string;
  /** null = not yet decided this BUILD session; true = "choose a shorter cue for Encoding" (B); false = "use the same cue during Encoding" (A). Draft-only -- never persisted itself, only its downstream effect on stateEncodingRegulationCue is. */
  stateWantsShortEncodingRegulationCue: boolean | null;
  stateEncodingRegulationCue: string;
  stateMantra: string;
  stateBodyLanguageCue: string;
  /**
   * The state layer's own configured dwell times (arc/dwellTimes.ts),
   * kept as strings for direct TextInput binding -- see BUILD-ARC's
   * "זמן שהייה" step (build/ArcMapScreen.tsx). Parsed and clamped into
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
  /** The identity layer's own configured dwell times, parallel to the state fields above -- never mixed with them. */
  identitySensationDwellSeconds: string;
  identityAcceptanceDwellSeconds: string;
  identityRegulationDwellSeconds: string;
  identityEncodingDwellSeconds: string;
  identityActionImageryDwellSeconds: string;
  /** Parallel to statePresenceDwellSeconds/stateStopImageryDwellSeconds -- never mixed with them. */
  identityPresenceDwellSeconds: string;
  identityStopImageryDwellSeconds: string;

  habit: string;
  /** Coordinated timer/dwell task (Part 12): the current target Habit's own base timer allowance, in minutes -- kept as a string for direct TextInput binding, same convention as the dwell-seconds fields above. Optional: blank -> null (no Negative Action Timer duration configured, same as every profile before this step existed). */
  negativeActionBaseDurationMinutes: string;
  beneficialAction: string;
  hasPreventiveAction: boolean | null;
  preventiveActionDescription: string;

  regulationTool: string;
}

export function createEmptyDraft(): ProfileDraft {
  return {
    goal: "",
    needsState: null,
    needsIdentityImmediately: null,
    needsIdentityExplicit: null,
    supportiveState: "",
    interferingState: "",
    challengeContext: "",
    internalAction: "",
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
    identitySensationDwellSeconds: String(DEFAULT_DWELL_TIMES.sensationDwellSeconds),
    identityAcceptanceDwellSeconds: String(DEFAULT_DWELL_TIMES.acceptanceDwellSeconds),
    identityRegulationDwellSeconds: String(DEFAULT_DWELL_TIMES.regulationDwellSeconds),
    identityEncodingDwellSeconds: String(DEFAULT_DWELL_TIMES.encodingDwellSeconds),
    identityActionImageryDwellSeconds: String(DEFAULT_DWELL_TIMES.actionImageryDwellSeconds),
    identityPresenceDwellSeconds: String(DEFAULT_DWELL_TIMES.presenceDwellSeconds),
    identityStopImageryDwellSeconds: String(DEFAULT_DWELL_TIMES.stopImageryDwellSeconds),
    habit: "",
    negativeActionBaseDurationMinutes: "",
    beneficialAction: "",
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
    needsState,
    needsIdentityImmediately: needsState ? resolvedSelection.needsIdentityImmediately : null,
    needsIdentityExplicit: needsState ? null : needsIdentity,
    supportiveState: profile.supportiveState ?? "",
    interferingState: profile.interferingState ?? "",
    challengeContext: profile.challengeContext ?? "",
    internalAction: profile.internalAction ?? "",
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
    habit: profile.habit ?? "",
    // A profile saved before this field existed has it genuinely absent
    // (`undefined`, not `null`) once JSON.parse'd -- data/storage.ts's
    // loadProfile is a bare parse with no migration step (see that
    // file's own doc). Checking only `!== null` let `undefined` through
    // and rendered the literal string "undefined" in this TextInput; `??
    // null` normalizes both "never configured" shapes to the same
    // legacy-safe blank field.
    negativeActionBaseDurationMinutes:
      (profile.negativeActionBaseDurationMinutes ?? null) !== null ? String(profile.negativeActionBaseDurationMinutes) : "",
    beneficialAction: profile.beneficialAction ?? "",
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
    case "needsIdentityImmediately":
      return draft.needsState === true;
    case "needsIdentityExplicit":
      return draft.needsState === false;
    case "supportiveState":
    case "internalAction":
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

/** BUILD-GOAL's own completeness check -- does not require any BUILD-ARC field from either target's ARC Map. */
export function isGoalDraftComplete(draft: ProfileDraft): boolean {
  if (draft.goal.trim().length === 0) return false;
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

  if (draft.habit.trim().length === 0) return false;
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

/** Builds a full DwellTimes set (never a partial one) from this target's seven draft fields -- always saved as a complete set once BUILD-ARC's "זמן שהייה" step is reached, so resolveDwellSecondsFor's own per-field fallback (arc/dwellTimes.ts) is really only ever exercised for a profile that never visited this step at all. Coordinated timer/dwell task: extended with presence/stopImagery, parallel to the original five. */
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

/** Parses the current target Habit's own base timer allowance (Part 12) -- blank/unparseable stays null (no Negative Action Timer duration configured), a valid positive number is used as-is. Deliberately NOT clamped through arc/dwellTimes.ts's dwell bounds -- this is a real action-timer minutes value, a different concept from an experiential dwell in seconds. */
function parseNegativeActionBaseDurationMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
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

/** Builds the real source-of-truth ArcProgramSelection to persist alongside the profile. BUILD-GOAL only -- BUILD-ARC never touches program selection/progress. */
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
 * BUILD-GOAL's finish() and by BUILD-ARC's finish() for EITHER target
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
    throw new Error("Cannot build an ArcBuildProfile from an incomplete BUILD-GOAL draft");
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

    // null (not "") until BUILD-ARC actually maps something -- a fresh
    // BUILD-GOAL-only save has no ARC Map yet for either target, which
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
    // No longer its own question (see module doc): the identity layer's
    // action is the same Desired Habit as the habit layer's, not asked
    // twice.
    identityAction: needsIdentity ? draft.beneficialAction.trim() : null,
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

    habit: draft.habit.trim(),
    beneficialAction: draft.beneficialAction.trim(),
    preventiveAction: draft.hasPreventiveAction ? draft.preventiveActionDescription.trim() : null,

    regulationTool: draft.regulationTool.trim(),
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: parseNegativeActionBaseDurationMinutes(draft.negativeActionBaseDurationMinutes),
  };
}

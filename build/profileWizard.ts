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
 * just two different step-order arrays (GOAL_STEP_ORDER /
 * ARC_STEP_ORDER) and two different completeness checks
 * (isGoalDraftComplete / isArcDraftComplete) over that one shape.
 *
 * BUILD-GOAL defines the positive direction only -- Goal -> Desired
 * Habit -> Identity -> Desired State -- plus the needs-assessment
 * questions (needsState / needsIdentityImmediately / needsIdentity)
 * that feed program/selection.ts's resolveCurrentPreset (how
 * programPath gets assigned) and the general-purpose fields every
 * trainee needs regardless of which ARC Map ends up mapped
 * (preventiveAction, regulationTool -- see the design note on
 * GOAL_STEP_ORDER below for why these stay in GOAL rather than ARC).
 *
 * BUILD-ARC creates the ARC Map around the Desired State BUILD-GOAL
 * already established: Challenge Context, Interfering State, and the
 * state-layer's Encoding cues (mantra + body-language). It is reached
 * separately, after BUILD-GOAL, and never re-asks the Desired State --
 * ARC_STEP_ORDER only ever edits the interferingState/challengeContext/
 * stateEncoding fields of the same profile GOAL already saved.
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

import type { ArcBuildProfile, EncodingProfile } from "../arc/types.ts";
import type { ArcProgramSelection, KnownProgramPath } from "../program/programTypes.ts";
import { deriveNeedsFromLegacyProgramPath, resolveCurrentPreset } from "../program/selection.ts";

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
  | "beneficialAction"
  | "needsState"
  | "needsIdentityImmediately"
  | "needsIdentityExplicit"
  | "desiredIdentity"
  | "identityInterferingEmotion"
  | "identityMantra"
  | "supportiveState"
  | "internalAction"
  | "preventiveActionAsk"
  | "preventiveActionDescription"
  | "regulationTool"
  | "challengeContext"
  | "interferingState"
  | "stateMantra"
  | "stateBodyLanguageCue"
  | "review";

/**
 * BUILD-GOAL's step order: Goal -> Desired Habit -> [needs assessment,
 * unavoidable -- it decides programPath] -> Identity -> Desired State,
 * plus preventiveAction/regulationTool. Those last two stay in GOAL
 * rather than ARC even though they're conceptually part of an ARC Map
 * (see the module doc): the engine uses regulationTool for every
 * "regulate" stage regardless of trigger, and preventiveAction
 * specifically for the reactive_habit route (arc/arcEngine.ts's
 * afterArcThought) -- neither is state-ARC-Map-exclusive, so a trainee
 * on a habit-only program (no state layer, never visits BUILD-ARC)
 * still needs to be able to set them.
 */
export const GOAL_STEP_ORDER: ProfileStep[] = [
  "goal",
  "habit",
  "beneficialAction",
  "needsState",
  "needsIdentityImmediately",
  "needsIdentityExplicit",
  "desiredIdentity",
  "identityInterferingEmotion",
  "identityMantra",
  "supportiveState",
  "internalAction",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
  "review",
];

/**
 * BUILD-ARC's step order: Challenge Context -> Interfering State ->
 * Encoding cues (mantra, body-language) for the Desired State GOAL
 * already established. Never includes "supportiveState" itself --
 * BUILD-ARC references it, doesn't re-ask it.
 */
export const ARC_STEP_ORDER: ProfileStep[] = ["challengeContext", "interferingState", "stateMantra", "stateBodyLanguageCue", "review"];

export interface ProfileDraft {
  goal: string;

  needsState: boolean | null;
  needsIdentityImmediately: boolean | null;
  needsIdentityExplicit: boolean | null;

  supportiveState: string;
  interferingState: string;
  challengeContext: string;
  internalAction: string;
  stateMantra: string;
  stateBodyLanguageCue: string;

  desiredIdentity: string;
  identityInterferingEmotion: string;
  identityMantra: string;

  habit: string;
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
    stateMantra: "",
    stateBodyLanguageCue: "",
    desiredIdentity: "",
    identityInterferingEmotion: "",
    identityMantra: "",
    habit: "",
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
    stateMantra: profile.stateEncoding?.mantra ?? "",
    stateBodyLanguageCue: profile.stateEncoding?.bodyLanguageCue ?? "",
    desiredIdentity: profile.desiredIdentity ?? "",
    identityInterferingEmotion: profile.identityInterferingEmotion ?? "",
    identityMantra: profile.identityEncoding?.mantra ?? "",
    habit: profile.habit ?? "",
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
    case "stateMantra":
    case "stateBodyLanguageCue":
      return draft.needsState === true;
    case "desiredIdentity":
    case "identityInterferingEmotion":
    case "identityMantra":
      return resolvesNeedsIdentity(draft);
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

/** BUILD-GOAL's own completeness check -- does not require any BUILD-ARC field (challengeContext/interferingState/stateMantra/stateBodyLanguageCue). */
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
    if (draft.identityInterferingEmotion.trim().length === 0) return false;
  }

  if (draft.habit.trim().length === 0) return false;
  if (draft.beneficialAction.trim().length === 0) return false;
  if (draft.hasPreventiveAction === true && draft.preventiveActionDescription.trim().length === 0) return false;
  if (draft.regulationTool.trim().length === 0) return false;

  return true;
}

/**
 * BUILD-ARC's own completeness check -- only meaningful once a Desired
 * State is active (needsState); vacuously complete otherwise, since
 * there's nothing to map. Requires Challenge Context and Interfering
 * State (the two recognition fields LIVE actually consumes); the
 * Encoding cues (stateMantra/stateBodyLanguageCue) stay optional, same
 * as mantras always have been.
 */
export function isArcDraftComplete(draft: ProfileDraft): boolean {
  if (draft.needsState !== true) return true;
  if (draft.challengeContext.trim().length === 0) return false;
  if (draft.interferingState.trim().length === 0) return false;
  return true;
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
 * Builds the full ArcBuildProfile from the full draft. Called by both
 * BUILD-GOAL's finish() (draft has only GOAL fields filled on a fresh
 * profile) and BUILD-ARC's finish() (draft was loaded from an already-
 * saved profile via draftFromProfileAndSelection, so GOAL's fields are
 * already present and pass through unchanged -- BUILD-ARC's screen
 * only ever lets the user edit the ARC_STEP_ORDER fields). Guarded by
 * isGoalDraftComplete only: BUILD-ARC fields being unfilled (a fresh
 * profile that hasn't visited BUILD-ARC yet) is expected and valid,
 * not an error.
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

  return {
    programPath,
    // Legacy field, kept only so old code paths reading it don't break.
    // The real source of truth is the persisted ArcProgramSelection
    // (see selectionFromDraft above) -- new code must read that instead.
    identityActionNeeded: needsIdentity,

    goal: draft.goal.trim(),

    // null (not "") until BUILD-ARC actually maps something -- a fresh
    // BUILD-GOAL-only save has no ARC Map yet, which is expected and
    // valid (LIVE's recognition preamble and Encoding both already
    // treat a null/empty value as "nothing mapped").
    interferingState: draft.needsState && draft.interferingState.trim() ? draft.interferingState.trim() : null,
    supportiveState,
    challengeContext: draft.needsState && draft.challengeContext.trim() ? draft.challengeContext.trim() : null,
    stateEncoding: draft.needsState && supportiveState ? buildEncodingProfile(supportiveState, draft.stateMantra, draft.stateBodyLanguageCue) : null,
    internalAction: draft.needsState ? draft.internalAction.trim() : null,

    desiredIdentity: needsIdentity ? draft.desiredIdentity.trim() : null,
    identityInterferingEmotion: needsIdentity ? draft.identityInterferingEmotion.trim() : null,
    identityEncoding: needsIdentity ? buildEncodingProfile(draft.desiredIdentity.trim(), draft.identityMantra, "") : null,
    // No longer its own question (see module doc): the identity layer's
    // action is the same Desired Habit as the habit layer's, not asked
    // twice.
    identityAction: needsIdentity ? draft.beneficialAction.trim() : null,

    habit: draft.habit.trim(),
    beneficialAction: draft.beneficialAction.trim(),
    preventiveAction: draft.hasPreventiveAction ? draft.preventiveActionDescription.trim() : null,

    regulationTool: draft.regulationTool.trim(),
    actionDuration: null,
    successFocusDuration: null,
  };
}

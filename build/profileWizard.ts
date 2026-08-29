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
  | "supportiveState"
  | "internalAction"
  | "preventiveActionAsk"
  | "preventiveActionDescription"
  | "regulationTool"
  | "challengeContext"
  | "interferingState"
  | "statePreventiveAction"
  | "stateMantra"
  | "stateBodyLanguageCue"
  | "identityChallengeContext"
  | "identityInterferingEmotion"
  | "identityPreventiveAction"
  | "identityMantra"
  | "identityBodyLanguageCue"
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
 * layer's or the habit layer's.
 */
export const STATE_ARC_STEP_ORDER: ProfileStep[] = [
  "challengeContext",
  "interferingState",
  "statePreventiveAction",
  "stateMantra",
  "stateBodyLanguageCue",
  "review",
];

/** BUILD-ARC's step order around the identity layer's Desired State (desiredIdentity) -- the second, independently editable ARC Map. Never re-asks desiredIdentity itself. identityPreventiveAction is parallel to statePreventiveAction above -- this target's own Preventive Action, never mixed with the state layer's. */
export const IDENTITY_ARC_STEP_ORDER: ProfileStep[] = [
  "identityChallengeContext",
  "identityInterferingEmotion",
  "identityPreventiveAction",
  "identityMantra",
  "identityBodyLanguageCue",
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
  stateMantra: string;
  stateBodyLanguageCue: string;

  desiredIdentity: string;
  identityChallengeContext: string;
  identityInterferingEmotion: string;
  identityPreventiveAction: string;
  identityMantra: string;
  identityBodyLanguageCue: string;

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
    statePreventiveAction: "",
    stateMantra: "",
    stateBodyLanguageCue: "",
    desiredIdentity: "",
    identityChallengeContext: "",
    identityInterferingEmotion: "",
    identityPreventiveAction: "",
    identityMantra: "",
    identityBodyLanguageCue: "",
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
    statePreventiveAction: profile.statePreventiveAction ?? "",
    stateMantra: profile.stateEncoding?.mantra ?? "",
    stateBodyLanguageCue: profile.stateEncoding?.bodyLanguageCue ?? "",
    desiredIdentity: profile.desiredIdentity ?? "",
    identityChallengeContext: profile.identityChallengeContext ?? "",
    identityInterferingEmotion: profile.identityInterferingEmotion ?? "",
    identityPreventiveAction: profile.identityPreventiveAction ?? "",
    identityMantra: profile.identityEncoding?.mantra ?? "",
    identityBodyLanguageCue: profile.identityEncoding?.bodyLanguageCue ?? "",
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
    case "statePreventiveAction":
    case "stateMantra":
    case "stateBodyLanguageCue":
      return draft.needsState === true;
    case "desiredIdentity":
    case "identityChallengeContext":
    case "identityInterferingEmotion":
    case "identityPreventiveAction":
    case "identityMantra":
    case "identityBodyLanguageCue":
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
    stateEncoding: draft.needsState && supportiveState ? buildEncodingProfile(supportiveState, draft.stateMantra, draft.stateBodyLanguageCue) : null,
    internalAction: draft.needsState ? draft.internalAction.trim() : null,

    desiredIdentity,
    identityChallengeContext: needsIdentity && draft.identityChallengeContext.trim() ? draft.identityChallengeContext.trim() : null,
    identityInterferingEmotion: needsIdentity && draft.identityInterferingEmotion.trim() ? draft.identityInterferingEmotion.trim() : null,
    identityPreventiveAction: needsIdentity && draft.identityPreventiveAction.trim() ? draft.identityPreventiveAction.trim() : null,
    identityEncoding: needsIdentity && desiredIdentity ? buildEncodingProfile(desiredIdentity, draft.identityMantra, draft.identityBodyLanguageCue) : null,
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

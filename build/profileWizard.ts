/**
 * build/profileWizard.ts
 *
 * Pure (React-free) logic for the BUILD calibration wizard, producing
 * a real arc/types.ts ArcBuildProfile. Mirrors the shape of
 * arc/arcEngine.ts / program/progress.ts (a fixed step order, a
 * "should this step show" gate, a "walk to the next visible step"
 * function) so it stays testable with node --test.
 *
 * The needs assessment (needsState / needsIdentityImmediately /
 * needsIdentity) feeds program/selection.ts's resolveCurrentPreset,
 * which is how programPath gets assigned -- habit is always needed
 * (buildProgramSelection hardcodes needsHabit: true), so habit
 * questions are never skipped, but state/identity questions are only
 * asked when the resolved program actually calls for that layer.
 *
 * BUILD-GOAL / BUILD-ARC: "goal" is asked once, unconditionally, as
 * the positive direction the whole program moves toward (Goal -> Habit
 * -> Identity -> Desired State). The state cluster below it is the ARC
 * Map around that Desired State (supportiveState): where it's
 * especially relevant (challengeContext) and what commonly interferes
 * with it (interferingState) -- both mapping/recognition data, per
 * arc/instructions.ts's containsInductionPattern audit and
 * getInterferingStateRecognitionPrompt/getChallengeContextRecognitionPrompt.
 * This is intentionally the SAME single flow the old "מה המצב התומך?" /
 * "מה המצב הפנימי המפריע?" questions already were -- not a second,
 * parallel BUILD-ARC screen -- since a separate multi-map structure
 * isn't required to represent one trainee's one active ARC Map.
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
  | "needsState"
  | "needsIdentityImmediately"
  | "needsIdentityExplicit"
  | "supportiveState"
  | "interferingState"
  | "challengeContext"
  | "internalAction"
  | "stateMantra"
  | "desiredIdentity"
  | "identityInterferingEmotion"
  | "identityAction"
  | "identityMantra"
  | "habit"
  | "beneficialAction"
  | "preventiveActionAsk"
  | "preventiveActionDescription"
  | "regulationTool"
  | "review";

export const PROFILE_STEP_ORDER: ProfileStep[] = [
  "goal",
  "needsState",
  "needsIdentityImmediately",
  "needsIdentityExplicit",
  "supportiveState",
  "interferingState",
  "challengeContext",
  "internalAction",
  "stateMantra",
  "desiredIdentity",
  "identityInterferingEmotion",
  "identityAction",
  "identityMantra",
  "habit",
  "beneficialAction",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
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
  stateMantra: string;

  desiredIdentity: string;
  identityInterferingEmotion: string;
  identityAction: string;
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
    desiredIdentity: "",
    identityInterferingEmotion: "",
    identityAction: "",
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
    desiredIdentity: profile.desiredIdentity ?? "",
    identityInterferingEmotion: profile.identityInterferingEmotion ?? "",
    identityAction: profile.identityAction ?? "",
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
    case "interferingState":
    case "challengeContext":
    case "internalAction":
    case "stateMantra":
      return draft.needsState === true;
    case "desiredIdentity":
    case "identityInterferingEmotion":
    case "identityAction":
    case "identityMantra":
      return resolvesNeedsIdentity(draft);
    case "preventiveActionDescription":
      return draft.hasPreventiveAction === true;
    default:
      return true;
  }
}

export function getFirstProfileStep(draft: ProfileDraft): ProfileStep {
  for (const step of PROFILE_STEP_ORDER) {
    if (shouldShowProfileStep(step, draft)) return step;
  }
  return "review";
}

export function getNextProfileStep(current: ProfileStep, draft: ProfileDraft): ProfileStep {
  const currentIndex = PROFILE_STEP_ORDER.indexOf(current);
  for (let i = currentIndex + 1; i < PROFILE_STEP_ORDER.length; i++) {
    const candidate = PROFILE_STEP_ORDER[i];
    if (shouldShowProfileStep(candidate, draft)) return candidate;
  }
  return "review";
}

export function getPreviousProfileStep(current: ProfileStep, draft: ProfileDraft): ProfileStep | null {
  const currentIndex = PROFILE_STEP_ORDER.indexOf(current);
  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = PROFILE_STEP_ORDER[i];
    if (shouldShowProfileStep(candidate, draft)) return candidate;
  }
  return null;
}

export function isDraftComplete(draft: ProfileDraft): boolean {
  if (draft.goal.trim().length === 0) return false;
  if (draft.needsState === null) return false;
  if (draft.needsState === true && draft.needsIdentityImmediately === null) return false;
  if (draft.needsState === false && draft.needsIdentityExplicit === null) return false;

  if (draft.needsState === true) {
    if (draft.supportiveState.trim().length === 0) return false;
    if (draft.interferingState.trim().length === 0) return false;
    if (draft.challengeContext.trim().length === 0) return false;
    if (draft.internalAction.trim().length === 0) return false;
  }

  if (resolvesNeedsIdentity(draft)) {
    if (draft.desiredIdentity.trim().length === 0) return false;
    if (draft.identityInterferingEmotion.trim().length === 0) return false;
    if (draft.identityAction.trim().length === 0) return false;
  }

  if (draft.habit.trim().length === 0) return false;
  if (draft.beneficialAction.trim().length === 0) return false;
  if (draft.hasPreventiveAction === true && draft.preventiveActionDescription.trim().length === 0) return false;
  if (draft.regulationTool.trim().length === 0) return false;

  return true;
}

function encodingFromMantra(target: string, mantra: string): EncodingProfile | null {
  if (mantra.trim().length === 0) return null;
  return { target, bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: mantra.trim() };
}

/** Builds the real source-of-truth ArcProgramSelection to persist alongside the profile. */
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

export function buildProfileFromDraft(draft: ProfileDraft): ArcBuildProfile {
  if (!isDraftComplete(draft) || draft.needsState === null) {
    throw new Error("Cannot build an ArcBuildProfile from an incomplete draft");
  }

  const needsIdentity = resolvesNeedsIdentity(draft);
  const programPath = resolveCurrentPreset({
    needsState: draft.needsState,
    needsIdentityImmediately: draft.needsIdentityImmediately ?? false,
    needsIdentity: draft.needsIdentityExplicit ?? false,
  });

  return {
    programPath,
    // Legacy field, kept only so old code paths reading it don't break.
    // The real source of truth is the persisted ArcProgramSelection
    // (see selectionFromDraft above) -- new code must read that instead.
    identityActionNeeded: needsIdentity,

    goal: draft.goal.trim(),

    interferingState: draft.needsState ? draft.interferingState.trim() : null,
    supportiveState: draft.needsState ? draft.supportiveState.trim() : null,
    challengeContext: draft.needsState ? draft.challengeContext.trim() : null,
    // The encoding target is the Desired State (supportiveState), never
    // the Interfering State -- Encoding intentionally activates the
    // former and must never intentionally reactivate the latter.
    stateEncoding: draft.needsState ? encodingFromMantra(draft.supportiveState.trim(), draft.stateMantra) : null,
    internalAction: draft.needsState ? draft.internalAction.trim() : null,

    desiredIdentity: needsIdentity ? draft.desiredIdentity.trim() : null,
    identityInterferingEmotion: needsIdentity ? draft.identityInterferingEmotion.trim() : null,
    identityEncoding: needsIdentity ? encodingFromMantra(draft.desiredIdentity.trim(), draft.identityMantra) : null,
    identityAction: needsIdentity ? draft.identityAction.trim() : null,

    habit: draft.habit.trim(),
    beneficialAction: draft.beneficialAction.trim(),
    preventiveAction: draft.hasPreventiveAction ? draft.preventiveActionDescription.trim() : null,

    regulationTool: draft.regulationTool.trim(),
    actionDuration: null,
    successFocusDuration: null,
  };
}

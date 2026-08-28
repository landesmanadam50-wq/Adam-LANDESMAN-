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
 * ArcBuildProfile has no "goal" field (unlike the old engine/'s
 * ArcProfile), so this wizard doesn't ask for one -- there's nowhere
 * to store it.
 *
 * The persisted ArcProgramSelection (program/programTypes.ts) is the
 * real source of truth for what a trainee needs -- ArcBuildProfile
 * .identityActionNeeded is legacy-only. draftFromProfileAndSelection
 * prefers a passed-in selection and only falls back to inferring from
 * the profile/legacy programPath when no selection was ever saved
 * (old data from before ArcProgramSelection persistence existed).
 *
 * BUILD-GOAL vs. BUILD-ARC: this wizard only collects the Desired
 * State (supportiveState) -- the positive direction a trainee wants to
 * develop. It deliberately does NOT ask for an Interfering State or a
 * Preventive Action; those are Challenge Pattern data that belongs to
 * an ArcMap (arc/buildTypes.ts), collected in BUILD-ARC
 * (build/ArcMapManagerScreen.tsx) only once a Desired State already
 * exists, and framed as recognition ("what tends to interfere"), never
 * as a second thing this wizard asks the trainee to name up front.
 * ArcBuildProfile.interferingState/preventiveAction are still real
 * fields on the type (so old stored profiles still parse), but this
 * wizard always writes them as null now -- data/storage.ts's
 * getOrCreateGoalModel() is what migrates any previously-collected
 * value into a trainee's first ArcMap.
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
  | "needsState"
  | "needsIdentityImmediately"
  | "needsIdentityExplicit"
  | "supportiveState"
  | "internalAction"
  | "stateMantra"
  | "desiredIdentity"
  | "identityInterferingEmotion"
  | "identityAction"
  | "identityMantra"
  | "habit"
  | "beneficialAction"
  | "regulationTool"
  | "review";

export const PROFILE_STEP_ORDER: ProfileStep[] = [
  "needsState",
  "needsIdentityImmediately",
  "needsIdentityExplicit",
  "supportiveState",
  "internalAction",
  "stateMantra",
  "desiredIdentity",
  "identityInterferingEmotion",
  "identityAction",
  "identityMantra",
  "habit",
  "beneficialAction",
  "regulationTool",
  "review",
];

export interface ProfileDraft {
  needsState: boolean | null;
  needsIdentityImmediately: boolean | null;
  needsIdentityExplicit: boolean | null;

  supportiveState: string;
  internalAction: string;
  stateMantra: string;

  desiredIdentity: string;
  identityInterferingEmotion: string;
  identityAction: string;
  identityMantra: string;

  habit: string;
  beneficialAction: string;

  regulationTool: string;
}

export function createEmptyDraft(): ProfileDraft {
  return {
    needsState: null,
    needsIdentityImmediately: null,
    needsIdentityExplicit: null,
    supportiveState: "",
    internalAction: "",
    stateMantra: "",
    desiredIdentity: "",
    identityInterferingEmotion: "",
    identityAction: "",
    identityMantra: "",
    habit: "",
    beneficialAction: "",
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
    needsState,
    needsIdentityImmediately: needsState ? resolvedSelection.needsIdentityImmediately : null,
    needsIdentityExplicit: needsState ? null : needsIdentity,
    supportiveState: profile.supportiveState ?? "",
    internalAction: profile.internalAction ?? "",
    stateMantra: profile.stateEncoding?.mantra ?? "",
    desiredIdentity: profile.desiredIdentity ?? "",
    identityInterferingEmotion: profile.identityInterferingEmotion ?? "",
    identityAction: profile.identityAction ?? "",
    identityMantra: profile.identityEncoding?.mantra ?? "",
    habit: profile.habit ?? "",
    beneficialAction: profile.beneficialAction ?? "",
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
    case "stateMantra":
      return draft.needsState === true;
    case "desiredIdentity":
    case "identityInterferingEmotion":
    case "identityAction":
    case "identityMantra":
      return resolvesNeedsIdentity(draft);
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
    if (draft.identityAction.trim().length === 0) return false;
  }

  if (draft.habit.trim().length === 0) return false;
  if (draft.beneficialAction.trim().length === 0) return false;
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

    // Interfering State/Preventive Action are Challenge Pattern data now
    // -- they live on an ArcMap (BUILD-ARC), never collected here. See
    // data/storage.ts's getOrCreateGoalModel() for how a previously
    // stored value (from before this change) gets migrated into a
    // trainee's first ArcMap instead of being silently lost.
    interferingState: null,
    supportiveState: draft.needsState ? draft.supportiveState.trim() : null,
    stateEncoding: draft.needsState ? encodingFromMantra(draft.supportiveState.trim(), draft.stateMantra) : null,
    internalAction: draft.needsState ? draft.internalAction.trim() : null,

    desiredIdentity: needsIdentity ? draft.desiredIdentity.trim() : null,
    identityInterferingEmotion: needsIdentity ? draft.identityInterferingEmotion.trim() : null,
    identityEncoding: needsIdentity ? encodingFromMantra(draft.desiredIdentity.trim(), draft.identityMantra) : null,
    identityAction: needsIdentity ? draft.identityAction.trim() : null,

    habit: draft.habit.trim(),
    beneficialAction: draft.beneficialAction.trim(),
    preventiveAction: null,

    regulationTool: draft.regulationTool.trim(),
    actionDuration: null,
    successFocusDuration: null,
  };
}

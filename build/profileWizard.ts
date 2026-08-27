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
 * needsIdentity) feeds program/selection.ts's resolveProgramPath,
 * which is how programPath gets assigned -- habit is always needed
 * (buildProgramSelection hardcodes needsHabit: true), so habit
 * questions are never skipped, but state/identity questions are only
 * asked when the resolved program actually calls for that layer.
 *
 * ArcBuildProfile has no "goal" field (unlike the old engine/'s
 * ArcProfile), so this wizard doesn't ask for one -- there's nowhere
 * to store it.
 */

import type { ArcBuildProfile, EncodingProfile } from "../arc/types.ts";
import { resolveProgramPath } from "../program/selection.ts";

export type ProfileStep =
  | "needsState"
  | "needsIdentityImmediately"
  | "needsIdentityExplicit"
  | "interferingState"
  | "supportiveState"
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
  "needsState",
  "needsIdentityImmediately",
  "needsIdentityExplicit",
  "interferingState",
  "supportiveState",
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
  needsState: boolean | null;
  needsIdentityImmediately: boolean | null;
  needsIdentityExplicit: boolean | null;

  interferingState: string;
  supportiveState: string;
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
    needsState: null,
    needsIdentityImmediately: null,
    needsIdentityExplicit: null,
    interferingState: "",
    supportiveState: "",
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

export function draftFromProfile(profile: ArcBuildProfile): ProfileDraft {
  const needsState = profile.stateEncoding !== null || profile.interferingState !== null;
  const needsIdentity = profile.identityEncoding !== null || profile.desiredIdentity !== null;
  return {
    needsState,
    needsIdentityImmediately: needsState ? profile.identityActionNeeded : null,
    needsIdentityExplicit: needsState ? null : needsIdentity,
    interferingState: profile.interferingState ?? "",
    supportiveState: profile.supportiveState ?? "",
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
    case "interferingState":
    case "supportiveState":
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
  if (draft.needsState === null) return false;
  if (draft.needsState === true && draft.needsIdentityImmediately === null) return false;
  if (draft.needsState === false && draft.needsIdentityExplicit === null) return false;

  if (draft.needsState === true) {
    if (draft.interferingState.trim().length === 0) return false;
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
  if (draft.hasPreventiveAction === true && draft.preventiveActionDescription.trim().length === 0) return false;
  if (draft.regulationTool.trim().length === 0) return false;

  return true;
}

function encodingFromMantra(target: string, mantra: string): EncodingProfile | null {
  if (mantra.trim().length === 0) return null;
  return { target, bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: mantra.trim() };
}

export function buildProfileFromDraft(draft: ProfileDraft): ArcBuildProfile {
  if (!isDraftComplete(draft) || draft.needsState === null) {
    throw new Error("Cannot build an ArcBuildProfile from an incomplete draft");
  }

  const needsIdentity = resolvesNeedsIdentity(draft);
  const programPath = resolveProgramPath({
    needsState: draft.needsState,
    needsIdentityImmediately: draft.needsIdentityImmediately ?? false,
    needsIdentity: draft.needsIdentityExplicit ?? false,
  });

  return {
    programPath,
    identityActionNeeded: needsIdentity,

    interferingState: draft.needsState ? draft.interferingState.trim() : null,
    supportiveState: draft.needsState ? draft.supportiveState.trim() : null,
    stateEncoding: draft.needsState ? encodingFromMantra(draft.interferingState.trim(), draft.stateMantra) : null,
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

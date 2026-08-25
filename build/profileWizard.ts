/**
 * build/profileWizard.ts
 *
 * Pure (React-free) logic for the BUILD calibration wizard that turns
 * a trainee's answers into a real engine/types.ts ArcProfile. Mirrors
 * the shape of engine/arcEngine.ts (a fixed step order, a "should this
 * step show" gate, a "walk to the next visible step" function) so the
 * two flows read the same way and this stays testable with node --test
 * instead of requiring a React renderer.
 */

import type { ArcProfile, ArcType } from "../engine/types.ts";
import { DEFAULT_PRESENCE_THRESHOLD, DEFAULT_INTENSITY_THRESHOLDS } from "../engine/thresholds.ts";

export type ProfileStep =
  | "goal"
  | "arcType"
  | "interferingState"
  | "supportiveState"
  | "internalAction"
  | "beneficialAction"
  | "regulationTool"
  | "mantra"
  | "preventiveActionAsk"
  | "preventiveActionDescription"
  | "interferingActionAsk"
  | "interferingActionDescription"
  | "interferingActionMinutes"
  | "review";

export const PROFILE_STEP_ORDER: ProfileStep[] = [
  "goal",
  "arcType",
  "interferingState",
  "supportiveState",
  "internalAction",
  "beneficialAction",
  "regulationTool",
  "mantra",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "interferingActionAsk",
  "interferingActionDescription",
  "interferingActionMinutes",
  "review",
];

export interface ProfileDraft {
  goal: string;
  arcType: ArcType | null;
  interferingState: string;
  supportiveState: string;
  internalAction: string;
  beneficialAction: string;
  regulationTool: string;
  mantra: string;
  hasPreventiveAction: boolean | null;
  preventiveActionDescription: string;
  hasInterferingAction: boolean | null;
  interferingActionDescription: string;
  interferingActionAllowedMinutes: number | null;
}

export function createEmptyDraft(): ProfileDraft {
  return {
    goal: "",
    arcType: null,
    interferingState: "",
    supportiveState: "",
    internalAction: "",
    beneficialAction: "",
    regulationTool: "",
    mantra: "",
    hasPreventiveAction: null,
    preventiveActionDescription: "",
    hasInterferingAction: null,
    interferingActionDescription: "",
    interferingActionAllowedMinutes: null,
  };
}

export function draftFromProfile(profile: ArcProfile): ProfileDraft {
  return {
    goal: profile.goal,
    arcType: profile.arcType,
    interferingState: profile.interferingState,
    supportiveState: profile.supportiveState,
    internalAction: profile.actions.internalAction,
    beneficialAction: profile.actions.beneficialAction,
    regulationTool: profile.regulationTool,
    mantra: profile.mantra ?? "",
    hasPreventiveAction: !!profile.preventiveAction,
    preventiveActionDescription: profile.preventiveAction?.description ?? "",
    hasInterferingAction: !!profile.interferingAction,
    interferingActionDescription: profile.interferingAction?.description ?? "",
    interferingActionAllowedMinutes: profile.interferingAction?.allowedMinutes ?? null,
  };
}

export function shouldShowProfileStep(step: ProfileStep, draft: ProfileDraft): boolean {
  switch (step) {
    case "preventiveActionDescription":
      return draft.hasPreventiveAction === true;
    case "interferingActionDescription":
    case "interferingActionMinutes":
      return draft.hasInterferingAction === true;
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

/** True once every required (non-optional) field has a real value. */
export function isDraftComplete(draft: ProfileDraft): boolean {
  return (
    draft.goal.trim().length > 0 &&
    draft.arcType !== null &&
    draft.interferingState.trim().length > 0 &&
    draft.supportiveState.trim().length > 0 &&
    draft.internalAction.trim().length > 0 &&
    draft.beneficialAction.trim().length > 0 &&
    draft.regulationTool.trim().length > 0 &&
    (draft.hasPreventiveAction !== true || draft.preventiveActionDescription.trim().length > 0) &&
    (draft.hasInterferingAction !== true ||
      (draft.interferingActionDescription.trim().length > 0 && draft.interferingActionAllowedMinutes !== null))
  );
}

export function buildProfileFromDraft(draft: ProfileDraft): ArcProfile {
  if (!isDraftComplete(draft) || draft.arcType === null) {
    throw new Error("Cannot build an ArcProfile from an incomplete draft");
  }

  const profile: ArcProfile = {
    goal: draft.goal.trim(),
    interferingState: draft.interferingState.trim(),
    supportiveState: draft.supportiveState.trim(),
    arcType: draft.arcType,
    actions: {
      internalAction: draft.internalAction.trim(),
      beneficialAction: draft.beneficialAction.trim(),
    },
    regulationTool: draft.regulationTool.trim(),
    presenceThreshold: DEFAULT_PRESENCE_THRESHOLD,
    intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS,
  };

  if (draft.mantra.trim().length > 0) {
    profile.mantra = draft.mantra.trim();
  }
  if (draft.hasPreventiveAction) {
    profile.preventiveAction = { description: draft.preventiveActionDescription.trim() };
  }
  if (draft.hasInterferingAction && draft.interferingActionAllowedMinutes !== null) {
    profile.interferingAction = {
      description: draft.interferingActionDescription.trim(),
      allowedMinutes: draft.interferingActionAllowedMinutes,
      reductionStage: 1,
    };
  }

  return profile;
}

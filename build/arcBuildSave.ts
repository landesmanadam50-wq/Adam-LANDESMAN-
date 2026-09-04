/**
 * build/arcBuildSave.ts
 *
 * Pure (React-free) helpers for saving ONE ArcBuild from
 * build/ArcBuildEditorScreen.tsx's single-target editor -- moved out of
 * that screen so the actual save-path logic (previously reachable only
 * by manually driving the UI, since this project has no React-rendering
 * test harness) can be exercised directly by node --test.
 *
 * Presence Color bug-fix task -- root cause: buildProfileFromDraft
 * (profileWizard.ts) was written for the OLD, bundled two-target GOAL
 * wizard. Its own internal completeness gate (isGoalDraftComplete)
 * unconditionally requires a non-empty `goal` and `beneficialAction`,
 * plus -- whenever needsState is true -- a non-empty `desiredIdentity`
 * (resolvesNeedsIdentity always returns true once needsState is true --
 * a leftover assumption from the four preset programs, where a state
 * map always implied wanting identity work too, and every preset ended
 * in a habit week). This single-target editor never asks for any of
 * these on a state/identity-target build: the ArcBuild's own name
 * already serves as its "goal" (see profileWizard.ts's module doc), a
 * state-only ArcBuild legitimately has no desired identity, and neither
 * a state nor an identity target has any habit/beneficialAction data at
 * all. Before this fix, buildProfileFromDraft therefore THREW for every
 * real, fully-answered state-target save (and would have for identity
 * too, via beneficialAction), and ArcBuildEditorScreen's finishAndSave
 * had no try/catch around it -- the thrown error became a silent,
 * unhandled promise rejection: the trainee saw "שמור" do nothing, with
 * no error message and no saved data.
 *
 * buildArcBuildProfileForSave below satisfies buildProfileFromDraft's
 * own gate with values that are NEVER persisted -- draft.goal defaults
 * to the ArcBuild's own name (exactly the already-documented intent),
 * and a state/identity target's desiredIdentity/beneficialAction
 * placeholders are discarded a few lines later by the same explicit
 * per-target null-out this screen has always done for fields the chosen
 * target doesn't use. presenceColor itself was never the blocker
 * (buildProfileFromDraft already persists it correctly) -- but it sits
 * on this exact same, already-broken gate,
 * which is how this became newly visible once Presence Color shipped.
 */

import type { ArcBuildProfile } from "../arc/types.ts";
import { buildProfileFromDraft, type ProfileDraft } from "./profileWizard.ts";

export type Target = "state" | "identity" | "habit";

/**
 * Required fields for THIS target only -- mirrors each field's own
 * existing required/optional status (Challenge Context + Interfering
 * State required, the target's own Action required, regulationTool and
 * presenceColor always required, Negative Action's own fields required
 * only once enabled), scoped to one target instead of a whole bundled
 * draft. This is the real, correct completeness gate for this screen --
 * buildProfileFromDraft's own internal one (isGoalDraftComplete) is not,
 * see the module doc above.
 */
export function isTargetDraftComplete(target: Target, draft: ProfileDraft): boolean {
  if (draft.presenceColor.trim().length === 0) return false;
  if (draft.regulationTool.trim().length === 0) return false;
  if (target === "state") {
    return (
      draft.supportiveState.trim().length > 0 && draft.challengeContext.trim().length > 0 && draft.interferingState.trim().length > 0
    );
  }
  if (target === "identity") {
    return (
      draft.desiredIdentity.trim().length > 0 &&
      draft.identityChallengeContext.trim().length > 0 &&
      draft.identityInterferingEmotion.trim().length > 0
    );
  }
  if (draft.beneficialAction.trim().length === 0) return false;
  if (draft.negativeActionReductionEnabled === null) return false;
  if (draft.negativeActionReductionEnabled === true) {
    if (draft.habit.trim().length === 0) return false;
    if (draft.negativeActionBaseDurationMinutes === null) return false;
  }
  return true;
}

/** Sets exactly the needs-flags shouldShowProfileStep already gates on to match ONE chosen target -- never both/neither, so the existing per-field gating (built for the old bundled model) shows exactly this target's own steps. */
export function draftForTarget(target: Target, base: ProfileDraft): ProfileDraft {
  return {
    ...base,
    needsState: target === "state",
    needsIdentityImmediately: target === "state" ? false : base.needsIdentityImmediately,
    needsIdentityExplicit: target === "identity",
  };
}

/** Infers this build's already-configured target from its saved profile, for reopening an existing build directly into its own flow -- never shows the target choice again once a target is set. state/identity/habit priority order matches deriveActiveLayersForArcBuild's own (arc/arcEngine.ts), for the rare case more than one somehow ended up configured. */
export function inferTarget(profile: ArcBuildProfile): Target | null {
  if (profile.stateEncoding !== null || profile.internalAction !== null) return "state";
  if (profile.identityEncoding !== null || profile.identityAction !== null) return "identity";
  if (profile.beneficialAction !== null) return "habit";
  return null;
}

/**
 * Builds the final, per-target-cleaned ArcBuildProfile ready to persist
 * -- the ONE place buildProfileFromDraft is called from this screen's
 * save path. Callers should gate on isTargetDraftComplete first (this
 * still throws for a genuinely incomplete draft, as defense-in-depth --
 * buildProfileFromDraft's own real requirements, like a target's own
 * Action, are unaffected by the goal/desiredIdentity shim below).
 *
 * Clears every field NOT relevant to the chosen target to null
 * explicitly, regardless of what buildProfileFromDraft itself defaults
 * to -- guarantees this build resolves to exactly the one layer it
 * targets, matching deriveActiveLayersForArcBuild's own detection.
 * Never invents or persists real trainee data: the goal/desiredIdentity
 * shim values exist only to satisfy buildProfileFromDraft's own
 * internal gate and are always discarded again immediately below for
 * any target they don't legitimately belong to.
 */
export function buildArcBuildProfileForSave(target: Target, draft: ProfileDraft, buildName: string, existingProgramPath: string): ArcBuildProfile {
  const shimmedDraft: ProfileDraft = {
    ...draft,
    goal: draft.goal.trim() ? draft.goal : buildName,
    desiredIdentity: target === "state" && !draft.desiredIdentity.trim() ? buildName : draft.desiredIdentity,
    // isGoalDraftComplete also unconditionally requires beneficialAction
    // (another leftover assumption from the old bundled wizard, where
    // every preset ended in a habit week) -- STATE_STEPS/IDENTITY_STEPS
    // never ask for it. Discarded immediately below, in the same
    // explicit null-out this screen has always done for a state/identity
    // target's irrelevant habit fields.
    beneficialAction: target !== "habit" && !draft.beneficialAction.trim() ? buildName : draft.beneficialAction,
  };
  const rawProfile = buildProfileFromDraft(shimmedDraft);

  const profile: ArcBuildProfile =
    target === "state"
      ? {
          ...rawProfile,
          desiredIdentity: null,
          identityChallengeContext: null,
          identityInterferingEmotion: null,
          identityPreventiveAction: null,
          identityEncodingRegulationCue: null,
          identityEncoding: null,
          identityAction: null,
          identityActionBodyCue: null,
          identityDwellTimes: null,
          beneficialAction: null,
          beneficialActionBodyCue: null,
          preventiveAction: null,
          habit: null,
          negativeActionBaseDurationMinutes: null,
          negativeActionReductionEnabled: false,
        }
      : target === "identity"
        ? {
            ...rawProfile,
            supportiveState: null,
            challengeContext: null,
            interferingState: null,
            statePreventiveAction: null,
            stateEncodingRegulationCue: null,
            stateEncoding: null,
            internalAction: null,
            internalActionBodyCue: null,
            stateDwellTimes: null,
            beneficialAction: null,
            beneficialActionBodyCue: null,
            preventiveAction: null,
            habit: null,
            negativeActionBaseDurationMinutes: null,
            negativeActionReductionEnabled: false,
          }
        : {
            ...rawProfile,
            supportiveState: null,
            challengeContext: null,
            interferingState: null,
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
          };

  return { ...profile, programPath: existingProgramPath };
}

/**
 * arc/identityProfile.ts
 *
 * Adaptive ARC architecture task, Phase 3 (data-layer foundations),
 * spec section 3: the reusable, saved-instance Identity record the
 * Phase 2 `ArcGoal.identityProfileId` relationship
 * (arc/goalStateIdentity.ts's own `resolveGoalRequiredIdentity`) is
 * intended to reference, and the "linked IdentityProfile" a real,
 * factored StateProfile/InterferenceItem may point at.
 *
 * Reuses the existing Identity-related field CONCEPTS already
 * established by ArcBuildProfile (desiredIdentity, identityEncoding.mantra,
 * identityDesiredState, identityFutureOrientedMantra, value) and by
 * arc/successfulPerformance.ts's own Successful Performance section
 * (identitySuccessfulPerformanceAction/Qualities/CustomQuality/Result/
 * identitySuccessMantra) -- see actionImageryConfig/
 * futureResultImageryConfig's own docs below for the exact mapping.
 * Never duplicates or invalidates any existing Identity protocol record
 * (ArcBuild's own identity layer, arc/types.ts) -- this is a NEW,
 * independent, reusable record type, read by nothing in this phase.
 *
 * Any number of these can exist at once, exactly like StateProfile
 * (arc/stateProfile.ts) -- mirrors its list-manipulation pattern exactly.
 *
 * Pure logic only -- nothing in this repository calls anything below yet.
 */

import type { LibraryItemStatus, OwnedLibraryRecord } from "./libraryItemStatus.ts";
import type { ActionTimerConfig } from "./stateProfile.ts";

export { createEmptyActionTimerConfig } from "./stateProfile.ts";
export type { ActionTimerConfig } from "./stateProfile.ts";

/**
 * "Identity-action imagery configuration" -- reuses the exact same
 * concept split arc/successfulPerformance.ts already established for
 * ArcBuildProfile's identitySuccessfulPerformance* fields
 * (resolveSuccessfulPerformanceActionOverride/resolveExecutionQualities):
 * an optional override for which action is imagined, plus the execution-
 * quality clause ("אתה מבצע את הפעולה בצורה X, Y ו-Z"). Never a
 * duplicate of ArcBuildProfile's own fields -- this is the library-
 * record-shaped equivalent, read by nothing in this phase.
 */
export interface IdentityActionImageryConfig {
  actionOverride: string | null;
  executionQualities: string[];
  customQuality: string | null;
}

export function createEmptyIdentityActionImageryConfig(): IdentityActionImageryConfig {
  return { actionOverride: null, executionQualities: [], customQuality: null };
}

/**
 * "Future-result imagery configuration" -- reuses
 * arc/successfulPerformance.ts's own Result Imagery + Success Mantra
 * concepts (identitySuccessfulPerformanceResult/identitySuccessMantra).
 * Deliberately a separate config from IdentityActionImageryConfig above,
 * mirroring how Process/Action Imagery and Result Imagery are already
 * two separate stages/copy-builders in that module -- never merged into
 * one.
 */
export interface FutureResultImageryConfig {
  desiredResult: string | null;
  successMantra: string | null;
}

export function createEmptyFutureResultImageryConfig(): FutureResultImageryConfig {
  return { desiredResult: null, successMantra: null };
}

/**
 * "Result-review configuration where relevant" -- distinct from
 * FutureResultImageryConfig above (that one is imagined IN ADVANCE,
 * before the action; this one is the AFTER-the-fact review, reusing the
 * same concept as arc/postActionCompletion.ts's own gratitudePrompt/
 * improvement-reflection question, "מה אפשר לשפר בפעם הבאה?" --
 * see that module's own doc). Optional/nullable: null means this
 * Identity's own review step, if ever wired, falls back to the standard
 * generic prompts, exactly like every other optional-override field in
 * this codebase.
 */
export interface ResultReviewConfig {
  reviewPrompt: string | null;
  improvementPromptEnabled: boolean;
}

export function createEmptyResultReviewConfig(): ResultReviewConfig {
  return { reviewPrompt: null, improvementPromptEnabled: true };
}

export interface IdentityProfile extends OwnedLibraryRecord {
  /** Reuses ArcBuildProfile.value's own concept -- the "why" underneath this Identity. */
  value: string | null;
  name: string;
  identityMantra: string | null;
  /** Reuses ArcBuildProfile.identityDesiredState's own concept -- HOW the trainee wants to feel/act while expressing this identity. */
  desiredIdentityState: string | null;
  bodyLanguageCue: string | null;
  /** Reuses ArcBuildProfile.identityFutureOrientedMantra's own concept -- the direction of movement right now, distinct from identityMantra ("who I'm practicing being"). */
  futureMantra: string | null;
  encodingCue: string | null;
  actionImageryConfig: IdentityActionImageryConfig | null;
  futureResultImageryConfig: FutureResultImageryConfig | null;
  action: string | null;
  actionTimerConfig: ActionTimerConfig | null;
  resultReviewConfig: ResultReviewConfig | null;
  /**
   * "Success Focus compatibility" / "Post-action replay/improvement
   * compatibility" / "Gratitude compatibility" -- whether THIS Identity
   * may participate in the shared post-action tail
   * (arc/postActionCompletion.ts's success_focus/gratitude_and_learning/
   * completed_action_imagery/improved_action_imagery sequence, which
   * today runs universally for every protocol). Default true for a
   * freshly created IdentityProfile -- matching how that shared tail
   * already applies to everything in this app today; a later phase's
   * composer may read these to selectively opt a specific Identity out,
   * but nothing does so yet.
   */
  successFocusCompatible: boolean;
  postActionReplayCompatible: boolean;
  gratitudeCompatible: boolean;
  status: LibraryItemStatus;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function generateIdentityProfileId(): string {
  return `identityprofile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh, empty IdentityProfile -- mirrors createEmptyStateProfile's own shape exactly. */
export function createEmptyIdentityProfile(id: string, name: string, ownerProgramId: string | null, now: string): IdentityProfile {
  return {
    id,
    ownerProgramId,
    value: null,
    name,
    identityMantra: null,
    desiredIdentityState: null,
    bodyLanguageCue: null,
    futureMantra: null,
    encodingCue: null,
    actionImageryConfig: null,
    futureResultImageryConfig: null,
    action: null,
    actionTimerConfig: null,
    resultReviewConfig: null,
    successFocusCompatible: true,
    postActionReplayCompatible: true,
    gratitudeCompatible: true,
    status: "enabled",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Defensive backfill for an IdentityProfile parsed from storage -- mirrors arc/stateProfile.ts's own normalizeStateProfile exactly. */
export function normalizeIdentityProfile(profile: IdentityProfile): IdentityProfile {
  return {
    ...profile,
    ownerProgramId: profile.ownerProgramId ?? null,
    value: profile.value ?? null,
    identityMantra: profile.identityMantra ?? null,
    desiredIdentityState: profile.desiredIdentityState ?? null,
    bodyLanguageCue: profile.bodyLanguageCue ?? null,
    futureMantra: profile.futureMantra ?? null,
    encodingCue: profile.encodingCue ?? null,
    actionImageryConfig: profile.actionImageryConfig ?? null,
    futureResultImageryConfig: profile.futureResultImageryConfig ?? null,
    action: profile.action ?? null,
    actionTimerConfig: profile.actionTimerConfig ?? null,
    resultReviewConfig: profile.resultReviewConfig ?? null,
    successFocusCompatible: profile.successFocusCompatible ?? true,
    postActionReplayCompatible: profile.postActionReplayCompatible ?? true,
    gratitudeCompatible: profile.gratitudeCompatible ?? true,
    status: profile.status ?? "enabled",
    schemaVersion: profile.schemaVersion ?? 1,
  };
}

/** Updates the one IdentityProfile matching `profile.id` in place if found, otherwise appends it as new -- mirrors arc/stateProfile.ts's upsertStateProfileInList exactly. */
export function upsertIdentityProfileInList(profiles: IdentityProfile[], profile: IdentityProfile): IdentityProfile[] {
  const index = profiles.findIndex((existing) => existing.id === profile.id);
  if (index === -1) return [...profiles, profile];
  return profiles.map((existing, i) => (i === index ? profile : existing));
}

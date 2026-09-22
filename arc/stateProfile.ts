/**
 * arc/stateProfile.ts
 *
 * Adaptive ARC architecture task, Phase 3 (data-layer foundations),
 * spec section 2: the reusable, saved-instance State record the Phase 2
 * `ArcGoal.stateProfileId` relationship (arc/goalStateIdentity.ts's own
 * `resolveGoalRequiredState`) is intended to reference, and the "linked
 * StateProfile" a real, factored InterferenceItem (arc/interferenceItem.ts)
 * points at -- distinct from a legacy UrgeArc/ThoughtArc/BeliefArc's own
 * `selfContainedState` (arc/legacyDerivativeAdapter.ts), which embeds an
 * equivalent set of fields directly on the legacy record rather than
 * referencing one of these.
 *
 * A StateProfile is a full protocol's worth of recognition/Encoding
 * content -- mantra, regulation anchor, posture/gaze cues, desired
 * sensation, energy color, encoding cue, and its own action -- deliberately
 * NOT a lightweight pointer, mirroring how ArcBuildProfile's own
 * state-layer fields (interferingState/supportiveState/stateEncoding/
 * internalAction/etc., arc/types.ts) already carry the same kind of
 * content today; this is simply the reusable, library-shaped equivalent.
 *
 * Any number of these can exist at once, exactly like UrgeArc/ThoughtArc/
 * ArcBuild (data/storage.ts's own loadStateProfiles/upsertStateProfile).
 * Mirrors arc/urgeArcs.ts's list-manipulation pattern exactly.
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (no screen/LIVE wiring in this phase; see this module's own header
 * doc in the broader Phase 3 plan).
 */

import type { LibraryItemStatus, OwnedLibraryRecord } from "./libraryItemStatus.ts";

/**
 * "State-action duration" and "State-action timer configuration" (spec
 * section 2) folded into one small, reusable object rather than two
 * separate/redundant duration fields -- mirrors arc/actionTimer.ts's own
 * single-parameter model (durationMinutes === null means untimed,
 * exactly like ArcBuildProfile.actionDuration's existing null-means-
 * untimed convention). Its own named type (rather than a bare
 * `number | null`) exists specifically so a later phase can extend it
 * (e.g. a warmup/announcement lead-in) without a schema change to every
 * StateProfile/IdentityProfile record that already stores one. Shared
 * verbatim by arc/identityProfile.ts -- never a second, parallel shape.
 */
export interface ActionTimerConfig {
  durationMinutes: number | null;
}

export function createEmptyActionTimerConfig(): ActionTimerConfig {
  return { durationMinutes: null };
}

/**
 * arc/types.ts's ArcGoal doc explains why State has no reliable legacy
 * source to backfill from -- a StateProfile is a genuinely NEW kind of
 * record starting in this phase, so every StateProfile's own
 * `ownerProgramId` is either the Self Development program that created
 * it or null (created outside any program context, or not yet linked to
 * one -- never guessed).
 */
export interface StateProfile extends OwnedLibraryRecord {
  name: string;
  description: string | null;
  /** "Functional purpose: what this State helps the trainee do" -- distinct from `description` (a general note) and from `name` (a short label). */
  purpose: string | null;
  stateMantra: string | null;
  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: how
   * stateMantra is practiced during Desired-State Creation. Missing
   * legacy value normalizes to "once" -- never invented as "fixed_count".
   */
  mantraRepetitionMode: "once" | "fixed_count" | "until_change_noticed";
  /** Meaningful only when mantraRepetitionMode is "fixed_count" -- validated 2-10 at BUILD-save time; null otherwise, never auto-converted from a missing legacy value. */
  mantraFixedRepetitionCount: number | null;
  /** Missing legacy value normalizes to "silent" -- the closest existing precedent (every pre-existing mantra-like line in this codebase, e.g. arc/proactiveStatePractice.ts's own state_mantra step, is silent). */
  mantraSpeakingMode: "aloud" | "silent" | "choose_in_live";
  /** null means no minimum dwell enforced -- mirrors arc/actionTimer.ts's own null-means-untimed convention, never an invented positive default. */
  mantraMinimumDwellSeconds: number | null;
  regulationAnchor: string | null;
  /** Posture cue -- reuses the same concept as EncodingProfile.bodyLanguageCue (arc/types.ts), never a duplicate mechanism. */
  bodyLanguageCue: string | null;
  /** Reuses EncodingProfile.gazeCue's own concept. */
  gazeCue: string | null;
  /**
   * Free text (or a short reference note) describing this State's own
   * natural-breathing awareness -- compatible with, but never a
   * duplicate of, arc/naturalBreathing.ts's shared getFreeBreathingLine
   * instruction (that function's own fixed line is always available
   * regardless of what's stored here; this field is only ever an
   * optional, State-specific elaboration/reference on top of it).
   */
  naturalBreathingAwareness: string | null;
  desiredBodySensation: string | null;
  bodySensationLocation: string | null;
  /** "Energy color or imagery" -- reuses the same free-text concept as ArcBuildProfile.presenceColor/PresenceArc.presenceColor (arc/presenceColor.ts), never a second, parallel color system. */
  energyColor: string | null;
  encodingCue: string | null;
  action: string | null;
  actionTimerConfig: ActionTimerConfig | null;
  /** "Optional primary linked Identity ID" -- see arc/libraryRelationships.ts's validateStatePrimaryIdentity: a StateProfile may reference zero or one primary IdentityProfile, enforced structurally by this being a single nullable field rather than an array. */
  primaryIdentityProfileId: string | null;
  /** "Optional alternative linked Identity IDs" (spec section 2's own "only if the existing plan requires them" -- kept, for forward parity with StateProfile.alternativeIdentityProfileIds and InterferenceItem.alternativeStateProfileIds, never required to be populated). */
  alternativeIdentityProfileIds: string[];
  status: LibraryItemStatus;
  /** Schema/version metadata -- 1 for every StateProfile created in this phase; a future phase bumps this only when the shape itself changes in a way old readers must know about. */
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function generateStateProfileId(): string {
  return `stateprofile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh, empty StateProfile -- every optional field null/empty exactly like a trainee who hasn't configured anything yet, mirroring createEmptyUrgeArc's own shape. `ownerProgramId` is required here (not defaulted to null) since every NEW StateProfile is created from within a specific Self Development program context; a caller creating one outside that context passes null explicitly. */
export function createEmptyStateProfile(id: string, name: string, ownerProgramId: string | null, now: string): StateProfile {
  return {
    id,
    ownerProgramId,
    name,
    description: null,
    purpose: null,
    stateMantra: null,
    mantraRepetitionMode: "once",
    mantraFixedRepetitionCount: null,
    mantraSpeakingMode: "silent",
    mantraMinimumDwellSeconds: null,
    regulationAnchor: null,
    bodyLanguageCue: null,
    gazeCue: null,
    naturalBreathingAwareness: null,
    desiredBodySensation: null,
    bodySensationLocation: null,
    energyColor: null,
    encodingCue: null,
    action: null,
    actionTimerConfig: null,
    primaryIdentityProfileId: null,
    alternativeIdentityProfileIds: [],
    status: "enabled",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Defensive backfill for a StateProfile parsed from storage -- mirrors
 * arc/urgeArcs.ts's own normalizeUrgeArc exactly (safe defaults, never
 * invented content, never overwrites an already-configured field).
 * Guards against a malformed/partial record (e.g. hand-edited storage,
 * or a future field this phase doesn't yet know about being absent)
 * rather than trusting the parsed JSON shape blindly.
 */
export function normalizeStateProfile(profile: StateProfile): StateProfile {
  return {
    ...profile,
    ownerProgramId: profile.ownerProgramId ?? null,
    description: profile.description ?? null,
    purpose: profile.purpose ?? null,
    stateMantra: profile.stateMantra ?? null,
    mantraRepetitionMode: profile.mantraRepetitionMode ?? "once",
    mantraFixedRepetitionCount: profile.mantraFixedRepetitionCount ?? null,
    mantraSpeakingMode: profile.mantraSpeakingMode ?? "silent",
    mantraMinimumDwellSeconds: profile.mantraMinimumDwellSeconds ?? null,
    regulationAnchor: profile.regulationAnchor ?? null,
    bodyLanguageCue: profile.bodyLanguageCue ?? null,
    gazeCue: profile.gazeCue ?? null,
    naturalBreathingAwareness: profile.naturalBreathingAwareness ?? null,
    desiredBodySensation: profile.desiredBodySensation ?? null,
    bodySensationLocation: profile.bodySensationLocation ?? null,
    energyColor: profile.energyColor ?? null,
    encodingCue: profile.encodingCue ?? null,
    action: profile.action ?? null,
    actionTimerConfig: profile.actionTimerConfig ?? null,
    primaryIdentityProfileId: profile.primaryIdentityProfileId ?? null,
    alternativeIdentityProfileIds: Array.isArray(profile.alternativeIdentityProfileIds) ? profile.alternativeIdentityProfileIds : [],
    status: profile.status ?? "enabled",
    schemaVersion: profile.schemaVersion ?? 1,
  };
}

/** Updates the one StateProfile matching `profile.id` in place if found, otherwise appends it as new. Never reorders the rest of the list, and never matches by anything other than id -- mirrors arc/urgeArcs.ts's upsertUrgeArcInList exactly. */
export function upsertStateProfileInList(profiles: StateProfile[], profile: StateProfile): StateProfile[] {
  const index = profiles.findIndex((existing) => existing.id === profile.id);
  if (index === -1) return [...profiles, profile];
  return profiles.map((existing, i) => (i === index ? profile : existing));
}

/**
 * Adaptive ARC architecture task, Phase 10 (StateProfile BUILD): the
 * minimum bar for PERSISTING a StateProfile at all -- deliberately not
 * "complete" or "ready for LIVE practice" (no such stronger validator
 * exists anywhere in this codebase yet, and this phase does not invent
 * one -- see this function's own two rules below, both already fully
 * implied by the existing data model: `name` is the one field every
 * `createEmptyStateProfile` caller must already supply, and
 * `ActionTimerConfig.durationMinutes`'s own doc already defines `null`
 * as "untimed" and implies a supplied value is a real duration, which
 * can never be zero, negative, or non-finite).
 *
 * A name-only StateProfile (every other field left null, exactly like
 * createEmptyStateProfile's own output) IS saveable -- "a name-only
 * profile may be saved for incremental editing" -- callers that also
 * want to communicate "not yet meaningfully practiceable" do so with
 * their own UI copy, never a second validator/source of truth here.
 *
 * Pure and read-only: never mutates `profile`.
 */
export function isStateProfileSaveable(profile: StateProfile): boolean {
  if (profile.name.trim().length === 0) return false;
  const durationMinutes = profile.actionTimerConfig?.durationMinutes;
  if (durationMinutes != null && !(Number.isFinite(durationMinutes) && durationMinutes > 0)) return false;
  return true;
}

/**
 * Adaptive ARC architecture task, Phase 14B-2: whether `profile` is
 * COMPLETE-FOR-PRACTICE -- distinct from, and strictly stronger than,
 * isStateProfileSaveable above (which stays the permanent, unchanged
 * name-only draft tolerance). No schema-version distinction is needed
 * here (unlike InterferenceItem's own schemaVersion 1/2 split): unlike
 * InterferenceItem.beneficialActionAgainstFactor, regulationAnchor/
 * encodingCue/action have existed on every StateProfile since Phase 3/10
 * -- there is no "old record that never had the field" case to
 * distinguish from "a new draft still missing it," so an old and a new
 * incomplete profile are treated identically, correctly, by this one
 * rule alone.
 *
 * Requires all three of: regulationAnchor, encodingCue, action -- a
 * State missing any of these can still be saved as a draft
 * (isStateProfileSaveable), but is never complete-for-practice.
 *
 * Pure and read-only: never mutates `profile`.
 */
export function isStateProfileCompleteForPractice(profile: StateProfile): boolean {
  return (profile.regulationAnchor ?? "").trim().length > 0 && (profile.encodingCue ?? "").trim().length > 0 && (profile.action ?? "").trim().length > 0;
}

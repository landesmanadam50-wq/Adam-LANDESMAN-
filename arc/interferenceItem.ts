/**
 * arc/interferenceItem.ts
 *
 * Adaptive ARC architecture task, Phase 3 (data-layer foundations),
 * spec section 4: the discriminated-union library type for a
 * lightweight, reusable interference item -- Thought/Belief/Urge/
 * Emotion -- that points AT a shared StateProfile (arc/stateProfile.ts)
 * rather than carrying a full protocol's worth of content itself. This
 * is the "NEW, factored item" arc/legacyDerivativeAdapter.ts's own
 * module doc anticipated: unlike a legacy UrgeArc/ThoughtArc/BeliefArc
 * (each a full, self-contained protocol), an InterferenceItem stores
 * only a STABLE REFERENCE to its linked StateProfile(s)/IdentityProfile
 * override, never a copy of their content (same "reference, never
 * duplicate" convention already used throughout this codebase --
 * ArcGoalInterferingMapping.supportiveProtocolId, MiniArcBuild.
 * parentArcBuildId, etc.).
 *
 * Presence is deliberately NOT a member of InterferenceCategory --
 * "Presence is not an InterferenceItem. Presence remains a rating-driven
 * preparation layer" (spec section 5), matching the existing Phase 2
 * arc/legacyDerivativeAdapter.ts's own AdaptedPresenceSource, which is
 * already a structurally separate shape for exactly this reason.
 *
 * Any number of these can exist at once, exactly like StateProfile/
 * IdentityProfile -- mirrors their list-manipulation pattern exactly.
 *
 * Pure logic only -- nothing in this repository calls anything below yet.
 */

import type { LibraryItemStatus, OwnedLibraryRecord } from "./libraryItemStatus.ts";

export type InterferenceCategory = "thought" | "belief" | "urge" | "emotion";

/**
 * Phase 3, spec section 10 ("Mini override placeholders"): the optional,
 * situation-specific short-circuit for ONE interference-to-State
 * mapping's own Mini ARC -- data shape only, never composed/rendered in
 * this phase (no fallback composer is implemented here -- "Do not
 * implement the fallback composer yet unless it already falls naturally
 * within an existing pure adapter and its tests," and it does not).
 * Every field is an independent override; an unset (null) field must
 * fall back to the Full State/Interference/Identity configuration in a
 * LATER phase -- nothing in this phase reads/resolves that fallback.
 * Never duplicates the full protocol's own content -- each field here is
 * a single short cue/action, mirroring MiniArcBuild's own "one Regulation
 * anchor"/"one Encoding action" brevity (arc/miniArc.ts), never a second
 * copy of StateProfile's/IdentityProfile's full field set.
 */
export interface MiniOverrideConfig {
  shortRecognitionCue: string | null;
  preventiveStoppingActionOverride: string | null;
  regulationAnchorOverride: string | null;
  encodingCueOverride: string | null;
  stateActionOverride: string | null;
  stateActionDurationOverrideMinutes: number | null;
  identityCueOverride: string | null;
  identityActionOverride: string | null;
}

export function createEmptyMiniOverrideConfig(): MiniOverrideConfig {
  return {
    shortRecognitionCue: null,
    preventiveStoppingActionOverride: null,
    regulationAnchorOverride: null,
    encodingCueOverride: null,
    stateActionOverride: null,
    stateActionDurationOverrideMinutes: null,
    identityCueOverride: null,
    identityActionOverride: null,
  };
}

/** Fields common to every InterferenceItem variant, regardless of category -- see each concrete variant below for its own category-specific fields. */
interface InterferenceItemBase extends OwnedLibraryRecord {
  name: string;
  description: string | null;
  situationContext: string | null;
  triggerInfo: string | null;
  /** The primary linked StateProfile this item points at -- see arc/libraryRelationships.ts's validateInterferenceItemPrimaryState for how a NEW (non-legacy) item is expected to always resolve this. */
  primaryStateProfileId: string | null;
  /** Optional alternative StateProfiles this item MAY also apply to -- never required, never implying multiple are active at once (spec section 5: "Only one InterferenceItem is selected in a future LIVE session," and that one item still resolves to exactly one State per session). */
  alternativeStateProfileIds: string[];
  /**
   * "Optional linked IdentityProfile ID when an item explicitly
   * overrides the State's primary Identity" -- see
   * arc/libraryRelationships.ts's resolveEffectiveIdentityForInterferenceItem
   * for the resolution order (this override, else the linked
   * StateProfile's own primaryIdentityProfileId, else null). Never
   * mutates the linked StateProfile's own field -- an override is
   * item-local only.
   */
  identityProfileIdOverride: string | null;
  miniOverride: MiniOverrideConfig | null;
  status: LibraryItemStatus;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** Reuses UrgeArc.representationPreference's own concept/value set (arc/types.ts's UrgeRepresentationPreference), renamed only for this library's own vocabulary ("sensory" here corresponds to that type's "bodily") -- never a second, incompatible representation system. */
export type InterferenceUrgeRepresentation = "visual" | "sensory" | "both" | "decide_in_live";

export interface ThoughtInterferenceItem extends InterferenceItemBase {
  category: "thought";
  thoughtText: string | null;
  acceptanceMantra: string | null;
  /** "Alternative interpretation or replacement thought" -- reuses ThoughtArc's own usefulInsight/supportiveThought concept, folded into one field here since an InterferenceItem is deliberately lightweight (never the full disturbing/supportive-route split a standalone ThoughtArc protocol has). */
  alternativeInterpretation: string | null;
  regulationCue: string | null;
  /** "Existing nod/body cue" -- reuses ThoughtArc.gentleNodCue's own concept. */
  existingNodCue: string | null;
}

export interface BeliefInterferenceItem extends InterferenceItemBase {
  category: "belief";
  beliefText: string | null;
  /** "Supportive or alternative belief" -- reuses BeliefArc.replacementBelief's own concept. */
  supportiveBelief: string | null;
  regulationCue: string | null;
}

export interface UrgeInterferenceItem extends InterferenceItemBase {
  category: "urge";
  /** "Urge name/type". */
  urgeName: string | null;
  /** Reuses UrgeArc.stopCue's own concept. */
  preventiveStoppingAction: string | null;
  representationPreference: InterferenceUrgeRepresentation;
  /** "Existing visual Encoding configuration" -- reuses UrgeArc.visualEncodingAction's own concept. */
  visualEncodingConfig: string | null;
  /** "Existing sensory Encoding configuration" -- reuses UrgeArc.bodilyEncodingAction's own concept. */
  sensoryEncodingConfig: string | null;
  regulationAnchor: string | null;
  /** "Relevant recheck configuration" -- whether/what a future LIVE session re-asks after this urge's own regulation step (mirrors the presence-recheck-loop precedent already in arc/arcEngine.ts, generalized here as a plain flag/prompt rather than a second engine). */
  recheckEnabled: boolean;
  recheckPrompt: string | null;
}

export interface EmotionInterferenceItem extends InterferenceItemBase {
  category: "emotion";
  emotionName: string | null;
  /**
   * "Supportive-State relationship" (spec section 4's Emotion variant) --
   * this IS `primaryStateProfileId` (the common field every variant
   * already has): an Emotion item's whole purpose is pointing at its
   * supportive State, so no separate/duplicate field is added here.
   */
  regulationCue: string | null;
}

export type InterferenceItem = ThoughtInterferenceItem | BeliefInterferenceItem | UrgeInterferenceItem | EmotionInterferenceItem;

function generateBaseFields(id: string, name: string, ownerProgramId: string | null, now: string): InterferenceItemBase {
  return {
    id,
    ownerProgramId,
    name,
    description: null,
    situationContext: null,
    triggerInfo: null,
    primaryStateProfileId: null,
    alternativeStateProfileIds: [],
    identityProfileIdOverride: null,
    miniOverride: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function generateInterferenceItemId(): string {
  return `interferenceitem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyThoughtInterferenceItem(id: string, name: string, ownerProgramId: string | null, now: string): ThoughtInterferenceItem {
  return {
    ...generateBaseFields(id, name, ownerProgramId, now),
    category: "thought",
    thoughtText: null,
    acceptanceMantra: null,
    alternativeInterpretation: null,
    regulationCue: null,
    existingNodCue: null,
  };
}

export function createEmptyBeliefInterferenceItem(id: string, name: string, ownerProgramId: string | null, now: string): BeliefInterferenceItem {
  return {
    ...generateBaseFields(id, name, ownerProgramId, now),
    category: "belief",
    beliefText: null,
    supportiveBelief: null,
    regulationCue: null,
  };
}

export function createEmptyUrgeInterferenceItem(id: string, name: string, ownerProgramId: string | null, now: string): UrgeInterferenceItem {
  return {
    ...generateBaseFields(id, name, ownerProgramId, now),
    category: "urge",
    urgeName: null,
    preventiveStoppingAction: null,
    representationPreference: "decide_in_live",
    visualEncodingConfig: null,
    sensoryEncodingConfig: null,
    regulationAnchor: null,
    recheckEnabled: false,
    recheckPrompt: null,
  };
}

export function createEmptyEmotionInterferenceItem(id: string, name: string, ownerProgramId: string | null, now: string): EmotionInterferenceItem {
  return {
    ...generateBaseFields(id, name, ownerProgramId, now),
    category: "emotion",
    emotionName: null,
    regulationCue: null,
  };
}

/** Updates the one InterferenceItem matching `item.id` in place if found, otherwise appends it as new -- mirrors arc/stateProfile.ts's upsertStateProfileInList exactly. Works across every category (the union's shared `id` field is all this needs). */
export function upsertInterferenceItemInList(items: InterferenceItem[], item: InterferenceItem): InterferenceItem[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, i) => (i === index ? item : existing));
}

/**
 * Defensive backfill for an InterferenceItem parsed from storage --
 * mirrors arc/stateProfile.ts's own normalizeStateProfile, but only for
 * the fields common to every category (a malformed category-specific
 * field is left as-is rather than guessed at, since this function has no
 * safe default to invent for e.g. a missing `thoughtText`). Preserves
 * `category` verbatim -- never reclassifies an item.
 */
export function normalizeInterferenceItem(item: InterferenceItem): InterferenceItem {
  return {
    ...item,
    ownerProgramId: item.ownerProgramId ?? null,
    description: item.description ?? null,
    situationContext: item.situationContext ?? null,
    triggerInfo: item.triggerInfo ?? null,
    primaryStateProfileId: item.primaryStateProfileId ?? null,
    alternativeStateProfileIds: Array.isArray(item.alternativeStateProfileIds) ? item.alternativeStateProfileIds : [],
    identityProfileIdOverride: item.identityProfileIdOverride ?? null,
    miniOverride: item.miniOverride ?? null,
    status: item.status ?? "enabled",
    schemaVersion: item.schemaVersion ?? 1,
  };
}

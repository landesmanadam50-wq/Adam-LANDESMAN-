/**
 * arc/legacyDerivativeAdapter.ts
 *
 * Adaptive ARC architecture task, decision 2 ("standalone derivative
 * practice is no longer a primary LIVE path"): the read-time
 * compatibility adapter for every existing standalone UrgeArc/
 * ThoughtArc/BeliefArc/PresenceArc record. Never mutates or deletes any
 * of them -- "Preserve existing standalone records... Old records should
 * open the corresponding item inside the active or archived program."
 *
 * These four record types are each a FULL, self-contained protocol
 * today (their own mantras/regulation anchor/action -- see the Phase 1
 * architecture report's own field-by-field comparison), not a lightweight
 * item pointing at a separately-configured, reusable State. Rather than
 * requiring every legacy record to be split apart before it can be used
 * by the adaptive composer, this adapter lets a legacy record act as ITS
 * OWN embedded State source: `selfContainedState` below is populated
 * directly from the legacy record's own fields, so a caller that expects
 * "an interference item with a linked State" can use one of these
 * unmodified, with the State simply being the record itself. A NEW,
 * factored item (created after this phase) would instead carry a real
 * `linkedStateId` referencing a separate, reusable State -- this
 * adapter's output intentionally has no such id, since none exists for
 * a legacy record.
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet.
 */

import type { BeliefArc, PresenceArc, ThoughtArc, UrgeArc } from "./types.ts";
import type { BeliefInterferenceItem, InterferenceItem, InterferenceUrgeRepresentation, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import type { LibraryValidationResult } from "./libraryRelationships.ts";

export type LegacyInterferenceCategory = "urge" | "thought" | "belief";

/**
 * One legacy standalone record, viewed as an adaptive-architecture
 * "interference item with its own embedded State" -- see this module's
 * own doc for why the State is embedded rather than a separate
 * reference. `uniqueFields` carries exactly the category-specific
 * fields the adaptive architecture's own item shape (spec §6) expects
 * (thought text/situation/alternative interpretation, etc.) -- read
 * directly off the legacy record, never invented or defaulted beyond
 * what the record itself already has (a field absent on the legacy
 * record stays null here, exactly as it is there).
 */
export interface AdaptedInterferenceSource {
  id: string;
  category: LegacyInterferenceCategory;
  name: string;
  uniqueFields: Record<string, string | null>;
  selfContainedState: {
    regulationAnchor: string | null;
    action: string | null;
  };
  legacySourceKind: "UrgeArc" | "ThoughtArc" | "BeliefArc";
  legacySourceId: string;
}

export function adaptUrgeArc(urgeArc: UrgeArc): AdaptedInterferenceSource {
  return {
    id: urgeArc.id,
    category: "urge",
    name: urgeArc.name,
    uniqueFields: {
      interferingAction: urgeArc.interferingAction,
      stopCue: urgeArc.stopCue,
      representationPreference: urgeArc.representationPreference,
      encodingMantra: urgeArc.encodingMantra,
    },
    selfContainedState: {
      regulationAnchor: urgeArc.regulationAnchor || null,
      action: urgeArc.beneficialAlternativeAction || null,
    },
    legacySourceKind: "UrgeArc",
    legacySourceId: urgeArc.id,
  };
}

export function adaptThoughtArc(thoughtArc: ThoughtArc): AdaptedInterferenceSource {
  return {
    id: thoughtArc.id,
    category: "thought",
    name: thoughtArc.name,
    uniqueFields: {
      thoughtText: thoughtArc.currentThought,
      situationContext: thoughtArc.situationContext,
      associatedEmotion: thoughtArc.associatedEmotion,
      stayMantra: thoughtArc.stayMantra,
      acceptanceMantra: thoughtArc.acceptanceMantra,
      // "Alternative interpretation or replacement thought" (spec §6) --
      // a disturbing-thought ThoughtArc carries this as usefulInsight,
      // a supportive-thought one as supportiveThought; both are read
      // through, never merged into one invented field.
      usefulInsight: thoughtArc.usefulInsight,
      supportiveThought: thoughtArc.supportiveThought,
    },
    selfContainedState: {
      regulationAnchor: thoughtArc.encodingAnchor,
      action: thoughtArc.shortAction,
    },
    legacySourceKind: "ThoughtArc",
    legacySourceId: thoughtArc.id,
  };
}

export function adaptBeliefArc(beliefArc: BeliefArc): AdaptedInterferenceSource {
  return {
    id: beliefArc.id,
    category: "belief",
    name: beliefArc.name,
    uniqueFields: {
      limitingBelief: beliefArc.limitingBelief,
      situationContext: beliefArc.situationContext,
      replacementBelief: beliefArc.replacementBelief,
      bridgeMantra: beliefArc.bridgeMantra,
    },
    selfContainedState: {
      regulationAnchor: beliefArc.regulationAnchor,
      action: beliefArc.shortAction,
    },
    legacySourceKind: "BeliefArc",
    legacySourceId: beliefArc.id,
  };
}

/**
 * Presence is never an "interference item" (decision "Presence...
 * does not count as the selected interfering derivative") -- it becomes
 * the rating-driven preparation layer itself (decision 2: "Presence
 * becomes the rating-driven preparation layer"). This adapter therefore
 * produces a SEPARATE shape, never an AdaptedInterferenceSource, so a
 * future caller can never accidentally offer a legacy PresenceArc as a
 * selectable derivative.
 */
export interface AdaptedPresenceSource {
  id: string;
  name: string;
  presenceColor: string | null;
  presenceDwellSeconds: number | null;
  action: string | null;
  legacySourceId: string;
}

export function adaptPresenceArc(presenceArc: PresenceArc): AdaptedPresenceSource {
  return {
    id: presenceArc.id,
    name: presenceArc.name,
    presenceColor: presenceArc.presenceColor,
    presenceDwellSeconds: presenceArc.presenceDwellSeconds,
    action: presenceArc.beneficialAction,
    legacySourceId: presenceArc.id,
  };
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 3 (data-layer foundations), spec
// section 8 ("Legacy derivative adapter"): forward-compatible
// InterferenceItem projections of the SAME legacy records adapted above
// -- built directly from adaptUrgeArc/adaptThoughtArc/adaptBeliefArc's
// own output (never a second, divergent read of the source record), so a
// caller that already expects "an InterferenceItem" (Phase 3's own new
// library shape) can consume a legacy record without every call site
// having to know about AdaptedInterferenceSource separately.
//
// "Do not mutate the input. Do not write adapted data back to storage."
// -- every function below is a pure read, exactly like the adapters
// above; nothing here performs I/O.
// "Preserve existing identifiers where safe" -- the legacy record's own
// id is reused verbatim as the projected item's id (never a fresh
// generated id), matching adaptUrgeArc/adaptThoughtArc/adaptBeliefArc's
// own existing convention.
// "A marker indicating that a legacy fallback was used" -- every result
// below carries legacyFallbackUsed: true (a literal type, never false),
// plus legacySourceKind/legacySourceId for traceability back to the
// original record.
// "Presence legacy records must remain readable, but Presence must not
// become an InterferenceItem" -- deliberately no
// adaptPresenceArcToInterferenceItem function exists; adaptPresenceArc
// above (a structurally separate AdaptedPresenceSource, never a member
// of InterferenceItem) remains the only Presence adapter.
// ---------------------------------------------------------------------------

/**
 * The result of projecting one legacy standalone record into an
 * InterferenceItem shape. `item.primaryStateProfileId` is always null
 * here (never invented): a legacy record's own equivalent State content
 * lives in `item`'s category-specific fields directly (mirroring
 * AdaptedInterferenceSource.selfContainedState above), never as a
 * reference to a separate StateProfile that doesn't exist for it.
 */
export interface LegacyInterferenceCompatibilityResult {
  item: InterferenceItem;
  legacyFallbackUsed: true;
  legacySourceKind: "UrgeArc" | "ThoughtArc" | "BeliefArc";
  legacySourceId: string;
}

/**
 * UrgeArc.representationPreference (arc/types.ts's UrgeRepresentationPreference
 * = "visual" | "bodily" | "both" | "unsure" | "decide_in_live") uses a
 * different vocabulary than InterferenceUrgeRepresentation ("sensory"
 * instead of "bodily", no "unsure" member): "bodily" maps onto
 * "sensory" (the same concept, this library's own naming), and "unsure"
 * -- like "decide_in_live" -- means no BUILD-time commitment, so both
 * fold onto "decide_in_live" here. Never a lossy guess: every legacy
 * value maps onto its closest equivalent, never an invented one.
 */
function mapLegacyUrgeRepresentation(preference: UrgeArc["representationPreference"]): InterferenceUrgeRepresentation {
  switch (preference) {
    case "visual":
      return "visual";
    case "bodily":
      return "sensory";
    case "both":
      return "both";
    case "unsure":
    case "decide_in_live":
    case null:
    default:
      return "decide_in_live";
  }
}

/** ownerProgramId is always null for a legacy-adapted item -- these records predate the Self Development program-ownership concept entirely (see arc/stateProfile.ts's own doc on why a StateProfile's ownerProgramId is nullable for the identical reason); never guessed from context. */
export function adaptUrgeArcToInterferenceItem(urgeArc: UrgeArc): LegacyInterferenceCompatibilityResult {
  const item: UrgeInterferenceItem = {
    id: urgeArc.id,
    ownerProgramId: null,
    category: "urge",
    name: urgeArc.name,
    description: null,
    situationContext: null,
    triggerInfo: urgeArc.mappedTriggers.length > 0 ? urgeArc.mappedTriggers.join(", ") : null,
    primaryStateProfileId: null,
    alternativeStateProfileIds: [],
    identityProfileIdOverride: null,
    miniOverride: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: urgeArc.createdAt,
    updatedAt: urgeArc.updatedAt,
    urgeName: urgeArc.interferingAction || null,
    preventiveStoppingAction: urgeArc.stopCue,
    representationPreference: mapLegacyUrgeRepresentation(urgeArc.representationPreference),
    visualEncodingConfig: urgeArc.visualEncodingAction,
    sensoryEncodingConfig: urgeArc.bodilyEncodingAction,
    regulationAnchor: urgeArc.regulationAnchor || null,
    recheckEnabled: false,
    recheckPrompt: null,
  };
  return { item, legacyFallbackUsed: true, legacySourceKind: "UrgeArc", legacySourceId: urgeArc.id };
}

export function adaptThoughtArcToInterferenceItem(thoughtArc: ThoughtArc): LegacyInterferenceCompatibilityResult {
  const item: ThoughtInterferenceItem = {
    id: thoughtArc.id,
    ownerProgramId: null,
    category: "thought",
    name: thoughtArc.name,
    description: null,
    situationContext: thoughtArc.situationContext,
    triggerInfo: null,
    primaryStateProfileId: null,
    alternativeStateProfileIds: [],
    identityProfileIdOverride: null,
    miniOverride: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: thoughtArc.createdAt,
    updatedAt: thoughtArc.updatedAt,
    thoughtText: thoughtArc.currentThought,
    acceptanceMantra: thoughtArc.acceptanceMantra,
    // Spec section 8: an incomplete legacy record still returns a safe,
    // typed compatibility result rather than crashing -- a
    // disturbing-thought ThoughtArc carries this as usefulInsight, a
    // supportive-thought one as supportiveThought; neither is required.
    alternativeInterpretation: thoughtArc.usefulInsight ?? thoughtArc.supportiveThought ?? null,
    regulationCue: thoughtArc.encodingAnchor,
    existingNodCue: thoughtArc.gentleNodCue,
  };
  return { item, legacyFallbackUsed: true, legacySourceKind: "ThoughtArc", legacySourceId: thoughtArc.id };
}

export function adaptBeliefArcToInterferenceItem(beliefArc: BeliefArc): LegacyInterferenceCompatibilityResult {
  const item: BeliefInterferenceItem = {
    id: beliefArc.id,
    ownerProgramId: null,
    category: "belief",
    name: beliefArc.name,
    description: null,
    situationContext: beliefArc.situationContext,
    triggerInfo: null,
    primaryStateProfileId: null,
    alternativeStateProfileIds: [],
    identityProfileIdOverride: null,
    miniOverride: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: beliefArc.createdAt,
    updatedAt: beliefArc.updatedAt,
    beliefText: beliefArc.limitingBelief,
    supportiveBelief: beliefArc.replacementBelief,
    regulationCue: beliefArc.regulationAnchor,
  };
  return { item, legacyFallbackUsed: true, legacySourceKind: "BeliefArc", legacySourceId: beliefArc.id };
}

/**
 * Spec section 5/9: "Missing State in a legacy record returns safe
 * compatibility status" -- a legacy-adapted item is never checked
 * against arc/libraryRelationships.ts's validateInterferenceItemPrimaryState
 * (which requires a real StateProfile reference); instead its own
 * embedded selfContainedState content (from adaptUrgeArc/adaptThoughtArc/
 * adaptBeliefArc above) is what "counts" as its State. This function
 * returns a typed, non-throwing result either way -- valid when the
 * legacy record actually has SOME usable self-contained content
 * (a regulation anchor or an action), a safe "incomplete" result
 * (never a crash) when it has neither.
 */
export function describeLegacyInterferenceCompatibility(source: AdaptedInterferenceSource): LibraryValidationResult {
  const hasContent = source.selfContainedState.regulationAnchor !== null || source.selfContainedState.action !== null;
  return hasContent
    ? { valid: true, source: "legacy", reason: null }
    : { valid: false, source: "legacy", reason: "legacy_self_contained_state_empty" };
}

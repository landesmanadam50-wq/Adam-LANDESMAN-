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

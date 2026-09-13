/**
 * arc/beliefArcs.ts
 *
 * Pure list-manipulation logic behind data/storage.ts's BeliefArc CRUD
 * -- mirrors arc/thoughtArcs.ts/arc/urgeArcs.ts exactly: creating/
 * editing/deleting one BeliefArc never touches another.
 */

import type { ArcBuildProfile, BeliefArc } from "./types.ts";
import { generateBeliefArcId } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function safeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

/** Updates the one BeliefArc matching `beliefArc.id` in place if found, otherwise appends it as new. */
export function upsertBeliefArcInList(beliefArcs: BeliefArc[], beliefArc: BeliefArc): BeliefArc[] {
  const index = beliefArcs.findIndex((existing) => existing.id === beliefArc.id);
  if (index === -1) return [...beliefArcs, beliefArc];
  return beliefArcs.map((existing, i) => (i === index ? beliefArc : existing));
}

/** Removes exactly the one BeliefArc matching `id` -- every other row is returned as the exact same object it already was. */
export function deleteBeliefArcFromList(beliefArcs: BeliefArc[], id: string): BeliefArc[] {
  return beliefArcs.filter((beliefArc) => beliefArc.id !== id);
}

/** A new, independent copy under a fresh id -- never shares an id with, or mutates, the original. */
export function duplicateBeliefArc(beliefArc: BeliefArc, now: string): BeliefArc {
  return { ...beliefArc, id: generateBeliefArcId(), name: `${beliefArc.name} (עותק)`, createdAt: now, updatedAt: now };
}

// ---------------------------------------------------------------------------
// BUILD-facing draft shape -- mirrors ThoughtArcDraft/UrgeArcDraft's own
// pattern, ONE flat form (build/BeliefArcEditorScreen.tsx).
// ---------------------------------------------------------------------------

export interface BeliefArcDraft {
  name: string;
  limitingBelief: string;
  situationContext: string;
  associatedEmotion: string;
  stayMantra: string;
  acceptanceMantra: string;
  regulationMantra: string;
  regulationAnchor: string;
  bridgeMantra: string;
  replacementBelief: string;
  encodingAnchor: string;
  gentleNodCue: string;
  supportiveImage: string;
  supportiveVoiceInstruction: string;
  futureInsight: string;
  futureAction: string;
  shortAction: string;
  futureImageryDwellSeconds: string;
  postActionImageryDwellSeconds: string;
  gratitudePrompt: string;
}

export function createEmptyBeliefArcDraft(): BeliefArcDraft {
  return {
    name: "",
    limitingBelief: "",
    situationContext: "",
    associatedEmotion: "",
    stayMantra: "",
    acceptanceMantra: "",
    regulationMantra: "",
    regulationAnchor: "",
    bridgeMantra: "",
    replacementBelief: "",
    encodingAnchor: "",
    gentleNodCue: "",
    supportiveImage: "",
    supportiveVoiceInstruction: "",
    futureInsight: "",
    futureAction: "",
    shortAction: "",
    futureImageryDwellSeconds: "",
    postActionImageryDwellSeconds: "",
    gratitudePrompt: "",
  };
}

export function draftFromBeliefArc(beliefArc: BeliefArc): BeliefArcDraft {
  return {
    name: safeText(beliefArc.name),
    limitingBelief: safeText(beliefArc.limitingBelief),
    situationContext: safeText(beliefArc.situationContext),
    associatedEmotion: safeText(beliefArc.associatedEmotion),
    stayMantra: safeText(beliefArc.stayMantra),
    acceptanceMantra: safeText(beliefArc.acceptanceMantra),
    regulationMantra: safeText(beliefArc.regulationMantra),
    regulationAnchor: safeText(beliefArc.regulationAnchor),
    bridgeMantra: safeText(beliefArc.bridgeMantra),
    replacementBelief: safeText(beliefArc.replacementBelief),
    encodingAnchor: safeText(beliefArc.encodingAnchor),
    gentleNodCue: safeText(beliefArc.gentleNodCue),
    supportiveImage: safeText(beliefArc.supportiveImage),
    supportiveVoiceInstruction: safeText(beliefArc.supportiveVoiceInstruction),
    futureInsight: safeText(beliefArc.futureInsight),
    futureAction: safeText(beliefArc.futureAction),
    shortAction: safeText(beliefArc.shortAction),
    futureImageryDwellSeconds: beliefArc.futureImageryDwellSeconds != null ? String(beliefArc.futureImageryDwellSeconds) : "",
    postActionImageryDwellSeconds: beliefArc.postActionImageryDwellSeconds != null ? String(beliefArc.postActionImageryDwellSeconds) : "",
    gratitudePrompt: safeText(beliefArc.gratitudePrompt),
  };
}

/** Only a name is required -- every other field is optional/decide-in-LIVE by design, matching ThoughtArcDraft's own minimal-completeness bar. */
export function isBeliefArcDraftComplete(draft: BeliefArcDraft): boolean {
  return draft.name.trim().length > 0;
}

function parseOptionalDwellSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/** Builds a real, persistable BeliefArc from a complete draft. Throws for an incomplete draft -- callers must gate on isBeliefArcDraftComplete first. */
export function buildBeliefArcFromDraft(draft: BeliefArcDraft, id: string, createdAt: string, updatedAt: string): BeliefArc {
  if (!isBeliefArcDraftComplete(draft)) {
    throw new Error("Cannot build a BeliefArc from an incomplete draft");
  }
  const trimmedOrNull = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    id,
    name: draft.name.trim(),
    createdAt,
    updatedAt,
    limitingBelief: trimmedOrNull(draft.limitingBelief),
    situationContext: trimmedOrNull(draft.situationContext),
    associatedEmotion: trimmedOrNull(draft.associatedEmotion),
    stayMantra: trimmedOrNull(draft.stayMantra),
    acceptanceMantra: trimmedOrNull(draft.acceptanceMantra),
    regulationMantra: trimmedOrNull(draft.regulationMantra),
    regulationAnchor: trimmedOrNull(draft.regulationAnchor),
    bridgeMantra: trimmedOrNull(draft.bridgeMantra),
    replacementBelief: trimmedOrNull(draft.replacementBelief),
    encodingAnchor: trimmedOrNull(draft.encodingAnchor),
    gentleNodCue: trimmedOrNull(draft.gentleNodCue),
    supportiveImage: trimmedOrNull(draft.supportiveImage),
    supportiveVoiceInstruction: trimmedOrNull(draft.supportiveVoiceInstruction),
    futureInsight: trimmedOrNull(draft.futureInsight),
    futureAction: trimmedOrNull(draft.futureAction),
    shortAction: trimmedOrNull(draft.shortAction),
    futureImageryDwellSeconds: parseOptionalDwellSeconds(draft.futureImageryDwellSeconds),
    postActionImageryDwellSeconds: parseOptionalDwellSeconds(draft.postActionImageryDwellSeconds),
    gratitudePrompt: trimmedOrNull(draft.gratitudePrompt),
  };
}

/**
 * Backward compatibility: backfills every BeliefArc saved before a
 * later field existed -- mirrors normalizeThoughtArc/normalizeUrgeArc
 * exactly (safe defaults, never invented content, never overwrites an
 * already-configured field). Applied once, at load time.
 */
export function normalizeBeliefArc(beliefArc: BeliefArc): BeliefArc {
  return {
    ...beliefArc,
    limitingBelief: beliefArc.limitingBelief ?? null,
    situationContext: beliefArc.situationContext ?? null,
    associatedEmotion: beliefArc.associatedEmotion ?? null,
    stayMantra: beliefArc.stayMantra ?? null,
    acceptanceMantra: beliefArc.acceptanceMantra ?? null,
    regulationMantra: beliefArc.regulationMantra ?? null,
    regulationAnchor: beliefArc.regulationAnchor ?? null,
    bridgeMantra: beliefArc.bridgeMantra ?? null,
    replacementBelief: beliefArc.replacementBelief ?? null,
    encodingAnchor: beliefArc.encodingAnchor ?? null,
    gentleNodCue: beliefArc.gentleNodCue ?? null,
    supportiveImage: beliefArc.supportiveImage ?? null,
    supportiveVoiceInstruction: beliefArc.supportiveVoiceInstruction ?? null,
    futureInsight: beliefArc.futureInsight ?? null,
    futureAction: beliefArc.futureAction ?? null,
    shortAction: beliefArc.shortAction ?? null,
    futureImageryDwellSeconds: beliefArc.futureImageryDwellSeconds ?? null,
    postActionImageryDwellSeconds: beliefArc.postActionImageryDwellSeconds ?? null,
    gratitudePrompt: beliefArc.gratitudePrompt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 spec sections 3/20/26 ("Reuse and migrate/fallback to these
// existing fields where appropriate... Prefer existing:
// identityBridgeBelief / bridgeMantraText / replacementBelief. Document
// the fallback order between these fields."). Each resolver below is
// pure and documents ONE fallback chain; none of them ever mutate or
// persist anything -- callers decide when/whether to prefill a draft
// with the resolved value. BeliefArc's OWN field always wins when set;
// these only ever fill a genuine gap.
// ---------------------------------------------------------------------------

/**
 * limitingBelief fallback order: this BeliefArc's own value, then the
 * existing per-layer Limiting Belief already configured on a regular
 * ARC Map (identity first, since ARC Belief is conceptually closest to
 * the identity layer's own recurring self/other/world beliefs -- state
 * second, for a trainee who only ever configured the state layer's
 * own Awareness step). null profile (no regular ARC Map yet) or every
 * field unset simply means "not resolved" -- never invented.
 */
export function resolveBeliefFallbackLimitingBelief(beliefArc: BeliefArc | null, profile: ArcBuildProfile | null): string | null {
  const own = safeText(beliefArc?.limitingBelief);
  if (own.length > 0) return own;
  const identity = safeText(profile?.identityLimitingBelief);
  if (identity.length > 0) return identity;
  const state = safeText(profile?.stateLimitingBelief);
  if (state.length > 0) return state;
  return null;
}

/**
 * replacementBelief fallback order: this BeliefArc's own value, then a
 * linked MiniArcBuild's own replacementBelief (spec: "Reuse data from
 * linked... Belief records when possible"), then the existing
 * identityBridgeBelief/stateBridgeBelief (the regular ARC Map's own
 * "empowering reframe" -- semantically identical to a replacement
 * belief, per arc/types.ts's own doc for those two fields).
 */
export function resolveBeliefFallbackReplacementBelief(beliefArc: BeliefArc | null, linkedMini: MiniArcBuild | null, profile: ArcBuildProfile | null): string | null {
  const own = safeText(beliefArc?.replacementBelief);
  if (own.length > 0) return own;
  const mini = safeText(linkedMini?.replacementBelief);
  if (mini.length > 0) return mini;
  const identity = safeText(profile?.identityBridgeBelief);
  if (identity.length > 0) return identity;
  const state = safeText(profile?.stateBridgeBelief);
  if (state.length > 0) return state;
  return null;
}

/**
 * bridgeMantra fallback order: this BeliefArc's own value, then a
 * linked MiniArcBuild's own bridgeMantraText. No ArcBuildProfile-level
 * equivalent exists for the Bridge Mantra concept specifically (that
 * shared field lives on ArcBuildProfile.bridgeMantra for the regular
 * engine's own Regulation-tail line, a different per-user concept from
 * a specific BeliefArc's own transition mantra) -- so this chain stops
 * at the linked Mini. Missing entirely: spec section 9 requires
 * "Allow continuing. Do not invent one."
 */
export function resolveBeliefFallbackBridgeMantra(beliefArc: BeliefArc | null, linkedMini: MiniArcBuild | null): string | null {
  const own = safeText(beliefArc?.bridgeMantra);
  if (own.length > 0) return own;
  const mini = safeText(linkedMini?.bridgeMantraText);
  if (mini.length > 0) return mini;
  return null;
}

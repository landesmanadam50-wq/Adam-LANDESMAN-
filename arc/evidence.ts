/**
 * arc/evidence.ts
 *
 * Personal evidence for Encoding's Identity/Mantra: instead of an
 * unsupported affirmation, Encoding first surfaces a REAL past
 * behavioral success or a protocol-linked Gratitude entry -- something
 * the trainee actually did or actually felt -- from their own existing
 * ARCHI history (data/sessionLog.ts's SessionLogEntry[], the ONE
 * existing history store; no second, parallel evidence database).
 *
 * There is no AI/LLM service anywhere in this codebase (checked before
 * writing this file), and none is added here: "selection"/"ranking" is
 * a small, deterministic, fully-explainable TypeScript function over
 * already-stored data, never a generative call. This is a deliberate
 * safety property, not a shortcut -- see the module-wide anti-
 * fabrication rule below.
 *
 * Anti-fabrication, by construction: every EvidenceRecord's `text` and
 * `memoryDetail` are copied VERBATIM from a SessionLogEntry the trainee
 * themselves produced (a real completed action, or their own typed
 * Gratitude/memory-detail text) -- this module never generates,
 * rephrases, or invents any of that text. There is therefore no
 * "AI-generated presentation text becoming a new historical source"
 * risk to guard against: presentation IS the original stored text,
 * always traceable back to its own sourceSessionId (see the
 * "provenance" doc below) and never re-persisted as if it were a new,
 * independent event.
 *
 * Relevance matching is STRUCTURAL, not semantic/NLP: a record is
 * considered relevant to the CURRENT Encoding context when it was
 * itself captured during a session that targeted the exact SAME
 * layer + identity-ish label (supportiveState/desiredIdentity/
 * beneficialAction) as right now (see relevanceScore's structural
 * branch), with a narrow secondary allowance for a record whose own
 * text literally names the current identity/goal/habit (the content
 * branch) -- e.g. a Gratitude entry that explicitly mentions the
 * Desired State by name, even if it happened to be logged during a
 * session that didn't structurally target it. No fuzzy/semantic text
 * similarity is attempted (this app has no NLP capability to do that
 * honestly), so an evidence item is either genuinely tied to the
 * current target or it is correctly left out -- see #17 "no-match
 * behavior": skipping evidence is always safer than presenting a weak
 * or coincidental match.
 */

import type { ArcBuildProfile, DevelopmentLayer, EncodingProfile } from "./types.ts";
import type { SessionEvidenceContext, SessionLogEntry } from "../data/sessionLog.ts";

export type EvidenceSourceType = "beneficial_action" | "gratitude";

/**
 * A lightweight, DERIVED view of one real stored fact from a single
 * SessionLogEntry -- never a copy of the whole history, never a second
 * persisted store (see buildEvidenceIndex: this is recomputed from the
 * session log every time, not saved anywhere new). `sourceSessionId`
 * is this record's provenance: exactly which SessionLogEntry.id it came
 * from, so a caller can always trace a surfaced item back to its real
 * source and so a memoryDetail can only ever be paired with evidence
 * from that SAME session (see the "same-source rule" in
 * selectEncodingEvidence's caller, arc/stageCopy.ts).
 */
export interface EvidenceRecord {
  sourceType: EvidenceSourceType;
  /** SessionLogEntry.id this record was derived from -- provenance link, never invented, never re-pointed. */
  sourceSessionId: string;
  timestamp: string; // SessionLogEntry.finishedAt
  /** The real stored text -- the completed action's own label (beneficial_action) or the trainee's own typed Gratitude (gratitude). Always verbatim; never generated or rephrased by this module. */
  text: string;
  /** The SAME session's own concrete memory detail, when the trainee provided one -- null when they didn't (never invented -- see #9/#17). Always from the SAME sourceSessionId as `text` above, by construction (both are read from the one SessionLogEntry). */
  memoryDetail: string | null;
  targetLayer: DevelopmentLayer | null;
  identityLabel: string | null;
  goal: string | null;
  habit: string | null;
  interferingState: string | null;
  challengeContext: string | null;
}

/** The CURRENT Encoding session's own target -- what a candidate EvidenceRecord is judged for relevance against. Built once per Encoding render from the already-resolved layer/encoding/profile (arc/arcEngine.ts's resolveEncodingTarget), never re-derived independently. */
export interface EncodingEvidenceContext {
  targetLayer: DevelopmentLayer;
  identityLabel: string | null;
  goal: string | null;
  habit: string | null;
}

/**
 * The resolved layer's own "identity-ish" label -- supportiveState
 * (state) / desiredIdentity (identity) / beneficialAction (habit).
 * Reuses resolveEncodingTarget's ALREADY-resolved `encoding.target`
 * (which arc/arcEngine.ts's EncodingResolution sets to exactly
 * supportiveState/desiredIdentity for those two layers -- see
 * build/profileWizard.ts's buildEncodingProfile) rather than
 * re-deriving the same switch a second time; habit has no
 * EncodingProfile of its own, so it falls back to profile.beneficialAction
 * directly, the one place that label lives for that layer.
 */
export function resolveIdentityLabelForLayer(
  layer: DevelopmentLayer,
  encoding: EncodingProfile | null,
  profile: ArcBuildProfile
): string | null {
  if (layer === "habit") return profile.beneficialAction;
  return encoding?.target ?? null;
}

function resolveInterferingStateForLayer(layer: DevelopmentLayer, profile: ArcBuildProfile): string | null {
  switch (layer) {
    case "state":
      return profile.interferingState;
    case "identity":
      return profile.identityInterferingEmotion;
    case "habit":
      return null;
  }
}

function resolveChallengeContextForLayer(layer: DevelopmentLayer, profile: ArcBuildProfile): string | null {
  switch (layer) {
    case "state":
      return profile.challengeContext;
    case "identity":
      return profile.identityChallengeContext;
    case "habit":
      return null;
  }
}

/**
 * Builds the context snapshot a just-finished session should carry
 * forward on its own SessionLogEntry (data/storage.ts's
 * finalizeSession calls this once, at "complete") -- and, with the
 * exact same inputs, the CURRENT context a live Encoding screen judges
 * candidate evidence against (arc/stageCopy.ts's "encode" case). Same
 * function, two call sites, so the two can never silently drift apart.
 */
export function resolveEvidenceContext(
  layer: DevelopmentLayer,
  encoding: EncodingProfile | null,
  profile: ArcBuildProfile
): { identityLabel: string | null; interferingState: string | null; challengeContext: string | null } {
  return {
    identityLabel: resolveIdentityLabelForLayer(layer, encoding, profile),
    interferingState: resolveInterferingStateForLayer(layer, profile),
    challengeContext: resolveChallengeContextForLayer(layer, profile),
  };
}

/**
 * The CURRENT Encoding session's own relevance target -- the layer
 * actually resolved for encode/act, plus the profile-level fields
 * evidence can be matched against. Callers pass in the SAME
 * layer/encoding resolveEncodingTarget already returned for this
 * session (arc/stageCopy.ts's "encode" case), never re-resolving it.
 */
export function resolveEncodingEvidenceContext(
  layer: DevelopmentLayer,
  encoding: EncodingProfile | null,
  profile: ArcBuildProfile
): EncodingEvidenceContext {
  return {
    targetLayer: layer,
    identityLabel: resolveIdentityLabelForLayer(layer, encoding, profile),
    goal: profile.goal,
    habit: profile.habit,
  };
}

/**
 * A completed session's own context, for SessionLogEntry.context --
 * captured once at "complete" via the SAME resolver Encoding itself
 * uses (resolveEvidenceContext above), from that session's own
 * triggerType/selectedTarget/selectedAction. Real, resolved data only
 * -- never inferred beyond what ArcBuildProfile/ArcLiveState already
 * hold at that moment.
 */
export function buildSessionEvidenceContext(
  layer: DevelopmentLayer,
  encoding: EncodingProfile | null,
  currentAction: string | null,
  profile: ArcBuildProfile
): SessionEvidenceContext {
  const { identityLabel, interferingState, challengeContext } = resolveEvidenceContext(layer, encoding, profile);
  return {
    targetLayer: layer,
    identityLabel,
    goal: profile.goal,
    habit: profile.habit,
    currentAction,
    interferingState,
    challengeContext,
  };
}

/**
 * Derives the lightweight evidence index directly from the trainee's
 * EXISTING session log -- computed fresh every time this is called,
 * never persisted as a second store (#11 "prefer a lightweight
 * derived/indexed representation... do not duplicate the user's entire
 * historical database"). One SessionLogEntry can yield up to two
 * EvidenceRecords (a real completed action AND a written Gratitude),
 * both correctly sharing the same sourceSessionId/memoryDetail -- never
 * more than the two source types this codebase actually has real,
 * stored signals for (see this module's doc: no fabricated
 * "focus_success"/"reinforcement" source types with no real backing
 * data behind them). A session with neither a completed real action nor
 * any written Gratitude contributes nothing, correctly.
 */
export function buildEvidenceIndex(sessionLog: SessionLogEntry[]): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  for (const entry of sessionLog) {
    const ctx = entry.context ?? null;
    const memoryDetail = entry.gratitudeMemoryDetail?.trim() || null;

    if (entry.success && ctx?.currentAction) {
      records.push({
        sourceType: "beneficial_action",
        sourceSessionId: entry.id,
        timestamp: entry.finishedAt,
        text: ctx.currentAction,
        memoryDetail,
        targetLayer: ctx.targetLayer,
        identityLabel: ctx.identityLabel,
        goal: ctx.goal,
        habit: ctx.habit,
        interferingState: ctx.interferingState,
        challengeContext: ctx.challengeContext,
      });
    }

    const gratitudeText = entry.gratitude?.trim() || null;
    if (gratitudeText) {
      records.push({
        sourceType: "gratitude",
        sourceSessionId: entry.id,
        timestamp: entry.finishedAt,
        text: gratitudeText,
        memoryDetail,
        targetLayer: ctx?.targetLayer ?? null,
        identityLabel: ctx?.identityLabel ?? null,
        goal: ctx?.goal ?? null,
        habit: ctx?.habit ?? null,
        interferingState: ctx?.interferingState ?? null,
        challengeContext: ctx?.challengeContext ?? null,
      });
    }
  }
  return records;
}

/**
 * A short text is treated as too thin to count as a meaningful keyword
 * match on its own (avoids e.g. a 2-letter word coincidentally
 * appearing inside unrelated text) -- structural (same layer+identity)
 * relevance below has no such floor, since it's a real, exact
 * same-target signal rather than a substring heuristic.
 */
const MIN_KEYWORD_LENGTH = 3;

/**
 * 2 = a real STRUCTURAL match: this record was captured during a
 * session that targeted the exact same layer + identity-ish label as
 * right now -- the strongest, most honest relevance signal this app
 * can produce without semantic/NLP text analysis (see this module's
 * doc). 1 = a narrower CONTENT match: no structural link, but the
 * record's own text literally names the current identity/goal/habit
 * (e.g. a Gratitude that explicitly names the Desired State). 0 = ANY
 * eventual falls below the priority-rule "sufficiently relevant" bar,
 * correctly.
 */
function relevanceScore(record: EvidenceRecord, context: EncodingEvidenceContext): number {
  const structuralMatch =
    record.targetLayer === context.targetLayer && context.identityLabel !== null && record.identityLabel === context.identityLabel;
  if (structuralMatch) return 2;

  const keywords = [context.identityLabel, context.goal, context.habit].filter(
    (value): value is string => !!value && value.trim().length >= MIN_KEYWORD_LENGTH
  );
  if (keywords.some((keyword) => record.text.includes(keyword))) return 1;

  return 0;
}

const MIN_RELEVANCE_SCORE = 1;
/** #14: at most two items, and only when both are highly (structurally) relevant. */
const MAX_EVIDENCE_ITEMS = 2;
const STRUCTURAL_MATCH_SCORE = 2;

/**
 * Selects evidence for the CURRENT Encoding context, applying the
 * priority rule (#7): behavioral evidence before Gratitude, more
 * relevant before less relevant, more recent before older -- and #14's
 * "one by default, two only when both are highly relevant". Returns []
 * when nothing clears the relevance bar -- the caller (arc/stageCopy.ts)
 * then proceeds straight to Identity/Mantra with no evidence line at
 * all, per #17 "no-match behavior": skipping is always safer than a
 * weak/irrelevant item.
 */
export function selectEncodingEvidence(
  index: EvidenceRecord[],
  context: EncodingEvidenceContext,
  maxItems: number = 1
): EvidenceRecord[] {
  const scored = index
    .map((record) => ({ record, score: relevanceScore(record, context) }))
    .filter((entry) => entry.score >= MIN_RELEVANCE_SCORE);

  const sourceTypeRank = (type: EvidenceSourceType) => (type === "beneficial_action" ? 0 : 1);
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const typeDiff = sourceTypeRank(a.record.sourceType) - sourceTypeRank(b.record.sourceType);
    if (typeDiff !== 0) return typeDiff;
    return b.record.timestamp.localeCompare(a.record.timestamp);
  });

  const cap = Math.max(1, Math.min(MAX_EVIDENCE_ITEMS, maxItems));
  const top = scored.slice(0, cap);
  if (top.length === MAX_EVIDENCE_ITEMS && top[1].score < STRUCTURAL_MATCH_SCORE) {
    // The second item isn't itself highly (structurally) relevant on its
    // own -- keep only the strongest single item rather than padding
    // with a merely-plausible second one (#14).
    return [top[0].record];
  }
  return top.map((entry) => entry.record);
}

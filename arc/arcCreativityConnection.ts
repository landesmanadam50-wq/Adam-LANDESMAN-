/**
 * arc/arcCreativityConnection.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task: ARC
 * Creativity's four modes (section 4) share one saved-relationship
 * record -- ArcCreativityConnection -- distinguished only by `source`
 * (which mode produced it) and `classification` (how certain the
 * relationship is). Pure data model + logic only, no AsyncStorage/
 * navigation/React.
 *
 * Section 5: "store references to existing insights, never duplicate
 * them" -- insightIdA/insightIdB are plain ArcLearningInsight.id values,
 * never a copy of their content. Pair-selection helpers below exclude
 * any pair already connected (section 4's "avoid unnecessarily
 * repeating the same pairs"), regardless of which mode created the
 * existing connection -- a pair surfaced once by Mode A should not be
 * served again by Mode B/C either.
 */

import { createArcLearningInsight, setArcLearningInsightDerivedFromConnection } from "./arcLearningInsight.ts";
import type { ArcLearningInsight } from "./arcLearningInsight.ts";

export type ArcCreativityConnectionSource = "ai_suggested" | "random_cross_topic" | "random_within_topic" | "manual";

/**
 * Section 4: "must distinguish evidence-supported vs. possible vs.
 * creative-analogy relationships, never presenting AI suggestions as
 * established fact." "no_clear_connection" is Mode C's own explicitly
 * valid answer ("אין קשר ברור") -- a real, saveable classification, not
 * an error state.
 */
export type ArcCreativityConnectionClassification = "evidence_supported" | "possible" | "creative_analogy" | "no_clear_connection";

export interface ArcCreativityConnection {
  id: string;
  insightIdA: string;
  insightIdB: string;
  /** The saved/accepted relationship description -- what the trainee (or an AI suggestion the trainee accepted/edited) settled on. */
  relationship: string;
  /** The trainee's OWN independent answer, captured before any AI suggestion was revealed (Mode A) or as their own creative answer (Modes B/C) -- null if this connection was saved without that step (e.g. a plain manual save). */
  userExplanation: string | null;
  /** Section 4, Modes B/C's own optional follow-up ("איזה רעיון חדש אפשר ליצור..."/"איזה עיקרון כללי אפשר להסיק..."), kept here until (optionally) promoted into a real ArcLearningInsight via createArcLearningInsightFromConnection. */
  newPrincipleInsightText: string | null;
  source: ArcCreativityConnectionSource;
  classification: ArcCreativityConnectionClassification;
  createdAt: string;
  updatedAt: string;
}

export function generateArcCreativityConnectionId(): string {
  return `arc-creativity-connection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcCreativityConnection(
  id: string,
  insightIdA: string,
  insightIdB: string,
  relationship: string,
  source: ArcCreativityConnectionSource,
  classification: ArcCreativityConnectionClassification,
  now: string
): ArcCreativityConnection {
  return {
    id,
    insightIdA,
    insightIdB,
    relationship: relationship.trim(),
    userExplanation: null,
    newPrincipleInsightText: null,
    source,
    classification,
    createdAt: now,
    updatedAt: now,
  };
}

export function setArcCreativityConnectionUserExplanation(connection: ArcCreativityConnection, explanation: string, now: string): ArcCreativityConnection {
  const trimmed = explanation.trim();
  return { ...connection, userExplanation: trimmed.length ? trimmed : null, updatedAt: now };
}

export function setArcCreativityConnectionNewPrincipleText(connection: ArcCreativityConnection, text: string, now: string): ArcCreativityConnection {
  const trimmed = text.trim();
  return { ...connection, newPrincipleInsightText: trimmed.length ? trimmed : null, updatedAt: now };
}

export function updateArcCreativityConnection(
  connection: ArcCreativityConnection,
  patch: Partial<Pick<ArcCreativityConnection, "relationship" | "classification">>,
  now: string
): ArcCreativityConnection {
  return {
    ...connection,
    relationship: patch.relationship !== undefined ? patch.relationship.trim() : connection.relationship,
    classification: patch.classification !== undefined ? patch.classification : connection.classification,
    updatedAt: now,
  };
}

export function upsertArcCreativityConnectionInList(connections: ArcCreativityConnection[], connection: ArcCreativityConnection): ArcCreativityConnection[] {
  const index = connections.findIndex((existing) => existing.id === connection.id);
  if (index === -1) return [...connections, connection];
  const next = [...connections];
  next[index] = connection;
  return next;
}

/** Never cascades -- deleting a saved connection never touches either referenced insight. */
export function deleteArcCreativityConnectionFromList(connections: ArcCreativityConnection[], id: string): ArcCreativityConnection[] {
  return connections.filter((connection) => connection.id !== id);
}

export function resolveArcCreativityConnectionsForInsight(connections: ArcCreativityConnection[], insightId: string): ArcCreativityConnection[] {
  return connections.filter((connection) => connection.insightIdA === insightId || connection.insightIdB === insightId);
}

/** Order-independent pair identity -- (a, b) and (b, a) are the same pair for "avoid repeating the same pairs" purposes. */
function resolvePairKey(insightIdA: string, insightIdB: string): string {
  return [insightIdA, insightIdB].sort().join("::");
}

function hasExistingConnectionForPair(connections: ArcCreativityConnection[], insightIdA: string, insightIdB: string): boolean {
  const key = resolvePairKey(insightIdA, insightIdB);
  return connections.some((connection) => resolvePairKey(connection.insightIdA, connection.insightIdB) === key);
}

export interface ArcCreativityInsightPair {
  insightA: ArcLearningInsight;
  insightB: ArcLearningInsight;
}

/**
 * Section 4, Mode B ("יצירתיות בין נושאים"): a random pair of insights
 * from two DIFFERENT topics, ready for recall (main sentence set),
 * excluding any pair already connected. Returns null when fewer than
 * two eligible, cross-topic, not-yet-paired insights exist. `pickIndex`
 * is an injectable randomness source (defaults to Math.random) purely
 * so tests can make deterministic assertions -- never used for anything
 * security-sensitive.
 */
export function pickRandomCrossTopicInsightPair(
  insights: ArcLearningInsight[],
  existingConnections: ArcCreativityConnection[],
  pickIndex: (max: number) => number = (max) => Math.floor(Math.random() * max)
): ArcCreativityInsightPair | null {
  const eligible = insights.filter((insight) => insight.mainSentence !== null && insight.topicId !== null);
  const candidatePairs: ArcCreativityInsightPair[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      if (a.topicId === b.topicId) continue;
      if (hasExistingConnectionForPair(existingConnections, a.id, b.id)) continue;
      candidatePairs.push({ insightA: a, insightB: b });
    }
  }
  if (!candidatePairs.length) return null;
  return candidatePairs[pickIndex(candidatePairs.length)];
}

/**
 * Section 4, Mode C ("יצירתיות בתוך נושא"): a random pair of insights
 * from WITHIN the given topic, excluding any pair already connected.
 * Returns null when fewer than two eligible insights exist in the topic.
 */
export function pickRandomWithinTopicInsightPair(
  insights: ArcLearningInsight[],
  topicId: string,
  existingConnections: ArcCreativityConnection[],
  pickIndex: (max: number) => number = (max) => Math.floor(Math.random() * max)
): ArcCreativityInsightPair | null {
  const eligible = insights.filter((insight) => insight.mainSentence !== null && insight.topicId === topicId);
  const candidatePairs: ArcCreativityInsightPair[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      if (hasExistingConnectionForPair(existingConnections, a.id, b.id)) continue;
      candidatePairs.push({ insightA: a, insightB: b });
    }
  }
  if (!candidatePairs.length) return null;
  return candidatePairs[pickIndex(candidatePairs.length)];
}

/**
 * Section 5: "הפוך לתובנה חדשה" -- converts a saved connection's
 * optional new-principle text into a brand-new ArcLearningInsight,
 * stamped with derivedFromConnectionId so both original insights stay
 * reachable (via the connection's own insightIdA/insightIdB). The new
 * insight then follows the normal ARC Learning flow (topic/main
 * sentence/etc. are filled in afterward through the ordinary insight
 * editor, exactly like any other insight) -- this function only performs
 * the initial capture step, never pre-fills later steps on its own.
 */
export function createArcLearningInsightFromConnection(id: string, connection: ArcCreativityConnection, now: string): ArcLearningInsight {
  const rawText = connection.newPrincipleInsightText ?? connection.relationship;
  const insight = createArcLearningInsight(id, rawText, now);
  return setArcLearningInsightDerivedFromConnection(insight, connection.id, now);
}

const HEBREW_STOPWORDS = new Set([
  "את",
  "של",
  "אני",
  "הוא",
  "היא",
  "זה",
  "זאת",
  "על",
  "עם",
  "כי",
  "אבל",
  "גם",
  "לא",
  "כן",
  "או",
  "כמו",
  "יש",
  "אין",
  "מה",
  "איך",
  "למה",
  "אם",
  "אל",
  "כל",
]);

function extractSignificantWords(text: string | null): Set<string> {
  if (!text) return new Set();
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length >= 3 && !HEBREW_STOPWORDS.has(word));
  return new Set(words);
}

/**
 * Section 4, Mode A / section 12 ("reuse existing AI infrastructure if
 * available for suggested connections, otherwise implement an
 * extensible local matching system"): no AI infrastructure exists in
 * this codebase for this purpose, so this is the local matching system
 * -- a plain word-overlap heuristic over the reason/mechanism answers
 * ("pay special attention to similarities between the underlying
 * reasons and mechanisms"). Deliberately simple and swappable: nothing
 * else in this module depends on HOW the score is computed, only on
 * suggestArcCreativityConnectionPair's own return shape, so a smarter
 * scorer can replace this one function later without touching anything
 * else.
 */
function scoreArcCreativityInsightPairSimilarity(insightA: ArcLearningInsight, insightB: ArcLearningInsight): number {
  const wordsA = new Set([...extractSignificantWords(insightA.reasonAnswer), ...extractSignificantWords(insightA.mechanismAnswer)]);
  const wordsB = new Set([...extractSignificantWords(insightB.reasonAnswer), ...extractSignificantWords(insightB.mechanismAnswer)]);
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

export interface ArcCreativitySuggestedPair {
  insightA: ArcLearningInsight;
  insightB: ArcLearningInsight;
  suggestedRelationship: string;
  suggestedClassification: ArcCreativityConnectionClassification;
}

/**
 * Section 4, Mode A: picks the highest-scoring not-yet-connected pair
 * among every insight ready for recall (main sentence set), excluding
 * any pair already connected. A heuristic match is never presented as
 * established fact -- the strongest result this function ever returns
 * is "possible", never "evidence_supported" (that classification is
 * reserved for a trainee's own considered judgment after reviewing the
 * suggestion, applied via updateArcCreativityConnection, never assigned
 * automatically here). Returns null when fewer than two eligible,
 * not-yet-connected insights exist.
 */
export function suggestArcCreativityConnectionPair(insights: ArcLearningInsight[], existingConnections: ArcCreativityConnection[]): ArcCreativitySuggestedPair | null {
  const eligible = insights.filter((insight) => insight.mainSentence !== null);
  let best: { insightA: ArcLearningInsight; insightB: ArcLearningInsight; score: number } | null = null;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const insightA = eligible[i];
      const insightB = eligible[j];
      if (hasExistingConnectionForPair(existingConnections, insightA.id, insightB.id)) continue;
      const score = scoreArcCreativityInsightPairSimilarity(insightA, insightB);
      if (!best || score > best.score) best = { insightA, insightB, score };
    }
  }
  if (!best) return null;
  if (best.score > 0) {
    return {
      insightA: best.insightA,
      insightB: best.insightB,
      suggestedRelationship: "שתי התובנות חולקות הסבר דומה לגבי הסיבה או המהות שלהן.",
      suggestedClassification: "possible",
    };
  }
  return {
    insightA: best.insightA,
    insightB: best.insightB,
    suggestedRelationship: "לא נמצא קשר אוטומטי ברור בין התובנות הללו -- זו הזדמנות לחשוב על קשר יצירתי.",
    suggestedClassification: "creative_analogy",
  };
}

/** Backfills every field a legacy record might be missing -- called once per record by data/storage.ts's own loadArcCreativityConnections. */
export function normalizeArcCreativityConnection(connection: ArcCreativityConnection): ArcCreativityConnection {
  return {
    ...connection,
    userExplanation: typeof connection.userExplanation === "string" ? connection.userExplanation : null,
    newPrincipleInsightText: typeof connection.newPrincipleInsightText === "string" ? connection.newPrincipleInsightText : null,
  };
}

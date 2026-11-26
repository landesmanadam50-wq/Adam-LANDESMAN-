/**
 * arc/arcLearningInsight.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task: the
 * insight-creation/learning flow (section 2) -- capture, topic
 * assignment, main sentence, the three explanatory questions, and mental
 * imagery. Pure data model + logic only, no AsyncStorage/navigation/
 * React -- same split as every other arc/*.ts module.
 *
 * Deliberately named ArcLearningInsight, NOT ArcInsight: arc/
 * arcInsightBelief.ts already owns an unrelated, pre-existing concept
 * (ARC's own post-task-session insight capture, with beliefKind/
 * sourceExerciseId/taskId) -- same naming-collision discipline already
 * established for ArcGymGoal vs. the pre-existing ArcGoal/ManifestGoal.
 *
 * The record itself IS the resumable creation-flow state (section 12:
 * "save unfinished learning... sessions so users can resume them after
 * leaving the app") -- there is no separate in-progress-session record
 * for this wizard. Every step's field starts `null` (or `false` for
 * wantsToLearn) and is filled in as the trainee proceeds; re-opening the
 * capture flow for an existing id simply renders whichever step is the
 * next one with a null field. A skipped explanatory question and a
 * not-yet-reached one are represented identically (null) -- section 2
 * never distinguishes them ("skipped questions remain unanswered...
 * users can return and complete them later").
 */

export interface ArcLearningInsight {
  id: string;
  /** Section 2, step 1: "מה התובנה שלך?" -- the original, frozen capture text. Never edited by later steps. */
  rawText: string;
  /** Section 2, step 1 follow-up: "כן, אני רוצה ללמוד אותה" vs. "רק לשמור את התובנה". false means save-only -- still fully upgradable later by simply filling in topicId/mainSentence, never a separate record. */
  wantsToLearn: boolean;
  /** Section 2, step 2. null until assigned (save-only insights, or a learn-it insight not yet taken past step 1). */
  topicId: string | null;
  /** Section 2, step 3: "מה המשפט העיקרי שאתה רוצה ללמוד ולזכור?" -- written BEFORE the explanatory questions, prefillable from rawText by the caller, stays visible through every later step's own UI. */
  mainSentence: string | null;
  /** Section 2, step 4, question 1: "מה זה אומר?" */
  meaningAnswer: string | null;
  /** Section 2, step 4, question 2: "למה?" */
  reasonAnswer: string | null;
  /** Section 2, step 4, question 3: "איך?" */
  mechanismAnswer: string | null;
  /** Section 2, step 5: free-text mental-imagery descriptions tied to mainSentence -- one or several, in entry order. */
  mentalImages: string[];
  /** Section 5 ("הפוך לתובנה חדשה" / "convert a saved relationship into a brand-new ARC Learning insight... retaining references back to the original insights"): the ArcCreativityConnection.id this insight was created from, or null for an ordinary, independently-captured insight. The connection record itself already holds insightIdA/insightIdB, so both original insights stay reachable through this one back-reference without duplicating their ids here. */
  derivedFromConnectionId: string | null;
  /** Central Insight Collection x ARC Learning task: the arc/arcInsightBelief.ts ArcInsight.id this record was "promoted"/"started learning" from, or null for an insight captured directly inside ARC Learning's own wizard. Same back-reference convention as derivedFromConnectionId right above -- rawText is seeded once from the originating ArcInsight's own text, never re-copied, so the two stay linked without a second, disconnected copy of the same insight floating around. */
  sourceArcInsightId: string | null;
  /** ARC Learning Deep Dive task: an optional, unbounded chain of follow-up "למה?" questions/answers building on the "למה?" explanatory step (reasonAnswer) above -- entirely additive, never replacing or gating meaningAnswer/reasonAnswer/mechanismAnswer or any existing learning step. Empty by default; "+ למה?" appends one entry, "המשך" proceeds regardless of length. */
  whyChain: ArcLearningWhyChainEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ArcLearningWhyChainEntry {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
}

export function generateArcLearningInsightId(): string {
  return `arc-learning-insight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcLearningInsight(id: string, rawText: string, now: string): ArcLearningInsight {
  return {
    id,
    rawText: rawText.trim(),
    wantsToLearn: false,
    topicId: null,
    mainSentence: null,
    meaningAnswer: null,
    reasonAnswer: null,
    mechanismAnswer: null,
    mentalImages: [],
    derivedFromConnectionId: null,
    sourceArcInsightId: null,
    whyChain: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Central Insight Collection x ARC Learning task: "promotes" a central ArcInsight into ARC Learning's own track -- rawText seeded from its text (never re-editable back onto the original ArcInsight, same one-way-copy convention as every other "turn X into a learning insight" entry point), sourceArcInsightId stamped so the two stay linked, wantsToLearn left false by default ("לא חייב להתחיל ללמוד... יכול לשמור ולחזור"). */
export function createArcLearningInsightFromArcInsight(id: string, arcInsightId: string, arcInsightText: string, now: string): ArcLearningInsight {
  return { ...createArcLearningInsight(id, arcInsightText, now), sourceArcInsightId: arcInsightId };
}

/** Section 5's "הפוך לתובנה חדשה": stamps the one back-reference to the ArcCreativityConnection this insight was converted from -- set once, at creation, never cleared by later edits. */
export function setArcLearningInsightDerivedFromConnection(insight: ArcLearningInsight, connectionId: string, now: string): ArcLearningInsight {
  return { ...insight, derivedFromConnectionId: connectionId, updatedAt: now };
}

/** ARC Learning Deep Dive task: the first "+ למה?" tap on a chain-less insight seeds whyChain[0] retroactively from the existing reasonAnswer (the spec's own example starts its deepening chain from the already-answered "למה?" step), then every subsequent call simply appends. Caller decides the seeded question text (always "למה?" for the first entry). */
export function appendArcLearningWhyChainEntry(insight: ArcLearningInsight, question: string, answer: string, now: string): ArcLearningInsight {
  const trimmedAnswer = answer.trim();
  if (!trimmedAnswer) return insight;
  const entry: ArcLearningWhyChainEntry = { id: `arc-learning-why-chain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, question: question.trim(), answer: trimmedAnswer, createdAt: now, updatedAt: now };
  return { ...insight, whyChain: [...insight.whyChain, entry], updatedAt: now };
}

/** "לאפשר לחזור לשאלות ולתשובות קודמות ולערוך אותן" -- edits one existing chain entry's answer in place, never reordering or removing the entries around it. */
export function updateArcLearningWhyChainEntry(insight: ArcLearningInsight, entryId: string, newAnswer: string, now: string): ArcLearningInsight {
  const index = insight.whyChain.findIndex((entry) => entry.id === entryId);
  if (index === -1) return insight;
  const trimmed = newAnswer.trim();
  if (!trimmed) return insight;
  const nextChain = [...insight.whyChain];
  nextChain[index] = { ...nextChain[index], answer: trimmed, updatedAt: now };
  return { ...insight, whyChain: nextChain, updatedAt: now };
}

export function setArcLearningInsightWantsToLearn(insight: ArcLearningInsight, wantsToLearn: boolean, now: string): ArcLearningInsight {
  return { ...insight, wantsToLearn, updatedAt: now };
}

export function setArcLearningInsightTopic(insight: ArcLearningInsight, topicId: string | null, now: string): ArcLearningInsight {
  return { ...insight, topicId, updatedAt: now };
}

export function setArcLearningInsightMainSentence(insight: ArcLearningInsight, mainSentence: string, now: string): ArcLearningInsight {
  return { ...insight, mainSentence: mainSentence.trim(), updatedAt: now };
}

export type ArcLearningExplanationKind = "meaning" | "reason" | "mechanism";

const EXPLANATION_FIELD: Record<ArcLearningExplanationKind, "meaningAnswer" | "reasonAnswer" | "mechanismAnswer"> = {
  meaning: "meaningAnswer",
  reason: "reasonAnswer",
  mechanism: "mechanismAnswer",
};

/** Section 2, step 4: answers (or re-answers) one of the three explanatory questions, in whichever order the trainee chooses -- the exact Hebrew question order (מה זה אומר -> למה -> איך) is a UI concern, not enforced by this pure function. Passing an empty/whitespace-only answer is treated as a skip (null), the same "remains unanswered, completable later" state as never having visited the question. */
export function setArcLearningInsightExplanation(insight: ArcLearningInsight, kind: ArcLearningExplanationKind, answer: string, now: string): ArcLearningInsight {
  const trimmed = answer.trim();
  return { ...insight, [EXPLANATION_FIELD[kind]]: trimmed.length ? trimmed : null, updatedAt: now };
}

/** Explicit skip -- identical end state to setArcLearningInsightExplanation with an empty answer, kept as its own named function for call-site clarity ("דלג" button). */
export function skipArcLearningInsightExplanation(insight: ArcLearningInsight, kind: ArcLearningExplanationKind, now: string): ArcLearningInsight {
  return { ...insight, [EXPLANATION_FIELD[kind]]: null, updatedAt: now };
}

export function resolveArcLearningInsightExplanation(insight: ArcLearningInsight, kind: ArcLearningExplanationKind): string | null {
  return insight[EXPLANATION_FIELD[kind]];
}

/** The three explanatory kinds the trainee actually answered -- step 6's own recall rule ("ask the user to reconstruct whichever of מה זה אומר/למה/איך were actually answered -- never unanswered ones") reads this, never the raw fields directly. */
export function resolveAnsweredArcLearningExplanationKinds(insight: ArcLearningInsight): ArcLearningExplanationKind[] {
  return (["meaning", "reason", "mechanism"] as ArcLearningExplanationKind[]).filter((kind) => insight[EXPLANATION_FIELD[kind]] !== null);
}

export function addArcLearningInsightMentalImage(insight: ArcLearningInsight, description: string, now: string): ArcLearningInsight {
  const trimmed = description.trim();
  if (!trimmed) return insight;
  return { ...insight, mentalImages: [...insight.mentalImages, trimmed], updatedAt: now };
}

export function removeArcLearningInsightMentalImage(insight: ArcLearningInsight, index: number, now: string): ArcLearningInsight {
  if (index < 0 || index >= insight.mentalImages.length) return insight;
  return { ...insight, mentalImages: insight.mentalImages.filter((_, i) => i !== index), updatedAt: now };
}

export function upsertArcLearningInsightInList(insights: ArcLearningInsight[], insight: ArcLearningInsight): ArcLearningInsight[] {
  const index = insights.findIndex((existing) => existing.id === insight.id);
  if (index === -1) return [...insights, insight];
  const next = [...insights];
  next[index] = insight;
  return next;
}

export function deleteArcLearningInsightFromList(insights: ArcLearningInsight[], id: string): ArcLearningInsight[] {
  return insights.filter((insight) => insight.id !== id);
}

export function resolveArcLearningInsightsForTopic(insights: ArcLearningInsight[], topicId: string): ArcLearningInsight[] {
  return insights.filter((insight) => insight.topicId === topicId);
}

/**
 * "המשך למידה" (continue learning): save-only insights and insights
 * mid-flow (missing a main sentence) both belong here -- anything the
 * trainee opted into learning that isn't yet ready for active recall.
 * An insight with a main sentence set is considered ready for recall
 * (see arc/arcLearningReview.ts) even if its explanatory questions/
 * imagery were skipped, matching section 2's own "skipped... completable
 * later" rule.
 */
export function resolveUnfinishedArcLearningInsights(insights: ArcLearningInsight[]): ArcLearningInsight[] {
  return insights.filter((insight) => insight.wantsToLearn && insight.mainSentence === null);
}

export function isArcLearningInsightReadyForRecall(insight: ArcLearningInsight): boolean {
  return insight.wantsToLearn && insight.mainSentence !== null;
}

/** Backfills every field added after an insight was first saved -- called once per record by data/storage.ts's own loadArcLearningInsights, same convention as every other normalize<Type> in this codebase. */
export function normalizeArcLearningInsight(insight: ArcLearningInsight): ArcLearningInsight {
  return {
    ...insight,
    wantsToLearn: typeof insight.wantsToLearn === "boolean" ? insight.wantsToLearn : false,
    topicId: typeof insight.topicId === "string" ? insight.topicId : null,
    mainSentence: typeof insight.mainSentence === "string" ? insight.mainSentence : null,
    meaningAnswer: typeof insight.meaningAnswer === "string" ? insight.meaningAnswer : null,
    reasonAnswer: typeof insight.reasonAnswer === "string" ? insight.reasonAnswer : null,
    mechanismAnswer: typeof insight.mechanismAnswer === "string" ? insight.mechanismAnswer : null,
    mentalImages: Array.isArray(insight.mentalImages) ? insight.mentalImages : [],
    derivedFromConnectionId: typeof insight.derivedFromConnectionId === "string" ? insight.derivedFromConnectionId : null,
    sourceArcInsightId: typeof insight.sourceArcInsightId === "string" ? insight.sourceArcInsightId : null,
    whyChain: Array.isArray(insight.whyChain) ? insight.whyChain : [],
  };
}

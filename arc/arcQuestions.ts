/**
 * arc/arcQuestions.ts
 *
 * ARC Questions task: lets a trainee capture a question that comes up
 * during the day and has no answer yet, revisit it later, research and
 * answer it, and turn the answer into one or more insights for the
 * central insight collection (arc/arcInsightBelief.ts's ArcInsight --
 * never a second, parallel collection).
 *
 * Pure types + pure functions only, no AsyncStorage, no React -- CRUD
 * lives in data/storage.ts, matching every other arc/*.ts module
 * (arc/arcWriting.ts's ArcWritingText is the closest structural
 * precedent: a plain id-keyed list, update-in-place, never cascading on
 * delete).
 *
 * `sourceContext` is a question's own provenance -- "manual" for every
 * question added directly (including from the floating timer's own
 * "+ שאלה" button), or a back-reference to the exact ARC Learning
 * "why?" chain entry it was saved from (ARC Learning Deep Dive task's
 * own requirement: "לשמור על הקישור בין השאלה שנשמרה לתובנה ולשרשרת
 * השאלות שממנה נוצרה"). Modeled as a discriminated union, not an
 * optional pair of nullable ids, so a future third source kind is one
 * more union member, never a third pair of always-null fields on every
 * existing question.
 */

export type ArcQuestionSourceContext = { kind: "manual" } | { kind: "arc_learning_why_chain"; insightId: string; whyChainEntryId: string };

export interface ArcQuestion {
  id: string;
  /** The question itself, in the trainee's own words -- never invented. */
  text: string;
  /** null = still open, no answer written yet. */
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Insights produced from researching/answering this question -- same convention as ArcWritingText.insightIds. */
  insightIds: string[];
  sourceContext: ArcQuestionSourceContext;
}

export function generateArcQuestionId(): string {
  return `arc-question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcQuestion(id: string, text: string, now: string, sourceContext: ArcQuestionSourceContext = { kind: "manual" }): ArcQuestion {
  return {
    id,
    text: text.trim(),
    answer: null,
    answeredAt: null,
    createdAt: now,
    updatedAt: now,
    insightIds: [],
    sourceContext,
  };
}

export function updateArcQuestionText(question: ArcQuestion, text: string, now: string): ArcQuestion {
  const trimmed = text.trim();
  if (trimmed === question.text) return question;
  return { ...question, text: trimmed, updatedAt: now };
}

/** Writing/editing the answer never clears a question back to "open" -- only an explicit un-answer (not offered in the UI today) would; a blank answer is simply never saved by the caller. */
export function answerArcQuestion(question: ArcQuestion, answerText: string, now: string): ArcQuestion {
  const trimmed = answerText.trim();
  return { ...question, answer: trimmed, answeredAt: question.answeredAt ?? now, updatedAt: now };
}

export function updateArcQuestionAnswer(question: ArcQuestion, answerText: string, now: string): ArcQuestion {
  if (question.answer === null) return answerArcQuestion(question, answerText, now);
  return { ...question, answer: answerText.trim(), updatedAt: now };
}

export function linkInsightToArcQuestion(question: ArcQuestion, insightId: string, now: string): ArcQuestion {
  if (question.insightIds.includes(insightId)) return question;
  return { ...question, insightIds: [...question.insightIds, insightId], updatedAt: now };
}

export function resolveOpenArcQuestions(questions: ArcQuestion[]): ArcQuestion[] {
  return questions.filter((question) => question.answer === null);
}

export function resolveAnsweredArcQuestions(questions: ArcQuestion[]): ArcQuestion[] {
  return questions.filter((question) => question.answer !== null);
}

export function upsertArcQuestionInList(questions: ArcQuestion[], question: ArcQuestion): ArcQuestion[] {
  const index = questions.findIndex((existing) => existing.id === question.id);
  if (index === -1) return [...questions, question];
  const next = [...questions];
  next[index] = question;
  return next;
}

export function deleteArcQuestionFromList(questions: ArcQuestion[], id: string): ArcQuestion[] {
  return questions.filter((question) => question.id !== id);
}

/** Backfills `sourceContext` on a record loaded from storage before this field existed -- same "?? default, never invent a value" convention as arc/tasks.ts's own normalizeTask. A record missing it was, by construction, added before provenance tracking existed, i.e. manually. */
export function normalizeArcQuestion(question: ArcQuestion): ArcQuestion {
  return { ...question, sourceContext: question.sourceContext ?? { kind: "manual" } };
}

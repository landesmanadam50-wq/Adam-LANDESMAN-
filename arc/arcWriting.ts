/**
 * arc/arcWriting.ts
 *
 * ARC Writing & ARC Book task: lets a trainee turn insights accumulated
 * from ARC exercises and personal experience into free-form texts (ARC
 * Writing) and structured, multi-chapter books (ARC Book) -- by
 * connecting insights, choosing/creating relationships between them, and
 * writing in their own words. No AI anywhere in this module (no model
 * calls, no auto-drafting) -- every field here is either the trainee's
 * own authored text or a plain structural link, so AI help (phrasing,
 * depth questions, connection suggestions) can be layered on top later
 * without changing any of these shapes.
 *
 * Reuses arc/arcInsightBelief.ts's ArcInsight as the ONLY insight
 * repository -- never a second, parallel one. Relationships between
 * insights are their own shared, reusable repository (ArcInsightRelationship),
 * exactly like ArcInsight itself: created once, linked from many texts/
 * chapters/books, never duplicated.
 *
 * Three more record types: ArcWritingText (one free-form text, optionally
 * associated with a book chapter), ArcBook (name/topic/purpose/description
 * plus its own book-level working set of insights/relationships and
 * ArcGymGoal links), ArcBookChapter (one chapter's own purpose/content/
 * insights/relationships/order/status).
 *
 * Every insight/relationship/text link here is a plain id-array on the
 * CONSUMER side (text/chapter/book), exactly the established
 * link<Type>To<Owner>/unlink<Type>From<Owner> idempotent-array convention
 * already used throughout this codebase (ArcInsight.arcLearningTopicIds,
 * ArcGymSituation.linkedGoalIds) -- never cascading on delete: a deleted
 * insight/relationship's id simply goes dangling and is filtered out
 * wherever resolved, so an existing text/chapter is never silently
 * dropped just because something it once linked to was removed.
 *
 * Pure types + pure functions only, no AsyncStorage, no React -- CRUD
 * lives in data/storage.ts, matching every other arc/*.ts module.
 */

import type { ArcInsight } from "./arcInsightBelief.ts";

export type ArcInsightRelationshipType = "cause_effect" | "complement" | "similarity" | "contrast" | "other";

/** Shared, reusable repository -- one relationship can be reused across many texts/chapters/books, never copied. */
export interface ArcInsightRelationship {
  id: string;
  /** Two or more linked insight ids. */
  insightIds: string[];
  relationshipType: ArcInsightRelationshipType;
  /** The trainee's own personal explanation -- optional. */
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generateArcInsightRelationshipId(): string {
  return `arc-insight-relationship-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcInsightRelationship(
  id: string,
  insightIds: string[],
  relationshipType: ArcInsightRelationshipType,
  explanation: string | null,
  now: string
): ArcInsightRelationship {
  return { id, insightIds: [...insightIds], relationshipType, explanation: explanation?.trim() || null, createdAt: now, updatedAt: now };
}

export function updateArcInsightRelationship(
  relationship: ArcInsightRelationship,
  patch: Partial<Pick<ArcInsightRelationship, "insightIds" | "relationshipType" | "explanation">>,
  now: string
): ArcInsightRelationship {
  return {
    ...relationship,
    insightIds: patch.insightIds !== undefined ? [...patch.insightIds] : relationship.insightIds,
    relationshipType: patch.relationshipType !== undefined ? patch.relationshipType : relationship.relationshipType,
    explanation: patch.explanation !== undefined ? patch.explanation?.trim() || null : relationship.explanation,
    updatedAt: now,
  };
}

export function upsertArcInsightRelationshipInList(relationships: ArcInsightRelationship[], relationship: ArcInsightRelationship): ArcInsightRelationship[] {
  const index = relationships.findIndex((existing) => existing.id === relationship.id);
  if (index === -1) return [...relationships, relationship];
  const next = [...relationships];
  next[index] = relationship;
  return next;
}

export function deleteArcInsightRelationshipFromList(relationships: ArcInsightRelationship[], id: string): ArcInsightRelationship[] {
  return relationships.filter((relationship) => relationship.id !== id);
}

/** Every relationship touching at least one of the given insight ids -- for the picker's "existing relationships between these insights" list. */
export function resolveRelationshipsForInsights(relationships: ArcInsightRelationship[], insightIds: string[]): ArcInsightRelationship[] {
  return relationships.filter((relationship) => relationship.insightIds.some((id) => insightIds.includes(id)));
}

// ---------------------------------------------------------------------------
// ArcWritingText -- one free-form ARC Writing text.
// ---------------------------------------------------------------------------

export interface ArcWritingText {
  id: string;
  title: string;
  /** Free-form, no length limit -- always the trainee's own words. */
  body: string;
  insightIds: string[];
  relationshipIds: string[];
  /** Insights explicitly marked "already incorporated" while writing -- a subset of insightIds. */
  incorporatedInsightIds: string[];
  isDraft: boolean;
  /** Optional: "associate this text with a chapter of an existing book." Always both set or both null. */
  associatedBookId: string | null;
  associatedChapterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generateArcWritingTextId(): string {
  return `arc-writing-text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcWritingText(id: string, now: string): ArcWritingText {
  return {
    id,
    title: "",
    body: "",
    insightIds: [],
    relationshipIds: [],
    incorporatedInsightIds: [],
    isDraft: true,
    associatedBookId: null,
    associatedChapterId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcWritingText(
  text: ArcWritingText,
  patch: Partial<Pick<ArcWritingText, "title" | "body" | "isDraft">>,
  now: string
): ArcWritingText {
  return {
    ...text,
    title: patch.title !== undefined ? patch.title.trim() : text.title,
    body: patch.body !== undefined ? patch.body : text.body,
    isDraft: patch.isDraft !== undefined ? patch.isDraft : text.isDraft,
    updatedAt: now,
  };
}

export function upsertArcWritingTextInList(texts: ArcWritingText[], text: ArcWritingText): ArcWritingText[] {
  const index = texts.findIndex((existing) => existing.id === text.id);
  if (index === -1) return [...texts, text];
  const next = [...texts];
  next[index] = text;
  return next;
}

export function deleteArcWritingTextFromList(texts: ArcWritingText[], id: string): ArcWritingText[] {
  return texts.filter((text) => text.id !== id);
}

export function linkInsightToWritingText(text: ArcWritingText, insightId: string, now: string): ArcWritingText {
  if (text.insightIds.includes(insightId)) return text;
  return { ...text, insightIds: [...text.insightIds, insightId], updatedAt: now };
}

export function unlinkInsightFromWritingText(text: ArcWritingText, insightId: string, now: string): ArcWritingText {
  if (!text.insightIds.includes(insightId)) return text;
  return {
    ...text,
    insightIds: text.insightIds.filter((id) => id !== insightId),
    incorporatedInsightIds: text.incorporatedInsightIds.filter((id) => id !== insightId),
    updatedAt: now,
  };
}

export function linkRelationshipToWritingText(text: ArcWritingText, relationshipId: string, now: string): ArcWritingText {
  if (text.relationshipIds.includes(relationshipId)) return text;
  return { ...text, relationshipIds: [...text.relationshipIds, relationshipId], updatedAt: now };
}

export function unlinkRelationshipFromWritingText(text: ArcWritingText, relationshipId: string, now: string): ArcWritingText {
  if (!text.relationshipIds.includes(relationshipId)) return text;
  return { ...text, relationshipIds: text.relationshipIds.filter((id) => id !== relationshipId), updatedAt: now };
}

/** Toggles whether an already-linked insight is marked "incorporated into the text yet" -- a no-op if the insight isn't linked at all. */
export function toggleInsightIncorporatedInWritingText(text: ArcWritingText, insightId: string, now: string): ArcWritingText {
  if (!text.insightIds.includes(insightId)) return text;
  const incorporated = text.incorporatedInsightIds.includes(insightId)
    ? text.incorporatedInsightIds.filter((id) => id !== insightId)
    : [...text.incorporatedInsightIds, insightId];
  return { ...text, incorporatedInsightIds: incorporated, updatedAt: now };
}

export function associateWritingTextWithChapter(text: ArcWritingText, bookId: string, chapterId: string, now: string): ArcWritingText {
  return { ...text, associatedBookId: bookId, associatedChapterId: chapterId, updatedAt: now };
}

export function clearWritingTextChapterAssociation(text: ArcWritingText, now: string): ArcWritingText {
  if (!text.associatedBookId && !text.associatedChapterId) return text;
  return { ...text, associatedBookId: null, associatedChapterId: null, updatedAt: now };
}

/** Standalone texts never associated with any book chapter, plus drafts/finished -- for the "ARC Writing" continue-writing list. */
export function resolveStandaloneWritingTexts(texts: ArcWritingText[]): ArcWritingText[] {
  return texts.filter((text) => !text.associatedChapterId);
}

/** All texts a given chapter has incorporated -- the chapter screen's own "incorporated texts" section. */
export function resolveWritingTextsForChapter(texts: ArcWritingText[], chapterId: string): ArcWritingText[] {
  return texts.filter((text) => text.associatedChapterId === chapterId);
}

// ---------------------------------------------------------------------------
// ArcBook + ArcBookChapter -- a structured, multi-chapter book.
// ---------------------------------------------------------------------------

export interface ArcBook {
  id: string;
  name: string;
  topic: string;
  /** What the trainee wants to achieve through the book. */
  purpose: string;
  description: string | null;
  /** The book-level working set of insights/relationships "related to the book's purpose" -- a superset chapters draw their own, narrower selections from; never a duplicate copy. */
  insightIds: string[];
  relationshipIds: string[];
  /** ArcGymGoal links, consumer-side convention (arc/arcGymGoal.ts) -- never stored on the goal itself. */
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generateArcBookId(): string {
  return `arc-book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcBook(id: string, name: string, topic: string, purpose: string, description: string | null, now: string): ArcBook {
  return {
    id,
    name: name.trim(),
    topic: topic.trim(),
    purpose: purpose.trim(),
    description: description?.trim() || null,
    insightIds: [],
    relationshipIds: [],
    linkedGoalIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcBook(book: ArcBook, patch: Partial<Pick<ArcBook, "name" | "topic" | "purpose" | "description">>, now: string): ArcBook {
  return {
    ...book,
    name: patch.name !== undefined ? patch.name.trim() : book.name,
    topic: patch.topic !== undefined ? patch.topic.trim() : book.topic,
    purpose: patch.purpose !== undefined ? patch.purpose.trim() : book.purpose,
    description: patch.description !== undefined ? patch.description?.trim() || null : book.description,
    updatedAt: now,
  };
}

export function upsertArcBookInList(books: ArcBook[], book: ArcBook): ArcBook[] {
  const index = books.findIndex((existing) => existing.id === book.id);
  if (index === -1) return [...books, book];
  const next = [...books];
  next[index] = book;
  return next;
}

/** Removes the book record itself only -- never cascades to its chapters; callers (data/storage.ts) are responsible for deleting them too if the trainee chooses. */
export function deleteArcBookFromList(books: ArcBook[], id: string): ArcBook[] {
  return books.filter((book) => book.id !== id);
}

export function linkInsightToBook(book: ArcBook, insightId: string, now: string): ArcBook {
  if (book.insightIds.includes(insightId)) return book;
  return { ...book, insightIds: [...book.insightIds, insightId], updatedAt: now };
}

export function unlinkInsightFromBook(book: ArcBook, insightId: string, now: string): ArcBook {
  if (!book.insightIds.includes(insightId)) return book;
  return { ...book, insightIds: book.insightIds.filter((id) => id !== insightId), updatedAt: now };
}

export function linkRelationshipToBook(book: ArcBook, relationshipId: string, now: string): ArcBook {
  if (book.relationshipIds.includes(relationshipId)) return book;
  return { ...book, relationshipIds: [...book.relationshipIds, relationshipId], updatedAt: now };
}

export function unlinkRelationshipFromBook(book: ArcBook, relationshipId: string, now: string): ArcBook {
  if (!book.relationshipIds.includes(relationshipId)) return book;
  return { ...book, relationshipIds: book.relationshipIds.filter((id) => id !== relationshipId), updatedAt: now };
}

export function linkArcGymGoalToBook(book: ArcBook, goalId: string, now: string): ArcBook {
  if (book.linkedGoalIds.includes(goalId)) return book;
  return { ...book, linkedGoalIds: [...book.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkArcGymGoalFromBook(book: ArcBook, goalId: string, now: string): ArcBook {
  if (!book.linkedGoalIds.includes(goalId)) return book;
  return { ...book, linkedGoalIds: book.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

/** The derived, never-persisted "which books does this goal have" view -- computed fresh by filtering, same convention as resolveLinkedExercisesForArcGymGoal. */
export function resolveArcBooksLinkedToGoal(books: ArcBook[], goalId: string): ArcBook[] {
  return books.filter((book) => book.linkedGoalIds.includes(goalId));
}

export type ArcBookChapterStatus = "not_started" | "in_progress" | "completed";

export interface ArcBookChapter {
  id: string;
  bookId: string;
  name: string;
  purpose: string;
  /** This chapter's own written content -- auto-saved, distinct from any ArcWritingText incorporated into it. */
  content: string;
  insightIds: string[];
  relationshipIds: string[];
  /** Manual display/structure order within the book -- 0-based, reassigned only by reorderArcBookChapters. */
  order: number;
  status: ArcBookChapterStatus;
  createdAt: string;
  updatedAt: string;
}

export function generateArcBookChapterId(): string {
  return `arc-book-chapter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcBookChapter(bookId: string, name: string, purpose: string, order: number, now: string): ArcBookChapter {
  return {
    id: generateArcBookChapterId(),
    bookId,
    name: name.trim(),
    purpose: purpose.trim(),
    content: "",
    insightIds: [],
    relationshipIds: [],
    order,
    status: "not_started",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Patches name/purpose/content/status. The ONE automatic convenience in
 * this whole module: writing any non-empty content into a chapter still
 * marked "not_started" quietly bumps it to "in_progress" -- never the
 * reverse, and never overriding an explicit status the caller passed in
 * the same patch. Everything else about status stays fully manual (spec
 * section 2 step 5 -- status is shown, never auto-verified/graded).
 */
export function updateArcBookChapter(
  chapter: ArcBookChapter,
  patch: Partial<Pick<ArcBookChapter, "name" | "purpose" | "content" | "status">>,
  now: string
): ArcBookChapter {
  const nextStatus =
    patch.status !== undefined
      ? patch.status
      : patch.content !== undefined && chapter.status === "not_started" && patch.content.trim().length > 0
        ? "in_progress"
        : chapter.status;
  return {
    ...chapter,
    name: patch.name !== undefined ? patch.name.trim() : chapter.name,
    purpose: patch.purpose !== undefined ? patch.purpose.trim() : chapter.purpose,
    content: patch.content !== undefined ? patch.content : chapter.content,
    status: nextStatus,
    updatedAt: now,
  };
}

export function upsertArcBookChapterInList(chapters: ArcBookChapter[], chapter: ArcBookChapter): ArcBookChapter[] {
  const index = chapters.findIndex((existing) => existing.id === chapter.id);
  if (index === -1) return [...chapters, chapter];
  const next = [...chapters];
  next[index] = chapter;
  return next;
}

export function deleteArcBookChapterFromList(chapters: ArcBookChapter[], id: string): ArcBookChapter[] {
  return chapters.filter((chapter) => chapter.id !== id);
}

export function linkInsightToChapter(chapter: ArcBookChapter, insightId: string, now: string): ArcBookChapter {
  if (chapter.insightIds.includes(insightId)) return chapter;
  return { ...chapter, insightIds: [...chapter.insightIds, insightId], updatedAt: now };
}

export function unlinkInsightFromChapter(chapter: ArcBookChapter, insightId: string, now: string): ArcBookChapter {
  if (!chapter.insightIds.includes(insightId)) return chapter;
  return { ...chapter, insightIds: chapter.insightIds.filter((id) => id !== insightId), updatedAt: now };
}

export function linkRelationshipToChapter(chapter: ArcBookChapter, relationshipId: string, now: string): ArcBookChapter {
  if (chapter.relationshipIds.includes(relationshipId)) return chapter;
  return { ...chapter, relationshipIds: [...chapter.relationshipIds, relationshipId], updatedAt: now };
}

export function unlinkRelationshipFromChapter(chapter: ArcBookChapter, relationshipId: string, now: string): ArcBookChapter {
  if (!chapter.relationshipIds.includes(relationshipId)) return chapter;
  return { ...chapter, relationshipIds: chapter.relationshipIds.filter((id) => id !== relationshipId), updatedAt: now };
}

/** This book's own chapters only, in structure order -- never re-sorted by date. */
export function resolveChaptersForBook(chapters: ArcBookChapter[], bookId: string): ArcBookChapter[] {
  return chapters.filter((chapter) => chapter.bookId === bookId).sort((a, b) => a.order - b.order);
}

/** Reassigns `order` (0..n-1) for ONE book's chapters per orderedIds, leaving every other book's own chapters untouched -- same per-parent reorder shape as arc/arcGymGoal.ts's reorderArcGymGoalObjectives. The trainee is never required to reorder every chapter at once: an id missing from orderedIds keeps its existing order. */
export function reorderArcBookChapters(chapters: ArcBookChapter[], bookId: string, orderedIds: string[], now: string): ArcBookChapter[] {
  return chapters.map((chapter) => {
    if (chapter.bookId !== bookId) return chapter;
    const newOrder = orderedIds.indexOf(chapter.id);
    if (newOrder === -1) return chapter;
    return { ...chapter, order: newOrder, updatedAt: now };
  });
}

/** The most recently updated chapter of a book, for "last-edited chapter / continue from here" -- null if the book has no chapters yet. */
export function resolveLastEditedChapter(chapters: ArcBookChapter[], bookId: string): ArcBookChapter | null {
  const owned = resolveChaptersForBook(chapters, bookId);
  if (owned.length === 0) return null;
  return owned.reduce((latest, chapter) => (chapter.updatedAt > latest.updatedAt ? chapter : latest));
}

/** Plain whitespace-split word count -- Hebrew text included, no locale-specific tokenization needed for a simple progress count. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function computeChapterWordCount(chapter: ArcBookChapter): number {
  return countWords(chapter.content);
}

export interface ArcBookWordCounts {
  totalWordCount: number;
  chapterWordCounts: Record<string, number>;
}

/** Per-chapter and whole-book word counts, for the book progress screen (spec section 2 step 5). */
export function computeArcBookWordCount(chapters: ArcBookChapter[], bookId: string): ArcBookWordCounts {
  const owned = resolveChaptersForBook(chapters, bookId);
  const chapterWordCounts: Record<string, number> = {};
  let totalWordCount = 0;
  for (const chapter of owned) {
    const count = computeChapterWordCount(chapter);
    chapterWordCounts[chapter.id] = count;
    totalWordCount += count;
  }
  return { totalWordCount, chapterWordCounts };
}

/** Resolves the insights touching either a book's own working set or one of its chapters -- never duplicates ArcInsight records, only follows the id links. */
export function resolveInsightsForIds(insights: ArcInsight[], insightIds: string[]): ArcInsight[] {
  return insightIds.map((id) => insights.find((insight) => insight.id === id)).filter((insight): insight is ArcInsight => insight !== undefined);
}

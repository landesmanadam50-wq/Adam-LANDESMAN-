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
 * Four more record types: ArcWritingText (one free-form text, optionally
 * associated with a book chapter), ArcBook (name/topic/purpose/description
 * plus its own book-level working set of insights/relationships and
 * ArcGymGoal links), ArcBookChapter (one chapter's own purpose/content/
 * insights/relationships/order/status), and ArcVideoRecording (ARC Video
 * task: the ONE recorded take belonging to an ArcWritingText whose own
 * `kind` is "video_script" -- "ARC Video is an extension of ARC Writing,
 * not a separate writing system," so a video script is still a plain
 * ArcWritingText, never a parallel text entity; only the finished
 * recording itself -- a local video file, never raw bytes in storage --
 * is its own record, linked back to the script by id the same
 * consumer-side way everything else here links).
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

/** ARC Video task: a plain ArcWritingText is either an ordinary free-form text or a video script -- the SAME entity, never a second parallel one, so every existing text-editing function/screen keeps working unchanged for "standard" texts. */
export type ArcWritingTextKind = "standard" | "video_script";

export interface ArcWritingText {
  id: string;
  title: string;
  /** Free-form, no length limit -- always the trainee's own words. For a video_script, this IS the teleprompter script text. */
  body: string;
  insightIds: string[];
  relationshipIds: string[];
  /** Insights explicitly marked "already incorporated" while writing -- a subset of insightIds. */
  incorporatedInsightIds: string[];
  isDraft: boolean;
  /** Optional: "associate this text with a chapter of an existing book." Always both set or both null. */
  associatedBookId: string | null;
  associatedChapterId: string | null;
  /** Defaults to "standard" -- a pre-existing text backfilled with this field is never silently reclassified as a video script. */
  kind: ArcWritingTextKind;
  /** The video's own topic/purpose, captured when the trainee sets up a video script (spec section 1) -- null for a "standard" text. Distinct from an ArcVideoRecording's own topic/purpose, which default FROM these but may be edited independently once the video exists (spec section 4's own title/topic/purpose/description belong to the uploaded video, not the script). */
  videoTopic: string | null;
  videoPurpose: string | null;
  /** The script's own CURRENT recording, if any -- "update the script and re-record" (spec section 3) replaces this pointer via setWritingTextVideoRecording, it never multiplies; a prior take's own ArcVideoRecording row is deleted by the caller, not cascaded here (same "consumer decides, this module never cascades" convention as the rest of the file). */
  videoRecordingId: string | null;
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
    kind: "standard",
    videoTopic: null,
    videoPurpose: null,
    videoRecordingId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcWritingText(
  text: ArcWritingText,
  patch: Partial<Pick<ArcWritingText, "title" | "body" | "isDraft" | "kind" | "videoTopic" | "videoPurpose">>,
  now: string
): ArcWritingText {
  return {
    ...text,
    title: patch.title !== undefined ? patch.title.trim() : text.title,
    body: patch.body !== undefined ? patch.body : text.body,
    isDraft: patch.isDraft !== undefined ? patch.isDraft : text.isDraft,
    kind: patch.kind !== undefined ? patch.kind : text.kind,
    videoTopic: patch.videoTopic !== undefined ? patch.videoTopic?.trim() || null : text.videoTopic,
    videoPurpose: patch.videoPurpose !== undefined ? patch.videoPurpose?.trim() || null : text.videoPurpose,
    updatedAt: now,
  };
}

/** ARC Video task: backfills kind/videoTopic/videoPurpose/videoRecordingId on an ArcWritingText loaded from storage before this field set existed -- same "?? default, never reclassify/invent a value" convention as arc/tasks.ts's own normalizeTask. A record missing these fields is simply an ordinary "standard" text, exactly as it always behaved. */
export function normalizeArcWritingText(text: ArcWritingText): ArcWritingText {
  return {
    ...text,
    kind: text.kind ?? "standard",
    videoTopic: text.videoTopic ?? null,
    videoPurpose: text.videoPurpose ?? null,
    videoRecordingId: text.videoRecordingId ?? null,
  };
}

/** Points the script at its current recording -- "update the script and re-record" (spec section 3) calls this again with the NEW recording's id, simply replacing the pointer; it never keeps a history of prior takes here (the trainee's own ArcVideoRecording list is the history, if they choose not to delete an old one). */
export function setWritingTextVideoRecording(text: ArcWritingText, recordingId: string | null, now: string): ArcWritingText {
  if (text.videoRecordingId === recordingId) return text;
  return { ...text, videoRecordingId: recordingId, updatedAt: now };
}

/** Every video-script text, regardless of draft/associated-chapter status -- the "כתיבת תסריט לסרטון" list a dedicated ARC Video entry point would show, kept separate from resolveStandaloneWritingTexts (which still includes video scripts too, since a script IS a text -- this is an ADDITIONAL, narrower view, not a replacement). */
export function resolveVideoScriptTexts(texts: ArcWritingText[]): ArcWritingText[] {
  return texts.filter((text) => text.kind === "video_script");
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

// ---------------------------------------------------------------------------
// ArcVideoRecording -- ARC Video task: the one recorded take belonging to a
// video-script ArcWritingText, organized for browsing/sharing by topic and
// goal. The actual video bytes live in the filesystem (arc/arcVideoFile.ts
// is the one module that ever touches that file); `localUri` here is a
// plain string field, exactly like every other optional field on an
// existing record in this file -- this module itself never imports any
// native/file-system/camera module, keeping the "pure types + pure
// functions only" contract intact for the whole file, ARC Video included.
// ---------------------------------------------------------------------------

/**
 * No accounts/backend exist anywhere in this app (data/storage.ts's own
 * top banner: "per tester" persistence means per-device) -- "published"
 * can only mean a LOCAL distinction ("organized/finished, meant to be
 * found and shared out from this device," e.g. via the OS share sheet,
 * the same arc/arcBookExport.ts precedent) vs "private" (hidden from any
 * browsable/shareable list), never literally visible to other users.
 * publishArcVideoRecording/unpublishArcVideoRecording below are the ONLY
 * two functions that ever change this field, so "publishing a video only
 * happens after the trainee's own confirmation" (spec section 4) holds
 * structurally: the UI gates the ONE call to publishArcVideoRecording
 * behind a confirmation dialog, never flips the field inline elsewhere.
 */
export type ArcVideoVisibility = "private" | "published";

export interface ArcVideoRecording {
  id: string;
  /** The ArcWritingText (kind "video_script") this take was recorded from. */
  scriptId: string;
  /** A local file path/URI (expo-file-system document directory) -- never raw video bytes. */
  localUri: string;
  /** Null until the file is known/measured; set once by the record screen. */
  durationSeconds: number | null;
  recordedAt: string;
  /** Defaults from the script's own videoTopic/videoPurpose at creation, but is this record's OWN field from then on -- editing it never rewrites the script. */
  title: string;
  topic: string;
  purpose: string;
  description: string | null;
  visibility: ArcVideoVisibility;
  isDraft: boolean;
  insightIds: string[];
  relationshipIds: string[];
  /** ArcGymGoal links, the exact same consumer-side convention as ArcBook.linkedGoalIds above. */
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generateArcVideoRecordingId(): string {
  return `arc-video-recording-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcVideoRecording(id: string, scriptId: string, localUri: string, title: string, topic: string, purpose: string, now: string): ArcVideoRecording {
  return {
    id,
    scriptId,
    localUri,
    durationSeconds: null,
    recordedAt: now,
    title: title.trim(),
    topic: topic.trim(),
    purpose: purpose.trim(),
    description: null,
    visibility: "private",
    isDraft: true,
    insightIds: [],
    relationshipIds: [],
    linkedGoalIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcVideoRecording(
  recording: ArcVideoRecording,
  patch: Partial<Pick<ArcVideoRecording, "title" | "topic" | "purpose" | "description" | "durationSeconds" | "isDraft" | "localUri">>,
  now: string
): ArcVideoRecording {
  return {
    ...recording,
    title: patch.title !== undefined ? patch.title.trim() : recording.title,
    topic: patch.topic !== undefined ? patch.topic.trim() : recording.topic,
    purpose: patch.purpose !== undefined ? patch.purpose.trim() : recording.purpose,
    description: patch.description !== undefined ? patch.description?.trim() || null : recording.description,
    durationSeconds: patch.durationSeconds !== undefined ? patch.durationSeconds : recording.durationSeconds,
    isDraft: patch.isDraft !== undefined ? patch.isDraft : recording.isDraft,
    localUri: patch.localUri !== undefined ? patch.localUri : recording.localUri,
    updatedAt: now,
  };
}

export function upsertArcVideoRecordingInList(recordings: ArcVideoRecording[], recording: ArcVideoRecording): ArcVideoRecording[] {
  const index = recordings.findIndex((existing) => existing.id === recording.id);
  if (index === -1) return [...recordings, recording];
  const next = [...recordings];
  next[index] = recording;
  return next;
}

/** Removes the recording record itself only -- never deletes the underlying file (arc/arcVideoFile.ts's own deleteRecordingFile is a separate, explicit step the caller takes first/alongside, same "this module is pure, I/O lives elsewhere" contract as the rest of the file). */
export function deleteArcVideoRecordingFromList(recordings: ArcVideoRecording[], id: string): ArcVideoRecording[] {
  return recordings.filter((recording) => recording.id !== id);
}

export function linkInsightToVideoRecording(recording: ArcVideoRecording, insightId: string, now: string): ArcVideoRecording {
  if (recording.insightIds.includes(insightId)) return recording;
  return { ...recording, insightIds: [...recording.insightIds, insightId], updatedAt: now };
}

export function unlinkInsightFromVideoRecording(recording: ArcVideoRecording, insightId: string, now: string): ArcVideoRecording {
  if (!recording.insightIds.includes(insightId)) return recording;
  return { ...recording, insightIds: recording.insightIds.filter((id) => id !== insightId), updatedAt: now };
}

export function linkRelationshipToVideoRecording(recording: ArcVideoRecording, relationshipId: string, now: string): ArcVideoRecording {
  if (recording.relationshipIds.includes(relationshipId)) return recording;
  return { ...recording, relationshipIds: [...recording.relationshipIds, relationshipId], updatedAt: now };
}

export function unlinkRelationshipFromVideoRecording(recording: ArcVideoRecording, relationshipId: string, now: string): ArcVideoRecording {
  if (!recording.relationshipIds.includes(relationshipId)) return recording;
  return { ...recording, relationshipIds: recording.relationshipIds.filter((id) => id !== relationshipId), updatedAt: now };
}

export function linkArcGymGoalToVideoRecording(recording: ArcVideoRecording, goalId: string, now: string): ArcVideoRecording {
  if (recording.linkedGoalIds.includes(goalId)) return recording;
  return { ...recording, linkedGoalIds: [...recording.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkArcGymGoalFromVideoRecording(recording: ArcVideoRecording, goalId: string, now: string): ArcVideoRecording {
  if (!recording.linkedGoalIds.includes(goalId)) return recording;
  return { ...recording, linkedGoalIds: recording.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

/** The ONE place visibility ever becomes "published" -- the UI gates this single call behind an explicit confirmation dialog (spec section 4: "publishing a video only happens after the trainee's own confirmation"), never flips the field any other way. */
export function publishArcVideoRecording(recording: ArcVideoRecording, now: string): ArcVideoRecording {
  if (recording.visibility === "published") return recording;
  return { ...recording, visibility: "published", updatedAt: now };
}

/** The reverse -- reverting a published video back to private, e.g. if the trainee changes their mind. No confirmation is required going this direction (making something MORE private is never the risky action the spec's own confirmation requirement is about). */
export function unpublishArcVideoRecording(recording: ArcVideoRecording, now: string): ArcVideoRecording {
  if (recording.visibility === "private") return recording;
  return { ...recording, visibility: "private", updatedAt: now };
}

export function resolveVideoRecordingsForScript(recordings: ArcVideoRecording[], scriptId: string): ArcVideoRecording[] {
  return recordings.filter((recording) => recording.scriptId === scriptId);
}

export function resolvePublishedVideoRecordings(recordings: ArcVideoRecording[]): ArcVideoRecording[] {
  return recordings.filter((recording) => recording.visibility === "published");
}

export function resolvePrivateVideoRecordings(recordings: ArcVideoRecording[]): ArcVideoRecording[] {
  return recordings.filter((recording) => recording.visibility === "private");
}

/** The derived, never-persisted "which videos does this goal have" view -- same convention as resolveArcBooksLinkedToGoal. */
export function resolveVideoRecordingsLinkedToGoal(recordings: ArcVideoRecording[], goalId: string): ArcVideoRecording[] {
  return recordings.filter((recording) => recording.linkedGoalIds.includes(goalId));
}

/** Every distinct, non-empty topic across all recordings, alphabetically sorted -- the video library screen's own "browse by topic" section headers, computed fresh, never a second, separately-maintained topic list. */
export function resolveDistinctVideoTopics(recordings: ArcVideoRecording[]): string[] {
  const topics = new Set<string>();
  for (const recording of recordings) {
    if (recording.topic.trim().length > 0) topics.add(recording.topic);
  }
  return [...topics].sort((a, b) => a.localeCompare(b));
}

/** All recordings sharing one exact topic string -- paired with resolveDistinctVideoTopics for the grouped library view. */
export function resolveVideoRecordingsForTopic(recordings: ArcVideoRecording[], topic: string): ArcVideoRecording[] {
  return recordings.filter((recording) => recording.topic === topic);
}

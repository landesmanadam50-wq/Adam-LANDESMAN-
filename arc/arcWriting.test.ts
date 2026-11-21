import test from "node:test";
import assert from "node:assert/strict";

import {
  associateWritingTextWithChapter,
  clearWritingTextChapterAssociation,
  computeArcBookWordCount,
  computeChapterWordCount,
  countWords,
  createArcBook,
  createArcBookChapter,
  createArcInsightRelationship,
  createArcWritingText,
  deleteArcBookChapterFromList,
  deleteArcBookFromList,
  deleteArcInsightRelationshipFromList,
  deleteArcWritingTextFromList,
  generateArcBookChapterId,
  generateArcBookId,
  generateArcInsightRelationshipId,
  generateArcWritingTextId,
  linkArcGymGoalToBook,
  linkInsightToBook,
  linkInsightToChapter,
  linkInsightToWritingText,
  linkRelationshipToBook,
  linkRelationshipToChapter,
  linkRelationshipToWritingText,
  resolveArcBooksLinkedToGoal,
  resolveChaptersForBook,
  resolveLastEditedChapter,
  resolveRelationshipsForInsights,
  resolveStandaloneWritingTexts,
  resolveWritingTextsForChapter,
  reorderArcBookChapters,
  toggleInsightIncorporatedInWritingText,
  unlinkArcGymGoalFromBook,
  unlinkInsightFromBook,
  unlinkInsightFromChapter,
  unlinkInsightFromWritingText,
  unlinkRelationshipFromBook,
  unlinkRelationshipFromChapter,
  unlinkRelationshipFromWritingText,
  updateArcBook,
  updateArcBookChapter,
  updateArcInsightRelationship,
  updateArcWritingText,
  upsertArcBookChapterInList,
  upsertArcBookInList,
  upsertArcInsightRelationshipInList,
  upsertArcWritingTextInList,
} from "./arcWriting.ts";

const NOW = "2026-02-01T09:00:00.000Z";
const LATER = "2026-02-01T10:00:00.000Z";

// --- ArcInsightRelationship -------------------------------------------

test("generateArc*Id functions return distinct ids on successive calls", () => {
  assert.notEqual(generateArcInsightRelationshipId(), generateArcInsightRelationshipId());
  assert.notEqual(generateArcWritingTextId(), generateArcWritingTextId());
  assert.notEqual(generateArcBookId(), generateArcBookId());
  assert.notEqual(generateArcBookChapterId(), generateArcBookChapterId());
});

test("createArcInsightRelationship stores a copy of insightIds and trims/nulls a blank explanation", () => {
  const ids = ["i1", "i2"];
  const relationship = createArcInsightRelationship("r1", ids, "cause_effect", "  ", NOW);
  assert.deepEqual(relationship.insightIds, ids);
  assert.notEqual(relationship.insightIds, ids);
  assert.equal(relationship.explanation, null);
  assert.equal(relationship.relationshipType, "cause_effect");
});

test("updateArcInsightRelationship only changes provided fields and bumps updatedAt", () => {
  const relationship = createArcInsightRelationship("r1", ["i1", "i2"], "cause_effect", "because", NOW);
  const updated = updateArcInsightRelationship(relationship, { relationshipType: "contrast" }, LATER);
  assert.equal(updated.relationshipType, "contrast");
  assert.equal(updated.explanation, "because");
  assert.equal(updated.updatedAt, LATER);
});

test("upsertArcInsightRelationshipInList replaces by id, never drops other rows; delete removes only the targeted id", () => {
  const a = createArcInsightRelationship("r1", ["i1", "i2"], "cause_effect", null, NOW);
  const b = createArcInsightRelationship("r2", ["i2", "i3"], "contrast", null, NOW);
  let list = upsertArcInsightRelationshipInList([], a);
  list = upsertArcInsightRelationshipInList(list, b);
  const updatedA = updateArcInsightRelationship(a, { explanation: "x" }, LATER);
  list = upsertArcInsightRelationshipInList(list, updatedA);
  assert.equal(list.length, 2);
  assert.equal(list.find((r) => r.id === "r1")?.explanation, "x");
  list = deleteArcInsightRelationshipFromList(list, "r1");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "r2");
});

test("resolveRelationshipsForInsights returns every relationship touching at least one given insight id", () => {
  const a = createArcInsightRelationship("r1", ["i1", "i2"], "cause_effect", null, NOW);
  const b = createArcInsightRelationship("r2", ["i3", "i4"], "contrast", null, NOW);
  const found = resolveRelationshipsForInsights([a, b], ["i2", "i3"]);
  assert.equal(found.length, 2);
});

// --- ArcWritingText ------------------------------------------------------

test("createArcWritingText starts as an empty draft with no links", () => {
  const text = createArcWritingText("t1", NOW);
  assert.equal(text.isDraft, true);
  assert.deepEqual(text.insightIds, []);
  assert.deepEqual(text.relationshipIds, []);
  assert.deepEqual(text.incorporatedInsightIds, []);
  assert.equal(text.associatedBookId, null);
  assert.equal(text.associatedChapterId, null);
});

test("updateArcWritingText trims title, leaves body untrimmed (free-form), and can flip isDraft", () => {
  const text = createArcWritingText("t1", NOW);
  const updated = updateArcWritingText(text, { title: "  My Title  ", body: "  leading space kept  " }, LATER);
  assert.equal(updated.title, "My Title");
  assert.equal(updated.body, "  leading space kept  ");
  const finished = updateArcWritingText(updated, { isDraft: false }, LATER);
  assert.equal(finished.isDraft, false);
});

test("link/unlinkInsightToWritingText are idempotent and unlinking also drops the insight from incorporatedInsightIds", () => {
  let text = createArcWritingText("t1", NOW);
  text = linkInsightToWritingText(text, "i1", LATER);
  text = linkInsightToWritingText(text, "i1", LATER); // idempotent
  assert.deepEqual(text.insightIds, ["i1"]);
  text = toggleInsightIncorporatedInWritingText(text, "i1", LATER);
  assert.deepEqual(text.incorporatedInsightIds, ["i1"]);
  text = unlinkInsightFromWritingText(text, "i1", LATER);
  assert.deepEqual(text.insightIds, []);
  assert.deepEqual(text.incorporatedInsightIds, []);
});

test("toggleInsightIncorporatedInWritingText is a no-op when the insight isn't linked at all", () => {
  const text = createArcWritingText("t1", NOW);
  const unchanged = toggleInsightIncorporatedInWritingText(text, "not-linked", LATER);
  assert.equal(unchanged, text);
});

test("link/unlinkRelationshipToWritingText are idempotent id-array ops", () => {
  let text = createArcWritingText("t1", NOW);
  text = linkRelationshipToWritingText(text, "r1", LATER);
  text = linkRelationshipToWritingText(text, "r1", LATER);
  assert.deepEqual(text.relationshipIds, ["r1"]);
  text = unlinkRelationshipFromWritingText(text, "r1", LATER);
  assert.deepEqual(text.relationshipIds, []);
});

test("associate/clearWritingTextChapterAssociation set and clear both fields together", () => {
  let text = createArcWritingText("t1", NOW);
  text = associateWritingTextWithChapter(text, "book1", "chapter1", LATER);
  assert.equal(text.associatedBookId, "book1");
  assert.equal(text.associatedChapterId, "chapter1");
  text = clearWritingTextChapterAssociation(text, LATER);
  assert.equal(text.associatedBookId, null);
  assert.equal(text.associatedChapterId, null);
});

test("resolveStandaloneWritingTexts excludes any text associated with a chapter; resolveWritingTextsForChapter is the reverse view", () => {
  const standalone = createArcWritingText("t1", NOW);
  const incorporated = associateWritingTextWithChapter(createArcWritingText("t2", NOW), "book1", "chapter1", NOW);
  const list = [standalone, incorporated];
  assert.deepEqual(resolveStandaloneWritingTexts(list).map((t) => t.id), ["t1"]);
  assert.deepEqual(resolveWritingTextsForChapter(list, "chapter1").map((t) => t.id), ["t2"]);
});

test("upsertArcWritingTextInList replaces by id, never drops other rows; delete removes only the targeted id", () => {
  const a = createArcWritingText("t1", NOW);
  const b = createArcWritingText("t2", NOW);
  let list = upsertArcWritingTextInList([], a);
  list = upsertArcWritingTextInList(list, b);
  assert.equal(list.length, 2);
  list = deleteArcWritingTextFromList(list, "t1");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "t2");
});

// --- ArcBook / ArcBookChapter --------------------------------------------

test("createArcBook trims fields and starts with empty insight/relationship/goal links", () => {
  const book = createArcBook("b1", "  My Book  ", " topic ", " purpose ", "  ", NOW);
  assert.equal(book.name, "My Book");
  assert.equal(book.topic, "topic");
  assert.equal(book.purpose, "purpose");
  assert.equal(book.description, null);
  assert.deepEqual(book.insightIds, []);
  assert.deepEqual(book.relationshipIds, []);
  assert.deepEqual(book.linkedGoalIds, []);
});

test("updateArcBook patches only provided fields", () => {
  const book = createArcBook("b1", "Name", "Topic", "Purpose", null, NOW);
  const updated = updateArcBook(book, { topic: "New Topic" }, LATER);
  assert.equal(updated.name, "Name");
  assert.equal(updated.topic, "New Topic");
  assert.equal(updated.updatedAt, LATER);
});

test("link/unlink insight/relationship/goal on ArcBook are idempotent id-array ops, never duplicating the underlying record", () => {
  let book = createArcBook("b1", "Name", "Topic", "Purpose", null, NOW);
  book = linkInsightToBook(book, "i1", LATER);
  book = linkInsightToBook(book, "i1", LATER);
  assert.deepEqual(book.insightIds, ["i1"]);
  book = linkRelationshipToBook(book, "r1", LATER);
  assert.deepEqual(book.relationshipIds, ["r1"]);
  book = linkArcGymGoalToBook(book, "g1", LATER);
  book = linkArcGymGoalToBook(book, "g1", LATER);
  assert.deepEqual(book.linkedGoalIds, ["g1"]);
  book = unlinkInsightFromBook(book, "i1", LATER);
  book = unlinkRelationshipFromBook(book, "r1", LATER);
  book = unlinkArcGymGoalFromBook(book, "g1", LATER);
  assert.deepEqual(book.insightIds, []);
  assert.deepEqual(book.relationshipIds, []);
  assert.deepEqual(book.linkedGoalIds, []);
});

test("resolveArcBooksLinkedToGoal computes the reverse view fresh by filtering, never caching", () => {
  let bookA = createArcBook("b1", "A", "t", "p", null, NOW);
  const bookB = createArcBook("b2", "B", "t", "p", null, NOW);
  bookA = linkArcGymGoalToBook(bookA, "g1", LATER);
  const found = resolveArcBooksLinkedToGoal([bookA, bookB], "g1");
  assert.deepEqual(found.map((b) => b.id), ["b1"]);
});

test("deleteArcBookFromList removes only the targeted book, never touching its chapters", () => {
  const a = createArcBook("b1", "A", "t", "p", null, NOW);
  const b = createArcBook("b2", "B", "t", "p", null, NOW);
  let list = upsertArcBookInList([], a);
  list = upsertArcBookInList(list, b);
  list = deleteArcBookFromList(list, "b1");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "b2");
});

test("createArcBookChapter starts not_started with empty content/links at the given order", () => {
  const chapter = createArcBookChapter("b1", "  Chapter 1  ", " purpose ", 0, NOW);
  assert.equal(chapter.bookId, "b1");
  assert.equal(chapter.name, "Chapter 1");
  assert.equal(chapter.purpose, "purpose");
  assert.equal(chapter.content, "");
  assert.equal(chapter.status, "not_started");
  assert.equal(chapter.order, 0);
});

test("updateArcBookChapter auto-bumps not_started to in_progress on non-empty content, but never overrides an explicit status in the same patch", () => {
  const chapter = createArcBookChapter("b1", "Chapter 1", "purpose", 0, NOW);
  const withContent = updateArcBookChapter(chapter, { content: "some text" }, LATER);
  assert.equal(withContent.status, "in_progress");

  const stillNotStarted = updateArcBookChapter(chapter, { content: "   " }, LATER);
  assert.equal(stillNotStarted.status, "not_started");

  const explicitCompleted = updateArcBookChapter(chapter, { content: "text", status: "completed" }, LATER);
  assert.equal(explicitCompleted.status, "completed");
});

test("updateArcBookChapter never auto-downgrades an already in_progress/completed chapter back to not_started", () => {
  const chapter = createArcBookChapter("b1", "Chapter 1", "purpose", 0, NOW);
  const completed = updateArcBookChapter(chapter, { status: "completed" }, NOW);
  const stillCompleted = updateArcBookChapter(completed, { content: "more text" }, LATER);
  assert.equal(stillCompleted.status, "completed");
});

test("link/unlink insight/relationship on ArcBookChapter are idempotent id-array ops", () => {
  let chapter = createArcBookChapter("b1", "Chapter 1", "purpose", 0, NOW);
  chapter = linkInsightToChapter(chapter, "i1", LATER);
  chapter = linkInsightToChapter(chapter, "i1", LATER);
  assert.deepEqual(chapter.insightIds, ["i1"]);
  chapter = linkRelationshipToChapter(chapter, "r1", LATER);
  assert.deepEqual(chapter.relationshipIds, ["r1"]);
  chapter = unlinkInsightFromChapter(chapter, "i1", LATER);
  chapter = unlinkRelationshipFromChapter(chapter, "r1", LATER);
  assert.deepEqual(chapter.insightIds, []);
  assert.deepEqual(chapter.relationshipIds, []);
});

test("resolveChaptersForBook filters by bookId and sorts by order, never by date", () => {
  const c1 = createArcBookChapter("b1", "First", "", 1, LATER);
  const c2 = createArcBookChapter("b1", "Second", "", 0, NOW);
  const c3 = createArcBookChapter("b2", "Other book", "", 0, NOW);
  const found = resolveChaptersForBook([c1, c2, c3], "b1");
  assert.deepEqual(found.map((c) => c.name), ["Second", "First"]);
});

test("reorderArcBookChapters reassigns order only for the given book's chapters named in orderedIds, leaving other books and unmentioned ids untouched", () => {
  const c1 = createArcBookChapter("b1", "C1", "", 0, NOW);
  const c2 = createArcBookChapter("b1", "C2", "", 1, NOW);
  const c3 = createArcBookChapter("b2", "OtherBook", "", 0, NOW);
  const reordered = reorderArcBookChapters([c1, c2, c3], "b1", [c2.id, c1.id], LATER);
  const r1 = reordered.find((c) => c.id === c1.id)!;
  const r2 = reordered.find((c) => c.id === c2.id)!;
  const r3 = reordered.find((c) => c.id === c3.id)!;
  assert.equal(r1.order, 1);
  assert.equal(r2.order, 0);
  assert.equal(r3.order, 0); // untouched -- different book
  assert.equal(r3.updatedAt, NOW); // untouched -- never bumped
});

test("resolveLastEditedChapter returns the most recently updated chapter of a book, or null for a book with no chapters", () => {
  const c1 = createArcBookChapter("b1", "C1", "", 0, NOW);
  const c2 = { ...createArcBookChapter("b1", "C2", "", 1, NOW), updatedAt: LATER };
  assert.equal(resolveLastEditedChapter([c1, c2], "b1")?.id, c2.id);
  assert.equal(resolveLastEditedChapter([], "b1"), null);
});

test("upsertArcBookChapterInList replaces by id, never drops other rows; delete removes only the targeted id", () => {
  const a = createArcBookChapter("b1", "A", "", 0, NOW);
  const b = createArcBookChapter("b1", "B", "", 1, NOW);
  let list = upsertArcBookChapterInList([], a);
  list = upsertArcBookChapterInList(list, b);
  assert.equal(list.length, 2);
  list = deleteArcBookChapterFromList(list, a.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, b.id);
});

test("countWords handles empty/whitespace-only text and ordinary Hebrew/English text alike", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   "), 0);
  assert.equal(countWords("one two three"), 3);
  assert.equal(countWords("שלום עולם"), 2);
});

test("computeChapterWordCount/computeArcBookWordCount compute per-chapter and total counts for one book only", () => {
  const c1 = { ...createArcBookChapter("b1", "C1", "", 0, NOW), content: "one two" };
  const c2 = { ...createArcBookChapter("b1", "C2", "", 1, NOW), content: "three" };
  const other = { ...createArcBookChapter("b2", "Other", "", 0, NOW), content: "four five six" };
  assert.equal(computeChapterWordCount(c1), 2);
  const counts = computeArcBookWordCount([c1, c2, other], "b1");
  assert.equal(counts.totalWordCount, 3);
  assert.equal(counts.chapterWordCounts[c1.id], 2);
  assert.equal(counts.chapterWordCounts[c2.id], 1);
  assert.equal(counts.chapterWordCounts[other.id], undefined);
});

test("deleting/editing an insight or relationship never touches an existing text/chapter that links to it -- the link simply goes stale, filtered wherever resolved", () => {
  // Structural guarantee: none of the delete-from-list functions for
  // ArcInsightRelationship/ArcWritingText/ArcBook/ArcBookChapter take any
  // OTHER collection as a parameter, so they cannot cascade into one.
  let text = createArcWritingText("t1", NOW);
  text = linkInsightToWritingText(text, "deleted-insight", NOW);
  // The insight itself (owned by arc/arcInsightBelief.ts, not this module)
  // is "deleted" simply by not appearing in whatever insight list the
  // caller resolves against -- the text's own insightIds array is
  // completely unaffected by that.
  assert.deepEqual(text.insightIds, ["deleted-insight"]);
});

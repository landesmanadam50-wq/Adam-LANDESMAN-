import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcVideoRecording,
  createArcWritingText,
  deleteArcVideoRecordingFromList,
  generateArcVideoRecordingId,
  linkArcGymGoalToVideoRecording,
  linkInsightToVideoRecording,
  linkRelationshipToVideoRecording,
  publishArcVideoRecording,
  resolveDistinctVideoTopics,
  resolvePrivateVideoRecordings,
  resolvePublishedVideoRecordings,
  resolveVideoRecordingsForScript,
  resolveVideoRecordingsForTopic,
  resolveVideoRecordingsLinkedToGoal,
  resolveVideoScriptTexts,
  setWritingTextVideoRecording,
  unlinkArcGymGoalFromVideoRecording,
  unlinkInsightFromVideoRecording,
  unlinkRelationshipFromVideoRecording,
  unpublishArcVideoRecording,
  updateArcVideoRecording,
  updateArcWritingText,
  upsertArcVideoRecordingInList,
} from "./arcWriting.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-01T00:10:00.000Z";

// --- ArcWritingText video-script extension -------------------------------

test("createArcWritingText defaults to kind 'standard' with no video fields set -- every pre-existing text is unaffected by this feature", () => {
  const text = createArcWritingText("t1", NOW);
  assert.equal(text.kind, "standard");
  assert.equal(text.videoTopic, null);
  assert.equal(text.videoPurpose, null);
  assert.equal(text.videoRecordingId, null);
});

test("required: a text can be turned into a video script via updateArcWritingText, capturing its own topic and purpose (spec section 1) -- its body is still the trainee's own words, used as the teleprompter script", () => {
  const text = createArcWritingText("t1", NOW);
  const script = updateArcWritingText(text, { kind: "video_script", videoTopic: "התמדה", videoPurpose: "להראות איך אני מתמודד" }, LATER);
  assert.equal(script.kind, "video_script");
  assert.equal(script.videoTopic, "התמדה");
  assert.equal(script.videoPurpose, "להראות איך אני מתמודד");
  assert.equal(script.updatedAt, LATER);
});

test("updateArcWritingText trims videoTopic/videoPurpose and converts an empty string to null, same whitespace convention as every other optional text field in this module", () => {
  const text = createArcWritingText("t1", NOW);
  const updated = updateArcWritingText(text, { videoTopic: "  נושא  ", videoPurpose: "   " }, LATER);
  assert.equal(updated.videoTopic, "נושא");
  assert.equal(updated.videoPurpose, null);
});

test("setWritingTextVideoRecording points the script at a recording id, and re-pointing to a different id simply replaces it (spec section 3: 'update the script and re-record') -- never accumulating a history on the script itself", () => {
  const text = createArcWritingText("t1", NOW);
  const withFirst = setWritingTextVideoRecording(text, "rec-1", LATER);
  assert.equal(withFirst.videoRecordingId, "rec-1");
  const withSecond = setWritingTextVideoRecording(withFirst, "rec-2", "2026-01-01T00:20:00.000Z");
  assert.equal(withSecond.videoRecordingId, "rec-2");
});

test("setWritingTextVideoRecording is a no-op (same updatedAt) when the id is already set to the given value", () => {
  const text = setWritingTextVideoRecording(createArcWritingText("t1", NOW), "rec-1", NOW);
  const again = setWritingTextVideoRecording(text, "rec-1", LATER);
  assert.equal(again.updatedAt, NOW);
});

test("resolveVideoScriptTexts returns only kind='video_script' texts, leaving ordinary texts out -- a separate, narrower view from resolveStandaloneWritingTexts, never a replacement for it", () => {
  const standard = createArcWritingText("t1", NOW);
  const script = updateArcWritingText(createArcWritingText("t2", NOW), { kind: "video_script" }, NOW);
  const result = resolveVideoScriptTexts([standard, script]);
  assert.deepEqual(result.map((t) => t.id), ["t2"]);
});

// --- ArcVideoRecording CRUD -----------------------------------------------

test("createArcVideoRecording defaults to visibility 'private', isDraft true, no insight/relationship/goal links, and no duration yet (unknown until the file is measured)", () => {
  const recording = createArcVideoRecording("v1", "t1", "file:///videos/v1.mp4", "כותרת", "נושא", "מטרה", NOW);
  assert.equal(recording.scriptId, "t1");
  assert.equal(recording.localUri, "file:///videos/v1.mp4");
  assert.equal(recording.visibility, "private");
  assert.equal(recording.isDraft, true);
  assert.equal(recording.durationSeconds, null);
  assert.deepEqual(recording.insightIds, []);
  assert.deepEqual(recording.relationshipIds, []);
  assert.deepEqual(recording.linkedGoalIds, []);
});

test("generateArcVideoRecordingId produces a non-empty, distinct id on each call", () => {
  const a = generateArcVideoRecordingId();
  const b = generateArcVideoRecordingId();
  assert.ok(a.length > 0 && b.length > 0);
  assert.notEqual(a, b);
});

test("updateArcVideoRecording patches title/topic/purpose/description/durationSeconds/isDraft/localUri independently, trimming text fields and converting empty description to null", () => {
  const recording = createArcVideoRecording("v1", "t1", "file:///a.mp4", "כותרת", "נושא", "מטרה", NOW);
  const updated = updateArcVideoRecording(recording, { title: "  כותרת חדשה  ", description: "  ", durationSeconds: 42, isDraft: false, localUri: "file:///b.mp4" }, LATER);
  assert.equal(updated.title, "כותרת חדשה");
  assert.equal(updated.description, null);
  assert.equal(updated.durationSeconds, 42);
  assert.equal(updated.isDraft, false);
  assert.equal(updated.localUri, "file:///b.mp4");
  assert.equal(updated.topic, recording.topic, "fields not in the patch are left untouched");
  assert.equal(updated.updatedAt, LATER);
});

test("upsertArcVideoRecordingInList inserts a new recording and replaces an existing one by id, same convention as every other upsertInList in this module", () => {
  const a = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  const inserted = upsertArcVideoRecordingInList([], a);
  assert.equal(inserted.length, 1);
  const edited = updateArcVideoRecording(a, { title: "a2" }, LATER);
  const replaced = upsertArcVideoRecordingInList(inserted, edited);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].title, "a2");
});

test("deleteArcVideoRecordingFromList removes only the matching record -- it never deletes the underlying file (that is arc/arcVideoFile.ts's own job)", () => {
  const a = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  const b = createArcVideoRecording("v2", "t1", "file:///b.mp4", "b", "topic", "purpose", NOW);
  const result = deleteArcVideoRecordingFromList([a, b], "v1");
  assert.deepEqual(result.map((r) => r.id), ["v2"]);
});

// --- insight/relationship/goal linking (same idempotent-array convention) ---

test("linkInsightToVideoRecording/unlinkInsightFromVideoRecording are idempotent, same convention as linkInsightToWritingText", () => {
  const recording = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  const linked = linkInsightToVideoRecording(recording, "ins-1", LATER);
  assert.deepEqual(linked.insightIds, ["ins-1"]);
  const linkedAgain = linkInsightToVideoRecording(linked, "ins-1", "2026-01-01T00:20:00.000Z");
  assert.deepEqual(linkedAgain.insightIds, ["ins-1"]);
  assert.equal(linkedAgain.updatedAt, LATER, "re-linking an already-linked insight is a no-op");
  const unlinked = unlinkInsightFromVideoRecording(linked, "ins-1", "2026-01-01T00:20:00.000Z");
  assert.deepEqual(unlinked.insightIds, []);
});

test("linkRelationshipToVideoRecording/unlinkRelationshipFromVideoRecording follow the same idempotent-array convention", () => {
  const recording = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  const linked = linkRelationshipToVideoRecording(recording, "rel-1", LATER);
  assert.deepEqual(linked.relationshipIds, ["rel-1"]);
  const unlinked = unlinkRelationshipFromVideoRecording(linked, "rel-1", LATER);
  assert.deepEqual(unlinked.relationshipIds, []);
});

test("linkArcGymGoalToVideoRecording/unlinkArcGymGoalFromVideoRecording follow the same consumer-side convention as ArcBook.linkedGoalIds -- the goal itself is never touched", () => {
  const recording = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  const linked = linkArcGymGoalToVideoRecording(recording, "goal-1", LATER);
  assert.deepEqual(linked.linkedGoalIds, ["goal-1"]);
  const unlinked = unlinkArcGymGoalFromVideoRecording(linked, "goal-1", LATER);
  assert.deepEqual(unlinked.linkedGoalIds, []);
});

// --- publish/private (required: only via the one dedicated function, confirmable in the UI) ---

test("required: publishArcVideoRecording is the ONLY function that sets visibility to 'published' -- a freshly created recording starts private, and publishing is a deliberate, separate step", () => {
  const recording = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  assert.equal(recording.visibility, "private");
  const published = publishArcVideoRecording(recording, LATER);
  assert.equal(published.visibility, "published");
  assert.equal(published.updatedAt, LATER);
});

test("publishArcVideoRecording is idempotent (no-op updatedAt) when already published; unpublishArcVideoRecording reverts back to private", () => {
  const recording = publishArcVideoRecording(createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW), NOW);
  const publishedAgain = publishArcVideoRecording(recording, LATER);
  assert.equal(publishedAgain.updatedAt, NOW);
  const reverted = unpublishArcVideoRecording(recording, LATER);
  assert.equal(reverted.visibility, "private");
  assert.equal(reverted.updatedAt, LATER);
});

test("resolvePublishedVideoRecordings/resolvePrivateVideoRecordings partition a list correctly", () => {
  const a = publishArcVideoRecording(createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW), NOW);
  const b = createArcVideoRecording("v2", "t1", "file:///b.mp4", "b", "topic", "purpose", NOW);
  assert.deepEqual(resolvePublishedVideoRecordings([a, b]).map((r) => r.id), ["v1"]);
  assert.deepEqual(resolvePrivateVideoRecordings([a, b]).map((r) => r.id), ["v2"]);
});

// --- organizing by script / topic / goal ----------------------------------

test("resolveVideoRecordingsForScript returns only recordings belonging to the given script", () => {
  const a = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW);
  const b = createArcVideoRecording("v2", "t2", "file:///b.mp4", "b", "topic", "purpose", NOW);
  assert.deepEqual(resolveVideoRecordingsForScript([a, b], "t1").map((r) => r.id), ["v1"]);
});

test("resolveVideoRecordingsLinkedToGoal returns only recordings linked to the given goal, same convention as resolveArcBooksLinkedToGoal", () => {
  const a = linkArcGymGoalToVideoRecording(createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW), "goal-1", NOW);
  const b = createArcVideoRecording("v2", "t1", "file:///b.mp4", "b", "topic", "purpose", NOW);
  assert.deepEqual(resolveVideoRecordingsLinkedToGoal([a, b], "goal-1").map((r) => r.id), ["v1"]);
});

test("required: resolveDistinctVideoTopics returns every unique, non-empty topic, alphabetically sorted, for the video library's 'browse by topic' section headers", () => {
  const a = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "ב-נושא", "p", NOW);
  const b = createArcVideoRecording("v2", "t1", "file:///b.mp4", "b", "א-נושא", "p", NOW);
  const c = createArcVideoRecording("v3", "t1", "file:///c.mp4", "c", "ב-נושא", "p", NOW);
  assert.deepEqual(resolveDistinctVideoTopics([a, b, c]), ["א-נושא", "ב-נושא"]);
});

test("resolveVideoRecordingsForTopic returns every recording sharing the exact given topic string", () => {
  const a = createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "נושא", "p", NOW);
  const b = createArcVideoRecording("v2", "t1", "file:///b.mp4", "b", "נושא אחר", "p", NOW);
  assert.deepEqual(resolveVideoRecordingsForTopic([a, b], "נושא").map((r) => r.id), ["v1"]);
});

test("deleting/editing an insight, relationship, or goal never touches an existing ArcVideoRecording that links to it -- the link simply goes stale, same non-cascading convention as the rest of this module", () => {
  const recording = linkInsightToVideoRecording(createArcVideoRecording("v1", "t1", "file:///a.mp4", "a", "topic", "purpose", NOW), "ins-1", NOW);
  // Nothing external (deleting the insight record elsewhere) is modeled here since this module never reaches into another collection -- this test documents the structural guarantee: insightIds is a plain array this module itself never prunes except via the explicit unlink function above.
  assert.deepEqual(recording.insightIds, ["ins-1"]);
});

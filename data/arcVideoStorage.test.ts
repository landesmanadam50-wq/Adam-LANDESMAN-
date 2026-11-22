import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/arcVideoStorage.test.ts
 *
 * ARC Video task: source-text regression guard for this feature's own
 * AsyncStorage-backed CRUD and the camera/microphone permission-
 * explanation pair, added to data/storage.ts -- same convention as
 * every other data/*.test.ts file (AsyncStorage isn't a callable mock
 * under a plain `node --test` run). The pure ArcVideoRecording/
 * ArcWritingText logic itself is fully exercised in arc/arcVideo.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const storage = readSource("data/storage.ts");

test("ArcVideoRecording gets its own storage key, strictly separate from the other four ArcWriting-family keys -- deleting/editing one never risks corrupting another", () => {
  assert.match(storage, /const ARC_VIDEO_RECORDINGS_KEY = "archi\.arcVideoRecordings\.v1";/);
});

test("loadArcVideoRecordings/upsertArcVideoRecordingEntry/deleteArcVideoRecordingEntry follow the EXACT same load/upsert/delete shape as every other section in this file (defensive JSON.parse, [] on error, never throws)", () => {
  const fnIndex = storage.indexOf("export async function loadArcVideoRecordings()");
  const fnBody = storage.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("JSON.parse(raw) as ArcVideoRecording[]"));
  assert.ok(fnBody.includes("Array.isArray(parsed) ? parsed : []"));
  assert.ok(fnBody.includes("console.warn"));
  assert.match(storage, /export async function upsertArcVideoRecordingEntry\(recording: ArcVideoRecording\): Promise<void> \{/);
  assert.match(storage, /export async function deleteArcVideoRecordingEntry\(id: string\): Promise<void> \{/);
  assert.ok(storage.includes("upsertArcVideoRecordingInList(recordings, recording)"), "upsert must go through the pure in-list helper, never a hand-rolled splice");
});

test("required: loadArcWritingTexts backfills kind/videoTopic/videoPurpose/videoRecordingId on every record via normalizeArcWritingText (arc/tasks.ts's own normalizeTask convention) -- a text saved before this feature existed is never crashed on or silently mis-typed", () => {
  const fnIndex = storage.indexOf("export async function loadArcWritingTexts()");
  const fnBody = storage.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("parsed.map(normalizeArcWritingText)"));
});

test("required: a one-time camera/microphone permission explanation exists, mirroring hasSeenNotificationExplanation/markNotificationExplanationSeen exactly -- same fail-toward-showing-again direction on a storage error", () => {
  assert.match(storage, /const CAMERA_EXPLANATION_SEEN_KEY = "archi\.cameraExplanationSeen\.v1";/);
  const hasSeenIndex = storage.indexOf("export async function hasSeenCameraExplanation()");
  const hasSeenBody = storage.slice(hasSeenIndex, storage.indexOf("\n}", hasSeenIndex));
  assert.ok(hasSeenBody.includes('=== "true"'));
  assert.ok(hasSeenBody.includes("return false;"), "a read error must fail toward showing the explanation again, never toward silently skipping it");
  const markIndex = storage.indexOf("export async function markCameraExplanationSeen()");
  const markBody = storage.slice(markIndex, storage.indexOf("\n}", markIndex));
  assert.ok(markBody.includes('AsyncStorage.setItem(CAMERA_EXPLANATION_SEEN_KEY, "true")'));
});

test("the new ArcVideoRecording/normalizeArcWritingText imports are added to the SAME existing arc/arcWriting.ts import block -- never a second, duplicated import line for that module", () => {
  const occurrences = storage.split('from "../arc/arcWriting.ts"').length - 1;
  assert.equal(occurrences, 2, "exactly one `import type` line and one `import` (values) line, same as every other module imported into this file");
  assert.match(storage, /import type \{ ArcInsightRelationship, ArcWritingText, ArcBook, ArcBookChapter, ArcVideoRecording \} from "\.\.\/arc\/arcWriting\.ts";/);
});

test("required: the teleprompter overlay's settings get their own single-object storage key, loaded/saved via loadTeleprompterSettings/saveTeleprompterSettings with the exact same defensive JSON.parse/normalize-on-error convention as every other section in this file", () => {
  assert.match(storage, /const TELEPROMPTER_SETTINGS_KEY = "archi\.teleprompterSettings\.v1";/);
  const loadIndex = storage.indexOf("export async function loadTeleprompterSettings()");
  const loadBody = storage.slice(loadIndex, storage.indexOf("\n}", loadIndex));
  assert.ok(loadBody.includes("createDefaultTeleprompterSettings()"));
  assert.ok(loadBody.includes("normalizeTeleprompterSettings(JSON.parse(raw)"));
  assert.ok(loadBody.includes("catch (error)"));
  assert.match(storage, /export async function saveTeleprompterSettings\(settings: TeleprompterSettings\): Promise<void> \{/);
});

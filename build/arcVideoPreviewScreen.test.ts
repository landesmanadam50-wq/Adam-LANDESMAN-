import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcVideoPreviewScreen.test.ts
 *
 * ARC Video task: source-text regression guard for the post-recording
 * review screen (playback/retake/edit-script/save-as-draft) -- same
 * convention as every other *.test.ts in this repo (no RN/expo-video
 * renderer available under a plain `node --test` run).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/ArcVideoPreviewScreen.tsx");
const route = readSource("app/arc-gym/video/preview/[id].tsx");
const layout = readSource("app/_layout.tsx");

test("required: this screen is the only one (besides arc/arcVideoFile.ts's own doc comment, which merely describes it) permitted to import expo-video's VideoView/useVideoPlayer", () => {
  assert.ok(screen.includes('import { VideoView, useVideoPlayer } from "expo-video";'));
});

test("required: playback uses useVideoPlayer with the recording's OWN localUri -- never a hand-built or guessed path", () => {
  assert.ok(screen.includes("useVideoPlayer(recording?.localUri ?? null"));
  assert.ok(screen.includes("<VideoView style={styles.video} player={player} nativeControls />"));
});

test("required: retake deletes the current take's file AND metadata record AND clears the script's videoRecordingId pointer, then returns to the SAME script's record screen -- never leaves an orphaned file or a dangling pointer", () => {
  const fnIndex = screen.indexOf("async function handleRetake()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("deleteRecordingFile(recording.localUri);"));
  assert.ok(fnBody.includes("await deleteArcVideoRecordingEntry(recording.id);"));
  assert.ok(fnBody.includes("setWritingTextVideoRecording(script, null, new Date().toISOString())"));
  assert.ok(fnBody.includes('router.replace({ pathname: "/arc-gym/video/record/[scriptId]", params: { scriptId: script.id } });'));
});

test("required: editing the script navigates to the SAME ArcWritingTextScreen (build/ArcWritingTextScreen.tsx via /arc-gym/writing/[id]) without touching this take's own record -- re-recording from there creates a separate take, never silently overwrites this one", () => {
  const fnIndex = screen.indexOf("function handleEditScript()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('router.push({ pathname: "/arc-gym/writing/[id]", params: { id: script.id } });'));
  assert.ok(!fnBody.includes("deleteArcVideoRecordingEntry"), "editing the script must never delete the current take");
  assert.ok(!fnBody.includes("deleteRecordingFile"), "editing the script must never delete the current take's file");
});

test("required: saving as a draft is a plain exit back to the script screen -- the recording is already isDraft:true by construction (arc/arcWriting.ts's own createArcVideoRecording), so this screen never needs a separate 'mark as draft' write", () => {
  const fnIndex = screen.indexOf("function handleSaveDraft()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('router.replace({ pathname: "/arc-gym/writing/[id]", params: { id: script.id } });'));
});

test("this screen never flips visibility to published -- publishing stays confined to publishArcVideoRecording, called only from the (later) video library/detail screens", () => {
  assert.ok(!screen.includes("publishArcVideoRecording"));
  assert.ok(!screen.includes('visibility: "published"'));
});

test("the route wrapper forwards id straight through, same 2-line pattern as every other route wrapper in this app, and is registered in app/_layout.tsx", () => {
  assert.ok(route.includes("<ArcVideoPreviewScreen id={id} />"));
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/preview\/\[id\]" options=\{\{ title: "תצוגה מקדימה" \}\} \/>/);
});

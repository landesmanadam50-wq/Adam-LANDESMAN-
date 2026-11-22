import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * arc/arcVideoIntegration.test.ts
 *
 * ARC Video task: the consolidated cross-file checks deferred from
 * arc/arcVideoFile.test.ts (written once every ARC Video screen
 * existed) -- mirroring arc/arcWritingIntegration.test.ts's own
 * "arc/arcBookExport.ts is the ONLY module importing expo-print/
 * expo-sharing" pattern exactly, plus the end-to-end route-reachability
 * checks for the whole feature.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const arcVideoFile = readSource("arc/arcVideoFile.ts");
const arcWriting = readSource("arc/arcWriting.ts");
const teleprompterSettings = readSource("arc/teleprompterSettings.ts");
const storage = readSource("data/storage.ts");
const writingHomeScreen = readSource("build/ArcWritingHomeScreen.tsx");
const writingTextScreen = readSource("build/ArcWritingTextScreen.tsx");
const recordScreen = readSource("build/ArcVideoRecordScreen.tsx");
const previewScreen = readSource("build/ArcVideoPreviewScreen.tsx");
const libraryScreen = readSource("build/ArcVideoLibraryScreen.tsx");
const detailScreen = readSource("build/ArcVideoDetailScreen.tsx");
const writingRoute = readSource("app/arc-gym/writing/[id].tsx");
const recordRoute = readSource("app/arc-gym/video/record/[scriptId].tsx");
const previewRoute = readSource("app/arc-gym/video/preview/[id].tsx");
const libraryRoute = readSource("app/arc-gym/video/index.tsx");
const detailRoute = readSource("app/arc-gym/video/[id].tsx");
const layout = readSource("app/_layout.tsx");

const NON_NATIVE_MODULES = [arcWriting, teleprompterSettings, storage, writingHomeScreen, writingTextScreen, libraryScreen, detailScreen];

test("required: build/ArcVideoRecordScreen.tsx is the ONLY module importing expo-camera, and build/ArcVideoPreviewScreen.tsx is the ONLY module importing expo-video -- arc/arcVideoFile.ts imports expo-camera too (for the imperative permission calls), but every pure/UI module outside those three stays free of both", () => {
  assert.ok(recordScreen.includes('from "expo-camera"'));
  assert.ok(arcVideoFile.includes('from "expo-camera"'));
  assert.ok(previewScreen.includes('from "expo-video"'));
  for (const module_ of NON_NATIVE_MODULES) {
    assert.ok(!module_.includes('from "expo-camera"'), "a non-native ARC Video module must never import expo-camera");
    assert.ok(!module_.includes('from "expo-video"'), "a non-native ARC Video module must never import expo-video");
  }
  assert.ok(!recordScreen.includes('from "expo-video"'), "the record screen itself never needs playback");
  assert.ok(!previewScreen.includes('from "expo-camera"'), "the preview screen itself never needs the camera");
});

test("required: arc/arcVideoFile.ts remains the ONLY module importing expo-file-system -- every screen only ever receives a plain string localUri, never touching the filesystem API directly", () => {
  assert.ok(arcVideoFile.includes('from "expo-file-system"'));
  for (const module_ of [...NON_NATIVE_MODULES, recordScreen, previewScreen]) {
    assert.ok(!module_.includes('from "expo-file-system"'));
  }
});

test("required: the full ARC Video route chain is reachable end-to-end -- ARC Writing home -> video-script text -> record -> preview -> back to the script, and ARC Writing home -> video library -> video detail -> preview", () => {
  assert.ok(writingHomeScreen.includes('params: { id: "new", kind: "video_script" }'));
  assert.ok(writingTextScreen.includes('pathname: "/arc-gym/video/record/[scriptId]", params: { scriptId: text.id }'));
  assert.ok(recordScreen.includes('pathname: "/arc-gym/video/preview/[id]", params: { id: recording.id }'));
  assert.ok(previewScreen.includes('pathname: "/arc-gym/writing/[id]", params: { id: script.id }'));
  assert.ok(writingHomeScreen.includes('router.push("/arc-gym/video")'));
  assert.ok(libraryScreen.includes('pathname: "/arc-gym/video/[id]", params: { id: item.id }'));
  assert.ok(detailScreen.includes('pathname: "/arc-gym/video/preview/[id]", params: { id: recording.id }'));
});

test("every ARC Video route wrapper is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/record\/\[scriptId\]"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/preview\/\[id\]"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/index"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/\[id\]"/);
});

test("required: ARC Video is reachable ONLY through ARC Writing (never a second, competing top-level ARC Gym entry) -- the writing route itself is the sole gateway into script creation, and no video route is linked from build/ArcGymScreen.tsx directly", () => {
  const arcGymScreen = readSource("build/ArcGymScreen.tsx");
  assert.ok(!arcGymScreen.includes("/arc-gym/video"));
  assert.ok(writingRoute.includes("<ArcWritingTextScreen id={id} initialKind={kind"));
});

test("required: every ARC Video route wrapper is a plain 2-line param-forward, same convention as every other route wrapper in this app", () => {
  assert.ok(recordRoute.includes("<ArcVideoRecordScreen scriptId={scriptId} />"));
  assert.ok(previewRoute.includes("<ArcVideoPreviewScreen id={id} />"));
  assert.ok(libraryRoute.includes("<ArcVideoLibraryScreen />"));
  assert.ok(detailRoute.includes("<ArcVideoDetailScreen id={id} />"));
});

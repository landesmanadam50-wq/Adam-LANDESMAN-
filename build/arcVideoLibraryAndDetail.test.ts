import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcVideoLibraryAndDetail.test.ts
 *
 * ARC Video task: source-text regression guard for the library (browse
 * by topic, private/published filter) and detail (metadata editing,
 * publish confirmation, linking, delete) screens -- same convention as
 * every other *.test.ts in this repo (no RN renderer available under a
 * plain `node --test` run).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const library = readSource("build/ArcVideoLibraryScreen.tsx");
const detail = readSource("build/ArcVideoDetailScreen.tsx");
const indexRoute = readSource("app/arc-gym/video/index.tsx");
const detailRoute = readSource("app/arc-gym/video/[id].tsx");
const layout = readSource("app/_layout.tsx");
const writingHome = readSource("build/ArcWritingHomeScreen.tsx");

test("required: the library screen groups videos by topic via resolveDistinctVideoTopics/resolveVideoRecordingsForTopic (never a hand-rolled grouping), with an explicit bucket for videos that have no topic", () => {
  assert.ok(library.includes("resolveDistinctVideoTopics(filtered)"));
  assert.ok(library.includes("resolveVideoRecordingsForTopic(filtered, topic)"));
  assert.ok(library.includes('const UNTITLED_TOPIC_LABEL = "ללא נושא";'));
});

test("required: the library screen filters by private/published via resolvePrivateVideoRecordings/resolvePublishedVideoRecordings (never a hand-rolled visibility check), defaulting to showing all", () => {
  assert.ok(library.includes('useState<VisibilityFilter>("all")'));
  assert.ok(library.includes("resolvePrivateVideoRecordings(recordings)"));
  assert.ok(library.includes("resolvePublishedVideoRecordings(recordings)"));
});

test("the library screen never plays a video or changes visibility itself -- tapping a row only navigates to the detail screen", () => {
  assert.ok(!library.includes('from "expo-video"'));
  assert.ok(!library.includes("publishArcVideoRecording"));
  assert.ok(library.includes('router.push({ pathname: "/arc-gym/video/[id]", params: { id: item.id } })'));
});

test("required: the detail screen's publish toggle goes through ONE confirmation dialog before publishArcVideoRecording, but unpublishing (back to private) needs no confirmation", () => {
  const fnIndex = detail.indexOf("function handleTogglePublish()");
  const fnBody = detail.slice(fnIndex, detail.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (recording.visibility === "published") {'));
  assert.ok(fnBody.includes("unpublishArcVideoRecording(recording, new Date().toISOString())"));
  assert.ok(fnBody.includes('Alert.alert("פרסום סרטון"'));
  assert.ok(fnBody.includes("publishArcVideoRecording(recording, new Date().toISOString())"));
});

test("required: deleting a video confirms first, then deletes the FILE and the metadata record together -- never one without the other", () => {
  const fnIndex = detail.indexOf("function handleDelete()");
  const fnBody = detail.slice(fnIndex, detail.indexOf("\n  }", fnIndex + 50));
  assert.ok(fnBody.includes('Alert.alert("מחיקת סרטון"'));
  assert.ok(fnBody.includes("deleteRecordingFile(recording.localUri);"));
  assert.ok(fnBody.includes("await deleteArcVideoRecordingEntry(recording.id);"));
});

test("required: playback from the detail screen routes to the one expo-video screen (build/ArcVideoPreviewScreen.tsx) rather than importing expo-video a second time", () => {
  assert.ok(!detail.includes('from "expo-video"'));
  assert.ok(detail.includes('router.push({ pathname: "/arc-gym/video/preview/[id]", params: { id: recording.id } })'));
});

test("required: the detail screen reuses the SAME ArcInsightPicker/ArcRelationshipPicker components ArcWritingTextScreen/ArcBookDetailScreen already use, plus a hand-rolled goal-linking list in ArcBookDetailScreen's own convention -- never a new, parallel picker UI", () => {
  assert.ok(detail.includes('import ArcInsightPicker from "../live/components/ArcInsightPicker.tsx";'));
  assert.ok(detail.includes('import ArcRelationshipPicker from "../live/components/ArcRelationshipPicker.tsx";'));
  assert.ok(detail.includes("linkArcGymGoalToVideoRecording(recording, goalId, now)"));
});

test("both routes are registered in app/_layout.tsx and forward their params straight through", () => {
  assert.ok(indexRoute.includes("<ArcVideoLibraryScreen />"));
  assert.ok(detailRoute.includes("<ArcVideoDetailScreen id={id} />"));
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/index" options=\{\{ title: "ספריית הסרטונים שלי" \}\} \/>/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/\[id\]" options=\{\{ title: "סרטון" \}\} \/>/);
});

test("required: ARC Writing's home screen offers a direct entry point to the video library, alongside its text/book/video-script cards", () => {
  assert.ok(writingHome.includes("🎬 ספריית הסרטונים שלי"));
  assert.ok(writingHome.includes('router.push("/arc-gym/video")'));
});

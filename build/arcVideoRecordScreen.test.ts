import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcVideoRecordScreen.test.ts
 *
 * ARC Video task: source-text regression guard for the camera + teleprompter
 * recording screen -- same convention as every other *.test.ts in this repo
 * (no RN/expo-camera renderer available under a plain `node --test` run).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/ArcVideoRecordScreen.tsx");
const route = readSource("app/arc-gym/video/record/[scriptId].tsx");
const layout = readSource("app/_layout.tsx");

test("required: this screen is the only one that imports expo-camera's CameraView -- the isolated-native-import discipline extends to the actual recording UI, mirroring arc/arcVideoFile.ts's own isolation for the imperative permission/file calls", () => {
  assert.ok(screen.includes('import { CameraView } from "expo-camera";'));
});

test("required: the one-time camera/mic explanation (hasSeenCameraExplanation/markCameraExplanationSeen) is checked and shown BEFORE requestCameraAndMicrophonePermissions ever runs", () => {
  const focusIndex = screen.indexOf("useFocusEffect(");
  const focusBody = screen.slice(focusIndex, screen.indexOf("handleDismissExplanation", focusIndex));
  assert.ok(focusBody.includes("hasSeenCameraExplanation()"));
  assert.ok(focusBody.includes("if (seenExplanation) {"));
  assert.ok(focusBody.includes("requestPermissions();"));
  const dismissIndex = screen.indexOf("async function handleDismissExplanation()");
  const dismissBody = screen.slice(dismissIndex, screen.indexOf("\n  }", dismissIndex));
  assert.ok(dismissBody.includes("await markCameraExplanationSeen();"));
  assert.ok(dismissBody.includes("await requestPermissions();"));
});

test("a denied camera/microphone permission blocks recording with a clear message, never a silent crash or a blank camera view", () => {
  assert.ok(screen.includes("permissionsGranted === false"));
  assert.ok(screen.includes("לא ניתנה גישה למצלמה ו/או למיקרופון"));
});

test("required: the teleprompter text block renders the SAME script.body the trainee wrote in ArcWritingTextScreen -- never a second, copied/duplicated script text", () => {
  assert.ok(screen.includes("{script.body || \"(התסריט ריק)\"}"));
});

test("required: the teleprompter block is a plain sibling View positioned on top of CameraView (absolute position, never a prop/child passed INTO CameraView) -- structurally guaranteeing the overlay text is never part of the camera's own recorded buffer", () => {
  const cameraIndex = screen.indexOf("<CameraView ref={cameraRef}");
  const cameraLineEnd = screen.indexOf("/>", cameraIndex);
  assert.ok(screen.slice(cameraIndex, cameraLineEnd + 2).match(/<CameraView[^>]*\/>/), "CameraView must be a self-closing element with no children");
  assert.match(screen, /teleprompterBlock: \{ position: "absolute"/);
});

test("required: font size, scroll speed, and text position are each independently adjustable and persisted via saveTeleprompterSettings, each clamped to teleprompterSettings.ts's own valid ranges", () => {
  assert.ok(screen.includes("function adjustFontSize(delta: number)"));
  assert.ok(screen.includes("function adjustScrollSpeed(delta: number)"));
  assert.ok(screen.includes("function adjustTextPosition(delta: number)"));
  const persistIndex = screen.indexOf("function persistSettings(");
  const persistBody = screen.slice(persistIndex, screen.indexOf("\n  }", persistIndex));
  assert.ok(persistBody.includes("saveTeleprompterSettings(next)"));
  assert.ok(screen.includes("clamp(settings.fontSize + delta, FONT_SIZE_MIN, FONT_SIZE_MAX)"));
  assert.ok(screen.includes("clamp(settings.scrollSpeedSecondsPerLine + delta, SCROLL_SPEED_MIN, SCROLL_SPEED_MAX)"));
  assert.ok(screen.includes("clamp(settings.textPositionOffset + delta, TEXT_POSITION_MIN, TEXT_POSITION_MAX)"));
});

test("required: scrolling can be paused and resumed without affecting the recording itself -- pause only stops the interval driving the overlay's scroll position", () => {
  assert.ok(screen.includes("setScrollPaused((prev) => !prev)"));
  const effectIndex = screen.indexOf("useEffect(() => {\n    if (scrollPaused) return;");
  assert.ok(effectIndex !== -1, "the autoscroll effect must early-return on scrollPaused");
});

test("required: starting/stopping recording uses the SAME CameraView ref's recordAsync/stopRecording pair -- recordAsync's own resolved uri is the only source handed to saveRecordingToPermanentStorage, never a guessed/hand-built path", () => {
  const fnIndex = screen.indexOf("async function handleToggleRecording()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex + 200));
  assert.ok(fnBody.includes("cameraRef.current.stopRecording();"));
  assert.ok(fnBody.includes("cameraRef.current.recordAsync({ maxDuration: MAX_RECORDING_SECONDS })"));
  assert.ok(fnBody.includes("await finalizeRecording(result.uri);"));
  const finalizeIndex = screen.indexOf("async function finalizeRecording(");
  const finalizeBody = screen.slice(finalizeIndex, screen.indexOf("\n  }", finalizeIndex));
  assert.ok(finalizeBody.includes("saveRecordingToPermanentStorage(temporaryUri, recordingId)"));
});

test("required: a failed recording never crashes the screen -- it resets isRecording and shows a plain Alert, the same convention as arc/arcVideoFile.ts's own saveRecordingToPermanentStorage", () => {
  const fnIndex = screen.indexOf("async function handleToggleRecording()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex + 200));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("catch (error)"));
  assert.ok(fnBody.includes("setIsRecording(false);"));
  assert.ok(fnBody.includes("Alert.alert("));
});

test("required: a successful recording links the NEW ArcVideoRecording to the script via setWritingTextVideoRecording (the script's own single current-recording pointer), then navigates to the preview screen -- it never leaves the trainee staring at the camera after saving", () => {
  const finalizeIndex = screen.indexOf("async function finalizeRecording(");
  const finalizeBody = screen.slice(finalizeIndex, screen.indexOf("\n  }", finalizeIndex));
  assert.ok(finalizeBody.includes("upsertArcVideoRecordingEntry(recording)"));
  assert.ok(finalizeBody.includes("setWritingTextVideoRecording(script, recording.id, now)"));
  assert.ok(finalizeBody.includes('router.replace({ pathname: "/arc-gym/video/preview/[id]", params: { id: recording.id } });'));
});

test("the route wrapper forwards scriptId straight through, same 2-line pattern as every other route wrapper in this app, and is registered in app/_layout.tsx with headerShown:false (a full-screen camera UI, no header bar)", () => {
  assert.ok(route.includes("<ArcVideoRecordScreen scriptId={scriptId} />"));
  assert.match(layout, /<Stack\.Screen name="arc-gym\/video\/record\/\[scriptId\]" options=\{\{ title: "צילום סרטון", headerShown: false \}\} \/>/);
});

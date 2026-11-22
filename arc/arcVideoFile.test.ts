import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * arc/arcVideoFile.test.ts
 *
 * ARC Video task: source-text regression guard for this module's own
 * camera-permission and file-handling logic -- same convention as
 * arc/arcBookExport.ts's own test file (expo-camera/expo-file-system
 * aren't callable in a plain `node --test` run). The cross-file "this
 * is the ONLY module importing these native dependencies" assertion is
 * covered once every ARC Video screen exists, in
 * arc/arcVideoIntegration.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("arc/arcVideoFile.ts");

test("imports expo-camera and expo-file-system -- the one module in this feature allowed to", () => {
  assert.ok(module_.includes('from "expo-file-system"'));
  assert.ok(module_.includes('from "expo-camera"'));
});

test("requestCameraAndMicrophonePermissions requests BOTH camera and microphone and returns true only if both are granted", () => {
  const fnIndex = module_.indexOf("export async function requestCameraAndMicrophonePermissions()");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("Camera.requestCameraPermissionsAsync()"));
  assert.ok(fnBody.includes("Camera.requestMicrophonePermissionsAsync()"));
  assert.ok(fnBody.includes("return cameraResult.granted && microphoneResult.granted;"));
});

test("requestCameraAndMicrophonePermissions never throws into the caller -- any unexpected error resolves to false (not granted), never an uncaught rejection", () => {
  const fnIndex = module_.indexOf("export async function requestCameraAndMicrophonePermissions()");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("catch (error)"));
  assert.ok(fnBody.includes("return false;"));
});

test("required: saveRecordingToPermanentStorage moves the camera's temporary output into this app's own document directory, named by the recording's own id -- a retake under the SAME id overwrites rather than accumulating orphaned files", () => {
  const fnIndex = module_.indexOf("export async function saveRecordingToPermanentStorage(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("new File(temporaryUri)"));
  assert.ok(fnBody.includes("`${recordingId}.mp4`"));
  assert.ok(fnBody.includes("sourceFile.move(destinationFile, { overwrite: true })"));
  assert.ok(fnBody.includes("return destinationFile.uri;"));
});

test("saveRecordingToPermanentStorage never throws into the caller -- a failed move resolves to null with a plain Alert, the same convention as arc/arcBookExport.ts's own exportArcBookToPdf", () => {
  const fnIndex = module_.indexOf("export async function saveRecordingToPermanentStorage(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("catch (error)"));
  assert.ok(fnBody.includes("Alert.alert("));
  assert.ok(fnBody.includes("return null;"));
});

test("the video recordings directory is lazily created (intermediates: true) on first use, never required to pre-exist", () => {
  assert.match(module_, /directory\.create\(\{ intermediates: true \}\);/);
});

test("deleteRecordingFile is a safe no-op when the file no longer exists -- it only calls .delete() after checking .exists, and never throws into the caller", () => {
  const fnIndex = module_.indexOf("export function deleteRecordingFile(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("if (file.exists) file.delete();"));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("catch (error)"));
});

test("resolveRecordingFileSizeBytes returns null (never throws) for a file that can no longer be read", () => {
  const fnIndex = module_.indexOf("export function resolveRecordingFileSizeBytes(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("return file.exists ? file.size : null;"));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("catch (error)"));
  assert.ok(fnBody.includes("return null;"));
});

test("this module never imports arc/newArcLiveSteps.ts, arc/newArcLiveTypes.ts, or data/storage.ts -- it is a pure file/permission I/O helper, never an orchestrator of its own, same 'isolated module owns the native import' discipline as arc/arcBookExport.ts", () => {
  assert.ok(!module_.includes('from "./newArcLiveSteps.ts"'));
  assert.ok(!module_.includes('from "./newArcLiveTypes.ts"'));
  assert.ok(!module_.includes('from "../data/storage.ts"'));
});

/**
 * arc/arcVideoFile.ts
 *
 * ARC Video task: the ONLY module in this feature that imports
 * expo-camera or expo-file-system -- everything else (arc/arcWriting.ts,
 * the storage layer, every pure helper) stays free of these native
 * dependencies, the exact same "one isolated module owns the native
 * import" discipline arc/arcBookExport.ts already established for
 * expo-print/expo-sharing. A recorded take's own bytes live here, on
 * disk, inside this app's document directory -- never in AsyncStorage;
 * `data/storage.ts`'s own ArcVideoRecording record only ever holds the
 * resulting file's plain string `localUri`.
 *
 * The actual camera PREVIEW/recording UI (expo-camera's `CameraView`)
 * and video PLAYBACK UI (expo-video's `VideoView`/`useVideoPlayer`) are
 * React components/hooks that must live directly in their own screens
 * (build/ArcVideoRecordScreen.tsx, build/ArcVideoPreviewScreen.tsx) --
 * a plain .ts module can wrap imperative async calls, never a hook.
 * Those two screens are therefore the only OTHER files permitted to
 * import expo-camera/expo-video; this module's own regression test
 * asserts that no other ARC Video source file does.
 */

import { Directory, File, Paths } from "expo-file-system";
import { Camera } from "expo-camera";
import { Alert } from "react-native";

const VIDEO_RECORDINGS_DIRECTORY_NAME = "arc-video-recordings";

function resolveVideoRecordingsDirectory(): Directory {
  const directory = new Directory(Paths.document, VIDEO_RECORDINGS_DIRECTORY_NAME);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/**
 * Requests BOTH camera and microphone permissions (a video recording
 * needs both) -- returns true only if both are granted. Never throws;
 * any unexpected error is treated as "not granted" and surfaced via the
 * SAME in-app explanation banner the caller already shows before this
 * runs (data/storage.ts's hasSeenCameraExplanation/
 * markCameraExplanationSeen), not a second, separate error path.
 */
export async function requestCameraAndMicrophonePermissions(): Promise<boolean> {
  try {
    const cameraResult = await Camera.requestCameraPermissionsAsync();
    const microphoneResult = await Camera.requestMicrophonePermissionsAsync();
    return cameraResult.granted && microphoneResult.granted;
  } catch (error) {
    console.warn("[arcVideoFile] Failed to request camera/microphone permissions.", error);
    return false;
  }
}

/**
 * Moves a just-recorded take from expo-camera's own temporary output
 * location into this app's permanent, app-private document directory,
 * named by the recording's own id (so a later retake under the SAME id
 * simply overwrites it -- "update the script and re-record" never
 * accumulates orphaned temp files). Returns the new permanent URI, or
 * null (with a plain Alert, same convention as arc/arcBookExport.ts)
 * if the move fails for any reason -- the caller must never persist an
 * ArcVideoRecording whose localUri points at a temp file that may be
 * cleaned up by the OS at any time.
 */
export async function saveRecordingToPermanentStorage(temporaryUri: string, recordingId: string): Promise<string | null> {
  try {
    const sourceFile = new File(temporaryUri);
    const destinationFile = new File(resolveVideoRecordingsDirectory(), `${recordingId}.mp4`);
    await sourceFile.move(destinationFile, { overwrite: true });
    return destinationFile.uri;
  } catch (error) {
    console.warn("[arcVideoFile] Failed to save the recorded video to permanent storage.", error);
    Alert.alert("שגיאה בשמירת הסרטון", "לא ניתן היה לשמור את הסרטון שצולם. אפשר לנסות לצלם מחדש.");
    return null;
  }
}

/** Deletes a recording's own file -- a no-op (never throws) if the file is already gone, since "the record was already cleaned up somehow" is never a reason to block deleting the ArcVideoRecording metadata itself. */
export function deleteRecordingFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn("[arcVideoFile] Failed to delete a recording file -- its own metadata record is deleted regardless.", error);
  }
}

/** The recorded file's own size in bytes, or null if it can no longer be read -- used by the preview/library screens to show a human-readable file size, never to gate any functionality. */
export function resolveRecordingFileSizeBytes(uri: string): number | null {
  try {
    const file = new File(uri);
    return file.exists ? file.size : null;
  } catch (error) {
    console.warn("[arcVideoFile] Failed to read a recording file's size.", error);
    return null;
  }
}

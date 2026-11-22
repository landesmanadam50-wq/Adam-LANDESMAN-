import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";

import type { ArcVideoRecording, ArcWritingText } from "../arc/arcWriting.ts";
import { setWritingTextVideoRecording } from "../arc/arcWriting.ts";
import { deleteRecordingFile } from "../arc/arcVideoFile.ts";
import { deleteArcVideoRecordingEntry, loadArcVideoRecordings, loadArcWritingTexts, upsertArcWritingTextEntry } from "../data/storage.ts";

/**
 * build/ArcVideoPreviewScreen.tsx (route /arc-gym/video/preview/[id])
 *
 * ARC Video task, spec section 3: review the just-recorded take before
 * anything else happens to it -- playback (expo-video's VideoView/
 * useVideoPlayer, the ONLY other screen in this feature permitted to
 * import expo-video, per arc/arcVideoFile.ts's own doc comment), retake
 * (deletes this take's file+record and clears the script's pointer,
 * then returns straight to the camera for the SAME script), edit the
 * script (routes back to build/ArcWritingTextScreen.tsx, leaving this
 * take untouched -- re-recording from there creates a new, separate
 * take rather than silently overwriting this one), and save as draft
 * (the recording is already `isDraft: true` from creation; this button
 * is simply "done reviewing," returning to the script). Publishing/
 * organizing by topic+goal happens later, in the video library/detail
 * screens -- never from this review-only screen.
 */
export default function ArcVideoPreviewScreen({ id }: { id: string }) {
  const [recording, setRecording] = useState<ArcVideoRecording | null>(null);
  const [script, setScript] = useState<ArcWritingText | null>(null);

  const player = useVideoPlayer(recording?.localUri ?? null, (instance) => {
    instance.loop = false;
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadArcVideoRecordings().then((recordings) => {
        if (!active) return;
        const found = recordings.find((candidate) => candidate.id === id) ?? null;
        setRecording(found);
        if (!found) return;
        loadArcWritingTexts().then((texts) => {
          if (!active) return;
          setScript(texts.find((candidate) => candidate.id === found.scriptId) ?? null);
        });
      });
      return () => {
        active = false;
      };
    }, [id])
  );

  async function handleRetake() {
    if (!recording || !script) return;
    deleteRecordingFile(recording.localUri);
    await deleteArcVideoRecordingEntry(recording.id);
    await upsertArcWritingTextEntry(setWritingTextVideoRecording(script, null, new Date().toISOString()));
    router.replace({ pathname: "/arc-gym/video/record/[scriptId]", params: { scriptId: script.id } });
  }

  function handleEditScript() {
    if (!script) return;
    router.push({ pathname: "/arc-gym/writing/[id]", params: { id: script.id } });
  }

  function handleSaveDraft() {
    if (!script) return;
    router.replace({ pathname: "/arc-gym/writing/[id]", params: { id: script.id } });
  }

  if (!recording || !script) return <SafeAreaView style={styles.safeArea} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <VideoView style={styles.video} player={player} nativeControls />

      <View style={styles.controls}>
        <Pressable style={styles.secondaryButton} onPress={handleRetake}>
          <Text style={styles.secondaryButtonText}>🔄 צלם מחדש</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={handleEditScript}>
          <Text style={styles.secondaryButtonText}>✏️ ערוך את התסריט</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleSaveDraft}>
          <Text style={styles.primaryButtonText}>💾 שמור כטיוטה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1 },
  controls: { padding: 16, gap: 10, backgroundColor: "#000" },
  secondaryButton: { borderWidth: 1, borderColor: "#fff", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  primaryButton: { backgroundColor: "#C62828", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

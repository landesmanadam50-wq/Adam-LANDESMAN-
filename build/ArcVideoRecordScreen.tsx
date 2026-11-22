import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CameraView } from "expo-camera";

import type { ArcWritingText } from "../arc/arcWriting.ts";
import { createArcVideoRecording, generateArcVideoRecordingId, setWritingTextVideoRecording, updateArcVideoRecording } from "../arc/arcWriting.ts";
import { requestCameraAndMicrophonePermissions, saveRecordingToPermanentStorage } from "../arc/arcVideoFile.ts";
import type { TeleprompterSettings } from "../arc/teleprompterSettings.ts";
import { createDefaultTeleprompterSettings } from "../arc/teleprompterSettings.ts";
import {
  hasSeenCameraExplanation,
  loadArcWritingTexts,
  loadTeleprompterSettings,
  markCameraExplanationSeen,
  saveTeleprompterSettings,
  upsertArcVideoRecordingEntry,
  upsertArcWritingTextEntry,
} from "../data/storage.ts";

const MAX_RECORDING_SECONDS = 15 * 60;
const SCROLL_TICK_MS = 50;
const LINE_HEIGHT_MULTIPLIER = 1.5;
const FONT_SIZE_STEP = 2;
const SCROLL_SPEED_STEP = 1;
const TEXT_POSITION_STEP = 0.05;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 72;
const SCROLL_SPEED_MIN = 0.5;
const SCROLL_SPEED_MAX = 30;
const TEXT_POSITION_MIN = 0;
const TEXT_POSITION_MAX = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * build/ArcVideoRecordScreen.tsx (route /arc-gym/video/record/[scriptId])
 *
 * ARC Video task, spec section 2: a front-camera recorder with a built-in
 * teleprompter overlay showing the script's own body text (the SAME
 * ArcWritingText.body the trainee wrote in build/ArcWritingTextScreen.tsx --
 * never a copy). The teleprompter block is a plain sibling RN <View>
 * drawn on top of expo-camera's CameraView, never composited into the
 * camera's own capture buffer -- CameraView.recordAsync() only ever
 * records the camera sensor's feed, so the overlay text structurally
 * can never appear in the saved video, satisfying the spec's own "the
 * teleprompter text must never appear in the recorded output" requirement
 * without any extra masking step.
 *
 * Camera/microphone permissions go through the SAME one-time in-app
 * explanation -> OS prompt sequence this codebase already uses for
 * notifications (hasSeenNotificationExplanation/markNotificationExplanationSeen
 * in live/ActiveTaskScreen.tsx), replicated here as hasSeenCameraExplanation/
 * markCameraExplanationSeen, before ever calling
 * requestCameraAndMicrophonePermissions() (arc/arcVideoFile.ts).
 */
export default function ArcVideoRecordScreen({ scriptId }: { scriptId: string }) {
  const [script, setScript] = useState<ArcWritingText | null>(null);
  const [settings, setSettings] = useState<TeleprompterSettings>(createDefaultTeleprompterSettings());
  const [showExplanation, setShowExplanation] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [scrollPaused, setScrollPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);

  const requestPermissions = useCallback(async () => {
    const granted = await requestCameraAndMicrophonePermissions();
    setPermissionsGranted(granted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadArcWritingTexts(), loadTeleprompterSettings(), hasSeenCameraExplanation()]).then(([texts, loadedSettings, seenExplanation]) => {
        if (!active) return;
        setScript(texts.find((candidate) => candidate.id === scriptId) ?? null);
        setSettings(loadedSettings);
        if (seenExplanation) {
          setShowExplanation(false);
          requestPermissions();
        } else {
          setShowExplanation(true);
        }
      });
      return () => {
        active = false;
      };
    }, [scriptId, requestPermissions])
  );

  useEffect(() => {
    if (scrollPaused) return;
    const pixelsPerSecond = (settings.fontSize * LINE_HEIGHT_MULTIPLIER) / settings.scrollSpeedSecondsPerLine;
    const stepPixels = pixelsPerSecond * (SCROLL_TICK_MS / 1000);
    const timer = setInterval(() => {
      scrollOffsetRef.current += stepPixels;
      scrollViewRef.current?.scrollTo({ y: scrollOffsetRef.current, animated: false });
    }, SCROLL_TICK_MS);
    return () => clearInterval(timer);
  }, [scrollPaused, settings.fontSize, settings.scrollSpeedSecondsPerLine]);

  async function handleDismissExplanation() {
    await markCameraExplanationSeen();
    setShowExplanation(false);
    await requestPermissions();
  }

  function persistSettings(next: TeleprompterSettings) {
    setSettings(next);
    saveTeleprompterSettings(next);
  }

  function adjustFontSize(delta: number) {
    persistSettings({ ...settings, fontSize: clamp(settings.fontSize + delta, FONT_SIZE_MIN, FONT_SIZE_MAX) });
  }

  function adjustScrollSpeed(delta: number) {
    persistSettings({ ...settings, scrollSpeedSecondsPerLine: clamp(settings.scrollSpeedSecondsPerLine + delta, SCROLL_SPEED_MIN, SCROLL_SPEED_MAX) });
  }

  function adjustTextPosition(delta: number) {
    persistSettings({ ...settings, textPositionOffset: clamp(settings.textPositionOffset + delta, TEXT_POSITION_MIN, TEXT_POSITION_MAX) });
  }

  async function finalizeRecording(temporaryUri: string) {
    if (!script) return;
    setIsSaving(true);
    const recordingId = generateArcVideoRecordingId();
    const permanentUri = await saveRecordingToPermanentStorage(temporaryUri, recordingId);
    if (!permanentUri) {
      setIsSaving(false);
      return;
    }
    const now = new Date().toISOString();
    const elapsedSeconds = recordingStartedAtRef.current ? Math.round((Date.now() - recordingStartedAtRef.current) / 1000) : null;
    const created = createArcVideoRecording(recordingId, script.id, permanentUri, script.title || "סרטון ללא כותרת", script.videoTopic ?? "", script.videoPurpose ?? "", now);
    const recording = elapsedSeconds !== null ? updateArcVideoRecording(created, { durationSeconds: elapsedSeconds }, now) : created;
    await upsertArcVideoRecordingEntry(recording);
    await upsertArcWritingTextEntry(setWritingTextVideoRecording(script, recording.id, now));
    setIsSaving(false);
    router.replace({ pathname: "/arc-gym/video/preview/[id]", params: { id: recording.id } });
  }

  async function handleToggleRecording() {
    if (!cameraRef.current || !script) return;
    if (isRecording) {
      cameraRef.current.stopRecording();
      return;
    }
    setIsRecording(true);
    recordingStartedAtRef.current = Date.now();
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: MAX_RECORDING_SECONDS });
      setIsRecording(false);
      if (!result?.uri) return;
      await finalizeRecording(result.uri);
    } catch (error) {
      setIsRecording(false);
      console.warn("[ArcVideoRecordScreen] Recording failed.", error);
      Alert.alert("שגיאה בהקלטה", "משהו השתבש בזמן ההקלטה. אפשר לנסות שוב.");
    }
  }

  if (!script) return <View style={styles.container} />;

  if (showExplanation) {
    return (
      <View style={styles.explanationContainer}>
        <Text style={styles.explanationText}>ARCHI יבקש גישה למצלמה ולמיקרופון כדי לצלם את הסרטון שלך. ניתן לשנות זאת בכל עת בהגדרות המכשיר.</Text>
        <Pressable style={styles.explanationButton} onPress={handleDismissExplanation}>
          <Text style={styles.explanationButtonText}>הבנתי</Text>
        </Pressable>
      </View>
    );
  }

  if (permissionsGranted === false) {
    return (
      <View style={styles.explanationContainer}>
        <Text style={styles.explanationText}>לא ניתנה גישה למצלמה ו/או למיקרופון -- לא ניתן לצלם בלעדיהן. ניתן לאשר את ההרשאות בהגדרות המכשיר ולנסות שוב.</Text>
        <Pressable style={styles.explanationButton} onPress={() => router.back()}>
          <Text style={styles.explanationButtonText}>חזרה</Text>
        </Pressable>
      </View>
    );
  }

  if (permissionsGranted !== true) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" mode="video" />

      <View style={[styles.teleprompterBlock, { top: `${settings.textPositionOffset * 100}%` as `${number}%` }]}>
        <ScrollView ref={scrollViewRef} style={styles.teleprompterScroll} scrollEnabled={false}>
          <Text style={[styles.teleprompterText, { fontSize: settings.fontSize }]}>{script.body || "(התסריט ריק)"}</Text>
        </ScrollView>
      </View>

      <View style={styles.topBar}>
        <Pressable style={styles.topBarButton} onPress={() => router.back()}>
          <Text style={styles.topBarButtonText}>✖ סגור</Text>
        </Pressable>
        <Pressable style={styles.topBarButton} onPress={() => setScrollPaused((prev) => !prev)}>
          <Text style={styles.topBarButtonText}>{scrollPaused ? "▶ המשך גלילה" : "⏸ עצור גלילה"}</Text>
        </Pressable>
      </View>

      <View style={styles.controlsBar}>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>גודל טקסט</Text>
          <Pressable style={styles.controlButton} onPress={() => adjustFontSize(-FONT_SIZE_STEP)}>
            <Text style={styles.controlButtonText}>א-</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => adjustFontSize(FONT_SIZE_STEP)}>
            <Text style={styles.controlButtonText}>א+</Text>
          </Pressable>
        </View>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>קצב גלילה</Text>
          <Pressable style={styles.controlButton} onPress={() => adjustScrollSpeed(SCROLL_SPEED_STEP)}>
            <Text style={styles.controlButtonText}>האטה</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => adjustScrollSpeed(-SCROLL_SPEED_STEP)}>
            <Text style={styles.controlButtonText}>האצה</Text>
          </Pressable>
        </View>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>מיקום טקסט</Text>
          <Pressable style={styles.controlButton} onPress={() => adjustTextPosition(-TEXT_POSITION_STEP)}>
            <Text style={styles.controlButtonText}>⬆</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => adjustTextPosition(TEXT_POSITION_STEP)}>
            <Text style={styles.controlButtonText}>⬇</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.recordBar}>
        <Pressable style={[styles.recordButton, isRecording && styles.recordButtonActive]} onPress={handleToggleRecording} disabled={isSaving}>
          <Text style={styles.recordButtonText}>{isSaving ? "שומר..." : isRecording ? "⏹ עצור הקלטה" : "⏺ התחל הקלטה"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  explanationContainer: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24 },
  explanationText: { color: "#fff", fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 20 },
  explanationButton: { backgroundColor: "#C62828", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 },
  explanationButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  camera: { flex: 1 },
  teleprompterBlock: { position: "absolute", left: 0, right: 0, maxHeight: "40%", backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 10 },
  teleprompterScroll: { paddingHorizontal: 16 },
  teleprompterText: { color: "#fff", textAlign: "right", lineHeight: 30, fontWeight: "600" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row-reverse", justifyContent: "space-between", padding: 14 },
  topBarButton: { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  topBarButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  controlsBar: { position: "absolute", bottom: 110, left: 0, right: 0, flexDirection: "row-reverse", justifyContent: "space-around", paddingHorizontal: 10 },
  controlGroup: { alignItems: "center" },
  controlLabel: { color: "#fff", fontSize: 11, marginBottom: 4 },
  controlButton: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 2 },
  controlButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  recordBar: { position: "absolute", bottom: 30, left: 0, right: 0, alignItems: "center" },
  recordButton: { backgroundColor: "#C62828", borderRadius: 30, paddingVertical: 16, paddingHorizontal: 36 },
  recordButtonActive: { backgroundColor: "#7B1E1E" },
  recordButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

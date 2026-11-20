import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcFocusExercise, generateArcFocusExerciseId, updateArcFocusExercise } from "../arc/arcFocusExercise.ts";
import type { ArcFocusExercise } from "../arc/arcFocusExercise.ts";
import {
  ARC_FOCUS_DURATION_PRESET_MINUTES,
  ARC_FOCUS_TAP_RHYTHM_PRESET_SECONDS,
  createDefaultArcFocusSettings,
  isValidArcFocusDurationMinutes,
} from "../arc/arcFocusSettings.ts";
import { loadArcFocusExercises, upsertArcFocusExerciseEntry } from "../data/storage.ts";

/**
 * build/ArcGymFocusExerciseEditorScreen.tsx (route /arc-gym/focus-exercise/[id]/edit, id === "new" to create)
 *
 * ARC Gym + ARC Goal Integration task: a saved, listable ARC Focus
 * configuration -- title + the exact same duration/tap-rhythm/tap-cue/
 * attention-check fields build/ArcFocusSettingsScreen.tsx already
 * exposes, reusing its own preset constants/validation (never a second
 * settings shape). `settings` is saved as a self-contained snapshot;
 * the existing zero-setup "/arc-gym/arc-focus" quick-start is untouched.
 */
export default function ArcGymFocusExerciseEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(createDefaultArcFocusSettings().durationMinutes);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [customDurationText, setCustomDurationText] = useState("");
  const [tapRhythmSeconds, setTapRhythmSeconds] = useState(createDefaultArcFocusSettings().tapRhythmSeconds);
  const [showTapCue, setShowTapCue] = useState(true);
  const [attentionChecksEnabled, setAttentionChecksEnabled] = useState(true);
  const [existing, setExisting] = useState<ArcFocusExercise | null>(null);
  const [loaded, setLoaded] = useState(isNew);

  useFocusEffect(
    useCallback(() => {
      if (isNew) return;
      loadArcFocusExercises().then((exercises) => {
        const found = exercises.find((candidate) => candidate.id === id) ?? null;
        setExisting(found);
        if (found) {
          setTitle(found.title);
          setDurationMinutes(found.settings.durationMinutes);
          setUseCustomDuration(!ARC_FOCUS_DURATION_PRESET_MINUTES.includes(found.settings.durationMinutes));
          setCustomDurationText(String(found.settings.durationMinutes));
          setTapRhythmSeconds(found.settings.tapRhythmSeconds);
          setShowTapCue(found.settings.showTapCue);
          setAttentionChecksEnabled(found.settings.attentionChecksEnabled);
        }
        setLoaded(true);
      });
    }, [id, isNew])
  );

  const effectiveDuration = useCustomDuration ? Number(customDurationText.trim()) : durationMinutes;

  async function handleSave() {
    if (!title.trim() || !isValidArcFocusDurationMinutes(effectiveDuration)) return;
    const now = new Date().toISOString();
    const settings = { durationMinutes: effectiveDuration, tapRhythmSeconds, showTapCue, attentionChecksEnabled };
    if (isNew) {
      await upsertArcFocusExerciseEntry(createArcFocusExercise(generateArcFocusExerciseId(), title, settings, now));
      router.back();
      return;
    }
    if (!existing) return;
    await upsertArcFocusExerciseEntry(updateArcFocusExercise(existing, { title, settings }, now));
    router.back();
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canSave = !!title.trim() && isValidArcFocusDurationMinutes(effectiveDuration);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "תרגיל Focus חדש" : "עריכת תרגיל Focus"}</Text>

        <Text style={styles.fieldLabel}>שם התרגיל</Text>
        <TextInput style={styles.textInput} value={title} onChangeText={setTitle} textAlign="right" placeholder="לדוגמה: תרגול ריכוז לפני פגישה" />

        <Text style={styles.fieldLabel}>משך התרגול הכולל</Text>
        <View style={styles.chipRow}>
          {ARC_FOCUS_DURATION_PRESET_MINUTES.map((minutes) => (
            <Pressable
              key={minutes}
              style={[styles.chip, !useCustomDuration && durationMinutes === minutes && styles.chipSelected]}
              onPress={() => {
                setUseCustomDuration(false);
                setDurationMinutes(minutes);
              }}
            >
              <Text style={[styles.chipText, !useCustomDuration && durationMinutes === minutes && styles.chipTextSelected]}>{`${minutes} דק'`}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, useCustomDuration && styles.chipSelected]} onPress={() => setUseCustomDuration(true)}>
            <Text style={[styles.chipText, useCustomDuration && styles.chipTextSelected]}>מותאם אישית</Text>
          </Pressable>
        </View>
        {useCustomDuration && (
          <TextInput style={styles.textInput} value={customDurationText} onChangeText={setCustomDurationText} keyboardType="number-pad" textAlign="center" placeholder="דקות" />
        )}

        <Text style={styles.fieldLabel}>קצב הקשות</Text>
        <View style={styles.chipRow}>
          {ARC_FOCUS_TAP_RHYTHM_PRESET_SECONDS.map((seconds) => (
            <Pressable key={seconds} style={[styles.chip, tapRhythmSeconds === seconds && styles.chipSelected]} onPress={() => setTapRhythmSeconds(seconds)}>
              <Text style={[styles.chipText, tapRhythmSeconds === seconds && styles.chipTextSelected]}>{`כל ${seconds} שנ'`}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>הצגת רמז חזותי להקשה</Text>
          <Switch value={showTapCue} onValueChange={setShowTapCue} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>בדיקות תשומת לב אקראיות</Text>
          <Switch value={attentionChecksEnabled} onValueChange={setAttentionChecksEnabled} />
        </View>

        <Pressable style={[styles.primaryButton, !canSave && styles.disabledButton]} disabled={!canSave} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת תרגיל" : "שמירת שינויים"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 18 },
  fieldLabel: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 16, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextSelected: { color: "#fff", fontWeight: "700" },
  switchRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  switchLabel: { fontSize: 14, textAlign: "right", color: "#333" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabledButton: { opacity: 0.5 },
});

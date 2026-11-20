import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcGymGoal, generateArcGymGoalId, updateArcGymGoal } from "../arc/arcGymGoal.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import { createEmptyPurposeManifest, generatePurposeManifestId } from "../arc/purposeManifest.ts";
import { loadArcGymGoals, upsertArcGymGoalEntry, upsertPurposeManifest } from "../data/storage.ts";

/**
 * build/ArcGymGoalEditorScreen.tsx (route /arc-gym/goal/[id]/edit, id === "new" to create)
 *
 * ARC Gym + ARC Goal Integration task: title + description only --
 * everything else (the goal's own dedicated Manifest, its objectives,
 * its linked tasks/exercises) is managed from ArcGymGoalDetailScreen
 * once the goal exists. Creating a goal ALSO creates its own, brand-new
 * PurposeManifest in the same action (ownerArcGymGoalId set so it's
 * excluded from the existing random daily-popup pool) -- a goal is
 * never left pointing at a manifestId that doesn't exist.
 */
export default function ArcGymGoalEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loaded, setLoaded] = useState(isNew);
  const [existing, setExisting] = useState<ArcGymGoal | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (isNew) return;
      loadArcGymGoals().then((goals) => {
        const found = goals.find((goal) => goal.id === id) ?? null;
        setExisting(found);
        setTitle(found?.title ?? "");
        setDescription(found?.description ?? "");
        setLoaded(true);
      });
    }, [id, isNew])
  );

  async function handleSave() {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    if (isNew) {
      const goalId = generateArcGymGoalId();
      const manifestId = generatePurposeManifestId();
      await upsertPurposeManifest({ ...createEmptyPurposeManifest(manifestId, now), ownerArcGymGoalId: goalId });
      await upsertArcGymGoalEntry(createArcGymGoal(goalId, title, description.trim() ? description : null, manifestId, now));
      router.replace({ pathname: "/arc-gym/goal/[id]", params: { id: goalId } });
      return;
    }
    if (!existing) return;
    await upsertArcGymGoalEntry(updateArcGymGoal(existing, { title, description: description.trim() ? description : null }, now));
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "מטרת ARC חדשה" : "עריכת מטרת ARC"}</Text>

        <Text style={styles.label}>שם המטרה</Text>
        <TextInput style={styles.textInput} value={title} onChangeText={setTitle} textAlign="right" placeholder="לדוגמה: לחזק ביטחון עצמי בעבודה" />

        <Text style={styles.label}>תיאור (רשות)</Text>
        <TextInput
          style={[styles.textInput, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          textAlign="right"
          multiline
          placeholder="למה המטרה הזו חשובה לך?"
        />

        <Pressable style={[styles.primaryButton, !title.trim() && styles.disabledButton]} disabled={!title.trim()} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת מטרה" : "שמירת שינויים"}</Text>
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
  label: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 14, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabledButton: { opacity: 0.5 },
});

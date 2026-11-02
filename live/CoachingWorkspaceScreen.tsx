import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createEmptyCoachingWorkspaceEntry, generateCoachingWorkspaceEntryId } from "../arc/coachingWorkspace.ts";
import type { CoachingWorkspaceEntry } from "../arc/coachingWorkspace.ts";
import { loadCoachingWorkspaceEntries, upsertCoachingWorkspaceEntry } from "../data/storage.ts";

const FIELD_DEFS: { key: keyof CoachingWorkspaceEntry; label: string }[] = [
  { key: "goal", label: "מטרת האימון" },
  { key: "weeklyTasks", label: "משימות השבוע" },
  { key: "value", label: "ערך" },
  { key: "identity", label: "זהות" },
  { key: "supportiveState", label: "מצב תומך" },
  { key: "selectedBarriers", label: "חסמים שמורים שנבחרו" },
  { key: "plannedExperiment", label: "ניסוי מתוכנן" },
  { key: "protocolsToPractice", label: "פרוטוקולים לתרגול" },
  { key: "newFactorsToReview", label: "גורמים חדשים לבדיקה" },
  { key: "success", label: "הצלחה" },
  { key: "difficulty", label: "קושי" },
  { key: "questionForCoach", label: "שאלה למאמן" },
  { key: "nextSessionPlan", label: "תוכנית למפגש הבא" },
];

/**
 * live/CoachingWorkspaceScreen.tsx (route /coaching)
 *
 * Productivity roadmap, Stage Z: a local-only, trainee-owned coaching
 * workspace -- one entry per session, every field free text the
 * trainee writes themselves (never auto-filled from the journal or
 * any other private record). No coach account, cloud sharing,
 * messaging, or permission system exists here or anywhere in this
 * codebase -- see this screen's own "הכנה למפגש" link to
 * live/CoachingSessionPrepScreen.tsx for the one place real app data
 * is read, always under the trainee's own explicit visibility choice.
 */
export default function CoachingWorkspaceScreen() {
  const [entries, setEntries] = useState<CoachingWorkspaceEntry[] | null>(null);
  const [editing, setEditing] = useState<CoachingWorkspaceEntry | null>(null);

  const reload = useCallback(() => {
    loadCoachingWorkspaceEntries().then((loaded) => setEntries([...loaded].reverse()));
  }, []);

  useFocusEffect(reload);

  async function save() {
    if (!editing) return;
    await upsertCoachingWorkspaceEntry({ ...editing, updatedAt: new Date().toISOString() });
    setEditing(null);
    reload();
  }

  if (entries === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (editing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>רשומת אימון</Text>
          {FIELD_DEFS.map(({ key, label }) => (
            <View key={key} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{label}</Text>
              <TextInput
                style={styles.textInput}
                value={(editing[key] as string | null) ?? ""}
                onChangeText={(value) => setEditing({ ...editing, [key]: value.trim() ? value : null })}
                textAlign="right"
                multiline
              />
            </View>
          ))}
          <Pressable style={styles.primaryButton} onPress={save}>
            <Text style={styles.primaryButtonText}>שמירה</Text>
          </Pressable>
          <Pressable style={styles.backButton} onPress={() => setEditing(null)}>
            <Text style={styles.backButtonText}>ביטול</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>סדנת אימון</Text>
        <Text style={styles.hint}>המידע כולו נשאר במכשיר שלך. אין שיתוף אוטומטי עם מאמן.</Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => setEditing(createEmptyCoachingWorkspaceEntry(generateCoachingWorkspaceEntryId(), new Date().toISOString()))}
        >
          <Text style={styles.primaryButtonText}>+ רשומה חדשה</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/coaching/prepare")}>
          <Text style={styles.secondaryButtonText}>הכנה למפגש</Text>
        </Pressable>

        {entries.length === 0 && <Text style={styles.hint}>אין עדיין רשומות.</Text>}
        {entries.map((entry) => (
          <Pressable key={entry.id} style={styles.entryRow} onPress={() => setEditing(entry)}>
            <Text style={styles.entryText}>{entry.goal ?? entry.createdAt}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 44 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  entryRow: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginTop: 10 },
  entryText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
  backButton: { marginTop: 16, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

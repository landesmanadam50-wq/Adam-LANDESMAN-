import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcDiaryEntry } from "../arc/arcDiary.ts";
import { createArcDiaryEntry, generateArcDiaryEntryId, linkInsightToArcDiaryEntry, updateArcDiaryEntryBody } from "../arc/arcDiary.ts";
import { createStandaloneInsight, generateArcInsightId } from "../arc/arcInsightBelief.ts";
import { appendArcInsight, loadArcDiaryEntries, upsertArcDiaryEntryEntry } from "../data/storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

/**
 * build/ArcDiaryEntryScreen.tsx (routes /diary/new and /diary/[id])
 *
 * ARC Diary task, sections 1-4: free writing, no guiding questions, by
 * date/time, editable later; ends with the optional "האם גילית תובנה
 * שתרצה לזכור?" step -- the SAME createStandaloneInsight + appendArcInsight
 * pattern every other insight source already uses, never a second
 * collection.
 *
 * `returnToTaskId`, when given (reached from a task's own linked
 * action, e.g. a recurring 21:30 "כתיבת יומן" task), sends the trainee
 * back to that exact Task LIVE screen when they finish -- same
 * convention as build/InsightWriteScreen.tsx's own returnToTaskId.
 */
export default function ArcDiaryEntryScreen({ id = null, returnToTaskId = null }: { id?: string | null; returnToTaskId?: string | null }) {
  const [entry, setEntry] = useState<ArcDiaryEntry | null>(id ? null : createArcDiaryEntry(generateArcDiaryEntryId(), todayLocalDateString(new Date()), new Date().toISOString()));
  const [bodyDraft, setBodyDraft] = useState("");
  const [showInsightPrompt, setShowInsightPrompt] = useState(false);
  const [insightDraft, setInsightDraft] = useState("");
  const [addedInsightCount, setAddedInsightCount] = useState(0);

  const reload = useCallback(() => {
    if (!id) return;
    loadArcDiaryEntries().then((entries) => {
      const found = entries.find((candidate) => candidate.id === id) ?? null;
      setEntry(found);
      setBodyDraft(found?.body ?? "");
    });
  }, [id]);

  useFocusEffect(reload);

  async function persistBody(nextBody: string) {
    if (!entry) return;
    const now = new Date().toISOString();
    const updated = updateArcDiaryEntryBody(entry, nextBody, now);
    setEntry(updated);
    await upsertArcDiaryEntryEntry(updated);
  }

  function finish() {
    if (returnToTaskId) {
      router.replace({ pathname: "/tasks/[id]", params: { id: returnToTaskId } });
      return;
    }
    router.replace("/diary");
  }

  async function handleFinishWriting() {
    await persistBody(bodyDraft);
    setShowInsightPrompt(true);
  }

  async function handleAddInsight() {
    if (!entry) return;
    const trimmed = insightDraft.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const insight = createStandaloneInsight(generateArcInsightId(), trimmed, now);
    await appendArcInsight(insight);
    const updated = linkInsightToArcDiaryEntry(entry, insight.id, now);
    setEntry(updated);
    await upsertArcDiaryEntryEntry(updated);
    setAddedInsightCount((count) => count + 1);
    setInsightDraft("");
  }

  if (id && !entry) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showInsightPrompt) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>האם גילית תובנה שתרצה לזכור?</Text>
          <Text style={styles.hint}>אפשר להוסיף תובנה אחת או כמה, או לסיים בלי להוסיף.</Text>
          <TextInput style={styles.textInput} value={insightDraft} onChangeText={setInsightDraft} textAlign="right" multiline placeholder="התובנה שלי..." />
          <Pressable style={[styles.secondaryActionButton, !insightDraft.trim() && styles.disabledButton]} disabled={!insightDraft.trim()} onPress={handleAddInsight}>
            <Text style={styles.secondaryActionButtonText}>+ הוספת תובנה</Text>
          </Pressable>
          {addedInsightCount > 0 && <Text style={styles.hint}>{addedInsightCount} תובנות נוספו.</Text>}
          <Pressable style={styles.primaryButton} onPress={finish}>
            <Text style={styles.primaryButtonText}>{returnToTaskId ? "חזרה למשימה" : "סיום"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>{id ? entry!.dateLocal : "רשומה חדשה"}</Text>
        <Text style={styles.hint}>כתיבה חופשית -- על היום שעבר, חוויות, מחשבות ורגשות. בלי שאלות מנחות.</Text>
        <TextInput
          style={styles.textInput}
          value={bodyDraft}
          onChangeText={setBodyDraft}
          onBlur={() => persistBody(bodyDraft)}
          textAlign="right"
          multiline
          autoFocus={!id}
          placeholder="כתוב כאן..."
        />
        <Pressable style={styles.primaryButton} onPress={handleFinishWriting}>
          <Text style={styles.primaryButtonText}>סיום כתיבה</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => (returnToTaskId ? finish() : router.back())}>
          <Text style={styles.secondaryButtonText}>ביטול</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 10 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 220, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
  secondaryButtonText: { color: "#666", fontSize: 15 },
  secondaryActionButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  secondaryActionButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 14 },
});

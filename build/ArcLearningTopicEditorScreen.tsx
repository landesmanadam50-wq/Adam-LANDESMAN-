import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcLearningTopic, generateArcLearningTopicId, updateArcLearningTopic } from "../arc/arcLearningTopic.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { deleteArcLearningTopicEntry, loadArcLearningTopics, upsertArcLearningTopicEntry } from "../data/storage.ts";

/**
 * build/ArcLearningTopicEditorScreen.tsx (route /arc-learning/topics/[id]/edit,
 * id === "new" to create -- same convention as build/TaskEditorScreen.tsx)
 */
export default function ArcLearningTopicEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [existing, setExisting] = useState<ArcLearningTopic | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isNew) {
        setLoaded(true);
        return;
      }
      loadArcLearningTopics().then((topics) => {
        const found = topics.find((candidate) => candidate.id === id) ?? null;
        setExisting(found);
        if (found) setTitle(found.title);
        setLoaded(true);
      });
    }, [id, isNew])
  );

  async function save() {
    if (!title.trim()) {
      setError("יש להזין שם לנושא.");
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    const saved = existing !== null ? updateArcLearningTopic(existing, { title }, now) : createArcLearningTopic(generateArcLearningTopicId(), title, now);
    await upsertArcLearningTopicEntry(saved);
    router.replace({ pathname: "/arc-learning/topics/[id]", params: { id: saved.id } });
  }

  async function handleDelete() {
    if (!existing) return;
    await deleteArcLearningTopicEntry(existing.id);
    setConfirmDelete(false);
    router.replace("/arc-learning/topics");
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
        <Text style={styles.title}>{isNew ? "נושא למידה חדש" : "עריכת נושא"}</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TextInput style={styles.textInput} value={title} onChangeText={setTitle} textAlign="right" placeholder="לדוגמה: כלכלה" />

        <Pressable style={styles.primaryButton} onPress={save}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת נושא" : "שמירת שינויים"}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.deleteButton} onPress={() => setConfirmDelete(true)}>
            <Text style={styles.deleteButtonText}>מחיקת נושא</Text>
          </Pressable>
        )}
      </ScrollView>

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את הנושא הזה? התובנות ששייכות אליו לא יימחקו.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.primaryButton, styles.modalButton]} onPress={handleDelete}>
                <Text style={styles.primaryButtonText}>מחיקה</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  deleteButton: { borderWidth: 1, borderColor: "#b00020", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  deleteButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0, marginTop: 0, paddingHorizontal: 20 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
});

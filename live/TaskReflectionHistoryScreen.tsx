import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { TaskReflection } from "../arc/taskReflection.ts";
import { deleteTaskReflection, editTaskReflection, listReflectionsForTaskNewestFirst } from "../data/taskReflection.ts";

/**
 * live/TaskReflectionHistoryScreen.tsx (route /tasks/[id]/reflections)
 *
 * Task Reflection Memory & Smart Notification Updates task,
 * requirement 5: lets the trainee review every reflection ever saved
 * for this specific task -- newest first, each with its own content,
 * date and time -- and correct or remove any one of them. Reached from
 * live/ActiveTaskScreen.tsx's own task-details screen, mirroring how
 * "ערוך" already links out to the task editor from the exact same
 * title row.
 */
export default function TaskReflectionHistoryScreen({ taskId }: { taskId: string }) {
  const [reflections, setReflections] = useState<TaskReflection[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const reload = useCallback(() => {
    listReflectionsForTaskNewestFirst(taskId).then(setReflections);
  }, [taskId]);

  useFocusEffect(reload);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("he-IL");
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }

  function startEditing(reflection: TaskReflection) {
    setEditingId(reflection.id);
    setEditDraft(reflection.text);
  }

  async function saveEdit() {
    if (!editingId) return;
    await editTaskReflection(editingId, editDraft);
    setEditingId(null);
    reload();
  }

  function confirmDelete(reflection: TaskReflection) {
    Alert.alert("מחיקת רפלקציה", "האם למחוק את הרפלקציה הזאת?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחיקה",
        style: "destructive",
        onPress: async () => {
          await deleteTaskReflection(reflection.id);
          reload();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>מה שלמדתי במשימה הזאת</Text>

        {reflections !== null && reflections.length === 0 && <Text style={styles.hint}>עדיין אין רפלקציות שמורות למשימה הזאת.</Text>}

        {(reflections ?? []).map((reflection) => (
          <View key={reflection.id} style={styles.card}>
            {editingId === reflection.id ? (
              <>
                <TextInput style={styles.textInput} value={editDraft} onChangeText={setEditDraft} textAlign="right" multiline />
                <View style={styles.cardActionsRow}>
                  <Pressable style={styles.primaryButton} onPress={saveEdit}>
                    <Text style={styles.primaryButtonText}>שמירה</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => setEditingId(null)}>
                    <Text style={styles.secondaryButtonText}>ביטול</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.reflectionText}>{reflection.text}</Text>
                <Text style={styles.reflectionMeta}>
                  {formatDate(reflection.createdAt)} · {formatTime(reflection.createdAt)}
                </Text>
                <View style={styles.cardActionsRow}>
                  <Pressable style={styles.secondaryButton} onPress={() => startEditing(reflection)}>
                    <Text style={styles.secondaryButtonText}>עריכה</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => confirmDelete(reflection)}>
                    <Text style={styles.secondaryButtonText}>מחיקה</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  card: { backgroundColor: "#F5FAFD", borderRadius: 12, padding: 14, marginBottom: 12 },
  reflectionText: { fontSize: 16, textAlign: "right", color: "#222", lineHeight: 22 },
  reflectionMeta: { fontSize: 12, textAlign: "right", color: "#888", marginTop: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, minHeight: 50, backgroundColor: "#fff" },
  cardActionsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 10 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 14 },
});

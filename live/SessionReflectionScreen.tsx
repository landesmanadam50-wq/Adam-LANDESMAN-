import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { appendTaskJournalEntry, getTask } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

/**
 * live/SessionReflectionScreen.tsx (route /tasks/[id]/reflect)
 *
 * Productivity roadmap, Stage X: "after a task session, ask a minimal
 * optional reflection... keep this short and skippable. Do not turn
 * every task session into a long questionnaire." Reached only by an
 * explicit, optional link once a task is marked completed
 * (live/ActiveTaskScreen.tsx) -- never forced, never blocking
 * anything. "Did you complete the task?" is skipped here since
 * reaching this screen already answers it. Every answer is saved as
 * one `session_reflection` journal entry (data/taskJournal.ts) for
 * Stage Y's own factual insights -- never required to proceed.
 */
export default function SessionReflectionScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [returnedAfterArc, setReturnedAfterArc] = useState<boolean | null>(null);
  const [whatHelped, setWhatHelped] = useState("");
  const [whatToReuse, setWhatToReuse] = useState("");

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  async function finish() {
    const now = new Date().toISOString();
    await appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "session_reflection",
        occurredAt: now,
        createdAt: now,
        reflectionReturnedAfterArc: returnedAfterArc,
        reflectionWhatHelped: whatHelped.trim() ? whatHelped.trim() : null,
        reflectionWhatToReuse: whatToReuse.trim() ? whatToReuse.trim() : null,
      })
    );
    router.back();
  }

  if (!task) {
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
        <Text style={styles.title}>רפלקציה קצרה (רשות)</Text>

        <Text style={styles.question}>אם עברת ל-ARC באמצע, חזרת למשימה אחר כך?</Text>
        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, returnedAfterArc === true && styles.chipSelected]} onPress={() => setReturnedAfterArc(true)}>
            <Text style={styles.chipText}>כן</Text>
          </Pressable>
          <Pressable style={[styles.chip, returnedAfterArc === false && styles.chipSelected]} onPress={() => setReturnedAfterArc(false)}>
            <Text style={styles.chipText}>לא</Text>
          </Pressable>
          <Pressable style={[styles.chip, returnedAfterArc === null && styles.chipSelected]} onPress={() => setReturnedAfterArc(null)}>
            <Text style={styles.chipText}>לא רלוונטי</Text>
          </Pressable>
        </View>

        <Text style={styles.question}>מה עזר?</Text>
        <TextInput style={styles.textInput} value={whatHelped} onChangeText={setWhatHelped} textAlign="right" multiline />

        <Text style={styles.question}>מה כדאי לחזור עליו בפעם הבאה?</Text>
        <TextInput style={styles.textInput} value={whatToReuse} onChangeText={setWhatToReuse} textAlign="right" multiline />

        <Pressable style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>שמירה</Text>
        </Pressable>
        <Pressable style={styles.skipLink} onPress={() => router.back()}>
          <Text style={styles.skipLinkText}>דלג</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 50 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { marginTop: 14, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
});

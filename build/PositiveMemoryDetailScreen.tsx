import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { PositiveMemory, PositiveMemoryFeelingEntry } from "../arc/positiveMemory.ts";
import { setPositiveMemoryFeelings, updatePositiveMemory } from "../arc/positiveMemory.ts";
import { resolvePositiveFeelingOptions } from "../arc/positiveFeelingOptions.ts";
import { deletePositiveMemoryEntry, loadPositiveMemories, loadTasks, upsertPositiveMemoryEntry } from "../data/storage.ts";
import type { Task } from "../arc/tasks.ts";

/**
 * build/PositiveMemoryDetailScreen.tsx (route /positive-memories/[id])
 *
 * Positive Memory, Success Recall & Quick Capture task, section 2:
 * "allow users to... edit events... delete events... change their
 * associated tasks or feelings... link existing events to additional
 * relevant goals or tasks." Every edit saves via the SAME pure setters
 * arc/positiveMemory.ts's own module already exposes, never a second,
 * hand-rolled mutation path.
 */
export default function PositiveMemoryDetailScreen({ id }: { id: string }) {
  const [memory, setMemory] = useState<PositiveMemory | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadPositiveMemories(), loadTasks()]).then(([memories, loadedTasks]) => {
        setMemory(memories.find((candidate) => candidate.id === id) ?? null);
        setTasks(loadedTasks);
      });
      setConfirmDelete(false);
    }, [id])
  );

  async function save(next: PositiveMemory) {
    setMemory(next);
    await upsertPositiveMemoryEntry(next);
  }

  function toggleFeeling(feeling: string) {
    if (!memory) return;
    const exists = memory.feelings.find((entry) => entry.feeling === feeling);
    const nextFeelings: PositiveMemoryFeelingEntry[] = exists
      ? memory.feelings.filter((entry) => entry.feeling !== feeling)
      : [...memory.feelings, { feeling, moment: "", intensity: null }];
    save(setPositiveMemoryFeelings(memory, nextFeelings, new Date().toISOString()));
  }

  function setTaskLink(taskId: string | null) {
    if (!memory) return;
    save(updatePositiveMemory(memory, { taskId }, new Date().toISOString()));
  }

  async function handleDelete() {
    if (!memory) return;
    await deletePositiveMemoryEntry(memory.id);
    setConfirmDelete(false);
    router.replace("/positive-memories");
  }

  if (!memory) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.hint}>טוען...</Text>
      </SafeAreaView>
    );
  }

  const linkedTask = tasks.find((task) => task.id === memory.taskId) ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eventTypeLabel}>{memory.eventType === "success" ? "💪 הצלחה" : "✨ תחושה חיובית"}</Text>

        <Text style={styles.fieldLabel}>כותרת</Text>
        <TextInput style={styles.textInput} value={memory.title} onChangeText={(text) => save(updatePositiveMemory(memory, { title: text }, new Date().toISOString()))} textAlign="right" />

        <Text style={styles.fieldLabel}>תיאור</Text>
        <TextInput
          style={styles.textInput}
          value={memory.description}
          onChangeText={(text) => save(updatePositiveMemory(memory, { description: text }, new Date().toISOString()))}
          textAlign="right"
          multiline
        />

        {memory.eventType === "success" && (
          <>
            <Text style={styles.fieldLabel}>במה הצלחתי</Text>
            <TextInput
              style={styles.textInput}
              value={memory.successDescription ?? ""}
              onChangeText={(text) => save(updatePositiveMemory(memory, { successDescription: text }, new Date().toISOString()))}
              textAlign="right"
              multiline
            />
          </>
        )}

        <Text style={styles.fieldLabel}>מה היה מיוחד</Text>
        <TextInput
          style={styles.textInput}
          value={memory.whatWasSpecial}
          onChangeText={(text) => save(updatePositiveMemory(memory, { whatWasSpecial: text }, new Date().toISOString()))}
          textAlign="right"
          multiline
        />

        <Text style={styles.fieldLabel}>מיקום</Text>
        <TextInput
          style={styles.textInput}
          value={memory.location ?? ""}
          onChangeText={(text) => save(updatePositiveMemory(memory, { location: text }, new Date().toISOString()))}
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>תחושות</Text>
        <View style={styles.chipRow}>
          {resolvePositiveFeelingOptions().map((feeling) => {
            const active = memory.feelings.some((entry) => entry.feeling === feeling);
            return (
              <Pressable key={feeling} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleFeeling(feeling)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{feeling}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>משימה מקושרת</Text>
        <Pressable style={[styles.chip, memory.taskId === null && styles.chipActive]} onPress={() => setTaskLink(null)}>
          <Text style={[styles.chipText, memory.taskId === null && styles.chipTextActive]}>ללא משימה מקושרת</Text>
        </Pressable>
        {linkedTask && (
          <Pressable style={[styles.chip, styles.chipActive]} onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: linkedTask.id } })}>
            <Text style={[styles.chipText, styles.chipTextActive]}>{linkedTask.title}</Text>
          </Pressable>
        )}

        <Pressable style={styles.deleteButton} onPress={() => setConfirmDelete(true)}>
          <Text style={styles.deleteButtonText}>מחיקת אירוע</Text>
        </Pressable>
      </ScrollView>

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את האירוע הזה?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>מחיקה</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmDelete(false)}>
                <Text style={styles.cancelText}>ביטול</Text>
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
  content: { flexGrow: 1, padding: 20, gap: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", padding: 24 },
  eventTypeLabel: { fontSize: 13, color: "#D98324", textAlign: "right", fontWeight: "700", marginBottom: 6 },
  fieldLabel: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 10 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, textAlign: "right" },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#D98324", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  chipActive: { backgroundColor: "#D98324" },
  chipText: { color: "#D98324", fontSize: 13, textAlign: "right" },
  chipTextActive: { color: "#fff" },
  deleteButton: { borderWidth: 1, borderColor: "#b00020", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 20 },
  deleteButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%", gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 16 },
  cancelText: { color: "#0a7ea4", fontSize: 14 },
});

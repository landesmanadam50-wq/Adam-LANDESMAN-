import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { TodoBankItem } from "../arc/todoBank.ts";
import { archiveTodoBankItem, createTodoBankItem, generateTodoBankItemId, listActiveTodoBankItems, renameTodoBankItem } from "../arc/todoBank.ts";
import type { TaskLinkedAction } from "../arc/taskLinkedAction.ts";
import type { ArcGymMemoryExercise } from "../arc/arcGym.ts";
import { loadArcGymMemoryExercises, loadTodoBankItems, upsertTodoBankItemEntry } from "../data/storage.ts";
import TaskLinkedActionPicker from "../live/components/TaskLinkedActionPicker.tsx";

/**
 * build/TodoBankScreen.tsx (route /todo-bank)
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 1: management screen for the reusable To-Do bank that
 * lives inside the Fixed Weekly Routine -- create once, place onto any
 * flexible day repeatedly (build/TimePlanningModal.tsx's own "+ הוסף
 * מהמאגר" button). No urgency/importance/duration here, by design --
 * those are set per placement, on the day-occurrence Task itself.
 * "הסר" archives the bank item (never a hard delete of this record) --
 * an already-placed day-occurrence Task is a fully independent record
 * and is never touched by this screen.
 *
 * Build/To-Do Action-Type Integration task, requirement 1/3: a bank
 * item's own linkedAction/linkedArcGymMemoryExerciseIds (arc/todoBank.ts)
 * are edited here via the exact same TaskLinkedActionPicker component
 * build/TaskEditorScreen.tsx mounts for every other task -- never a
 * second, bank-specific picker -- and carried onto the day-occurrence
 * Task when placed (build/TimePlanningModal.tsx's own handleAddFromBank).
 */
export default function TodoBankScreen() {
  const [items, setItems] = useState<TodoBankItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editLinkedAction, setEditLinkedAction] = useState<TaskLinkedAction | null>(null);
  const [editLinkedMemoryIds, setEditLinkedMemoryIds] = useState<string[]>([]);
  const [newTitleDraft, setNewTitleDraft] = useState("");
  const [memoryExercises, setMemoryExercises] = useState<ArcGymMemoryExercise[]>([]);

  const reload = useCallback(() => {
    loadTodoBankItems().then(setItems);
    loadArcGymMemoryExercises().then(setMemoryExercises);
  }, []);
  useFocusEffect(reload);

  async function handleAdd() {
    const title = newTitleDraft.trim();
    if (!title) return;
    const now = new Date().toISOString();
    await upsertTodoBankItemEntry(createTodoBankItem(generateTodoBankItemId(), title, now));
    setNewTitleDraft("");
    reload();
  }

  function startEditing(item: TodoBankItem) {
    setEditingId(item.id);
    setEditDraft(item.title);
    setEditLinkedAction(item.linkedAction);
    setEditLinkedMemoryIds(item.linkedArcGymMemoryExerciseIds);
  }

  /**
   * Persists the title together with the linkedAction/memory-exercise
   * drafts tracked above -- a blank title keeps the item's existing
   * title (same tolerant behavior the pre-existing title-only save
   * already had), but the type/memory edits always save, since this
   * block is also the only way to set them at all.
   */
  async function saveEditing(item: TodoBankItem) {
    const title = editDraft.trim() || item.title;
    const now = new Date().toISOString();
    await upsertTodoBankItemEntry({ ...item, title, linkedAction: editLinkedAction, linkedArcGymMemoryExerciseIds: editLinkedMemoryIds, updatedAt: now });
    setEditingId(null);
    reload();
  }

  async function handleRemove(item: TodoBankItem) {
    await upsertTodoBankItemEntry(archiveTodoBankItem(item, new Date().toISOString()));
    reload();
  }

  const activeItems = listActiveTodoBankItems(items);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🗂️ מאגר To-Do</Text>
        <Text style={styles.hint}>משימות לשימוש חוזר -- ללא דחיפות, חשיבות או משך זמן. ניתן להוסיף כל משימה כאן ליום גמיש כלשהו דרך לשונית "To-Do List" בתכנון הזמן.</Text>

        <View style={styles.addRow}>
          <TextInput style={styles.input} value={newTitleDraft} onChangeText={setNewTitleDraft} textAlign="right" placeholder="הוסף משימת To-Do למאגר" />
          <Pressable style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>+ הוסף</Text>
          </Pressable>
        </View>

        {activeItems.length === 0 && <Text style={styles.hint}>אין עדיין משימות במאגר.</Text>}

        {activeItems.map((item) =>
          editingId === item.id ? (
            <View key={item.id} style={styles.editBlock}>
              <View style={styles.row}>
                <TextInput style={styles.editInput} value={editDraft} onChangeText={setEditDraft} textAlign="right" autoFocus />
                <Pressable style={styles.smallButton} onPress={() => saveEditing(item)}>
                  <Text style={styles.smallButtonText}>שמור</Text>
                </Pressable>
              </View>

              {/*
                Build/To-Do Action-Type Integration task, requirement 1/3:
                the exact same TaskLinkedActionPicker component every other
                task's own editor already mounts -- never a second,
                bank-specific picker.
              */}
              <TaskLinkedActionPicker value={editLinkedAction} onChange={setEditLinkedAction} />

              <Text style={styles.hint}>תזכורות ARC Memory (אופציונלי)</Text>
              <View style={styles.chipRow}>
                {memoryExercises.length === 0 && <Text style={styles.hint}>אין עדיין תרגילי ARC Memory שמורים.</Text>}
                {memoryExercises.map((exercise) => {
                  const linked = editLinkedMemoryIds.includes(exercise.id);
                  return (
                    <Pressable
                      key={exercise.id}
                      style={[styles.chip, linked && styles.chipSelected]}
                      onPress={() => setEditLinkedMemoryIds(linked ? editLinkedMemoryIds.filter((id) => id !== exercise.id) : [...editLinkedMemoryIds, exercise.id])}
                    >
                      <Text style={styles.chipText}>{exercise.situationText}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <View style={styles.rowButtons}>
                <Pressable style={styles.smallButton} onPress={() => startEditing(item)}>
                  <Text style={styles.smallButtonText}>ערוך</Text>
                </Pressable>
                <Pressable style={styles.smallButtonDanger} onPress={() => handleRemove(item)}>
                  <Text style={styles.smallButtonDangerText}>הסר</Text>
                </Pressable>
              </View>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 13, color: "#666", textAlign: "right", marginBottom: 12 },
  addRow: { flexDirection: "row-reverse", marginBottom: 16, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, textAlign: "right" },
  addButton: { backgroundColor: "#0a7ea4", paddingHorizontal: 16, borderRadius: 8, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "700" },
  row: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee", gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, textAlign: "right" },
  rowButtons: { flexDirection: "row-reverse", gap: 8 },
  editInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 8, textAlign: "right" },
  smallButton: { backgroundColor: "#f0f0f0", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  smallButtonText: { color: "#0a7ea4", fontWeight: "600" },
  smallButtonDanger: { backgroundColor: "#fdeaea", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  smallButtonDangerText: { color: "#c0392b", fontWeight: "600" },
  secondaryButton: { backgroundColor: "#f0f0f0", paddingVertical: 10, borderRadius: 8, alignItems: "center", marginBottom: 12 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700" },
  editBlock: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, marginTop: 4, marginBottom: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
});

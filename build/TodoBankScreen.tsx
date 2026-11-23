import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { TodoBankItem } from "../arc/todoBank.ts";
import { archiveTodoBankItem, createTodoBankItem, generateTodoBankItemId, listActiveTodoBankItems, renameTodoBankItem } from "../arc/todoBank.ts";
import { loadTodoBankItems, upsertTodoBankItemEntry } from "../data/storage.ts";

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
 */
export default function TodoBankScreen() {
  const [items, setItems] = useState<TodoBankItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newTitleDraft, setNewTitleDraft] = useState("");

  const reload = useCallback(() => {
    loadTodoBankItems().then(setItems);
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
  }

  async function saveEditing(item: TodoBankItem) {
    const title = editDraft.trim();
    if (title) {
      await upsertTodoBankItemEntry(renameTodoBankItem(item, title, new Date().toISOString()));
    }
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

        {activeItems.map((item) => (
          <View key={item.id} style={styles.row}>
            {editingId === item.id ? (
              <>
                <TextInput style={styles.editInput} value={editDraft} onChangeText={setEditDraft} textAlign="right" autoFocus />
                <Pressable style={styles.smallButton} onPress={() => saveEditing(item)}>
                  <Text style={styles.smallButtonText}>שמור</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <View style={styles.rowButtons}>
                  <Pressable style={styles.smallButton} onPress={() => startEditing(item)}>
                    <Text style={styles.smallButtonText}>ערוך</Text>
                  </Pressable>
                  <Pressable style={styles.smallButtonDanger} onPress={() => handleRemove(item)}>
                    <Text style={styles.smallButtonDangerText}>הסר</Text>
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
});

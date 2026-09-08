import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deleteArcGoal, loadArcGoals, upsertArcGoal } from "../data/storage.ts";
import { duplicateArcGoal } from "../arc/arcGoals.ts";
import { createEmptyArcGoal, generateArcGoalId } from "../arc/types.ts";
import type { ArcGoal } from "../arc/types.ts";

/**
 * ARC Goal task: the ARC Goal home screen -- lists every independently
 * saved ArcGoal (data/storage.ts's loadArcGoals) and lets the trainee
 * create, rename, duplicate, and delete any number of them, each fully
 * independent (see arc/arcGoals.ts's own doc). Mirrors
 * build/ArcBuildListScreen.tsx's exact list/create/rename/delete UI
 * pattern, with one addition ("duplicate", spec section 2's explicit
 * "create, edit, duplicate and delete multiple ARC Goals" requirement).
 * "+ הוסף מטרה" only asks for a name here -- the goal's own linking
 * (identity protocol, interfering-state mappings) is configured on the
 * next screen, build/ArcGoalEditorScreen.tsx, reached by opening the
 * freshly-created (already-persisted) goal.
 */
export default function ArcGoalListScreen() {
  const [goals, setGoals] = useState<ArcGoal[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadArcGoals()
      .then(setGoals)
      .catch((error) => {
        console.warn("[ArcGoalListScreen] Failed to load ARC Goals -- showing the empty state.", error);
        setGoals([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const goal = createEmptyArcGoal(generateArcGoalId(), trimmed, now);
    await upsertArcGoal(goal);
    setCreating(false);
    setNewName("");
    router.push({ pathname: "/goals/[id]", params: { id: goal.id } });
  }

  async function handleRename() {
    if (!renamingId) return;
    const trimmed = renameText.trim();
    if (!trimmed || !goals) return;
    const target = goals.find((g) => g.id === renamingId);
    if (!target) return;
    await upsertArcGoal({ ...target, name: trimmed, updatedAt: new Date().toISOString() });
    setRenamingId(null);
    setRenameText("");
    reload();
  }

  async function handleDuplicate(goal: ArcGoal) {
    const copy = duplicateArcGoal(goal, generateArcGoalId(), new Date().toISOString());
    await upsertArcGoal(copy);
    reload();
  }

  async function handleDelete(id: string) {
    await deleteArcGoal(id);
    setConfirmDeleteId(null);
    reload();
  }

  if (!goals) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>מטרות ARC Goal</Text>

        {goals.length === 0 && <Text style={styles.emptyText}>עדיין אין לך ARC Goal. אפשר להוסיף אחת חדשה למטה.</Text>}

        {goals.map((goal) => (
          <View key={goal.id} style={styles.goalRow}>
            <Pressable style={styles.goalButton} onPress={() => router.push({ pathname: "/goals/[id]", params: { id: goal.id } })}>
              <Text style={styles.goalButtonText}>{goal.name}</Text>
            </Pressable>
            <View style={styles.goalActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  setRenamingId(goal.id);
                  setRenameText(goal.name);
                }}
              >
                <Text style={styles.actionButtonText}>שנה שם</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleDuplicate(goal)}>
                <Text style={styles.actionButtonText}>שכפל</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(goal.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setCreating(true)}>
          <Text style={styles.buttonText}>+ הוסף מטרה</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>שם המטרה החדשה</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              textAlign="right"
              autoFocus
              placeholder="לדוגמה: להיות מוזיקאי עם 100,000 עוקבים"
            />
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} disabled={newName.trim().length === 0} onPress={handleCreate}>
                <Text style={styles.buttonText}>צור</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={renamingId !== null} transparent animationType="fade" onRequestClose={() => setRenamingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>שם חדש</Text>
            <TextInput style={styles.textInput} value={renameText} onChangeText={setRenameText} textAlign="right" autoFocus />
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} disabled={renameText.trim().length === 0} onPress={handleRename}>
                <Text style={styles.buttonText}>שמור</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setRenamingId(null)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את המטרה הזאת?</Text>
            <Text style={styles.body}>הפעולה אינה הפיכה. הפרוטוקולים המקושרים (ARC Build) לא יימחקו.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.button, styles.modalButton, styles.deleteButton]}
                onPress={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              >
                <Text style={styles.buttonText}>מחק</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(null)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  goalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 12,
  },
  goalButton: { flex: 1 },
  goalButtonText: { fontSize: 17, fontWeight: "600", textAlign: "right", color: "#0a7ea4" },
  goalActions: { flexDirection: "row-reverse", gap: 12, marginRight: 12 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  deleteText: { color: "#c0392b" },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginVertical: 12,
  },
  body: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0 },
  deleteButton: { backgroundColor: "#c0392b" },
});

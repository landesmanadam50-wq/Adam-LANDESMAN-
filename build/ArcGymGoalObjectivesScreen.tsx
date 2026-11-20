import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { createArcGymGoalObjective, reorderArcGymGoalObjectives, resolveObjectivesForArcGymGoal, toggleArcGymGoalObjectiveCompleted } from "../arc/arcGymGoal.ts";
import type { ArcGymGoalObjective } from "../arc/arcGymGoal.ts";
import { deleteArcGymGoalObjectiveEntry, loadArcGymGoalObjectives, saveArcGymGoalObjectives, upsertArcGymGoalObjectiveEntry } from "../data/storage.ts";

/**
 * build/ArcGymGoalObjectivesScreen.tsx (route /arc-gym/goal/[id]/objectives)
 *
 * ARC Gym + ARC Goal Integration task: one goal's own intermediate
 * objectives -- add/complete-toggle/reorder/delete, same up/down-swap
 * reorder convention as build/ManifestGoalsScreen.tsx's own moveGoal.
 */
export default function ArcGymGoalObjectivesScreen({ goalId }: { goalId: string }) {
  const [objectives, setObjectives] = useState<ArcGymGoalObjective[] | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const reload = useCallback(() => {
    loadArcGymGoalObjectives().then((all) => setObjectives(resolveObjectivesForArcGymGoal(all, goalId)));
  }, [goalId]);

  useFocusEffect(reload);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const now = new Date().toISOString();
    await upsertArcGymGoalObjectiveEntry(createArcGymGoalObjective(goalId, newTitle, objectives?.length ?? 0, now));
    setNewTitle("");
    reload();
  }

  async function handleToggle(objectiveId: string) {
    const all = await loadArcGymGoalObjectives();
    await saveArcGymGoalObjectives(toggleArcGymGoalObjectiveCompleted(all, objectiveId, new Date().toISOString()));
    reload();
  }

  async function handleDelete(objectiveId: string) {
    await deleteArcGymGoalObjectiveEntry(objectiveId);
    reload();
  }

  async function handleMove(objective: ArcGymGoalObjective, direction: -1 | 1) {
    if (!objectives) return;
    const ids = objectives.map((entry) => entry.id);
    const index = ids.indexOf(objective.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    const all = await loadArcGymGoalObjectives();
    await saveArcGymGoalObjectives(reorderArcGymGoalObjectives(all, goalId, ids, new Date().toISOString()));
    reload();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>יעדים</Text>

        {objectives === null && <Text style={styles.hint}>טוען...</Text>}
        {objectives !== null && objectives.length === 0 && <Text style={styles.hint}>עדיין לא נוספו יעדים.</Text>}

        {(objectives ?? []).map((objective) => (
          <View key={objective.id} style={styles.row}>
            <Pressable style={styles.checkbox} onPress={() => handleToggle(objective.id)}>
              <Text style={styles.checkboxText}>{objective.completed ? "☑" : "☐"}</Text>
            </Pressable>
            <Text style={[styles.rowText, objective.completed && styles.rowTextCompleted]}>{objective.title}</Text>
            <View style={styles.rowActions}>
              <Pressable onPress={() => handleMove(objective, -1)}>
                <Text style={styles.moveLink}>▲</Text>
              </Pressable>
              <Pressable onPress={() => handleMove(objective, 1)}>
                <Text style={styles.moveLink}>▼</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(objective.id)}>
                <Text style={styles.removeLink}>הסרה</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.addRow}>
          <Pressable style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>הוספה</Text>
          </Pressable>
          <TextInput style={[styles.textInput, styles.flexInput]} value={newTitle} onChangeText={setNewTitle} textAlign="right" placeholder="יעד חדש" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  checkbox: { paddingEnd: 4 },
  checkboxText: { fontSize: 18, color: "#0a7ea4" },
  rowText: { flex: 1, fontSize: 15, textAlign: "right" },
  rowTextCompleted: { color: "#999", textDecorationLine: "line-through" },
  rowActions: { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  moveLink: { color: "#0a7ea4", fontSize: 14 },
  removeLink: { color: "#b00020", fontSize: 13 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "700" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  flexInput: { flex: 1 },
});

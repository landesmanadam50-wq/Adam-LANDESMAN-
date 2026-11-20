import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { linkGoalToArcResultExercise, linkTaskToArcResult, unlinkGoalFromArcResultExercise, unlinkTaskFromArcResult } from "../arc/arcResult.ts";
import type { ArcResultExercise } from "../arc/arcResult.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import type { Task } from "../arc/tasks.ts";
import { loadArcGymGoals, loadArcResultExercises, loadTasks, upsertArcResultExerciseEntry } from "../data/storage.ts";

/**
 * build/ArcGymResultDetailScreen.tsx (route /arc-gym/result/[id])
 *
 * ARCHI -- ARC Result task, section 7: shows this exercise's own four
 * saved fields, a "practice intentionally" entry point (the SAME
 * quick-practice screen the automatic suggestion opens -- never a
 * second, duplicated practice screen), and the task-linking UI
 * ("linking or unlinking one or more tasks") -- every saved Task,
 * toggled on/off, reusing arc/arcResult.ts's own linkTaskToArcResult/
 * unlinkTaskFromArcResult, never a second ad-hoc toggle mechanism.
 */
export default function ArcGymResultDetailScreen({ id }: { id: string }) {
  const [exercise, setExercise] = useState<ArcResultExercise | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showLinking, setShowLinking] = useState(false);
  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [showGoalLinking, setShowGoalLinking] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadArcResultExercises(), loadTasks(), loadArcGymGoals()]).then(([exercises, allTasks, allGoals]) => {
      setExercise(exercises.find((candidate) => candidate.id === id) ?? null);
      setTasks(allTasks);
      setGoals(allGoals);
    });
  }, [id]);

  useFocusEffect(reload);

  async function toggleTaskLink(taskId: string) {
    if (!exercise) return;
    const now = new Date().toISOString();
    const linked = exercise.linkedTaskIds.includes(taskId);
    const updated = linked ? unlinkTaskFromArcResult(exercise, taskId, now) : linkTaskToArcResult(exercise, taskId, now);
    await upsertArcResultExerciseEntry(updated);
    setExercise(updated);
  }

  async function toggleGoalLink(goalId: string) {
    if (!exercise) return;
    const now = new Date().toISOString();
    const linked = exercise.linkedGoalIds.includes(goalId);
    const updated = linked ? unlinkGoalFromArcResultExercise(exercise, goalId, now) : linkGoalToArcResultExercise(exercise, goalId, now);
    await upsertArcResultExerciseEntry(updated);
    setExercise(updated);
  }

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const linkedTasks = tasks.filter((task) => exercise.linkedTaskIds.includes(task.id));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>נקודת מיקוד</Text>
        <Text style={styles.sectionText}>{exercise.focusPoint}</Text>

        <Text style={styles.sectionLabel}>דימיון הצלחה</Text>
        <Text style={styles.sectionText}>{exercise.successVisualization}</Text>

        <Text style={styles.sectionLabel}>משפט הצלחה</Text>
        <Text style={styles.sectionText}>{exercise.successMantra}</Text>

        <Text style={styles.sectionLabel}>שפת גוף תומכת</Text>
        <Text style={styles.sectionText}>{exercise.supportiveBodyLanguage}</Text>

        <Pressable onPress={() => router.push({ pathname: "/arc-gym/result/[id]/edit", params: { id: exercise.id } })}>
          <Text style={styles.linkText}>ערוך תרגיל</Text>
        </Pressable>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push({ pathname: "/arc-result-practice/[id]", params: { id: exercise.id, origin: "arc-gym" } })}
        >
          <Text style={styles.primaryButtonText}>לתרגל עכשיו</Text>
        </Pressable>

        <View style={styles.linkingBlock}>
          <View style={styles.linkingHeaderRow}>
            <Text style={styles.sectionTitle}>משימות מקושרות</Text>
            <Pressable onPress={() => setShowLinking((prev) => !prev)}>
              <Text style={styles.linkText}>{showLinking ? "סגור" : "ניהול קישורים"}</Text>
            </Pressable>
          </View>

          {linkedTasks.length === 0 && <Text style={styles.hint}>התרגיל הזה עדיין לא מקושר לאף משימה.</Text>}
          {linkedTasks.map((task) => (
            <Text key={task.id} style={styles.linkedTaskText}>
              • {task.title}
            </Text>
          ))}

          {showLinking && (
            <FlatList
              data={tasks}
              keyExtractor={(item) => item.id}
              style={styles.taskPickerList}
              renderItem={({ item }) => {
                const linked = exercise.linkedTaskIds.includes(item.id);
                return (
                  <Pressable style={styles.taskPickerRow} onPress={() => toggleTaskLink(item.id)}>
                    <Text style={[styles.taskPickerText, linked && styles.taskPickerTextLinked]}>{item.title}</Text>
                    <Text style={styles.taskPickerCheck}>{linked ? "☑" : "☐"}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={styles.linkingBlock}>
          <View style={styles.linkingHeaderRow}>
            <Text style={styles.sectionTitle}>שיוך למטרות</Text>
            <Pressable onPress={() => setShowGoalLinking((prev) => !prev)}>
              <Text style={styles.linkText}>{showGoalLinking ? "סגור" : "ניהול שיוך"}</Text>
            </Pressable>
          </View>

          {goals.filter((goal) => exercise.linkedGoalIds.includes(goal.id)).length === 0 && <Text style={styles.hint}>התרגיל הזה עדיין לא משויך לאף מטרה.</Text>}
          {goals
            .filter((goal) => exercise.linkedGoalIds.includes(goal.id))
            .map((goal) => (
              <Text key={goal.id} style={styles.linkedTaskText}>
                • {goal.title}
              </Text>
            ))}

          {showGoalLinking && (
            <FlatList
              data={goals}
              keyExtractor={(item) => item.id}
              style={styles.taskPickerList}
              renderItem={({ item }) => {
                const linked = exercise.linkedGoalIds.includes(item.id);
                return (
                  <Pressable style={styles.taskPickerRow} onPress={() => toggleGoalLink(item.id)}>
                    <Text style={[styles.taskPickerText, linked && styles.taskPickerTextLinked]}>{item.title}</Text>
                    <Text style={styles.taskPickerCheck}>{linked ? "☑" : "☐"}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  sectionLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", marginTop: 14, fontWeight: "700" },
  sectionText: { fontSize: 15, textAlign: "right", color: "#333", marginTop: 4 },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right", marginTop: 8 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  linkingBlock: { marginTop: 24 },
  linkingHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  linkedTaskText: { fontSize: 14, textAlign: "right", color: "#333", marginTop: 2 },
  taskPickerList: { maxHeight: 280, marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  taskPickerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  taskPickerText: { fontSize: 14, textAlign: "right", color: "#333" },
  taskPickerTextLinked: { color: "#0a7ea4", fontWeight: "700" },
  taskPickerCheck: { fontSize: 16, color: "#0a7ea4", marginStart: 10 },
});

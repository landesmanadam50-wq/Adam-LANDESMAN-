import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { linkGoalToArcFocusExercise, unlinkGoalFromArcFocusExercise } from "../arc/arcFocusExercise.ts";
import type { ArcFocusExercise } from "../arc/arcFocusExercise.ts";
import { createArcFocusSession, generateArcFocusPracticeId } from "../arc/arcFocusSession.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";
import { loadArcFocusExercises, loadArcGymGoals, saveArcFocusSession, upsertArcFocusExerciseEntry } from "../data/storage.ts";

/**
 * build/ArcGymFocusExerciseDetailScreen.tsx (route /arc-gym/focus-exercise/[id])
 *
 * ARC Gym + ARC Goal Integration task: shows this saved ARC Focus
 * configuration's own settings, "שיוך למטרות" (goal-linking, same
 * checkbox pattern as build/ArcGymResultDetailScreen.tsx's own
 * task-linking UI), and "להתחיל אימון עכשיו" -- composes the EXISTING,
 * unchanged createArcFocusSession/engine with THIS exercise's own
 * saved settings snapshot, standalone (no Task), exactly like
 * build/ArcFocusSettingsScreen.tsx's own handleStartNow.
 */
export default function ArcGymFocusExerciseDetailScreen({ id }: { id: string }) {
  const [exercise, setExercise] = useState<ArcFocusExercise | null>(null);
  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [showLinking, setShowLinking] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadArcFocusExercises(), loadArcGymGoals()]).then(([exercises, loadedGoals]) => {
      setExercise(exercises.find((candidate) => candidate.id === id) ?? null);
      setGoals(loadedGoals);
    });
  }, [id]);

  useFocusEffect(reload);

  async function toggleGoalLink(goalId: string) {
    if (!exercise) return;
    const now = new Date().toISOString();
    const linked = exercise.linkedGoalIds.includes(goalId);
    const updated = linked ? unlinkGoalFromArcFocusExercise(exercise, goalId, now) : linkGoalToArcFocusExercise(exercise, goalId, now);
    await upsertArcFocusExerciseEntry(updated);
    setExercise(updated);
  }

  async function handleStartNow() {
    if (!exercise) return;
    const practiceId = generateArcFocusPracticeId();
    const now = new Date().toISOString();
    await saveArcFocusSession(createArcFocusSession(practiceId, null, exercise.settings, now));
    router.push({ pathname: "/tasks/[id]/arc-focus/check-in", params: { id: STANDALONE_ARC_TASK_ID, arcFocusPracticeId: practiceId } });
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

  const linkedGoals = goals.filter((goal) => exercise.linkedGoalIds.includes(goal.id));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{exercise.title}</Text>
        <Text style={styles.sectionText}>{`משך: ${exercise.settings.durationMinutes} דק' · קצב הקשות: כל ${exercise.settings.tapRhythmSeconds} שנ'`}</Text>

        <Pressable onPress={() => router.push({ pathname: "/arc-gym/focus-exercise/[id]/edit", params: { id: exercise.id } })}>
          <Text style={styles.linkText}>ערוך תרגיל</Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={handleStartNow}>
          <Text style={styles.primaryButtonText}>להתחיל אימון עכשיו</Text>
        </Pressable>

        <View style={styles.linkingBlock}>
          <View style={styles.linkingHeaderRow}>
            <Text style={styles.sectionTitle}>שיוך למטרות</Text>
            <Pressable onPress={() => setShowLinking((prev) => !prev)}>
              <Text style={styles.linkText}>{showLinking ? "סגור" : "ניהול שיוך"}</Text>
            </Pressable>
          </View>

          {linkedGoals.length === 0 && <Text style={styles.hint}>התרגיל הזה עדיין לא משויך לאף מטרה.</Text>}
          {linkedGoals.map((goal) => (
            <Text key={goal.id} style={styles.linkedGoalText}>
              • {goal.title}
            </Text>
          ))}

          {showLinking && (
            <FlatList
              data={goals}
              keyExtractor={(item) => item.id}
              style={styles.goalPickerList}
              renderItem={({ item }) => {
                const linked = exercise.linkedGoalIds.includes(item.id);
                return (
                  <Pressable style={styles.goalPickerRow} onPress={() => toggleGoalLink(item.id)}>
                    <Text style={[styles.goalPickerText, linked && styles.goalPickerTextLinked]}>{item.title}</Text>
                    <Text style={styles.goalPickerCheck}>{linked ? "☑" : "☐"}</Text>
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
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  sectionText: { fontSize: 14, textAlign: "right", color: "#555", marginTop: 6 },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right", marginTop: 10 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  linkingBlock: { marginTop: 24 },
  linkingHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  linkedGoalText: { fontSize: 14, textAlign: "right", color: "#333", marginTop: 2 },
  goalPickerList: { maxHeight: 280, marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  goalPickerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  goalPickerText: { fontSize: 14, textAlign: "right", color: "#333" },
  goalPickerTextLinked: { color: "#0a7ea4", fontWeight: "700" },
  goalPickerCheck: { fontSize: 16, color: "#0a7ea4", marginStart: 10 },
});

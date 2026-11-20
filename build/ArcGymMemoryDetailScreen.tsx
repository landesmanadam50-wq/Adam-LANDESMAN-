import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  describeArcGymReminderSchedule,
  linkGoalToArcGymMemoryExercise,
  listArcGymRemindersForExercise,
  listArcGymTrainingRecordsForMemoryExercise,
  unlinkGoalFromArcGymMemoryExercise,
} from "../arc/arcGym.ts";
import type { ArcGymMemoryExercise, ArcGymReminder, ArcGymTrainingRecord } from "../arc/arcGym.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import { loadArcGymGoals, loadArcGymMemoryExercises, loadArcGymReminders, loadArcGymTrainingRecords, upsertArcGymMemoryExerciseEntry } from "../data/storage.ts";

/**
 * build/ArcGymMemoryDetailScreen.tsx (route /arc-gym/memory/[id])
 *
 * ARCHI -- Unified Development Specification task, Part 1: shows this
 * ARC Memory exercise's own two saved answers plus its training
 * history (reusing arc/arcGym.ts's own ArcGymTrainingRecord, keyed by
 * this exercise's id in the record's situationId field -- never a
 * second, parallel history mechanism), before starting a new training
 * session. Parallel to build/ArcGymSituationScreen.tsx's own role for
 * the Behaviour exercise type.
 */
export default function ArcGymMemoryDetailScreen({ id }: { id: string }) {
  const [exercise, setExercise] = useState<ArcGymMemoryExercise | null>(null);
  const [records, setRecords] = useState<ArcGymTrainingRecord[]>([]);
  const [reminders, setReminders] = useState<ArcGymReminder[]>([]);
  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [showGoalLinking, setShowGoalLinking] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadArcGymMemoryExercises(), loadArcGymTrainingRecords(), loadArcGymReminders(), loadArcGymGoals()]).then(
      ([exercises, trainingRecords, allReminders, allGoals]) => {
        setExercise(exercises.find((candidate) => candidate.id === id) ?? null);
        setRecords(listArcGymTrainingRecordsForMemoryExercise(trainingRecords, id));
        setReminders(listArcGymRemindersForExercise(allReminders, "memory", id));
        setGoals(allGoals);
      }
    );
  }, [id]);

  useFocusEffect(reload);

  async function toggleGoalLink(goalId: string) {
    if (!exercise) return;
    const now = new Date().toISOString();
    const linked = exercise.linkedGoalIds.includes(goalId);
    const updated = linked ? unlinkGoalFromArcGymMemoryExercise(exercise, goalId, now) : linkGoalToArcGymMemoryExercise(exercise, goalId, now);
    await upsertArcGymMemoryExerciseEntry(updated);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.situationText}>{exercise.situationText}</Text>
        <View style={styles.actionCard}>
          <Text style={styles.actionLabel}>מה להיזכר לעשות</Text>
          <Text style={styles.actionText}>{exercise.actionText}</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: "/arc-gym/memory/[id]/edit", params: { id: exercise.id } })}>
          <Text style={styles.linkText}>ערוך תרגיל זיכרון</Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: "/arc-gym/memory/[id]/train", params: { id: exercise.id } })}>
          <Text style={styles.primaryButtonText}>להתחיל אימון זיכרון</Text>
        </Pressable>

        {/* ARCHI -- Unified Development Specification task, Part 2: ARC GYM reminders for the Memory exercise type -- see build/ArcGymSituationScreen.tsx's own matching block for the Behaviour type, both sharing the exact same arc/arcGym.ts helpers/editor screen. */}
        <View style={styles.remindersBlock}>
          <View style={styles.remindersHeaderRow}>
            <Text style={styles.sectionTitle}>תזכורות אימון</Text>
            <Pressable onPress={() => router.push({ pathname: "/arc-gym/reminder/[id]/edit", params: { id: "new", exerciseKind: "memory", exerciseId: exercise.id } })}>
              <Text style={styles.linkText}>+ תזכורת</Text>
            </Pressable>
          </View>
          {reminders.length === 0 && <Text style={styles.hint}>אין תזכורות מוגדרות.</Text>}
          {reminders.map((reminder) => (
            <Pressable key={reminder.id} style={styles.reminderRow} onPress={() => router.push({ pathname: "/arc-gym/reminder/[id]/edit", params: { id: reminder.id } })}>
              <Text style={styles.reminderText}>{describeArcGymReminderSchedule(reminder)}</Text>
              {!reminder.enabled && <Text style={styles.hint}>כבוי</Text>}
            </Pressable>
          ))}
        </View>

        <View style={styles.remindersBlock}>
          <View style={styles.remindersHeaderRow}>
            <Text style={styles.sectionTitle}>שיוך למטרות</Text>
            <Pressable onPress={() => setShowGoalLinking((prev) => !prev)}>
              <Text style={styles.linkText}>{showGoalLinking ? "סגור" : "ניהול שיוך"}</Text>
            </Pressable>
          </View>
          {goals.filter((goal) => exercise.linkedGoalIds.includes(goal.id)).length === 0 && <Text style={styles.hint}>התרגיל הזה עדיין לא משויך לאף מטרה.</Text>}
          {goals
            .filter((goal) => exercise.linkedGoalIds.includes(goal.id))
            .map((goal) => (
              <Text key={goal.id} style={styles.reminderText}>
                • {goal.title}
              </Text>
            ))}
          {showGoalLinking && (
            <FlatList
              data={goals}
              keyExtractor={(item) => item.id}
              style={styles.goalPickerList}
              renderItem={({ item }) => {
                const linked = exercise.linkedGoalIds.includes(item.id);
                return (
                  <Pressable style={styles.reminderRow} onPress={() => toggleGoalLink(item.id)}>
                    <Text style={[styles.reminderText, linked && styles.goalPickerTextLinked]}>{item.title}</Text>
                    <Text style={styles.hint}>{linked ? "☑" : "☐"}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {records.length > 0 && (
          <View style={styles.historyBlock}>
            <Text style={styles.sectionTitle}>היסטוריית אימונים</Text>
            {records.map((record) => (
              <View key={record.id} style={styles.historyRow}>
                <Text style={styles.historyText}>{record.completedAt ? "הושלם" : "לא הושלם"}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  situationText: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  actionCard: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 14, marginTop: 12 },
  actionLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", marginBottom: 4, fontWeight: "700" },
  actionText: { fontSize: 15, textAlign: "right", color: "#333" },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right", marginTop: 8 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  historyBlock: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  historyRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8 },
  historyText: { fontSize: 14, textAlign: "right", color: "#333" },
  remindersBlock: { marginTop: 24 },
  remindersHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  reminderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8 },
  reminderText: { fontSize: 14, textAlign: "right", color: "#333" },
  goalPickerList: { maxHeight: 280, marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  goalPickerTextLinked: { color: "#0a7ea4", fontWeight: "700" },
});

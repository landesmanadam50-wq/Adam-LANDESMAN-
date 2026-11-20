import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { linkGoalToArcGymSituation, linkGoalToArcGymMemoryExercise, unlinkGoalFromArcGymSituation, unlinkGoalFromArcGymMemoryExercise } from "../arc/arcGym.ts";
import type { ArcGymMemoryExercise, ArcGymSituation } from "../arc/arcGym.ts";
import { linkGoalToArcResultExercise, unlinkGoalFromArcResultExercise } from "../arc/arcResult.ts";
import type { ArcResultExercise } from "../arc/arcResult.ts";
import { linkGoalToArcFocusExercise, unlinkGoalFromArcFocusExercise } from "../arc/arcFocusExercise.ts";
import type { ArcFocusExercise } from "../arc/arcFocusExercise.ts";
import {
  loadArcFocusExercises,
  loadArcGymMemoryExercises,
  loadArcGymSituations,
  loadArcResultExercises,
  upsertArcFocusExerciseEntry,
  upsertArcGymMemoryExerciseEntry,
  upsertArcGymSituationEntry,
  upsertArcResultExerciseEntry,
} from "../data/storage.ts";

/**
 * build/ArcGymGoalExercisesScreen.tsx (route /arc-gym/goal/[id]/exercises)
 *
 * ARC Gym + ARC Goal Integration task: link/unlink EXISTING exercises
 * of any of the four kinds to this goal -- each kind's own checkbox
 * list, same toggle pattern as build/ArcGymResultDetailScreen.tsx's own
 * task-linking UI, reusing each kind's own link/unlink helper (never a
 * second, ad-hoc toggle mechanism, and linking never copies the
 * exercise's own data/config/history -- only its tiny linkedGoalIds
 * array changes).
 *
 * "Create new" for Memory/Result/Focus opens that kind's OWN existing
 * creation screen (so the new exercise also appears in plain ARC Gym,
 * never a goal-only hidden duplicate); the trainee then returns here
 * and links it. Behaviour has no such shortcut here -- a new
 * ArcGymSituation needs a real (manifestId, behaviorId) pair, which
 * only the existing Behaviour picker (ARC Gym's own entry screen)
 * resolves; linking an existing one is still fully supported below.
 */
export default function ArcGymGoalExercisesScreen({ goalId }: { goalId: string }) {
  const [situations, setSituations] = useState<ArcGymSituation[]>([]);
  const [memoryExercises, setMemoryExercises] = useState<ArcGymMemoryExercise[]>([]);
  const [resultExercises, setResultExercises] = useState<ArcResultExercise[]>([]);
  const [focusExercises, setFocusExercises] = useState<ArcFocusExercise[]>([]);

  const reload = useCallback(() => {
    Promise.all([loadArcGymSituations(), loadArcGymMemoryExercises(), loadArcResultExercises(), loadArcFocusExercises()]).then(
      ([loadedSituations, loadedMemory, loadedResult, loadedFocus]) => {
        setSituations(loadedSituations);
        setMemoryExercises(loadedMemory);
        setResultExercises(loadedResult);
        setFocusExercises(loadedFocus);
      }
    );
  }, []);

  useFocusEffect(reload);

  async function toggleSituation(situation: ArcGymSituation) {
    const now = new Date().toISOString();
    const linked = situation.linkedGoalIds.includes(goalId);
    await upsertArcGymSituationEntry(linked ? unlinkGoalFromArcGymSituation(situation, goalId, now) : linkGoalToArcGymSituation(situation, goalId, now));
    reload();
  }

  async function toggleMemory(exercise: ArcGymMemoryExercise) {
    const now = new Date().toISOString();
    const linked = exercise.linkedGoalIds.includes(goalId);
    await upsertArcGymMemoryExerciseEntry(linked ? unlinkGoalFromArcGymMemoryExercise(exercise, goalId, now) : linkGoalToArcGymMemoryExercise(exercise, goalId, now));
    reload();
  }

  async function toggleResult(exercise: ArcResultExercise) {
    const now = new Date().toISOString();
    const linked = exercise.linkedGoalIds.includes(goalId);
    await upsertArcResultExerciseEntry(linked ? unlinkGoalFromArcResultExercise(exercise, goalId, now) : linkGoalToArcResultExercise(exercise, goalId, now));
    reload();
  }

  async function toggleFocus(exercise: ArcFocusExercise) {
    const now = new Date().toISOString();
    const linked = exercise.linkedGoalIds.includes(goalId);
    await upsertArcFocusExerciseEntry(linked ? unlinkGoalFromArcFocusExercise(exercise, goalId, now) : linkGoalToArcFocusExercise(exercise, goalId, now));
    reload();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תרגילים מקושרים</Text>

        <Text style={styles.sectionTitle}>התנהגות</Text>
        {situations.length === 0 && <Text style={styles.hint}>אין תרגילי התנהגות שמורים. ליצירת אחד חדש, עבור למסך ARC GYM ובחר התנהגות ממניפסט.</Text>}
        {situations.map((situation) => (
          <Pressable key={situation.id} style={styles.pickerRow} onPress={() => toggleSituation(situation)}>
            <Text style={[styles.pickerText, situation.linkedGoalIds.includes(goalId) && styles.pickerTextLinked]}>{situation.desiredAction || situation.behaviorText}</Text>
            <Text style={styles.pickerCheck}>{situation.linkedGoalIds.includes(goalId) ? "☑" : "☐"}</Text>
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>זיכרון</Text>
        <Pressable onPress={() => router.push({ pathname: "/arc-gym/memory/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.createLink}>+ תרגיל זיכרון חדש</Text>
        </Pressable>
        {memoryExercises.length === 0 && <Text style={styles.hint}>אין תרגילי זיכרון שמורים.</Text>}
        {memoryExercises.map((exercise) => (
          <Pressable key={exercise.id} style={styles.pickerRow} onPress={() => toggleMemory(exercise)}>
            <Text style={[styles.pickerText, exercise.linkedGoalIds.includes(goalId) && styles.pickerTextLinked]}>{exercise.situationText || "(ללא תיאור)"}</Text>
            <Text style={styles.pickerCheck}>{exercise.linkedGoalIds.includes(goalId) ? "☑" : "☐"}</Text>
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>הצלחה</Text>
        <Pressable onPress={() => router.push({ pathname: "/arc-gym/result/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.createLink}>+ תרגיל הצלחה חדש</Text>
        </Pressable>
        {resultExercises.length === 0 && <Text style={styles.hint}>אין תרגילי הצלחה שמורים.</Text>}
        {resultExercises.map((exercise) => (
          <Pressable key={exercise.id} style={styles.pickerRow} onPress={() => toggleResult(exercise)}>
            <Text style={[styles.pickerText, exercise.linkedGoalIds.includes(goalId) && styles.pickerTextLinked]}>{exercise.focusPoint || "(ללא נקודת מיקוד)"}</Text>
            <Text style={styles.pickerCheck}>{exercise.linkedGoalIds.includes(goalId) ? "☑" : "☐"}</Text>
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>Focus</Text>
        <Pressable onPress={() => router.push({ pathname: "/arc-gym/focus-exercise/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.createLink}>+ תרגיל Focus חדש</Text>
        </Pressable>
        {focusExercises.length === 0 && <Text style={styles.hint}>אין תרגילי Focus שמורים.</Text>}
        {focusExercises.map((exercise) => (
          <Pressable key={exercise.id} style={styles.pickerRow} onPress={() => toggleFocus(exercise)}>
            <Text style={[styles.pickerText, exercise.linkedGoalIds.includes(goalId) && styles.pickerTextLinked]}>{exercise.title}</Text>
            <Text style={styles.pickerCheck}>{exercise.linkedGoalIds.includes(goalId) ? "☑" : "☐"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 6, color: "#0a7ea4" },
  createLink: { color: "#0a7ea4", fontSize: 13, textAlign: "right", marginBottom: 6 },
  hint: { fontSize: 13, color: "#777", textAlign: "right" },
  pickerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  pickerText: { flex: 1, fontSize: 14, textAlign: "right", color: "#333" },
  pickerTextLinked: { color: "#0a7ea4", fontWeight: "700" },
  pickerCheck: { fontSize: 16, color: "#0a7ea4", marginStart: 10 },
});

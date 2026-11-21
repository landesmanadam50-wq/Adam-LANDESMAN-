import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcSavedExercise, ArcTrigger } from "../arc/arcSaving.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";
import { findActiveTask } from "../arc/tasks.ts";
import { loadArcSavedExercises, loadArcTriggers, loadTasks } from "../data/storage.ts";

/**
 * build/ArcSavingScreen.tsx (route /arc-saving)
 *
 * ARC Saving task, spec section 15 ("ניהול ARC Saving"): the one
 * management hub -- every saved exercise, every trigger, and the link
 * to "עריכת טריגרים" (the active/displayed list editor), all reading
 * the SAME storage this app's other ARC Saving screens read, never a
 * second/parallel data store.
 */
export default function ArcSavingScreen() {
  const [exercises, setExercises] = useState<ArcSavedExercise[] | null>(null);
  const [triggers, setTriggers] = useState<ArcTrigger[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcSavedExercises(), loadArcTriggers()]).then(([loadedExercises, loadedTriggers]) => {
        setExercises([...loadedExercises].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
        setTriggers([...loadedTriggers].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
      });
    }, [])
  );

  // "תרגל שוב" preserves whatever task is already active (never forces
  // standalone), same convention as every other ARC Saving entry point --
  // see arc/newArcLiveTypes.ts's own doc on arcSavingExerciseId.
  async function practiceExerciseAgain(exercise: ArcSavedExercise) {
    const activeTaskId = findActiveTask(await loadTasks())?.id ?? STANDALONE_ARC_TASK_ID;
    router.push({
      pathname: "/tasks/[id]/arc",
      params: { id: activeTaskId, arcSavingExerciseId: exercise.id, spontaneous: "1" },
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>💾 ARC Saving</Text>
            <Text style={styles.subtitle}>תרגילי ARC שמורים, טריגרים אישיים, ואפשרויות הגוף שנלמדו מהניסיון שלך.</Text>

            <Pressable style={styles.activeTriggersLink} onPress={() => router.push("/arc-saving/active-triggers")}>
              <Text style={styles.activeTriggersLinkText}>⚙️ עריכת טריגרים (אילו טריגרים מוצגים)</Text>
            </Pressable>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>הטריגרים שלי</Text>
              <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/arc-saving/trigger/[id]", params: { id: "new" } })}>
                <Text style={styles.addButtonText}>+ טריגר חדש</Text>
              </Pressable>
            </View>
            {triggers !== null && triggers.length === 0 && <Text style={styles.hint}>עדיין לא הוגדרו טריגרים.</Text>}
            {(triggers ?? []).map((trigger) => (
              <Pressable key={trigger.id} style={styles.row} onPress={() => router.push({ pathname: "/arc-saving/trigger/[id]", params: { id: trigger.id } })}>
                <Text style={styles.rowTitle}>{trigger.label}</Text>
                <Text style={styles.rowSubtitle}>
                  {trigger.bodyOptionIds.length === 0 ? "אין עדיין אפשרויות גוף" : `${trigger.bodyOptionIds.length} אפשרויות גוף`}
                </Text>
              </Pressable>
            ))}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>התרגילים השמורים שלי</Text>
            </View>
            {exercises !== null && exercises.length === 0 && <Text style={styles.hint}>עדיין לא נשמרו תרגילים. בסיום תרגיל ARC במסלול "פחות טוב" תוכל לשמור אותו.</Text>}
            {(exercises ?? []).map((exercise) => (
              <View key={exercise.id} style={styles.row}>
                <Text style={styles.rowTitle}>{exercise.label}</Text>
                <Text style={styles.rowSubtitle}>{exercise.mode === "shortened" ? "ARC מקוצר" : "ARC מלא"}</Text>
                <Pressable style={styles.secondaryButton} onPress={() => practiceExerciseAgain(exercise)}>
                  <Text style={styles.secondaryButtonText}>תרגל שוב</Text>
                </Pressable>
              </View>
            ))}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  subtitle: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 6, marginBottom: 14, lineHeight: 19 },
  activeTriggersLink: { backgroundColor: "#eef7f0", borderRadius: 10, padding: 12, marginBottom: 18 },
  activeTriggersLinkText: { color: "#2E7D32", fontWeight: "700", fontSize: 14, textAlign: "right" },
  sectionHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  hint: { fontSize: 13, color: "#777", textAlign: "right", marginBottom: 10 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSubtitle: { fontSize: 12, color: "#777", textAlign: "right", marginTop: 2 },
  secondaryButton: { alignSelf: "flex-end", marginTop: 8, borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 12 },
});

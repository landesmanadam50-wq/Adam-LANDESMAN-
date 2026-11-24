import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcGymGoal, ArcGymGoalObjective } from "../arc/arcGymGoal.ts";
import { resolveArcGymGoalObjectiveProgress, resolveLinkedExercisesForArcGymGoal } from "../arc/arcGymGoal.ts";
import type { Task } from "../arc/tasks.ts";
import {
  deleteArcGymGoalEntry,
  loadArcFocusExercises,
  loadArcGymGoalObjectives,
  loadArcGymGoals,
  loadArcGymMemoryExercises,
  loadArcGymSituations,
  loadArcResultExercises,
  loadTasks,
} from "../data/storage.ts";

const EXERCISE_KIND_LABELS: Record<string, string> = { behaviour: "התנהגות", memory: "זיכרון", result: "הצלחה", focus: "Focus" };

/**
 * build/ArcGymGoalDetailScreen.tsx (route /arc-gym/goal/[id])
 *
 * ARC Gym + ARC Goal Integration task: the hub for one ArcGymGoal --
 * its own Manifest (reusing the EXISTING PurposeManifestEditorScreen
 * verbatim, via its own route), objectives/tasks/exercises SUMMARIES
 * with links to their own dedicated screens (never duplicated here),
 * and edit/delete actions. Deleting the goal here never touches its
 * own Manifest or any linked exercise/task -- only unlinks them (every
 * linked exercise's own linkedGoalIds simply still contains an id that
 * no longer resolves to anything, exactly like arc/arcResult.ts's own
 * "never auto-deletes on the other side" convention elsewhere).
 */
export default function ArcGymGoalDetailScreen({ id }: { id: string }) {
  const [goal, setGoal] = useState<ArcGymGoal | null>(null);
  const [objectives, setObjectives] = useState<ArcGymGoalObjective[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [taskCount, setTaskCount] = useState(0);

  const reload = useCallback(() => {
    Promise.all([
      loadArcGymGoals(),
      loadArcGymGoalObjectives(),
      loadArcGymSituations(),
      loadArcGymMemoryExercises(),
      loadArcResultExercises(),
      loadArcFocusExercises(),
      loadTasks(),
    ]).then(([goals, loadedObjectives, situations, memoryExercises, resultExercises, focusExercises, tasks]) => {
      setGoal(goals.find((candidate) => candidate.id === id) ?? null);
      setObjectives(loadedObjectives);
      const refs = resolveLinkedExercisesForArcGymGoal(id, situations, memoryExercises, resultExercises, focusExercises);
      const counts: Record<string, number> = {};
      for (const ref of refs) counts[ref.kind] = (counts[ref.kind] ?? 0) + 1;
      setExerciseCounts(counts);
      setTaskCount(tasks.filter((task: Task) => task.arcGymGoalId === id).length);
    });
  }, [id]);

  useFocusEffect(reload);

  function handleDelete() {
    if (!goal) return;
    Alert.alert("מחיקת מטרה", "המטרה תימחק. המניפסט, המשימות והתרגילים המקושרים לא יימחקו.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחיקה",
        style: "destructive",
        onPress: async () => {
          await deleteArcGymGoalEntry(goal.id);
          router.back();
        },
      },
    ]);
  }

  if (!goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const progress = resolveArcGymGoalObjectiveProgress(objectives, goal.id);
  const totalExercises = Object.values(exerciseCounts).reduce((sum, count) => sum + count, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{goal.title}</Text>
        {goal.description && <Text style={styles.description}>{goal.description}</Text>}

        <Pressable onPress={() => router.push({ pathname: "/arc-gym/goal/[id]/edit", params: { id: goal.id } })}>
          <Text style={styles.linkText}>ערוך מטרה</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push({ pathname: "/purpose-manifests/[id]", params: { id: goal.manifestId } })}>
          <Text style={styles.cardTitle}>📜 המניפסט של המטרה</Text>
          <Text style={styles.cardSubtitle}>חזון, ערך אישי והתנהגויות עתידיות -- ייעודי למטרה הזו בלבד</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push({ pathname: "/arc-gym/goal/[id]/objectives", params: { id: goal.id } })}>
          <Text style={styles.cardTitle}>🏁 יעדים</Text>
          <Text style={styles.cardSubtitle}>{progress.total > 0 ? `${progress.completed}/${progress.total} הושלמו` : "אין יעדים עדיין"}</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push({ pathname: "/arc-gym/goal/[id]/tasks", params: { id: goal.id } })}>
          <Text style={styles.cardTitle}>✅ משימות מעשיות</Text>
          <Text style={styles.cardSubtitle}>{taskCount > 0 ? `${taskCount} משימות מקושרות` : "אין משימות מקושרות עדיין"}</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push({ pathname: "/arc-gym/goal/[id]/exercises", params: { id: goal.id } })}>
          <Text style={styles.cardTitle}>🏋️ תרגילים מקושרים</Text>
          <Text style={styles.cardSubtitle}>
            {totalExercises > 0
              ? Object.entries(exerciseCounts)
                  .map(([kind, count]) => `${EXERCISE_KIND_LABELS[kind] ?? kind}: ${count}`)
                  .join(" · ")
              : "אין תרגילים מקושרים עדיין"}
          </Text>
        </Pressable>

        {/* ARC Reminders task, Phase 5: "remind me of this" entry point -- reminds the trainee of the next incomplete objective, read-through at every delivery (never a frozen snapshot of today's objectives). */}
        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({ pathname: "/arc-reminders", params: { mantraSubtype: "arc_goal", mantraSourceRef: JSON.stringify({ kind: "arc_goal", goalId: goal.id }) } })
          }
        >
          <Text style={styles.cardTitle}>🔔 ARC Reminders</Text>
          <Text style={styles.cardSubtitle}>+ תזכורת מנטרה שמזכירה את היעד הבא שלא הושלם</Text>
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>מחיקת מטרה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right" },
  description: { fontSize: 14, color: "#555", textAlign: "right", marginTop: 6 },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right", marginTop: 8, marginBottom: 20 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#222" },
  cardSubtitle: { fontSize: 13, color: "#777", textAlign: "right", marginTop: 4 },
  deleteButton: { borderWidth: 1, borderColor: "#b00020", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  deleteButtonText: { color: "#b00020", fontWeight: "700" },
});

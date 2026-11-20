import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolveArcResultsForTask } from "../arc/arcResult.ts";
import type { ArcResultExercise } from "../arc/arcResult.ts";
import type { Task } from "../arc/tasks.ts";
import { getTask, loadArcResultExercises } from "../data/storage.ts";

/**
 * live/ArcResultSuggestionScreen.tsx (route /arc-result-suggestion)
 *
 * ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
 * Shortcuts task, section 5: the ONE compact suggestion prompt both
 * required entry points (post-ARC completion, the 😄 shortcut) open --
 * never a second, differently-worded prompt. Both callers have already
 * resolved the exact destination task (live/NewArcLiveScreen.tsx's own
 * returnToTask / data/emotionalCheckInRouting.ts's own
 * resolveAndOpenNextTask) and already confirmed at least one
 * ArcResultExercise is linked to it BEFORE ever navigating here -- this
 * screen never re-decides whether to show itself, it only re-resolves
 * the same data to render (the exact same arc/arcResult.ts's own
 * resolveArcResultsForTask, never a second filter).
 *
 * Both outcomes -- "תרגל הצלחה" and "דלג והמשך למשימה" -- end with
 * `router.replace` to the EXACT SAME `/tasks/[id]` destination
 * (optionally carrying `autoStart`, passed through unchanged from
 * whichever caller navigated here) the trainee would have reached had
 * no ARC Result ever been linked -- "never automatically start a task
 * timer merely because the user opened or skipped this suggestion,"
 * since autoStart is never SET here, only ever forwarded.
 */
export default function ArcResultSuggestionScreen({ taskId, autoStart = false }: { taskId: string; autoStart?: boolean }) {
  const [task, setTask] = useState<Task | null>(null);
  const [exercises, setExercises] = useState<ArcResultExercise[]>([]);
  const [showSelection, setShowSelection] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getTask(taskId), loadArcResultExercises()]).then(([loadedTask, allExercises]) => {
        setTask(loadedTask);
        setExercises(resolveArcResultsForTask(allExercises, taskId));
      });
      setShowSelection(false);
    }, [taskId])
  );

  function continueToTask() {
    router.replace(autoStart ? { pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } } : { pathname: "/tasks/[id]", params: { id: taskId } });
  }

  function openPractice(exerciseId: string) {
    router.replace({
      pathname: "/arc-result-practice/[id]",
      params: autoStart ? { id: exerciseId, taskId, autoStart: "1" } : { id: exerciseId, taskId },
    });
  }

  /** Section 5: "if exactly one result is linked, open it directly. If multiple results are linked, show a minimal selection interface only after the user chooses to practice." */
  function handlePracticePress() {
    if (exercises.length === 1) {
      openPractice(exercises[0].id);
      return;
    }
    setShowSelection(true);
  }

  if (!task || exercises.length === 0) {
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
        <Text style={styles.title}>רוצה לתרגל הצלחה לפני המשימה?</Text>
        <Text style={styles.taskName}>{task.title}</Text>

        {showSelection ? (
          <View style={styles.selectionList}>
            {exercises.map((exercise) => (
              <Pressable key={exercise.id} style={styles.selectionRow} onPress={() => openPractice(exercise.id)}>
                <Text style={styles.selectionText}>{exercise.focusPoint}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowSelection(false)}>
              <Text style={styles.backLink}>חזרה</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.buttonColumn}>
            <Pressable style={styles.primaryButton} onPress={handlePracticePress}>
              <Text style={styles.primaryButtonText}>תרגל הצלחה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={continueToTask}>
              <Text style={styles.secondaryButtonText}>דלג והמשך למשימה</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 19, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  taskName: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 24 },
  buttonColumn: { gap: 12 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 16 },
  selectionList: { gap: 10 },
  selectionRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  selectionText: { fontSize: 15, textAlign: "right", color: "#222" },
  backLink: { color: "#666", fontSize: 14, textAlign: "right", marginTop: 8 },
});

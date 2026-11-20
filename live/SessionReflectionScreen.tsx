import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { getTask } from "../data/storage.ts";
import { saveNewTaskReflection } from "../data/taskReflection.ts";

/**
 * live/SessionReflectionScreen.tsx (route /tasks/[id]/reflect)
 *
 * Productivity roadmap, Stage X (historical): "after a task session,
 * ask a minimal optional reflection... keep this short and skippable.
 * Do not turn every task session into a long questionnaire." Reached
 * once a task is marked completed (live/ActiveTaskScreen.tsx's
 * handleComplete/finishIdentityInsight) -- never forced to answer
 * anything, but no longer skippable as a NAVIGATION step: alarm-timer
 * integration task, requirement 6, "at completion, the appropriate
 * reflection appears, then automatic transition to the next task" --
 * both "שמירה" and "דלג" below advance to whatever's next, via
 * goToPostTaskReward below.
 *
 * Unified ARC & Productivity Update task, requirement 5 ("SIMPLIFY
 * POST-TASK REFLECTION"): this screen now asks exactly ONE optional
 * question -- "לאיזה חלק מהמשימה הכי התחברתי?" -- "to help users
 * remember the most meaningful or enjoyable part of the task without
 * adding cognitive load." The three previous questions ("חזרת למשימה
 * אחר כך?" / "מה עזר?" / "מה כדאי לחזור עליו בפעם הבאה?" -- the
 * `session_reflection` TaskJournalEntry's own
 * reflectionReturnedAfterArc/reflectionWhatHelped/reflectionWhatToReuse
 * fields) are gone from this screen entirely; appendTaskJournalEntry
 * is no longer called from here at all. Nothing is deleted or
 * migrated: TaskJournalEntry's own type/fields/storage
 * (data/taskJournal.ts) are completely untouched, and every
 * historical "session_reflection" entry a trainee already saved stays
 * exactly as it was, fully readable -- this screen simply never
 * writes a new one going forward.
 *
 * The one remaining question reuses the EXISTING single-field
 * TaskReflection model (data/taskReflection.ts) that the former "מה
 * למדת מהמשימה הזאת?" question already saved against -- "save the
 * response to the completed task occurrence" is exactly what
 * saveNewTaskReflection already does (one TaskReflection record per
 * save, taskId-scoped, fully historical/editable/deletable elsewhere
 * in the app), so only the question's own TEXT changes, never the
 * underlying field, its persistence, or its reader
 * (getLatestReflectionTextForTask, which still feeds the task's own
 * alarm notification exactly as before). Saving with the field left
 * blank is already a no-op there (saveNewTaskReflection trims and
 * returns null for empty text) -- "allow immediate completion without
 * answering" needs no extra guard here.
 */
export default function SessionReflectionScreen({
  taskId,
  continuousRoutineSummary = false,
  combinedSmiles = null,
}: {
  taskId: string;
  continuousRoutineSummary?: boolean;
  /** Unified ARC & Productivity Update task, requirement 9: only meaningful when continuousRoutineSummary is true -- the combined smile total earned across the WHOLE continuous routine (never just this last task), to display on the one shared reward screen instead of going straight home. */
  combinedSmiles?: number | null;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [favoritePartText, setFavoritePartText] = useState("");
  /**
   * Task Completion Navigation fix (follow-up hardening): a plain
   * `useState` guard wouldn't actually stop a rapid double-tap on
   * "שמירה" either, since its setter's new value is only visible
   * starting the NEXT render -- a second tap that fires before that
   * render lands would still read the old value. A ref is checked and
   * set synchronously, before anything else in finish() runs, so it
   * really is the first call that wins, never a second write.
   */
  const finishingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  // Unified ARC & Productivity Update task, requirement 9: "one
  // combined smile-reward experience at the end" -- a continuous
  // routine's own one summary reflection now also opens the SAME
  // shared post-task-reward screen every other completion path uses
  // (never a second, duplicated reward screen), passing the
  // routine's own combined smile total through combinedSmiles so it
  // displays the WHOLE routine's earnings, never just this last
  // task's own (possibly already-recorded-elsewhere, now idempotent)
  // share. source="today" there returns straight home once finished,
  // matching what this branch used to do unconditionally.
  function goToPostTaskReward() {
    if (continuousRoutineSummary) {
      router.replace({
        pathname: "/tasks/[id]/post-task-reward",
        params: { id: taskId, source: "today", combinedSmiles: combinedSmiles !== null ? String(combinedSmiles) : undefined },
      });
      return;
    }
    router.replace({ pathname: "/tasks/[id]/post-task-reward", params: { id: taskId } });
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await saveNewTaskReflection(taskId, favoritePartText, new Date());
    goToPostTaskReward();
  }

  if (!task) {
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
        <Text style={styles.title}>{continuousRoutineSummary ? "רפלקציה מסכמת לשגרה (רשות)" : "רפלקציה קצרה (רשות)"}</Text>

        <Text style={styles.question}>לאיזה חלק מהמשימה הכי התחברתי?</Text>
        <TextInput style={styles.textInput} value={favoritePartText} onChangeText={setFavoritePartText} textAlign="right" multiline />

        <Pressable style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>שמירה</Text>
        </Pressable>
        <Pressable style={styles.skipLink} onPress={goToPostTaskReward}>
          <Text style={styles.skipLinkText}>דלג</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 14, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 50 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { marginTop: 14, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
});

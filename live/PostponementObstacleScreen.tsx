import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { createPostponementObstacleOutcome, generatePostponementObstacleOutcomeId, type PostponementObstacleReason } from "../arc/postponementObstacle.ts";
import { getTask, upsertPostponementObstacleOutcome } from "../data/storage.ts";

const REASON_LABELS: Record<PostponementObstacleReason, string> = {
  emotional: "מצב רגשי",
  rest: "רצון לנוח",
  smaller_task: "הקטנת המשימה",
};

/**
 * live/PostponementObstacleScreen.tsx (route /tasks/[id]/postpone-obstacle)
 *
 * Smart Postponement Flow, requirement 2: the dedicated screen the
 * notification's own "דחייה" action (and the full-screen alarm UI's
 * matching button -- data/taskAlarm.ts's ACTION_POSTPONE_OBSTACLE)
 * opens DIRECTLY, with no dashboard/planning screen in between.
 * "מה מונע ממך להתחיל את המשימה?" plus exactly three large options,
 * one decision at a time -- never a longer questionnaire.
 *
 * Deliberately separate from, and never replacing, live/PostponementScreen.tsx
 * (/tasks/[id]/postpone) -- that detailed reason/category/return-time
 * flow is still reachable exactly as before from Task LIVE's own
 * "דחייה" button and Today's "openPostpone" card action. This screen
 * is reached ONLY from the alarm's own postpone action.
 *
 * Each option creates its own PostponementObstacleOutcome record FIRST
 * (so "the user picked this reason" is recorded even if they abandon
 * the flow immediately after), then routes to the matching
 * intervention -- reusing the EXISTING ARC LIVE flow for "emotional"
 * (never a second ARC implementation), a new minimal rest screen for
 * "rest", and a new minimal smaller-task screen for "smaller_task".
 */
export default function PostponementObstacleScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId]),
  );

  async function choose(reason: PostponementObstacleReason) {
    const now = new Date().toISOString();
    const outcome = createPostponementObstacleOutcome(generatePostponementObstacleOutcomeId(), taskId, reason, now);
    await upsertPostponementObstacleOutcome(outcome);

    if (reason === "emotional") {
      // Unified Emotional Check-In and Task Postponement System,
      // section 3, Option B: the two-smiley Full/Shortened ARC choice,
      // the SAME shared routing (data/emotionalCheckInRouting.ts) the
      // Home screen/Android widget use -- never the generic
      // spontaneous/full/mini ARC-window chooser this branch used to
      // open (that chooser remains fully intact at its own existing
      // entry point, a task's optional arcWindowMinutesBefore window).
      // Whichever smiley is tapped there links the ARC session to THIS
      // task (never standalone), so completing it already returns here
      // -- the exact same "transition" menu behavior arc-window's own
      // doc used to describe, now reached one screen later.
      router.replace({ pathname: "/tasks/[id]/postpone-emotional", params: { id: taskId, outcomeId: outcome.id } });
      return;
    }
    if (reason === "rest") {
      router.replace({ pathname: "/tasks/[id]/postpone-rest", params: { id: taskId, outcomeId: outcome.id } });
      return;
    }
    router.replace({ pathname: "/tasks/[id]/postpone-smaller", params: { id: taskId, outcomeId: outcome.id } });
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
        <Text style={styles.taskName}>{task.title}</Text>
        <Text style={styles.title}>מה מונע ממך להתחיל את המשימה?</Text>

        <Pressable style={styles.optionCard} onPress={() => choose("emotional")}>
          <Text style={styles.optionTitle}>{REASON_LABELS.emotional}</Text>
        </Pressable>
        <Pressable style={styles.optionCard} onPress={() => choose("rest")}>
          <Text style={styles.optionTitle}>{REASON_LABELS.rest}</Text>
        </Pressable>
        <Pressable style={styles.optionCard} onPress={() => choose("smaller_task")}>
          <Text style={styles.optionTitle}>{REASON_LABELS.smaller_task}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  taskName: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 24 },
  optionCard: { borderWidth: 2, borderColor: "#0a7ea4", borderRadius: 14, paddingVertical: 24, paddingHorizontal: 18, alignItems: "flex-end", marginBottom: 16 },
  optionTitle: { color: "#0a7ea4", fontSize: 19, fontWeight: "700" },
});

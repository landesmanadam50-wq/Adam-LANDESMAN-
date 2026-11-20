import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { getTask } from "../data/storage.ts";
import { openFullArc, openShortenedArc } from "../data/emotionalCheckInRouting.ts";

/**
 * live/PostponementEmotionalScreen.tsx (route /tasks/[id]/postpone-emotional)
 *
 * Unified Emotional Check-In and Task Postponement System, section 3,
 * Option B ("❤️ מצב רגשי"): the SAME two smiley choices as ARCHI
 * Home/the Android widget -- 😟 פחות טוב opens Full ARC, 🙂 סבבה opens
 * Shortened ARC -- routed through the exact same shared
 * data/emotionalCheckInRouting.ts module, never a second decision
 * mechanism. `taskId` is passed straight through (never re-resolved),
 * so the ARC session is linked to THIS task and returns to it when it
 * completes, exactly the existing arc-window/"צריך ARC" behavior
 * (live/NewArcLiveScreen.tsx) already guarantees for a real taskId --
 * no new "return to original task" code needed.
 *
 * Replaces this flow's own previous direct jump to
 * live/ArcWindowScreen.tsx's generic spontaneous/full/mini chooser --
 * that chooser is still fully intact and reachable from its own
 * existing entry points (a task's OPTIONAL arcWindowMinutesBefore),
 * just no longer what "מצב רגשי" here opens, since the spec now
 * requires exactly these two smileys at this exact point.
 */
export default function PostponementEmotionalScreen({ taskId }: { taskId: string; outcomeId?: string }) {
  const [task, setTask] = useState<Task | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId]),
  );

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
      <View style={styles.content}>
        <Text style={styles.taskName}>{task.title}</Text>
        <Text style={styles.title}>איך אתה מרגיש כרגע?</Text>
        <View style={styles.row}>
          <Pressable style={styles.smileyButton} onPress={() => openFullArc(taskId)}>
            <Text style={styles.emoji}>😟</Text>
            <Text style={styles.label}>פחות טוב</Text>
          </Pressable>
          <Pressable style={styles.smileyButton} onPress={() => openShortenedArc(taskId)}>
            <Text style={styles.emoji}>🙂</Text>
            <Text style={styles.label}>סבבה</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  taskName: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  row: { flexDirection: "row-reverse", gap: 12 },
  smileyButton: { flex: 1, alignItems: "center", borderWidth: 2, borderColor: "#0a7ea4", borderRadius: 14, paddingVertical: 24 },
  emoji: { fontSize: 36 },
  label: { color: "#0a7ea4", fontSize: 16, fontWeight: "700", marginTop: 8 },
});

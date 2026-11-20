import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { loadArcLearningTopics, upsertTask } from "../data/storage.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";

/**
 * build/ArcLearningScheduleReviewScreen.tsx (route /arc-learning/schedule-review)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * sections 7+8 ("users create recurring review blocks"/"add individual
 * review tasks... choose review date, change start time/duration"): the
 * ONE creation entry point for a review Task, serving BOTH the fixed
 * weekly routine and flexible daily planning -- exactly like ARC Gym's
 * own scheduleTraining() precedent (build/ArcGymSituationScreen.tsx), it
 * creates the Task then opens the EXISTING generic task editor
 * (/tasks/[id]/edit) for date/time/duration/recurrence, never a second,
 * parallel scheduling form. The editor's own recurring-weekday picker
 * (already built) is what lets the trainee choose "recurring" (a fixed
 * weekly block) vs "once" (a flexible daily, ad-hoc task) -- this screen
 * never needs to know which.
 */
export default function ArcLearningScheduleReviewScreen() {
  const [topics, setTopics] = useState<ArcLearningTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcLearningTopics().then(setTopics);
    }, [])
  );

  async function schedule() {
    const now = new Date().toISOString();
    const topicTitle = selectedTopicId ? topics.find((topic) => topic.id === selectedTopicId)?.title ?? "" : "";
    const title = topicTitle ? `ARC Learning: סקירת תובנות (${topicTitle})` : "ARC Learning: סקירת תובנות";
    const task = {
      ...createEmptyTask(generateTaskId(), title, "לשלוף ולחזור על תובנות שהגיע זמנן", now),
      taskKind: "arcLearningReview" as const,
      arcLearningReviewTopicId: selectedTopicId,
    };
    await upsertTask(task);
    await reconcileTaskAlarms();
    router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תזמון סקירת תובנות</Text>
        <Text style={styles.subtitle}>בחר נושא לסקירה, או כל הנושאים, ולאחר מכן בחר יום/שעה/חזרה בעריכת המשימה.</Text>

        <Pressable style={[styles.optionCard, selectedTopicId === null && styles.optionCardSelected]} onPress={() => setSelectedTopicId(null)}>
          <Text style={[styles.optionText, selectedTopicId === null && styles.optionTextSelected]}>כל הנושאים</Text>
        </Pressable>

        {topics.map((topic) => (
          <Pressable
            key={topic.id}
            style={[styles.optionCard, selectedTopicId === topic.id && styles.optionCardSelected]}
            onPress={() => setSelectedTopicId(topic.id)}
          >
            <Text style={[styles.optionText, selectedTopicId === topic.id && styles.optionTextSelected]}>{topic.title}</Text>
          </Pressable>
        ))}

        <Pressable style={styles.primaryButton} onPress={schedule}>
          <Text style={styles.primaryButtonText}>תזמן סקירה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 10 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  subtitle: { fontSize: 13, color: "#666", textAlign: "right", marginBottom: 8 },
  optionCard: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "flex-end" },
  optionCardSelected: { backgroundColor: "#0a7ea4" },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600", textAlign: "right" },
  optionTextSelected: { color: "#fff" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

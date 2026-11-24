import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { isArcLearningInsightReadyForRecall, resolveAnsweredArcLearningExplanationKinds } from "../arc/arcLearningInsight.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { createArcLearningReviewSchedule } from "../arc/arcLearningReview.ts";
import type { ArcLearningReviewSchedule } from "../arc/arcLearningReview.ts";
import { postponeArcReview, restoreAutomaticArcReviewSchedule, setArcReviewIntervalLadder, setArcReviewScheduleMode } from "../arc/spacedRepetition.ts";
import type { ArcReviewScheduleMode } from "../arc/spacedRepetition.ts";
import {
  deleteArcLearningInsightEntry,
  loadArcLearningInsights,
  loadArcLearningReviewSchedules,
  loadArcLearningTopics,
  upsertArcLearningReviewScheduleEntry,
} from "../data/storage.ts";
import ArcReviewScheduleControls from "./components/ArcReviewScheduleControls.tsx";

const EXPLANATION_LABELS: Record<string, string> = {
  meaning: "מה זה אומר?",
  reason: "למה?",
  mechanism: "איך?",
};

/**
 * build/ArcLearningInsightDetailScreen.tsx (route /arc-learning/insight/[id])
 */
export default function ArcLearningInsightDetailScreen({ id }: { id: string }) {
  const [insight, setInsight] = useState<ArcLearningInsight | null>(null);
  const [topic, setTopic] = useState<ArcLearningTopic | null>(null);
  const [schedule, setSchedule] = useState<ArcLearningReviewSchedule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcLearningInsights(), loadArcLearningTopics(), loadArcLearningReviewSchedules()]).then(([insights, topics, schedules]) => {
        const found = insights.find((candidate) => candidate.id === id) ?? null;
        setInsight(found);
        setTopic(found?.topicId ? topics.find((candidate) => candidate.id === found.topicId) ?? null : null);
        setSchedule(schedules.find((candidate) => candidate.insightId === id) ?? createArcLearningReviewSchedule(id, new Date().toISOString()));
      });
    }, [id])
  );

  async function handleDelete() {
    await deleteArcLearningInsightEntry(id);
    setConfirmDelete(false);
    router.replace("/arc-learning/library");
  }

  async function persistSchedule(next: ArcLearningReviewSchedule) {
    setSchedule(next);
    await upsertArcLearningReviewScheduleEntry(next);
  }

  function handleSetMode(mode: ArcReviewScheduleMode) {
    if (!schedule) return;
    persistSchedule(setArcReviewScheduleMode(schedule, mode, new Date().toISOString()));
  }

  function handleSetLadder(ladder: number[]) {
    if (!schedule) return;
    persistSchedule(setArcReviewIntervalLadder(schedule, ladder, new Date().toISOString()));
  }

  function handlePostpone(newDueAtIso: string) {
    if (!schedule) return;
    persistSchedule(postponeArcReview(schedule, newDueAtIso, new Date().toISOString()));
  }

  function handleRestoreAutomatic() {
    if (!schedule) return;
    persistSchedule(restoreAutomaticArcReviewSchedule(schedule, new Date().toISOString()));
  }

  if (!insight) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const answeredKinds = resolveAnsweredArcLearningExplanationKinds(insight);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {topic && <Text style={styles.topicLabel}>{topic.title}</Text>}
        <Text style={styles.mainSentence}>{insight.mainSentence ?? insight.rawText}</Text>

        {answeredKinds.map((kind) => (
          <View key={kind} style={styles.answerBlock}>
            <Text style={styles.answerLabel}>{EXPLANATION_LABELS[kind]}</Text>
            <Text style={styles.answerText}>{insight[kind === "meaning" ? "meaningAnswer" : kind === "reason" ? "reasonAnswer" : "mechanismAnswer"]}</Text>
          </View>
        ))}

        {insight.mentalImages.length > 0 && (
          <View style={styles.answerBlock}>
            <Text style={styles.answerLabel}>דימויים מנטליים</Text>
            {insight.mentalImages.map((image, index) => (
              <Text key={`${image}-${index}`} style={styles.answerText}>
                • {image}
              </Text>
            ))}
          </View>
        )}

        <Pressable onPress={() => router.push({ pathname: "/arc-learning/insight/[id]/edit", params: { id: insight.id } })}>
          <Text style={styles.linkText}>ערוך תובנה</Text>
        </Pressable>

        {/* ARC Reminders task, Phase 5: "remind me of this" entry point into Active Recall. */}
        <Pressable onPress={() => router.push({ pathname: "/arc-reminders", params: { recallSourceKind: "learning_material", recallSourceId: insight.id } })}>
          <Text style={styles.linkText}>+ תזכורת זכירה מהתובנה הזו</Text>
        </Pressable>

        {isArcLearningInsightReadyForRecall(insight) && (
          <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: "/arc-learning/insight/[id]/edit", params: { id: insight.id } })}>
            <Text style={styles.primaryButtonText}>תרגול שליפה</Text>
          </Pressable>
        )}

        {schedule && (
          <ArcReviewScheduleControls
            schedule={schedule}
            onSetMode={handleSetMode}
            onSetLadder={handleSetLadder}
            onPostpone={handlePostpone}
            onRestoreAutomatic={handleRestoreAutomatic}
          />
        )}

        <Pressable style={styles.deleteButton} onPress={() => setConfirmDelete(true)}>
          <Text style={styles.deleteButtonText}>מחיקת תובנה</Text>
        </Pressable>
      </ScrollView>

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את התובנה הזאת?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.primaryButton, styles.modalButton]} onPress={handleDelete}>
                <Text style={styles.primaryButtonText}>מחיקה</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  topicLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", fontWeight: "700" },
  mainSentence: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  answerBlock: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 14, gap: 4 },
  answerLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", fontWeight: "700" },
  answerText: { fontSize: 14, textAlign: "right", color: "#333" },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  deleteButton: { borderWidth: 1, borderColor: "#b00020", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  deleteButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0, marginTop: 0, paddingHorizontal: 20 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
});

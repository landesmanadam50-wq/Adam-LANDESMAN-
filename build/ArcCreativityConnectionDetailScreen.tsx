import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { ArcCreativityConnection, ArcCreativityConnectionClassification } from "../arc/arcCreativityConnection.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { createArcCreativityReviewSchedule } from "../arc/arcCreativityReview.ts";
import type { ArcCreativityReviewSchedule } from "../arc/arcCreativityReview.ts";
import { postponeArcReview, restoreAutomaticArcReviewSchedule, setArcReviewIntervalLadder, setArcReviewScheduleMode } from "../arc/spacedRepetition.ts";
import type { ArcReviewScheduleMode } from "../arc/spacedRepetition.ts";
import {
  loadArcCreativityConnections,
  loadArcCreativityReviewSchedules,
  loadArcLearningInsights,
  upsertArcCreativityReviewScheduleEntry,
} from "../data/storage.ts";
import ArcReviewScheduleControls from "./components/ArcReviewScheduleControls.tsx";

const CLASSIFICATION_LABELS: Record<ArcCreativityConnectionClassification, string> = {
  evidence_supported: "מבוסס על עדות",
  possible: "קשר אפשרי",
  creative_analogy: "אנלוגיה יצירתית",
  no_clear_connection: "אין קשר ברור",
};

/**
 * build/ArcCreativityConnectionDetailScreen.tsx (route /arc-creativity/connections/[id])
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 6: read-only view of one saved connection plus its own
 * editable spaced-repetition schedule -- the connection equivalent of
 * build/ArcLearningInsightDetailScreen.tsx's schedule section.
 */
export default function ArcCreativityConnectionDetailScreen({ id }: { id: string }) {
  const [connection, setConnection] = useState<ArcCreativityConnection | null>(null);
  const [insights, setInsights] = useState<ArcLearningInsight[]>([]);
  const [schedule, setSchedule] = useState<ArcCreativityReviewSchedule | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcCreativityConnections(), loadArcLearningInsights(), loadArcCreativityReviewSchedules()]).then(
        ([connections, loadedInsights, schedules]) => {
          const found = connections.find((candidate) => candidate.id === id) ?? null;
          setConnection(found);
          setInsights(loadedInsights);
          setSchedule(schedules.find((candidate) => candidate.connectionId === id) ?? createArcCreativityReviewSchedule(id, new Date().toISOString()));
        }
      );
    }, [id])
  );

  async function persistSchedule(next: ArcCreativityReviewSchedule) {
    setSchedule(next);
    await upsertArcCreativityReviewScheduleEntry(next);
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

  function insightLabel(insightId: string): string {
    const insight = insights.find((candidate) => candidate.id === insightId);
    return insight ? insight.mainSentence ?? insight.rawText : "תובנה לא ידועה";
  }

  if (!connection) {
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
        <Text style={styles.classification}>{CLASSIFICATION_LABELS[connection.classification]}</Text>
        <Text style={styles.relationship}>{connection.relationship}</Text>
        <Text style={styles.pairText}>
          {insightLabel(connection.insightIdA)} ⇄ {insightLabel(connection.insightIdB)}
        </Text>

        {connection.userExplanation && (
          <View style={styles.answerBlock}>
            <Text style={styles.answerLabel}>ההסבר העצמי שלך</Text>
            <Text style={styles.answerText}>{connection.userExplanation}</Text>
          </View>
        )}

        {connection.newPrincipleInsightText && (
          <View style={styles.answerBlock}>
            <Text style={styles.answerLabel}>עיקרון/רעיון חדש</Text>
            <Text style={styles.answerText}>{connection.newPrincipleInsightText}</Text>
          </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  classification: { fontSize: 12, color: "#6A1B9A", textAlign: "right", fontWeight: "700" },
  relationship: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  pairText: { fontSize: 14, color: "#666", textAlign: "right" },
  answerBlock: { backgroundColor: "#F8F3FB", borderRadius: 10, padding: 14, gap: 4 },
  answerLabel: { fontSize: 12, color: "#6A1B9A", textAlign: "right", fontWeight: "700" },
  answerText: { fontSize: 14, textAlign: "right", color: "#333" },
});

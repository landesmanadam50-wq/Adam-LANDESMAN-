import { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { isArcLearningInsightReadyForRecall } from "../arc/arcLearningInsight.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import type { ArcLearningReviewSchedule } from "../arc/arcLearningReview.ts";
import { resolveScheduleDueState } from "../arc/spacedRepetition.ts";
import type { ArcReviewDueState } from "../arc/spacedRepetition.ts";
import { loadArcLearningInsights, loadArcLearningReviewSchedules } from "../data/storage.ts";

const SECTION_TITLES: Record<ArcReviewDueState, string> = {
  overdue: "⏰ באיחור",
  due_today: "📌 מגיע היום",
  upcoming: "🗓️ בהמשך",
};

interface Row {
  insight: ArcLearningInsight;
  dueState: ArcReviewDueState;
}

/**
 * build/ArcLearningReviewOverviewScreen.tsx (route /arc-learning/overview)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 6 ("view overdue/upcoming reviews"): every learning-ready
 * insight, grouped by due state -- a never-reviewed insight is always
 * treated as overdue (immediately eligible for its initial recall, same
 * rule arc/arcLearningReview.ts's own resolveDueArcLearningInsightIds
 * uses), never a second, independently-computed due rule.
 */
export default function ArcLearningReviewOverviewScreen() {
  const [insights, setInsights] = useState<ArcLearningInsight[]>([]);
  const [schedules, setSchedules] = useState<ArcLearningReviewSchedule[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcLearningInsights(), loadArcLearningReviewSchedules()]).then(([loadedInsights, loadedSchedules]) => {
        setInsights(loadedInsights);
        setSchedules(loadedSchedules);
      });
    }, [])
  );

  const sections = useMemo(() => {
    const rows: Row[] = insights.filter(isArcLearningInsightReadyForRecall).map((insight) => {
      const schedule = schedules.find((candidate) => candidate.insightId === insight.id);
      const dueState: ArcReviewDueState = schedule ? resolveScheduleDueState(schedule) : "overdue";
      return { insight, dueState };
    });
    return (["overdue", "due_today", "upcoming"] as ArcReviewDueState[])
      .map((dueState) => ({ title: SECTION_TITLES[dueState], data: rows.filter((row) => row.dueState === dueState) }))
      .filter((section) => section.data.length > 0);
  }, [insights, schedules]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <SectionList
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(row) => row.insight.id}
        ListEmptyComponent={<Text style={styles.hint}>אין תובנות מוכנות לסקירה עדיין.</Text>}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push({ pathname: "/arc-learning/insight/[id]", params: { id: item.insight.id } })}>
            <Text style={styles.cardText}>{item.insight.mainSentence ?? item.insight.rawText}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  sectionTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginTop: 12, marginBottom: 6 },
  card: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 12, marginBottom: 8 },
  cardText: { fontSize: 14, textAlign: "right" },
});

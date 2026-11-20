import { useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcCreativityConnection } from "../arc/arcCreativityConnection.ts";
import type { ArcCreativityReviewSchedule } from "../arc/arcCreativityReview.ts";
import { resolveScheduleDueState } from "../arc/spacedRepetition.ts";
import type { ArcReviewDueState } from "../arc/spacedRepetition.ts";
import { loadArcCreativityConnections, loadArcCreativityReviewSchedules } from "../data/storage.ts";

const SECTION_TITLES: Record<ArcReviewDueState, string> = {
  overdue: "⏰ באיחור",
  due_today: "📌 מגיע היום",
  upcoming: "🗓️ בהמשך",
};

interface Row {
  connection: ArcCreativityConnection;
  dueState: ArcReviewDueState;
}

/**
 * build/ArcCreativityReviewOverviewScreen.tsx (route /arc-creativity/overview)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 6 ("view overdue/upcoming reviews"): the connection-recall
 * equivalent of build/ArcLearningReviewOverviewScreen.tsx -- every saved
 * connection, grouped by due state. A never-reviewed connection is
 * always overdue, same rule arc/arcCreativityReview.ts's own
 * resolveDueArcCreativityConnectionIds uses.
 */
export default function ArcCreativityReviewOverviewScreen() {
  const [connections, setConnections] = useState<ArcCreativityConnection[]>([]);
  const [schedules, setSchedules] = useState<ArcCreativityReviewSchedule[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcCreativityConnections(), loadArcCreativityReviewSchedules()]).then(([loadedConnections, loadedSchedules]) => {
        setConnections(loadedConnections);
        setSchedules(loadedSchedules);
      });
    }, [])
  );

  const sections = useMemo(() => {
    const rows: Row[] = connections.map((connection) => {
      const schedule = schedules.find((candidate) => candidate.connectionId === connection.id);
      const dueState: ArcReviewDueState = schedule ? resolveScheduleDueState(schedule) : "overdue";
      return { connection, dueState };
    });
    return (["overdue", "due_today", "upcoming"] as ArcReviewDueState[])
      .map((dueState) => ({ title: SECTION_TITLES[dueState], data: rows.filter((row) => row.dueState === dueState) }))
      .filter((section) => section.data.length > 0);
  }, [connections, schedules]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <SectionList
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(row) => row.connection.id}
        ListEmptyComponent={<Text style={styles.hint}>אין עדיין קשרים שמורים לסקירה.</Text>}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push({ pathname: "/arc-creativity/connections/[id]", params: { id: item.connection.id } })}>
            <Text style={styles.cardText}>{item.connection.relationship}</Text>
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
  sectionTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#6A1B9A", marginTop: 12, marginBottom: 6 },
  card: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 10, padding: 12, marginBottom: 8 },
  cardText: { fontSize: 14, textAlign: "right" },
});

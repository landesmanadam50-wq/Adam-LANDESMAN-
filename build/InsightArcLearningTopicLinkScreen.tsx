import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { linkArcLearningTopicToInsight, unlinkArcLearningTopicFromInsight } from "../arc/arcInsightBelief.ts";
import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { loadArcInsights, loadArcLearningTopics, upsertArcInsight } from "../data/storage.ts";

/**
 * build/InsightArcLearningTopicLinkScreen.tsx (route /insights/[id]/link-topics)
 *
 * ARCHI -- Insight Collection x ARC Learning linking task, section 1/2:
 * "קישור ל-ARC Learning" -- pick (or un-pick) any number of the already-
 * existing ArcLearningTopic records this insight belongs to. A tap
 * toggles the link immediately and persists it right away (same
 * instant-toggle convention as every other goal/topic checkbox-list
 * picker in this app, e.g. build/ArcGymMemoryDetailScreen.tsx's own
 * "שיוך למטרות" section) -- there is no separate "save" step, so a
 * link can be added or removed at any time, exactly as required.
 *
 * "+ נושא חדש" reuses the EXISTING topic editor (/arc-learning/topics/
 * [id]/edit, id="new") rather than a second topic-creation mechanism --
 * the brand-new topic simply appears in this same list on return,
 * unlinked, ready to be tapped like any other.
 *
 * Central Insight Collection x ARC Learning task, section 6:
 * `nextIds`, when given (from InsightsCollectionScreen's own "בחירה
 * מרובה" multi-select), is the remaining batch of insight ids still
 * waiting to be organized -- "סיום" here re-navigates to this SAME
 * screen for the next one instead of going back, so picking several
 * insights at once walks through each one's own existing one-insight-
 * at-a-time linking screen in turn, never a parallel bulk-linking
 * mechanism. Empty/absent for the normal single-insight entry point
 * (from InsightDetailScreen), where "סיום" behaves exactly as before.
 */
export default function InsightArcLearningTopicLinkScreen({ id, nextIds = [] }: { id: string; nextIds?: string[] }) {
  const [insight, setInsight] = useState<ArcInsight | null | undefined>(undefined);
  const [topics, setTopics] = useState<ArcLearningTopic[]>([]);

  const reload = useCallback(() => {
    Promise.all([loadArcInsights(), loadArcLearningTopics()]).then(([insights, allTopics]) => {
      setInsight(insights.find((candidate) => candidate.id === id) ?? null);
      setTopics([...allTopics].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    });
  }, [id]);

  useFocusEffect(reload);

  async function toggleTopicLink(topicId: string) {
    if (!insight) return;
    const linked = insight.arcLearningTopicIds.includes(topicId);
    const updated = linked ? unlinkArcLearningTopicFromInsight(insight, topicId) : linkArcLearningTopicToInsight(insight, topicId);
    setInsight(updated);
    await upsertArcInsight(updated);
  }

  if (insight === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (insight === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>התובנה לא נמצאה.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>קישור ל-ARC Learning</Text>
        <Text style={styles.insightPreview}>{insight.text}</Text>
        <Text style={styles.hint}>בחר לאילו נושאי למידה התובנה הזו שייכת. ניתן לבחור יותר מנושא אחד, ולהוסיף או להסיר שיוכים בכל שלב.</Text>
      </View>

      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.hint}>אין עדיין נושאי למידה. אפשר ליצור נושא חדש למטה.</Text>}
        renderItem={({ item }) => {
          const linked = insight.arcLearningTopicIds.includes(item.id);
          return (
            <Pressable style={styles.row} onPress={() => toggleTopicLink(item.id)}>
              <Text style={[styles.rowText, linked && styles.rowTextLinked]}>{item.title}</Text>
              <Text style={styles.checkbox}>{linked ? "☑" : "☐"}</Text>
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/arc-learning/topics/[id]/edit", params: { id: "new" } })}>
        <Text style={styles.secondaryButtonText}>+ נושא חדש</Text>
      </Pressable>
      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          const [next, ...rest] = nextIds;
          if (next) {
            router.replace({ pathname: "/insights/[id]/link-topics", params: { id: next, ...(rest.length ? { nextIds: rest.join(",") } : {}) } });
          } else {
            router.back();
          }
        }}
      >
        <Text style={styles.primaryButtonText}>{nextIds.length > 0 ? `הבא (${nextIds.length} נותרו)` : "סיום"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  header: { paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  insightPreview: { fontSize: 14, color: "#555", textAlign: "right", marginTop: 8 },
  hint: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 10 },
  listContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, gap: 6 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  rowText: { fontSize: 15, textAlign: "right", color: "#222" },
  rowTextLinked: { color: "#0a7ea4", fontWeight: "700" },
  checkbox: { fontSize: 16, color: "#0a7ea4" },
  secondaryButton: { marginHorizontal: 20, paddingVertical: 10, alignItems: "flex-end" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  primaryButton: { backgroundColor: "#0a7ea4", marginHorizontal: 20, marginBottom: 20, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

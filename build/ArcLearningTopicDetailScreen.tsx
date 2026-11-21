import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import { resolveArcLearningInsightsForTopic } from "../arc/arcLearningInsight.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { resolveInsightsForArcLearningTopic } from "../arc/arcLearningTopic.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { loadArcInsights, loadArcLearningInsights, loadArcLearningTopics } from "../data/storage.ts";

/**
 * build/ArcLearningTopicDetailScreen.tsx (route /arc-learning/topics/[id])
 *
 * Shows this topic's own title plus every insight linked to it (section
 * 10's own "users can see associated learning topics from ARC Goal"
 * mirrored here in reverse -- "see this topic's own insights").
 */
export default function ArcLearningTopicDetailScreen({ id }: { id: string }) {
  const [topic, setTopic] = useState<ArcLearningTopic | null>(null);
  const [insights, setInsights] = useState<ArcLearningInsight[]>([]);
  const [linkedCollectionInsights, setLinkedCollectionInsights] = useState<ArcInsight[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcLearningTopics(), loadArcLearningInsights(), loadArcInsights()]).then(([topics, allInsights, collectionInsights]) => {
        setTopic(topics.find((candidate) => candidate.id === id) ?? null);
        setInsights(resolveArcLearningInsightsForTopic(allInsights, id));
        // Insight Collection x ARC Learning linking task, requirement 3:
        // "תובנות מקושרות" -- every ArcInsight from the UNRELATED Insight
        // Collection that was linked to this topic, kept in its own
        // separate section below -- never merged into/mistaken for this
        // screen's existing ArcLearningInsight list above.
        setLinkedCollectionInsights(resolveInsightsForArcLearningTopic(collectionInsights, id));
      });
    }, [id])
  );

  if (!topic) {
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
      <View style={styles.header}>
        <Text style={styles.title}>{topic.title}</Text>
        <Pressable onPress={() => router.push({ pathname: "/arc-learning/topics/[id]/edit", params: { id: topic.id } })}>
          <Text style={styles.linkText}>ערוך נושא</Text>
        </Pressable>
      </View>

      {insights.length === 0 && <Text style={styles.hint}>אין עדיין תובנות בנושא הזה.</Text>}

      <FlatList
        data={insights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-learning/insight/[id]", params: { id: item.id } })}>
            <Text style={styles.rowText}>{item.mainSentence ?? item.rawText}</Text>
          </Pressable>
        )}
        ListFooterComponent={
          // Insight Collection x ARC Learning linking task, requirement 3:
          // every ArcInsight (the unrelated Insight Collection) linked to
          // this topic -- its own separate section, opening the ORIGINAL
          // insight at /insights/[id], never a duplicated copy of it here.
          <View style={styles.linkedInsightsSection}>
            <Text style={styles.sectionTitle}>תובנות מקושרות</Text>
            {linkedCollectionInsights.length === 0 && <Text style={styles.hint}>אין תובנות מאוסף התובנות המקושרות לנושא הזה.</Text>}
            {linkedCollectionInsights.map((collectionInsight) => (
              <Pressable key={collectionInsight.id} style={styles.row} onPress={() => router.push({ pathname: "/insights/[id]", params: { id: collectionInsight.id } })}>
                <Text style={styles.rowText}>{collectionInsight.text}</Text>
              </Pressable>
            ))}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  header: { paddingHorizontal: 20, paddingTop: 16, gap: 4 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right" },
  hint: { fontSize: 14, textAlign: "right", color: "#666", paddingHorizontal: 20, marginTop: 10 },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 8 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  rowText: { fontSize: 15, textAlign: "right", color: "#222" },
  linkedInsightsSection: { marginTop: 20, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 2 },
});

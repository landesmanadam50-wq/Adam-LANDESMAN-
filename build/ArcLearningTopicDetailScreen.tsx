import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolveArcLearningInsightsForTopic } from "../arc/arcLearningInsight.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { loadArcLearningInsights, loadArcLearningTopics } from "../data/storage.ts";

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

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcLearningTopics(), loadArcLearningInsights()]).then(([topics, allInsights]) => {
        setTopic(topics.find((candidate) => candidate.id === id) ?? null);
        setInsights(resolveArcLearningInsightsForTopic(allInsights, id));
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
});

import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcCreativityConnection, ArcCreativityConnectionClassification } from "../arc/arcCreativityConnection.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { loadArcCreativityConnections, loadArcLearningInsights } from "../data/storage.ts";

const CLASSIFICATION_LABELS: Record<ArcCreativityConnectionClassification, string> = {
  evidence_supported: "מבוסס על עדות",
  possible: "קשר אפשרי",
  creative_analogy: "אנלוגיה יצירתית",
  no_clear_connection: "אין קשר ברור",
};

/**
 * build/ArcCreativityConnectionListScreen.tsx (route /arc-creativity/connections)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 6: lets the trainee browse every saved connection (across all
 * four modes) and open one to edit its own spaced-repetition schedule --
 * the connection equivalent of build/ArcLearningInsightListScreen.tsx.
 */
export default function ArcCreativityConnectionListScreen() {
  const [connections, setConnections] = useState<ArcCreativityConnection[]>([]);
  const [insights, setInsights] = useState<ArcLearningInsight[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcCreativityConnections(), loadArcLearningInsights()]).then(([loadedConnections, loadedInsights]) => {
        setConnections(loadedConnections);
        setInsights(loadedInsights);
      });
    }, [])
  );

  function insightLabel(insightId: string): string {
    const insight = insights.find((candidate) => candidate.id === insightId);
    return insight ? insight.mainSentence ?? insight.rawText : "תובנה לא ידועה";
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={connections}
        keyExtractor={(connection) => connection.id}
        ListEmptyComponent={<Text style={styles.hint}>אין עדיין קשרים שמורים.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push({ pathname: "/arc-creativity/connections/[id]", params: { id: item.id } })}>
            <Text style={styles.classification}>{CLASSIFICATION_LABELS[item.classification]}</Text>
            <Text style={styles.relationship}>{item.relationship}</Text>
            <Text style={styles.pairText}>
              {insightLabel(item.insightIdA)} ⇄ {insightLabel(item.insightIdB)}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  card: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 12, padding: 14, gap: 4 },
  classification: { fontSize: 12, color: "#6A1B9A", textAlign: "right", fontWeight: "700" },
  relationship: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  pairText: { fontSize: 13, color: "#666", textAlign: "right" },
});

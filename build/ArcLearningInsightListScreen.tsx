import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolveUnfinishedArcLearningInsights } from "../arc/arcLearningInsight.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { loadArcLearningInsights } from "../data/storage.ts";

/**
 * build/ArcLearningInsightListScreen.tsx
 *
 * Shared between two of ARC Learning home's own entries (section 11):
 * "כל התובנות" (mode "all", route /arc-learning/library) and "המשך
 * למידה" (mode "unfinished", route /arc-learning/continue) -- both are
 * "a list of insights, open one to go to it," differing only in which
 * insights are shown, so one component serves both rather than two
 * near-duplicates.
 */
export default function ArcLearningInsightListScreen({ mode }: { mode: "all" | "unfinished" }) {
  const [insights, setInsights] = useState<ArcLearningInsight[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcLearningInsights().then((loaded) => {
        const sorted = [...loaded].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setInsights(mode === "unfinished" ? resolveUnfinishedArcLearningInsights(sorted) : sorted);
      });
    }, [mode])
  );

  function openInsight(insight: ArcLearningInsight) {
    if (mode === "unfinished") {
      router.push({ pathname: "/arc-learning/insight/[id]/edit", params: { id: insight.id } });
      return;
    }
    router.push({ pathname: "/arc-learning/insight/[id]", params: { id: insight.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.title}>{mode === "unfinished" ? "⏩ המשך למידה" : "📖 כל התובנות"}</Text>

      {insights === null && <Text style={styles.hint}>טוען...</Text>}
      {insights !== null && insights.length === 0 && (
        <Text style={styles.hint}>{mode === "unfinished" ? "אין תובנות באמצע תהליך הלמידה." : "עדיין לא נוספו תובנות."}</Text>
      )}

      <FlatList
        data={insights ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openInsight(item)}>
            <Text style={styles.rowText}>{item.mainSentence ?? item.rawText}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", paddingHorizontal: 20, paddingTop: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", paddingHorizontal: 20, marginTop: 10 },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 8 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  rowText: { fontSize: 15, textAlign: "right", color: "#222" },
});

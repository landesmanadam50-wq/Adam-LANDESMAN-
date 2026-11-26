import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { createArcLearningInsightFromArcInsight, generateArcLearningInsightId } from "../arc/arcLearningInsight.ts";
import { loadArcInsights, loadArcLearningInsights, upsertArcLearningInsightEntry } from "../data/storage.ts";

/**
 * build/InsightsCollectionScreen.tsx (route /insights)
 *
 * ARCHI -- Unified Development Specification task, Part 5 ("INSIGHT
 * COLLECTION"): "אוסף תובנות" -- every saved ArcInsight, most recent
 * first, each opening build/InsightDetailScreen.tsx (view/edit/
 * delete/related task/link). A top "+ הוסף תובנה" entry reuses the
 * SAME /insights/new screen Home/Settings use -- never a third
 * insight-entry UI.
 *
 * Central Insight Collection x ARC Learning task, section 6: two badges
 * per row -- "שויך לנושא" (ArcInsight.arcLearningTopicIds.length > 0,
 * the EXISTING per-insight link already reachable from
 * InsightDetailScreen's own "קישור ל-ARC Learning" button/`/insights/
 * [id]/link-topics`) and "ב-ARC Learning" (a promoted ArcLearningInsight
 * already exists, via its own sourceArcInsightId back-reference) --
 * never a second source-of-truth for either state. "בחירה מרובה" lets
 * the trainee pick several insights at once and jump straight to each
 * one's own link-topics screen in turn (never a parallel bulk-linking
 * mechanism duplicating linkArcLearningTopicToInsight's own one-insight-
 * at-a-time contract). "התחל ללמוד" (shown once an insight is topic-
 * organized but not yet promoted) creates exactly one new
 * ArcLearningInsight via createArcLearningInsightFromArcInsight --
 * seeded from this ArcInsight's own text, linked back by
 * sourceArcInsightId, never a disconnected copy -- then opens the
 * existing ARC Learning wizard for it.
 */
export default function InsightsCollectionScreen() {
  const [insights, setInsights] = useState<ArcInsight[]>([]);
  const [learningInsights, setLearningInsights] = useState<ArcLearningInsight[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    Promise.all([loadArcInsights(), loadArcLearningInsights()]).then(([loadedInsights, loadedLearningInsights]) => {
      setInsights([...loadedInsights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLearningInsights(loadedLearningInsights);
    });
  }, []);

  useFocusEffect(reload);

  function resolvePromotedLearningInsightId(arcInsightId: string): string | null {
    return learningInsights.find((candidate) => candidate.sourceArcInsightId === arcInsightId)?.id ?? null;
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function openSelectedOneByOne() {
    const [first, ...rest] = Array.from(selectedIds);
    if (!first) return;
    exitSelectionMode();
    router.push({ pathname: "/insights/[id]/link-topics", params: { id: first, ...(rest.length ? { nextIds: rest.join(",") } : {}) } });
  }

  async function handleStartLearning(insight: ArcInsight) {
    const now = new Date().toISOString();
    const learningInsight = createArcLearningInsightFromArcInsight(generateArcLearningInsightId(), insight.id, insight.text, now);
    await upsertArcLearningInsightEntry(learningInsight);
    router.push({ pathname: "/arc-learning/insight/[id]/edit", params: { id: learningInsight.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>אוסף תובנות</Text>
        <View style={styles.headerButtons}>
          <Pressable style={styles.addButton} onPress={() => setSelectionMode((value) => !value)}>
            <Text style={styles.addButtonText}>{selectionMode ? "ביטול בחירה" : "בחירה מרובה"}</Text>
          </Pressable>
          <Pressable style={styles.addButton} onPress={() => router.push("/insights/new")}>
            <Text style={styles.addButtonText}>+ הוסף תובנה</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={insights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.hint}>אין עדיין תובנות שמורות.</Text>}
        renderItem={({ item }) => {
          const organized = item.arcLearningTopicIds.length > 0;
          const promotedId = resolvePromotedLearningInsightId(item.id);
          return (
            <Pressable
              style={styles.row}
              onPress={() => (selectionMode ? toggleSelected(item.id) : router.push({ pathname: "/insights/[id]", params: { id: item.id } }))}
            >
              <Text style={styles.rowText} numberOfLines={3}>
                {selectionMode ? (selectedIds.has(item.id) ? "☑ " : "☐ ") : ""}
                {item.text}
              </Text>
              <View style={styles.badgeRow}>
                {item.taskId && <Text style={styles.linkedBadge}>🔗 משימה מקושרת</Text>}
                <Text style={organized ? styles.organizedBadge : styles.notOrganizedBadge}>{organized ? "✓ שויך לנושא" : "⚠ לא שויך לנושא"}</Text>
                {promotedId ? <Text style={styles.organizedBadge}>✓ ב-ARC Learning</Text> : null}
              </View>
              {!selectionMode && organized && !promotedId && (
                <Pressable style={styles.startLearningButton} onPress={() => handleStartLearning(item)}>
                  <Text style={styles.startLearningButtonText}>התחל ללמוד</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
      {selectionMode && selectedIds.size > 0 && (
        <Pressable style={styles.bulkActionButton} onPress={openSelectedOneByOne}>
          <Text style={styles.bulkActionButtonText}>שיוך לנושא ({selectedIds.size})</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 10 },
  headerButtons: { flexDirection: "row", gap: 8 },
  title: { fontSize: 20, fontWeight: "700" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingBottom: 90 },
  hint: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 30 },
  row: { backgroundColor: "#F7F9FA", borderRadius: 10, padding: 14, marginBottom: 10 },
  rowText: { fontSize: 15, color: "#222", textAlign: "right", lineHeight: 21 },
  badgeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 },
  linkedBadge: { fontSize: 12, color: "#0a7ea4" },
  organizedBadge: { fontSize: 12, color: "#2e7d32" },
  notOrganizedBadge: { fontSize: 12, color: "#b26a00" },
  startLearningButton: { alignSelf: "flex-end", marginTop: 8, borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  startLearningButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  bulkActionButton: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  bulkActionButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

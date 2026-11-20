import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import { loadArcInsights } from "../data/storage.ts";

/**
 * build/InsightsCollectionScreen.tsx (route /insights)
 *
 * ARCHI -- Unified Development Specification task, Part 5 ("INSIGHT
 * COLLECTION"): "אוסף תובנות" -- every saved ArcInsight, most recent
 * first, each opening build/InsightDetailScreen.tsx (view/edit/
 * delete/related task/link). A top "+ הוסף תובנה" entry reuses the
 * SAME /insights/new screen Home/Settings use -- never a third
 * insight-entry UI.
 */
export default function InsightsCollectionScreen() {
  const [insights, setInsights] = useState<ArcInsight[]>([]);

  const reload = useCallback(() => {
    loadArcInsights().then((loaded) => setInsights([...loaded].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  }, []);

  useFocusEffect(reload);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>אוסף תובנות</Text>
        <Pressable style={styles.addButton} onPress={() => router.push("/insights/new")}>
          <Text style={styles.addButtonText}>+ הוסף תובנה</Text>
        </Pressable>
      </View>
      <FlatList
        data={insights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.hint}>אין עדיין תובנות שמורות.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/insights/[id]", params: { id: item.id } })}>
            <Text style={styles.rowText} numberOfLines={3}>
              {item.text}
            </Text>
            {item.taskId && <Text style={styles.linkedBadge}>🔗 משימה מקושרת</Text>}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: "700" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingBottom: 30 },
  hint: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 30 },
  row: { backgroundColor: "#F7F9FA", borderRadius: 10, padding: 14, marginBottom: 10 },
  rowText: { fontSize: 15, color: "#222", textAlign: "right", lineHeight: 21 },
  linkedBadge: { fontSize: 12, color: "#0a7ea4", textAlign: "right", marginTop: 6 },
});

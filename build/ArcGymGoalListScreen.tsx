import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcGymGoal, ArcGymGoalObjective } from "../arc/arcGymGoal.ts";
import { resolveArcGymGoalObjectiveProgress } from "../arc/arcGymGoal.ts";
import { loadArcGymGoalObjectives, loadArcGymGoals } from "../data/storage.ts";

/**
 * build/ArcGymGoalListScreen.tsx (route /arc-gym/goal)
 *
 * ARC Gym + ARC Goal Integration task: "ARC Goal" / "מטרת ARC"'s own
 * entry screen inside ARC Gym -- lists every saved ArcGymGoal (newest
 * first) with its objective-completion progress, parallel to
 * build/ArcGymResultListScreen.tsx's role for Result exercises. Never
 * gates or requires any OTHER exercise to belong to a goal -- this is
 * purely an additional, optional layer.
 */
export default function ArcGymGoalListScreen() {
  const [goals, setGoals] = useState<ArcGymGoal[] | null>(null);
  const [objectives, setObjectives] = useState<ArcGymGoalObjective[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcGymGoals(), loadArcGymGoalObjectives()]).then(([loadedGoals, loadedObjectives]) => {
        setGoals([...loadedGoals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        setObjectives(loadedObjectives);
      });
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>🎯 מטרות ARC</Text>
        <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/arc-gym/goal/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.addButtonText}>+ מטרה חדשה</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        שכבה אופציונלית מעל תרגילי ARC Gym -- לכל מטרה יש מניפסט משלה, יעדים, משימות מעשיות ותרגילים מקושרים. אין חובה לקשר תרגיל כלשהו למטרה.
      </Text>

      {goals === null && <Text style={styles.hint}>טוען...</Text>}
      {goals !== null && goals.length === 0 && <Text style={styles.hint}>עדיין לא נוספו מטרות ARC.</Text>}

      <FlatList
        data={goals ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const progress = resolveArcGymGoalObjectiveProgress(objectives, item.id);
          return (
            <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-gym/goal/[id]", params: { id: item.id } })}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.description && <Text style={styles.rowDescription}>{item.description}</Text>}
              <Text style={styles.rowProgress}>{progress.total > 0 ? `${progress.completed}/${progress.total} יעדים הושלמו` : "אין יעדים עדיין"}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  subtitle: { fontSize: 13, color: "#666", textAlign: "right", paddingHorizontal: 20, marginTop: 6, marginBottom: 10, lineHeight: 19 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", paddingHorizontal: 20 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowDescription: { fontSize: 13, textAlign: "right", color: "#555", marginTop: 4 },
  rowProgress: { fontSize: 13, textAlign: "right", color: "#777", marginTop: 4 },
});

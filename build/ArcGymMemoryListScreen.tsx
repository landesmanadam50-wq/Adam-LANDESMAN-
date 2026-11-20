import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcGymMemoryExercise } from "../arc/arcGym.ts";
import { loadArcGymMemoryExercises } from "../data/storage.ts";

/**
 * build/ArcGymMemoryListScreen.tsx (route /arc-gym/memory)
 *
 * ARCHI -- Unified Development Specification task, Part 1: the ARC
 * Memory exercise type's own entry screen, parallel to
 * build/ArcGymScreen.tsx's Behaviour-exercise entry -- lists every
 * saved ArcGymMemoryExercise (newest first) with a button to add a
 * new one, each row opening its own detail/training screen.
 */
export default function ArcGymMemoryListScreen() {
  const [exercises, setExercises] = useState<ArcGymMemoryExercise[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcGymMemoryExercises().then((loaded) => setExercises([...loaded].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>🧠 תרגילי זיכרון</Text>
        <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/arc-gym/memory/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.addButtonText}>+ תרגיל חדש</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>אימון זיכרון פרוספקטיבי: &quot;אזכר לעשות X כשיקרה Y&quot; -- ללא טיימר וללא משימה חדשה.</Text>

      {exercises === null && <Text style={styles.hint}>טוען...</Text>}
      {exercises !== null && exercises.length === 0 && <Text style={styles.hint}>עדיין לא נוספו תרגילי זיכרון.</Text>}

      <FlatList
        data={exercises ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-gym/memory/[id]", params: { id: item.id } })}>
            <Text style={styles.rowAction}>{item.actionText}</Text>
            <Text style={styles.rowSituation}>{item.situationText}</Text>
          </Pressable>
        )}
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
  rowAction: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSituation: { fontSize: 13, textAlign: "right", color: "#777", marginTop: 4 },
});

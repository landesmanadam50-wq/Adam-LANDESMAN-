import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcFocusExercise } from "../arc/arcFocusExercise.ts";
import { loadArcFocusExercises } from "../data/storage.ts";

/**
 * build/ArcGymFocusExerciseListScreen.tsx (route /arc-gym/focus-exercise)
 *
 * ARC Gym + ARC Goal Integration task: ARC Focus's own saved/listable
 * exercise configurations -- parallel to build/ArcGymResultListScreen.tsx's
 * role for Result. The existing zero-setup "/arc-gym/arc-focus"
 * quick-start stays completely untouched and reachable from its own
 * card; this is a separate, additional entry point for a trainee who
 * wants to save and reuse a named configuration (and optionally link
 * it to an ArcGymGoal).
 */
export default function ArcGymFocusExerciseListScreen() {
  const [exercises, setExercises] = useState<ArcFocusExercise[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcFocusExercises().then((loaded) => setExercises([...loaded].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>📋 תרגילי Focus שמורים</Text>
        <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/arc-gym/focus-exercise/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.addButtonText}>+ תרגיל חדש</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>תצורות ARC Focus שמורות שאפשר לפתוח שוב ולשייך למטרות ARC. לתרגול מהיר וחד-פעמי אפשר גם להשתמש בכרטיס "ARC Focus" הרגיל.</Text>

      {exercises === null && <Text style={styles.hint}>טוען...</Text>}
      {exercises !== null && exercises.length === 0 && <Text style={styles.hint}>עדיין לא נוספו תרגילי Focus שמורים.</Text>}

      <FlatList
        data={exercises ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-gym/focus-exercise/[id]", params: { id: item.id } })}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowSubtitle}>{`${item.settings.durationMinutes} דק'`}</Text>
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
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSubtitle: { fontSize: 13, color: "#777" },
});

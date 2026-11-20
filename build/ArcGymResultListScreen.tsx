import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcResultExercise } from "../arc/arcResult.ts";
import { loadArcResultExercises } from "../data/storage.ts";

/**
 * build/ArcGymResultListScreen.tsx (route /arc-gym/result)
 *
 * ARCHI -- ARC Result task, section 7: ARC Result's own entry screen
 * inside ARC GYM, parallel to build/ArcGymMemoryListScreen.tsx's role
 * for the Memory exercise type -- lists every saved ArcResultExercise
 * (newest first) with a button to add a new one, each row opening its
 * own detail screen (view/edit/link-to-tasks/practice).
 */
export default function ArcGymResultListScreen() {
  const [exercises, setExercises] = useState<ArcResultExercise[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcResultExercises().then((loaded) => setExercises([...loaded].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>🏆 תרגילי הצלחה (ARC Result)</Text>
        <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/arc-gym/result/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.addButtonText}>+ תרגיל חדש</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>דימיון הצלחה קצר -- נקודת מיקוד, דימיון הצלחה מותאם, משפט הצלחה ושפת גוף תומכת, ללא טיימר. קשר תרגיל למשימה כדי שARCHI יציע אותו באופן אוטומטי (אך תמיד אופציונלי) בזמן הנכון.</Text>

      {exercises === null && <Text style={styles.hint}>טוען...</Text>}
      {exercises !== null && exercises.length === 0 && <Text style={styles.hint}>עדיין לא נוספו תרגילי הצלחה.</Text>}

      <FlatList
        data={exercises ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-gym/result/[id]", params: { id: item.id } })}>
            <Text style={styles.rowFocus}>{item.focusPoint || "(ללא נקודת מיקוד)"}</Text>
            <Text style={styles.rowLinks}>{item.linkedTaskIds.length > 0 ? `מקושר ל-${item.linkedTaskIds.length} משימות` : "לא מקושר לאף משימה"}</Text>
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
  rowFocus: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowLinks: { fontSize: 13, textAlign: "right", color: "#777", marginTop: 4 },
});

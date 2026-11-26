import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcDiaryEntry } from "../arc/arcDiary.ts";
import { resolveArcDiaryEntriesByDateDesc } from "../arc/arcDiary.ts";
import { loadArcDiaryEntries } from "../data/storage.ts";

/**
 * build/ArcDiaryHomeScreen.tsx (route /diary)
 *
 * ARC Diary task, section 5: lists previous entries newest-first ("לצפות
 * ברשומות קודמות"), each row opens it for revisiting/editing
 * (`/diary/[id]`); "+ רשומה חדשה" opens a fresh entry (`/diary/new`).
 */
export default function ArcDiaryHomeScreen() {
  const [entries, setEntries] = useState<ArcDiaryEntry[]>([]);

  const reload = useCallback(() => {
    loadArcDiaryEntries().then((loaded) => setEntries(resolveArcDiaryEntriesByDateDesc(loaded)));
  }, []);

  useFocusEffect(reload);

  function renderRow({ item }: { item: ArcDiaryEntry }) {
    const preview = item.body.trim().slice(0, 80) || "(רשומה ריקה)";
    return (
      <Pressable style={styles.row} onPress={() => router.push({ pathname: "/diary/[id]", params: { id: item.id } })}>
        <Text style={styles.rowDate}>{item.dateLocal}</Text>
        <Text style={styles.rowPreview}>{preview}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>ARC Diary</Text>
        <Text style={styles.hint}>יומן אישי לכתיבה חופשית -- תיעוד חוויות, מחשבות ורגשות.</Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderRow}
        ListEmptyComponent={<Text style={styles.hint}>עדיין לא נכתבה רשומה.</Text>}
      />
      <Pressable style={styles.primaryButton} onPress={() => router.push("/diary/new")}>
        <Text style={styles.primaryButtonText}>+ רשומה חדשה</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: { paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  hint: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 6, marginBottom: 6 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100, gap: 6 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, marginBottom: 2 },
  rowDate: { fontSize: 12, color: "#888", textAlign: "right", marginBottom: 4 },
  rowPreview: { fontSize: 15, textAlign: "right", color: "#222" },
  primaryButton: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

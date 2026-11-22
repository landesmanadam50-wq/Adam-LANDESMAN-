import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcBook, ArcWritingText } from "../arc/arcWriting.ts";
import { resolveStandaloneWritingTexts } from "../arc/arcWriting.ts";
import { loadArcBooks, loadArcWritingTexts } from "../data/storage.ts";

/**
 * build/ArcWritingHomeScreen.tsx (route /arc-gym/writing)
 *
 * ARC Writing & ARC Book task, spec section 7: the ONE entry point ARC
 * Gym offers for this feature, with exactly the three choices the spec
 * requires -- write a text, write a book, or continue existing writing.
 * Mirrors build/ArcGymScreen.tsx's own entry-card convention; never a
 * second, competing home screen for this feature.
 */
export default function ArcWritingHomeScreen() {
  const [texts, setTexts] = useState<ArcWritingText[]>([]);
  const [books, setBooks] = useState<ArcBook[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcWritingTexts(), loadArcBooks()]).then(([loadedTexts, loadedBooks]) => {
        setTexts(resolveStandaloneWritingTexts(loadedTexts));
        setBooks(loadedBooks);
      });
    }, [])
  );

  const items: { id: string; kind: "text" | "video_script" | "book"; title: string; subtitle: string }[] = [
    ...texts.map((text) => ({
      id: text.id,
      kind: text.kind === "video_script" ? ("video_script" as const) : ("text" as const),
      title: text.title || "(ללא כותרת)",
      subtitle: text.isDraft ? "טיוטה" : "הושלם",
    })),
    ...books.map((book) => ({ id: book.id, kind: "book" as const, title: book.name || "(ללא שם)", subtitle: book.topic })),
  ].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>✍️ ARC Writing</Text>
            <Text style={styles.subtitle}>הפוך תובנות שצברת בתרגילי ARC ובחיים עצמם לטקסטים ולספרים -- בחיבור תובנות, חשיבה עצמאית, וכתיבה שלך.</Text>

            <Pressable style={styles.primaryCard} onPress={() => router.push({ pathname: "/arc-gym/writing/[id]", params: { id: "new" } })}>
              <Text style={styles.primaryCardText}>📝 כתיבת טקסט</Text>
            </Pressable>
            <Pressable style={styles.primaryCard} onPress={() => router.push({ pathname: "/arc-gym/writing/[id]", params: { id: "new", kind: "video_script" } })}>
              <Text style={styles.primaryCardText}>🎥 כתיבת תסריט לסרטון</Text>
            </Pressable>
            <Pressable style={styles.primaryCard} onPress={() => router.push({ pathname: "/arc-gym/book/[id]", params: { id: "new" } })}>
              <Text style={styles.primaryCardText}>📖 כתיבת ספר</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>המשך כתיבה</Text>
            {items.length === 0 && <Text style={styles.hint}>עדיין לא יצרת טקסטים או ספרים.</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              item.kind === "book"
                ? router.push({ pathname: "/arc-gym/book/[id]", params: { id: item.id } })
                : router.push({ pathname: "/arc-gym/writing/[id]", params: { id: item.id } })
            }
          >
            <Text style={styles.rowTitle}>{item.kind === "book" ? "📖 " : item.kind === "video_script" ? "🎥 " : "📝 "}{item.title}</Text>
            <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  subtitle: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 6, marginBottom: 16, lineHeight: 19 },
  primaryCard: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 12, padding: 16, alignItems: "flex-end", marginBottom: 12 },
  primaryCardText: { color: "#6A1B9A", fontSize: 16, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 13, color: "#777", textAlign: "right" },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSubtitle: { fontSize: 12, color: "#777", textAlign: "right", marginTop: 2 },
});

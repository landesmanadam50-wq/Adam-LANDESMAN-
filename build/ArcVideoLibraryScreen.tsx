import { useCallback, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcVideoRecording } from "../arc/arcWriting.ts";
import { resolveDistinctVideoTopics, resolvePrivateVideoRecordings, resolvePublishedVideoRecordings, resolveVideoRecordingsForTopic } from "../arc/arcWriting.ts";
import { loadArcVideoRecordings } from "../data/storage.ts";

type VisibilityFilter = "all" | "private" | "published";

const UNTITLED_TOPIC_LABEL = "ללא נושא";

/**
 * build/ArcVideoLibraryScreen.tsx (route /arc-gym/video)
 *
 * ARC Video task, spec section 4: videos organized by topic so the
 * trainee (and, once published, anyone browsing) can find relevant
 * content, with a private/published filter. This screen never plays a
 * video itself or changes visibility -- tapping a row opens
 * build/ArcVideoDetailScreen.tsx, which is where playback (routed
 * through the one expo-video screen, build/ArcVideoPreviewScreen.tsx),
 * metadata editing, linking, and the publish confirmation all live.
 */
export default function ArcVideoLibraryScreen() {
  const [recordings, setRecordings] = useState<ArcVideoRecording[]>([]);
  const [filter, setFilter] = useState<VisibilityFilter>("all");

  useFocusEffect(
    useCallback(() => {
      loadArcVideoRecordings().then(setRecordings);
    }, [])
  );

  const filtered = filter === "private" ? resolvePrivateVideoRecordings(recordings) : filter === "published" ? resolvePublishedVideoRecordings(recordings) : recordings;

  const topics = resolveDistinctVideoTopics(filtered);
  const untitled = filtered.filter((recording) => !recording.topic.trim());
  const sections = [
    ...topics.map((topic) => ({ title: topic, data: resolveVideoRecordingsForTopic(filtered, topic) })),
    ...(untitled.length > 0 ? [{ title: UNTITLED_TOPIC_LABEL, data: untitled }] : []),
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.filterRow}>
        {([
          ["all", "הכל"],
          ["private", "🔒 פרטי"],
          ["published", "🌐 פורסם"],
        ] as [VisibilityFilter, string][]).map(([value, label]) => (
          <Pressable key={value} style={[styles.filterChip, filter === value && styles.filterChipSelected]} onPress={() => setFilter(value)}>
            <Text style={[styles.filterChipText, filter === value && styles.filterChipTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionList
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-gym/video/[id]", params: { id: item.id } })}>
            <Text style={styles.rowTitle}>🎥 {item.title || "(ללא כותרת)"}</Text>
            <Text style={styles.rowSubtitle}>
              {item.visibility === "published" ? "🌐 פורסם" : "🔒 פרטי"} · {item.isDraft ? "טיוטה" : "סופי"}
            </Text>
            {item.purpose ? <Text style={styles.rowPurpose}>{item.purpose}</Text> : null}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.hint}>עדיין אין סרטונים. אפשר ליצור תסריט לסרטון דרך ARC Writing ולצלם ממנו.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  filterRow: { flexDirection: "row-reverse", gap: 8, padding: 16, paddingBottom: 8 },
  filterChip: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  filterChipSelected: { backgroundColor: "#6A1B9A" },
  filterChipText: { color: "#6A1B9A", fontSize: 13, fontWeight: "600" },
  filterChipTextSelected: { color: "#fff" },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333", marginTop: 14, marginBottom: 6 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSubtitle: { fontSize: 12, color: "#777", textAlign: "right", marginTop: 2 },
  rowPurpose: { fontSize: 12, color: "#555", textAlign: "right", marginTop: 4 },
  hint: { fontSize: 13, color: "#777", textAlign: "right", padding: 16 },
});

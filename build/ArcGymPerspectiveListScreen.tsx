import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { generateArcPerspectiveSessionId } from "../arc/arcPerspective.ts";
import type { ArcPerspectiveEvent } from "../arc/arcPerspective.ts";
import { loadArcPerspectiveEvents } from "../data/storage.ts";

/**
 * build/ArcGymPerspectiveListScreen.tsx (route /arc-gym/perspective)
 *
 * ARC Perspective task, section 9: "ARC Perspective — שינוי פרשנות"
 * entry point inside ARC GYM -- lists every saved event, and "+ אירוע
 * חדש" opens the flow screen's own first ("event") step directly,
 * since that step IS the event-creation form -- never a second,
 * separate creation screen.
 */
export default function ArcGymPerspectiveListScreen() {
  const [events, setEvents] = useState<ArcPerspectiveEvent[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcPerspectiveEvents().then((loaded) => setEvents([...loaded].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>🔄 ARC Perspective — שינוי פרשנות</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push({ pathname: "/arc-perspective/[id]", params: { id: generateArcPerspectiveSessionId(), mode: "planned", eventId: "new" } })}
        >
          <Text style={styles.addButtonText}>+ אירוע חדש</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>אירועים ופרשנויות שמורים לתרגול חוזר.</Text>

      {events === null && <Text style={styles.hint}>טוען...</Text>}
      {events !== null && events.length === 0 && <Text style={styles.hint}>עדיין לא נוספו אירועים.</Text>}

      <FlatList
        data={events ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-gym/perspective/[id]", params: { id: item.id } })}>
            <Text style={styles.rowTitle}>{item.eventDescription || "אירוע ללא תיאור"}</Text>
            {!!item.initialInterpretation && <Text style={styles.rowSubtitle}>{item.initialInterpretation}</Text>}
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
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSubtitle: { fontSize: 13, color: "#777", textAlign: "right", marginTop: 4 },
});

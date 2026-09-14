import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { archiveInterferenceItem, disableInterferenceItem, loadInterferenceItems, restoreInterferenceItem } from "../data/storage.ts";
import type { InterferenceCategory, InterferenceItem } from "../arc/interferenceItem.ts";
import type { LibraryItemStatus } from "../arc/libraryItemStatus.ts";

const STATUS_LABELS: Record<LibraryItemStatus, string> = {
  enabled: "פעיל",
  disabled: "מושבת",
  archived: "בארכיון",
};

const CATEGORY_LABELS: Record<InterferenceCategory, string> = {
  thought: "מחשבה",
  belief: "אמונה",
  urge: "דחף",
  emotion: "רגש",
};

/**
 * build/InterferenceItemListScreen.tsx (route: /interference-items)
 *
 * Adaptive ARC architecture task, Phase 11: the management screen for
 * the new InterferenceItem library -- lists every saved item across all
 * four categories (Thought/Belief/Emotion/Urge), lets the trainee
 * create, edit, disable, enable, archive, and restore any of them.
 * Mirrors build/StateProfileListScreen.tsx (Phase 10) exactly: archived
 * items hidden by default behind a reveal toggle, no delete, stable
 * `item.id` React keys, graceful empty-library handling.
 *
 * Multiple InterferenceItems may exist and be enabled at once, exactly
 * like multiple StateProfiles already can (Phase 10) -- no combined
 * selection, no LIVE wiring, no routing here. Tapping a row opens the
 * editor only.
 */
export default function InterferenceItemListScreen() {
  const [items, setItems] = useState<InterferenceItem[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(() => {
    loadInterferenceItems()
      .then(setItems)
      .catch((error) => {
        console.warn("[InterferenceItemListScreen] Failed to load Interference Items -- showing the empty state.", error);
        setItems([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDisable(id: string) {
    await disableInterferenceItem(id, new Date().toISOString());
    reload();
  }

  async function handleArchive(id: string) {
    await archiveInterferenceItem(id, new Date().toISOString());
    reload();
  }

  async function handleRestore(id: string) {
    await restoreInterferenceItem(id, new Date().toISOString());
    reload();
  }

  if (!items) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const visibleItems = items.filter((item) => showArchived || item.status !== "archived");

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>פריטי הפרעה</Text>
        <Text style={styles.subtitle}>מחשבות, אמונות, רגשות ודחפים שתרצה לעבוד איתם.</Text>

        <Pressable style={styles.toggleRow} onPress={() => setShowArchived((current) => !current)}>
          <Text style={styles.toggleText}>{showArchived ? "הסתר פריטים בארכיון" : "הצג גם פריטים בארכיון"}</Text>
        </Pressable>

        {items.length === 0 && <Text style={styles.emptyText}>עדיין אין כאן פריטי הפרעה שמורים. אפשר להוסיף אחד חדש למטה.</Text>}
        {items.length > 0 && visibleItems.length === 0 && <Text style={styles.emptyText}>כל פריטי ההפרעה שלך נמצאים כרגע בארכיון.</Text>}

        {visibleItems.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={[styles.statusBadge, styles[`statusBadge_${item.status}`]]}>{STATUS_LABELS[item.status]}</Text>
            </View>
            <Text style={styles.cardCategory}>{CATEGORY_LABELS[item.category]}</Text>
            {item.description && <Text style={styles.cardRow}>{item.description}</Text>}

            <View style={styles.cardActions}>
              <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: "/interference-items/[id]", params: { id: item.id } })}>
                <Text style={styles.actionButtonText}>ערוך</Text>
              </Pressable>
              {item.status === "enabled" && (
                <>
                  <Pressable style={styles.actionButton} onPress={() => handleDisable(item.id)}>
                    <Text style={styles.actionButtonText}>השבת</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => handleArchive(item.id)}>
                    <Text style={styles.actionButtonText}>העבר לארכיון</Text>
                  </Pressable>
                </>
              )}
              {item.status === "disabled" && (
                <>
                  <Pressable style={styles.actionButton} onPress={() => handleRestore(item.id)}>
                    <Text style={styles.actionButtonText}>הפעל</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => handleArchive(item.id)}>
                    <Text style={styles.actionButtonText}>העבר לארכיון</Text>
                  </Pressable>
                </>
              )}
              {item.status === "archived" && (
                <Pressable style={styles.actionButton} onPress={() => handleRestore(item.id)}>
                  <Text style={styles.actionButtonText}>שחזר</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/interference-items/[id]", params: { id: "new" } })}>
          <Text style={styles.buttonText}>+ הוספת פריט הפרעה</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>חזרה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 12 },
  toggleRow: { alignItems: "flex-end", marginBottom: 16 },
  toggleText: { fontSize: 14, color: "#0a7ea4" },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  card: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 14,
  },
  cardHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  cardCategory: { fontSize: 13, textAlign: "right", color: "#1a6b4a", marginTop: 2 },
  statusBadge: { fontSize: 12, fontWeight: "600", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, overflow: "hidden" },
  statusBadge_enabled: { backgroundColor: "#E3F7E8", color: "#1a6b4a" },
  statusBadge_disabled: { backgroundColor: "#FDF3D9", color: "#8a6d1a" },
  statusBadge_archived: { backgroundColor: "#F0F0F0", color: "#666" },
  cardRow: { fontSize: 14, textAlign: "right", color: "#333", marginTop: 6 },
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, justifyContent: "flex-end" },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 20, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

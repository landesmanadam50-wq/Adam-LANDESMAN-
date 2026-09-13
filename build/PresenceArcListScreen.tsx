import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deletePresenceArc, loadPresenceArcs, upsertPresenceArc } from "../data/storage.ts";
import { duplicatePresenceArc } from "../arc/presenceArcs.ts";
import type { PresenceArc } from "../arc/types.ts";

/**
 * build/PresenceArcListScreen.tsx (route: /presence-arcs)
 *
 * Phase 5 (ARC Presence and ARC Mini Presence): "בניית ARC Presence" --
 * lists every independently-saved PresenceArc (data/storage.ts's
 * loadPresenceArcs/ARC_PRESENCE_ARCS_KEY), mirroring
 * build/ThoughtArcListScreen.tsx exactly (same row/action-button
 * layout, confirm-delete Modal, styling) but for Full ARC Presence,
 * which is a genuinely independent LIVE protocol -- "LIVE" here routes
 * straight to the standalone live/PresenceArcLiveScreen.tsx, never
 * requiring an ARC Goal -- while still reusing the SAME already-tested
 * arc/arcEngine.ts Presence stages underneath (see arc/presenceLive.ts).
 */
export default function PresenceArcListScreen() {
  const [presenceArcs, setPresenceArcs] = useState<PresenceArc[] | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadPresenceArcs()
      .then(setPresenceArcs)
      .catch((error) => {
        console.warn("[PresenceArcListScreen] Failed to load ARC Presence -- showing the empty state.", error);
        setPresenceArcs([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDuplicate(presenceArc: PresenceArc) {
    const copy = duplicatePresenceArc(presenceArc, new Date().toISOString());
    await upsertPresenceArc(copy);
    reload();
  }

  async function handleDelete(id: string) {
    await deletePresenceArc(id);
    setConfirmDeleteId(null);
    reload();
  }

  if (!presenceArcs) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בניית ARC Presence</Text>
        <Text style={styles.subtitle}>נוכחות מלאה כפרוטוקול עצמאי -- אותם שלבים, אותו ניתוב לפי דירוג, אותו צבע אנרגיה שכבר קיימים ב-ARC הרגיל.</Text>

        {presenceArcs.length === 0 && <Text style={styles.emptyText}>עדיין אין לך ARC Presence. אפשר להוסיף אחד חדש למטה.</Text>}

        {presenceArcs.map((presenceArc) => (
          <View key={presenceArc.id} style={styles.card}>
            <Text style={styles.cardTitle}>{presenceArc.name}</Text>
            {presenceArc.presenceColor && <Text style={styles.cardRow}>{`צבע אנרגיה: ${presenceArc.presenceColor}`}</Text>}
            {presenceArc.presenceDwellSeconds != null && <Text style={styles.cardRow}>{`זמן שהייה: ${presenceArc.presenceDwellSeconds} שניות`}</Text>}

            <View style={styles.cardActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push({ pathname: "/presence-arcs/live/[id]", params: { id: presenceArc.id } })}
              >
                <Text style={styles.actionButtonText}>LIVE</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push({ pathname: "/presence-arcs/[id]", params: { id: presenceArc.id } })}
              >
                <Text style={styles.actionButtonText}>ערוך</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleDuplicate(presenceArc)}>
                <Text style={styles.actionButtonText}>שכפל</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(presenceArc.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/presence-arcs/[id]", params: { id: "new" } })}
        >
          <Text style={styles.buttonText}>+ הוסף ARC Presence</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את ה-ARC Presence הזה?</Text>
            <Text style={styles.body}>הפעולה אינה הפיכה.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.button, styles.modalButton, styles.deleteButton]}
                onPress={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              >
                <Text style={styles.buttonText}>מחק</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(null)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  card: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 6 },
  cardRow: { fontSize: 14, textAlign: "right", color: "#333", marginBottom: 2 },
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, justifyContent: "flex-end" },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  deleteText: { color: "#c0392b" },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  body: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0 },
  deleteButton: { backgroundColor: "#c0392b" },
});

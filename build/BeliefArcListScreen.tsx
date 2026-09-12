import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deleteBeliefArc, loadBeliefArcs, upsertBeliefArc } from "../data/storage.ts";
import { duplicateBeliefArc } from "../arc/beliefArcs.ts";
import type { BeliefArc } from "../arc/types.ts";

/**
 * build/BeliefArcListScreen.tsx (route: /belief-arcs)
 *
 * Phase 6 (ARC Belief and ARC Mini Belief): "בניית ARC Belief" -- lists
 * every independently-saved BeliefArc (data/storage.ts's
 * loadBeliefArcs/ARC_BELIEF_ARCS_KEY), mirroring
 * build/ThoughtArcListScreen.tsx exactly (same row/action-button
 * layout, confirm-delete Modal, styling) but for the new, independent
 * ARC Belief protocol -- distinct from ARC Thought (a broader
 * recurring belief about self/others/the world, not a single current
 * thought). "LIVE" here routes straight to the standalone
 * live/BeliefArcLiveScreen.tsx, never requiring an ARC Goal.
 */
export default function BeliefArcListScreen() {
  const [beliefArcs, setBeliefArcs] = useState<BeliefArc[] | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadBeliefArcs()
      .then(setBeliefArcs)
      .catch((error) => {
        console.warn("[BeliefArcListScreen] Failed to load ARC Beliefs -- showing the empty state.", error);
        setBeliefArcs([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDuplicate(beliefArc: BeliefArc) {
    const copy = duplicateBeliefArc(beliefArc, new Date().toISOString());
    await upsertBeliefArc(copy);
    reload();
  }

  async function handleDelete(id: string) {
    await deleteBeliefArc(id);
    setConfirmDeleteId(null);
    reload();
  }

  if (!beliefArcs) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בניית ARC Belief</Text>
        <Text style={styles.subtitle}>עבודה עם אמונה רחבה וחוזרת על עצמה -- פרוטוקול עצמאי, נפרד מ-ARC Thought.</Text>

        {beliefArcs.length === 0 && <Text style={styles.emptyText}>עדיין אין לך ARC Belief. אפשר להוסיף אחד חדש למטה.</Text>}

        {beliefArcs.map((beliefArc) => (
          <View key={beliefArc.id} style={styles.card}>
            <Text style={styles.cardTitle}>{beliefArc.name}</Text>
            {beliefArc.limitingBelief && <Text style={styles.cardRow}>{`אמונה: ${beliefArc.limitingBelief}`}</Text>}
            {beliefArc.replacementBelief && <Text style={styles.cardRow}>{`אמונה תומכת: ${beliefArc.replacementBelief}`}</Text>}

            <View style={styles.cardActions}>
              <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: "/belief-arcs/live/[id]", params: { id: beliefArc.id } })}>
                <Text style={styles.actionButtonText}>LIVE</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: "/belief-arcs/[id]", params: { id: beliefArc.id } })}>
                <Text style={styles.actionButtonText}>ערוך</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleDuplicate(beliefArc)}>
                <Text style={styles.actionButtonText}>שכפל</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(beliefArc.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/belief-arcs/[id]", params: { id: "new" } })}>
          <Text style={styles.buttonText}>+ הוסף ARC Belief</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את ה-ARC Belief הזה?</Text>
            <Text style={styles.body}>הפעולה אינה הפיכה.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton, styles.deleteButton]} onPress={() => confirmDeleteId && handleDelete(confirmDeleteId)}>
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

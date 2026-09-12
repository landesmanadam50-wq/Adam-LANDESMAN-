import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deleteUrgeArc, loadUrgeArcs, upsertUrgeArc } from "../data/storage.ts";
import { duplicateUrgeArc } from "../arc/urgeArcs.ts";
import type { UrgeArc } from "../arc/types.ts";

/**
 * build/UrgeArcListScreen.tsx (route: /urge-arcs)
 *
 * ARC Goal Urge route task: "בניית Urge ARC" -- lists every
 * independently-saved UrgeArc (data/storage.ts's loadUrgeArcs/
 * ARC_URGE_ARCS_KEY, completely separate from ARC_BUILDS_KEY/
 * MINI_ARC_BUILDS_KEY/ARC_GOALS_KEY) and lets the trainee create, edit,
 * duplicate, delete, and later reference any number of them from an
 * ARC Goal's own urgeMappings (build/ArcGoalEditorScreen.tsx) --
 * Goal-Achievement sessions still run bridged from within an ARC Goal
 * session, exactly as before. Phase 3 (Full + Mini ARC Urge
 * representation encoding) adds a genuine Personal Development
 * standalone LIVE entry too (live/UrgeArcLiveScreen.tsx, route
 * /urge-arcs/live/[id]) -- the "LIVE" button below. Reuses
 * build/MiniArcListScreen.tsx's own visual/interaction conventions (row
 * + action-button layout, confirm-delete Modal, styling) but is its own
 * component.
 *
 * "+ הוסף Urge ARC" navigates straight to the editor in create mode
 * (route param id="new", see build/UrgeArcEditorScreen.tsx) -- nothing
 * is ever persisted until the editor's own Save succeeds (mirrors Mini
 * ARC's own "never allow saving without the required fields" rule).
 */
export default function UrgeArcListScreen() {
  const [urgeArcs, setUrgeArcs] = useState<UrgeArc[] | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadUrgeArcs()
      .then(setUrgeArcs)
      .catch((error) => {
        console.warn("[UrgeArcListScreen] Failed to load Urge ARCs -- showing the empty state.", error);
        setUrgeArcs([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDuplicate(urgeArc: UrgeArc) {
    const copy = duplicateUrgeArc(urgeArc, new Date().toISOString());
    await upsertUrgeArc(copy);
    reload();
  }

  async function handleDelete(id: string) {
    await deleteUrgeArc(id);
    setConfirmDeleteId(null);
    reload();
  }

  if (!urgeArcs) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בניית Urge ARC</Text>
        <Text style={styles.subtitle}>תגובה קצרה לדחף, נפרדת ממצב פנימי תומך -- מחוברת ממטרת ARC.</Text>

        {urgeArcs.length === 0 && <Text style={styles.emptyText}>עדיין אין לך Urge ARC. אפשר להוסיף אחד חדש למטה.</Text>}

        {urgeArcs.map((urgeArc) => (
          <View key={urgeArc.id} style={styles.card}>
            <Text style={styles.cardTitle}>{urgeArc.name}</Text>
            <Text style={styles.cardRow}>{`הפעולה המפריעה: ${urgeArc.interferingAction}`}</Text>
            <Text style={styles.cardRow}>{`עוגן ויסות: ${urgeArc.regulationAnchor}`}</Text>
            <Text style={styles.cardRow}>{`פעולה מיטיבה חלופית: ${urgeArc.beneficialAlternativeAction}`}</Text>

            <View style={styles.cardActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push({ pathname: "/urge-arcs/live/[id]", params: { id: urgeArc.id } })}
              >
                <Text style={styles.actionButtonText}>LIVE</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push({ pathname: "/urge-arcs/[id]", params: { id: urgeArc.id } })}
              >
                <Text style={styles.actionButtonText}>ערוך</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleDuplicate(urgeArc)}>
                <Text style={styles.actionButtonText}>שכפל</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(urgeArc.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/urge-arcs/[id]", params: { id: "new" } })}
        >
          <Text style={styles.buttonText}>+ הוסף Urge ARC</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את ה-Urge ARC הזה?</Text>
            <Text style={styles.body}>הפעולה אינה הפיכה. מטרות ARC שמפנות אליו יציגו הודעה שהפרוטוקול לא נמצא.</Text>
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

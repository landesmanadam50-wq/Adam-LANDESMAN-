import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deleteMiniArcBuild, loadMiniArcBuilds, upsertMiniArcBuild } from "../data/storage.ts";
import { duplicateMiniArc, safeText } from "../arc/miniArc.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";

/**
 * build/MiniArcListScreen.tsx (route: /mini-arc)
 *
 * Mini ARC task: "בניית Mini ARC" -- lists every independently-saved
 * MiniArcBuild (data/storage.ts's loadMiniArcBuilds/MINI_ARC_BUILDS_KEY,
 * completely separate from ARC_BUILDS_KEY) and lets the trainee create,
 * edit, duplicate, delete, and start any number of them, each on its
 * own storage row. Reuses build/ArcBuildListScreen.tsx's visual/
 * interaction conventions (row + action-button layout, confirm-delete
 * Modal, styling) but is its own component -- Mini ARC's cards need to
 * show more per-build detail (color/anchor/encoding/action, not just a
 * name) and a "duplicate" action ArcBuildListScreen doesn't have.
 *
 * "+ הוסף Mini ARC" navigates straight to the editor in create mode
 * (route param id="new", see build/MiniArcEditorScreen.tsx) rather than
 * pre-creating a named-but-incomplete row the way ArcBuildListScreen
 * does for full ArcBuilds -- Mini ARC's own explicit validation
 * requirement ("do not allow saving without all five fields") means
 * nothing is ever persisted until the editor's own Save succeeds.
 */
export default function MiniArcListScreen() {
  const [builds, setBuilds] = useState<MiniArcBuild[] | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadMiniArcBuilds()
      .then(setBuilds)
      .catch((error) => {
        console.warn("[MiniArcListScreen] Failed to load Mini ARC Builds -- showing the empty state.", error);
        setBuilds([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDuplicate(build: MiniArcBuild) {
    const copy = duplicateMiniArc(build, new Date().toISOString());
    await upsertMiniArcBuild(copy);
    reload();
  }

  async function handleDelete(id: string) {
    await deleteMiniArcBuild(id);
    setConfirmDeleteId(null);
    reload();
  }

  if (!builds) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בניית Mini ARC</Text>
        <Text style={styles.subtitle}>תמיכה מיידית, קצרה, ללא הפרוטוקול המלא.</Text>

        {builds.length === 0 && <Text style={styles.emptyText}>עדיין אין לך Mini ARC. אפשר להוסיף אחד חדש למטה.</Text>}

        {builds.map((build) => (
          <View key={build.id} style={styles.card}>
            <Text style={styles.cardTitle}>{safeText(build.name)}</Text>
            <Text style={styles.cardRow}>{`צבע נוכחות: ${safeText(build.presenceColor)}`}</Text>
            <Text style={styles.cardRow}>{`עוגן ויסות: ${safeText(build.regulationAnchor)}`}</Text>
            <Text style={styles.cardRow}>{`פעולת קידוד: ${safeText(build.encodingAction)}`}</Text>
            <Text style={styles.cardRow}>{`פעולה מיטיבה: ${safeText(build.beneficialAction)}`}</Text>

            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => router.push({ pathname: "/mini-arc/live/[id]", params: { id: build.id } })}
            >
              <Text style={styles.buttonText}>התחל Mini ARC</Text>
            </Pressable>

            <View style={styles.cardActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push({ pathname: "/mini-arc/[id]", params: { id: build.id } })}
              >
                <Text style={styles.actionButtonText}>ערוך</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => handleDuplicate(build)}>
                <Text style={styles.actionButtonText}>שכפל</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(build.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/mini-arc/[id]", params: { id: "new" } })}
        >
          <Text style={styles.buttonText}>+ הוסף Mini ARC</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את ה-Mini ARC הזה?</Text>
            <Text style={styles.body}>הפעולה אינה הפיכה. Mini ARC Builds אחרים ו-ARC Builds מלאים לא ייפגעו.</Text>
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

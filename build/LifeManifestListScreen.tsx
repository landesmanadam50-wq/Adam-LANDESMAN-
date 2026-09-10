import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deleteLifeManifest, loadLifeManifests, upsertLifeManifest } from "../data/storage.ts";
import { createEmptyLifeManifest, createEmptyMajorGoal, duplicateLifeManifest, generateLifeManifestId, generateMajorGoalId, isLifeManifestDraft } from "../arc/lifeManifest.ts";
import type { LifeManifest } from "../arc/lifeManifest.ts";

/**
 * Life Manifest task: the Life Manifest home screen -- lists every
 * independently saved LifeManifest (data/storage.ts's loadLifeManifests)
 * and lets the trainee create, duplicate, and delete any number of them,
 * mirroring build/ArcGoalListScreen.tsx's exact list/create/duplicate/
 * delete UI pattern. "+ צור מניפסט חיים חדש" asks for the Major Goal's
 * title (the questionnaire's first, only-required question -- spec
 * section 2) and immediately creates BOTH the LifeManifest container and
 * its first MajorGoal together (see arc/lifeManifest.ts's own module
 * doc on why there's no separate "Life Manifest title" question), then
 * opens the questionnaire for that goal. Unfinished manifests show a
 * "טיוטה" badge (isLifeManifestDraft) so the trainee can find and resume
 * them later without losing progress -- spec section 2's explicit
 * "show unfinished Life Manifests as drafts."
 */
export default function LifeManifestListScreen() {
  const [manifests, setManifests] = useState<LifeManifest[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadLifeManifests()
      .then(setManifests)
      .catch((error) => {
        console.warn("[LifeManifestListScreen] Failed to load Life Manifests -- showing the empty state.", error);
        setManifests([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleCreate() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const majorGoal = createEmptyMajorGoal(generateMajorGoalId(), trimmed, now);
    const manifest: LifeManifest = { ...createEmptyLifeManifest(generateLifeManifestId(), now), majorGoals: [majorGoal] };
    await upsertLifeManifest(manifest);
    setCreating(false);
    setNewTitle("");
    router.push({ pathname: "/life-manifest/[id]", params: { id: manifest.id, majorGoalId: majorGoal.id } });
  }

  async function handleDuplicate(manifest: LifeManifest) {
    const copy = duplicateLifeManifest(manifest, generateLifeManifestId(), new Date().toISOString());
    await upsertLifeManifest(copy);
    reload();
  }

  async function handleDelete(id: string) {
    await deleteLifeManifest(id);
    setConfirmDeleteId(null);
    reload();
  }

  function titleFor(manifest: LifeManifest): string {
    return manifest.majorGoals[0]?.title || "מניפסט חיים ללא כותרת";
  }

  if (!manifests) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>מניפסט החיים שלי</Text>

        {manifests.length === 0 && (
          <Text style={styles.emptyText}>עדיין אין לך מניפסט חיים. אפשר להתחיל אחד חדש למטה -- לא צריך לסיים הכול בבת אחת.</Text>
        )}

        {manifests.map((manifest) => (
          <View key={manifest.id} style={styles.goalRow}>
            <Pressable
              style={styles.goalButton}
              onPress={() => router.push({ pathname: "/life-manifest/[id]", params: { id: manifest.id } })}
            >
              <View style={styles.goalTitleRow}>
                {isLifeManifestDraft(manifest) && (
                  <View style={styles.draftBadge}>
                    <Text style={styles.draftBadgeText}>טיוטה</Text>
                  </View>
                )}
                <Text style={styles.goalButtonText}>{titleFor(manifest)}</Text>
              </View>
              {manifest.majorGoals.length > 1 && (
                <Text style={styles.subText}>{`ועוד ${manifest.majorGoals.length - 1} מטרות גדולות`}</Text>
              )}
            </Pressable>
            <View style={styles.goalActions}>
              <Pressable style={styles.actionButton} onPress={() => handleDuplicate(manifest)}>
                <Text style={styles.actionButtonText}>שכפל</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(manifest.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setCreating(true)}>
          <Text style={styles.buttonText}>+ צור מניפסט חיים חדש</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>מהי המטרה הגדולה שהיית רוצה להגשים?</Text>
            <TextInput
              style={styles.textInput}
              value={newTitle}
              onChangeText={setNewTitle}
              textAlign="right"
              autoFocus
              multiline
              placeholder="לדוגמה: להיות מוזיקאי עם 100,000 עוקבים"
            />
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} disabled={newTitle.trim().length === 0} onPress={handleCreate}>
                <Text style={styles.buttonText}>צור</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  setCreating(false);
                  setNewTitle("");
                }}
              >
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את המניפסט הזה?</Text>
            <Text style={styles.body}>הפעולה אינה הפיכה. הפרוטוקולים והמטרות המקושרים (ARC Build, ARC Goal וכו') לא יימחקו.</Text>
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
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  goalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 12,
  },
  goalButton: { flex: 1 },
  goalTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  goalButtonText: { fontSize: 17, fontWeight: "600", textAlign: "right", color: "#0a7ea4", flexShrink: 1 },
  subText: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 4 },
  draftBadge: { backgroundColor: "#E6F4FE", borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  draftBadgeText: { fontSize: 12, color: "#0a7ea4", fontWeight: "600" },
  goalActions: { flexDirection: "row-reverse", gap: 12, marginRight: 12 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  deleteText: { color: "#c0392b" },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginVertical: 12,
  },
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

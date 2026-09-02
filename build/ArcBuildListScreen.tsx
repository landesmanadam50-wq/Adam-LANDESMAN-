import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deleteArcBuild, loadArcBuilds, upsertArcBuild } from "../data/storage.ts";
import { createEmptyArcBuildProfile, generateArcBuildId } from "../arc/types.ts";
import type { ArcBuild } from "../arc/types.ts";

/**
 * ARC Builds task: the new BUILD home screen -- replaces the old
 * two-step BUILD-GOAL (build/ProfileBuilderScreen.tsx) -> BUILD-ARC
 * (build/ArcMapScreen.tsx) flow entirely. There is no "goal" object to
 * create first: this screen lists every independently-saved ArcBuild
 * (data/storage.ts's loadArcBuilds, auto-migrating any pre-existing
 * legacy single profile the first time it's called) and lets the
 * trainee create any number of new ones, each with its own name, own
 * ARC configuration, and own storage -- creating one never touches or
 * overwrites another (see upsertArcBuild's own doc). Renaming and
 * deleting both operate on exactly one ArcBuild by id, the same
 * guarantee. "+ הוסף ARC Build" only asks for a name here (via the
 * inline Modal below -- Alert.prompt is iOS-only, so a real text input
 * is used instead) -- the ARC protocol itself (Reactive/Proactive,
 * Desired State/Identity, Encoding, Action, dwell times, Negative
 * Action, etc.) is configured on the next screen, build/ArcBuildEditorScreen.tsx,
 * reached by opening the freshly-created (already-persisted, already
 * real-id-bearing) build.
 */
export default function ArcBuildListScreen() {
  const [builds, setBuilds] = useState<ArcBuild[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(() => {
    // Startup-safety fix: loadArcBuilds() itself no longer rejects, but
    // this stays as defense-in-depth so the list can never get stuck on
    // its loading state (builds staying null forever) -- falls back to
    // an empty list, which renders this screen's own empty state.
    loadArcBuilds()
      .then(setBuilds)
      .catch((error) => {
        console.warn("[ArcBuildListScreen] Failed to load ARC Builds -- showing the empty state.", error);
        setBuilds([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const build: ArcBuild = {
      id: generateArcBuildId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      needsState: false,
      needsIdentity: false,
      needsHabit: true,
      needsIdentityImmediately: false,
      profile: createEmptyArcBuildProfile(),
    };
    await upsertArcBuild(build);
    setCreating(false);
    setNewName("");
    router.push({ pathname: "/build/[id]", params: { id: build.id } });
  }

  async function handleRename() {
    if (!renamingId) return;
    const trimmed = renameText.trim();
    if (!trimmed || !builds) return;
    const target = builds.find((b) => b.id === renamingId);
    if (!target) return;
    await upsertArcBuild({ ...target, name: trimmed, updatedAt: new Date().toISOString() });
    setRenamingId(null);
    setRenameText("");
    reload();
  }

  async function handleDelete(id: string) {
    await deleteArcBuild(id);
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
        <Text style={styles.title}>הפרוטוקולים שלי</Text>

        {builds.length === 0 && <Text style={styles.emptyText}>עדיין אין לך ARC Build. אפשר להוסיף אחד חדש למטה.</Text>}

        {builds.map((build) => (
          <View key={build.id} style={styles.buildRow}>
            <Pressable
              style={styles.buildButton}
              onPress={() => router.push({ pathname: "/build/[id]", params: { id: build.id } })}
            >
              <Text style={styles.buildButtonText}>{build.name}</Text>
            </Pressable>
            <View style={styles.buildActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  setRenamingId(build.id);
                  setRenameText(build.name);
                }}
              >
                <Text style={styles.actionButtonText}>שנה שם</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteId(build.id)}>
                <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setCreating(true)}>
          <Text style={styles.buttonText}>+ הוסף ARC Build</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>שם ה-ARC Build החדש</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              textAlign="right"
              autoFocus
              placeholder="לדוגמה: לחץ לפני שיחה"
            />
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.button, styles.modalButton]}
                disabled={newName.trim().length === 0}
                onPress={handleCreate}
              >
                <Text style={styles.buttonText}>צור</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={renamingId !== null} transparent animationType="fade" onRequestClose={() => setRenamingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>שם חדש</Text>
            <TextInput style={styles.textInput} value={renameText} onChangeText={setRenameText} textAlign="right" autoFocus />
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.button, styles.modalButton]}
                disabled={renameText.trim().length === 0}
                onPress={handleRename}
              >
                <Text style={styles.buttonText}>שמור</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setRenamingId(null)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmDeleteId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את ה-ARC Build הזה?</Text>
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
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  buildRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 12,
  },
  buildButton: { flex: 1 },
  buildButtonText: { fontSize: 17, fontWeight: "600", textAlign: "right", color: "#0a7ea4" },
  buildActions: { flexDirection: "row-reverse", gap: 12, marginRight: 12 },
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

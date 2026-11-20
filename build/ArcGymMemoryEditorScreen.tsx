import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcGymMemoryExercise, generateArcGymMemoryExerciseId, updateArcGymMemoryExercise } from "../arc/arcGym.ts";
import type { ArcGymMemoryExercise } from "../arc/arcGym.ts";
import { deleteArcGymMemoryExerciseEntry, loadArcGymMemoryExercises, upsertArcGymMemoryExerciseEntry } from "../data/storage.ts";

/**
 * build/ArcGymMemoryEditorScreen.tsx (route /arc-gym/memory/[id]/edit,
 * id === "new" to create -- same convention as build/TaskEditorScreen.tsx
 * and build/ArcGymSituationEditorScreen.tsx)
 *
 * ARCHI -- Unified Development Specification task, Part 1 ("ARC MEMORY
 * EXERCISE TYPE"): exactly the two questions the spec asks for --
 * never a third free-text field, never reusing the Behaviour exercise
 * type's own situation/trigger/desiredAction shape (ArcGymMemoryExercise
 * is its own independent type, see arc/arcGym.ts's own doc).
 */
export default function ArcGymMemoryEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [existing, setExisting] = useState<ArcGymMemoryExercise | null>(null);
  const [situationText, setSituationText] = useState("");
  const [actionText, setActionText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isNew) {
        setLoaded(true);
        return;
      }
      loadArcGymMemoryExercises().then((exercises) => {
        const found = exercises.find((candidate) => candidate.id === id) ?? null;
        setExisting(found);
        if (found) {
          setSituationText(found.situationText);
          setActionText(found.actionText);
        }
        setLoaded(true);
      });
    }, [id, isNew])
  );

  async function save() {
    const validationErrors: string[] = [];
    if (!situationText.trim()) validationErrors.push("יש לתאר באיזו סיטואציה או מתי זה יקרה.");
    if (!actionText.trim()) validationErrors.push("יש לתאר מה בדיוק תרצה להיזכר לעשות.");
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const now = new Date().toISOString();
    const saved = existing !== null
      ? updateArcGymMemoryExercise(existing, { situationText, actionText }, now)
      : createArcGymMemoryExercise(generateArcGymMemoryExerciseId(), situationText, actionText, now);
    await upsertArcGymMemoryExerciseEntry(saved);
    router.replace({ pathname: "/arc-gym/memory/[id]", params: { id: saved.id } });
  }

  async function handleDelete() {
    if (!existing) return;
    await deleteArcGymMemoryExerciseEntry(existing.id);
    setConfirmDelete(false);
    router.replace("/arc-gym/memory");
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "תרגיל זיכרון חדש" : "עריכת תרגיל זיכרון"}</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

        <Field label="באיזו סיטואציה, או מתי, תרצה להיזכר בזה?">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={situationText}
            onChangeText={setSituationText}
            textAlign="right"
            multiline
            placeholder="לדוגמה: כשאני נכנס לבית בסוף יום העבודה."
          />
        </Field>

        <Field label="מה בדיוק תרצה להיזכר לעשות?">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={actionText}
            onChangeText={setActionText}
            textAlign="right"
            multiline
            placeholder="לדוגמה: להניח את המפתחות בקערה שליד הדלת."
          />
        </Field>

        <Pressable style={styles.primaryButton} onPress={save}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת תרגיל" : "שמירת שינויים"}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.deleteButton} onPress={() => setConfirmDelete(true)}>
            <Text style={styles.deleteButtonText}>מחיקת תרגיל</Text>
          </Pressable>
        )}
      </ScrollView>

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את תרגיל הזיכרון הזה?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.primaryButton, styles.modalButton]} onPress={handleDelete}>
                <Text style={styles.primaryButtonText}>מחיקה</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 4 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14, marginBottom: 4 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  deleteButton: { borderWidth: 1, borderColor: "#b00020", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  deleteButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0, marginTop: 0, paddingHorizontal: 20 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
});

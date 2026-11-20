import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcResultExercise, generateArcResultExerciseId, updateArcResultExercise } from "../arc/arcResult.ts";
import type { ArcResultExercise } from "../arc/arcResult.ts";
import { deleteArcResultExerciseEntry, loadArcResultExercises, upsertArcResultExerciseEntry } from "../data/storage.ts";

/**
 * build/ArcGymResultEditorScreen.tsx (route /arc-gym/result/[id]/edit,
 * id === "new" to create -- same convention as build/ArcGymMemoryEditorScreen.tsx)
 *
 * ARCHI -- ARC Result task, section 6: exactly the four fields the
 * quick-practice screen later shows verbatim (focus point, personalized
 * success visualization, success mantra, supportive body language) --
 * never a fifth field, never a timer/duration setting (section 6's own
 * "must not require a timer"). Task-linking is deliberately a SEPARATE
 * step on the detail screen (build/ArcGymResultDetailScreen.tsx), not
 * here -- creating/editing the exercise's own content never forces the
 * trainee to also pick tasks in the same step.
 */
export default function ArcGymResultEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [existing, setExisting] = useState<ArcResultExercise | null>(null);
  const [focusPoint, setFocusPoint] = useState("");
  const [successVisualization, setSuccessVisualization] = useState("");
  const [successMantra, setSuccessMantra] = useState("");
  const [supportiveBodyLanguage, setSupportiveBodyLanguage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isNew) {
        setLoaded(true);
        return;
      }
      loadArcResultExercises().then((exercises) => {
        const found = exercises.find((candidate) => candidate.id === id) ?? null;
        setExisting(found);
        if (found) {
          setFocusPoint(found.focusPoint);
          setSuccessVisualization(found.successVisualization);
          setSuccessMantra(found.successMantra);
          setSupportiveBodyLanguage(found.supportiveBodyLanguage);
        }
        setLoaded(true);
      });
    }, [id, isNew])
  );

  async function save() {
    const validationErrors: string[] = [];
    if (!focusPoint.trim()) validationErrors.push("יש להגדיר נקודת מיקוד.");
    if (!successVisualization.trim()) validationErrors.push("יש לתאר את דימיון ההצלחה.");
    if (!successMantra.trim()) validationErrors.push("יש לכתוב משפט הצלחה.");
    if (!supportiveBodyLanguage.trim()) validationErrors.push("יש לתאר שפת גוף תומכת.");
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const now = new Date().toISOString();
    const patch = { focusPoint, successVisualization, successMantra, supportiveBodyLanguage };
    const saved = existing !== null
      ? updateArcResultExercise(existing, patch, now)
      : createArcResultExercise(generateArcResultExerciseId(), focusPoint, successVisualization, successMantra, supportiveBodyLanguage, now);
    await upsertArcResultExerciseEntry(saved);
    router.replace({ pathname: "/arc-gym/result/[id]", params: { id: saved.id } });
  }

  async function handleDelete() {
    if (!existing) return;
    await deleteArcResultExerciseEntry(existing.id);
    setConfirmDelete(false);
    router.replace("/arc-gym/result");
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
        <Text style={styles.title}>{isNew ? "תרגיל הצלחה חדש" : "עריכת תרגיל הצלחה"}</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

        <Field label="נקודת מיקוד">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={focusPoint}
            onChangeText={setFocusPoint}
            textAlign="right"
            multiline
            placeholder="לדוגמה: הנשימה שלי, לפני שאני מתחיל."
          />
        </Field>

        <Field label="דימיון הצלחה מותאם אישית">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={successVisualization}
            onChangeText={setSuccessVisualization}
            textAlign="right"
            multiline
            placeholder="לדוגמה: אני מדמיין את עצמי מסיים את המשימה בביטחון, מרגיש סיפוק."
          />
        </Field>

        <Field label="משפט הצלחה">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={successMantra}
            onChangeText={setSuccessMantra}
            textAlign="right"
            multiline
            placeholder="לדוגמה: אני מצליח במה שאני מתחיל."
          />
        </Field>

        <Field label="שפת גוף תומכת">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={supportiveBodyLanguage}
            onChangeText={setSupportiveBodyLanguage}
            textAlign="right"
            multiline
            placeholder="לדוגמה: גב זקוף, כתפיים פתוחות, סנטר מעט מורם."
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
            <Text style={styles.modalTitle}>למחוק את תרגיל ההצלחה הזה?</Text>
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
  multilineInput: { minHeight: 60, textAlignVertical: "top" },
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

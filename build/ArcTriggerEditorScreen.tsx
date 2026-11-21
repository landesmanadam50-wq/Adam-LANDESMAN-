import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  addBodyOptionToTrigger,
  createArcTrigger,
  generateArcSavedBodyOptionId,
  generateArcTriggerId,
  linkArcGymSituationToTrigger,
  promoteArcSavedExerciseToBodyOption,
  removeBodyOptionFromTrigger,
  unlinkArcGymSituationFromTrigger,
  updateArcTrigger,
} from "../arc/arcSaving.ts";
import type { ArcSavedBodyOption, ArcSavedExercise, ArcTrigger } from "../arc/arcSaving.ts";
import type { ArcGymSituation } from "../arc/arcGym.ts";
import {
  loadArcGymSituations,
  loadArcSavedBodyOptions,
  loadArcSavedExercises,
  loadArcTriggers,
  upsertArcSavedBodyOptionEntry,
  upsertArcTriggerEntry,
} from "../data/storage.ts";

/**
 * build/ArcTriggerEditorScreen.tsx (route /arc-saving/trigger/[id], id="new" for creation)
 *
 * ARC Saving task, spec sections 3-4-15: create/edit one personally-
 * defined trigger, attach/detach ("delete a specific option without
 * deleting the whole trigger," section 15) multiple ArcSavedBodyOption
 * protocols, and optionally cross-link one existing ARC Behaviour
 * (ArcGymSituation) -- mirroring ArcGymSituationScreen.tsx's own linked-
 * exercise picker pattern.
 */
export default function ArcTriggerEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [trigger, setTrigger] = useState<ArcTrigger | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [bodyOptions, setBodyOptions] = useState<ArcSavedBodyOption[]>([]);
  const [exercises, setExercises] = useState<ArcSavedExercise[]>([]);
  const [situations, setSituations] = useState<ArcGymSituation[]>([]);
  const [showAttachExisting, setShowAttachExisting] = useState(false);
  const [showPromoteFromExercise, setShowPromoteFromExercise] = useState(false);
  const [showBehaviourPicker, setShowBehaviourPicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcTriggers(), loadArcSavedBodyOptions(), loadArcSavedExercises(), loadArcGymSituations()]).then(
        ([triggers, options, loadedExercises, loadedSituations]) => {
          setBodyOptions(options);
          setExercises(loadedExercises);
          setSituations(loadedSituations);
          if (isNew) {
            setTrigger(null);
            setLabelDraft("");
            setDescriptionDraft("");
            return;
          }
          const found = triggers.find((candidate) => candidate.id === id) ?? null;
          setTrigger(found);
          setLabelDraft(found?.label ?? "");
          setDescriptionDraft(found?.description ?? "");
        }
      );
    }, [id, isNew])
  );

  async function handleSaveLabel() {
    const now = new Date().toISOString();
    if (!trigger) {
      // First save of a brand-new trigger -- created and persisted
      // exactly here, never implicitly on mount (mirrors ARC
      // Perspective's own "create the template exactly once" convention).
      const created = updateArcTrigger(createArcTrigger(generateArcTriggerId(), labelDraft, now), { description: descriptionDraft }, now);
      await upsertArcTriggerEntry(created);
      setTrigger(created);
      router.setParams({ id: created.id });
      return;
    }
    const updated = updateArcTrigger(trigger, { label: labelDraft, description: descriptionDraft }, now);
    await upsertArcTriggerEntry(updated);
    setTrigger(updated);
  }

  async function handleAttachExisting(option: ArcSavedBodyOption) {
    if (!trigger) return;
    const updated = addBodyOptionToTrigger(trigger, option.id, new Date().toISOString());
    await upsertArcTriggerEntry(updated);
    setTrigger(updated);
    setShowAttachExisting(false);
  }

  async function handlePromoteFromExercise(exercise: ArcSavedExercise) {
    if (!trigger) return;
    const now = new Date().toISOString();
    const option = promoteArcSavedExerciseToBodyOption(exercise, generateArcSavedBodyOptionId(), `${exercise.label} (אפשרות)`, now);
    await upsertArcSavedBodyOptionEntry(option);
    const updated = addBodyOptionToTrigger(trigger, option.id, now);
    await upsertArcTriggerEntry(updated);
    setTrigger(updated);
    setBodyOptions((current) => [...current, option]);
    setShowPromoteFromExercise(false);
  }

  async function handleRemoveOption(optionId: string) {
    if (!trigger) return;
    const updated = removeBodyOptionFromTrigger(trigger, optionId, new Date().toISOString());
    await upsertArcTriggerEntry(updated);
    setTrigger(updated);
  }

  async function handleLinkBehaviour(situation: ArcGymSituation) {
    if (!trigger) return;
    const updated = linkArcGymSituationToTrigger(trigger, situation.id, new Date().toISOString());
    await upsertArcTriggerEntry(updated);
    setTrigger(updated);
    setShowBehaviourPicker(false);
  }

  async function handleUnlinkBehaviour() {
    if (!trigger) return;
    const updated = unlinkArcGymSituationFromTrigger(trigger, new Date().toISOString());
    await upsertArcTriggerEntry(updated);
    setTrigger(updated);
  }

  const attachedOptions = trigger ? bodyOptions.filter((option) => trigger.bodyOptionIds.includes(option.id)) : [];
  const unattachedOptions = trigger ? bodyOptions.filter((option) => !trigger.bodyOptionIds.includes(option.id)) : [];
  const linkedSituation = trigger?.linkedArcGymSituationId ? situations.find((candidate) => candidate.id === trigger.linkedArcGymSituationId) ?? null : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "טריגר חדש" : "ערוך טריגר"}</Text>

        <Text style={styles.label}>שם הטריגר</Text>
        <TextInput style={styles.input} value={labelDraft} onChangeText={setLabelDraft} placeholder='למשל: "גירוד באוזן"' textAlign="right" />
        <Text style={styles.label}>תיאור (לא חובה)</Text>
        <TextInput style={[styles.input, styles.multiline]} value={descriptionDraft} onChangeText={setDescriptionDraft} multiline textAlign="right" />
        <Pressable style={styles.primaryButton} onPress={handleSaveLabel} disabled={!labelDraft.trim()}>
          <Text style={styles.primaryButtonText}>שמור</Text>
        </Pressable>

        {trigger && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>אפשרויות גוף ({attachedOptions.length})</Text>
            </View>
            {attachedOptions.length === 0 && <Text style={styles.hint}>עדיין לא נוספו אפשרויות גוף לטריגר הזה.</Text>}
            {attachedOptions.map((option) => (
              <View key={option.id} style={styles.row}>
                <Text style={styles.rowTitle}>{option.label}</Text>
                <Text style={styles.rowSubtitle}>{option.useCount > 0 ? `נעשה בו שימוש ${option.useCount} פעמים` : "לא נעשה בו שימוש עדיין"}</Text>
                <Pressable style={styles.removeButton} onPress={() => handleRemoveOption(option.id)}>
                  <Text style={styles.removeButtonText}>הסר מהטריגר</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setShowPromoteFromExercise((v) => !v)}>
                <Text style={styles.secondaryButtonText}>+ מתרגיל שמור</Text>
              </Pressable>
              {unattachedOptions.length > 0 && (
                <Pressable style={styles.secondaryButton} onPress={() => setShowAttachExisting((v) => !v)}>
                  <Text style={styles.secondaryButtonText}>+ אפשרות קיימת</Text>
                </Pressable>
              )}
            </View>

            {showPromoteFromExercise && (
              <FlatList
                data={exercises}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={<Text style={styles.hint}>אין תרגילים שמורים.</Text>}
                renderItem={({ item }) => (
                  <Pressable style={styles.pickerRow} onPress={() => handlePromoteFromExercise(item)}>
                    <Text style={styles.pickerRowText}>{item.label}</Text>
                  </Pressable>
                )}
              />
            )}
            {showAttachExisting && (
              <FlatList
                data={unattachedOptions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable style={styles.pickerRow} onPress={() => handleAttachExisting(item)}>
                    <Text style={styles.pickerRowText}>{item.label}</Text>
                  </Pressable>
                )}
              />
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ARC Behaviour מקושר</Text>
            </View>
            {linkedSituation ? (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>{linkedSituation.behaviorText}</Text>
                <View style={styles.actionRow}>
                  <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/arc-gym/situation/[id]", params: { id: linkedSituation.id } })}>
                    <Text style={styles.secondaryButtonText}>פתח</Text>
                  </Pressable>
                  <Pressable style={styles.removeButton} onPress={handleUnlinkBehaviour}>
                    <Text style={styles.removeButtonText}>הסר קישור</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Pressable style={styles.secondaryButton} onPress={() => setShowBehaviourPicker((v) => !v)}>
                  <Text style={styles.secondaryButtonText}>קשר ל-ARC Behaviour</Text>
                </Pressable>
                {showBehaviourPicker && (
                  <FlatList
                    data={situations}
                    keyExtractor={(item) => item.id}
                    ListEmptyComponent={<Text style={styles.hint}>אין תרגילי ARC Behaviour שמורים.</Text>}
                    renderItem={({ item }) => (
                      <Pressable style={styles.pickerRow} onPress={() => handleLinkBehaviour(item)}>
                        <Text style={styles.pickerRowText}>{item.behaviorText}</Text>
                      </Pressable>
                    )}
                  />
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: "#555", textAlign: "right", marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 10, marginTop: 4, fontSize: 15 },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionHeader: { marginTop: 22, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  hint: { fontSize: 13, color: "#777", textAlign: "right", marginBottom: 8 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  rowSubtitle: { fontSize: 12, color: "#777", textAlign: "right", marginTop: 2 },
  actionRow: { flexDirection: "row-reverse", gap: 8, marginTop: 8 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  removeButton: { borderWidth: 1, borderColor: "#c0392b", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: "flex-end", marginTop: 6 },
  removeButtonText: { color: "#c0392b", fontWeight: "600", fontSize: 12 },
  pickerRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10, marginTop: 6 },
  pickerRowText: { fontSize: 14, textAlign: "right", color: "#333" },
});

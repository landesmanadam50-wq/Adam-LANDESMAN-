import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { generateArcPerspectiveSessionId, listArcPerspectiveSessionsForEvent, updateArcPerspectiveEvent } from "../arc/arcPerspective.ts";
import type { ArcPerspectiveEvent, ArcPerspectiveSession } from "../arc/arcPerspective.ts";
import { loadArcPerspectiveEvents, loadArcPerspectiveSessions, upsertArcPerspectiveEventEntry } from "../data/storage.ts";

/**
 * build/ArcGymPerspectiveEventDetailScreen.tsx (route /arc-gym/perspective/[id])
 *
 * ARC Perspective task, section 9: shows/edits one saved event and its
 * own practice history ("יש להבדיל בין האירוע השמור לבין כל ביצוע של
 * התרגיל"), and starts a fresh practice of it -- a NEW
 * ArcPerspectiveSession each time, never reusing/overwriting a previous
 * one, so the trainee can "לתרגל אירוע אחד מספר פעמים ולשמור פרשנויות
 * שונות לאורך זמן."
 */
export default function ArcGymPerspectiveEventDetailScreen({ id }: { id: string }) {
  const [event, setEvent] = useState<ArcPerspectiveEvent | null | undefined>(undefined);
  const [sessions, setSessions] = useState<ArcPerspectiveSession[]>([]);
  const [draftEventDescription, setDraftEventDescription] = useState("");
  const [draftInitialInterpretation, setDraftInitialInterpretation] = useState("");
  const [draftDesiredInterpretationPreset, setDraftDesiredInterpretationPreset] = useState("");

  const reload = useCallback(() => {
    Promise.all([loadArcPerspectiveEvents(), loadArcPerspectiveSessions()]).then(([events, allSessions]) => {
      const found = events.find((candidate) => candidate.id === id) ?? null;
      setEvent(found);
      setSessions(listArcPerspectiveSessionsForEvent(allSessions, id).filter((session) => session.completedAt !== null));
      setDraftEventDescription(found?.eventDescription ?? "");
      setDraftInitialInterpretation(found?.initialInterpretation ?? "");
      setDraftDesiredInterpretationPreset(found?.desiredInterpretationPreset ?? "");
    });
  }, [id]);

  useFocusEffect(reload);

  async function saveEdits() {
    if (!event) return;
    const updated = updateArcPerspectiveEvent(
      event,
      { eventDescription: draftEventDescription, initialInterpretation: draftInitialInterpretation, desiredInterpretationPreset: draftDesiredInterpretationPreset },
      new Date().toISOString()
    );
    await upsertArcPerspectiveEventEntry(updated);
    reload();
  }

  function practice() {
    router.push({ pathname: "/arc-perspective/[id]", params: { id: generateArcPerspectiveSessionId(), mode: "planned", eventId: id } });
  }

  if (event === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (event === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>האירוע לא נמצא.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.fieldLabel}>מה האירוע?</Text>
        <TextInput style={[styles.textInput, styles.multilineInput]} value={draftEventDescription} onChangeText={setDraftEventDescription} textAlign="right" multiline />
        <Text style={[styles.fieldLabel, styles.secondFieldLabel]}>פרשנות ראשונית</Text>
        <TextInput style={[styles.textInput, styles.multilineInput]} value={draftInitialInterpretation} onChangeText={setDraftInitialInterpretation} textAlign="right" multiline />
        <Text style={[styles.fieldLabel, styles.secondFieldLabel]}>פרשנות רצויה (לא חובה)</Text>
        <TextInput style={styles.textInput} value={draftDesiredInterpretationPreset} onChangeText={setDraftDesiredInterpretationPreset} textAlign="right" />
        <Pressable style={styles.secondaryButton} onPress={saveEdits}>
          <Text style={styles.secondaryButtonText}>שמור שינויים</Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={practice}>
          <Text style={styles.primaryButtonText}>תרגל</Text>
        </Pressable>

        <View style={styles.historyBlock}>
          <Text style={styles.sectionTitle}>היסטוריית תרגולים</Text>
          {sessions.length === 0 && <Text style={styles.hint}>עדיין לא תורגל אירוע זה.</Text>}
          {sessions.map((session) => (
            <Pressable key={session.id} style={styles.historyRow} onPress={() => router.push({ pathname: "/arc-perspective/[id]", params: { id: session.id } })}>
              <Text style={styles.historyText}>{session.newInterpretation}</Text>
              <Text style={styles.hint}>{session.mode === "planned" ? "מראש" : "בזמן אמת"}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 13, textAlign: "right", color: "#777" },
  fieldLabel: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 6 },
  secondFieldLabel: { marginTop: 16 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 14 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  historyBlock: { marginTop: 28 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  historyRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  historyText: { fontSize: 14, textAlign: "right", color: "#333" },
});

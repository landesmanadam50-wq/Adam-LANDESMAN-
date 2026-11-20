import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeArcDecisionSession, createArcDecisionSession } from "../arc/arcDecision.ts";
import type { ArcDecisionOption, ArcDecisionSession } from "../arc/arcDecision.ts";
import { clearArcDecisionInProgress, loadArcDecisionInProgress, recordArcDecisionHistory, saveArcDecisionInProgress } from "../data/storage.ts";
import ArcDecisionFlow from "../live/components/ArcDecisionFlow.tsx";

/**
 * build/ArcGymDecisionScreen.tsx (route /arc-gym/decision)
 *
 * ARC Decision -- "קבלת החלטות": the standalone ARC Gym exercise entry
 * point, section 3 of the spec. A direct, zero-setup flow -- same
 * precedent as /arc-gym/arc-focus's own quick-start -- never a list of
 * saved exercise configs (ARC Decision's own "options" are entered
 * fresh every time, never saved as a reusable template).
 *
 * Reuses the EXACT same engine (arc/arcDecision.ts) and shared UI
 * (live/components/ArcDecisionFlow.tsx) as the "אני לא יודע" entry
 * point inside ARC LIVE (live/NewArcLiveScreen.tsx) -- only the
 * surrounding screen chrome and what happens after choosing differ.
 *
 * "חיבור למערכת המשימות": after choosing, offers "סיום התרגיל" or
 * "הפוך את ההחלטה למשימה" -- the latter opens the EXISTING task
 * creation screen (/tasks/[id]/edit, id=new) with its title prefilled
 * from the chosen option (TaskEditorScreen's own initialTitle prop),
 * never auto-creating a Task -- the trainee still reviews and
 * explicitly confirms there.
 */
export default function ArcGymDecisionScreen() {
  const [session, setSession] = useState<ArcDecisionSession | null>(null);
  const [finished, setFinished] = useState<{ session: ArcDecisionSession; chosen: ArcDecisionOption } | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcDecisionInProgress().then((progress) => {
        if (progress && progress.source === "arc_gym" && !progress.completedAt) {
          setSession(progress);
          setFinished(null);
          return;
        }
        const created = createArcDecisionSession("arc_gym", null, null, new Date().toISOString());
        saveArcDecisionInProgress(created);
        setSession(created);
        setFinished(null);
      });
    }, [])
  );

  function handleChange(next: ArcDecisionSession) {
    saveArcDecisionInProgress(next);
    setSession(next);
  }

  function handleCancel() {
    clearArcDecisionInProgress();
    router.back();
  }

  function handleFinish(decisionSession: ArcDecisionSession, chosenOption: ArcDecisionOption) {
    const completed = completeArcDecisionSession(decisionSession, new Date().toISOString());
    recordArcDecisionHistory(completed);
    clearArcDecisionInProgress();
    setFinished({ session: completed, chosen: chosenOption });
  }

  function handleMakeTask() {
    router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", title: finished!.chosen.text } });
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>ARC Decision</Text>
          <Text style={styles.prompt}>{`בחרת: ${finished.chosen.text}`}</Text>
          <Pressable style={styles.secondaryButton} onPress={handleMakeTask}>
            <Text style={styles.secondaryButtonText}>הפוך את ההחלטה למשימה</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => router.replace("/arc-gym")}>
            <Text style={styles.primaryButtonText}>סיום התרגיל</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ARC Decision — קבלת החלטות</Text>
        <ArcDecisionFlow session={session} onChange={handleChange} onCancel={handleCancel} finishLabel="המשך" onFinish={handleFinish} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 18 },
  prompt: { fontSize: 18, textAlign: "right", color: "#333", marginBottom: 24, lineHeight: 27 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 16 },
});

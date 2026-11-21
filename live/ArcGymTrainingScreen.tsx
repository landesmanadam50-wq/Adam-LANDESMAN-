import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { resolveArcGymSituationVisualizationPrompts } from "../arc/arcGym.ts";
import type { ArcGymSituation } from "../arc/arcGym.ts";
import { loadArcGymSituations } from "../data/storage.ts";
import { handleArcGymCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import EmotionalCheckInButtons from "./components/EmotionalCheckInButtons.tsx";

/**
 * live/ArcGymTrainingScreen.tsx (route /arc-gym/train/[id])
 *
 * ARC GYM task, requirements 5+6: first, a short, user-paced,
 * SKIPPABLE personalized visualization of the saved SITUATION itself
 * (never the action yet -- that happens later, inside Encoding, via
 * the shared resolveArcGymActionVisualization), using the trainee's
 * own saved text; then the emotional check-in -- the SAME three
 * smileys Home/the widget show, routed through the exact same shared
 * module (data/emotionalCheckInRouting.ts's handleArcGymCheckInChoice),
 * just with ARC-GYM-specific meaning for the third choice.
 */
export default function ArcGymTrainingScreen({ id }: { id: string }) {
  const [situation, setSituation] = useState<ArcGymSituation | null>(null);
  const [step, setStep] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadArcGymSituations().then((situations) => setSituation(situations.find((candidate) => candidate.id === id) ?? null));
      setStep(0);
    }, [id])
  );

  if (!situation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const prompts = resolveArcGymSituationVisualizationPrompts(situation);
  const atCheckIn = step >= prompts.length;

  if (!atCheckIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>דימיון הסיטואציה</Text>
          {/*
           * ARC Perspective task, section 7.3: a non-blocking reminder
           * of the linked ArcPerspectiveSession's own new interpretation
           * (a snapshot) -- never alters resolveArcGymSituationVisualizationPrompts
           * or resolveArcGymActionVisualization, and never replaces any
           * existing step.
           */}
          {!!situation.arcPerspectiveNewInterpretation && (
            <View style={styles.perspectiveReminder}>
              <Text style={styles.perspectiveReminderLabel}>פרשנות חדשה שבחרת</Text>
              <Text style={styles.perspectiveReminderText}>{situation.arcPerspectiveNewInterpretation}</Text>
            </View>
          )}
          <Text style={styles.prompt}>{prompts[step]}</Text>
          <View style={styles.row}>
            {step > 0 && (
              <Pressable style={styles.secondaryButton} onPress={() => setStep(step - 1)}>
                <Text style={styles.secondaryButtonText}>חזרה</Text>
              </Pressable>
            )}
            <Pressable style={styles.primaryButton} onPress={() => setStep(step + 1)}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setStep(prompts.length)}>
            <Text style={styles.linkText}>לדלג על הדימיון ולהמשיך לבדיקה הרגשית</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>איך אתה מרגיש עכשיו כשאתה מדמיין את הסיטואציה?</Text>
        <EmotionalCheckInButtons
          onFullArc={() => handleArcGymCheckInChoice("full_arc", id)}
          onShortenedArc={() => handleArcGymCheckInChoice("shortened_arc", id)}
          onExcellent={() => handleArcGymCheckInChoice("visualization_only", id)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  prompt: { fontSize: 17, textAlign: "right", color: "#333", marginBottom: 24, lineHeight: 26 },
  row: { flexDirection: "row-reverse", gap: 10 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: { borderWidth: 1, borderColor: "#999", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#666", fontWeight: "600" },
  linkText: { color: "#666", fontSize: 13, textAlign: "center", marginTop: 16 },
  perspectiveReminder: { backgroundColor: "#F3E9FA", borderRadius: 10, padding: 12, marginBottom: 14 },
  perspectiveReminderLabel: { fontSize: 12, fontWeight: "700", color: "#6A1B9A", textAlign: "right", marginBottom: 2 },
  perspectiveReminderText: { fontSize: 14, color: "#333", textAlign: "right" },
});

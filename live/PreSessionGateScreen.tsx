import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { createEmptyPreSessionGateAnswers, shouldSuggestArcFromGate } from "../arc/preSessionGate.ts";
import type { PreSessionGateAnswers } from "../arc/preSessionGate.ts";

/**
 * live/PreSessionGateScreen.tsx (route /live/gate)
 *
 * Hebrew BUILD/LIVE rework spec, "שער הכניסה לתרגול": an optional,
 * standalone reflection screen shown before entering the existing LIVE
 * chooser (/live/select) -- every answer is optional, and "Continue"
 * is always available regardless of what (if anything) was answered.
 * No existing LIVE entry point is modified or redirected through this
 * screen -- it is reachable only at its own route, additively, so no
 * existing navigation-wiring test or trainee flow is affected. Wiring
 * a specific dashboard button to route through this screen first is a
 * deliberate product decision left to a later, explicit step.
 *
 * threshold is passed in (the current build's own configured
 * arcSuggestionIntensityThreshold, or null) by whichever future caller
 * eventually links to this screen with a specific build in mind; this
 * screen itself never reads ArcBuildProfile directly, keeping it usable
 * regardless of which (if any) build is ultimately selected next.
 */
export default function PreSessionGateScreen({ threshold = null }: { threshold?: number | null }) {
  const [answers, setAnswers] = useState<PreSessionGateAnswers>(createEmptyPreSessionGateAnswers());
  const suggestArc = shouldSuggestArcFromGate(answers, threshold);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>לפני שמתחילים</Text>
        <Text style={styles.subtitle}>כל שאלה כאן היא לרשות בלבד -- אפשר להמשיך בלי לענות על אף אחת מהן.</Text>

        <Text style={styles.question}>מה קרה עכשיו?</Text>
        <TextInput
          style={styles.textInput}
          value={answers.whatHappened ?? ""}
          onChangeText={(value) => setAnswers({ ...answers, whatHappened: value.length > 0 ? value : null })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>מה עוצמת העומס או הדחף, מ-0 עד 10?</Text>
        <View style={styles.chipRow}>
          {Array.from({ length: 11 }, (_, intensity) => intensity).map((intensity) => (
            <Pressable
              key={intensity}
              style={[styles.chip, answers.intensity === intensity && styles.chipSelected]}
              onPress={() => setAnswers({ ...answers, intensity: answers.intensity === intensity ? null : intensity })}
            >
              <Text style={styles.chipText}>{intensity}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.question}>עד כמה זה מקשה עליך לבחור בפעולה הרצויה, מ-0 עד 10?</Text>
        <View style={styles.chipRow}>
          {Array.from({ length: 11 }, (_, value) => value).map((value) => (
            <Pressable
              key={value}
              style={[styles.chip, answers.difficultyChoosingAction === value && styles.chipSelected]}
              onPress={() => setAnswers({ ...answers, difficultyChoosingAction: answers.difficultyChoosingAction === value ? null : value })}
            >
              <Text style={styles.chipText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {suggestArc && (
          <View style={styles.suggestionBanner}>
            <Text style={styles.suggestionText}>לפי העוצמה שסימנת, זה עשוי להיות רגע טוב ל-ARC -- הבחירה בידך.</Text>
          </View>
        )}

        <Pressable style={styles.continueButton} onPress={() => router.push("/live/select")}>
          <Text style={styles.continueButtonText}>המשך</Text>
        </Pressable>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>חזרה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 20 },
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginTop: 16, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 60 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  suggestionBanner: { backgroundColor: "#FFF4E0", borderRadius: 10, padding: 14, marginTop: 20 },
  suggestionText: { fontSize: 15, textAlign: "right", color: "#7A5B00" },
  continueButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 24 },
  continueButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 16, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

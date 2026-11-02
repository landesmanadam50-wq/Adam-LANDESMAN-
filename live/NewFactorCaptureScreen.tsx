import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { createReviewLaterFactor } from "../arc/reviewLaterFactor.ts";
import { URGE_NEED_LABELS, URGE_NEED_OPTIONS } from "../arc/reviewLaterFactor.ts";
import type { UrgeNeed } from "../arc/reviewLaterFactor.ts";
import { resolveFactorKindFromThoughtVsBeliefGate, THOUGHT_VS_BELIEF_ANSWER_LABELS, THOUGHT_VS_BELIEF_ANSWER_OPTIONS } from "../arc/thoughtVsBeliefGate.ts";
import type { ThoughtVsBeliefAnswer } from "../arc/thoughtVsBeliefGate.ts";
import { appendReviewLaterFactor } from "../data/storage.ts";
import type { SavedFactorKind } from "./SavedFactorChooserScreen.tsx";

type Phase = { step: "gate" } | { step: "label"; resolvedKind: SavedFactorKind } | { step: "need"; resolvedKind: SavedFactorKind; label: string };

/**
 * live/NewFactorCaptureScreen.tsx (route /tasks/[id]/factor/new)
 *
 * Productivity roadmap, Stages Q (new urge)/R/S (new thought/belief)/T
 * (thought-vs-belief gate): "allow a short text label; do not force a
 * long BUILD process during the task; offer neutral support; return
 * to the task; save the factor for later BUILD or coaching review."
 * One shared screen for all three kinds -- never a long investigation
 * mid-task. Saves via arc/reviewLaterFactor.ts (a side collection,
 * never a real UrgeArc/ThoughtArc/BeliefArc -- turning this into one
 * is always a deliberate, later BUILD action) and always continues
 * into live/NeutralRegulationScreen.tsx, which itself returns to the
 * task.
 */
export default function NewFactorCaptureScreen({ taskId, factorKind }: { taskId: string; factorKind: SavedFactorKind }) {
  const [phase, setPhase] = useState<Phase>(factorKind === "urge" ? { step: "label", resolvedKind: "urge" } : { step: "gate" });
  const [labelText, setLabelText] = useState("");

  async function finish(resolvedKind: SavedFactorKind, label: string, need: UrgeNeed | null) {
    const factor = createReviewLaterFactor(resolvedKind, label, need, taskId, new Date().toISOString());
    await appendReviewLaterFactor(factor);
    router.replace({ pathname: "/tasks/[id]/factor/neutral", params: { id: taskId } });
  }

  if (phase.step === "gate") {
    function answer(value: ThoughtVsBeliefAnswer) {
      setPhase({ step: "label", resolvedKind: resolveFactorKindFromThoughtVsBeliefGate(value) });
    }
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>האם זה מתאר רק את המצב הזה, או משהו רחב יותר שאתה מאמין עליו?</Text>
          {THOUGHT_VS_BELIEF_ANSWER_OPTIONS.map((option) => (
            <Pressable key={option} style={styles.optionRow} onPress={() => answer(option)}>
              <Text style={styles.optionText}>{THOUGHT_VS_BELIEF_ANSWER_LABELS[option]}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (phase.step === "label") {
    const { resolvedKind } = phase;
    function next() {
      const trimmed = labelText.trim();
      if (!trimmed) return;
      if (resolvedKind === "urge") {
        setPhase({ step: "need", resolvedKind, label: trimmed });
        return;
      }
      finish(resolvedKind, trimmed, null);
    }
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>אפשר לכתוב במשפט קצר מה קורה (לא נדרש לבנות כרגע פרוטוקול מלא)</Text>
          <TextInput style={styles.textInput} value={labelText} onChangeText={setLabelText} textAlign="right" multiline />
          <Pressable style={[styles.primaryButton, !labelText.trim() && styles.primaryButtonDisabled]} onPress={next}>
            <Text style={styles.primaryButtonText}>המשך</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // phase.step === "need"
  const { resolvedKind, label } = phase;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>איזה צורך אולי עומד מתחת לדחף? (רשות)</Text>
        <View style={styles.chipRow}>
          {URGE_NEED_OPTIONS.map((need) => (
            <Pressable key={need} style={styles.chip} onPress={() => finish(resolvedKind, label, need)}>
              <Text style={styles.chipText}>{URGE_NEED_LABELS[need]}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.secondaryButton} onPress={() => finish(resolvedKind, label, null)}>
          <Text style={styles.secondaryButtonText}>דלג</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  optionRow: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14, marginBottom: 10 },
  optionText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 70, marginBottom: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 16 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
});

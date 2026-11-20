import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PSYCHOLOGY_FACTS, resolveNextPsychologyFactIndex } from "../arc/psychologyFacts.ts";
import type { PsychologyFact } from "../arc/psychologyFacts.ts";
import { loadPsychologyFactProgress, savePsychologyFactProgress } from "../data/storage.ts";

/**
 * live/PsychologyFactLaunchOverlay.tsx
 *
 * Psychology/Smiling/Positive-Reinforcement task, feature 1: "every
 * time the user opens ARCHI, display one... psychology fact."
 * Immediately dismissible; never blocks navigation underneath for
 * longer than the trainee chooses to look at it.
 *
 * Manifest Upgrade task, requirement 4: no longer mounted directly in
 * app/_layout.tsx -- that "every single launch" behavior is now
 * explicitly superseded by live/DailyStartupSequenceOverlay.tsx, which
 * shows this same fact (same selection/rotation logic, inlined there)
 * as the FIRST of its own two once-per-day popups, immediately
 * followed by the Manifest visualization. This file and its own
 * fact/rotation logic are otherwise unchanged and still a complete,
 * independently mountable component -- kept, never deleted, per this
 * codebase's own "add new, stop linking the old one" convention.
 */
export default function PsychologyFactLaunchOverlay() {
  const [fact, setFact] = useState<PsychologyFact | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadPsychologyFactProgress().then(async (progress) => {
      const nextIndex = resolveNextPsychologyFactIndex(progress.lastFactIndex);
      await savePsychologyFactProgress({ lastFactIndex: nextIndex });
      setFact(PSYCHOLOGY_FACTS[nextIndex]);
    });
  }, []);

  if (!fact || dismissed) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>הידעת?</Text>
        <Text style={styles.text}>{fact.text}</Text>
        <Text style={styles.reference}>{fact.reference}</Text>
        <Text style={styles.connection}>{fact.arcConnection}</Text>
        <Pressable style={styles.button} onPress={() => setDismissed(true)}>
          <Text style={styles.buttonText}>הבנתי</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 10, color: "#0a7ea4" },
  text: { fontSize: 16, textAlign: "right", color: "#222", lineHeight: 23, marginBottom: 10 },
  reference: { fontSize: 12, textAlign: "right", color: "#888", marginBottom: 10 },
  connection: { fontSize: 13, textAlign: "right", color: "#555", lineHeight: 19, marginBottom: 16 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

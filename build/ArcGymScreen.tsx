import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolveArcGymBehaviorOptions } from "../arc/arcGym.ts";
import type { ArcGymBehaviorOption } from "../arc/arcGym.ts";
import { loadPurposeManifests } from "../data/storage.ts";

/**
 * build/ArcGymScreen.tsx (route /arc-gym)
 *
 * ARC GYM task, requirement 2: the entry screen -- "retrieve behaviors
 * from the existing Manifest data, do not invent or hardcode behaviors."
 * Reads arc/purposeManifest.ts's own PurposeManifest.behaviors (via the
 * shared resolveArcGymBehaviorOptions), never a second, duplicated
 * "behavior" list. "If no behaviors exist, guide the user to the
 * existing Manifest setup" -- the empty-state below links straight to
 * the existing /purpose-manifests screen, never a new setup flow of
 * its own.
 */
export default function ArcGymScreen() {
  const [behaviors, setBehaviors] = useState<ArcGymBehaviorOption[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPurposeManifests().then((manifests) => setBehaviors(resolveArcGymBehaviorOptions(manifests)));
    }, [])
  );

  function openBehavior(option: ArcGymBehaviorOption) {
    router.push({ pathname: "/arc-gym/behavior/[behaviorId]", params: { behaviorId: option.behaviorId, manifestId: option.manifestId } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🏋️ ARC GYM — חדר הכושר של ARC</Text>
        <Text style={styles.subtitle}>תרגל את ההתנהגויות שאתה רוצה לפתח.</Text>

        {/*
         * ARCHI -- Unified Development Specification task, Part 1: the
         * ARC Memory exercise type is a second, independent ARC GYM
         * exercise type -- never merged into the Behaviour list below,
         * which stays exactly as it was, reading only Manifest
         * behaviors.
         */}
        <Pressable style={styles.memoryLinkCard} onPress={() => router.push("/arc-gym/memory")}>
          <Text style={styles.memoryLinkText}>🧠 תרגילי זיכרון (ARC Memory)</Text>
        </Pressable>

        {/*
         * ARCHI -- ARC Result: Automatic, Optional Suggestion Without
         * Extra Shortcuts task, section 7: a third, independent ARC GYM
         * exercise type -- creation/editing/task-linking/management all
         * live here, never on Home or the floating cube (section 2).
         */}
        <Pressable style={styles.resultLinkCard} onPress={() => router.push("/arc-gym/result")}>
          <Text style={styles.resultLinkText}>🏆 תרגילי הצלחה (ARC Result)</Text>
        </Pressable>

        {/*
         * ARC Focus task: a fourth, independent ARC GYM exercise type --
         * a sustained-attention drill (focus point, rhythmic taps,
         * growing stages) reached only from here, never from Home or the
         * floating cube, same precedent as Memory/Result above.
         */}
        <Pressable style={styles.arcFocusLinkCard} onPress={() => router.push("/arc-gym/arc-focus")}>
          <Text style={styles.arcFocusLinkText}>🎯 ARC Focus</Text>
        </Pressable>

        {behaviors === null && <Text style={styles.hint}>טוען...</Text>}

        {behaviors !== null && behaviors.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>עדיין לא הגדרת התנהגויות במניפסט שלך.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push("/purpose-manifests")}>
              <Text style={styles.primaryButtonText}>מעבר להגדרת מניפסט</Text>
            </Pressable>
          </View>
        )}

        {behaviors !== null && behaviors.length > 0 && (
          <>
            <Text style={styles.question}>איזו התנהגות מהמניפסט תרצה לתרגל?</Text>
            <View style={styles.chipColumn}>
              {behaviors.map((option) => (
                <Pressable key={option.behaviorId} style={styles.optionCard} onPress={() => openBehavior(option)}>
                  <Text style={styles.optionText}>{option.text}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  memoryLinkCard: { borderWidth: 1, borderColor: "#7B1FA2", borderRadius: 12, padding: 14, alignItems: "flex-end", marginBottom: 12 },
  memoryLinkText: { color: "#7B1FA2", fontSize: 15, fontWeight: "600", textAlign: "right" },
  resultLinkCard: { borderWidth: 1, borderColor: "#B8860B", borderRadius: 12, padding: 14, alignItems: "flex-end", marginBottom: 12 },
  resultLinkText: { color: "#B8860B", fontSize: 15, fontWeight: "600", textAlign: "right" },
  arcFocusLinkCard: { borderWidth: 1, borderColor: "#1565C0", borderRadius: 12, padding: 14, alignItems: "flex-end", marginBottom: 20 },
  arcFocusLinkText: { color: "#1565C0", fontSize: 15, fontWeight: "600", textAlign: "right" },
  question: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  chipColumn: { gap: 10 },
  optionCard: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 12, padding: 16, alignItems: "flex-end" },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600", textAlign: "right" },
  emptyCard: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 20, alignItems: "center", gap: 14, marginTop: 10 },
  emptyText: { fontSize: 15, textAlign: "center", color: "#444" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
});

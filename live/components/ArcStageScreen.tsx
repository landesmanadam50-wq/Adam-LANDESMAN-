/**
 * live/components/ArcStageScreen.tsx
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("One Screen Per Stage" / "Simple, Positive Interface"): the one
 * reusable shell every later Phase-2 stage screen (Dwelling,
 * Acceptance, Regulation, Encoding, ...) is meant to be built from --
 * "Each stage must present all of its relevant instructions together,"
 * "Do not divide one stage into multiple consecutive instruction-only
 * pages." Pure presentation, no ARC session/engine knowledge of its
 * own: every piece of content (title, instructions, the visual slot,
 * button labels/handlers) is supplied by the caller, so this component
 * never needs to change when the ARC step order or content does.
 *
 * Reuses this app's existing visual language (the same colors/shapes
 * live/NewArcLiveScreen.tsx's own styles already use for its primary/
 * secondary buttons and link text) -- "Preserve ARCHI's current visual
 * identity," never a second, competing design system.
 */

import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface ArcStageScreenProps {
  title: string;
  /** The animated Presence motif and/or the interactive body map -- rendered directly beneath the title, above the instruction text. Optional: not every future stage necessarily needs a visual (kept optional rather than forcing every caller to pass an empty slot). */
  visual?: ReactNode;
  /** Each string is its own paragraph, with clear vertical spacing between them -- "short and direct... free from repeated explanations," never one dense block. */
  instructions: string[];
  /** Interactive content for this stage (e.g. a body-region picker, a movement/sensation confirmation) -- rendered between the instructions and the primary button, "integrate the interaction into the relevant stage screen wherever feasible." */
  children?: ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  /** Necessary Back/Pause/Stop controls -- each optional and independent; omitting a handler simply omits that one control, never a forced, meaningless button. */
  onBack?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  pauseLabel?: string;
}

export default function ArcStageScreen({
  title,
  visual,
  instructions,
  children,
  onContinue,
  continueLabel = "המשך",
  continueDisabled = false,
  onBack,
  onPause,
  onStop,
  pauseLabel = "השהה",
}: ArcStageScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>

        {visual && <View style={styles.visualSlot}>{visual}</View>}

        <View style={styles.instructions}>
          {instructions.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.instructionLine}>
              {line}
            </Text>
          ))}
        </View>

        {children && <View style={styles.childrenSlot}>{children}</View>}

        <Pressable style={[styles.primaryButton, continueDisabled && styles.disabledButton]} disabled={continueDisabled} onPress={onContinue}>
          <Text style={styles.primaryButtonText}>{continueLabel}</Text>
        </Pressable>

        {(onBack || onPause || onStop) && (
          <View style={styles.secondaryRow}>
            {onStop && (
              <Pressable onPress={onStop}>
                <Text style={styles.linkText}>עצור</Text>
              </Pressable>
            )}
            {onPause && (
              <Pressable onPress={onPause}>
                <Text style={styles.linkText}>{pauseLabel}</Text>
              </Pressable>
            )}
            {onBack && (
              <Pressable onPress={onBack}>
                <Text style={styles.linkText}>חזור</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  visualSlot: { alignItems: "center", marginBottom: 20 },
  instructions: { marginBottom: 16 },
  // "Clear vertical spacing between individual instructions" -- each
  // line gets its own generous bottom margin, never packed into one
  // paragraph.
  instructionLine: { fontSize: 17, textAlign: "right", color: "#222", lineHeight: 25, marginBottom: 14 },
  childrenSlot: { marginBottom: 16 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  disabledButton: { opacity: 0.5 },
  secondaryRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 24, marginTop: 18 },
  linkText: { color: "#666", fontSize: 14 },
});

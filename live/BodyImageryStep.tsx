import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BodyImagery } from "../arc/bodyImagery.ts";

/**
 * live/BodyImageryStep.tsx
 *
 * ARC Link task: the ONE reusable presentational component for a
 * regulation/encoding imagery screen, used by BOTH live/ArcLinkScreen.tsx
 * and live/MiniArcLinkScreen.tsx (per the spec's own explicit "Create
 * one reusable BodyImageryStep component" instruction) -- shows the
 * selected anchor, its involved body parts, and its saved personalized
 * imagery instruction, plus any additional lines the caller passes
 * (e.g. Encoding's desired-state/identity-mantra line). Purely
 * presentational: never fetches data itself, never starts a timer.
 */
export interface BodyImageryStepProps {
  title: string;
  /** The selected regulation anchor / encoding action's own label or instruction text -- omitted entirely (never shown as an empty line) when blank. */
  anchorLabel: string;
  bodyImagery: BodyImagery;
  /** Extra lines shown after the body-imagery instruction (e.g. Encoding's desired-state/identity line) -- always rendered, never skipped for being "just" additional context. */
  extraLines?: string[];
  buttonLabel: string;
  onContinue: () => void;
}

export default function BodyImageryStep({ title, anchorLabel, bodyImagery, extraLines, buttonLabel, onContinue }: BodyImageryStepProps) {
  const bodyParts = bodyImagery.bodyParts.filter((part) => part.trim().length > 0);
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      {anchorLabel.trim().length > 0 && <Text style={styles.body}>{`דמיין שאתה מבצע: ${anchorLabel}.`}</Text>}
      {bodyParts.length > 0 && <Text style={styles.body}>{`מקד את תשומת הלב בדמיון ב${bodyParts.join(" וב")}.`}</Text>}
      {bodyImagery.imageryText.trim().length > 0 && <Text style={styles.body}>{bodyImagery.imageryText}</Text>}
      {(extraLines ?? []).map((line, index) => (
        <Text key={index} style={styles.body}>
          {line}
        </Text>
      ))}
      <Pressable style={[styles.button, styles.fullWidthButton]} onPress={onContinue}>
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

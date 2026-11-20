import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ArcFocusThoughtTrigger } from "../arc/arcFocusEngine.ts";

/**
 * live/ArcFocusThoughtDialog.tsx
 *
 * ARC Focus task: "איזו מחשבה זיהית?" -- opened by either tapping the
 * outer ring (trigger "outerTap") or missing the rhythm tap beyond
 * tolerance (trigger "missedRhythm"). Reward-system revision: logging OR
 * discarding a thought costs nothing -- no smiley loss, no lost active
 * time, no stage change -- so this dialog's three buttons all map to one
 * of exactly two engine transitions (saveThought / discardThoughtEntry),
 * never a punitive fourth option. "No thought -- try again" is shown
 * only for the missed-rhythm trigger, since "I don't remember" alone
 * covers the outer-tap case; both press the SAME discard action.
 */
export default function ArcFocusThoughtDialog({
  visible,
  trigger,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  trigger: ArcFocusThoughtTrigger | null;
  onSave: (text: string) => void;
  onDiscard: () => void;
}) {
  const [text, setText] = useState("");

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setText("");
  }

  function handleDiscard() {
    setText("");
    onDiscard();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDiscard}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>איזו מחשבה זיהית?</Text>
          <TextInput style={styles.textInput} value={text} onChangeText={setText} placeholder="כתוב כאן..." multiline textAlign="right" />
          <Pressable style={[styles.primaryButton, !text.trim() && styles.disabledButton]} disabled={!text.trim()} onPress={handleSave}>
            <Text style={styles.primaryButtonText}>שמור והמשך</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleDiscard}>
            <Text style={styles.secondaryButtonText}>אני לא זוכר</Text>
          </Pressable>
          {trigger === "missedRhythm" && (
            <Pressable style={styles.secondaryButton} onPress={handleDiscard}>
              <Text style={styles.secondaryButtonText}>לא הייתה מחשבה -- נסה שוב</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", gap: 12 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "right" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryButton: { paddingVertical: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14 },
});

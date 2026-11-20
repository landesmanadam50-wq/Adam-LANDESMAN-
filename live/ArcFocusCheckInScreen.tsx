import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { handleArcFocusCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import type { ArcFocusMoodChoice } from "../arc/arcFocusSession.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";

/**
 * live/ArcFocusCheckInScreen.tsx (route /tasks/[id]/arc-focus/check-in)
 *
 * ARC Focus task: the SAME emotional check-in every other entry point in
 * this app already asks ("😟 פחות טוב" / "🙂 סבבה" / "😄 מעולה"), copied
 * structurally from live/ArcGymTrainingScreen.tsx's own check-in block
 * (same Hebrew labels, same visual vocabulary) -- dispatching through
 * data/emotionalCheckInRouting.ts's handleArcFocusCheckInChoice, which
 * reuses the EXISTING Full/Shortened ARC routes for 😟/🙂 (never a
 * duplicated ARC flow) and goes straight into ARC Focus itself for 😄.
 * This screen makes no routing decision of its own beyond relaying the
 * trainee's tap -- "the check-in must run even when schedule-triggered"
 * holds automatically, since live/ActiveTaskScreen.tsx's performStart()
 * always lands here first, for both a manual start and an alarm-
 * triggered one.
 */
export default function ArcFocusCheckInScreen({ id, arcFocusPracticeId }: { id: string; arcFocusPracticeId: string }) {
  function choose(choice: ArcFocusMoodChoice) {
    const returnToTaskId = id === STANDALONE_ARC_TASK_ID ? null : id;
    handleArcFocusCheckInChoice(choice, { arcFocusPracticeId, returnToTaskId });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>🎯 ARC Focus</Text>
        <Text style={styles.prompt}>איך אתה מרגיש כרגע?</Text>
        <View style={styles.checkInRow}>
          <Pressable style={styles.checkInButton} onPress={() => choose("full_arc")}>
            <Text style={styles.checkInEmoji}>😟</Text>
            <Text style={styles.checkInLabel}>פחות טוב</Text>
          </Pressable>
          <Pressable style={styles.checkInButton} onPress={() => choose("shortened_arc")}>
            <Text style={styles.checkInEmoji}>🙂</Text>
            <Text style={styles.checkInLabel}>סבבה</Text>
          </Pressable>
          <Pressable style={styles.checkInButton} onPress={() => choose("direct")}>
            <Text style={styles.checkInEmoji}>😄</Text>
            <Text style={styles.checkInLabel}>מעולה</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center", gap: 20 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  prompt: { fontSize: 18, fontWeight: "600", textAlign: "center", color: "#333" },
  checkInRow: { flexDirection: "row-reverse", gap: 16 },
  checkInButton: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18, alignItems: "center", gap: 6 },
  checkInEmoji: { fontSize: 32 },
  checkInLabel: { fontSize: 14, color: "#333", fontWeight: "600" },
});

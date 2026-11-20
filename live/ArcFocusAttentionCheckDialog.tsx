import { Pressable, StyleSheet, Text, View, Modal } from "react-native";

import type { ArcFocusAttentionAnswer } from "../arc/arcFocusEngine.ts";

/**
 * live/ArcFocusAttentionCheckDialog.tsx
 *
 * ARC Focus task, reward-system revision: a random, rate-limited
 * self-report check -- "ברגע שלפני השאלה, איפה הייתה תשומת הלב שלך?"
 * with exactly three fixed answers, no free text. In every case active
 * time is preserved and smileys are unaffected (the engine excludes the
 * time spent answering from active practice time); only "🎯 הייתי ממוקד
 * בנקודה" resumes with no stage reset, the other two restart the
 * current stage without penalty. This is self-report and can never
 * objectively prove the trainee was actually focused -- the summary
 * screen's own copy says so explicitly, this dialog does not need to.
 */
export default function ArcFocusAttentionCheckDialog({ visible, onAnswer }: { visible: boolean; onAnswer: (answer: ArcFocusAttentionAnswer) => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>ברגע שלפני השאלה, איפה הייתה תשומת הלב שלך?</Text>
          <Pressable style={styles.answerButton} onPress={() => onAnswer("focused")}>
            <Text style={styles.answerEmoji}>🎯</Text>
            <Text style={styles.answerLabel}>הייתי ממוקד בנקודה</Text>
          </Pressable>
          <Pressable style={styles.answerButton} onPress={() => onAnswer("lostInThought")}>
            <Text style={styles.answerEmoji}>💭</Text>
            <Text style={styles.answerLabel}>הייתי שקוע במחשבה</Text>
          </Pressable>
          <Pressable style={styles.answerButton} onPress={() => onAnswer("notSure")}>
            <Text style={styles.answerEmoji}>🤔</Text>
            <Text style={styles.answerLabel}>אני לא בטוח</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", gap: 10 },
  title: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  answerButton: { flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#ccc", borderRadius: 12, padding: 14 },
  answerEmoji: { fontSize: 22 },
  answerLabel: { fontSize: 15, color: "#333", fontWeight: "600" },
});

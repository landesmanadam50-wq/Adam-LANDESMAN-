import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * live/components/EmotionalCheckInButtons.tsx
 *
 * ARC Gym + ARC Goal Integration task: the three-smiley emotional
 * check-in markup (😟 פחות טוב / 🙂 סבבה / 😄 מעולה), extracted verbatim
 * from live/ArcGymTrainingScreen.tsx so ARC Memory's own newly-inserted
 * check-in step (live/ArcGymMemoryVisualizationScreen.tsx) can reuse the
 * exact same Hebrew copy/markup rather than duplicating it -- a pure
 * extraction, zero behavior/style change for ArcGymTrainingScreen.
 *
 * Deliberately generic callback props, never an ArcGymCheckInChoice
 * union: ArcGymTrainingScreen's own third choice means "visualization
 * only" while ARC Memory's third choice means "advance in place,
 * never routing through data/emotionalCheckInRouting.ts at all" --
 * this component only ever renders the three buttons and dispatches
 * whichever callback was tapped, never deciding what that choice means.
 */
export interface EmotionalCheckInButtonsProps {
  onFullArc: () => void;
  onShortenedArc: () => void;
  onExcellent: () => void;
}

export default function EmotionalCheckInButtons({ onFullArc, onShortenedArc, onExcellent }: EmotionalCheckInButtonsProps) {
  return (
    <View style={styles.checkInRow}>
      <Pressable style={styles.checkInButton} onPress={onFullArc}>
        <Text style={styles.checkInEmoji}>😟</Text>
        <Text style={styles.checkInLabel}>פחות טוב</Text>
      </Pressable>
      <Pressable style={styles.checkInButton} onPress={onShortenedArc}>
        <Text style={styles.checkInEmoji}>🙂</Text>
        <Text style={styles.checkInLabel}>סבבה</Text>
      </Pressable>
      <Pressable style={styles.checkInButton} onPress={onExcellent}>
        <Text style={styles.checkInEmoji}>😄</Text>
        <Text style={styles.checkInLabel}>מעולה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  checkInRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10, marginTop: 10 },
  checkInButton: { flex: 1, alignItems: "center", backgroundColor: "#F5FAFD", borderRadius: 14, paddingVertical: 18, borderWidth: 1, borderColor: "#dbe8ef" },
  checkInEmoji: { fontSize: 34 },
  checkInLabel: { fontSize: 13, color: "#444", marginTop: 6, fontWeight: "600" },
});

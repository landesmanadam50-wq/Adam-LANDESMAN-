import { SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";

import { handleEmotionalCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import type { EmotionalCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import EmotionalCheckInButtons from "./components/EmotionalCheckInButtons.tsx";
import FlexibleDailyScreen from "../build/FlexibleDailyScreen.tsx";

/**
 * live/ReplanTimeScreen.tsx
 *
 * ARCHI -- Replan Time task ("תכנון זמן מחדש"): the screen the new
 * replan-time notification opens (data/replanTimeNotification.ts),
 * reached when the trainee's day stops matching the original plan --
 * a task's full allocated window elapsed with nothing ever started.
 * Combines emotional support with a practical way to fix the rest of
 * the day, per spec sections 1-3, by mounting exactly two existing
 * pieces, never a new data source or a second editing mechanism:
 *
 * 1. The question "איך אתה מרגיש כרגע?" + the SAME 3-smiley
 *    EmotionalCheckInButtons/handleEmotionalCheckInChoice dispatcher
 *    every other check-in surface in this app already uses (Home, the
 *    widget, Postponement, ARC GYM/Memory/Perspective/Saving/Focus) --
 *    `returnToReplan: true` is the one extra option, so
 *    live/NewArcLiveScreen.tsx's own returnToTask() comes straight
 *    back here once the exercise finishes, instead of Home or the
 *    task. 😄 ("מעולה") ignores it, exactly like every other
 *    NavigateOptions field resolveAndOpenNextTask doesn't use -- it
 *    opens the current/next task directly, per spec's own "connected
 *    to the existing ARC tracks per the app's current logic."
 * 2. build/FlexibleDailyScreen.tsx with NO `date` prop (so
 *    `isTodayMode` stays true -- every existing sync behavior in its
 *    own reload() keeps firing verbatim) and `hideHomeOnlyCards` --
 *    the exact same woven To-Do+fixed day, every edit capability
 *    (move/reorder To-Do, retime/resize/shorten fixed tasks, add/
 *    remove, urgency/importance rating, resort-by-rating) spec section
 *    3 asks for, with zero new editing UI. Editing here never requires
 *    performing an ARC exercise first -- it's unconditionally rendered
 *    below the check-in, exactly as on Home.
 */
export default function ReplanTimeScreen() {
  function handleCheckIn(choice: EmotionalCheckInChoice) {
    void handleEmotionalCheckInChoice(choice, null, { returnToReplan: true });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תכנון זמן מחדש</Text>
        <Text style={styles.prompt}>איך אתה מרגיש כרגע?</Text>
        <EmotionalCheckInButtons
          onFullArc={() => handleCheckIn("full_arc")}
          onShortenedArc={() => handleCheckIn("shortened_arc")}
          onExcellent={() => handleCheckIn("next_task")}
        />
      </ScrollView>
      <FlexibleDailyScreen hideHomeOnlyCards />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 0 },
  title: { fontSize: 20, fontWeight: "700", color: "#222", textAlign: "right" },
  prompt: { fontSize: 15, color: "#444", textAlign: "right", marginTop: 10 },
});

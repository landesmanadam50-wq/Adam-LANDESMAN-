import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { handleEmotionalCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import type { EmotionalCheckInChoice } from "../data/emotionalCheckInRouting.ts";

/**
 * live/EmotionalCheckInRouteScreen.tsx (route /check-in?choice=...)
 *
 * Unified Emotional Check-In and Task Postponement System, section 2:
 * the ONE deep-link target every Android Home Screen Widget button
 * opens -- `archi://check-in?choice=full_arc|shortened_arc|next_task`
 * (app.json's existing "archi" scheme, the exact same one the
 * floating overlay's own `archi://tasks/$taskId` links already use).
 * This is a momentary stub, never a real screen the trainee lingers
 * on: it immediately resolves through the SAME shared
 * data/emotionalCheckInRouting.ts module the Home check-in bar and the
 * Postponement screen use, with `{ replace: true }` so it never itself
 * sits in the navigation history -- "navigate... without duplicating
 * navigation history." Works identically whether this is a cold start
 * (ARCHI was fully closed -- this is simply the first screen to mount)
 * or the app was already open (a normal deep-link navigation into an
 * already-running instance) -- no separate code path for either case,
 * since router.replace/expo-router's own linking handle both the exact
 * same way.
 */
export default function EmotionalCheckInRouteScreen({ choice }: { choice: EmotionalCheckInChoice | null }) {
  useEffect(() => {
    if (!choice) return;
    handleEmotionalCheckInChoice(choice, null, { replace: true });
  }, [choice]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.hint}>טוען...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 14, color: "#666" },
});

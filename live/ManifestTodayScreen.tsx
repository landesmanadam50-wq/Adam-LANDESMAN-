import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolveTodaysManifestSelection, type ResolvedDailyManifest } from "../data/purposeManifest.ts";
import ManifestVisualizationCard from "./ManifestVisualizationCard.tsx";

/**
 * live/ManifestTodayScreen.tsx (route /manifest-today)
 *
 * Manifest Upgrade task, requirement 6: "allow the user to manually
 * reopen today's Manifest visualization" -- the exact same resolution
 * (resolveTodaysManifestSelection, which reuses today's already-made
 * selection rather than re-rolling it) and the exact same
 * live/ManifestVisualizationCard.tsx used by the once-per-day startup
 * sequence, just reached directly instead of after the psychology
 * fact. Closing this screen never re-marks or affects the daily
 * startup sequence's own "shown today" flag.
 */
export default function ManifestTodayScreen() {
  const [resolved, setResolved] = useState<ResolvedDailyManifest | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      resolveTodaysManifestSelection(new Date()).then(setResolved);
    }, []),
  );

  if (resolved === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (resolved === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>עדיין אין מניפסט שלם. ניתן להגדיר אחד ממסך "המניפסטים שלי".</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ManifestVisualizationCard
          manifest={resolved.manifest}
          behavior={resolved.behavior}
          selection={resolved.selection}
          nextAction={resolved.nextAction}
          onClose={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
});

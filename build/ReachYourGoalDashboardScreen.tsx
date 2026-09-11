import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { loadArcGoals, loadLifeManifests } from "../data/storage.ts";
import type { ArcGoal } from "../arc/types.ts";
import type { LifeManifest } from "../arc/lifeManifest.ts";

function titleFor(manifest: LifeManifest): string {
  return manifest.majorGoals[0]?.title || "מניפסט חיים ללא כותרת";
}

/**
 * New architecture task, Phase 1 (spec section 6): the Reach Your Goal
 * mode's own dashboard -- turning a Life Manifest into an ARC Goal,
 * strengthening identity, then executing sub-goals/targets. Reached
 * only from Home's "השגת מטרה" button; never mixes in Self Development
 * programs (spec section 1's "do not mix... unless the user
 * deliberately links one").
 *
 * Reuses the existing, already-linked Life Manifest <-> ArcGoal screens
 * as-is (arc/lifeManifest.ts's SubGoal.connectedArcGoalId / ArcGoal
 * .lifeManifestSubGoalId are already bidirectional -- see this phase's
 * own investigation report, spec section 7 is already implemented).
 * "LIVE השגת מטרה" routes straight to the existing /arc-goal/select,
 * which was already mode-pure (ARC Goal only, no ARC רגיל mixed in) --
 * unaffected by the Four-Week Program task (that screen itself now
 * branches per-goal, see build/ArcGoalSelectScreen.tsx's own doc). This
 * dashboard's own per-goal row gets one small addition: a goal with an
 * enabled fourWeekProgram shows its current week and a direct link to
 * live/ArcGoalFourWeekDashboardScreen.tsx, alongside its existing
 * "open in BUILD" row -- never replacing it. Sub-goal/target execution
 * and calendar integration (spec sections 10-16) remain later phases.
 */
export default function ReachYourGoalDashboardScreen() {
  const [manifests, setManifests] = useState<LifeManifest[] | null>(null);
  const [arcGoals, setArcGoals] = useState<ArcGoal[] | null>(null);

  const reload = useCallback(() => {
    Promise.all([loadLifeManifests(), loadArcGoals()])
      .then(([loadedManifests, loadedGoals]) => {
        setManifests(loadedManifests);
        setArcGoals(loadedGoals);
      })
      .catch((error) => {
        console.warn("[ReachYourGoalDashboardScreen] Failed to load saved goals -- showing the empty state.", error);
        setManifests([]);
        setArcGoals([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const loading = manifests === null || arcGoals === null;
  const hasAny = !loading && (manifests!.length > 0 || arcGoals!.length > 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>השגת מטרה</Text>
        <Text style={styles.subtitle}>מניפסט חיים ← ARC Goal ← חיזוק זהות ← תתי־מטרות ויעדים.</Text>

        {!loading && !hasAny && <Text style={styles.hint}>עדיין אין כאן מניפסט חיים או מטרת ARC Goal. אפשר להתחיל למטה.</Text>}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/arc-goal/select")}>
          <Text style={styles.buttonText}>LIVE השגת מטרה</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{`מניפסטים${!loading ? ` (${manifests!.length})` : ""}`}</Text>
        {!loading &&
          manifests!.map((manifest) => (
            <Pressable
              key={manifest.id}
              style={styles.itemRow}
              onPress={() => router.push({ pathname: "/life-manifest/[id]", params: { id: manifest.id } })}
            >
              <Text style={styles.itemText}>{titleFor(manifest)}</Text>
            </Pressable>
          ))}
        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/life-manifest")}>
          <Text style={styles.buttonText}>מניפסט החיים שלי</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{`מטרות ARC Goal${!loading ? ` (${arcGoals!.length})` : ""}`}</Text>
        {!loading &&
          arcGoals!.map((goal) => (
            <View key={goal.id} style={styles.goalRowColumn}>
              <Pressable style={styles.itemRow} onPress={() => router.push({ pathname: "/goals/[id]", params: { id: goal.id } })}>
                <Text style={styles.itemText}>{goal.name}</Text>
              </Pressable>
              {goal.fourWeekProgram?.enabled && (
                <Pressable
                  style={styles.fourWeekRow}
                  onPress={() => router.push({ pathname: "/goals/live/[goalId]", params: { goalId: goal.id } })}
                >
                  <Text style={styles.fourWeekRowText}>{`תוכנית ארבעת השבועות -- שבוע ${goal.fourWeekProgram.currentWeek}`}</Text>
                </Pressable>
              )}
            </View>
          ))}
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/goals")}>
          <Text style={styles.secondaryButtonText}>ניהול מטרות ARC Goal</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.replace("/")}>
          <Text style={styles.backButtonText}>חזרה לבחירת מצב</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 24, marginBottom: 8 },
  itemRow: {
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  itemText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
  goalRowColumn: { marginBottom: 8 },
  fourWeekRow: { backgroundColor: "#f7fbfd", borderRadius: 8, padding: 8, marginTop: -4, marginBottom: 8 },
  fourWeekRowText: { fontSize: 13, textAlign: "right", color: "#1a6b4a", fontWeight: "600" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  backButton: { marginTop: 28, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  getArcGoal,
  loadArcBuilds,
  loadArcLinks,
  loadMiniArcBuilds,
  loadRoutineTriggers,
  loadWeeklyActions,
} from "../data/storage.ts";
import type { ArcBuild, ArcGoal } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import type { ArcLink, RoutineTrigger, WeeklyAction } from "../arc/routineLinks.ts";
import { buildLinkLibraryEntries } from "../arc/linkPracticeLibrary.ts";
import type { LinkLibraryEntry } from "../arc/linkPracticeLibrary.ts";
import { FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL } from "../arc/futureArcLink.ts";

const TARGET_TYPE_LABELS: Record<string, string> = {
  state: "ARC State",
  urge: "ARC Urge",
  thought: "ARC Thought",
  presence: "ARC Presence",
  belief: "ARC Belief",
  direct_action: "פעולה ישירה",
  legacy_generic: "",
};

const MINI_KIND_LABELS: Record<string, string> = {
  state: "ARC Mini State",
  urge: "ARC Mini Urge",
  thought: "ARC Mini Thought",
  presence: "ARC Mini Presence",
  belief: "ARC Mini Belief",
  generic: "",
};

/**
 * live/LinkPracticeLibraryScreen.tsx (route: /link-practice)
 *
 * General Link Practice area task (spec section 8), updated by the ARC
 * completion/Link simplification task (spec sections 1/11/12): "תרגול
 * קישורים" is a library view over every saved ArcLink record, including
 * Links from both Personal Development and Goal Achievement (a Goal
 * Achievement entry is labeled with its ArcGoal name) -- but the OLD
 * "ARC Link" / "ARC Mini Link" category split is now internal-only
 * (arc/linkPracticeLibrary.ts's own `category` field, kept for pure-
 * logic bookkeeping) and never shown to the user as a picker: every
 * entry is offered as "קישור ARC עתידי מקוצר" and opens the SAME
 * /future-arc-link/[id] route every other Future Link entry point uses
 * (arc/futureArcLink.ts), never the old /arc-link/[id] or
 * /mini-arc-link/[id] rehearsal screens. An entry whose
 * futureLinkBuildId cannot be resolved (a stale/unlinked Mini ARC Link
 * with no parent Full ARC) is simply not offered here -- nothing here
 * ever copies or duplicates a saved Link record, and nothing here
 * auto-opens a real-time protocol.
 */
export default function LinkPracticeLibraryScreen() {
  const [entries, setEntries] = useState<LinkLibraryEntry[]>([]);
  const [goalNamesById, setGoalNamesById] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadArcLinks(), loadArcBuilds(), loadMiniArcBuilds(), loadRoutineTriggers(), loadWeeklyActions()]).then(
      async ([links, arcBuilds, miniArcBuilds, triggers, weeklyActions]: [ArcLink[], ArcBuild[], MiniArcBuild[], RoutineTrigger[], WeeklyAction[]]) => {
        const arcBuildsById = Object.fromEntries(arcBuilds.map((b) => [b.id, b]));
        const miniArcBuildsById = Object.fromEntries(miniArcBuilds.map((b) => [b.id, b]));
        const triggersById = Object.fromEntries(triggers.map((t) => [t.id, t]));
        const weeklyActionsById = Object.fromEntries(weeklyActions.map((w) => [w.id, w]));
        const built = buildLinkLibraryEntries(
          links.filter((link) => link.enabled),
          arcBuildsById,
          miniArcBuildsById,
          triggersById,
          weeklyActionsById
        );
        setEntries(built);

        const goalIds = Array.from(new Set(built.map((entry) => entry.linkedArcGoalId).filter((id): id is string => id !== null)));
        const goals = await Promise.all(goalIds.map((id) => getArcGoal(id)));
        const names: Record<string, string> = {};
        goals.forEach((goal: ArcGoal | null, index) => {
          if (goal) names[goalIds[index]] = goal.name;
        });
        setGoalNamesById(names);
        setLoaded(true);
      }
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const visible = entries.filter((entry) => entry.futureLinkBuildId !== null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תרגול קישורים</Text>
        <Text style={styles.body}>ספריית הקישורים השמורים שלך -- לא מוגבלת למצב, למטרה או לפרוטוקול אחד.</Text>

        {loaded && visible.length === 0 && <Text style={styles.emptyText}>אין עדיין קישורים שמורים.</Text>}

        {visible.map((entry) => {
          const targetLabel = TARGET_TYPE_LABELS[entry.targetType] ?? "";
          const miniKindLabel = entry.miniArcProtocolKind ? MINI_KIND_LABELS[entry.miniArcProtocolKind] : "";
          const goalName = entry.linkedArcGoalId ? goalNamesById[entry.linkedArcGoalId] : null;
          return (
            <View key={entry.link.id} style={styles.card}>
              <Text style={styles.cardTitle}>{entry.protocolName || "פרוטוקול לא נמצא"}</Text>
              {entry.trigger.length > 0 && <Text style={styles.cardRow}>{`טריגר: ${entry.trigger}`}</Text>}
              {targetLabel.length > 0 && <Text style={styles.cardRow}>{`יעד: ${targetLabel}`}</Text>}
              {miniKindLabel && miniKindLabel.length > 0 && <Text style={styles.cardRow}>{`Mini: ${miniKindLabel}`}</Text>}
              <Text style={styles.cardRow}>{entry.mode === "with_archi" ? "אופן: עם ARCHI" : "אופן: ללא ARCHI"}</Text>
              {goalName ? (
                <Text style={styles.cardRowGoal}>{`מטרת ARC Goal: ${goalName}`}</Text>
              ) : (
                <Text style={styles.cardRowGoal}>פיתוח אישי</Text>
              )}
              <Pressable
                style={[styles.startButton, styles.fullWidthButton]}
                onPress={() =>
                  router.push({
                    pathname: "/future-arc-link/[id]",
                    params: { id: entry.futureLinkBuildId as string, linkId: entry.link.id },
                  })
                }
              >
                <Text style={styles.startButtonText}>{FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL}</Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>חזרה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  body: { fontSize: 15, textAlign: "right", marginBottom: 16, lineHeight: 21, color: "#555" },
  emptyText: { fontSize: 15, textAlign: "right", color: "#888", marginBottom: 16 },
  card: { backgroundColor: "#F7FAFC", borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  cardRow: { fontSize: 14, textAlign: "right", color: "#444", marginBottom: 4 },
  cardRowGoal: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginTop: 4, marginBottom: 8 },
  startButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  startButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  fullWidthButton: { marginTop: 6 },
  backButton: { marginTop: 8, paddingVertical: 12, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

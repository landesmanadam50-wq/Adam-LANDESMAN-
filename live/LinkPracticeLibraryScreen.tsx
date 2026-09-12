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
import { buildLinkLibraryEntries, filterLinkLibraryEntries } from "../arc/linkPracticeLibrary.ts";
import type { LinkLibraryCategory, LinkLibraryEntry } from "../arc/linkPracticeLibrary.ts";

const TARGET_TYPE_LABELS: Record<string, string> = {
  state: "ARC State",
  urge: "ARC Urge",
  thought: "ARC Thought",
  presence: "ARC Presence",
  belief: "ARC Belief",
  direct_action: "פעולה ישירה",
  legacy_generic: "",
};

const PRACTICE_MODE_LABELS: Record<string, string> = {
  short: "קישור קצר",
  full: "תרגול מלא",
  fast: "תרגול מהיר",
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
 * General Link Practice area task (spec section 8): "תרגול קישורים" --
 * a library view over every saved ArcLink, split into "ARC Link" and
 * "ARC Mini Link" categories, including Links from both Personal
 * Development and Goal Achievement (a Goal Achievement entry is
 * labeled with its ArcGoal name). Purely a navigation aggregator over
 * arc/linkPracticeLibrary.ts's pure list-building logic -- opening an
 * entry navigates to the EXACT SAME existing rehearsal screens
 * (live/ArcLinkScreen.tsx / live/MiniArcLinkScreen.tsx) every other
 * entry point already uses; nothing here ever copies or duplicates a
 * saved Link record, and nothing here auto-opens a real-time protocol.
 */
export default function LinkPracticeLibraryScreen() {
  const [entries, setEntries] = useState<LinkLibraryEntry[]>([]);
  const [goalNamesById, setGoalNamesById] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<LinkLibraryCategory>("arc_link");
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

  const visible = filterLinkLibraryEntries(entries, category);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תרגול קישורים</Text>
        <Text style={styles.body}>ספריית הקישורים השמורים שלך -- לא מוגבלת למצב, למטרה או לפרוטוקול אחד.</Text>

        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, category === "arc_link" && styles.chipSelected]} onPress={() => setCategory("arc_link")}>
            <Text style={styles.chipText}>ARC Link</Text>
          </Pressable>
          <Pressable style={[styles.chip, category === "mini_arc_link" && styles.chipSelected]} onPress={() => setCategory("mini_arc_link")}>
            <Text style={styles.chipText}>ARC Mini Link</Text>
          </Pressable>
        </View>

        {loaded && visible.length === 0 && <Text style={styles.emptyText}>אין עדיין קישורים שמורים בקטגוריה הזאת.</Text>}

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
              {category === "arc_link" && <Text style={styles.cardRow}>{`מצב תרגול: ${PRACTICE_MODE_LABELS[entry.practiceMode]}`}</Text>}
              <Text style={styles.cardRow}>{entry.mode === "with_archi" ? "אופן: עם ARCHI" : "אופן: ללא ARCHI"}</Text>
              {goalName ? (
                <Text style={styles.cardRowGoal}>{`מטרת ARC Goal: ${goalName}`}</Text>
              ) : (
                <Text style={styles.cardRowGoal}>פיתוח אישי</Text>
              )}
              <Pressable
                style={[styles.startButton, styles.fullWidthButton]}
                onPress={() =>
                  router.push(
                    entry.category === "arc_link"
                      ? { pathname: "/arc-link/[id]", params: { id: entry.link.protocolId, linkId: entry.link.id } }
                      : { pathname: "/mini-arc-link/[id]", params: { id: entry.link.protocolId, linkId: entry.link.id } }
                  )
                }
              >
                <Text style={styles.startButtonText}>התחלת התרגול</Text>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 16 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
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

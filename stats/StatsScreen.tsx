import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getOrCreatePilotStartedAt, loadProgramProgress, loadProgramSelection, loadSessionLog, saveProgramProgress } from "../data/storage.ts";
import { computeWeeklyStats, type WeekStat } from "../data/weeklyStats.ts";
import { computePilotProgress, type PilotProgress } from "../data/pilotProgress.ts";
import { getProgramDefinition } from "../program/engine.ts";
import { reconcileProgramProgress } from "../program/progress.ts";
import type { ArcProgramProgress, DevelopmentLayer } from "../arc/types.ts";

const LAYER_LABELS: Record<DevelopmentLayer, string> = {
  state: "מצב",
  identity: "זהות",
  habit: "הרגל",
};

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<WeekStat[]>([]);
  const [pilotProgress, setPilotProgress] = useState<PilotProgress | null>(null);
  const [programProgress, setProgramProgress] = useState<ArcProgramProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSessionLog(), getOrCreatePilotStartedAt(), loadProgramProgress(), loadProgramSelection()]).then(
      ([entries, pilotStartedAt, storedProgram, selection]) => {
        if (cancelled) return;
        // See program/progress.ts's reconcileProgramProgress: a stored
        // ArcProgramProgress can be stale relative to the trainee's
        // current ArcProgramSelection (e.g. left over from before the
        // current program was restored), which would otherwise leave
        // this screen showing nothing or the wrong program.
        const program = reconcileProgramProgress(storedProgram, selection);
        if (program && program !== storedProgram) {
          saveProgramProgress(program);
        }
        setWeeks(computeWeeklyStats(entries));
        setPilotProgress(computePilotProgress(pilotStartedAt));
        setProgramProgress(program);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>התקדמות שבועית</Text>

        {pilotProgress && (
          <Text style={styles.pilotProgress}>
            {pilotProgress.isComplete
              ? `הפיילוט הסתיים (${pilotProgress.totalWeeks} שבועות)`
              : `שבוע ${pilotProgress.currentWeek} מתוך ${pilotProgress.totalWeeks} (${pilotProgress.weeksRemaining} שבועות נותרו)`}
          </Text>
        )}

        {programProgress && (
          <Text style={styles.programProgress}>
            {programProgress.programCompleted
              ? `התוכנית הושלמה (${getProgramDefinition(programProgress.programPath).totalWeeks} שבועות)`
              : `תוכנית: שבוע ${programProgress.currentProgramWeek} מתוך ${getProgramDefinition(programProgress.programPath).totalWeeks} · ${programProgress.activeLayers.map((l) => LAYER_LABELS[l]).join(", ")}`}
          </Text>
        )}

        {!loading && weeks.length === 0 && <Text style={styles.body}>עדיין אין סשנים מתועדים.</Text>}

        {weeks.map((week) => (
          <View key={week.weekKey} style={styles.weekRow}>
            <Text style={styles.weekKey}>{week.weekKey}</Text>
            <View style={styles.weekStats}>
              <Text style={styles.stat}>{`סשנים: ${week.sessions}`}</Text>
              <Text style={[styles.stat, styles.success]}>{`הצלחות: ${week.successes}`}</Text>
              <Text style={[styles.stat, styles.fall]}>{`נפילות: ${week.falls}`}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    textAlign: "right",
  },
  pilotProgress: {
    fontSize: 15,
    textAlign: "right",
    color: "#0a7ea4",
    marginBottom: 8,
  },
  programProgress: {
    fontSize: 15,
    textAlign: "right",
    color: "#444",
    marginBottom: 20,
  },
  weekRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 12,
  },
  weekKey: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 4,
  },
  weekStats: {
    flexDirection: "row-reverse",
    gap: 16,
  },
  stat: {
    fontSize: 14,
    color: "#444",
  },
  success: {
    color: "#0a7ea4",
  },
  fall: {
    color: "#c0392b",
  },
});

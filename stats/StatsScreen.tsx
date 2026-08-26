import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { loadSessionLog } from "../data/storage.ts";
import { computeWeeklyStats, type WeekStat } from "../data/weeklyStats.ts";

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<WeekStat[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadSessionLog().then((entries) => {
      if (cancelled) return;
      setWeeks(computeWeeklyStats(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>התקדמות שבועית</Text>

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

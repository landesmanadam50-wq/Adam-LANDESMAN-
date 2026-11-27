/**
 * live/ArcAddictionProgressScreen.tsx (route: /arc-addiction/progress/[id])
 *
 * Personal progress for one ARC Addiction profile: summary metrics,
 * separate graphs for wait time and behavior duration (each with its
 * own direction-only trend), frequency, urge intensity, efficacy and
 * self-acceptance, plus the practice history. Pace controls (hold /
 * lower the target, change the step) are one tap away – and the screen
 * states plainly that progress is never reset.
 */

import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { AddictionProfile } from "../arc/arcAddiction.ts";
import type { AddictionProfileStats, HistoryRow } from "../arc/arcAddictionStats.ts";
import { buildAddictionHistoryRows, computeAddictionProfileStats, OUTCOME_LABELS } from "../arc/arcAddictionStats.ts";
import { PROGRESS_NOT_RESET_NOTE, TREND_LABELS } from "../arc/arcAddictionCopy.ts";
import { decreaseWaitTarget, setWaitProgression } from "../arc/arcAddictionProgression.ts";
import { getAddictionProfile, loadAddictionEpisodesForProfile, upsertAddictionProfile } from "../data/arcAddictionStorage.ts";
import ArcAddictionLineChart from "./components/ArcAddictionLineChart.tsx";
import { ARC_ADDICTION_COLORS, arcAddictionStyles as styles } from "./components/arcAddictionStyles.ts";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "48%", padding: 10, borderRadius: 10, backgroundColor: "#F6F8FA", marginBottom: 8 }}>
      <Text style={[styles.muted, { marginBottom: 2 }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: "700", marginBottom: 0 }]}>{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function ArcAddictionProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<AddictionProfile | null | undefined>(undefined);
  const [stats, setStats] = useState<AddictionProfileStats | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const reload = useCallback(() => {
    const profileId = String(id);
    Promise.all([getAddictionProfile(profileId), loadAddictionEpisodesForProfile(profileId)])
      .then(([loaded, episodes]) => {
        const nowIso = new Date().toISOString();
        setProfile(loaded);
        setStats(computeAddictionProfileStats(episodes, profileId, nowIso));
        setHistory(buildAddictionHistoryRows(episodes, profileId, nowIso));
      })
      .catch(() => setProfile(null));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (profile === undefined) return <SafeAreaView style={styles.safeArea} />;
  if (!profile || !stats) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.body}>הפרופיל לא נמצא.</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function savePace(next: AddictionProfile) {
    await upsertAddictionProfile(next);
    reload();
  }

  const nowIso = () => new Date().toISOString();
  const avg = (value: number | null) => (value === null ? "—" : `${value} דק'`);
  const weeklyActed = stats.weekly.map((week) => ({ at: week.weekKey, value: week.acted }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{profile.name}</Text>
        <Text style={styles.subtitle}>התקדמות אישית</Text>

        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Metric label="יעד המתנה נוכחי" value={`${profile.waitTargetMinutes} דק'`} />
          <Metric label="יעד משך התנהגות" value={profile.behaviorDurationTargetMinutes === null ? "עוד לא נקבע" : `${profile.behaviorDurationTargetMinutes} דק'`} />
          <Metric label="פעמים שבחרת שלא לפעול" value={String(stats.notActChoices)} />
          <Metric label="תרגולים" value={String(stats.totalPractices)} />
          <Metric label="עמידה ביעד ההמתנה" value={String(stats.waitTargetMetCount)} />
          <Metric label="המתנה ממוצעת (7 ימים)" value={avg(stats.averages.waitMinutesLast7Days)} />
          <Metric label="משך ממוצע (7 ימים)" value={avg(stats.averages.behaviorMinutesLast7Days)} />
          <Metric label="משך ממוצע (30 ימים)" value={avg(stats.averages.behaviorMinutesLast30Days)} />
        </View>
        <Text style={styles.muted}>{PROGRESS_NOT_RESET_NOTE}</Text>

        <Text style={styles.sectionTitle}>קצב ההתקדמות</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.chip, profile.waitProgression.mode === "hold" && styles.chipSelected]}
            onPress={() => void savePace(setWaitProgression(profile, profile.waitProgression.mode === "hold" ? "increase" : "hold", profile.waitProgression.stepMinutes, nowIso()))}
          >
            <Text style={[styles.chipText, profile.waitProgression.mode === "hold" && styles.chipTextSelected]}>להישאר באותו יעד</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => void savePace(decreaseWaitTarget(profile, 1, nowIso()))}>
            <Text style={styles.chipText}>להקטין את היעד בדקה</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => router.push({ pathname: "/arc-addiction/profile/[id]", params: { id: profile.id } })}>
            <Text style={styles.chipText}>עריכת קצב</Text>
          </Pressable>
        </View>

        <ArcAddictionLineChart title="זמן ההמתנה לפני ההתנהגות" unit="דק'" points={stats.waitMinutes} footer={TREND_LABELS[stats.trends.waitMinutes]} />
        <ArcAddictionLineChart title="משך ההתנהגות בפועל" unit="דק'" points={stats.behaviorMinutes} color={ARC_ADDICTION_COLORS.calm} footer={TREND_LABELS[stats.trends.behaviorMinutes]} />
        <ArcAddictionLineChart title="תדירות ההתנהגות (פעמים בשבוע)" unit="פעמים" points={weeklyActed} kind="bar" color="#7E57C2" />
        <ArcAddictionLineChart title="עוצמת הדחף בתחילת התרגול" unit="/10" max={10} points={stats.initialIntensity} color={ARC_ADDICTION_COLORS.urge} />
        <ArcAddictionLineChart title="עוצמת הדחף אחרי ההמתנה" unit="/10" max={10} points={stats.intensityAfterWait} color="#EF6C00" />
        <ArcAddictionLineChart title="תחושת המסוגלות" unit="/10" max={10} points={stats.efficacy} footer={TREND_LABELS[stats.trends.efficacy]} />
        <ArcAddictionLineChart
          title="קבלה עצמית אחרי התרגיל"
          unit="/10"
          max={10}
          points={stats.acceptanceAfter}
          color={ARC_ADDICTION_COLORS.supportive}
          footer={stats.acceptanceBefore.length > 0 ? `לפני התרגיל (ממוצע): ${(stats.acceptanceBefore.reduce((s, p) => s + p.value, 0) / stats.acceptanceBefore.length).toFixed(1)}` : undefined}
        />

        <Text style={styles.sectionTitle}>היסטוריית תרגולים</Text>
        {history.length === 0 && <Text style={styles.muted}>עדיין אין תרגולים שהסתיימו.</Text>}
        {history.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.cardRow}>{`${formatDate(row.startedAt)} · ${row.outcome ? OUTCOME_LABELS[row.outcome] : ""}`}</Text>
            <Text style={styles.muted}>
              {[
                `המתנה: ${row.waitedMinutes} דק'`,
                row.notActChoices > 0 ? `"לא": ${row.notActChoices}` : null,
                row.behaviorMinutes !== null ? `משך: ${row.behaviorMinutes} דק'` : null,
                row.initialIntensity !== null ? `עוצמה: ${row.initialIntensity}` : null,
                row.savedPositiveMemoryId ? "נשמר ב־Positive Memory" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

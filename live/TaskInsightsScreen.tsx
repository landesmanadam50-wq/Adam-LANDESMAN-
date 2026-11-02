import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { buildTaskInsightsSummary } from "../arc/taskInsights.ts";
import type { FrequencyCount, TaskInsightsSummary } from "../arc/taskInsights.ts";
import { INTERFERING_FACTOR_CATEGORY_LABELS } from "../arc/reactiveFactorChooser.ts";
import { PREDEFINED_EMOTION_LABELS } from "../arc/emotionIdentification.ts";
import { loadTaskJournal } from "../data/storage.ts";

/** Hebrew display label for a stored category/emotion string -- falls back to the raw value itself for anything not in either fixed label map, so an unrecognized value is still shown (never hidden), just without a nicer label. */
function labelFor(value: string): string {
  return (INTERFERING_FACTOR_CATEGORY_LABELS as Record<string, string>)[value] ?? (PREDEFINED_EMOTION_LABELS as Record<string, string>)[value] ?? value;
}

/**
 * live/TaskInsightsScreen.tsx (route /tasks/insights)
 *
 * Productivity roadmap, Stage Y: "build factual insights only... do
 * not present diagnoses or causal psychological claims." Every number
 * here is a plain count read straight from arc/taskInsights.ts's pure
 * aggregates over the real task journal -- this screen adds no
 * interpretation of its own, only Hebrew labels and layout. Wording
 * follows the spec's own example exactly: "you selected frustration in
 * N sessions" -- never "you have a frustration problem".
 */
export default function TaskInsightsScreen() {
  const [summary, setSummary] = useState<TaskInsightsSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadTaskJournal().then((entries) => setSummary(buildTaskInsightsSummary(entries)));
    }, [])
  );

  if (!summary) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (summary.totalEntries === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>אין עדיין מידע מספיק כדי להציג תובנות.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תובנות</Text>

        <InsightSection title="מה הפריע הכי הרבה" rows={summary.interferenceCategories} labelFn={labelFor} />
        <InsightSection title="רגשות שאושרו הכי הרבה" rows={summary.confirmedEmotions} labelFn={labelFor} />
        <InsightSection title="מצבים תומכים שנעשה בהם שימוש הכי הרבה" rows={summary.preparationStates} labelFn={(value) => value} />

        {summary.arcToTaskReturnPercentage !== null && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>חזרה למשימה אחרי ARC</Text>
            <Text style={styles.rowText}>{`${summary.arcToTaskReturnPercentage}% מהפעמים`}</Text>
          </View>
        )}

        <InsightSection title="שעות נפוצות לדחיית משימות" rows={summary.postponementHours} labelFn={(value) => `${value}:00`} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InsightSection({
  title,
  rows,
  labelFn,
}: {
  title: string;
  rows: FrequencyCount<string>[];
  labelFn: (value: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.map((row) => (
        <Text key={row.value} style={styles.rowText}>{`${labelFn(row.value)} -- ${row.count} פעמים`}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  sectionBlock: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  rowText: { fontSize: 15, textAlign: "right", color: "#444", marginBottom: 4 },
});

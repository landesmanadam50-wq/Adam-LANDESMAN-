import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { buildCoachingSessionPrepSummary, COACHING_SESSION_PREP_SECTIONS, createDefaultVisibleSections } from "../arc/coachingSessionPrep.ts";
import type { CoachingSessionPrepSection, CoachingSessionPrepSummary } from "../arc/coachingSessionPrep.ts";
import { INTERFERING_FACTOR_CATEGORY_LABELS } from "../arc/reactiveFactorChooser.ts";
import { loadCoachingWorkspaceEntries, loadReviewLaterFactors, loadTaskJournal, loadTasks } from "../data/storage.ts";

const SECTION_LABELS: Record<CoachingSessionPrepSection, string> = {
  tasks: "משימות",
  arcUses: "שימוש ב-ARC",
  recurringFactors: "גורמים חוזרים",
  newFactors: "גורמים חדשים לבדיקה",
  latestEntry: "הרשומה האחרונה",
};

/**
 * live/CoachingSessionPrepScreen.tsx (route /coaching/prepare)
 *
 * Productivity roadmap, Stage Z: "add a 'prepare for coaching session'
 * summary that the user can review and choose what to share... do not
 * automatically share the full journal." Every number comes straight
 * from arc/coachingSessionPrep.ts's own plain counts -- this screen
 * only adds the per-section visibility toggles (all ON by default,
 * hiding one is always the trainee's own explicit tap) and renders
 * what's left visible. No export, upload, or sharing mechanism exists
 * here or anywhere in this codebase yet -- this is a read-only, local
 * summary the trainee can look at (or show someone sitting with them)
 * before a session, nothing more.
 */
export default function CoachingSessionPrepScreen() {
  const [summary, setSummary] = useState<CoachingSessionPrepSummary | null>(null);
  const [visible, setVisible] = useState(createDefaultVisibleSections());

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadTasks(), loadTaskJournal(), loadReviewLaterFactors(), loadCoachingWorkspaceEntries()]).then(
        ([tasks, journal, reviewLaterFactors, coachingEntries]) => {
          const latestEntry = coachingEntries.length > 0 ? coachingEntries[coachingEntries.length - 1] : null;
          setSummary(buildCoachingSessionPrepSummary(tasks, journal, reviewLaterFactors, latestEntry));
        }
      );
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>הכנה למפגש אימון</Text>
        <Text style={styles.hint}>אפשר להסתיר כל חלק לפני שמראים את המסך למישהו אחר.</Text>

        <View style={styles.chipRow}>
          {COACHING_SESSION_PREP_SECTIONS.map((section) => (
            <Pressable
              key={section}
              style={[styles.chip, visible[section] && styles.chipSelected]}
              onPress={() => setVisible({ ...visible, [section]: !visible[section] })}
            >
              <Text style={styles.chipText}>{SECTION_LABELS[section]}</Text>
            </Pressable>
          ))}
        </View>

        {visible.tasks && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{SECTION_LABELS.tasks}</Text>
            <Text style={styles.rowText}>{`משימות שהושלמו: ${summary.completedTasksCount}`}</Text>
            <Text style={styles.rowText}>{`משימות שנדחו: ${summary.postponedTasksCount}`}</Text>
          </View>
        )}

        {visible.arcUses && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{SECTION_LABELS.arcUses}</Text>
            <Text style={styles.rowText}>{`שימושים ב-ARC: ${summary.arcUsesCount}`}</Text>
            <Text style={styles.rowText}>{`חזרות מוצלחות למשימה: ${summary.successfulTaskReturnsCount}`}</Text>
          </View>
        )}

        {visible.recurringFactors && summary.recurringFactors.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{SECTION_LABELS.recurringFactors}</Text>
            {summary.recurringFactors.map((row) => (
              <Text key={row.value} style={styles.rowText}>
                {`${(INTERFERING_FACTOR_CATEGORY_LABELS as Record<string, string>)[row.value] ?? row.value} -- ${row.count} פעמים`}
              </Text>
            ))}
          </View>
        )}

        {visible.newFactors && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{SECTION_LABELS.newFactors}</Text>
            <Text style={styles.rowText}>{`${summary.newUnbuiltFactorsCount} גורמים חדשים טרם נבדקו`}</Text>
          </View>
        )}

        {visible.latestEntry && (summary.latestSuccess || summary.latestDifficulty || summary.latestQuestionForCoach) && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{SECTION_LABELS.latestEntry}</Text>
            {summary.latestSuccess && <Text style={styles.rowText}>{`הצלחה: ${summary.latestSuccess}`}</Text>}
            {summary.latestDifficulty && <Text style={styles.rowText}>{`קושי: ${summary.latestDifficulty}`}</Text>}
            {summary.latestQuestionForCoach && <Text style={styles.rowText}>{`שאלה: ${summary.latestQuestionForCoach}`}</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 16 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  sectionBlock: { marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  rowText: { fontSize: 15, textAlign: "right", color: "#444", marginBottom: 2 },
});

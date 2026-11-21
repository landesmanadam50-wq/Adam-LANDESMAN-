import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { markArcSavedBodyOptionUsed } from "../arc/arcSaving.ts";
import type { ArcSavedBodyOption, ArcTrigger } from "../arc/arcSaving.ts";
import { findActiveTask } from "../arc/tasks.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";
import { handleArcSavingCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import { loadActiveArcTriggerIds, loadArcSavedBodyOptions, loadArcTriggers, loadTasks, upsertArcSavedBodyOptionEntry } from "../data/storage.ts";
import EmotionalCheckInButtons from "../live/components/EmotionalCheckInButtons.tsx";

/**
 * build/ArcSavingActivateScreen.tsx (route /arc-saving/activate)
 *
 * ARC Saving task, spec sections 8+10: what the new "+ARC Save" quick-
 * action button opens -- pick ONE of the ACTIVE/displayed triggers
 * (never all triggers; section 9's own "עריכת טריגרים" is the separate
 * screen that controls which ones show up here), then a body option
 * (skipped when there's exactly one; section 6 also offers "בחירת אזורי
 * גוף מחדש" to skip pre-filling entirely), then the SAME mood-check-in/
 * ARC-route choice every other ARC entry point already uses. Never
 * starts ARC automatically on its own (section 8: "אין להתחיל ARC
 * אוטומטית בעת בחירת הטריגרים").
 */
export default function ArcSavingActivateScreen({ triggerId = null }: { triggerId?: string | null }) {
  const [triggers, setTriggers] = useState<ArcTrigger[] | null>(null);
  const [bodyOptions, setBodyOptions] = useState<ArcSavedBodyOption[]>([]);
  const [selectedTrigger, setSelectedTrigger] = useState<ArcTrigger | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string>(STANDALONE_ARC_TASK_ID);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcTriggers(), loadActiveArcTriggerIds(), loadArcSavedBodyOptions(), loadTasks()]).then(([allTriggers, activeIds, allOptions, tasks]) => {
        const activeTriggers = allTriggers.filter((trigger) => activeIds.includes(trigger.id));
        setTriggers(activeTriggers);
        setBodyOptions(allOptions);
        setActiveTaskId(findActiveTask(tasks)?.id ?? STANDALONE_ARC_TASK_ID);
        // Home's own trigger-chip shortcuts (build/FlexibleDailyScreen.tsx)
        // pass the specific trigger tapped, so this screen skips straight
        // to its body-option/mood choice -- never auto-starting ARC on its
        // own (spec section 8), just pre-selecting which trigger.
        setSelectedTrigger(triggerId ? activeTriggers.find((trigger) => trigger.id === triggerId) ?? null : null);
      });
    }, [triggerId])
  );

  const optionsForSelectedTrigger = selectedTrigger ? bodyOptions.filter((option) => selectedTrigger.bodyOptionIds.includes(option.id)) : [];

  async function startWithOption(option: ArcSavedBodyOption | null, mood: "full_arc" | "shortened_arc" | "excellent") {
    if (option) await upsertArcSavedBodyOptionEntry(markArcSavedBodyOptionUsed(option, new Date().toISOString()));
    if (mood === "excellent") {
      // Section 6's own three-choice pattern: "מעולה" means the trigger
      // doesn't need ARC right now at all -- just record the use (above)
      // and return, never opening ARC.
      router.back();
      return;
    }
    await handleArcSavingCheckInChoice(mood, {
      arcSavingBodyOptionId: option?.id ?? null,
      arcSavingExerciseId: null,
      arcSavingTriggerIdForNewOption: null,
      taskId: activeTaskId,
    });
  }

  async function startFreshRegionsForTrigger(trigger: ArcTrigger, mood: "full_arc" | "shortened_arc" | "excellent") {
    if (mood === "excellent") {
      router.back();
      return;
    }
    await handleArcSavingCheckInChoice(mood, {
      arcSavingBodyOptionId: null,
      arcSavingExerciseId: null,
      arcSavingTriggerIdForNewOption: trigger.id,
      taskId: activeTaskId,
    });
  }

  if (triggers === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (triggers.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>+ARC Save</Text>
          <Text style={styles.hint}>עדיין אין לך טריגרים פעילים.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/arc-saving")}>
            <Text style={styles.primaryButtonText}>צור תרגיל וטריגר ב-ARC Saving</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!selectedTrigger) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>בחר טריגר</Text>
          {triggers.map((trigger) => (
            <Pressable key={trigger.id} style={styles.row} onPress={() => setSelectedTrigger(trigger)}>
              <Text style={styles.rowTitle}>{trigger.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (optionsForSelectedTrigger.length !== 1) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{selectedTrigger.label}</Text>
          <Text style={styles.sectionTitle}>בחר אפשרות גוף</Text>
          {optionsForSelectedTrigger.length === 0 && <Text style={styles.hint}>לטריגר הזה אין עדיין אפשרויות גוף שמורות.</Text>}
          {optionsForSelectedTrigger.map((option) => (
            <View key={option.id} style={styles.row}>
              <Text style={styles.rowTitle}>{option.label}</Text>
              <EmotionalCheckInButtons
                onFullArc={() => startWithOption(option, "full_arc")}
                onShortenedArc={() => startWithOption(option, "shortened_arc")}
                onExcellent={() => startWithOption(option, "excellent")}
              />
            </View>
          ))}
          <Text style={styles.sectionTitle}>או</Text>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>בחירת אזורי גוף מחדש</Text>
            <EmotionalCheckInButtons
              onFullArc={() => startFreshRegionsForTrigger(selectedTrigger, "full_arc")}
              onShortenedArc={() => startFreshRegionsForTrigger(selectedTrigger, "shortened_arc")}
              onExcellent={() => startFreshRegionsForTrigger(selectedTrigger, "excellent")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const theOnlyOption = optionsForSelectedTrigger[0];
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{selectedTrigger.label}</Text>
        <Text style={styles.sectionTitle}>{theOnlyOption.label}</Text>
        <EmotionalCheckInButtons
          onFullArc={() => startWithOption(theOnlyOption, "full_arc")}
          onShortenedArc={() => startWithOption(theOnlyOption, "shortened_arc")}
          onExcellent={() => startWithOption(theOnlyOption, "excellent")}
        />
        <Pressable style={styles.secondaryButton} onPress={() => startFreshRegionsForTrigger(selectedTrigger, "full_arc")}>
          <Text style={styles.secondaryButtonText}>בחירת אזורי גוף מחדש</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 16, marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginTop: 10 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, marginBottom: 10 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222", marginBottom: 8 },
  primaryButton: { backgroundColor: "#2E7D32", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 14 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 14 },
});

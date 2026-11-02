import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  getPreparationSourceLabel,
  getPreparationStepsForSource,
  PREPARATION_STATE_IDS,
  PREPARATION_STATE_LABELS,
  resolvePreparationSource,
} from "../arc/preparationStates.ts";
import type { PreparationSource } from "../arc/preparationStates.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import { appendTaskJournalEntry, getTask, loadStateProfiles } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

/**
 * live/PreparationScreen.tsx (route /tasks/[id]/prepare)
 *
 * Productivity roadmap, Stage K: the proactive route -- "strengthen a
 * supportive state before starting the task." All content is computed
 * by the pure arc/preparationStates.ts; this screen only renders it,
 * one step at a time (same established shape as
 * live/ManifestMeditationScreen.tsx's own practice phase).
 *
 * The four choices the product spec calls for: "start directly" and
 * "skip preparation" are the SAME action here (both just open the task
 * immediately, with no state strengthened) -- "use the state saved on
 * the task" (shown only when Task.defaultSupportiveStateId resolves to
 * something real, via resolvePreparationSource) -- and "choose another
 * supportive state" (any of the 8 predefined states, or any saved
 * StateProfile). Every protocol ends the exact same way: opening the
 * active task automatically (`autoStart` on /tasks/[id], the same
 * param Today's own "start" card action already uses -- no duplicated
 * timer-start logic).
 */
export default function PreparationScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<PreparationSource | null>(null);
  const [choosingOther, setChoosingOther] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const reload = useCallback(() => {
    Promise.all([getTask(taskId), loadStateProfiles()]).then(([loadedTask, profiles]) => {
      setTask(loadedTask);
      setStateProfiles(profiles);
      setLoaded(true);
    });
  }, [taskId]);

  useFocusEffect(reload);

  function openTask() {
    if (source) {
      const now = new Date().toISOString();
      appendTaskJournalEntry(
        createTaskJournalEntry({
          id: generateTaskJournalEntryId(),
          taskId,
          kind: "protocol_run_completed",
          occurredAt: now,
          createdAt: now,
          usedPreparationStateLabel: getPreparationSourceLabel(source),
          returnedToTask: true,
        })
      );
    }
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  if (!loaded || !task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const savedSource = resolvePreparationSource(task.defaultSupportiveStateId, stateProfiles);

  if (source) {
    const steps = getPreparationStepsForSource(source, task.firstAction);
    const isLastStep = stepIndex >= steps.length - 1;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>{getPreparationSourceLabel(source)}</Text>
          <Text style={styles.body}>{steps[stepIndex]}</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              if (isLastStep) {
                openTask();
                return;
              }
              setStepIndex(stepIndex + 1);
            }}
          >
            <Text style={styles.primaryButtonText}>{isLastStep ? "התחלת המשימה" : "המשך"}</Text>
          </Pressable>
          <Pressable style={styles.skipLink} onPress={openTask}>
            <Text style={styles.skipLinkText}>דלג והתחל</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (choosingOther) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>איזה מצב תומך תרצה לחזק?</Text>
          <View style={styles.chipRow}>
            {PREPARATION_STATE_IDS.map((stateId) => (
              <Pressable
                key={stateId}
                style={styles.chip}
                onPress={() => {
                  setSource({ kind: "predefined", id: stateId });
                  setStepIndex(0);
                }}
              >
                <Text style={styles.chipText}>{PREPARATION_STATE_LABELS[stateId]}</Text>
              </Pressable>
            ))}
          </View>
          {stateProfiles.length > 0 && (
            <>
              <Text style={styles.question}>מצבים תומכים שמורים</Text>
              <View style={styles.chipRow}>
                {stateProfiles.map((profile) => (
                  <Pressable
                    key={profile.id}
                    style={styles.chip}
                    onPress={() => {
                      setSource({ kind: "profile", profile });
                      setStepIndex(0);
                    }}
                  >
                    <Text style={styles.chipText}>{profile.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Pressable style={styles.backButton} onPress={() => setChoosingOther(false)}>
            <Text style={styles.backButtonText}>חזרה</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>הכנה לפני המשימה</Text>
        <Text style={styles.hint}>{task.title}</Text>

        {savedSource && (
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              setSource(savedSource);
              setStepIndex(0);
            }}
          >
            <Text style={styles.primaryButtonText}>{`המצב התומך השמור: ${getPreparationSourceLabel(savedSource)}`}</Text>
          </Pressable>
        )}

        <Pressable style={styles.secondaryButton} onPress={() => setChoosingOther(true)}>
          <Text style={styles.secondaryButtonText}>בחירת מצב תומך אחר</Text>
        </Pressable>

        <Pressable style={styles.skipLink} onPress={openTask}>
          <Text style={styles.skipLinkText}>התחל ישירות, בלי הכנה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 20 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 8 },
  body: { fontSize: 18, textAlign: "right", lineHeight: 27, marginBottom: 28 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  skipLink: { marginTop: 20, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
  backButton: { marginTop: 20, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

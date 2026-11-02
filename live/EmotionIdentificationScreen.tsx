import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  BODY_SENSATION_LABELS,
  BODY_SENSATION_OPTIONS,
  CLOSEST_STATEMENT_LABELS,
  CLOSEST_STATEMENT_OPTIONS,
  PREDEFINED_EMOTIONS,
  PREDEFINED_EMOTION_LABELS,
  suggestEmotion,
} from "../arc/emotionIdentification.ts";
import type { BodySensation, ClosestStatement, PredefinedEmotion } from "../arc/emotionIdentification.ts";
import { getPredefinedEmotionProtocolSteps } from "../arc/predefinedEmotionProtocols.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { appendTaskJournalEntry, getTask } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

type Phase =
  | { step: "sensation" }
  | { step: "statement"; sensation: BodySensation }
  | { step: "confirm"; sensation: BodySensation; emotion: PredefinedEmotion }
  | { step: "chooseAnother" }
  | { step: "protocol"; emotion: PredefinedEmotion; stepIndex: number };

/**
 * live/EmotionIdentificationScreen.tsx (route /tasks/[id]/factor/emotion)
 *
 * Productivity roadmap, Stage M+N: "the user should not have to know
 * the emotion in advance." Two deterministic questions
 * (arc/emotionIdentification.ts) produce a SUGGESTION, never a
 * declaration -- the trainee always explicitly confirms, picks a
 * different one of the 7 predefined emotions, or declines to name one
 * at all (→ the neutral regulation route, Stage O). Once an emotion is
 * settled (confirmed or manually chosen), its own ready-made 3-step
 * protocol (arc/predefinedEmotionProtocols.ts) plays, then returns to
 * the task with `autoStart=1` -- the trainee never has to build
 * anything in BUILD first.
 */
export default function EmotionIdentificationScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "sensation" });

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  function openTask() {
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  function logEmotionProtocolCompletion(emotion: PredefinedEmotion) {
    const now = new Date().toISOString();
    appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "protocol_run_completed",
        occurredAt: now,
        createdAt: now,
        interferenceCategory: "emotion",
        confirmedEmotion: emotion,
        returnedToTask: true,
      })
    );
  }

  function goToNeutral() {
    router.replace({ pathname: "/tasks/[id]/factor/neutral", params: { id: taskId } });
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.step === "sensation") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>מה אתה מבחין בגוף?</Text>
          <View style={styles.chipColumn}>
            {BODY_SENSATION_OPTIONS.map((sensation) => (
              <Pressable key={sensation} style={styles.optionRow} onPress={() => setPhase({ step: "statement", sensation })}>
                <Text style={styles.optionText}>{BODY_SENSATION_LABELS[sensation]}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase.step === "statement") {
    const { sensation } = phase;
    function choose(statement: ClosestStatement) {
      const suggestion = suggestEmotion(sensation, statement);
      if (suggestion.kind === "unidentified") {
        goToNeutral();
        return;
      }
      setPhase({ step: "confirm", sensation, emotion: suggestion.emotion });
    }
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>איזה משפט הכי קרוב?</Text>
          <View style={styles.chipColumn}>
            {CLOSEST_STATEMENT_OPTIONS.map((statement) => (
              <Pressable key={statement} style={styles.optionRow} onPress={() => choose(statement)}>
                <Text style={styles.optionText}>{CLOSEST_STATEMENT_LABELS[statement]}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase.step === "confirm") {
    const { emotion } = phase;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>{`אולי זה ${PREDEFINED_EMOTION_LABELS[emotion]}?`}</Text>
          <Pressable style={styles.primaryButton} onPress={() => setPhase({ step: "protocol", emotion, stepIndex: 0 })}>
            <Text style={styles.primaryButtonText}>כן</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setPhase({ step: "chooseAnother" })}>
            <Text style={styles.secondaryButtonText}>בחירת רגש אחר</Text>
          </Pressable>
          <Pressable style={styles.skipLink} onPress={goToNeutral}>
            <Text style={styles.skipLinkText}>אני לא רוצה לתת לזה שם</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.step === "chooseAnother") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>איזה רגש מתאים יותר?</Text>
          <View style={styles.chipRow}>
            {PREDEFINED_EMOTIONS.map((emotion) => (
              <Pressable key={emotion} style={styles.chip} onPress={() => setPhase({ step: "protocol", emotion, stepIndex: 0 })}>
                <Text style={styles.chipText}>{PREDEFINED_EMOTION_LABELS[emotion]}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.skipLink} onPress={goToNeutral}>
            <Text style={styles.skipLinkText}>אני לא רוצה לתת לזה שם</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // phase.step === "protocol"
  const { emotion, stepIndex } = phase;
  const steps = getPredefinedEmotionProtocolSteps(emotion, task.currentAction ?? task.firstAction, task.value, task.identity);
  const isLastStep = stepIndex >= steps.length - 1;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{PREDEFINED_EMOTION_LABELS[emotion]}</Text>
        <Text style={styles.body}>{steps[stepIndex]}</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            if (isLastStep) {
              logEmotionProtocolCompletion(emotion);
              openTask();
              return;
            }
            setPhase({ step: "protocol", emotion, stepIndex: stepIndex + 1 });
          }}
        >
          <Text style={styles.primaryButtonText}>{isLastStep ? "התחלת המשימה" : "המשך"}</Text>
        </Pressable>
        <Pressable
          style={styles.skipLink}
          onPress={() => {
            logEmotionProtocolCompletion(emotion);
            openTask();
          }}
        >
          <Text style={styles.skipLinkText}>דלג והתחל</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 8 },
  body: { fontSize: 18, textAlign: "right", lineHeight: 27, marginBottom: 28 },
  chipColumn: { gap: 8 },
  optionRow: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14 },
  optionText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  skipLink: { marginTop: 20, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
});

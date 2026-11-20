import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolveAnsweredArcLearningExplanationKinds } from "../arc/arcLearningInsight.ts";
import type { ArcLearningExplanationKind, ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import {
  advanceArcLearningRecallSessionProgress,
  createArcLearningRecallSessionProgress,
  resolveCurrentArcLearningRecallInsightId,
  resolveDueArcLearningInsightIds,
} from "../arc/arcLearningReview.ts";
import type { ArcLearningRecallSessionProgress } from "../arc/arcLearningReview.ts";
import type { ArcRecallRating } from "../arc/spacedRepetition.ts";
import {
  clearArcLearningRecallSessionProgress,
  loadArcLearningInsights,
  loadArcLearningRecallSessionProgress,
  loadArcLearningReviewSchedules,
  loadArcLearningTopics,
  recordArcLearningRecallEntry,
  saveArcLearningRecallSessionProgress,
} from "../data/storage.ts";

const EXPLANATION_QUESTIONS: Record<ArcLearningExplanationKind, string> = {
  meaning: "מה זה אומר?",
  reason: "למה?",
  mechanism: "איך?",
};

type RecallPhase = "sentence" | "explanations" | "imagery" | "rate";

const RATING_OPTIONS: { rating: ArcRecallRating; label: string }[] = [
  { rating: "forgot", label: "לא זכרתי" },
  { rating: "hard", label: "קשה" },
  { rating: "good", label: "טוב" },
  { rating: "easy", label: "קל" },
];

/**
 * build/ArcLearningRecallScreen.tsx (route /arc-learning/recall)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 2 step 6 + section 3: individual-insight active recall,
 * serving BOTH the wizard's own "initial active recall" (a single-item
 * queue already saved by the wizard) and ongoing spaced-repetition
 * review ("שליפה וחזרה" from ARC Learning home, which builds its own
 * queue of everything resolveDueArcLearningInsightIds reports due right
 * now). Recall before reveal, in order: main sentence -> only the
 * ANSWERED explanatory questions -> mental imagery -> self-rating.
 * Section 3: "support cumulative review of multiple insights" -- the
 * single-slot ArcLearningRecallSessionProgress queue is what makes this
 * resumable across app restarts.
 *
 * Section 9 (review execution through Task LIVE): when opened from a
 * review Task (live/ActiveTaskScreen.tsx's own "arcLearningReview"
 * performStart branch), `taskId` is this task's real id and `topicId`
 * is its optional topic filter (section 7's own per-block topic
 * scoping) -- a FRESH queue is then built only from that topic's due
 * insights, and finishing routes back to /tasks/[id] so the ordinary
 * "השלמת משימה" button there can invoke the real, unmodified
 * handleComplete(), never a parallel completion path. An existing
 * in-progress queue is always resumed as-is regardless of topicId --
 * resumability (section 12) takes precedence over a fresh topic scope.
 * With neither prop (opened directly from "שליפה וחזרה"), behavior is
 * unchanged: every due insight, finishing returns to ARC Learning home.
 */
export default function ArcLearningRecallScreen({ taskId, topicId }: { taskId?: string; topicId?: string }) {
  const [progress, setProgress] = useState<ArcLearningRecallSessionProgress | null>(null);
  const [insight, setInsight] = useState<ArcLearningInsight | null>(null);
  const [topic, setTopic] = useState<ArcLearningTopic | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<RecallPhase>("sentence");
  const [explanationIndex, setExplanationIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [attemptText, setAttemptText] = useState("");

  const loadCurrent = useCallback(async (currentProgress: ArcLearningRecallSessionProgress) => {
    const insightId = resolveCurrentArcLearningRecallInsightId(currentProgress);
    if (!insightId) {
      setInsight(null);
      setTopic(null);
      return;
    }
    const [insights, topics] = await Promise.all([loadArcLearningInsights(), loadArcLearningTopics()]);
    const found = insights.find((candidate) => candidate.id === insightId) ?? null;
    setInsight(found);
    setTopic(found?.topicId ? topics.find((candidate) => candidate.id === found.topicId) ?? null : null);
    setPhase("sentence");
    setExplanationIndex(0);
    setRevealed(false);
    setAttemptText("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const existing = await loadArcLearningRecallSessionProgress();
        if (existing) {
          setProgress(existing);
          await loadCurrent(existing);
          setLoaded(true);
          return;
        }
        const [allInsights, schedules] = await Promise.all([loadArcLearningInsights(), loadArcLearningReviewSchedules()]);
        const insights = topicId ? allInsights.filter((insight) => insight.topicId === topicId) : allInsights;
        const dueIds = resolveDueArcLearningInsightIds(insights, schedules, new Date());
        const fresh = createArcLearningRecallSessionProgress(dueIds, new Date().toISOString());
        await saveArcLearningRecallSessionProgress(fresh);
        setProgress(fresh);
        await loadCurrent(fresh);
        setLoaded(true);
      })();
    }, [loadCurrent, topicId])
  );

  async function finishInsightAndAdvance(rating: ArcRecallRating) {
    if (!insight || !progress) return;
    const now = new Date().toISOString();
    await recordArcLearningRecallEntry(insight.id, rating, `arc-learning-recall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, now);
    const advanced = advanceArcLearningRecallSessionProgress(progress);
    if (advanced.currentIndex >= advanced.insightIds.length) {
      await clearArcLearningRecallSessionProgress();
      setProgress(advanced);
      setInsight(null);
      setTopic(null);
      return;
    }
    await saveArcLearningRecallSessionProgress(advanced);
    setProgress(advanced);
    await loadCurrent(advanced);
  }

  function advancePhase() {
    if (!insight) return;
    const answeredKinds = resolveAnsweredArcLearningExplanationKinds(insight);
    if (phase === "sentence") {
      if (answeredKinds.length > 0) {
        setPhase("explanations");
      } else if (insight.mentalImages.length > 0) {
        setPhase("imagery");
      } else {
        setPhase("rate");
      }
      setRevealed(false);
      setAttemptText("");
      return;
    }
    if (phase === "explanations") {
      const nextIndex = explanationIndex + 1;
      if (nextIndex < answeredKinds.length) {
        setExplanationIndex(nextIndex);
        setRevealed(false);
        setAttemptText("");
        return;
      }
      setPhase(insight.mentalImages.length > 0 ? "imagery" : "rate");
      setRevealed(false);
      setAttemptText("");
      return;
    }
    if (phase === "imagery") {
      setPhase("rate");
      setRevealed(false);
      setAttemptText("");
    }
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!insight) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>סיימת את כל השליפות להיום!</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => (taskId ? router.replace({ pathname: "/tasks/[id]", params: { id: taskId } }) : router.replace("/arc-learning"))}
          >
            <Text style={styles.primaryButtonText}>{taskId ? "חזרה למשימה" : "חזרה ל-ARC Learning"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const answeredKinds = resolveAnsweredArcLearningExplanationKinds(insight);
  const currentKind = answeredKinds[explanationIndex];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {topic && phase === "sentence" && !revealed && <Text style={styles.topicLabel}>{topic.title}</Text>}

        {phase === "sentence" && (
          <>
            <Text style={styles.question}>מה המשפט העיקרי שלמדת?</Text>
            {!revealed && (
              <>
                <TextInput style={[styles.textInput, styles.multilineInput]} value={attemptText} onChangeText={setAttemptText} textAlign="right" multiline />
                <Pressable style={styles.primaryButton} onPress={() => setRevealed(true)}>
                  <Text style={styles.primaryButtonText}>הצג תשובה</Text>
                </Pressable>
              </>
            )}
            {revealed && (
              <>
                <View style={styles.answerBlock}>
                  <Text style={styles.answerLabel}>המשפט העיקרי</Text>
                  <Text style={styles.answerText}>{insight.mainSentence}</Text>
                </View>
                <Pressable style={styles.primaryButton} onPress={advancePhase}>
                  <Text style={styles.primaryButtonText}>הבא</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {phase === "explanations" && currentKind && (
          <>
            <Text style={styles.mainSentenceReminder}>{insight.mainSentence}</Text>
            <Text style={styles.question}>נסה לשחזר: {EXPLANATION_QUESTIONS[currentKind]}</Text>
            {!revealed && (
              <>
                <TextInput style={[styles.textInput, styles.multilineInput]} value={attemptText} onChangeText={setAttemptText} textAlign="right" multiline />
                <Pressable style={styles.primaryButton} onPress={() => setRevealed(true)}>
                  <Text style={styles.primaryButtonText}>הצג תשובה</Text>
                </Pressable>
              </>
            )}
            {revealed && (
              <>
                <View style={styles.answerBlock}>
                  <Text style={styles.answerLabel}>התשובה שלך מקודם</Text>
                  <Text style={styles.answerText}>{insight[currentKind === "meaning" ? "meaningAnswer" : currentKind === "reason" ? "reasonAnswer" : "mechanismAnswer"]}</Text>
                </View>
                <Pressable style={styles.primaryButton} onPress={advancePhase}>
                  <Text style={styles.primaryButtonText}>הבא</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {phase === "imagery" && (
          <>
            <Text style={styles.mainSentenceReminder}>{insight.mainSentence}</Text>
            <Text style={styles.question}>אילו דימויים מנטליים קישרת למשפט העיקרי?</Text>
            {!revealed && (
              <Pressable style={styles.primaryButton} onPress={() => setRevealed(true)}>
                <Text style={styles.primaryButtonText}>הצג דימויים</Text>
              </Pressable>
            )}
            {revealed && (
              <>
                {insight.mentalImages.map((image, index) => (
                  <Text key={`${image}-${index}`} style={styles.answerText}>
                    • {image}
                  </Text>
                ))}
                <Pressable style={styles.primaryButton} onPress={advancePhase}>
                  <Text style={styles.primaryButtonText}>הבא</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {phase === "rate" && (
          <>
            <Text style={styles.question}>כמה הצלחת לשלוף את התובנה?</Text>
            <View style={styles.ratingRow}>
              {RATING_OPTIONS.map((option) => (
                <Pressable key={option.rating} style={styles.ratingButton} onPress={() => finishInsightAndAdvance(option.rating)}>
                  <Text style={styles.ratingButtonText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  topicLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", fontWeight: "700" },
  mainSentenceReminder: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333" },
  question: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  answerBlock: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 14, gap: 4 },
  answerLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", fontWeight: "700" },
  answerText: { fontSize: 15, textAlign: "right", color: "#333" },
  ratingRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  ratingButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  ratingButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
});

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcCreativityConnection } from "../arc/arcCreativityConnection.ts";
import {
  advanceArcCreativityRecallSessionProgress,
  createArcCreativityRecallSessionProgress,
  resolveCurrentArcCreativityRecallConnectionId,
  resolveDueArcCreativityConnectionIds,
} from "../arc/arcCreativityReview.ts";
import type { ArcCreativityRecallSessionProgress } from "../arc/arcCreativityReview.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import type { ArcRecallRating } from "../arc/spacedRepetition.ts";
import {
  clearArcCreativityRecallSessionProgress,
  loadArcCreativityConnections,
  loadArcCreativityRecallSessionProgress,
  loadArcCreativityReviewSchedules,
  loadArcLearningInsights,
  recordArcCreativityRecallEntry,
  saveArcCreativityRecallSessionProgress,
} from "../data/storage.ts";

const RATING_OPTIONS: { rating: ArcRecallRating; label: string }[] = [
  { rating: "forgot", label: "לא זכרתי" },
  { rating: "hard", label: "קשה" },
  { rating: "good", label: "טוב" },
  { rating: "easy", label: "קל" },
];

/**
 * build/ArcCreativityRecallScreen.tsx (route /arc-creativity/recall)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 4 Mode D ("שליפת קשרים"): active recall of previously-saved
 * connections. Shows the two main sentences WITHOUT the saved
 * relationship, asks the trainee to reconstruct it, then reveals and
 * self-rates. Its own adaptive schedule/history (ArcCreativityReview*)
 * is fully separate from ARC Learning's individual-insight recall --
 * "recalling a connection must never count as recalling the underlying
 * insights" is structurally true here since this screen never touches
 * arc/arcLearningReview.ts's own storage at all.
 *
 * Section 9 (review execution through Task LIVE): when opened from a
 * review Task (live/ActiveTaskScreen.tsx's own "arcCreativityReview"
 * performStart branch), `taskId` is this task's real id -- finishing
 * then routes back to /tasks/[id] so the ordinary "השלמת משימה" button
 * there can invoke the real, unmodified handleComplete(). With no
 * `taskId` (opened directly from "שליפת קשרים"), behavior is
 * unchanged: finishing returns to ARC Creativity home.
 */
export default function ArcCreativityRecallScreen({ taskId }: { taskId?: string }) {
  const [progress, setProgress] = useState<ArcCreativityRecallSessionProgress | null>(null);
  const [connection, setConnection] = useState<ArcCreativityConnection | null>(null);
  const [insightA, setInsightA] = useState<ArcLearningInsight | null>(null);
  const [insightB, setInsightB] = useState<ArcLearningInsight | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [attemptText, setAttemptText] = useState("");

  const loadCurrent = useCallback(async (currentProgress: ArcCreativityRecallSessionProgress) => {
    const connectionId = resolveCurrentArcCreativityRecallConnectionId(currentProgress);
    if (!connectionId) {
      setConnection(null);
      setInsightA(null);
      setInsightB(null);
      return;
    }
    const [connections, insights] = await Promise.all([loadArcCreativityConnections(), loadArcLearningInsights()]);
    const found = connections.find((candidate) => candidate.id === connectionId) ?? null;
    setConnection(found);
    setInsightA(found ? insights.find((candidate) => candidate.id === found.insightIdA) ?? null : null);
    setInsightB(found ? insights.find((candidate) => candidate.id === found.insightIdB) ?? null : null);
    setRevealed(false);
    setAttemptText("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const existing = await loadArcCreativityRecallSessionProgress();
        if (existing) {
          setProgress(existing);
          await loadCurrent(existing);
          setLoaded(true);
          return;
        }
        const [connections, schedules] = await Promise.all([loadArcCreativityConnections(), loadArcCreativityReviewSchedules()]);
        const dueIds = resolveDueArcCreativityConnectionIds(connections, schedules, new Date());
        const fresh = createArcCreativityRecallSessionProgress(dueIds, new Date().toISOString());
        await saveArcCreativityRecallSessionProgress(fresh);
        setProgress(fresh);
        await loadCurrent(fresh);
        setLoaded(true);
      })();
    }, [loadCurrent])
  );

  async function rate(rating: ArcRecallRating) {
    if (!connection || !progress) return;
    const now = new Date().toISOString();
    await recordArcCreativityRecallEntry(connection.id, rating, `arc-creativity-recall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, now);
    const advanced = advanceArcCreativityRecallSessionProgress(progress);
    if (advanced.currentIndex >= advanced.connectionIds.length) {
      await clearArcCreativityRecallSessionProgress();
      setProgress(advanced);
      setConnection(null);
      return;
    }
    await saveArcCreativityRecallSessionProgress(advanced);
    setProgress(advanced);
    await loadCurrent(advanced);
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

  if (!connection) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>סיימת את כל שליפות הקשרים!</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => (taskId ? router.replace({ pathname: "/tasks/[id]", params: { id: taskId } }) : router.replace("/arc-creativity"))}
          >
            <Text style={styles.primaryButtonText}>{taskId ? "חזרה למשימה" : "חזרה ל-ARC Creativity"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.insightBlock}>
          <Text style={styles.insightText}>{insightA?.mainSentence}</Text>
        </View>
        <View style={styles.insightBlock}>
          <Text style={styles.insightText}>{insightB?.mainSentence}</Text>
        </View>

        <Text style={styles.question}>איזה קשר מצאת בעבר בין שתי התובנות?</Text>

        {!revealed && (
          <>
            <TextInput style={[styles.textInput, styles.multilineInput]} value={attemptText} onChangeText={setAttemptText} textAlign="right" multiline />
            <Pressable style={styles.primaryButton} onPress={() => setRevealed(true)}>
              <Text style={styles.primaryButtonText}>הצג את הקשר שנשמר</Text>
            </Pressable>
          </>
        )}

        {revealed && (
          <>
            <View style={styles.answerBlock}>
              <Text style={styles.answerLabel}>הקשר שנשמר</Text>
              <Text style={styles.answerText}>{connection.relationship}</Text>
            </View>
            <Text style={styles.question}>כמה הצלחת לשלוף את הקשר?</Text>
            <View style={styles.ratingRow}>
              {RATING_OPTIONS.map((option) => (
                <Pressable key={option.rating} style={styles.ratingButton} onPress={() => rate(option.rating)}>
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
  insightBlock: { backgroundColor: "#F8F0FB", borderRadius: 10, padding: 14 },
  insightText: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333" },
  question: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#6A1B9A", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  answerBlock: { backgroundColor: "#F8F0FB", borderRadius: 10, padding: 14, gap: 4 },
  answerLabel: { fontSize: 12, color: "#6A1B9A", textAlign: "right", fontWeight: "700" },
  answerText: { fontSize: 15, textAlign: "right", color: "#333" },
  ratingRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  ratingButton: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  ratingButtonText: { color: "#6A1B9A", fontSize: 14, fontWeight: "600" },
});

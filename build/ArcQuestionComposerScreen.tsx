import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcQuestion, ArcQuestionSourceContext } from "../arc/arcQuestions.ts";
import { answerArcQuestion, createArcQuestion, generateArcQuestionId, linkInsightToArcQuestion, updateArcQuestionText } from "../arc/arcQuestions.ts";
import { createStandaloneInsight, generateArcInsightId } from "../arc/arcInsightBelief.ts";
import { appendArcInsight, loadArcQuestions, upsertArcQuestionEntry } from "../data/storage.ts";

/**
 * build/ArcQuestionComposerScreen.tsx (routes /questions/new and /questions/[id])
 *
 * ARC Questions task, section 1: one shared screen for both "write a
 * brand-new open question" (`id === null`) and "research/answer an
 * existing one, or revisit an already-answered one" (`id` given) --
 * never two separate writing screens, same discipline as
 * build/InsightWriteScreen.tsx's own single-screen rule.
 *
 * Answering runs the SAME optional "extract insight(s)" step every
 * other insight source in this app already uses -- createStandaloneInsight
 * + appendArcInsight (data/storage.ts), the ONE central collection, never
 * a second one. Each captured insight is linked back to this question
 * (ArcQuestion.insightIds) and offers a direct link into its own detail
 * screen, which already has the existing "קישור ל-ARC Learning" button
 * (build/InsightDetailScreen.tsx) -- organizing into a topic is reused
 * as-is, never re-implemented here.
 *
 * `returnToTaskId`, when given (reached from a task's own linked
 * action, or from the floating timer's "+ שאלה" button), sends the
 * trainee back to that exact Task LIVE screen on save/finish instead of
 * the questions list -- same convention as InsightWriteScreen's own
 * `returnToTaskId`.
 */
export default function ArcQuestionComposerScreen({
  id = null,
  returnToTaskId = null,
  sourceContext = { kind: "manual" },
}: {
  id?: string | null;
  returnToTaskId?: string | null;
  sourceContext?: ArcQuestionSourceContext;
}) {
  const [question, setQuestion] = useState<ArcQuestion | null | undefined>(id ? undefined : null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [insightDraft, setInsightDraft] = useState("");
  const [addedInsightIds, setAddedInsightIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    if (!id) return;
    loadArcQuestions().then((questions) => {
      const found = questions.find((candidate) => candidate.id === id) ?? null;
      setQuestion(found);
      setQuestionDraft(found?.text ?? "");
      setAnswerDraft(found?.answer ?? "");
    });
  }, [id]);

  useFocusEffect(reload);

  function finish() {
    if (returnToTaskId) {
      router.replace({ pathname: "/tasks/[id]", params: { id: returnToTaskId } });
      return;
    }
    router.replace("/questions");
  }

  async function handleSaveNewQuestion() {
    const trimmed = questionDraft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    await upsertArcQuestionEntry(createArcQuestion(generateArcQuestionId(), trimmed, now, sourceContext));
    finish();
  }

  async function handleSaveAnswer() {
    if (!question || saving) return;
    const trimmed = answerDraft.trim();
    if (!trimmed) return;
    setSaving(true);
    const now = new Date().toISOString();
    const updated = answerArcQuestion(question, trimmed, now);
    setQuestion(updated);
    await upsertArcQuestionEntry(updated);
    setSaving(false);
  }

  async function handleSaveQuestionEdit() {
    if (!question) return;
    const trimmed = questionDraft.trim();
    if (!trimmed || trimmed === question.text) return;
    const now = new Date().toISOString();
    const updated = updateArcQuestionText(question, trimmed, now);
    setQuestion(updated);
    await upsertArcQuestionEntry(updated);
  }

  async function handleAddInsight() {
    if (!question) return;
    const trimmed = insightDraft.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const insight = createStandaloneInsight(generateArcInsightId(), trimmed, now);
    await appendArcInsight(insight);
    const updated = linkInsightToArcQuestion(question, insight.id, now);
    setQuestion(updated);
    await upsertArcQuestionEntry(updated);
    setAddedInsightIds((ids) => [...ids, insight.id]);
    setInsightDraft("");
  }

  if (id && question === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (id && question === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>השאלה לא נמצאה.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // New-question mode.
  if (!id) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>שאלה חדשה</Text>
          <Text style={styles.hint}>מה עולה לך כרגע ועדיין אין לך תשובה עליו? אפשר לחזור ולחקור את זה בזמן אחר.</Text>
          <TextInput style={styles.textInput} value={questionDraft} onChangeText={setQuestionDraft} textAlign="right" multiline autoFocus placeholder="השאלה שלי..." />
          <Pressable style={[styles.primaryButton, (!questionDraft.trim() || saving) && styles.disabledButton]} disabled={!questionDraft.trim() || saving} onPress={handleSaveNewQuestion}>
            <Text style={styles.primaryButtonText}>שמירה</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => (returnToTaskId ? finish() : router.back())}>
            <Text style={styles.secondaryButtonText}>ביטול</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Existing-question mode: answer (or revisit) + optional insight capture.
  const answered = question!.answer !== null;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>{answered ? "השאלה" : "חקירת שאלה"}</Text>
        <TextInput style={styles.textInputSmall} value={questionDraft} onChangeText={setQuestionDraft} onBlur={handleSaveQuestionEdit} textAlign="right" multiline />

        {!answered ? (
          <>
            <Text style={styles.hint}>כתוב את התשובה -- אפשר לחקור, לחשוב, ולחזור לכאן בכל שלב.</Text>
            <TextInput style={styles.textInput} value={answerDraft} onChangeText={setAnswerDraft} textAlign="right" multiline placeholder="התשובה שלי..." />
            <Pressable style={[styles.primaryButton, (!answerDraft.trim() || saving) && styles.disabledButton]} disabled={!answerDraft.trim() || saving} onPress={handleSaveAnswer}>
              <Text style={styles.primaryButtonText}>שמירת תשובה</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>התשובה</Text>
            <TextInput style={styles.textInput} value={answerDraft} onChangeText={setAnswerDraft} onBlur={handleSaveAnswer} textAlign="right" multiline />

            <Text style={styles.sectionTitle}>תובנות ({question!.insightIds.length})</Text>
            <Text style={styles.hint}>גילית תובנה מהתשובה? אפשר להוסיף אחת או כמה, או לדלג.</Text>
            <TextInput style={styles.textInputSmall} value={insightDraft} onChangeText={setInsightDraft} textAlign="right" multiline placeholder="התובנה שלי..." />
            <Pressable style={[styles.secondaryActionButton, !insightDraft.trim() && styles.disabledButton]} disabled={!insightDraft.trim()} onPress={handleAddInsight}>
              <Text style={styles.secondaryActionButtonText}>+ הוספת תובנה</Text>
            </Pressable>
            {addedInsightIds.map((insightId) => (
              <Pressable key={insightId} style={styles.row} onPress={() => router.push({ pathname: "/insights/[id]", params: { id: insightId } })}>
                <Text style={styles.rowText}>תובנה נשמרה -- לקישור ל-ARC Learning</Text>
              </Pressable>
            ))}
          </>
        )}

        <Pressable style={styles.secondaryButton} onPress={finish}>
          <Text style={styles.secondaryButtonText}>{returnToTaskId ? "חזרה למשימה" : "סיום"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333", marginTop: 16, marginBottom: 6 },
  hint: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 10 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 120, textAlignVertical: "top" },
  textInputSmall: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, minHeight: 60, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
  secondaryButtonText: { color: "#666", fontSize: 15 },
  secondaryActionButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  secondaryActionButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 14 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginTop: 8 },
  rowText: { fontSize: 14, textAlign: "right", color: "#0a7ea4" },
});

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  addArcLearningInsightMentalImage,
  appendArcLearningWhyChainEntry,
  createArcLearningInsight,
  generateArcLearningInsightId,
  removeArcLearningInsightMentalImage,
  setArcLearningInsightExplanation,
  setArcLearningInsightMainSentence,
  setArcLearningInsightTopic,
  setArcLearningInsightWantsToLearn,
  skipArcLearningInsightExplanation,
  updateArcLearningWhyChainEntry,
} from "../arc/arcLearningInsight.ts";
import type { ArcLearningExplanationKind, ArcLearningInsight, ArcLearningWhyChainEntry } from "../arc/arcLearningInsight.ts";
import { createArcLearningTopic, generateArcLearningTopicId } from "../arc/arcLearningTopic.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { createArcLearningRecallSessionProgress } from "../arc/arcLearningReview.ts";
import { createArcInsight, generateArcInsightId } from "../arc/arcInsightBelief.ts";
import { createArcQuestion, generateArcQuestionId } from "../arc/arcQuestions.ts";
import {
  appendArcInsight,
  loadArcLearningInsights,
  loadArcLearningTopics,
  saveArcLearningRecallSessionProgress,
  upsertArcLearningInsightEntry,
  upsertArcLearningTopicEntry,
  upsertArcQuestionEntry,
} from "../data/storage.ts";

/**
 * build/ArcLearningInsightWizardScreen.tsx (route /arc-learning/insight/[id]/edit,
 * id === "new" to create -- same convention as build/TaskEditorScreen.tsx)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 2: the full insight-creation/learning flow. The
 * ArcLearningInsight record itself IS the resumable state (no separate
 * in-progress-session record) -- re-opening this screen for an existing
 * id resumes at the first step whose field is still unset, per
 * resolveInitialWizardStep below. Explanatory questions are rendered
 * together, in their exact required order (מה זה אומר -> למה -> איך),
 * each with its own skip -- never forced one-at-a-time, since the spec
 * only requires the ORDER and per-question skippability, not a
 * one-question-per-screen layout.
 */

const EXPLANATION_STEPS: { kind: ArcLearningExplanationKind; question: string; helper: string }[] = [
  { kind: "meaning", question: "מה זה אומר?", helper: "מה המשמעות של המשפט העיקרי? מה אפשר להבין או להסיק ממנו?" },
  { kind: "reason", question: "למה?", helper: "מה הסיבה לכך שהמשפט העיקרי נכון? מה יכול להסביר אותו?" },
  { kind: "mechanism", question: "איך?", helper: "איך התהליך שמתואר במשפט העיקרי מתרחש בפועל?" },
];

function resolveInitialWizardStep(insight: ArcLearningInsight): number {
  if (!insight.wantsToLearn) return 0;
  if (insight.topicId === null) return 1;
  if (insight.mainSentence === null) return 2;
  return 3;
}

export default function ArcLearningInsightWizardScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [insight, setInsight] = useState<ArcLearningInsight | null>(null);
  const [topics, setTopics] = useState<ArcLearningTopic[]>([]);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(isNew);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newImageText, setNewImageText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcLearningInsights(), loadArcLearningTopics()]).then(([insights, loadedTopics]) => {
        setTopics(loadedTopics);
        if (isNew) {
          setInsight(createArcLearningInsight(generateArcLearningInsightId(), "", new Date().toISOString()));
          setStep(0);
          setLoaded(true);
          return;
        }
        const found = insights.find((candidate) => candidate.id === id) ?? null;
        setInsight(found);
        if (found) setStep(resolveInitialWizardStep(found));
        setLoaded(true);
      });
    }, [id, isNew])
  );

  async function persist(next: ArcLearningInsight) {
    setInsight(next);
    await upsertArcLearningInsightEntry(next);
    return next;
  }

  async function handleSaveOnly() {
    if (!insight || !insight.rawText.trim()) {
      setError("יש לכתוב את התובנה שלך.");
      return;
    }
    const now = new Date().toISOString();
    await persist(setArcLearningInsightWantsToLearn(insight, false, now));
    router.replace({ pathname: "/arc-learning/insight/[id]", params: { id: insight.id } });
  }

  async function handleWantsToLearn() {
    if (!insight || !insight.rawText.trim()) {
      setError("יש לכתוב את התובנה שלך.");
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    await persist(setArcLearningInsightWantsToLearn(insight, true, now));
    setStep(1);
  }

  async function selectTopic(topicId: string) {
    if (!insight) return;
    await persist(setArcLearningInsightTopic(insight, topicId, new Date().toISOString()));
    setStep(2);
  }

  async function createAndSelectTopic() {
    if (!insight || !newTopicTitle.trim()) return;
    const now = new Date().toISOString();
    const topic = createArcLearningTopic(generateArcLearningTopicId(), newTopicTitle, now);
    await upsertArcLearningTopicEntry(topic);
    setTopics((prev) => [...prev, topic]);
    setNewTopicTitle("");
    await persist(setArcLearningInsightTopic(insight, topic.id, now));
    setStep(2);
  }

  async function confirmMainSentence(text: string) {
    if (!insight || !text.trim()) {
      setError("יש לכתוב את המשפט העיקרי.");
      return;
    }
    setError(null);
    await persist(setArcLearningInsightMainSentence(insight, text, new Date().toISOString()));
    setStep(3);
  }

  async function answerExplanation(kind: ArcLearningExplanationKind, answer: string) {
    if (!insight) return;
    await persist(setArcLearningInsightExplanation(insight, kind, answer, new Date().toISOString()));
  }

  async function skipExplanation(kind: ArcLearningExplanationKind) {
    if (!insight) return;
    await persist(skipArcLearningInsightExplanation(insight, kind, new Date().toISOString()));
  }

  async function addImage() {
    if (!insight || !newImageText.trim()) return;
    await persist(addArcLearningInsightMentalImage(insight, newImageText, new Date().toISOString()));
    setNewImageText("");
  }

  async function removeImage(index: number) {
    if (!insight) return;
    await persist(removeArcLearningInsightMentalImage(insight, index, new Date().toISOString()));
  }

  async function finishAndRecall() {
    if (!insight) return;
    await saveArcLearningRecallSessionProgress(createArcLearningRecallSessionProgress([insight.id], new Date().toISOString()));
    router.replace("/arc-learning/recall");
  }

  if (!loaded || !insight) {
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
        {insight.mainSentence !== null && step >= 2 && (
          <View style={styles.mainSentenceBanner}>
            <Text style={styles.mainSentenceLabel}>המשפט העיקרי</Text>
            <Text style={styles.mainSentenceText}>{insight.mainSentence}</Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {step === 0 && (
          <>
            <Text style={styles.question}>מה התובנה שלך?</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={insight.rawText}
              onChangeText={(text) => setInsight({ ...insight, rawText: text })}
              textAlign="right"
              multiline
              placeholder="כתוב את התובנה שעלתה לך..."
            />
            <Text style={styles.question}>האם אתה רוצה ללמוד את התובנה הזאת?</Text>
            <Pressable style={styles.primaryButton} onPress={handleWantsToLearn}>
              <Text style={styles.primaryButtonText}>כן, אני רוצה ללמוד אותה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleSaveOnly}>
              <Text style={styles.secondaryButtonText}>רק לשמור את התובנה</Text>
            </Pressable>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.question}>לאיזה נושא למידה התובנה קשורה?</Text>
            <View style={styles.chipColumn}>
              {topics.map((topic) => (
                <Pressable key={topic.id} style={styles.optionCard} onPress={() => selectTopic(topic.id)}>
                  <Text style={styles.optionText}>{topic.title}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.subLabel}>או צור נושא חדש</Text>
            <View style={styles.inlineRow}>
              <TextInput style={[styles.textInput, styles.inlineInput]} value={newTopicTitle} onChangeText={setNewTopicTitle} textAlign="right" placeholder="שם נושא חדש" />
              <Pressable style={styles.inlineButton} onPress={createAndSelectTopic}>
                <Text style={styles.inlineButtonText}>צור ובחר</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 2 && (
          <MainSentenceStep initial={insight.mainSentence ?? insight.rawText} onConfirm={confirmMainSentence} />
        )}

        {step === 3 && (
          <>
            <Text style={styles.question}>שאלות הבנה (אפשר לדלג ולהשלים בהמשך)</Text>
            {EXPLANATION_STEPS.map(({ kind, question, helper }) => (
              <View key={kind}>
                <ExplanationField
                  question={question}
                  helper={helper}
                  value={insight[kind === "meaning" ? "meaningAnswer" : kind === "reason" ? "reasonAnswer" : "mechanismAnswer"]}
                  onAnswer={(text) => answerExplanation(kind, text)}
                  onSkip={() => skipExplanation(kind)}
                />
                {kind === "reason" && <WhyChainSection insight={insight} persist={persist} />}
              </View>
            ))}
            <Pressable style={styles.primaryButton} onPress={() => setStep(4)}>
              <Text style={styles.primaryButtonText}>הבא</Text>
            </Pressable>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.question}>אילו דימויים עולים לך בראש כשאתה מדמיין את המשפט העיקרי?</Text>
            {insight.mentalImages.map((image, index) => (
              <View key={`${image}-${index}`} style={styles.imageRow}>
                <Text style={styles.imageText}>{image}</Text>
                <Pressable onPress={() => removeImage(index)}>
                  <Text style={styles.removeText}>הסר</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.inlineRow}>
              <TextInput style={[styles.textInput, styles.inlineInput]} value={newImageText} onChangeText={setNewImageText} textAlign="right" placeholder="תאר דימוי..." />
              <Pressable style={styles.inlineButton} onPress={addImage}>
                <Text style={styles.inlineButtonText}>הוסף</Text>
              </Pressable>
            </View>
            <Pressable style={styles.primaryButton} onPress={finishAndRecall}>
              <Text style={styles.primaryButtonText}>סיום ומעבר לשליפה ראשונית</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MainSentenceStep({ initial, onConfirm }: { initial: string; onConfirm: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <Text style={styles.question}>מה המשפט העיקרי שאתה רוצה ללמוד ולזכור?</Text>
      <TextInput style={[styles.textInput, styles.multilineInput]} value={text} onChangeText={setText} textAlign="right" multiline />
      <Pressable style={styles.primaryButton} onPress={() => onConfirm(text)}>
        <Text style={styles.primaryButtonText}>הבא</Text>
      </Pressable>
    </>
  );
}

function ExplanationField({
  question,
  helper,
  value,
  onAnswer,
  onSkip,
}: {
  question: string;
  helper: string;
  value: string | null;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState(value ?? "");
  return (
    <View style={styles.explanationBlock}>
      <Text style={styles.explanationQuestion}>{question}</Text>
      <Text style={styles.explanationHelper}>{helper}</Text>
      <TextInput style={[styles.textInput, styles.multilineInput]} value={text} onChangeText={setText} textAlign="right" multiline onBlur={() => onAnswer(text)} />
      <Pressable
        onPress={() => {
          setText("");
          onSkip();
        }}
      >
        <Text style={styles.skipText}>דלג</Text>
      </Pressable>
    </View>
  );
}

/**
 * ARC Learning Deep Dive task: an optional, unbounded chain of follow-up
 * "למה?" questions built on top of the "למה?" explanatory step right
 * above it -- entirely additive, never gating "הבא" (which proceeds
 * regardless of chain length, per the spec's "אין לחייב"). Only shown
 * once the base reasonAnswer has been answered (nothing to deepen
 * otherwise). The first "+ למה?" tap seeds whyChain[0] from that
 * existing answer so the chain reads as one continuous "למה?" sequence
 * (matching the spec's own worked example), then opens a composer for
 * the next, deeper answer; every later tap just opens one more.
 */
function WhyChainSection({ insight, persist }: { insight: ArcLearningInsight; persist: (next: ArcLearningInsight) => Promise<ArcLearningInsight> }) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [newInsightDraft, setNewInsightDraft] = useState("");
  const [savedAsQuestion, setSavedAsQuestion] = useState(false);

  if (insight.reasonAnswer === null) return null;

  async function ensureSeeded(): Promise<ArcLearningInsight> {
    if (insight.whyChain.length > 0) return insight;
    return persist(appendArcLearningWhyChainEntry(insight, "למה?", insight.reasonAnswer ?? "", new Date().toISOString()));
  }

  async function handleOpenComposer() {
    await ensureSeeded();
    setComposing(true);
    setSavedAsQuestion(false);
  }

  async function handleEditEntry(entryId: string, newAnswer: string) {
    await persist(updateArcLearningWhyChainEntry(insight, entryId, newAnswer, new Date().toISOString()));
  }

  async function handleSubmitWhy() {
    if (!draft.trim()) return;
    await persist(appendArcLearningWhyChainEntry(insight, "למה?", draft, new Date().toISOString()));
    setDraft("");
    setComposing(false);
  }

  /** "אם המשתמש מגיע לשאלה שאין לו תשובה עליה, יש לאפשר לשמור אותה ישירות ב-ARC Questions" -- links back to the chain's own last entry (seeded above if the chain was still empty), never a disconnected question. */
  async function handleSaveAsQuestion() {
    const seeded = await ensureSeeded();
    const lastEntry = seeded.whyChain[seeded.whyChain.length - 1];
    if (!lastEntry) return;
    const now = new Date().toISOString();
    await upsertArcQuestionEntry(createArcQuestion(generateArcQuestionId(), "למה?", now, { kind: "arc_learning_why_chain", insightId: seeded.id, whyChainEntryId: lastEntry.id }));
    setComposing(false);
    setSavedAsQuestion(true);
  }

  /** "להוסיף תובנה חדשה שהתגלתה במהלך ההעמקה לאוסף התובנות" -- the SAME appendArcInsight call every other insight source uses, sourceExerciseId referencing this ArcLearningInsight. */
  async function handleAddNewInsight() {
    const trimmed = newInsightDraft.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    await appendArcInsight(createArcInsight({ id: generateArcInsightId(), sourceExerciseId: insight.id, taskId: null, beliefKind: "general", text: trimmed, occurredAt: now, createdAt: now }));
    setNewInsightDraft("");
  }

  return (
    <View style={styles.whyChainBlock}>
      {insight.whyChain.map((entry) => (
        <WhyChainEntryRow key={entry.id} entry={entry} onSave={(text) => handleEditEntry(entry.id, text)} />
      ))}
      {composing && (
        <View style={styles.explanationBlock}>
          <Text style={styles.explanationQuestion}>למה?</Text>
          <TextInput style={[styles.textInput, styles.multilineInput]} value={draft} onChangeText={setDraft} textAlign="right" multiline autoFocus />
          <Pressable style={styles.primaryButton} onPress={handleSubmitWhy}>
            <Text style={styles.primaryButtonText}>שמירה</Text>
          </Pressable>
          <Pressable onPress={handleSaveAsQuestion}>
            <Text style={styles.skipText}>אין לי תשובה -- שמור כשאלה ב-ARC Questions</Text>
          </Pressable>
        </View>
      )}
      {savedAsQuestion && <Text style={styles.subLabel}>השאלה נשמרה ב-ARC Questions.</Text>}
      {!composing && (
        <Pressable style={styles.secondaryButton} onPress={handleOpenComposer}>
          <Text style={styles.secondaryButtonText}>+ למה?</Text>
        </Pressable>
      )}
      <View style={styles.inlineRow}>
        <TextInput style={[styles.textInput, styles.inlineInput]} value={newInsightDraft} onChangeText={setNewInsightDraft} textAlign="right" placeholder="תובנה חדשה שהתגלתה..." />
        <Pressable style={styles.inlineButton} onPress={handleAddNewInsight}>
          <Text style={styles.inlineButtonText}>+ תובנה</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WhyChainEntryRow({ entry, onSave }: { entry: ArcLearningWhyChainEntry; onSave: (text: string) => void }) {
  const [text, setText] = useState(entry.answer);
  return (
    <View style={styles.explanationBlock}>
      <Text style={styles.explanationQuestion}>{entry.question}</Text>
      <TextInput style={[styles.textInput, styles.multilineInput]} value={text} onChangeText={setText} textAlign="right" multiline onBlur={() => onSave(text)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14 },
  question: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  subLabel: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  chipColumn: { gap: 8 },
  optionCard: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 12, alignItems: "flex-end" },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600", textAlign: "right" },
  inlineRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  inlineInput: { flex: 1 },
  inlineButton: { backgroundColor: "#0a7ea4", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  inlineButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  mainSentenceBanner: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 14 },
  mainSentenceLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", fontWeight: "700", marginBottom: 2 },
  mainSentenceText: { fontSize: 15, textAlign: "right", color: "#333" },
  explanationBlock: { gap: 6, borderBottomWidth: 1, borderBottomColor: "#eee", paddingBottom: 12, marginBottom: 4 },
  explanationQuestion: { fontSize: 15, fontWeight: "700", textAlign: "right" },
  explanationHelper: { fontSize: 12, color: "#777", textAlign: "right" },
  skipText: { color: "#999", fontSize: 13, textAlign: "right" },
  imageRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10 },
  imageText: { fontSize: 14, textAlign: "right", color: "#333", flex: 1 },
  removeText: { color: "#b00020", fontSize: 13 },
  whyChainBlock: { gap: 8, marginRight: 16, marginBottom: 8 },
});

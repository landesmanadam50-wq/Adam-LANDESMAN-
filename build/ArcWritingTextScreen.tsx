import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcBook, ArcBookChapter, ArcInsightRelationship, ArcVideoRecording, ArcWritingText } from "../arc/arcWriting.ts";
import {
  associateWritingTextWithChapter,
  clearWritingTextChapterAssociation,
  createArcWritingText,
  generateArcWritingTextId,
  linkInsightToWritingText,
  linkRelationshipToWritingText,
  resolveVideoRecordingsForScript,
  toggleInsightIncorporatedInWritingText,
  unlinkInsightFromWritingText,
  unlinkRelationshipFromWritingText,
  updateArcWritingText,
} from "../arc/arcWriting.ts";
import {
  loadArcBookChapters,
  loadArcBooks,
  loadArcInsightRelationships,
  loadArcInsights,
  loadArcVideoRecordings,
  loadArcWritingTexts,
  upsertArcWritingTextEntry,
} from "../data/storage.ts";
import ArcInsightPicker from "../live/components/ArcInsightPicker.tsx";
import ArcRelationshipPicker from "../live/components/ArcRelationshipPicker.tsx";
import ArcWritingTaskComposer from "../live/components/ArcWritingTaskComposer.tsx";

const AUTO_SAVE_DEBOUNCE_MS = 600;

/**
 * build/ArcWritingTextScreen.tsx (route /arc-gym/writing/[id], id="new" for creation)
 *
 * ARC Writing & ARC Book task, spec section 1: a free-form text editor
 * over the shared insight/relationship repository. Autosave follows
 * build/PositiveMemoryWizardScreen.tsx's own debounce-ref + flush-on-
 * unfocus pattern exactly. A fresh ("new") text is held only in local
 * state until the trainee actually types something -- the first real
 * persist both writes it to storage and switches this screen's own
 * route param from "new" to the real id (router.setParams), mirroring
 * build/ArcTriggerEditorScreen.tsx's "create exactly once, on first
 * save" convention -- so leaving immediately after opening "new" never
 * creates an orphan empty record.
 *
 * ARC Video task: the "write a video script" choice (spec section 1) is
 * the SAME screen, never a second editor -- build/ArcWritingHomeScreen.tsx's
 * own "🎥 כתיבת תסריט לסרטון" card passes initialKind="video_script" only
 * for a brand-new text, the exact same one-time-at-creation convention
 * build/TaskEditorScreen.tsx's own initialTitle/initialArcGymGoalId already
 * use. Every existing "standard" text behavior below (autosave, insight/
 * relationship linking, chapter association, draft toggle) is untouched
 * and still applies to a video script, since it is a plain ArcWritingText.
 */
export default function ArcWritingTextScreen({ id, initialKind = null }: { id: string; initialKind?: "video_script" | null }) {
  const isNew = id === "new";
  const [text, setText] = useState<ArcWritingText | null>(null);
  const [insights, setInsights] = useState<ArcInsight[]>([]);
  const [relationships, setRelationships] = useState<ArcInsightRelationship[]>([]);
  const [books, setBooks] = useState<ArcBook[]>([]);
  const [chapters, setChapters] = useState<ArcBookChapter[]>([]);
  const [videoRecordings, setVideoRecordings] = useState<ArcVideoRecording[]>([]);
  const [showLinking, setShowLinking] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);

  const textRef = useRef<ArcWritingText | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcInsights(), loadArcInsightRelationships(), loadArcBooks(), loadArcBookChapters(), loadArcVideoRecordings()]).then(
        ([loadedInsights, loadedRelationships, loadedBooks, loadedChapters, loadedVideoRecordings]) => {
          setInsights(loadedInsights);
          setRelationships(loadedRelationships);
          setBooks(loadedBooks);
          setChapters(loadedChapters);
          setVideoRecordings(loadedVideoRecordings);
        }
      );
      if (isNew) {
        if (!textRef.current) {
          const now = new Date().toISOString();
          const created = initialKind === "video_script" ? updateArcWritingText(createArcWritingText(generateArcWritingTextId(), now), { kind: "video_script" }, now) : createArcWritingText(generateArcWritingTextId(), now);
          textRef.current = created;
          setText(created);
          persistedRef.current = false;
        }
      } else {
        loadArcWritingTexts().then((texts) => {
          const found = texts.find((candidate) => candidate.id === id) ?? null;
          textRef.current = found;
          setText(found);
          persistedRef.current = !!found;
        });
      }
      return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (persistedRef.current && textRef.current) upsertArcWritingTextEntry(textRef.current);
      };
    }, [id, isNew])
  );

  function persist(next: ArcWritingText, debounce: boolean) {
    setText(next);
    textRef.current = next;
    const wasNew = !persistedRef.current;
    persistedRef.current = true;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (!debounce) {
      upsertArcWritingTextEntry(next);
    } else {
      saveTimeoutRef.current = setTimeout(() => upsertArcWritingTextEntry(next), AUTO_SAVE_DEBOUNCE_MS);
    }
    if (wasNew) router.setParams({ id: next.id });
  }

  if (!text) return <SafeAreaView style={styles.safeArea} />;

  function handleTitleChange(value: string) {
    if (!text) return;
    persist({ ...text, title: value, updatedAt: new Date().toISOString() }, true);
  }

  function handleBodyChange(value: string) {
    if (!text) return;
    persist({ ...text, body: value, updatedAt: new Date().toISOString() }, true);
  }

  function handleVideoTopicChange(value: string) {
    if (!text) return;
    persist(updateArcWritingText(text, { videoTopic: value }, new Date().toISOString()), true);
  }

  function handleVideoPurposeChange(value: string) {
    if (!text) return;
    persist(updateArcWritingText(text, { videoPurpose: value }, new Date().toISOString()), true);
  }

  function handleToggleDraft() {
    if (!text) return;
    persist(updateArcWritingText(text, { isDraft: !text.isDraft }, new Date().toISOString()), false);
  }

  function toggleInsight(insightId: string) {
    if (!text) return;
    const now = new Date().toISOString();
    persist(text.insightIds.includes(insightId) ? unlinkInsightFromWritingText(text, insightId, now) : linkInsightToWritingText(text, insightId, now), false);
  }

  function toggleIncorporated(insightId: string) {
    if (!text) return;
    persist(toggleInsightIncorporatedInWritingText(text, insightId, new Date().toISOString()), false);
  }

  function toggleRelationship(relationshipId: string) {
    if (!text) return;
    const now = new Date().toISOString();
    persist(
      text.relationshipIds.includes(relationshipId)
        ? unlinkRelationshipFromWritingText(text, relationshipId, now)
        : linkRelationshipToWritingText(text, relationshipId, now),
      false
    );
  }

  function handleAssociateChapter(chapter: ArcBookChapter) {
    if (!text) return;
    persist(associateWritingTextWithChapter(text, chapter.bookId, chapter.id, new Date().toISOString()), false);
    setShowChapterPicker(false);
  }

  function handleClearChapterAssociation() {
    if (!text) return;
    persist(clearWritingTextChapterAssociation(text, new Date().toISOString()), false);
  }

  const linkedInsights = insights.filter((insight) => text.insightIds.includes(insight.id));
  const associatedBook = books.find((book) => book.id === text.associatedBookId) ?? null;
  const associatedChapter = chapters.find((chapter) => chapter.id === text.associatedChapterId) ?? null;
  const isVideoScript = text.kind === "video_script";
  const scriptRecordings = isVideoScript ? resolveVideoRecordingsForScript(videoRecordings, text.id) : [];

  function handleRecordVideo() {
    if (!text) return;
    if (!persistedRef.current) persist(text, false);
    router.push({ pathname: "/arc-gym/video/record/[scriptId]", params: { scriptId: text.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput style={styles.titleInput} placeholder="כותרת" value={text.title} onChangeText={handleTitleChange} textAlign="right" />

        {isVideoScript && (
          <View style={styles.videoScriptSection}>
            <Text style={styles.sectionTitle}>🎥 תסריט לסרטון</Text>
            <TextInput style={styles.videoFieldInput} placeholder="על מה הסרטון (נושא)" value={text.videoTopic ?? ""} onChangeText={handleVideoTopicChange} textAlign="right" />
            <TextInput
              style={styles.videoFieldInput}
              placeholder="מה המטרה שרוצים להשיג דרך הסרטון הזה"
              value={text.videoPurpose ?? ""}
              onChangeText={handleVideoPurposeChange}
              textAlign="right"
            />
          </View>
        )}

        <View style={styles.linkedInsightsRow}>
          {linkedInsights.map((insight) => (
            <Pressable key={insight.id} style={styles.incorporatedChip} onPress={() => toggleIncorporated(insight.id)}>
              <Text style={styles.incorporatedChipText}>
                {text.incorporatedInsightIds.includes(insight.id) ? "✓ " : ""}
                {insight.text.slice(0, 20)}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.bodyInput}
          placeholder="כתוב כאן בחופשיות..."
          value={text.body}
          onChangeText={handleBodyChange}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        {isVideoScript && (
          <View style={styles.videoScriptSection}>
            <Pressable style={styles.recordButton} onPress={handleRecordVideo}>
              <Text style={styles.recordButtonText}>🎥 צלם סרטון</Text>
            </Pressable>
            {scriptRecordings.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>הקלטות של התסריט הזה</Text>
                {scriptRecordings.map((recording) => (
                  <Pressable
                    key={recording.id}
                    style={styles.chapterRow}
                    onPress={() => router.push({ pathname: "/arc-gym/video/[id]", params: { id: recording.id } })}
                  >
                    <Text style={styles.hint}>
                      {recording.title || "(ללא כותרת)"} · {recording.visibility === "published" ? "פורסם" : "פרטי"} · {recording.isDraft ? "טיוטה" : "סופי"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        <Pressable style={styles.linkToggle} onPress={() => setShowLinking((prev) => !prev)}>
          <Text style={styles.linkToggleText}>{showLinking ? "סגור תובנות וקשרים" : "תובנות וקשרים"}</Text>
        </Pressable>
        {showLinking && (
          <View>
            <ArcInsightPicker
              insights={insights}
              selectedInsightIds={text.insightIds}
              onToggle={toggleInsight}
              onInsightCreated={(insight) => {
                setInsights((prev) => [...prev, insight]);
                toggleInsight(insight.id);
              }}
            />
            <ArcRelationshipPicker
              insights={insights}
              insightIds={text.insightIds}
              allRelationships={relationships}
              selectedRelationshipIds={text.relationshipIds}
              onToggleRelationship={toggleRelationship}
              onRelationshipCreated={(relationship) => {
                setRelationships((prev) => [...prev, relationship]);
                toggleRelationship(relationship.id);
              }}
            />
          </View>
        )}

        <View style={styles.chapterSection}>
          <Text style={styles.sectionTitle}>שיוך לפרק בספר</Text>
          {associatedChapter && associatedBook ? (
            <View>
              <Text style={styles.hint}>
                {associatedBook.name} · {associatedChapter.name}
              </Text>
              <Pressable onPress={handleClearChapterAssociation}>
                <Text style={styles.linkToggleText}>הסר שיוך</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setShowChapterPicker((prev) => !prev)}>
              <Text style={styles.linkToggleText}>{showChapterPicker ? "סגור" : "שייך לפרק קיים"}</Text>
            </Pressable>
          )}
          {showChapterPicker &&
            chapters.map((chapter) => {
              const book = books.find((candidate) => candidate.id === chapter.bookId);
              return (
                <Pressable key={chapter.id} style={styles.chapterRow} onPress={() => handleAssociateChapter(chapter)}>
                  <Text style={styles.hint}>
                    {book?.name ?? ""} · {chapter.name}
                  </Text>
                </Pressable>
              );
            })}
        </View>

        <View style={styles.draftRow}>
          <Text style={styles.sectionTitle}>{text.isDraft ? "טיוטה" : "הושלם"}</Text>
          <Switch value={!text.isDraft} onValueChange={handleToggleDraft} />
        </View>

        {!isNew && <ArcWritingTaskComposer targetKind="text" targetId={text.id} defaultTitle={`כתיבה: ${text.title || "ללא כותרת"}`} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 60 },
  titleInput: { fontSize: 18, fontWeight: "700", textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8, marginBottom: 10 },
  linkedInsightsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  incorporatedChip: { borderWidth: 1, borderColor: "#2E7D32", borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  incorporatedChipText: { color: "#2E7D32", fontSize: 12 },
  bodyInput: { minHeight: 240, fontSize: 15, textAlign: "right", color: "#222", lineHeight: 22, marginBottom: 14 },
  linkToggle: { alignSelf: "flex-end", marginBottom: 10 },
  linkToggleText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  chapterSection: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 12, marginTop: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#333" },
  hint: { fontSize: 13, color: "#777", textAlign: "right", marginVertical: 4 },
  chapterRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f3f3" },
  draftRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  videoScriptSection: { marginBottom: 14 },
  videoFieldInput: { fontSize: 14, textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 6, marginBottom: 8, color: "#333" },
  recordButton: { borderWidth: 1, borderColor: "#C62828", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 10 },
  recordButtonText: { color: "#C62828", fontSize: 15, fontWeight: "700" },
});

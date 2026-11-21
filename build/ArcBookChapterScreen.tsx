import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcBookChapter, ArcInsightRelationship, ArcWritingText } from "../arc/arcWriting.ts";
import {
  associateWritingTextWithChapter,
  linkInsightToChapter,
  linkRelationshipToChapter,
  resolveWritingTextsForChapter,
  unlinkInsightFromChapter,
  unlinkRelationshipFromChapter,
  updateArcBookChapter,
} from "../arc/arcWriting.ts";
import {
  loadArcBookChapters,
  loadArcInsightRelationships,
  loadArcInsights,
  loadArcWritingTexts,
  upsertArcBookChapterEntry,
  upsertArcWritingTextEntry,
} from "../data/storage.ts";
import ArcInsightPicker from "../live/components/ArcInsightPicker.tsx";
import ArcRelationshipPicker from "../live/components/ArcRelationshipPicker.tsx";
import ArcWritingTaskComposer from "../live/components/ArcWritingTaskComposer.tsx";

const AUTO_SAVE_DEBOUNCE_MS = 600;

/**
 * build/ArcBookChapterScreen.tsx (route /arc-gym/book/[id]/chapter/[chapterId])
 *
 * ARC Book task, spec section 2 step 4: write one chapter's own content,
 * with its own insight/relationship selection, and the ability to
 * incorporate a previously-written standalone ARC Writing text (linked
 * by id via associateWritingTextWithChapter, never copied/duplicated).
 * Same autosave convention as build/ArcWritingTextScreen.tsx /
 * build/PositiveMemoryWizardScreen.tsx.
 */
export default function ArcBookChapterScreen({ id, chapterId }: { id: string; chapterId: string }) {
  const [chapter, setChapter] = useState<ArcBookChapter | null>(null);
  const [insights, setInsights] = useState<ArcInsight[]>([]);
  const [relationships, setRelationships] = useState<ArcInsightRelationship[]>([]);
  const [incorporatedTexts, setIncorporatedTexts] = useState<ArcWritingText[]>([]);
  const [availableTexts, setAvailableTexts] = useState<ArcWritingText[]>([]);
  const [showLinking, setShowLinking] = useState(false);
  const [showIncorporatePicker, setShowIncorporatePicker] = useState(false);

  const chapterRef = useRef<ArcBookChapter | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcBookChapters(), loadArcInsights(), loadArcInsightRelationships(), loadArcWritingTexts()]).then(
        ([chapters, loadedInsights, loadedRelationships, texts]) => {
          const found = chapters.find((candidate) => candidate.id === chapterId) ?? null;
          setChapter(found);
          chapterRef.current = found;
          setInsights(loadedInsights);
          setRelationships(loadedRelationships);
          setIncorporatedTexts(resolveWritingTextsForChapter(texts, chapterId));
          setAvailableTexts(texts.filter((text) => !text.associatedChapterId));
        }
      );
      return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (chapterRef.current) upsertArcBookChapterEntry(chapterRef.current);
      };
    }, [chapterId])
  );

  function persist(next: ArcBookChapter, debounce: boolean) {
    setChapter(next);
    chapterRef.current = next;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (!debounce) {
      upsertArcBookChapterEntry(next);
    } else {
      saveTimeoutRef.current = setTimeout(() => upsertArcBookChapterEntry(next), AUTO_SAVE_DEBOUNCE_MS);
    }
  }

  if (!chapter) return <SafeAreaView style={styles.safeArea} />;

  function toggleInsight(insightId: string) {
    if (!chapter) return;
    persist(chapter.insightIds.includes(insightId) ? unlinkInsightFromChapter(chapter, insightId, new Date().toISOString()) : linkInsightToChapter(chapter, insightId, new Date().toISOString()), false);
  }

  function toggleRelationship(relationshipId: string) {
    if (!chapter) return;
    const now = new Date().toISOString();
    persist(
      chapter.relationshipIds.includes(relationshipId) ? unlinkRelationshipFromChapter(chapter, relationshipId, now) : linkRelationshipToChapter(chapter, relationshipId, now),
      false
    );
  }

  async function handleIncorporateText(text: ArcWritingText) {
    const now = new Date().toISOString();
    const updated = associateWritingTextWithChapter(text, id, chapterId, now);
    await upsertArcWritingTextEntry(updated);
    setIncorporatedTexts((prev) => [...prev, updated]);
    setAvailableTexts((prev) => prev.filter((candidate) => candidate.id !== text.id));
    setShowIncorporatePicker(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.titleInput}
          value={chapter.name}
          onChangeText={(value) => persist(updateArcBookChapter(chapter, { name: value }, new Date().toISOString()), true)}
          textAlign="right"
        />
        <TextInput
          style={styles.purposeInput}
          placeholder="מטרת הפרק"
          value={chapter.purpose}
          onChangeText={(value) => persist(updateArcBookChapter(chapter, { purpose: value }, new Date().toISOString()), true)}
          multiline
          textAlign="right"
        />

        <TextInput
          style={styles.bodyInput}
          placeholder="כתוב כאן את הפרק..."
          value={chapter.content}
          onChangeText={(value) => persist(updateArcBookChapter(chapter, { content: value }, new Date().toISOString()), true)}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        <Pressable style={styles.linkToggle} onPress={() => setShowLinking((prev) => !prev)}>
          <Text style={styles.linkToggleText}>{showLinking ? "סגור תובנות וקשרים" : "תובנות וקשרים"}</Text>
        </Pressable>
        {showLinking && (
          <View>
            <ArcInsightPicker
              insights={insights}
              selectedInsightIds={chapter.insightIds}
              onToggle={toggleInsight}
              onInsightCreated={(insight) => {
                setInsights((prev) => [...prev, insight]);
                toggleInsight(insight.id);
              }}
            />
            <ArcRelationshipPicker
              insights={insights}
              insightIds={chapter.insightIds}
              allRelationships={relationships}
              selectedRelationshipIds={chapter.relationshipIds}
              onToggleRelationship={toggleRelationship}
              onRelationshipCreated={(relationship) => {
                setRelationships((prev) => [...prev, relationship]);
                toggleRelationship(relationship.id);
              }}
            />
          </View>
        )}

        <View style={styles.incorporateBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>טקסטים משולבים</Text>
            <Pressable onPress={() => setShowIncorporatePicker((prev) => !prev)}>
              <Text style={styles.linkToggleText}>{showIncorporatePicker ? "סגור" : "+ שלב טקסט"}</Text>
            </Pressable>
          </View>
          {incorporatedTexts.length === 0 && <Text style={styles.hint}>אין עדיין טקסטים משולבים בפרק הזה.</Text>}
          {incorporatedTexts.map((text) => (
            <Text key={text.id} style={styles.hint}>• {text.title || "(ללא כותרת)"}</Text>
          ))}
          {showIncorporatePicker &&
            availableTexts.map((text) => (
              <Pressable key={text.id} style={styles.chapterRow} onPress={() => handleIncorporateText(text)}>
                <Text style={styles.hint}>{text.title || "(ללא כותרת)"}</Text>
              </Pressable>
            ))}
        </View>

        <ArcWritingTaskComposer targetKind="chapter" targetId={chapter.id} defaultTitle={`כתיבה: ${chapter.name}`} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 60 },
  titleInput: { fontSize: 18, fontWeight: "700", textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8 },
  purposeInput: { fontSize: 13, color: "#777", textAlign: "right", marginTop: 6, marginBottom: 12 },
  bodyInput: { minHeight: 240, fontSize: 15, textAlign: "right", color: "#222", lineHeight: 22, marginBottom: 14 },
  linkToggle: { alignSelf: "flex-end", marginBottom: 10 },
  linkToggleText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  incorporateBlock: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10, marginTop: 6 },
  sectionHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#333" },
  hint: { fontSize: 13, color: "#777", textAlign: "right", marginVertical: 2 },
  chapterRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 8, marginVertical: 3 },
});

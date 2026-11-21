import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import type { ArcBook, ArcBookChapter, ArcInsightRelationship } from "../arc/arcWriting.ts";
import {
  computeArcBookWordCount,
  createArcBook,
  createArcBookChapter,
  deleteArcBookChapterFromList,
  generateArcBookId,
  linkArcGymGoalToBook,
  linkInsightToBook,
  linkRelationshipToBook,
  resolveChaptersForBook,
  resolveLastEditedChapter,
  unlinkArcGymGoalFromBook,
  unlinkInsightFromBook,
  unlinkRelationshipFromBook,
  updateArcBook,
  updateArcBookChapter,
} from "../arc/arcWriting.ts";
import {
  deleteArcBookChapterEntry,
  loadArcBookChapters,
  loadArcBooks,
  loadArcGymGoals,
  loadArcInsightRelationships,
  loadArcInsights,
  upsertArcBookChapterEntry,
  upsertArcBookEntry,
} from "../data/storage.ts";
import ArcInsightPicker from "../live/components/ArcInsightPicker.tsx";
import ArcRelationshipPicker from "../live/components/ArcRelationshipPicker.tsx";
import { exportArcBookToPdf } from "../arc/arcBookExport.ts";

const AUTO_SAVE_DEBOUNCE_MS = 600;

const CHAPTER_STATUS_LABELS: Record<ArcBookChapter["status"], string> = {
  not_started: "לא התחיל",
  in_progress: "בתהליך",
  completed: "הושלם",
};

/**
 * build/ArcBookDetailScreen.tsx (route /arc-gym/book/[id], id="new" for creation)
 *
 * ARC Book task, spec section 2: create the book (step 1), select
 * insights/relationships related to its purpose (step 2), build its
 * chapter structure with add/delete/reorder (step 3), and show overall
 * progress (step 5) -- all on one home screen per book, mirroring
 * build/ArcGymGoalDetailScreen.tsx's own "one home screen links to
 * every child action" convention. Chapter WRITING itself (step 4)
 * happens on build/ArcBookChapterScreen.tsx; this screen only manages
 * structure. "new" is handled the same lazy-create-on-first-save way as
 * build/ArcTriggerEditorScreen.tsx.
 */
export default function ArcBookDetailScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [book, setBook] = useState<ArcBook | null>(null);
  const [chapters, setChapters] = useState<ArcBookChapter[]>([]);
  const [insights, setInsights] = useState<ArcInsight[]>([]);
  const [relationships, setRelationships] = useState<ArcInsightRelationship[]>([]);
  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [showLinking, setShowLinking] = useState(false);
  const [showGoalLinking, setShowGoalLinking] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcInsights(), loadArcInsightRelationships(), loadArcGymGoals()]).then(([loadedInsights, loadedRelationships, loadedGoals]) => {
        setInsights(loadedInsights);
        setRelationships(loadedRelationships);
        setGoals(loadedGoals);
      });
      if (!isNew) {
        Promise.all([loadArcBooks(), loadArcBookChapters()]).then(([books, allChapters]) => {
          setBook(books.find((candidate) => candidate.id === id) ?? null);
          setChapters(resolveChaptersForBook(allChapters, id));
        });
      }
    }, [id, isNew])
  );

  async function handleCreateBook() {
    if (!newName.trim() || !newTopic.trim() || !newPurpose.trim()) return;
    const now = new Date().toISOString();
    const created = createArcBook(generateArcBookId(), newName, newTopic, newPurpose, newDescription, now);
    await upsertArcBookEntry(created);
    setBook(created);
    router.setParams({ id: created.id });
  }

  function persistBook(next: ArcBook, debounce: boolean) {
    setBook(next);
    if (!debounce) {
      upsertArcBookEntry(next);
      return;
    }
    const handle = setTimeout(() => upsertArcBookEntry(next), AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }

  if (isNew && !book) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>📖 ספר חדש</Text>
          <TextInput style={styles.input} placeholder="שם הספר" value={newName} onChangeText={setNewName} textAlign="right" />
          <TextInput style={styles.input} placeholder="נושא" value={newTopic} onChangeText={setNewTopic} textAlign="right" />
          <TextInput style={styles.input} placeholder="מה המטרה שלך בספר?" value={newPurpose} onChangeText={setNewPurpose} multiline textAlign="right" />
          <TextInput style={styles.input} placeholder="תיאור קצר (אופציונלי)" value={newDescription} onChangeText={setNewDescription} multiline textAlign="right" />
          <Pressable style={styles.saveButton} onPress={handleCreateBook}>
            <Text style={styles.saveButtonText}>צור ספר</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!book) return <SafeAreaView style={styles.safeArea} />;

  async function handleAddChapter() {
    if (!book) return;
    const now = new Date().toISOString();
    const chapter = createArcBookChapter(book.id, `פרק ${chapters.length + 1}`, "", chapters.length, now);
    await upsertArcBookChapterEntry(chapter);
    setChapters([...chapters, chapter]);
  }

  function handleDeleteChapter(chapterId: string) {
    Alert.alert("מחיקת פרק", "האם למחוק את הפרק? התובנות עצמן לא יימחקו.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק",
        style: "destructive",
        onPress: async () => {
          await deleteArcBookChapterEntry(chapterId);
          setChapters(deleteArcBookChapterFromList(chapters, chapterId));
        },
      },
    ]);
  }

  async function moveChapter(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;
    const now = new Date().toISOString();
    const reordered = [...chapters];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const withOrder = reordered.map((chapter, position) => ({ ...chapter, order: position, updatedAt: now }));
    setChapters(withOrder);
    await Promise.all([upsertArcBookChapterEntry(withOrder[index]), upsertArcBookChapterEntry(withOrder[targetIndex])]);
  }

  function toggleInsight(insightId: string) {
    if (!book) return;
    const now = new Date().toISOString();
    persistBook(book.insightIds.includes(insightId) ? unlinkInsightFromBook(book, insightId, now) : linkInsightToBook(book, insightId, now), false);
  }

  function toggleRelationship(relationshipId: string) {
    if (!book) return;
    const now = new Date().toISOString();
    persistBook(
      book.relationshipIds.includes(relationshipId) ? unlinkRelationshipFromBook(book, relationshipId, now) : linkRelationshipToBook(book, relationshipId, now),
      false
    );
  }

  function toggleGoal(goalId: string) {
    if (!book) return;
    const now = new Date().toISOString();
    persistBook(book.linkedGoalIds.includes(goalId) ? unlinkArcGymGoalFromBook(book, goalId, now) : linkArcGymGoalToBook(book, goalId, now), false);
  }

  const wordCounts = computeArcBookWordCount(chapters, book.id);
  const lastEdited = resolveLastEditedChapter(chapters, book.id);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput style={styles.titleInput} value={book.name} onChangeText={(value) => persistBook(updateArcBook(book, { name: value }, new Date().toISOString()), true)} textAlign="right" />
        <TextInput
          style={styles.subtitleInput}
          value={book.purpose}
          onChangeText={(value) => persistBook(updateArcBook(book, { purpose: value }, new Date().toISOString()), true)}
          placeholder="מטרת הספר"
          multiline
          textAlign="right"
        />

        <View style={styles.progressBlock}>
          <Text style={styles.sectionTitle}>התקדמות</Text>
          <Text style={styles.hint}>{`סה"כ מילים: ${wordCounts.totalWordCount}`}</Text>
          {lastEdited && (
            <Pressable onPress={() => router.push({ pathname: "/arc-gym/book/[id]/chapter/[chapterId]", params: { id: book.id, chapterId: lastEdited.id } })}>
              <Text style={styles.linkText}>{`המשך מכאן: ${lastEdited.name}`}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => exportArcBookToPdf(book, chapters)}>
            <Text style={styles.linkText}>ייצוא לקובץ PDF</Text>
          </Pressable>
        </View>

        <View style={styles.chaptersBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>פרקים</Text>
            <Pressable onPress={handleAddChapter}>
              <Text style={styles.linkText}>+ פרק</Text>
            </Pressable>
          </View>
          {chapters.length === 0 && <Text style={styles.hint}>עדיין לא נוספו פרקים.</Text>}
          {chapters.map((chapter, index) => (
            <View key={chapter.id} style={styles.chapterRow}>
              <Pressable style={styles.chapterInfo} onPress={() => router.push({ pathname: "/arc-gym/book/[id]/chapter/[chapterId]", params: { id: book.id, chapterId: chapter.id } })}>
                <Text style={styles.chapterName}>{chapter.name}</Text>
                <Text style={styles.hint}>{`${CHAPTER_STATUS_LABELS[chapter.status]} · ${wordCounts.chapterWordCounts[chapter.id] ?? 0} מילים`}</Text>
              </Pressable>
              <View style={styles.chapterActions}>
                <Pressable disabled={index === 0} onPress={() => moveChapter(index, -1)}>
                  <Text style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}>▲</Text>
                </Pressable>
                <Pressable disabled={index === chapters.length - 1} onPress={() => moveChapter(index, 1)}>
                  <Text style={[styles.moveButton, index === chapters.length - 1 && styles.moveButtonDisabled]}>▼</Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteChapter(chapter.id)}>
                  <Text style={styles.deleteButton}>🗑</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.linkingBlock}>
          <Pressable onPress={() => setShowGoalLinking((prev) => !prev)}>
            <Text style={styles.sectionTitle}>{showGoalLinking ? "סגור שיוך למטרות" : "שיוך למטרות"}</Text>
          </Pressable>
          {goals.filter((goal) => book.linkedGoalIds.includes(goal.id)).map((goal) => (
            <Text key={goal.id} style={styles.hint}>• {goal.title}</Text>
          ))}
          {showGoalLinking &&
            goals.map((goal) => {
              const linked = book.linkedGoalIds.includes(goal.id);
              return (
                <Pressable key={goal.id} style={styles.chapterRow} onPress={() => toggleGoal(goal.id)}>
                  <Text style={[styles.hint, linked && styles.hintLinked]}>{goal.title}</Text>
                  <Text style={styles.hint}>{linked ? "☑" : "☐"}</Text>
                </Pressable>
              );
            })}
        </View>

        <Pressable style={styles.linkToggle} onPress={() => setShowLinking((prev) => !prev)}>
          <Text style={styles.linkToggleText}>{showLinking ? "סגור תובנות וקשרים" : "תובנות וקשרים של הספר"}</Text>
        </Pressable>
        {showLinking && (
          <View>
            <ArcInsightPicker
              insights={insights}
              selectedInsightIds={book.insightIds}
              onToggle={toggleInsight}
              onInsightCreated={(insight) => {
                setInsights((prev) => [...prev, insight]);
                toggleInsight(insight.id);
              }}
            />
            <ArcRelationshipPicker
              insights={insights}
              insightIds={book.insightIds}
              allRelationships={relationships}
              selectedRelationshipIds={book.relationshipIds}
              onToggleRelationship={toggleRelationship}
              onRelationshipCreated={(relationship) => {
                setRelationships((prev) => [...prev, relationship]);
                toggleRelationship(relationship.id);
              }}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 10, textAlign: "right" },
  saveButton: { backgroundColor: "#2E7D32", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  titleInput: { fontSize: 20, fontWeight: "700", textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8 },
  subtitleInput: { fontSize: 14, color: "#555", textAlign: "right", marginTop: 6, marginBottom: 14 },
  progressBlock: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  sectionHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  hint: { fontSize: 13, color: "#777", textAlign: "right", marginVertical: 2 },
  hintLinked: { color: "#0a7ea4", fontWeight: "700" },
  linkText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13, textAlign: "right", marginTop: 4 },
  chaptersBlock: { marginBottom: 14 },
  chapterRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10, marginBottom: 6 },
  chapterInfo: { flex: 1 },
  chapterName: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
  chapterActions: { flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  moveButton: { fontSize: 16, color: "#0a7ea4" },
  moveButtonDisabled: { color: "#ccc" },
  deleteButton: { fontSize: 16 },
  linkingBlock: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10, marginBottom: 10 },
  linkToggle: { alignSelf: "flex-end", marginBottom: 10 },
  linkToggleText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
});

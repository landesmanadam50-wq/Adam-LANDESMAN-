import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import type { TaskLinkedAction, TaskLinkedActionKind } from "../../arc/taskLinkedAction.ts";
import { createTaskLinkedAction, linkedActionKindNeedsItem } from "../../arc/taskLinkedAction.ts";
import type { ArcGymSituation } from "../../arc/arcGym.ts";
import type { ArcLearningTopic } from "../../arc/arcLearningTopic.ts";
import type { ArcFocusExercise } from "../../arc/arcFocusExercise.ts";
import type { ArcWritingText, ArcBookChapter } from "../../arc/arcWriting.ts";
import { loadArcBookChapters, loadArcBooks, loadArcFocusExercises, loadArcGymSituations, loadArcLearningTopics, loadArcWritingTexts } from "../../data/storage.ts";

/**
 * live/components/TaskLinkedActionPicker.tsx
 *
 * Action-Based Tasks task, section 3/9: the shared 2-level chip picker
 * for Task.linkedAction (arc/taskLinkedAction.ts) -- mounted in
 * build/TaskEditorScreen.tsx for BOTH fixed/weekly tasks and To-Do
 * items (requirement 3's own "both kinds of tasks"), never gated
 * behind isTodoItem. Level 1 picks the module kind; level 2 (only for
 * kinds whose module has more than one thing to point at) picks the
 * specific topic/exercise/situation/text/chapter. Writes straight into
 * the caller's draft via onChange -- no local persistence, same
 * convention as every other chip-row section in that screen.
 */

const KIND_LABELS: Record<TaskLinkedActionKind, string> = {
  none: "משימה רגילה",
  arc_behaviour: "ARC Behaviour",
  arc_learning: "ARC Learning",
  arc_creativity: "ARC Creativity",
  arc_focus: "ARC Focus",
  arc_video: "ARC Video",
  arc_writing: "ARC Writing",
  arc_book: "כתיבת ספר (ARC Book)",
  arc_diary: "ARC Diary",
  arc_questions_write: "ARC Questions -- כתיבת שאלה",
  arc_questions_explore: "ARC Questions -- חקירה/מענה",
  write_insight: "כתיבת תובנה",
  organize_insights: "שיוך תובנות לנושא",
  write_positive_event: "כתיבת אירוע חיובי",
};

const KIND_ORDER: TaskLinkedActionKind[] = [
  "none",
  "arc_behaviour",
  "arc_learning",
  "arc_creativity",
  "arc_focus",
  "arc_video",
  "arc_writing",
  "arc_book",
  "arc_diary",
  "arc_questions_write",
  "arc_questions_explore",
  "write_insight",
  "organize_insights",
  "write_positive_event",
];

interface PickerItem {
  id: string;
  label: string;
}

export default function TaskLinkedActionPicker({ value, onChange }: { value: TaskLinkedAction | null; onChange: (action: TaskLinkedAction | null) => void }) {
  const [situations, setSituations] = useState<ArcGymSituation[]>([]);
  const [topics, setTopics] = useState<ArcLearningTopic[]>([]);
  const [focusExercises, setFocusExercises] = useState<ArcFocusExercise[]>([]);
  const [writingTexts, setWritingTexts] = useState<ArcWritingText[]>([]);
  const [bookChapters, setBookChapters] = useState<ArcBookChapter[]>([]);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcGymSituations(), loadArcLearningTopics(), loadArcFocusExercises(), loadArcWritingTexts(), loadArcBooks(), loadArcBookChapters()]).then(
        ([loadedSituations, loadedTopics, loadedFocus, loadedTexts, loadedBooks, loadedChapters]) => {
          setSituations(loadedSituations);
          setTopics(loadedTopics);
          setFocusExercises(loadedFocus);
          setWritingTexts(loadedTexts);
          setBookChapters(loadedChapters);
          setBookNames(Object.fromEntries(loadedBooks.map((book) => [book.id, book.name])));
        }
      );
    }, [])
  );

  const kind: TaskLinkedActionKind = value?.kind ?? "none";

  function selectKind(nextKind: TaskLinkedActionKind) {
    if (nextKind === "none") {
      onChange(null);
      return;
    }
    onChange(createTaskLinkedAction(nextKind, null));
  }

  function selectItem(itemId: string | null) {
    onChange(createTaskLinkedAction(kind, itemId));
  }

  const items: PickerItem[] = resolveItemsForKind(kind, situations, topics, focusExercises, writingTexts, bookChapters, bookNames);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>פעולה מקושרת (אופציונלי)</Text>
      <Text style={styles.hint}>אם תבחר פעולה, התחלת המשימה תעביר אותך ישירות אליה -- הטיימר של המשימה עדיין מתחיל לרוץ כרגיל.</Text>
      <View style={styles.chipRow}>
        {KIND_ORDER.map((candidateKind) => (
          <Pressable key={candidateKind} style={[styles.chip, kind === candidateKind && styles.chipSelected]} onPress={() => selectKind(candidateKind)}>
            <Text style={[styles.chipText, kind === candidateKind && styles.chipTextSelected]}>{KIND_LABELS[candidateKind]}</Text>
          </Pressable>
        ))}
      </View>

      {linkedActionKindNeedsItem(kind) && (
        <View style={styles.itemBlock}>
          <Text style={styles.itemLabel}>בחר פריט ספציפי (אופציונלי)</Text>
          <View style={styles.chipRow}>
            <Pressable style={[styles.chip, (value?.itemId ?? null) === null && styles.chipSelected]} onPress={() => selectItem(null)}>
              <Text style={[styles.chipText, (value?.itemId ?? null) === null && styles.chipTextSelected]}>ללא פריט ספציפי</Text>
            </Pressable>
            {items.map((item) => (
              <Pressable key={item.id} style={[styles.chip, value?.itemId === item.id && styles.chipSelected]} onPress={() => selectItem(item.id)}>
                <Text style={[styles.chipText, value?.itemId === item.id && styles.chipTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function resolveItemsForKind(
  kind: TaskLinkedActionKind,
  situations: ArcGymSituation[],
  topics: ArcLearningTopic[],
  focusExercises: ArcFocusExercise[],
  writingTexts: ArcWritingText[],
  bookChapters: ArcBookChapter[],
  bookNames: Record<string, string>
): PickerItem[] {
  switch (kind) {
    case "arc_behaviour":
      return situations.map((situation) => ({ id: situation.id, label: situation.situationDescription || situation.trigger || situation.id }));
    case "arc_learning":
      return topics.map((topic) => ({ id: topic.id, label: topic.title }));
    case "arc_focus":
      return focusExercises.map((exercise) => ({ id: exercise.id, label: exercise.title }));
    case "arc_writing":
      return writingTexts.filter((text) => text.kind === "standard").map((text) => ({ id: text.id, label: text.title }));
    case "arc_video":
      return writingTexts.filter((text) => text.kind === "video_script").map((text) => ({ id: text.id, label: text.title }));
    case "arc_book":
      return bookChapters.map((chapter) => ({ id: chapter.id, label: `${bookNames[chapter.bookId] ?? ""} -- ${chapter.name}` }));
    default:
      return [];
  }
}

const styles = StyleSheet.create({
  block: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  hint: { fontSize: 12, textAlign: "right", color: "#777", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  chipTextSelected: { color: "#fff" },
  itemBlock: { marginTop: 10 },
  itemLabel: { fontSize: 13, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#666" },
});

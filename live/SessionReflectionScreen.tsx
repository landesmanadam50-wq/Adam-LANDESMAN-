import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { getTask, loadLastEncodingFeelingForTask, upsertPositiveMemoryDraftEntry, upsertPositiveMemoryEntry } from "../data/storage.ts";
import { saveNewTaskReflection } from "../data/taskReflection.ts";
// Positive Memory, Success Recall & Quick Capture task, sections
// 11-12 ("allow skipping documentation after task completion" /
// "save completed success reflections as memories"): additive to
// this existing, unchanged screen -- documenting is always optional
// and finalizes ONLY on explicit confirmation, never on its own.
import { createPositiveMemory, generatePositiveMemoryId, setPositiveMemoryFeelings, updatePositiveMemory } from "../arc/positiveMemory.ts";
import { createPositiveMemoryDraft, generatePositiveMemoryDraftId, updatePositiveMemoryDraftFields } from "../arc/positiveMemoryDraft.ts";

/**
 * live/SessionReflectionScreen.tsx (route /tasks/[id]/reflect)
 *
 * Productivity roadmap, Stage X (historical): "after a task session,
 * ask a minimal optional reflection... keep this short and skippable.
 * Do not turn every task session into a long questionnaire." Reached
 * once a task is marked completed (live/ActiveTaskScreen.tsx's
 * handleComplete/finishIdentityInsight) -- never forced to answer
 * anything, but no longer skippable as a NAVIGATION step: alarm-timer
 * integration task, requirement 6, "at completion, the appropriate
 * reflection appears, then automatic transition to the next task" --
 * both "שמירה" and "דלג" below advance to whatever's next, via
 * goToPostTaskReward below.
 *
 * Unified ARC & Productivity Update task, requirement 5 ("SIMPLIFY
 * POST-TASK REFLECTION"): this screen now asks exactly ONE optional
 * question -- "לאיזה חלק מהמשימה הכי התחברתי?" -- "to help users
 * remember the most meaningful or enjoyable part of the task without
 * adding cognitive load." The three previous questions ("חזרת למשימה
 * אחר כך?" / "מה עזר?" / "מה כדאי לחזור עליו בפעם הבאה?" -- the
 * `session_reflection` TaskJournalEntry's own
 * reflectionReturnedAfterArc/reflectionWhatHelped/reflectionWhatToReuse
 * fields) are gone from this screen entirely; appendTaskJournalEntry
 * is no longer called from here at all. Nothing is deleted or
 * migrated: TaskJournalEntry's own type/fields/storage
 * (data/taskJournal.ts) are completely untouched, and every
 * historical "session_reflection" entry a trainee already saved stays
 * exactly as it was, fully readable -- this screen simply never
 * writes a new one going forward.
 *
 * The one remaining question reuses the EXISTING single-field
 * TaskReflection model (data/taskReflection.ts) that the former "מה
 * למדת מהמשימה הזאת?" question already saved against -- "save the
 * response to the completed task occurrence" is exactly what
 * saveNewTaskReflection already does (one TaskReflection record per
 * save, taskId-scoped, fully historical/editable/deletable elsewhere
 * in the app), so only the question's own TEXT changes, never the
 * underlying field, its persistence, or its reader
 * (getLatestReflectionTextForTask, which still feeds the task's own
 * alarm notification exactly as before). Saving with the field left
 * blank is already a no-op there (saveNewTaskReflection trims and
 * returns null for empty text) -- "allow immediate completion without
 * answering" needs no extra guard here.
 */
export default function SessionReflectionScreen({
  taskId,
  continuousRoutineSummary = false,
  combinedSmiles = null,
}: {
  taskId: string;
  continuousRoutineSummary?: boolean;
  /** Unified ARC & Productivity Update task, requirement 9: only meaningful when continuousRoutineSummary is true -- the combined smile total earned across the WHOLE continuous routine (never just this last task), to display on the one shared reward screen instead of going straight home. */
  combinedSmiles?: number | null;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [favoritePartText, setFavoritePartText] = useState("");
  /**
   * Task Completion Navigation fix (follow-up hardening): a plain
   * `useState` guard wouldn't actually stop a rapid double-tap on
   * "שמירה" either, since its setter's new value is only visible
   * starting the NEXT render -- a second tap that fires before that
   * render lands would still read the old value. A ref is checked and
   * set synchronously, before anything else in finish() runs, so it
   * really is the first call that wins, never a second write.
   */
  const finishingRef = useRef(false);

  /**
   * Positive Memory, Success Recall & Quick Capture task, section 11
   * ("allow skipping documentation after task completion"): the
   * choice is entirely additive and optional -- "undecided" shows
   * both options, "skipped" hides this block for the rest of this
   * mount (never re-prompting, never creating an empty record), and
   * "documenting" reveals the section 10 question block. The existing
   * single favoritePartText question and שמירה/דלג buttons below are
   * rendered completely unconditionally either way.
   */
  const [successDocChoice, setSuccessDocChoice] = useState<"undecided" | "documenting" | "skipped">("undecided");
  const [lastEncodingFeeling, setLastEncodingFeeling] = useState<string | null>(null);
  const [successWhatSucceeded, setSuccessWhatSucceeded] = useState("");
  const [successFeelingPart, setSuccessFeelingPart] = useState("");
  const [successFeelingNotExperienced, setSuccessFeelingNotExperienced] = useState(false);
  const [successWhereWhen, setSuccessWhereWhen] = useState("");
  const [successWhatWasSpecial, setSuccessWhatWasSpecial] = useState("");
  const [successSaved, setSuccessSaved] = useState(false);
  const savingSuccessRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
      loadLastEncodingFeelingForTask(taskId).then(setLastEncodingFeeling);
    }, [taskId])
  );

  /** Section 10, question 2: personalized to the REAL feeling resolved in encoding when known -- never assumed/invented when it isn't. */
  function resolveSuccessFeelingQuestionText(): string {
    return lastEncodingFeeling
      ? `באיזה חלק מהפעולה הרגשת ${lastEncodingFeeling} (התחושה שחווית בקידוד)?`
      : "באיזה חלק מהפעולה הרגשת את התחושה שחווית בקידוד?";
  }

  function chooseDocumentSuccess() {
    setSuccessDocChoice("documenting");
  }

  /** Section 11: never opens documentation, never creates an empty record -- the ordinary completion flow below is entirely unaffected. */
  function skipSuccessDocumentation() {
    setSuccessDocChoice("skipped");
  }

  /**
   * Section 11: "if the user starts documenting then wants to stop,
   * preserve the incomplete work as an automatic draft" -- a REAL
   * PositiveMemoryDraft, structurally distinct from a finalized
   * PositiveMemory (arc/positiveMemoryDraft.ts's own collection), so
   * it can never be auto-selected until explicitly finalized later.
   */
  async function exitSuccessDocumentationAsDraft() {
    const now = new Date().toISOString();
    const draft = createPositiveMemoryDraft(generatePositiveMemoryDraftId(), "success", "task_completion_reflection", now, taskId);
    const withFields = updatePositiveMemoryDraftFields(
      draft,
      {
        successDescription: successWhatSucceeded,
        whatWasSpecial: successWhatWasSpecial,
        location: successWhereWhen.trim() ? successWhereWhen : null,
        feelings:
          !successFeelingNotExperienced && lastEncodingFeeling && successFeelingPart.trim()
            ? [{ feeling: lastEncodingFeeling, moment: successFeelingPart, intensity: null }]
            : [],
      },
      now
    );
    await upsertPositiveMemoryDraftEntry(withFields);
    setSuccessDocChoice("skipped");
  }

  /**
   * Section 12: finalizes ONLY on this explicit confirmation --
   * "שמור כהצלחה חדשה". Never falsely associates the encoding feeling
   * when the user indicated it was not actually experienced. Guarded
   * against a double-tap/re-entry the same way finish() below is
   * guarded, so reopening this same completed mount can never create
   * a second record from one real confirmation.
   */
  async function saveAsNewSuccess() {
    if (savingSuccessRef.current || successSaved) return;
    savingSuccessRef.current = true;
    const now = new Date().toISOString();
    let memory = createPositiveMemory(generatePositiveMemoryId(), "success", successWhatSucceeded.trim() || task?.title || "הצלחה", now);
    memory = updatePositiveMemory(
      memory,
      {
        successDescription: successWhatSucceeded,
        location: successWhereWhen.trim() ? successWhereWhen : null,
        whatWasSpecial: successWhatWasSpecial,
        taskId,
      },
      now
    );
    if (!successFeelingNotExperienced && lastEncodingFeeling && successFeelingPart.trim()) {
      memory = setPositiveMemoryFeelings(memory, [{ feeling: lastEncodingFeeling, moment: successFeelingPart, intensity: null }], now);
    }
    await upsertPositiveMemoryEntry(memory);
    setSuccessSaved(true);
  }

  // Unified ARC & Productivity Update task, requirement 9: "one
  // combined smile-reward experience at the end" -- a continuous
  // routine's own one summary reflection now also opens the SAME
  // shared post-task-reward screen every other completion path uses
  // (never a second, duplicated reward screen), passing the
  // routine's own combined smile total through combinedSmiles so it
  // displays the WHOLE routine's earnings, never just this last
  // task's own (possibly already-recorded-elsewhere, now idempotent)
  // share. source="today" there returns straight home once finished,
  // matching what this branch used to do unconditionally.
  function goToPostTaskReward() {
    if (continuousRoutineSummary) {
      router.replace({
        pathname: "/tasks/[id]/post-task-reward",
        params: { id: taskId, source: "today", combinedSmiles: combinedSmiles !== null ? String(combinedSmiles) : undefined },
      });
      return;
    }
    router.replace({ pathname: "/tasks/[id]/post-task-reward", params: { id: taskId } });
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await saveNewTaskReflection(taskId, favoritePartText, new Date());
    goToPostTaskReward();
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{continuousRoutineSummary ? "רפלקציה מסכמת לשגרה (רשות)" : "רפלקציה קצרה (רשות)"}</Text>

        {successDocChoice === "undecided" && (
          <View style={styles.successDocBlock}>
            <Pressable style={styles.primaryButton} onPress={chooseDocumentSuccess}>
              <Text style={styles.primaryButtonText}>תעד הצלחה</Text>
            </Pressable>
            <Pressable style={styles.successSkipLink} onPress={skipSuccessDocumentation}>
              <Text style={styles.skipLinkText}>דלג על התיעוד</Text>
            </Pressable>
          </View>
        )}

        {successDocChoice === "documenting" && !successSaved && (
          <View style={styles.successDocBlock}>
            <Text style={styles.question}>במה הצלחתי?</Text>
            <TextInput style={styles.textInput} value={successWhatSucceeded} onChangeText={setSuccessWhatSucceeded} textAlign="right" multiline />

            <Text style={styles.question}>{resolveSuccessFeelingQuestionText()}</Text>
            <TextInput
              style={styles.textInput}
              value={successFeelingPart}
              onChangeText={setSuccessFeelingPart}
              textAlign="right"
              multiline
              editable={!successFeelingNotExperienced}
            />
            <Pressable style={styles.checkboxRow} onPress={() => setSuccessFeelingNotExperienced((prev) => !prev)}>
              <Text style={styles.checkboxText}>{successFeelingNotExperienced ? "☑" : "☐"} בפועל לא הרגשתי את התחושה הזאת</Text>
            </Pressable>

            <Text style={styles.question}>איפה ומתי זה קרה?</Text>
            <TextInput style={styles.textInput} value={successWhereWhen} onChangeText={setSuccessWhereWhen} textAlign="right" multiline />

            <Text style={styles.question}>מה היה מיוחד בחלק הזה של הפעולה?</Text>
            <TextInput style={styles.textInput} value={successWhatWasSpecial} onChangeText={setSuccessWhatWasSpecial} textAlign="right" multiline />

            <Pressable style={styles.primaryButton} onPress={saveAsNewSuccess}>
              <Text style={styles.primaryButtonText}>שמור כהצלחה חדשה</Text>
            </Pressable>
            <Pressable style={styles.successSkipLink} onPress={exitSuccessDocumentationAsDraft}>
              <Text style={styles.skipLinkText}>יציאה (שמירה כטיוטה)</Text>
            </Pressable>
          </View>
        )}

        {successSaved && (
          <View style={styles.successDocBlock}>
            <Text style={styles.hint}>ההצלחה נשמרה בהצלחה.</Text>
          </View>
        )}

        <Text style={styles.question}>לאיזה חלק מהמשימה הכי התחברתי?</Text>
        <TextInput style={styles.textInput} value={favoritePartText} onChangeText={setFavoritePartText} textAlign="right" multiline />

        <Pressable style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>שמירה</Text>
        </Pressable>
        <Pressable style={styles.skipLink} onPress={goToPostTaskReward}>
          <Text style={styles.skipLinkText}>דלג</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 14, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 50 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { marginTop: 14, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
  successDocBlock: { marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  successSkipLink: { marginTop: 14, alignItems: "center" },
  checkboxRow: { marginTop: 8 },
  checkboxText: { fontSize: 14, textAlign: "right", color: "#555" },
});

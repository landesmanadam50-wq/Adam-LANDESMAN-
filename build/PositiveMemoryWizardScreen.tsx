import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { resolvePositiveFeelingOptions } from "../arc/positiveFeelingOptions.ts";
import type { PositiveMemoryFeelingEntry } from "../arc/positiveMemory.ts";
import { setPositiveMemoryDraftEventType, setPositiveMemoryDraftStep, updatePositiveMemoryDraftFields } from "../arc/positiveMemoryDraft.ts";
import type { PositiveMemoryDraft } from "../arc/positiveMemoryDraft.ts";
import { generatePositiveMemoryId } from "../arc/positiveMemory.ts";
import {
  deletePositiveMemoryDraftEntry,
  finalizePositiveMemoryDraftEntry,
  loadPositiveMemoryDrafts,
  loadTasks,
  upsertPositiveMemoryDraftEntry,
} from "../data/storage.ts";
import type { Task } from "../arc/tasks.ts";
import MonthlyCalendar from "../live/components/MonthlyCalendar.tsx";

const SUCCESS_STEPS = ["task_link", "what_succeeded", "feeling_moment", "feeling_select", "when_where", "what_special", "review"];
const FEELING_STEPS = ["feeling_select", "what_happened", "feeling_moment", "when_where", "what_special", "review"];

const AUTO_SAVE_DEBOUNCE_MS = 600;

/**
 * build/PositiveMemoryWizardScreen.tsx (route /positive-memories/draft/[draftId])
 *
 * Positive Memory, Success Recall & Quick Capture task, sections 5+6+7:
 * the ONE multi-step documentation wizard for both event types --
 * success documentation (section 5) and positive-feeling event
 * documentation (section 6) share this single screen, branching only
 * on `draft.eventType`'s own step order, never two separately-authored
 * wizards. Every field change schedules a debounced save of the draft
 * (section 7: "save entered text as it changes, with appropriate
 * debounce"); every step transition ALSO flushes immediately (section
 * 7: "save draft modifications before navigating away whenever
 * possible") -- together these mean the trainee can never lose
 * unfinished documentation merely by leaving the screen, backgrounding
 * the app, or being interrupted by a call/notification.
 *
 * Section 4: switching event type mid-flow (the "←" back-to-start
 * action from the first step) goes through setPositiveMemoryDraftEventType,
 * never a hand-rolled field reset -- compatible answers survive.
 */
export default function PositiveMemoryWizardScreen({ draftId }: { draftId: string }) {
  const [draft, setDraft] = useState<PositiveMemoryDraft | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<PositiveMemoryDraft | null>(null);
  const savingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadPositiveMemoryDrafts(), loadTasks()]).then(([drafts, loadedTasks]) => {
        const found = drafts.find((candidate) => candidate.id === draftId) ?? null;
        setDraft(found);
        draftRef.current = found;
        setTasks([...loadedTasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      });
      return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (draftRef.current) upsertPositiveMemoryDraftEntry(draftRef.current);
      };
    }, [draftId])
  );

  function persist(next: PositiveMemoryDraft, debounce: boolean) {
    setDraft(next);
    draftRef.current = next;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (!debounce) {
      upsertPositiveMemoryDraftEntry(next);
      return;
    }
    saveTimeoutRef.current = setTimeout(() => {
      upsertPositiveMemoryDraftEntry(next);
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  function patchFields(patch: Parameters<typeof updatePositiveMemoryDraftFields>[1], debounce = true) {
    if (!draft) return;
    persist(updatePositiveMemoryDraftFields(draft, patch, new Date().toISOString()), debounce);
  }

  const steps = draft?.eventType === "positive_feeling" ? FEELING_STEPS : SUCCESS_STEPS;
  const stepIndex = draft ? Math.max(0, steps.indexOf(draft.currentStep)) : 0;

  function goToStep(step: string) {
    if (!draft) return;
    persist(setPositiveMemoryDraftStep(draft, step, new Date().toISOString()), false);
  }

  function goNext() {
    if (!draft) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex < steps.length) goToStep(steps[nextIndex]);
  }

  function goBack() {
    if (!draft) return;
    if (stepIndex === 0) {
      router.back();
      return;
    }
    goToStep(steps[stepIndex - 1]);
  }

  function switchEventType() {
    if (!draft) return;
    const nextType = draft.eventType === "success" ? "positive_feeling" : "success";
    const nextSteps = nextType === "positive_feeling" ? FEELING_STEPS : SUCCESS_STEPS;
    persist(setPositiveMemoryDraftStep(setPositiveMemoryDraftEventType(draft, nextType, new Date().toISOString()), nextSteps[0], new Date().toISOString()), false);
  }

  async function discardDraft() {
    if (!draft) return;
    await deletePositiveMemoryDraftEntry(draft.id);
    draftRef.current = null;
    if (draft.taskId) router.replace({ pathname: "/tasks/[id]", params: { id: draft.taskId } });
    else router.replace("/");
  }

  async function save() {
    if (!draft || savingRef.current) return;
    savingRef.current = true;
    const now = new Date().toISOString();
    const memory = await finalizePositiveMemoryDraftEntry(draft, generatePositiveMemoryId(), now);
    draftRef.current = null;
    if (draft.taskId) {
      router.replace({ pathname: "/tasks/[id]", params: { id: draft.taskId } });
      return;
    }
    router.replace({ pathname: "/positive-memories/[id]", params: { id: memory.id } });
  }

  if (!draft) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.hint}>טוען...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={switchEventType}>
          <Text style={styles.typeSwitchLink}>{draft.eventType === "success" ? "לתעד תחושה חיובית במקום זאת" : "לתעד הצלחה במקום זאת"}</Text>
        </Pressable>

        {draft.currentStep === "task_link" && (
          <TaskLinkStep tasks={tasks} taskId={draft.taskId} onChange={(taskId) => persist({ ...draft, taskId, updatedAt: new Date().toISOString() }, false)} onNext={goNext} />
        )}

        {draft.currentStep === "what_succeeded" && (
          <QuestionStep
            question="במה הצלחתי?"
            value={draft.fields.successDescription ?? ""}
            onChangeText={(text) => patchFields({ successDescription: text })}
            onNext={goNext}
          />
        )}

        {draft.currentStep === "what_happened" && (
          <QuestionStep question="מה קרה באירוע?" value={draft.fields.description} onChangeText={(text) => patchFields({ description: text })} onNext={goNext} />
        )}

        {draft.currentStep === "feeling_select" && (
          <FeelingSelectStep
            selectedFeelings={draft.fields.feelings}
            onChange={(feelings) => patchFields({ feelings }, false)}
            allowSkip={draft.eventType === "success"}
            onNext={goNext}
          />
        )}

        {draft.currentStep === "feeling_moment" && (
          <FeelingMomentStep
            eventType={draft.eventType}
            feelings={draft.fields.feelings}
            onChange={(feelings) => patchFields({ feelings }, false)}
            onNext={goNext}
          />
        )}

        {draft.currentStep === "when_where" && (
          <WhenWhereStep
            location={draft.fields.location}
            occurredAt={draft.fields.occurredAt}
            onChangeLocation={(location) => patchFields({ location })}
            onOpenCalendar={() => setShowCalendar(true)}
            onNext={goNext}
          />
        )}

        {draft.currentStep === "what_special" && (
          <QuestionStep question="מה היה מיוחד בחלק הזה?" value={draft.fields.whatWasSpecial} onChangeText={(text) => patchFields({ whatWasSpecial: text })} onNext={goNext} />
        )}

        {draft.currentStep === "review" && (
          <View style={styles.stepBlock}>
            <Text style={styles.question}>מוכן לשמור?</Text>
            <TextInput
              style={styles.textInput}
              value={draft.fields.title}
              onChangeText={(text) => patchFields({ title: text })}
              textAlign="right"
              placeholder="כותרת קצרה לאירוע"
            />
            <Pressable style={styles.primaryButton} onPress={save}>
              <Text style={styles.primaryButtonText}>{draft.eventType === "success" ? "שמור הצלחה" : "שמור אירוע"}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.navRow}>
          <Pressable onPress={goBack}>
            <Text style={styles.navLinkText}>{stepIndex === 0 ? "ביטול" : "הקודם"}</Text>
          </Pressable>
          <Pressable onPress={discardDraft}>
            <Text style={styles.discardLinkText}>מחיקת הטיוטה</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MonthlyCalendar
              selectedDate={draft.fields.occurredAt ? draft.fields.occurredAt.slice(0, 10) : null}
              onSelectDate={(date) => patchFields({ occurredAt: `${date}T${new Date().toISOString().slice(11)}` }, false)}
              onConfirm={() => setShowCalendar(false)}
              onCancel={() => setShowCalendar(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function QuestionStep({ question, value, onChangeText, onNext }: { question: string; value: string; onChangeText: (text: string) => void; onNext: () => void }) {
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.question}>{question}</Text>
      <TextInput style={styles.textInput} value={value} onChangeText={onChangeText} textAlign="right" multiline autoFocus />
      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>המשך</Text>
      </Pressable>
    </View>
  );
}

function TaskLinkStep({ tasks, taskId, onChange, onNext }: { tasks: Task[]; taskId: string | null; onChange: (taskId: string | null) => void; onNext: () => void }) {
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.question}>לאיזו משימה ההצלחה קשורה?</Text>
      <Pressable style={[styles.chip, taskId === null && styles.chipActive]} onPress={() => onChange(null)}>
        <Text style={[styles.chipText, taskId === null && styles.chipTextActive]}>לדלג ולקשר בהמשך / פעולה לא מתוזמנת</Text>
      </Pressable>
      {tasks.slice(0, 12).map((task) => (
        <Pressable key={task.id} style={[styles.chip, taskId === task.id && styles.chipActive]} onPress={() => onChange(task.id)}>
          <Text style={[styles.chipText, taskId === task.id && styles.chipTextActive]}>{task.title}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>המשך</Text>
      </Pressable>
    </View>
  );
}

function FeelingSelectStep({
  selectedFeelings,
  onChange,
  allowSkip,
  onNext,
}: {
  selectedFeelings: PositiveMemoryFeelingEntry[];
  onChange: (feelings: PositiveMemoryFeelingEntry[]) => void;
  allowSkip: boolean;
  onNext: () => void;
}) {
  const [customText, setCustomText] = useState("");
  const options = resolvePositiveFeelingOptions();

  function isSelected(feeling: string) {
    return selectedFeelings.some((entry) => entry.feeling === feeling);
  }

  function toggle(feeling: string) {
    if (isSelected(feeling)) {
      onChange(selectedFeelings.filter((entry) => entry.feeling !== feeling));
      return;
    }
    onChange([...selectedFeelings, { feeling, moment: "", intensity: null }]);
  }

  function addCustom() {
    const trimmed = customText.trim();
    if (!trimmed || isSelected(trimmed)) return;
    onChange([...selectedFeelings, { feeling: trimmed, moment: "", intensity: null }]);
    setCustomText("");
  }

  return (
    <View style={styles.stepBlock}>
      <Text style={styles.question}>איזו תחושה חיובית {allowSkip ? "הרגשת?" : "חווית?"}</Text>
      <View style={styles.chipRow}>
        {options.map((feeling) => (
          <Pressable key={feeling} style={[styles.chip, isSelected(feeling) && styles.chipActive]} onPress={() => toggle(feeling)}>
            <Text style={[styles.chipText, isSelected(feeling) && styles.chipTextActive]}>{feeling}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.customFeelingRow}>
        <TextInput style={styles.customFeelingInput} value={customText} onChangeText={setCustomText} textAlign="right" placeholder="תחושה אחרת..." />
        <Pressable style={styles.smallButton} onPress={addCustom}>
          <Text style={styles.smallButtonText}>הוסף</Text>
        </Pressable>
      </View>
      {allowSkip && (
        <Pressable onPress={() => onChange([])}>
          <Text style={styles.navLinkText}>לא הרגשתי תחושה חיובית מסוימת</Text>
        </Pressable>
      )}
      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>המשך</Text>
      </Pressable>
    </View>
  );
}

function FeelingMomentStep({
  eventType,
  feelings,
  onChange,
  onNext,
}: {
  eventType: "success" | "positive_feeling";
  feelings: PositiveMemoryFeelingEntry[];
  onChange: (feelings: PositiveMemoryFeelingEntry[]) => void;
  onNext: () => void;
}) {
  const [sharedMoment, setSharedMoment] = useState(feelings[0]?.moment ?? "");

  function updateMomentForAll(text: string) {
    setSharedMoment(text);
    onChange(feelings.map((entry) => ({ ...entry, moment: text })));
  }

  function updateMomentForOne(feeling: string, text: string) {
    onChange(feelings.map((entry) => (entry.feeling === feeling ? { ...entry, moment: text } : entry)));
  }

  if (feelings.length === 0) {
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.question}>באיזה חלק מהפעולה הרגשת תחושה חיובית?</Text>
        <TextInput style={styles.textInput} value={sharedMoment} onChangeText={setSharedMoment} textAlign="right" multiline />
        <Pressable style={styles.primaryButton} onPress={onNext}>
          <Text style={styles.primaryButtonText}>המשך</Text>
        </Pressable>
      </View>
    );
  }

  if (eventType === "success") {
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.question}>באיזה חלק מהפעולה הרגשת תחושה חיובית?</Text>
        <TextInput style={styles.textInput} value={sharedMoment} onChangeText={updateMomentForAll} textAlign="right" multiline autoFocus />
        <Pressable style={styles.primaryButton} onPress={onNext}>
          <Text style={styles.primaryButtonText}>המשך</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.stepBlock}>
      <Text style={styles.question}>באיזה רגע הרגשת את התחושה הזאת?</Text>
      {feelings.map((entry) => (
        <View key={entry.feeling} style={styles.momentBlock}>
          <Text style={styles.feelingLabel}>{entry.feeling}</Text>
          <TextInput style={styles.textInput} value={entry.moment} onChangeText={(text) => updateMomentForOne(entry.feeling, text)} textAlign="right" multiline />
        </View>
      ))}
      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>המשך</Text>
      </Pressable>
    </View>
  );
}

function WhenWhereStep({
  location,
  occurredAt,
  onChangeLocation,
  onOpenCalendar,
  onNext,
}: {
  location: string | null;
  occurredAt: string | null;
  onChangeLocation: (text: string) => void;
  onOpenCalendar: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.question}>איפה ומתי זה קרה?</Text>
      <TextInput style={styles.textInput} value={location ?? ""} onChangeText={onChangeLocation} textAlign="right" placeholder="מיקום" />
      <Pressable style={styles.dateButton} onPress={onOpenCalendar}>
        <Text style={styles.dateButtonText}>{occurredAt ? occurredAt.slice(0, 10) : "היום"}</Text>
      </Pressable>
      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>המשך</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, gap: 14 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", padding: 24 },
  typeSwitchLink: { color: "#999", fontSize: 12, textAlign: "right" },
  stepBlock: { gap: 12 },
  question: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#D98324", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  chip: { borderWidth: 1, borderColor: "#D98324", borderRadius: 10, padding: 12, marginBottom: 8 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chipActive: { backgroundColor: "#D98324" },
  chipText: { color: "#D98324", fontSize: 14, textAlign: "right" },
  chipTextActive: { color: "#fff" },
  customFeelingRow: { flexDirection: "row-reverse", gap: 8 },
  customFeelingInput: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, textAlign: "right" },
  smallButton: { borderWidth: 1, borderColor: "#D98324", borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" },
  smallButtonText: { color: "#D98324", fontSize: 14 },
  momentBlock: { gap: 6 },
  feelingLabel: { fontSize: 14, fontWeight: "700", color: "#D98324", textAlign: "right" },
  dateButton: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, alignItems: "center" },
  dateButtonText: { fontSize: 15 },
  navRow: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 8 },
  navLinkText: { color: "#666", fontSize: 14 },
  discardLinkText: { color: "#b00020", fontSize: 13 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
});

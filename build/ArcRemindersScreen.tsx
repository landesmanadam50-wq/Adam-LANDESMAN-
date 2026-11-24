import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcMantraSourceRef, ArcMantraSubtype, ArcRecallSourceKind, ArcMantraReminder, ArcRecallReminder } from "../arc/arcReminders.ts";
import { createArcMantraReminder, createArcRecallReminder } from "../arc/arcReminders.ts";
import { createSpreadSchedule } from "../arc/arcReminderSchedule.ts";
import type { ReminderSchedule } from "../arc/arcReminderSchedule.ts";
import {
  loadArcGymGoals,
  loadArcGymMemoryExercises,
  loadArcInsightRelationships,
  loadArcInsights,
  loadArcLearningInsights,
  loadArcMantraReminders,
  loadArcRecallReminders,
} from "../data/storage.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import type { ArcGymMemoryExercise } from "../arc/arcGym.ts";
import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcInsightRelationship } from "../arc/arcWriting.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { deleteArcMantraReminder, deleteArcRecallReminder, saveArcMantraReminder, saveArcRecallReminder } from "../data/arcReminderCrud.ts";
import { resolveArcMantraReminderText } from "../data/arcMantraDelivery.ts";
import { resolveArcRecallReminderQuestion } from "../data/arcRecallDelivery.ts";
import { resolveCurrentAndNextTaskForTransition } from "../data/dailyPlan.ts";
import { resolveTransitionMantra } from "../arc/taskTransitionMantra.ts";
import ReminderScheduleEditor from "../live/components/ReminderScheduleEditor.tsx";

const MANTRA_SUBTYPE_LABELS: Record<ArcMantraSubtype, string> = {
  desired_feeling: "תחושת סיום יום רצויה",
  arc_memory: "פעולה מזיכרון ARC",
  present_identity: "תובנת זהות נוכחית",
  future_identity: "זהות עתידית",
  arc_goal: "המטרה הבאה ב-ARC Goal",
};

const RECALL_SOURCE_LABELS: Record<ArcRecallSourceKind, string> = {
  insight: "תובנה",
  insight_relationship: "קשר בין תובנות",
  learning_material: "חומר למידה",
  arc_memory: "זיכרון ARC",
};

type Tab = "mantras" | "recall" | "task";
type MantraWizardStep = { kind: "subtype" } | { kind: "source"; subtype: ArcMantraSubtype } | { kind: "schedule"; subtype: ArcMantraSubtype; sourceRef: ArcMantraSourceRef };
type RecallWizardStep = { kind: "sourceKind" } | { kind: "source"; sourceKind: ArcRecallSourceKind } | { kind: "schedule"; sourceId: string; sourceKind: ArcRecallSourceKind };

function defaultSchedule(now: string): ReminderSchedule {
  return createSpreadSchedule(2, "09:00", "21:00", 120, [], now);
}

/**
 * build/ArcRemindersScreen.tsx (route /arc-reminders)
 *
 * ARC Reminders task, Phase 5: the central management screen, 3
 * sections per the plan -- ARC Mantras, ARC Active Recall, ARC Task
 * Reminders. Mantra/Recall previews are resolved LIVE on every reload
 * (resolveArcMantraReminderText/resolveArcRecallReminderQuestion --
 * the exact same read-through resolvers the real scheduler calls),
 * never a frozen copy stored on the reminder itself. The creation
 * wizard only ever stores a `sourceRef` id (never copied text) --
 * the mechanical form of "read-through."
 */
/**
 * `prefill`: carried in from one of the per-source "remind me of this"
 * entry points on an existing screen (ARC Memory, identity/insight,
 * ARC Build profile, ARC Goal, learning-material/insight screens) --
 * jumps straight to the schedule step with the right sourceRef already
 * chosen, skipping the subtype/source pickers this screen's own "+"
 * button still goes through. Only ever applied once per mount (the
 * trainee can still freely navigate away from the schedule step
 * afterward without it re-triggering).
 */
export default function ArcRemindersScreen({
  prefill,
}: {
  prefill?: { kind: "mantra"; subtype: ArcMantraSubtype; sourceRef: ArcMantraSourceRef } | { kind: "recall"; sourceKind: ArcRecallSourceKind; sourceId: string };
} = {}) {
  const [tab, setTab] = useState<Tab>(prefill?.kind === "recall" ? "recall" : "mantras");
  const [mantras, setMantras] = useState<{ reminder: ArcMantraReminder; preview: string | null }[]>([]);
  const [recalls, setRecalls] = useState<{ reminder: ArcRecallReminder; preview: string | null }[]>([]);
  const [transitionPreview, setTransitionPreview] = useState<string>("");

  const [mantraWizard, setMantraWizard] = useState<MantraWizardStep | null>(null);
  const [recallWizard, setRecallWizard] = useState<RecallWizardStep | null>(null);
  const [pendingMantraSchedule, setPendingMantraSchedule] = useState<ReminderSchedule | null>(null);
  const [pendingRecallSchedule, setPendingRecallSchedule] = useState<ReminderSchedule | null>(null);

  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [memories, setMemories] = useState<ArcGymMemoryExercise[]>([]);
  const [identityInsights, setIdentityInsights] = useState<ArcInsight[]>([]);
  const [allInsights, setAllInsights] = useState<ArcInsight[]>([]);
  const [relationships, setRelationships] = useState<ArcInsightRelationship[]>([]);
  const [learningInsights, setLearningInsights] = useState<ArcLearningInsight[]>([]);

  useEffect(() => {
    if (!prefill) return;
    const now = new Date().toISOString();
    if (prefill.kind === "mantra") {
      setMantraWizard({ kind: "schedule", subtype: prefill.subtype, sourceRef: prefill.sourceRef });
      setPendingMantraSchedule(defaultSchedule(now));
    } else {
      setRecallWizard({ kind: "schedule", sourceKind: prefill.sourceKind, sourceId: prefill.sourceId });
      setPendingRecallSchedule(defaultSchedule(now));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once-per-mount, see doc above.
  }, []);

  const reload = useCallback(() => {
    (async () => {
      const [mantraReminders, recallReminders, loadedGoals, loadedMemories, loadedInsights, loadedRelationships, loadedLearning, transition] = await Promise.all([
        loadArcMantraReminders(),
        loadArcRecallReminders(),
        loadArcGymGoals(),
        loadArcGymMemoryExercises(),
        loadArcInsights(),
        loadArcInsightRelationships(),
        loadArcLearningInsights(),
        resolveCurrentAndNextTaskForTransition(null),
      ]);
      setGoals(loadedGoals);
      setMemories(loadedMemories);
      setAllInsights(loadedInsights);
      setIdentityInsights(loadedInsights.filter((insight) => insight.beliefKind === "identity"));
      setRelationships(loadedRelationships);
      setLearningInsights(loadedLearning);
      setTransitionPreview(resolveTransitionMantra(transition.current, transition.next));

      const mantraPreviews = await Promise.all(mantraReminders.map(async (reminder) => ({ reminder, preview: await resolveArcMantraReminderText(reminder) })));
      setMantras(mantraPreviews);
      const recallPreviews = await Promise.all(
        recallReminders.map(async (reminder) => ({ reminder, preview: (await resolveArcRecallReminderQuestion(reminder))?.questionText ?? null }))
      );
      setRecalls(recallPreviews);
    })();
  }, []);

  useFocusEffect(reload);

  function scheduleSummary(schedule: ReminderSchedule): string {
    const daysText = schedule.daysOfWeek.length === 0 ? "כל יום" : `${schedule.daysOfWeek.length} ימים בשבוע`;
    const timeText = schedule.mode === "fixed_times" ? schedule.fixedTimes.join(", ") : `${schedule.timesPerDay}x ב-${schedule.windowStart}-${schedule.windowEnd}`;
    const pausedText = schedule.paused ? " (בהשהיה)" : "";
    return `${timeText} -- ${daysText}${pausedText}`;
  }

  async function confirmDeleteMantra(id: string) {
    Alert.alert("מחיקת תזכורת", "למחוק תזכורת מנטרה זו?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק",
        style: "destructive",
        onPress: async () => {
          await deleteArcMantraReminder(id);
          reload();
        },
      },
    ]);
  }

  async function confirmDeleteRecall(id: string) {
    Alert.alert("מחיקת תזכורת", "למחוק תזכורת זכירה זו?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק",
        style: "destructive",
        onPress: async () => {
          await deleteArcRecallReminder(id);
          reload();
        },
      },
    ]);
  }

  async function togglePauseMantra(entry: ArcMantraReminder) {
    const now = new Date().toISOString();
    await saveArcMantraReminder({ ...entry, schedule: { ...entry.schedule, paused: !entry.schedule.paused, updatedAt: now }, updatedAt: now });
    reload();
  }

  async function togglePauseRecall(entry: ArcRecallReminder) {
    const now = new Date().toISOString();
    await saveArcRecallReminder({ ...entry, schedule: { ...entry.schedule, paused: !entry.schedule.paused, updatedAt: now }, updatedAt: now });
    reload();
  }

  function startMantraWizard() {
    setMantraWizard({ kind: "subtype" });
  }

  function pickMantraSubtype(subtype: ArcMantraSubtype) {
    if (subtype === "desired_feeling" || subtype === "future_identity") {
      const now = new Date().toISOString();
      const sourceRef: ArcMantraSourceRef = subtype === "desired_feeling" ? { kind: "desired_feeling" } : { kind: "future_identity" };
      setMantraWizard({ kind: "schedule", subtype, sourceRef });
      setPendingMantraSchedule(defaultSchedule(now));
      return;
    }
    setMantraWizard({ kind: "source", subtype });
  }

  function pickMantraSource(subtype: ArcMantraSubtype, sourceRef: ArcMantraSourceRef) {
    const now = new Date().toISOString();
    setMantraWizard({ kind: "schedule", subtype, sourceRef });
    setPendingMantraSchedule(defaultSchedule(now));
  }

  async function saveMantraWizard() {
    if (!mantraWizard || mantraWizard.kind !== "schedule" || !pendingMantraSchedule) return;
    const now = new Date().toISOString();
    await saveArcMantraReminder(createArcMantraReminder(mantraWizard.subtype, mantraWizard.sourceRef, pendingMantraSchedule, now));
    setMantraWizard(null);
    setPendingMantraSchedule(null);
    reload();
  }

  function startRecallWizard() {
    setRecallWizard({ kind: "sourceKind" });
  }

  function pickRecallSourceKind(sourceKind: ArcRecallSourceKind) {
    setRecallWizard({ kind: "source", sourceKind });
  }

  function pickRecallSource(sourceKind: ArcRecallSourceKind, sourceId: string) {
    const now = new Date().toISOString();
    setRecallWizard({ kind: "schedule", sourceKind, sourceId });
    setPendingRecallSchedule(defaultSchedule(now));
  }

  async function saveRecallWizard() {
    if (!recallWizard || recallWizard.kind !== "schedule" || !pendingRecallSchedule) return;
    const now = new Date().toISOString();
    await saveArcRecallReminder(createArcRecallReminder({ kind: recallWizard.sourceKind, sourceId: recallWizard.sourceId }, pendingRecallSchedule, now));
    setRecallWizard(null);
    setPendingRecallSchedule(null);
    reload();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabButton, tab === "mantras" && styles.tabButtonActive]} onPress={() => setTab("mantras")}>
          <Text style={[styles.tabButtonText, tab === "mantras" && styles.tabButtonTextActive]}>ARC Mantras</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "recall" && styles.tabButtonActive]} onPress={() => setTab("recall")}>
          <Text style={[styles.tabButtonText, tab === "recall" && styles.tabButtonTextActive]}>ARC Active Recall</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, tab === "task" && styles.tabButtonActive]} onPress={() => setTab("task")}>
          <Text style={[styles.tabButtonText, tab === "task" && styles.tabButtonTextActive]}>ARC Task Reminders</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "mantras" && (
          <View>
            {mantraWizard === null ? (
              <View>
                <Pressable style={styles.addButton} onPress={startMantraWizard}>
                  <Text style={styles.addButtonText}>+ תזכורת מנטרה חדשה</Text>
                </Pressable>
                {mantras.length === 0 && <Text style={styles.hint}>אין עדיין תזכורות מנטרה.</Text>}
                {mantras.map(({ reminder, preview }) => (
                  <View key={reminder.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{MANTRA_SUBTYPE_LABELS[reminder.subtype]}</Text>
                    <Text style={styles.cardPreview}>{preview ?? "(אין תוכן עדיין להצגה)"}</Text>
                    <Text style={styles.cardSchedule}>{scheduleSummary(reminder.schedule)}</Text>
                    <View style={styles.cardActions}>
                      <Pressable style={styles.cardActionButton} onPress={() => togglePauseMantra(reminder)}>
                        <Text style={styles.cardActionText}>{reminder.schedule.paused ? "המשך" : "השהה"}</Text>
                      </Pressable>
                      <Pressable style={styles.cardActionButton} onPress={() => confirmDeleteMantra(reminder.id)}>
                        <Text style={[styles.cardActionText, styles.destructiveText]}>מחק</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : mantraWizard.kind === "subtype" ? (
              <View>
                <Text style={styles.sectionLabel}>איזה סוג מנטרה?</Text>
                {(Object.keys(MANTRA_SUBTYPE_LABELS) as ArcMantraSubtype[]).map((subtype) => (
                  <Pressable key={subtype} style={styles.pickerRow} onPress={() => pickMantraSubtype(subtype)}>
                    <Text style={styles.pickerRowText}>{MANTRA_SUBTYPE_LABELS[subtype]}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.cancelButton} onPress={() => setMantraWizard(null)}>
                  <Text style={styles.cancelButtonText}>ביטול</Text>
                </Pressable>
              </View>
            ) : mantraWizard.kind === "source" ? (
              <View>
                <Text style={styles.sectionLabel}>בחר מקור</Text>
                {mantraWizard.subtype === "arc_memory" &&
                  memories.map((memory) => (
                    <Pressable key={memory.id} style={styles.pickerRow} onPress={() => pickMantraSource("arc_memory", { kind: "arc_memory", memoryExerciseId: memory.id })}>
                      <Text style={styles.pickerRowText}>{memory.situationText}</Text>
                    </Pressable>
                  ))}
                {mantraWizard.subtype === "present_identity" && (
                  <View>
                    <Pressable style={styles.pickerRow} onPress={() => pickMantraSource("present_identity", { kind: "present_identity", insightId: null })}>
                      <Text style={styles.pickerRowText}>התובנה האחרונה שתירשם (מתעדכן אוטומטית)</Text>
                    </Pressable>
                    {identityInsights.map((insight) => (
                      <Pressable key={insight.id} style={styles.pickerRow} onPress={() => pickMantraSource("present_identity", { kind: "present_identity", insightId: insight.id })}>
                        <Text style={styles.pickerRowText}>{insight.text}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {mantraWizard.subtype === "arc_goal" &&
                  goals.map((goal) => (
                    <Pressable key={goal.id} style={styles.pickerRow} onPress={() => pickMantraSource("arc_goal", { kind: "arc_goal", goalId: goal.id })}>
                      <Text style={styles.pickerRowText}>{goal.title}</Text>
                    </Pressable>
                  ))}
                <Pressable style={styles.cancelButton} onPress={() => setMantraWizard(null)}>
                  <Text style={styles.cancelButtonText}>ביטול</Text>
                </Pressable>
              </View>
            ) : (
              pendingMantraSchedule && (
                <View>
                  <Text style={styles.sectionLabel}>תזמון</Text>
                  <ReminderScheduleEditor schedule={pendingMantraSchedule} onChange={setPendingMantraSchedule} />
                  <Pressable style={styles.addButton} onPress={saveMantraWizard}>
                    <Text style={styles.addButtonText}>שמור תזכורת</Text>
                  </Pressable>
                  <Pressable style={styles.cancelButton} onPress={() => setMantraWizard(null)}>
                    <Text style={styles.cancelButtonText}>ביטול</Text>
                  </Pressable>
                </View>
              )
            )}
          </View>
        )}

        {tab === "recall" && (
          <View>
            {recallWizard === null ? (
              <View>
                <Pressable style={styles.addButton} onPress={startRecallWizard}>
                  <Text style={styles.addButtonText}>+ תזכורת זכירה חדשה</Text>
                </Pressable>
                {recalls.length === 0 && <Text style={styles.hint}>אין עדיין תזכורות זכירה.</Text>}
                {recalls.map(({ reminder, preview }) => (
                  <View key={reminder.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{RECALL_SOURCE_LABELS[reminder.sourceRef.kind]}</Text>
                    <Text style={styles.cardPreview}>{preview ?? "(אין תוכן עדיין להצגה)"}</Text>
                    <Text style={styles.cardSchedule}>{scheduleSummary(reminder.schedule)}</Text>
                    <View style={styles.cardActions}>
                      <Pressable style={styles.cardActionButton} onPress={() => router.push({ pathname: "/arc-recall/chat/[reminderId]", params: { reminderId: reminder.id } })}>
                        <Text style={styles.cardActionText}>צפה בשיח</Text>
                      </Pressable>
                      <Pressable style={styles.cardActionButton} onPress={() => togglePauseRecall(reminder)}>
                        <Text style={styles.cardActionText}>{reminder.schedule.paused ? "המשך" : "השהה"}</Text>
                      </Pressable>
                      <Pressable style={styles.cardActionButton} onPress={() => confirmDeleteRecall(reminder.id)}>
                        <Text style={[styles.cardActionText, styles.destructiveText]}>מחק</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : recallWizard.kind === "sourceKind" ? (
              <View>
                <Text style={styles.sectionLabel}>על בסיס מה השאלה?</Text>
                {(Object.keys(RECALL_SOURCE_LABELS) as ArcRecallSourceKind[]).map((kind) => (
                  <Pressable key={kind} style={styles.pickerRow} onPress={() => pickRecallSourceKind(kind)}>
                    <Text style={styles.pickerRowText}>{RECALL_SOURCE_LABELS[kind]}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.cancelButton} onPress={() => setRecallWizard(null)}>
                  <Text style={styles.cancelButtonText}>ביטול</Text>
                </Pressable>
              </View>
            ) : recallWizard.kind === "source" ? (
              <View>
                <Text style={styles.sectionLabel}>בחר פריט</Text>
                {recallWizard.sourceKind === "insight" &&
                  allInsights.map((insight) => (
                    <Pressable key={insight.id} style={styles.pickerRow} onPress={() => pickRecallSource("insight", insight.id)}>
                      <Text style={styles.pickerRowText}>{insight.text}</Text>
                    </Pressable>
                  ))}
                {recallWizard.sourceKind === "insight_relationship" &&
                  relationships.map((relationship) => (
                    <Pressable key={relationship.id} style={styles.pickerRow} onPress={() => pickRecallSource("insight_relationship", relationship.id)}>
                      <Text style={styles.pickerRowText}>{relationship.explanation ?? relationship.relationshipType}</Text>
                    </Pressable>
                  ))}
                {recallWizard.sourceKind === "learning_material" &&
                  learningInsights.map((learning) => (
                    <Pressable key={learning.id} style={styles.pickerRow} onPress={() => pickRecallSource("learning_material", learning.id)}>
                      <Text style={styles.pickerRowText}>{learning.mainSentence ?? learning.rawText}</Text>
                    </Pressable>
                  ))}
                {recallWizard.sourceKind === "arc_memory" &&
                  memories.map((memory) => (
                    <Pressable key={memory.id} style={styles.pickerRow} onPress={() => pickRecallSource("arc_memory", memory.id)}>
                      <Text style={styles.pickerRowText}>{memory.situationText}</Text>
                    </Pressable>
                  ))}
                <Pressable style={styles.cancelButton} onPress={() => setRecallWizard(null)}>
                  <Text style={styles.cancelButtonText}>ביטול</Text>
                </Pressable>
              </View>
            ) : (
              pendingRecallSchedule && (
                <View>
                  <Text style={styles.sectionLabel}>תזמון</Text>
                  <ReminderScheduleEditor schedule={pendingRecallSchedule} onChange={setPendingRecallSchedule} />
                  <Pressable style={styles.addButton} onPress={saveRecallWizard}>
                    <Text style={styles.addButtonText}>שמור תזכורת</Text>
                  </Pressable>
                  <Pressable style={styles.cancelButton} onPress={() => setRecallWizard(null)}>
                    <Text style={styles.cancelButtonText}>ביטול</Text>
                  </Pressable>
                </View>
              )
            )}
          </View>
        )}

        {tab === "task" && (
          <View>
            <Text style={styles.sectionLabel}>מה ההתראה הנוכחית הייתה אומרת כרגע</Text>
            <View style={styles.card}>
              <Text style={styles.cardPreview}>{transitionPreview}</Text>
            </View>
            <Text style={styles.hint}>
              ARC Task Reminders אינן מתוזמנות בזמנים קבועים -- הן מתעדכנות אוטומטית עם כל מעבר בין משימות. כל ההגדרות שלהן (כולל הפעלה/כיבוי) נמצאות במסך
              ההגדרות.
            </Text>
            <Pressable style={styles.addButton} onPress={() => router.push("/arc-reminders/settings")}>
              <Text style={styles.addButtonText}>הגדרות ARC Reminders</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  tabRow: { flexDirection: "row-reverse", padding: 12, gap: 8 },
  tabButton: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  tabButtonActive: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  tabButtonText: { fontSize: 12, color: "#333", textAlign: "center" },
  tabButtonTextActive: { color: "#fff", fontWeight: "600" },
  content: { flexGrow: 1, padding: 16 },
  sectionLabel: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 10 },
  hint: { fontSize: 13, textAlign: "right", color: "#777", marginVertical: 10, lineHeight: 18 },
  addButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 14 },
  addButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  cancelButton: { padding: 12, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
  pickerRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, marginBottom: 8, backgroundColor: "#fafafa" },
  pickerRowText: { fontSize: 15, textAlign: "right", color: "#222" },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 14, marginBottom: 12, backgroundColor: "#fafafa" },
  cardTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 4 },
  cardPreview: { fontSize: 15, textAlign: "right", color: "#222", marginBottom: 6, lineHeight: 20 },
  cardSchedule: { fontSize: 12, textAlign: "right", color: "#888", marginBottom: 8 },
  cardActions: { flexDirection: "row-reverse", gap: 10 },
  cardActionButton: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#ccc", borderRadius: 14 },
  cardActionText: { fontSize: 13, color: "#333" },
  destructiveText: { color: "#c0392b" },
});

import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  clearArcGymBodySensationMemory,
  describeArcGymReminderSchedule,
  linkArcPerspectiveToArcGymSituation,
  linkGoalToArcGymSituation,
  listArcGymRemindersForExercise,
  listArcGymTrainingRecordsForSituation,
  unlinkArcPerspectiveFromArcGymSituation,
  unlinkGoalFromArcGymSituation,
} from "../arc/arcGym.ts";
import type { ArcGymCheckInChoice, ArcGymMemory, ArcGymReminder, ArcGymSituation, ArcGymTrainingRecord } from "../arc/arcGym.ts";
import type { ArcPerspectiveSession } from "../arc/arcPerspective.ts";
import { BODY_SCAN_REGION_LABELS } from "../arc/bodyScanRegions.ts";
import { BODY_REGION_LABELS } from "../arc/bodyRegionRoles.ts";
import { findPairedArcResultForSituation, pairArcResultWithBehaviour, unpairArcResultFromBehaviour } from "../arc/arcResult.ts";
import type { ArcResultExercise } from "../arc/arcResult.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import {
  loadArcGymGoals,
  loadArcGymMemories,
  loadArcGymReminders,
  loadArcGymSituations,
  loadArcGymTrainingRecords,
  loadArcPerspectiveSessions,
  loadArcResultExercises,
  loadTasks,
  upsertArcGymMemoryEntry,
  upsertArcGymSituationEntry,
  upsertArcResultExerciseEntry,
  upsertTask,
} from "../data/storage.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";

const CHECK_IN_CHOICE_LABELS: Record<ArcGymCheckInChoice, string> = {
  full_arc: "ARC מלא",
  shortened_arc: "ARC מקוצר",
  visualization_only: "דימיון בלבד",
};

function formatRegionLabel(region: string, side: "left" | "right" | null): string {
  const base = (BODY_SCAN_REGION_LABELS as Record<string, string>)[region] ?? region;
  if (side === "left") return `${base} (שמאל)`;
  if (side === "right") return `${base} (ימין)`;
  return base;
}

/**
 * build/ArcGymSituationScreen.tsx (route /arc-gym/situation/[id])
 *
 * ARC GYM task, requirements 8+9: shows this situation's own saved
 * desired action/trigger, remembered thoughts/body sensations from
 * previous training (explicitly labeled as HISTORICAL, never implied
 * to be the trainee's current state), and the training history --
 * before starting a new training session.
 */
export default function ArcGymSituationScreen({ id }: { id: string }) {
  const [situation, setSituation] = useState<ArcGymSituation | null>(null);
  const [memory, setMemory] = useState<ArcGymMemory | null>(null);
  const [records, setRecords] = useState<ArcGymTrainingRecord[]>([]);
  const [reminders, setReminders] = useState<ArcGymReminder[]>([]);
  const [resultExercises, setResultExercises] = useState<ArcResultExercise[]>([]);
  const [scheduledTask, setScheduledTask] = useState<Task | null>(null);
  const [showResultPicker, setShowResultPicker] = useState(false);
  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [showGoalLinking, setShowGoalLinking] = useState(false);
  const [perspectiveSessions, setPerspectiveSessions] = useState<ArcPerspectiveSession[]>([]);
  const [showPerspectivePicker, setShowPerspectivePicker] = useState(false);

  const reload = useCallback(() => {
    Promise.all([
      loadArcGymSituations(),
      loadArcGymMemories(),
      loadArcGymTrainingRecords(),
      loadArcGymReminders(),
      loadArcResultExercises(),
      loadTasks(),
      loadArcGymGoals(),
      loadArcPerspectiveSessions(),
    ]).then(([situations, memories, trainingRecords, allReminders, allResults, allTasks, allGoals, allPerspectiveSessions]) => {
      const found = situations.find((candidate) => candidate.id === id) ?? null;
      setSituation(found);
      setMemory(memories.find((candidate) => candidate.situationId === id) ?? null);
      setRecords(listArcGymTrainingRecordsForSituation(trainingRecords, id));
      setReminders(listArcGymRemindersForExercise(allReminders, "behaviour", id));
      setResultExercises(allResults);
      setScheduledTask(allTasks.find((task) => task.linkedArcGymSituationId === id) ?? null);
      setGoals(allGoals);
      setPerspectiveSessions(allPerspectiveSessions.filter((session) => session.completedAt !== null));
    });
  }, [id]);

  useFocusEffect(reload);

  async function toggleGoalLink(goalId: string) {
    if (!situation) return;
    const now = new Date().toISOString();
    const linked = situation.linkedGoalIds.includes(goalId);
    const updated = linked ? unlinkGoalFromArcGymSituation(situation, goalId, now) : linkGoalToArcGymSituation(situation, goalId, now);
    await upsertArcGymSituationEntry(updated);
    setSituation(updated);
  }

  /**
   * ARC Perspective task, section 7: links FROM the Behaviour side --
   * picking an already-completed ArcPerspectiveSession and snapshotting
   * its own newInterpretation text, same shape as linking a goal above.
   * Never overwrites a DIFFERENT, already-linked session without the
   * trainee explicitly choosing "הסר קישור" first (this app's own
   * confirmation-at-the-UI-layer convention -- the pure setter itself
   * is unconditional).
   */
  async function linkPerspectiveSession(session: ArcPerspectiveSession) {
    if (!situation) return;
    const updated = linkArcPerspectiveToArcGymSituation(situation, session.id, session.newInterpretation, new Date().toISOString());
    await upsertArcGymSituationEntry(updated);
    setShowPerspectivePicker(false);
    reload();
  }

  async function unlinkPerspectiveSession() {
    if (!situation) return;
    await upsertArcGymSituationEntry(unlinkArcPerspectiveFromArcGymSituation(situation, new Date().toISOString()));
    reload();
  }

  async function resetBodyMemory() {
    if (!memory) return;
    await upsertArcGymMemoryEntry(clearArcGymBodySensationMemory(memory, new Date().toISOString()));
    reload();
  }

  /**
   * ARC Gym + ARC Goal Integration task: pairs this Result to run
   * immediately after this Behaviour, as one combined practice --
   * "ARC Success must never be independently schedulable" once paired,
   * enforced structurally by arc/arcResult.ts's own
   * resolveArcResultsForTask excluding any paired Result.
   */
  async function pairResult(resultId: string) {
    const now = new Date().toISOString();
    const updated = pairArcResultWithBehaviour(resultExercises, resultId, id, now);
    // pairArcResultWithBehaviour atomically clears any OTHER Result
    // previously paired to this situation -- persist every record that
    // actually changed, never just the one requested, so storage never
    // ends up disagreeing with the in-memory "at most one pair" rule.
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].parentBehaviourSituationId !== resultExercises[i].parentBehaviourSituationId) await upsertArcResultExerciseEntry(updated[i]);
    }
    setShowResultPicker(false);
    reload();
  }

  async function unpairResult(resultId: string) {
    const now = new Date().toISOString();
    const updated = unpairArcResultFromBehaviour(resultExercises, resultId, now).find((candidate) => candidate.id === resultId);
    if (!updated) return;
    await upsertArcResultExerciseEntry(updated);
    reload();
  }

  /**
   * "תזמן אימון": creates (or, if one already exists, just opens) the
   * one combined Task for this Behaviour+Success practice --
   * calendarEntryKind "arc_gym" + linkedArcGymSituationId, never a
   * second Task if one is already scheduled, and never a separate
   * schedule entry for the paired Success (it is always derived fresh
   * via findPairedArcResultForSituation, never given its own entry).
   * Opens the EXISTING task editor (/tasks/[id]/edit) for date/time/
   * duration -- never a second, parallel scheduling form.
   */
  async function scheduleTraining() {
    if (!situation) return;
    if (scheduledTask) {
      router.push({ pathname: "/tasks/[id]/edit", params: { id: scheduledTask.id } });
      return;
    }
    const now = new Date().toISOString();
    const task = {
      ...createEmptyTask(generateTaskId(), situation.situationDescription || situation.desiredAction, situation.desiredAction, now),
      calendarEntryKind: "arc_gym" as const,
      linkedArcGymSituationId: situation.id,
    };
    await upsertTask(task);
    await reconcileTaskAlarms();
    router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } });
  }

  if (!situation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasBodyMemory =
    !!memory && (memory.lastContractionRegions.length > 0 || memory.lastHeavinessRegions.length > 0 || memory.lastPrimaryOpeningRegion !== null || !!memory.lastSupportiveSensation);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.behaviorText}>{situation.behaviorText}</Text>
        <Text style={styles.situationText}>{situation.situationDescription}</Text>
        {!!situation.trigger && <Text style={styles.hint}>טריגר: {situation.trigger}</Text>}
        <View style={styles.actionCard}>
          <Text style={styles.actionLabel}>הפעולה הרצויה</Text>
          <Text style={styles.actionText}>{situation.desiredAction}</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: "/arc-gym/situation/[id]/edit", params: { id: situation.id } })}>
          <Text style={styles.linkText}>ערוך סיטואציה / פעולה רצויה</Text>
        </Pressable>

        {(memory?.lastThought || hasBodyMemory) && (
          <View style={styles.memoryCard}>
            <Text style={styles.memoryTitle}>מידע שמור מאימונים קודמים</Text>
            <Text style={styles.memoryHint}>זו תחושה קודמת, לא בהכרח המצב הנוכחי שלך עכשיו.</Text>
            {!!memory?.lastThought && <Text style={styles.memoryLine}>מחשבה קודמת: {memory.lastThought}</Text>}
            {!!memory?.lastContractionRegions.length && (
              <Text style={styles.memoryLine}>כיווץ קודם: {memory.lastContractionRegions.map((entry) => formatRegionLabel(entry.region, entry.side)).join(", ")}</Text>
            )}
            {!!memory?.lastHeavinessRegions.length && (
              <Text style={styles.memoryLine}>כבדות/סגירות קודמת: {memory.lastHeavinessRegions.map((entry) => formatRegionLabel(entry.region, entry.side)).join(", ")}</Text>
            )}
            {!!memory?.lastPrimaryOpeningRegion && (
              <Text style={styles.memoryLine}>אזור לפתיחה: {formatRegionLabel(memory.lastPrimaryOpeningRegion, memory.lastPrimaryOpeningSide)}</Text>
            )}
            {!!memory?.lastSupportiveBodyArea && (
              <Text style={styles.memoryLine}>אזור תומך: {(BODY_REGION_LABELS as Record<string, string>)[memory.lastSupportiveBodyArea] ?? memory.lastSupportiveBodyArea}</Text>
            )}
            {!!memory?.lastSupportiveSensation && <Text style={styles.memoryLine}>תחושה תומכת קודמת: {memory.lastSupportiveSensation}</Text>}
            {hasBodyMemory && (
              <Pressable onPress={resetBodyMemory}>
                <Text style={styles.linkText}>איפוס היסטוריית הגוף -- סריקת גוף חדשה בפעם הבאה</Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: "/arc-gym/train/[id]", params: { id: situation.id } })}>
          <Text style={styles.primaryButtonText}>להתחיל אימון</Text>
        </Pressable>

        {/*
         * ARC Gym + ARC Goal Integration task: "when ARC Success is
         * configured as part of ARC Behaviour, it should run
         * immediately after ARC Behaviour" -- pairing is derived fresh
         * every load via findPairedArcResultForSituation, never a
         * second schedule entry, so "ARC Success must never be
         * independently schedulable" holds structurally (see
         * arc/arcResult.ts's own resolveArcResultsForTask, which
         * excludes any paired Result from the ordinary suggestion
         * flow).
         */}
        <View style={styles.pairedResultBlock}>
          <Text style={styles.sectionTitle}>תרגיל הצלחה מקושר</Text>
          {(() => {
            const paired = findPairedArcResultForSituation(resultExercises, id);
            if (paired) {
              return (
                <View>
                  <Text style={styles.pairedResultText}>{paired.focusPoint || paired.successMantra}</Text>
                  <Pressable onPress={() => unpairResult(paired.id)}>
                    <Text style={styles.linkText}>בטל שיוך</Text>
                  </Pressable>
                </View>
              );
            }
            return (
              <View>
                <Text style={styles.hint}>אין עדיין תרגיל הצלחה מקושר -- הוא יופעל מיד אחרי האימון.</Text>
                <Pressable onPress={() => setShowResultPicker((prev) => !prev)}>
                  <Text style={styles.linkText}>{showResultPicker ? "סגור" : "שייך תרגיל הצלחה קיים"}</Text>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: "/arc-gym/result/[id]/edit", params: { id: "new" } })}>
                  <Text style={styles.linkText}>+ תרגיל הצלחה חדש</Text>
                </Pressable>
                {showResultPicker && (
                  <FlatList
                    data={resultExercises.filter((candidate) => candidate.parentBehaviourSituationId === null)}
                    keyExtractor={(item) => item.id}
                    style={styles.taskPickerList}
                    ListEmptyComponent={<Text style={styles.hint}>אין תרגילי הצלחה פנויים לשיוך -- צור תרגיל חדש.</Text>}
                    renderItem={({ item }) => (
                      <Pressable style={styles.taskPickerRow} onPress={() => pairResult(item.id)}>
                        <Text style={styles.taskPickerText}>{item.focusPoint || item.successMantra}</Text>
                      </Pressable>
                    )}
                  />
                )}
              </View>
            );
          })()}
        </View>

        {/*
         * ARC Gym + ARC Goal Integration task: "ARC Behaviour and its
         * associated ARC Success must be scheduled as a single
         * combined practice" -- one Task, calendarEntryKind "arc_gym",
         * never a second entry for the paired Success. Starting that
         * Task (live/ActiveTaskScreen.tsx's own performStart) opens
         * Full/Shortened ARC with the REAL taskId (not the standalone
         * sentinel), so returnToTask's own arcGymSituationId branch
         * finds the paired Success and practices it next, before
         * returning to this exact Task.
         */}
        <Pressable style={styles.secondaryButton} onPress={scheduleTraining}>
          <Text style={styles.secondaryButtonText}>{scheduledTask ? "ערוך תזמון אימון" : "תזמן אימון"}</Text>
        </Pressable>

        <View style={styles.remindersBlock}>
          <View style={styles.remindersHeaderRow}>
            <Text style={styles.sectionTitle}>שיוך למטרות</Text>
            <Pressable onPress={() => setShowGoalLinking((prev) => !prev)}>
              <Text style={styles.linkText}>{showGoalLinking ? "סגור" : "ניהול שיוך"}</Text>
            </Pressable>
          </View>
          {goals.filter((goal) => situation.linkedGoalIds.includes(goal.id)).length === 0 && <Text style={styles.hint}>התרגיל הזה עדיין לא משויך לאף מטרה.</Text>}
          {goals
            .filter((goal) => situation.linkedGoalIds.includes(goal.id))
            .map((goal) => (
              <Text key={goal.id} style={styles.reminderText}>
                • {goal.title}
              </Text>
            ))}
          {showGoalLinking && (
            <FlatList
              data={goals}
              keyExtractor={(item) => item.id}
              style={styles.taskPickerList}
              renderItem={({ item }) => {
                const linked = situation.linkedGoalIds.includes(item.id);
                return (
                  <Pressable style={styles.reminderRow} onPress={() => toggleGoalLink(item.id)}>
                    <Text style={[styles.reminderText, linked && styles.goalPickerTextLinked]}>{item.title}</Text>
                    <Text style={styles.hint}>{linked ? "☑" : "☐"}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/*
         * ARC Perspective task, section 7.5: bidirectional link with
         * ARC Perspective -- shows the linked session's own new
         * interpretation (a snapshot, never a live reference) with a
         * way to open the original session or remove the link, or
         * (when unlinked) a picker over every completed
         * ArcPerspectiveSession, same checkbox/tap-to-link pattern as
         * "שיוך למטרות" above.
         */}
        <View style={styles.remindersBlock}>
          <Text style={styles.sectionTitle}>ARC Perspective מקושר</Text>
          {situation.linkedArcPerspectiveSessionId ? (
            <View>
              {!!situation.arcPerspectiveNewInterpretation && <Text style={styles.reminderText}>{situation.arcPerspectiveNewInterpretation}</Text>}
              <Pressable onPress={() => router.push({ pathname: "/arc-perspective/[id]", params: { id: situation.linkedArcPerspectiveSessionId! } })}>
                <Text style={styles.linkText}>פתח ARC Perspective</Text>
              </Pressable>
              <Pressable onPress={unlinkPerspectiveSession}>
                <Text style={styles.linkText}>הסר קישור</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={styles.hint}>אין עדיין ARC Perspective מקושר.</Text>
              <Pressable onPress={() => setShowPerspectivePicker((prev) => !prev)}>
                <Text style={styles.linkText}>{showPerspectivePicker ? "סגור" : "קשר ל-ARC Perspective"}</Text>
              </Pressable>
              {showPerspectivePicker && (
                <FlatList
                  data={perspectiveSessions}
                  keyExtractor={(item) => item.id}
                  style={styles.taskPickerList}
                  ListEmptyComponent={<Text style={styles.hint}>אין עדיין תרגולי ARC Perspective שהושלמו.</Text>}
                  renderItem={({ item }) => (
                    <Pressable style={styles.taskPickerRow} onPress={() => linkPerspectiveSession(item)}>
                      <Text style={styles.taskPickerText}>{item.newInterpretation}</Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        </View>

        {/*
         * ARCHI -- Unified Development Specification task, Part 2: ARC
         * GYM reminders for the Behaviour exercise type -- never a
         * countdown timer, never a Task LIVE session; tapping one only
         * ever opens build/ArcGymReminderEditorScreen.tsx (edit/delete),
         * never this screen again implicitly.
         */}
        <View style={styles.remindersBlock}>
          <View style={styles.remindersHeaderRow}>
            <Text style={styles.sectionTitle}>תזכורות אימון</Text>
            <Pressable
              onPress={() => router.push({ pathname: "/arc-gym/reminder/[id]/edit", params: { id: "new", exerciseKind: "behaviour", exerciseId: situation.id } })}
            >
              <Text style={styles.linkText}>+ תזכורת</Text>
            </Pressable>
          </View>
          {reminders.length === 0 && <Text style={styles.hint}>אין תזכורות מוגדרות.</Text>}
          {reminders.map((reminder) => (
            <Pressable key={reminder.id} style={styles.reminderRow} onPress={() => router.push({ pathname: "/arc-gym/reminder/[id]/edit", params: { id: reminder.id } })}>
              <Text style={styles.reminderText}>{describeArcGymReminderSchedule(reminder)}</Text>
              {!reminder.enabled && <Text style={styles.hint}>כבוי</Text>}
            </Pressable>
          ))}
        </View>

        {records.length > 0 && (
          <View style={styles.historyBlock}>
            <Text style={styles.sectionTitle}>היסטוריית אימונים</Text>
            {records.map((record) => (
              <View key={record.id} style={styles.historyRow}>
                <Text style={styles.historyText}>
                  {CHECK_IN_CHOICE_LABELS[record.checkInChoice]} · {record.completedAt ? "הושלם" : "לא הושלם"}
                </Text>
                {!!record.reflection && <Text style={styles.hint}>{record.reflection}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 13, textAlign: "right", color: "#777" },
  behaviorText: { fontSize: 14, color: "#666", textAlign: "right" },
  situationText: { fontSize: 18, fontWeight: "700", textAlign: "right", marginTop: 4, marginBottom: 6 },
  actionCard: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 14, marginTop: 12 },
  actionLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", marginBottom: 4, fontWeight: "700" },
  actionText: { fontSize: 15, textAlign: "right", color: "#333" },
  linkText: { color: "#0a7ea4", fontSize: 13, textAlign: "right", marginTop: 8 },
  memoryCard: { borderWidth: 1, borderColor: "#eadfb4", backgroundColor: "#FFFBEF", borderRadius: 10, padding: 14, marginTop: 16, gap: 4 },
  memoryTitle: { fontSize: 14, fontWeight: "700", textAlign: "right" },
  memoryHint: { fontSize: 12, color: "#8a7a3a", textAlign: "right", marginBottom: 6 },
  memoryLine: { fontSize: 13, textAlign: "right", color: "#555" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  historyBlock: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  historyRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8 },
  historyText: { fontSize: 14, textAlign: "right", color: "#333" },
  remindersBlock: { marginTop: 24 },
  remindersHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  reminderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8 },
  reminderText: { fontSize: 14, textAlign: "right", color: "#333" },
  pairedResultBlock: { marginTop: 20 },
  pairedResultText: { fontSize: 15, textAlign: "right", color: "#333" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 15 },
  taskPickerList: { maxHeight: 220, marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  taskPickerRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  taskPickerText: { fontSize: 14, textAlign: "right", color: "#333" },
  goalPickerTextLinked: { color: "#0a7ea4", fontWeight: "700" },
});

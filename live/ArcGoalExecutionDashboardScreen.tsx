import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";

import { deleteArcGoalTarget, getArcGoal, loadArcGoalTargetOccurrenceCompletions, loadArcGoalTargets, upsertArcGoal } from "../data/storage.ts";
import { cancelArcGoalTargetNotification } from "../data/arcGoalTargetReminders.ts";
import {
  allRequiredTargetsComplete,
  completeActiveSubGoalAndAdvance,
  resolveActiveSubGoal,
  resolveTargetStatusToday,
} from "../arc/subGoalExecution.ts";
import type { ArcGoalTargetOccurrenceCompletion, TargetOccurrenceStatus } from "../arc/subGoalExecution.ts";
import type { ArcGoal, ArcGoalSubGoal, ArcGoalTarget } from "../arc/types.ts";

const TARGET_STATUS_LABELS: Record<TargetOccurrenceStatus, string> = {
  completed: "הושלם",
  dueOrOverdue: "לביצוע היום",
  upcoming: "בהמשך",
  noOccurrenceToday: "לא רלוונטי היום",
};

/**
 * live/ArcGoalExecutionDashboardScreen.tsx (route: /goals/execution/[goalId])
 *
 * Sub-goal execution task, spec section 5: the LIVE dashboard for an
 * ArcGoal whose four-week program has finished and moved into its own
 * execution phase (arc/subGoalExecution.ts's resolvePhase). Reached
 * exclusively via live/ArcGoalFourWeekDashboardScreen.tsx's own Week 4
 * confirmation (activateExecutionPhase) -- never merely because a
 * planned date arrived. Shows the active sub-goal's own targets (due
 * today / upcoming / completed), the sub-goal-completion prompt once
 * every required target is done, and the final ArcGoal completion
 * summary once every sub-goal is finished. Never re-implements target
 * execution itself -- "פתח יעד" routes to live/ArcGoalTargetScreen.tsx
 * for that.
 */
export default function ArcGoalExecutionDashboardScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [targets, setTargets] = useState<ArcGoalTarget[]>([]);
  const [completions, setCompletions] = useState<ArcGoalTargetOccurrenceCompletion[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [completionOpen, setCompletionOpen] = useState(false);
  const [reflectionWhatHelped, setReflectionWhatHelped] = useState("");
  const [reflectionWhatWasHard, setReflectionWhatWasHard] = useState("");
  const [reflectionWhatLearned, setReflectionWhatLearned] = useState("");

  const reload = useCallback(async () => {
    if (!goalId) {
      setStatus("notFound");
      return;
    }
    try {
      const [loadedGoal, allTargets, allCompletions] = await Promise.all([
        getArcGoal(goalId),
        loadArcGoalTargets(),
        loadArcGoalTargetOccurrenceCompletions(),
      ]);
      if (!loadedGoal) {
        setStatus("notFound");
        return;
      }
      setGoal(loadedGoal);
      setTargets(allTargets.filter((t) => t.arcGoalId === goalId));
      setCompletions(allCompletions);
      setStatus("ready");
    } catch (error) {
      console.warn("[ArcGoalExecutionDashboardScreen] Failed to load -- showing the recovery state instead of hanging.", error);
      setStatus("notFound");
    }
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function persist(updatedGoal: ArcGoal) {
    setGoal(updatedGoal);
    upsertArcGoal(updatedGoal).catch(() => setSaveError("אירעה שגיאה בשמירה. נסה שוב."));
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא ניתן לטעון את המטרה.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/reach-your-goal")}>
            <Text style={styles.buttonText}>חזרה להשגת מטרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const activeSubGoal = resolveActiveSubGoal(goal);
  const subGoals = [...(goal.subGoals ?? [])].sort((a, b) => a.order - b.order);
  const completedSubGoalCount = subGoals.filter((s) => s.status === "completed").length;
  const overallProgress = subGoals.length > 0 ? Math.round((completedSubGoalCount / subGoals.length) * 100) : 0;

  const activeTargets = activeSubGoal ? targets.filter((t) => t.subGoalId === activeSubGoal.id) : [];
  const dueToday = activeTargets.filter((t) => resolveTargetStatusToday(t, completions, new Date()) === "dueOrOverdue");
  const upcoming = activeTargets.filter((t) => {
    const s = resolveTargetStatusToday(t, completions, new Date());
    return s === "upcoming" || s === "noOccurrenceToday";
  });
  const completedTargets = activeTargets.filter((t) => resolveTargetStatusToday(t, completions, new Date()) === "completed");

  const nextReminder = targets
    .filter((t) => t.notificationScheduledFor && new Date(t.notificationScheduledFor).getTime() > Date.now())
    .sort((a, b) => new Date(a.notificationScheduledFor!).getTime() - new Date(b.notificationScheduledFor!).getTime())[0];

  const canOfferCompletion = activeSubGoal ? allRequiredTargetsComplete(activeSubGoal.id, activeTargets) : false;

  async function deleteTarget(target: ArcGoalTarget) {
    await cancelArcGoalTargetNotification(target);
    await deleteArcGoalTarget(target.id);
    reload();
  }

  function openReflection() {
    setReflectionWhatHelped("");
    setReflectionWhatWasHard("");
    setReflectionWhatLearned("");
    setCompletionOpen(true);
  }

  function confirmCompleteSubGoalAndAdvance() {
    if (!goal) return;
    const now = new Date().toISOString();
    const reflection =
      reflectionWhatHelped.trim() || reflectionWhatWasHard.trim() || reflectionWhatLearned.trim()
        ? {
            whatHelped: reflectionWhatHelped.trim() || null,
            whatWasHard: reflectionWhatWasHard.trim() || null,
            whatLearned: reflectionWhatLearned.trim() || null,
          }
        : null;
    const updated = completeActiveSubGoalAndAdvance(goal, reflection, now);
    persist(updated);
    setCompletionOpen(false);
  }

  if (goal.phase === "completed") {
    return <ArcGoalCompletionSummary goal={goal} subGoals={subGoals} targets={targets} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "ביצוע המטרה" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{goal.name}</Text>
        <Text style={styles.title}>{`תת־המטרה הפעילה: ${activeSubGoal?.name ?? "אין תת־מטרה פעילה"}`}</Text>
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <View style={styles.card}>
          <Text style={styles.body}>{`התקדמות כוללת: ${overallProgress}%`}</Text>
          <Text style={styles.body}>{`מועד סיום מתוכנן לתת־המטרה: ${activeSubGoal?.plannedCompletionDate ?? "--"}`}</Text>
          <Text style={styles.body}>{`תזכורת קרובה: ${nextReminder ? `${nextReminder.name} -- ${nextReminder.notificationScheduledFor}` : "לא נקבעה"}`}</Text>
        </View>

        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/calendar")}>
          <Text style={styles.secondaryButtonText}>לוח שנה</Text>
        </Pressable>

        {!activeSubGoal && (
          <Text style={styles.hint}>יש להוסיף תת־מטרות ויעדים במסך עריכת המטרה (BUILD) כדי להתחיל בביצוע.</Text>
        )}

        {canOfferCompletion && (
          <View style={styles.decisionBanner}>
            <Text style={styles.decisionText}>השלמת את תת־המטרה</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={openReflection}>
              <Text style={styles.buttonText}>לסיים את תת־המטרה</Text>
            </Pressable>
          </View>
        )}

        <TargetListSection title="יעדים להיום" targets={dueToday} completions={completions} onDelete={deleteTarget} />
        <TargetListSection title="יעדים קרובים" targets={upcoming} completions={completions} onDelete={deleteTarget} />
        <TargetListSection title="יעדים שהושלמו" targets={completedTargets} completions={completions} onDelete={deleteTarget} />

        <Pressable style={styles.backButton} onPress={() => router.push({ pathname: "/goals/[id]", params: { id: goal.id } })}>
          <Text style={styles.backButtonText}>לעריכת המטרה (BUILD)</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={completionOpen} transparent animationType="fade" onRequestClose={() => setCompletionOpen(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.modalTitle}>מה עזר לי?</Text>
            <TextInput style={styles.textInput} value={reflectionWhatHelped} onChangeText={setReflectionWhatHelped} textAlign="right" multiline />
            <Text style={styles.modalTitle}>מה היה לי קשה?</Text>
            <TextInput style={styles.textInput} value={reflectionWhatWasHard} onChangeText={setReflectionWhatWasHard} textAlign="right" multiline />
            <Text style={styles.modalTitle}>מה למדתי להמשך?</Text>
            <TextInput style={styles.textInput} value={reflectionWhatLearned} onChangeText={setReflectionWhatLearned} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={confirmCompleteSubGoalAndAdvance}>
              <Text style={styles.buttonText}>להשלים ולעבור לתת־המטרה הבאה</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => setCompletionOpen(false)}>
              <Text style={styles.actionButtonText}>להישאר בתת־המטרה הנוכחית</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TargetListSection(props: {
  title: string;
  targets: ArcGoalTarget[];
  completions: ArcGoalTargetOccurrenceCompletion[];
  onDelete: (target: ArcGoalTarget) => void;
}) {
  const { title, targets, completions } = props;
  if (targets.length === 0) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {targets.map((target) => {
        const targetStatus = resolveTargetStatusToday(target, completions, new Date());
        return (
          <View key={target.id} style={styles.targetCard}>
            <Text style={styles.targetName}>{target.name}</Text>
            <Text style={styles.body}>{`${target.plannedDate ?? ""} ${target.plannedTime ?? ""}`.trim() || "--"}</Text>
            {target.location && <Text style={styles.body}>{`מיקום: ${target.location}`}</Text>}
            <Text style={styles.body}>{`סטטוס: ${TARGET_STATUS_LABELS[targetStatus]}`}</Text>
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => router.push({ pathname: "/goals/target/[targetId]", params: { targetId: target.id, arcGoalId: target.arcGoalId } })}
            >
              <Text style={styles.buttonText}>פתח יעד</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** Sub-goal execution task, spec section 13: shown once the ArcGoal's own phase reaches "completed" -- summary only, never deletes anything. */
function ArcGoalCompletionSummary(props: { goal: ArcGoal; subGoals: ArcGoalSubGoal[]; targets: ArcGoalTarget[] }) {
  const { goal, subGoals, targets } = props;
  const completedTargets = targets.filter((t) => t.status === "completed");
  const supportUsedCount = targets.filter((t) => t.linkedSupportProtocolIds.length > 0).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "המטרה הושלמה" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{`המטרה "${goal.name}" הושלמה!`}</Text>
        <View style={styles.card}>
          <Text style={styles.body}>{`תוכנית ארבעת השבועות הושלמה בתאריך: ${goal.fourWeekProgram?.completedAt ?? "--"}`}</Text>
          <Text style={styles.body}>{`תת־מטרות שהושלמו: ${subGoals.filter((s) => s.status === "completed").length} מתוך ${subGoals.length}`}</Text>
          <Text style={styles.body}>{`יעדים שהושלמו: ${completedTargets.length}`}</Text>
          <Text style={styles.body}>{`מספר פעמים שנעשה שימוש בתמיכת ARCHI: ${supportUsedCount}`}</Text>
          <Text style={styles.body}>{`תאריך השלמה בפועל: ${goal.executionCompletedAt ?? "--"}`}</Text>
        </View>
        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/life-manifest")}>
          <Text style={styles.buttonText}>חזרה ל-Life Manifest</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/goals/[id]", params: { id: goal.id } })}>
          <Text style={styles.secondaryButtonText}>צפייה בהתקדמות</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/reach-your-goal")}>
          <Text style={styles.secondaryButtonText}>בחירת המטרה הבאה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 8 },
  body: { fontSize: 15, textAlign: "right", marginBottom: 6 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginBottom: 12 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  decisionBanner: { backgroundColor: "#fff7e6", borderRadius: 10, padding: 12, marginBottom: 12 },
  decisionText: { fontSize: 15, textAlign: "right", color: "#7a5200", marginBottom: 8, fontWeight: "700" },
  targetCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 10 },
  targetName: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 8, marginBottom: 8 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 8, alignSelf: "center" },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%", maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 8 },
});

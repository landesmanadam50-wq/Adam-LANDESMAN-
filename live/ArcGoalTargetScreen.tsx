import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";

import {
  appendArcGoalTargetOccurrenceCompletion,
  getArcBuild,
  getArcGoal,
  getArcGoalTarget,
  getScheduledRoutine,
  upsertArcGoal,
  upsertArcGoalTarget,
} from "../data/storage.ts";
import { reconcileArcGoalTargetNotification } from "../data/arcGoalTargetReminders.ts";
import { clearExecutionReturnContext, completeTarget, resolvePhase, resolveTargetSupportRoute, setExecutionReturnContext } from "../arc/subGoalExecution.ts";
import type { TargetSupportDifficulty } from "../arc/subGoalExecution.ts";
import type { ArcBuild, ArcGoal, ArcGoalSubGoal, ArcGoalTarget } from "../arc/types.ts";

const DIFFICULTY_OPTIONS: { value: TargetSupportDifficulty; label: string }[] = [
  { value: "emotion", label: "רגש או מצב פנימי" },
  { value: "urge", label: "דחף" },
  { value: "thought", label: "מחשבה או אמונה" },
  { value: "practical_barrier", label: "חסם מעשי" },
  { value: "short_support", label: "אני צריך חיזוק קצר" },
  { value: "none", label: "אין קושי -- אני מוכן לבצע" },
];

/**
 * live/ArcGoalTargetScreen.tsx (route: /goals/target/[targetId], optional
 * ?arcGoalId= for a safe fallback if the target itself no longer
 * resolves -- spec section 11)
 *
 * Sub-goal execution task, spec sections 5-6, 10-12: the real-world
 * execution screen for ONE ArcGoalTarget -- "Reminder or real-world
 * trigger -> open target -> perform action -> mark complete," never
 * requiring an ARC protocol first. "אני צריך עזרה מ-ARCHI" is a fully
 * optional, exact-return-context-preserving detour (spec section 11):
 * saved onto the owning ArcGoal right before navigating away, read back
 * (and cleared) the moment this screen regains focus after that flow
 * completes, is canceled, or is exited -- this screen is the ONLY thing
 * a support flow launched from here ever returns to.
 */
export default function ArcGoalTargetScreen() {
  const { targetId, arcGoalId: arcGoalIdParam } = useLocalSearchParams<{ targetId: string; arcGoalId?: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [target, setTarget] = useState<ArcGoalTarget | null>(null);
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [subGoal, setSubGoal] = useState<ArcGoalSubGoal | null>(null);
  const [identityBuild, setIdentityBuild] = useState<ArcBuild | null>(null);
  const [linkedRoutineTitle, setLinkedRoutineTitle] = useState<string | null>(null);

  const [supportOpen, setSupportOpen] = useState(false);
  const [practicalOpen, setPracticalOpen] = useState(false);
  const [identityRecallOpen, setIdentityRecallOpen] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!targetId) {
      setStatus("notFound");
      return;
    }
    try {
      const loadedTarget = await getArcGoalTarget(targetId);
      if (!loadedTarget) {
        setStatus("notFound");
        return;
      }
      const loadedGoal = await getArcGoal(loadedTarget.arcGoalId);
      if (!loadedGoal) {
        setStatus("notFound");
        return;
      }
      setTarget(loadedTarget);
      setGoal(loadedGoal);
      setSubGoal((loadedGoal.subGoals ?? []).find((s) => s.id === loadedTarget.subGoalId) ?? null);
      if (loadedGoal.identityProtocolId) setIdentityBuild(await getArcBuild(loadedGoal.identityProtocolId));
      if (loadedTarget.linkedScheduledRoutineId) {
        const routine = await getScheduledRoutine(loadedTarget.linkedScheduledRoutineId);
        setLinkedRoutineTitle(routine?.title ?? null);
      }

      // Sub-goal execution task, spec section 11: clear a stale return
      // context the moment we're actually back here (this screen is the
      // only valid destination for one pointing at this target) --
      // never left dangling for a later, unrelated visit to misread.
      if (loadedGoal.executionReturnContext?.targetId === loadedTarget.id) {
        await upsertArcGoal({ ...loadedGoal, executionReturnContext: null });
      }
      setStatus("ready");
    } catch (error) {
      console.warn("[ArcGoalTargetScreen] Failed to load -- showing the recovery state instead of hanging.", error);
      setStatus("notFound");
    }
  }, [targetId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function returnToDashboard(goalId: string) {
    router.replace({ pathname: "/goals/execution/[goalId]", params: { goalId } });
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  // Spec section 11: a deleted/missing target (or its owning goal) falls
  // back safely to the active sub-goal dashboard when we at least know
  // which goal it belonged to; otherwise back to Reach Your Goal.
  if (status === "notFound" || !target || !goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>היעד לא נמצא.</Text>
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => (arcGoalIdParam ? returnToDashboard(arcGoalIdParam) : router.replace("/reach-your-goal"))}
          >
            <Text style={styles.buttonText}>חזרה ללוח הביצוע</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  async function markDone() {
    if (!target || !goal) return;
    const now = new Date().toISOString();
    const { target: updatedTarget, occurrence } = completeTarget(target, now);
    const reconciled = await reconcileArcGoalTargetNotification(updatedTarget, subGoal?.name ?? null);
    await upsertArcGoalTarget(reconciled);
    if (occurrence) await appendArcGoalTargetOccurrenceCompletion(occurrence);
    setTarget(reconciled);
    setDoneMessage("היעד סומן כהושלם.");
  }

  function launchSupport(difficulty: TargetSupportDifficulty) {
    if (!goal || !target) return;
    const route = resolveTargetSupportRoute(difficulty, goal);
    setSupportOpen(false);

    if (route.kind === "none") return;
    if (route.kind === "practical_barrier_options") {
      setPracticalOpen(true);
      return;
    }
    if (route.kind === "identity_recall") {
      setIdentityRecallOpen(true);
      return;
    }

    const now = new Date().toISOString();
    const updatedGoal = setExecutionReturnContext(
      goal,
      {
        phase: resolvePhase(goal) ?? "execution",
        week: null,
        subGoalId: target.subGoalId,
        targetId: target.id,
        linkedRoutineId: target.linkedScheduledRoutineId,
        originScreen: "/goals/target/[targetId]",
      },
      now
    );
    upsertArcGoal(updatedGoal);

    if (route.kind === "mini_arc") router.push({ pathname: "/mini-arc/live/[id]", params: { id: route.miniArcId } });
    else if (route.kind === "full_arc") router.push({ pathname: "/live", params: { buildId: route.buildId } });
    else if (route.kind === "arc_goal_urge_session") router.push({ pathname: "/arc-goal/live/[goalId]", params: { goalId: goal.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: target.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{subGoal?.name ?? ""}</Text>
        <Text style={styles.title}>{target.name}</Text>
        {target.actionDescription && <Text style={styles.body}>{target.actionDescription}</Text>}
        <View style={styles.card}>
          <Text style={styles.body}>{`תאריך ושעה: ${target.plannedDate ?? "--"} ${target.plannedTime ?? ""}`.trim()}</Text>
          {target.location && <Text style={styles.body}>{`מיקום: ${target.location}`}</Text>}
          {target.durationMinutes !== null && <Text style={styles.body}>{`משך: ${target.durationMinutes} דקות`}</Text>}
          {linkedRoutineTitle && (
            <Pressable style={styles.actionButton} onPress={() => router.push("/routines")}>
              <Text style={styles.actionButtonText}>{`שגרה מקושרת: ${linkedRoutineTitle} -- פתיחה`}</Text>
            </Pressable>
          )}
          <Text style={styles.body}>{`סטטוס: ${target.status === "completed" ? "הושלם" : "טרם הושלם"}`}</Text>
        </View>

        {doneMessage && <Text style={styles.successText}>{doneMessage}</Text>}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setDoneMessage(null)}>
          <Text style={styles.buttonText}>התחל לבצע</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={markDone}>
          <Text style={styles.buttonText}>סיימתי</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setSupportOpen(true)}>
          <Text style={styles.secondaryButtonText}>אני צריך עזרה מ-ARCHI</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => returnToDashboard(goal.id)}>
          <Text style={styles.backButtonText}>חזרה ללוח הביצוע</Text>
        </Pressable>
      </ScrollView>

      {/* --- "מה מפריע לך לבצע את הפעולה?" (spec section 10) --- */}
      <Modal visible={supportOpen} transparent animationType="fade" onRequestClose={() => setSupportOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>מה מפריע לך לבצע את הפעולה?</Text>
            {DIFFICULTY_OPTIONS.map((option) => (
              <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => launchSupport(option.value)}>
                <Text style={styles.buttonText}>{option.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.actionButton} onPress={() => setSupportOpen(false)}>
              <Text style={styles.actionButtonText}>ביטול</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* --- Practical barrier (spec section 12): NEVER an emotional ARC --- */}
      <Modal visible={practicalOpen} transparent animationType="fade" onRequestClose={() => setPracticalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>חסם מעשי</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setPracticalOpen(false)}>
              <Text style={styles.buttonText}>לפרק את הפעולה לצעד קטן יותר</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setPracticalOpen(false)}>
              <Text style={styles.buttonText}>לבחור פעולה חלופית מעשית</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => {
                setPracticalOpen(false);
                router.push({ pathname: "/goals/[id]", params: { id: goal.id } });
              }}
            >
              <Text style={styles.buttonText}>לעדכן זמן או מקום</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => setPracticalOpen(false)}>
              <Text style={styles.actionButtonText}>לחזור ליעד</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* --- Identity Recall (in place, no navigation -- spec section 10) --- */}
      <Modal visible={identityRecallOpen} transparent animationType="fade" onRequestClose={() => setIdentityRecallOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>היזכרות בזהות</Text>
            <Text style={styles.body}>{`מנטרת זהות: ${identityBuild?.profile.identityEncoding?.mantra ?? "--"}`}</Text>
            <Text style={styles.body}>{`עוגן שפת גוף: ${identityBuild?.profile.identityEncoding?.bodyLanguageCue ?? "--"}`}</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setIdentityRecallOpen(false)}>
              <Text style={styles.buttonText}>בוצע -- חזרה ליעד</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  body: { fontSize: 15, textAlign: "right", marginBottom: 6 },
  successText: { fontSize: 14, textAlign: "right", color: "#1a7a3a", marginBottom: 12 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%", maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 8, marginBottom: 8 },
});

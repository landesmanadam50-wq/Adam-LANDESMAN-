import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { findBodyScanNote, resolveCurrentStep, type DailyVisualizationStep } from "../arc/dailyVisualization.ts";
import type { Task } from "../arc/tasks.ts";
import { findActionStageByKind, hasConfiguredActionStages } from "../arc/taskStage.ts";
import {
  advanceDailyVisualization,
  bypassDailyVisualization,
  commitDailyVisualizationImmediateActionTask,
  commitDailyVisualizationReinforcementTask,
  loadOrStartDailyVisualizationSession,
  resolveLateStartConflictsForSession,
  saveDailyVisualizationBodyScanNote,
  saveDailyVisualizationFeelingAndMovement,
  saveDailyVisualizationReinforcement,
  type DailyVisualizationSession,
} from "../data/dailyVisualization.ts";

const FEELING_SUGGESTIONS = ["סיפוק", "רוגע", "ביטחון", "תחושת מימוש", "מוטיבציה", "שלווה פנימית"];
const MOVEMENT_SUGGESTIONS = ["ישור הגב", "הרפיית הכתפיים", "הרמת הראש", "פתיחת החזה"];

/**
 * live/DailyVisualizationScreen.tsx (route /daily-visualization)
 *
 * Daily Visualization, Body Awareness & Morning Preparation task: a
 * brand-new, separate FULL-SCREEN exercise -- never a third startup
 * popup (requirement: "must be a separate full-screen exercise, not a
 * third popup"). Reached three ways, all converging on the exact same
 * session/step state:
 *  1. live/DailyStartupSequenceOverlay.tsx, right after both startup
 *     popups finish, when today's exercise isn't done yet.
 *  2. The Daily Visualization alarm notification (data/dailyVisualizationAlarm.ts).
 *  3. live/ActiveTaskScreen.tsx's own required-before-tasks gate, with
 *     `returnToTaskId` set so finishing (or bypassing) returns directly
 *     to that task with autoStart=1, rather than to the daily schedule.
 *
 * Manual "המשך" buttons only -- no dwell timers, no forced waiting
 * (requirement: "avoid unnecessary animations or long forced waiting
 * periods... move through the visualization at a comfortable pace"),
 * unlike arc/manifestMeditation.ts's own timed stages. A labeled bypass
 * is always visible, satisfying "preserve a clearly labeled option to
 * bypass... without blocking access to essential app functions."
 */
export default function DailyVisualizationScreen({ returnToTaskId }: { returnToTaskId?: string }) {
  const [session, setSession] = useState<DailyVisualizationSession | null>(null);
  const [feelingDraft, setFeelingDraft] = useState("");
  const [movementDraft, setMovementDraft] = useState("");
  const [reinforcementActionDraft, setReinforcementActionDraft] = useState("");
  const [reinforcementTimeDraft, setReinforcementTimeDraft] = useState("");
  const [bodyScanNoteDraft, setBodyScanNoteDraft] = useState("");
  const [lateConflicts, setLateConflicts] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadOrStartDailyVisualizationSession().then((loaded) => {
      setSession(loaded);
      setFeelingDraft(loaded.profile.desiredFeeling);
      setMovementDraft(loaded.profile.bodyMovement);
      setReinforcementActionDraft(loaded.profile.reinforcementAction);
      setReinforcementTimeDraft(loaded.profile.reinforcementTime);
    });
  }, []);

  /**
   * Final Morning Flow Requirements Audit task, section 2: pre-fills
   * (or clears, for any other step) the per-task body-scan note draft
   * whenever the current step changes -- `session` gets a new object
   * identity on every advance (setSession(nextSession)), so this fires
   * exactly when the visible step actually changes, never mid-typing.
   */
  useEffect(() => {
    if (!session) return;
    const step = resolveCurrentStep(session.progress, session.tasks);
    if (step.kind !== "task_body_scan") return;
    const task = session.tasks[step.taskIndex];
    setBodyScanNoteDraft(task ? findBodyScanNote(session.progress.bodyScanNotes, task.id) : "");
  }, [session]);

  function navigateOnward() {
    if (returnToTaskId) {
      router.replace({ pathname: "/tasks/[id]", params: { id: returnToTaskId, autoStart: "1" } });
      return;
    }
    router.replace("/");
  }

  async function handleContinue() {
    if (!session || busy) return;
    const step = resolveCurrentStep(session.progress, session.tasks);
    setBusy(true);
    try {
      // Persisting the feeling+movement profile happens exactly once,
      // leaving the "movement" step -- by then both drafts are
      // finalized (requirement: "preserve the feeling and movement for
      // future daily visualizations"). Final Morning Flow Requirements
      // Audit task, section 3: the SAME text is also committed as
      // today's own immediate-priority-action Task (progressForAdvance
      // carries the resulting immediateActionTaskId before advancing),
      // the FIRST of the two emotion-reinforcing actions on today's
      // Flexible Daily Routine.
      let progressForAdvance = session.progress;
      if (step.kind === "movement") {
        await saveDailyVisualizationFeelingAndMovement(feelingDraft.trim(), movementDraft.trim());
        progressForAdvance = await commitDailyVisualizationImmediateActionTask(session.progress, movementDraft);
      }
      // Morning Flow Simplification task, section 4 step 6: leaving
      // "reinforcement_action" persists the profile AND, when the
      // action text isn't blank, schedules (or updates) the real Task
      // for it -- session.progress is updated with the resulting
      // reinforcementTaskId BEFORE advancing, so advanceDailyVisualization
      // never operates on a stale progress record. The SECOND of the
      // two emotion-reinforcing actions.
      if (step.kind === "reinforcement_action") {
        await saveDailyVisualizationReinforcement(reinforcementActionDraft.trim(), reinforcementTimeDraft.trim());
        progressForAdvance = await commitDailyVisualizationReinforcementTask(session.progress, reinforcementActionDraft, reinforcementTimeDraft);
      }
      // Final Morning Flow Requirements Audit task, section 2: "preserve
      // separate body-scan results per task and date" -- saved exactly
      // once, leaving THIS task's own body_scan step, keyed by its id.
      if (step.kind === "task_body_scan") {
        const task = session.tasks[step.taskIndex];
        if (task) progressForAdvance = await saveDailyVisualizationBodyScanNote(session.progress, task.id, bodyScanNoteDraft);
      }
      const nextProgress = await advanceDailyVisualization(progressForAdvance, session.tasks);
      const nextSession = { ...session, progress: nextProgress };
      setSession(nextSession);
      if (nextProgress.status === "completed") {
        setLateConflicts(resolveLateStartConflictsForSession(nextSession, new Date()));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleBypass() {
    if (!session || busy) return;
    setBusy(true);
    try {
      await bypassDailyVisualization(session.progress);
      navigateOnward();
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // The exercise itself is finished (status "completed") -- show either
  // the late-start/conflict message (section 6) or, with nothing to
  // report, move on immediately.
  if (session.progress.status === "completed" && lateConflicts !== null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>הוויזואליזציה היומית שלי</Text>
          {lateConflicts.length > 0 ? (
            <>
              <Text style={styles.text}>התחלת את הוויזואליזציה מאוחר מהמתוכנן. כדאי לעדכן את לוח הזמנים שלך.</Text>
              <Text style={styles.sectionTitle}>משימות שהזמן שלהן כבר עבר:</Text>
              {lateConflicts.map((task) => (
                <Pressable key={task.id} style={styles.conflictRow} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
                  <Text style={styles.conflictTaskTitle}>{task.title}</Text>
                  <Text style={styles.conflictTaskTime}>{task.scheduledTime ? `תוזמן ל-${task.scheduledTime}` : ""}</Text>
                  <Text style={styles.conflictEditHint}>לעריכת התזמון</Text>
                </Pressable>
              ))}
              <Pressable style={styles.button} onPress={navigateOnward}>
                <Text style={styles.buttonText}>השארת הלוח כמו שהוא</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.button} onPress={navigateOnward}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const step = resolveCurrentStep(session.progress, session.tasks);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>הוויזואליזציה היומית שלי</Text>
        <StepContent
          step={step}
          tasks={session.tasks}
          feelingDraft={feelingDraft}
          setFeelingDraft={setFeelingDraft}
          movementDraft={movementDraft}
          setMovementDraft={setMovementDraft}
          reinforcementActionDraft={reinforcementActionDraft}
          setReinforcementActionDraft={setReinforcementActionDraft}
          reinforcementTimeDraft={reinforcementTimeDraft}
          setReinforcementTimeDraft={setReinforcementTimeDraft}
          bodyScanNoteDraft={bodyScanNoteDraft}
          setBodyScanNoteDraft={setBodyScanNoteDraft}
        />
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleContinue} disabled={busy}>
          <Text style={styles.buttonText}>{step.kind === "final" ? "סיום" : "המשך"}</Text>
        </Pressable>
        <Pressable style={styles.bypassLink} onPress={handleBypass} disabled={busy}>
          <Text style={styles.bypassLinkText}>דילוג על הוויזואליזציה היום</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTaskSchedule(task: Task): string {
  const parts: string[] = [];
  if (task.scheduledTime) parts.push(`שעה ${task.scheduledTime}`);
  if (task.expectedDurationMinutes) parts.push(`${task.expectedDurationMinutes} דקות`);
  return parts.join(" · ");
}

function StepContent({
  step,
  tasks,
  feelingDraft,
  setFeelingDraft,
  movementDraft,
  setMovementDraft,
  reinforcementActionDraft,
  setReinforcementActionDraft,
  reinforcementTimeDraft,
  setReinforcementTimeDraft,
  bodyScanNoteDraft,
  setBodyScanNoteDraft,
}: {
  step: DailyVisualizationStep;
  tasks: Task[];
  feelingDraft: string;
  setFeelingDraft: (value: string) => void;
  movementDraft: string;
  setMovementDraft: (value: string) => void;
  reinforcementActionDraft: string;
  setReinforcementActionDraft: (value: string) => void;
  reinforcementTimeDraft: string;
  setReinforcementTimeDraft: (value: string) => void;
  bodyScanNoteDraft: string;
  setBodyScanNoteDraft: (value: string) => void;
}) {
  if (step.kind === "task_stage_visualize") {
    const task = tasks[step.taskIndex];
    if (!task) return null;
    const stages = task.actionStages;

    // Unified Task Stages task: a task with NO configured stage
    // breakdown always resolves to exactly one such step, stageKind
    // "main" (arc/dailyVisualization.ts's own resolveVisualizeStageKindsForTask)
    // -- rendered here EXACTLY as before this task, unchanged, so every
    // pre-existing task's own visualization stays byte-for-byte identical.
    if (!hasConfiguredActionStages(stages)) {
      return (
        <View style={styles.stepBlock}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <Text style={styles.taskSchedule}>{formatTaskSchedule(task)}</Text>
          {!!task.location?.trim() && <Text style={styles.taskLocation}>{`מיקום: ${task.location}`}</Text>}
          {task.firstAction.trim() && <Text style={styles.taskFirstAction}>{`פעולה ראשונה: ${task.firstAction}`}</Text>}
          <Text style={styles.instruction}>דמיין את עצמך מבצע את המשימה הזאת.</Text>
          <Text style={styles.bullet}>• תחילת המשימה</Text>
          <Text style={styles.bullet}>• ביצוע הפעולות המרכזיות שלה</Text>
          <Text style={styles.bullet}>• השלמתה בהצלחה</Text>
        </View>
      );
    }

    // Stage 1-4 of the spec's own sequence: Environmental Trigger Action
    // -> Resulting Environmental Cue -> Small Action -> Main Action.
    // Every instruction is built ONLY from the trainee's own saved
    // stage text -- never invented. The cue falls back to describing
    // the trigger's own saved action (never fabricated new detail) when
    // no separate cueDescription was given.
    const trigger = findActionStageByKind(stages!, "trigger");
    const small = findActionStageByKind(stages!, "small");
    const main = findActionStageByKind(stages!, "main");
    let instruction = "";
    if (step.stageKind === "trigger" && trigger) {
      instruction = `דמיין שאתה ${trigger.description}.`;
    } else if (step.stageKind === "trigger_cue" && trigger) {
      instruction = trigger.cueDescription ? `דמיין את ${trigger.cueDescription} מולך.` : `דמיין את התוצאה של הפעולה: ${trigger.description}.`;
    } else if (step.stageKind === "small" && small) {
      instruction = `דמיין שאתה ${small.description}.`;
    } else if (main) {
      instruction = `דמיין שאתה ${main.description}.`;
    }
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.taskSchedule}>{formatTaskSchedule(task)}</Text>
        {!!task.location?.trim() && <Text style={styles.taskLocation}>{`מיקום: ${task.location}`}</Text>}
        <Text style={styles.instruction}>{instruction}</Text>
      </View>
    );
  }

  if (step.kind === "task_body_scan") {
    // ARCHI -- Body-Sensation Discovery & Four-Component Learning task,
    // section 10: lets the trainee proactively rehearse a situation
    // they've already defined as an ARC Behaviour trigger (task.
    // linkedArcGymSituationId), rather than only discovering a
    // supportive body sensation reactively, in the moment. Deliberately
    // narrower than creating a brand-new ArcGymSituation from a bare
    // task here would be: ArcGymSituation requires a real manifestId/
    // behaviorId from an actual Manifest behavior the trainee defined,
    // which a plain task has no legitimate source for -- fabricating
    // one would invent a behavior the trainee never actually set. The
    // button is simply absent (never a dead/disabled one) whenever no
    // such link exists yet; this free-text note stays completely
    // unchanged either way.
    const task = tasks[step.taskIndex];
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.instruction}>כעת בצע סריקת גוף מהירה.</Text>
        <Text style={styles.text}>שים לב לתחושות בגוף שלך, מהראש ועד הרגליים, מבלי לנסות לשנות אותן.</Text>
        <TextInput
          style={styles.textInput}
          value={bodyScanNoteDraft}
          onChangeText={setBodyScanNoteDraft}
          placeholder="מה שמת לב אליו בגוף? (רשות)"
          textAlign="right"
          multiline
        />
        {!!task?.linkedArcGymSituationId && (
          <Pressable style={styles.bypassLink} onPress={() => router.push({ pathname: "/arc-gym/train/[id]", params: { id: task.linkedArcGymSituationId! } })}>
            <Text style={styles.bypassLinkText}>תרגול ARC על המצב הזה</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (step.kind === "feeling") {
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.instruction}>איך היית רוצה להרגיש בסוף היום?</Text>
        <TextInput style={styles.textInput} value={feelingDraft} onChangeText={setFeelingDraft} placeholder="לדוגמה: סיפוק, רוגע, ביטחון" textAlign="right" />
        <View style={styles.suggestionRow}>
          {FEELING_SUGGESTIONS.map((suggestion) => (
            <Pressable key={suggestion} style={styles.suggestionChip} onPress={() => setFeelingDraft(suggestion)}>
              <Text style={styles.suggestionChipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // Morning Flow Simplification task, section 4 step 4: a dedicated
  // visualization of a SUCCESSFUL end of day with the feeling just
  // chosen -- distinct from the closing "final" recap below, which
  // only summarizes what was already chosen rather than guiding a new
  // visualization.
  if (step.kind === "end_of_day_visualize") {
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.instruction}>דמיין את עצמך מגיע לסוף היום בהצלחה, עם התחושה הזאת:</Text>
        <Text style={styles.taskTitle}>{feelingDraft || "—"}</Text>
        <Text style={styles.text}>תן לעצמך לחוש את זה לרגע, לפני שתמשיך.</Text>
      </View>
    );
  }

  if (step.kind === "movement") {
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.instruction}>איזו תנועת גוף מייצגת עבורך את התחושה הזאת?</Text>
        <TextInput style={styles.textInput} value={movementDraft} onChangeText={setMovementDraft} placeholder="לדוגמה: ישור הגב, הרפיית הכתפיים" textAlign="right" />
        <View style={styles.suggestionRow}>
          {MOVEMENT_SUGGESTIONS.map((suggestion) => (
            <Pressable key={suggestion} style={styles.suggestionChip} onPress={() => setMovementDraft(suggestion)}>
              <Text style={styles.suggestionChipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // Morning Flow Simplification task, section 4 step 6: "define an
  // end-of-day reinforcement action and schedule its time" -- optional
  // (section 5: never force), persisted and scheduled as a real Task
  // by data/dailyVisualization.ts's own commitDailyVisualizationReinforcementTask
  // once this step is left.
  if (step.kind === "reinforcement_action") {
    return (
      <View style={styles.stepBlock}>
        <Text style={styles.instruction}>איזו פעולת חיזוק תרצה לבצע בסוף היום, ובאיזו שעה? (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={reinforcementActionDraft}
          onChangeText={setReinforcementActionDraft}
          placeholder="לדוגמה: לכתוב ביומן מה הלך טוב היום"
          textAlign="right"
        />
        <TextInput
          style={styles.textInput}
          value={reinforcementTimeDraft}
          onChangeText={setReinforcementTimeDraft}
          placeholder="שעה, לדוגמה: 20:00"
          textAlign="right"
        />
      </View>
    );
  }

  // step.kind === "final"
  return (
    <View style={styles.stepBlock}>
      <Text style={styles.instruction}>דמיין את עצמך מגיע לסוף היום, אחרי שהשלמת את הפעילויות המתוכננות.</Text>
      <Text style={styles.text}>הבא את תשומת הלב שלך לתחושה שרצית להגיע אליה:</Text>
      <Text style={styles.taskTitle}>{feelingDraft || "—"}</Text>
      <Text style={styles.text}>וביצוע התנועה שמייצגת אותה:</Text>
      <Text style={styles.taskTitle}>{movementDraft || "—"}</Text>
      {!!reinforcementActionDraft && (
        <>
          <Text style={styles.text}>ופעולת החיזוק לסוף היום:</Text>
          <Text style={styles.taskTitle}>{reinforcementActionDraft}{reinforcementTimeDraft ? ` · ${reinforcementTimeDraft}` : ""}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 20, color: "#0a7ea4" },
  stepBlock: { marginBottom: 24 },
  taskTitle: { fontSize: 18, fontWeight: "700", textAlign: "right", color: "#222" },
  taskSchedule: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 4 },
  taskFirstAction: { fontSize: 14, color: "#444", textAlign: "right", marginTop: 8 },
  taskLocation: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 4 },
  instruction: { fontSize: 17, fontWeight: "600", textAlign: "right", color: "#0a7ea4", marginTop: 14, marginBottom: 8 },
  text: { fontSize: 16, textAlign: "right", color: "#222", lineHeight: 23, marginTop: 4 },
  bullet: { fontSize: 15, textAlign: "right", color: "#444", marginTop: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#444", marginTop: 14, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15, marginTop: 4, marginBottom: 10 },
  suggestionRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  suggestionChip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  suggestionChipText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  conflictRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 10 },
  conflictTaskTitle: { fontSize: 15, fontWeight: "700", textAlign: "right" },
  conflictTaskTime: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 2 },
  conflictEditHint: { fontSize: 12, color: "#0a7ea4", textAlign: "right", marginTop: 4 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  bypassLink: { marginTop: 14, alignItems: "center" },
  bypassLinkText: { color: "#666", fontSize: 13 },
});

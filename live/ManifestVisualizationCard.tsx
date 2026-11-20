import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { createEmptyTask, generateTaskId, type Task } from "../arc/tasks.ts";
import type { ManifestNextAction } from "../arc/manifestGoals.ts";
import {
  recordDailyActionTask,
  resolveFocusPointColor,
  type DailyManifestSelection,
  type FutureBehavior,
  type PurposeManifest,
} from "../arc/purposeManifest.ts";
import { saveDailyManifestSelection, upsertTask } from "../data/storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

const EVERY_DAY_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

type CardStep = "goal" | "behavior" | "mantra" | "focus" | "movement" | "action" | "nextAction";

/**
 * Final Manifest & Startup Popup Updates task: the spec's own exact
 * exercise order -- goal/reason/value -> behavior visualization ->
 * mantra -> colored focus point -> body movement -> optional daily
 * action -- MINUS whichever of mantra/focus/movement this particular
 * manifest hasn't filled in (a legacy manifest saved before this task,
 * or simply left blank). "goal", "behavior" and "action" are always
 * present; never reorders the steps that ARE present, never shows an
 * empty/broken step for one that isn't.
 */
function resolveStepOrder(manifest: PurposeManifest): CardStep[] {
  const steps: CardStep[] = ["goal", "behavior"];
  if (manifest.futureMantra.trim()) steps.push("mantra");
  if (resolveFocusPointColor(manifest.focusPointColor)) steps.push("focus");
  if (manifest.futureBodyMovement.trim()) steps.push("movement");
  steps.push("action");
  // Manifest Goals & Automatic Task Scheduling task, Popup 2 Step 6:
  // "the full existing Manifest exercise, followed by the next scheduled
  // task reminder" -- always last, ALWAYS present (never conditionally
  // skipped like mantra/focus/movement above), since it has its own
  // graceful "no incomplete tasks yet" / "still needs scheduling"
  // content for every possible state rather than requiring one to skip.
  steps.push("nextAction");
  return steps;
}

/** he-IL, same convention as build/PlannedArcListScreen.tsx/build/PlannedArcEditorScreen.tsx's own date formatting -- never a second date-formatting scheme. */
function formatManifestTaskDate(scheduledDate: string | null): string {
  if (!scheduledDate) return "עדיין לא נקבע תאריך";
  return new Date(`${scheduledDate}T00:00:00`).toLocaleDateString("he-IL");
}

function formatManifestTaskTime(scheduledTime: string | null): string {
  return scheduledTime ?? "עדיין לא נקבעה שעה";
}

/**
 * live/ManifestVisualizationCard.tsx
 *
 * Manifest Upgrade task, requirements 4-5 (original): Popup 2's actual
 * content -- the day's long-term goal/personal reason/core value plus
 * the selected future behavior's own visualization and reason, PLUS
 * (never a separate popup) the optional "small action today" connector.
 *
 * Final Manifest & Startup Popup Updates task: extended, STILL inside
 * this one card/modal (never a second popup), into the full ordered
 * sequence above -- a local `stepIndex` advances on "המשך", and
 * "דילוג" closes the whole sequence immediately from any step (both
 * controls are always visible, satisfying "Allow skipping" and
 * "Provide Continue and Skip controls"). manifest/behavior/selection
 * are all read-only props from the caller's own single, already-fixed
 * resolution -- this component never re-picks or re-rolls anything
 * itself, so the selected manifest/behavior stay fixed for the whole
 * sequence no matter how many steps the trainee moves through.
 *
 * Reused as-is by BOTH live/DailyStartupSequenceOverlay.tsx (every
 * cold-start sequence) and the "reopen today's visualization" route --
 * one card, two entry points, never two implementations of the same
 * content.
 *
 * The visualization text is always read verbatim from the trainee's
 * own saved manifest/behavior -- nothing here invents or rewrites any
 * of it.
 */
export default function ManifestVisualizationCard({
  manifest,
  behavior,
  selection,
  nextAction,
  onClose,
}: {
  manifest: PurposeManifest;
  behavior: FutureBehavior;
  selection: DailyManifestSelection;
  nextAction: ManifestNextAction | null;
  onClose: () => void;
}) {
  const stepOrder = useMemo(() => resolveStepOrder(manifest), [manifest]);
  const [stepIndex, setStepIndex] = useState(0);
  const step = stepOrder[stepIndex];
  const resolvedColor = resolveFocusPointColor(manifest.focusPointColor);

  const [actionText, setActionText] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(selection.dailyActionTaskId);
  const [saving, setSaving] = useState(false);
  /**
   * Nine Functional Improvements task, Improvement 1: "allow a
   * configurable timer duration for each Manifest action... save the
   * timer duration so it can be reused." nextAction.task is already a
   * REAL Task (resolveNextManifestAction) that already opens directly
   * in Task LIVE (the "פתיחת המשימה" button below) -- Task LIVE's own
   * timer engine already reads expectedDurationMinutes, never starts a
   * countdown until the trainee presses Start, and already supports
   * Pause/Resume/Complete/Reflection/Reward, so the ONLY missing piece
   * is a way to actually SET that duration from here, without a trip to
   * the separate Task Editor. Initialized once from the fixed
   * nextAction prop (same "fixed for the whole sequence" invariant this
   * card's own doc already establishes for manifest/behavior/selection).
   */
  const [durationDraft, setDurationDraft] = useState(nextAction?.task.expectedDurationMinutes != null ? String(nextAction.task.expectedDurationMinutes) : "");
  const [durationSaved, setDurationSaved] = useState(false);

  /** Writes straight onto THIS ONE already-resolved Task by id -- never a bulk edit, so a recurring action's OTHER occurrences are never touched beyond this same shared template (exactly how "save the duration so it can be reused" is meant to work: the template itself remembers it). An empty field clears the duration (the task simply reverts to "not timed"), never forces a value. */
  async function saveNextActionDuration() {
    if (!nextAction) return;
    const parsed = durationDraft.trim() ? Number(durationDraft) : null;
    await upsertTask({ ...nextAction.task, expectedDurationMinutes: parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null, updatedAt: new Date().toISOString() });
    setDurationSaved(true);
  }

  function goNext() {
    setStepIndex((index) => Math.min(index + 1, stepOrder.length - 1));
  }

  /** `saving` (not just an empty actionText) also disables the button below -- prevents a second task/duplicate schedule entry from a repeated tap while the first save is still in flight. */
  async function addToSchedule() {
    if (!actionText.trim() || saving) return;
    setSaving(true);
    const now = new Date();
    const base = createEmptyTask(generateTaskId(), actionText.trim(), actionText.trim(), now.toISOString());
    const task: Task = {
      ...base,
      scheduledDate: todayLocalDateString(now),
      recurrence: recurring ? { kind: "recurring", daysOfWeek: EVERY_DAY_OF_WEEK } : { kind: "once" },
    };
    await upsertTask(task);
    await saveDailyManifestSelection(recordDailyActionTask(selection, task.id));
    setCreatedTaskId(task.id);
    setSaving(false);
  }

  return (
    <View style={styles.card}>
      {step === "goal" && (
        <>
          <Text style={styles.label}>המטרה שלי:</Text>
          <Text style={styles.value}>{manifest.longTermGoal}</Text>

          <Text style={styles.label}>הסיבה שלי:</Text>
          <Text style={styles.value}>{manifest.personalReason}</Text>

          <Text style={styles.label}>הערך שלי:</Text>
          <Text style={styles.value}>{manifest.personalValue}</Text>
        </>
      )}

      {step === "behavior" && (
        <>
          <Text style={styles.visualizeTitle}>דמיין את עצמך בעתיד:</Text>
          <Text style={styles.visualizeText}>{behavior.description}</Text>

          <Text style={styles.label}>למה חשוב לי להתנהג כך?</Text>
          <Text style={styles.value}>{behavior.reason}</Text>
        </>
      )}

      {step === "mantra" && (
        <>
          <Text style={styles.visualizeTitle}>המנטרה שלי לעתיד:</Text>
          <Text style={styles.mantraText}>{manifest.futureMantra}</Text>
        </>
      )}

      {step === "focus" && resolvedColor && (
        <>
          <Text style={styles.visualizeTitle}>נקודת מיקוד:</Text>
          <View style={[styles.focusDot, { backgroundColor: resolvedColor.hex }]} />
          <Text style={styles.focusColorName}>{resolvedColor.labelHebrew}</Text>
          <Text style={styles.value}>התמקדו בנקודה, וחזרו על המנטרה שלכם בזמן שאתם מתמקדים בה.</Text>
        </>
      )}

      {step === "movement" && (
        <>
          <Text style={styles.visualizeTitle}>תנועת הגוף שלי בעתיד:</Text>
          <Text style={styles.value}>{manifest.futureBodyMovement}</Text>
          <Text style={styles.label}>בצעו את התנועה הזאת עכשיו, ודמיינו את עצמכם מתנהגים כזהות העתידית שלכם.</Text>
        </>
      )}

      {step === "action" &&
        (createdTaskId ? (
          <Text style={styles.confirmation}>✓ הפעולה נוספה ללוח היום</Text>
        ) : (
          <View style={styles.actionBlock}>
            <Text style={styles.actionQuestion}>מה הפעולה הקטנה שתוכל לעשות היום כדי להתנהג כך? (רשות)</Text>
            <TextInput style={styles.textInput} value={actionText} onChangeText={setActionText} placeholder="לדוגמה: תרגול הקשבה פעילה בשיחה אחת" textAlign="right" />
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, !recurring && styles.chipSelected]} onPress={() => setRecurring(false)}>
                <Text style={[styles.chipText, !recurring && styles.chipTextSelected]}>היום בלבד</Text>
              </Pressable>
              <Pressable style={[styles.chip, recurring && styles.chipSelected]} onPress={() => setRecurring(true)}>
                <Text style={[styles.chipText, recurring && styles.chipTextSelected]}>כל יום</Text>
              </Pressable>
            </View>
            <Pressable style={[styles.addButton, (!actionText.trim() || saving) && styles.addButtonDisabled]} onPress={addToSchedule} disabled={!actionText.trim() || saving}>
              <Text style={styles.addButtonText}>הוספה ללוח היום</Text>
            </Pressable>
          </View>
        ))}

      {step === "nextAction" && (
        <>
          <Text style={styles.visualizeTitle}>הצעד הבא שלך לעבר המטרה</Text>
          {nextAction ? (
            <>
              <Text style={styles.label}>היעד הקרוב:</Text>
              <Text style={styles.value}>{nextAction.goal.title}</Text>

              <Text style={styles.label}>המשימה הקרובה:</Text>
              <Text style={styles.value}>{nextAction.task.title}</Text>

              <Text style={styles.label}>תאריך:</Text>
              <Text style={styles.value}>{formatManifestTaskDate(nextAction.task.scheduledDate)}</Text>

              <Text style={styles.label}>שעה:</Text>
              <Text style={styles.value}>{formatManifestTaskTime(nextAction.task.scheduledTime)}</Text>

              <Text style={styles.label}>משך זמן לטיימר (רשות, בדקות):</Text>
              <TextInput
                style={styles.textInput}
                value={durationDraft}
                onChangeText={(text) => {
                  setDurationDraft(text);
                  setDurationSaved(false);
                }}
                textAlign="right"
                keyboardType="number-pad"
                placeholder="לדוגמה: 20"
              />
              <Pressable style={styles.secondaryButton} onPress={saveNextActionDuration}>
                <Text style={styles.secondaryButtonText}>{durationSaved ? "נשמר" : "שמירת משך הזמן"}</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: nextAction.task.id } })}
              >
                <Text style={styles.secondaryButtonText}>פתיחת המשימה</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.value}>אין כרגע משימות פתוחות למניפסט הזה.</Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push({ pathname: "/purpose-manifests/[id]/goals", params: { id: manifest.id } })}
              >
                <Text style={styles.secondaryButtonText}>יצירת משימה חדשה</Text>
              </Pressable>
            </>
          )}
        </>
      )}

      <View style={styles.controlRow}>
        {step === "nextAction" ? (
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>סיום</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.closeButton} onPress={goNext}>
            <Text style={styles.closeButtonText}>המשך</Text>
          </Pressable>
        )}
        {step !== "nextAction" && (
          <Pressable style={styles.skipLink} onPress={onClose}>
            <Text style={styles.skipLinkText}>דילוג</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 },
  label: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 8 },
  value: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#222" },
  visualizeTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginTop: 4 },
  visualizeText: { fontSize: 16, textAlign: "right", color: "#222", lineHeight: 23, marginTop: 4 },
  mantraText: { fontSize: 18, fontWeight: "700", textAlign: "right", color: "#0a7ea4", lineHeight: 26, marginTop: 6 },
  focusDot: { width: 64, height: 64, borderRadius: 32, alignSelf: "center", marginVertical: 14 },
  focusColorName: { fontSize: 15, fontWeight: "700", textAlign: "center", color: "#222", marginBottom: 10 },
  confirmation: { fontSize: 14, color: "#2e7d32", textAlign: "right", marginTop: 16 },
  actionBlock: { marginTop: 4 },
  actionQuestion: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 8, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8 },
  chipRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 14 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 14 },
  controlRow: { marginTop: 18, gap: 10 },
  closeButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
});

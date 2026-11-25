import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import {
  createInternalAction,
  createSupportiveFeeling,
  findInternalActionByText,
  findSupportiveFeelingByLabel,
  resolveFeelingsForTask,
} from "../arc/supportiveFeelings.ts";
import type { FeelingActionLink, InternalAction, SupportiveFeeling, TaskFeelingLink } from "../arc/supportiveFeelings.ts";
import { recordInternalActionUsageRating, recordInternalActionUsageStart, resolveActionsForFeelingRankedForTask } from "../arc/internalActionRating.ts";
import type { ArcTrackChosen, InternalActionUsage, InternalState } from "../arc/internalActionRating.ts";
import {
  appendInternalActionUsageEntry,
  clearSupportiveActionFlowPending,
  getTask,
  linkInternalActionToFeeling,
  linkSupportiveFeelingToTask,
  loadFeelingActionLinks,
  loadInternalActionUsages,
  loadInternalActions,
  loadSupportiveActionFlowPending,
  loadSupportiveFeelings,
  loadTaskFeelingLinks,
  saveSupportiveActionFlowPending,
  updateInternalActionUsageEntry,
  upsertInternalActionEntry,
  upsertSupportiveFeelingEntry,
} from "../data/storage.ts";

type FlowStep = "feeling" | "action" | "mood" | "perform" | "rating";

const RATING_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * live/SupportiveActionFlowScreen.tsx (route /tasks/[id]/supportive-action)
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 4: the real-time "I need a supportive action" flow -- reached from
 * the task-not-started notification's own button
 * (data/taskNotStartedNotification.ts, already wired to this exact
 * route in Phase 4) and from Task LIVE's own continuation loop. Its own
 * lightweight local step machine -- deliberately NOT
 * NewArcLiveSessionState, which belongs to a completely different,
 * much larger protocol.
 *
 * Sequence: feeling -> internal action -> mood (😟/🙂/😄, a SEPARATE
 * concept from the supportive feeling above) -> ARC (skipped entirely
 * on 😄) -> perform the action (no timer, one "סיימתי" button) -> rate
 * 0-10 -> proceed to the task-shrink screen.
 *
 * ARC-context-passing design decision (documented per the task's own
 * explicit instruction): plumbing feeling/action/usage context through
 * live/NewArcLiveScreen.tsx's own returnToTask() would mean editing
 * that screen's internal step engine, which this task is explicitly
 * forbidden from touching. Instead, this screen uses the documented
 * pragmatic fallback -- it persists its own small, single-slot
 * SupportiveActionFlowPendingState (data/storage.ts) right before
 * navigating to the existing Full/Shortened ARC route, with
 * `awaitingArcReturn: true`. ARC's own existing return path lands back
 * on live/ActiveTaskScreen.tsx (/tasks/[id]) exactly as it already does
 * for every other task-linked ARC session -- a tiny new effect added
 * there (see its own doc) notices that pending flag and redirects right
 * back here, where this screen's own focus effect below reads the
 * SAME pending record and resumes at the "perform" step with every
 * piece of context (feelingId/actionId/mood/track/usageId) intact.
 */
export default function SupportiveActionFlowScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<FlowStep>("feeling");

  const [feelings, setFeelings] = useState<SupportiveFeeling[]>([]);
  const [taskFeelingLinks, setTaskFeelingLinks] = useState<TaskFeelingLink[]>([]);
  const [actions, setActions] = useState<InternalAction[]>([]);
  const [feelingActionLinks, setFeelingActionLinks] = useState<FeelingActionLink[]>([]);
  const [usages, setUsages] = useState<InternalActionUsage[]>([]);

  const [feelingId, setFeelingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [internalStateAtStart, setInternalStateAtStart] = useState<InternalState | null>(null);
  const [arcTrackChosen, setArcTrackChosen] = useState<ArcTrackChosen | null>(null);
  const [usageId, setUsageId] = useState<string | null>(null);

  const [newFeelingDraft, setNewFeelingDraft] = useState("");
  const [newActionDraft, setNewActionDraft] = useState("");
  const [ratingDraft, setRatingDraft] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        getTask(taskId),
        loadSupportiveFeelings(),
        loadInternalActions(),
        loadFeelingActionLinks(),
        loadTaskFeelingLinks(),
        loadInternalActionUsages(),
        loadSupportiveActionFlowPending(),
      ]).then(([loadedTask, loadedFeelings, loadedActions, loadedFeelingActionLinks, loadedTaskFeelingLinks, loadedUsages, pending]) => {
          setTask(loadedTask);
          setFeelings(loadedFeelings);
          setActions(loadedActions);
          setFeelingActionLinks(loadedFeelingActionLinks);
          setTaskFeelingLinks(loadedTaskFeelingLinks);
          setUsages(loadedUsages);
          if (pending && pending.taskId === taskId) {
            setFeelingId(pending.feelingId);
            setActionId(pending.actionId);
            setInternalStateAtStart(pending.internalStateAtStart);
            setArcTrackChosen(pending.arcTrackChosen);
            setUsageId(pending.usageId);
            setStep(pending.step);
            if (pending.awaitingArcReturn) {
              void saveSupportiveActionFlowPending({ ...pending, awaitingArcReturn: false });
            }
          }
          setLoaded(true);
        }
      );
    }, [taskId])
  );

  async function handleChooseFeeling(id: string, now: string) {
    setFeelingId(id);
    await linkSupportiveFeelingToTask(taskId, id, now);
    setStep("action");
  }

  async function handleCreateFeeling() {
    const label = newFeelingDraft.trim();
    if (!label) return;
    const now = new Date().toISOString();
    const existing = findSupportiveFeelingByLabel(feelings, label);
    const feeling = existing ?? createSupportiveFeeling(label, now);
    if (!existing) await upsertSupportiveFeelingEntry(feeling);
    setNewFeelingDraft("");
    await handleChooseFeeling(feeling.id, now);
  }

  async function handleChooseAction(id: string) {
    setActionId(id);
    setStep("mood");
  }

  async function handleCreateAction() {
    if (!feelingId) return;
    const text = newActionDraft.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const existing = findInternalActionByText(actions, feelingId, text);
    const action = existing ?? createInternalAction(feelingId, text, now);
    if (!existing) await upsertInternalActionEntry(action);
    await linkInternalActionToFeeling(feelingId, action.id, now);
    setNewActionDraft("");
    await handleChooseAction(action.id);
  }

  /**
   * Mood (😟/🙂/😄) decides the ARC track, exactly as the spec requires
   * -- 😄 skips ARC entirely; the usage-start record is written as soon
   * as BOTH the mood and the ARC track are known (immediately here for
   * 😄, or right before navigating to ARC for 😟/🙂), never deferred all
   * the way to rating, so an abandoned session's try-count is still
   * counted (arc/internalActionRating.ts's own ranking never treats an
   * unrated usage as a failure, but it must still exist to be counted
   * at all).
   */
  async function handleChooseMood(mood: InternalState) {
    if (!feelingId || !actionId) return;
    setInternalStateAtStart(mood);
    const now = new Date().toISOString();
    if (mood === "great") {
      const usage = recordInternalActionUsageStart(taskId, feelingId, actionId, mood, "none", now);
      await appendInternalActionUsageEntry(usage);
      setArcTrackChosen("none");
      setUsageId(usage.id);
      setStep("perform");
      return;
    }
    const track: ArcTrackChosen = mood === "bad" ? "full" : "shortened";
    const usage = recordInternalActionUsageStart(taskId, feelingId, actionId, mood, track, now);
    await appendInternalActionUsageEntry(usage);
    setArcTrackChosen(track);
    setUsageId(usage.id);
    await saveSupportiveActionFlowPending({
      taskId,
      feelingId,
      actionId,
      internalStateAtStart: mood,
      arcTrackChosen: track,
      usageId: usage.id,
      step: "perform",
      awaitingArcReturn: true,
    });
    router.push({ pathname: "/tasks/[id]/arc", params: track === "full" ? { id: taskId, spontaneous: "1" } : { id: taskId, shortened: "1" } });
  }

  async function handleFinishPerforming() {
    setStep("rating");
  }

  async function handleSubmitRating() {
    if (ratingDraft === null || !usageId || !feelingId || !actionId) return;
    const now = new Date().toISOString();
    const usages = await loadInternalActionUsages();
    const existingUsage = usages.find((usage) => usage.id === usageId);
    if (existingUsage) {
      await updateInternalActionUsageEntry(recordInternalActionUsageRating(existingUsage, ratingDraft, now));
    }
    await clearSupportiveActionFlowPending();
    router.replace({ pathname: "/tasks/[id]/adapt", params: { id: taskId } });
  }

  if (!loaded || !task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const taskFeelings = resolveFeelingsForTask(taskId, taskFeelingLinks, feelings);
  const otherFeelings = feelings.filter((feeling) => !taskFeelings.some((taskFeeling) => taskFeeling.id === feeling.id));
  const rankedActionIds = feelingId ? resolveActionsForFeelingRankedForTask(feelingId, taskId, resolveActionIdsForFeeling(feelingId, feelingActionLinks), usages) : [];
  const chosenAction = actionId ? actions.find((action) => action.id === actionId) ?? null : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>פעולה תומכת</Text>
        <Text style={styles.hint}>{task.title}</Text>

        {step === "feeling" && (
          <View style={styles.stepBlock}>
            <Text style={styles.question}>מה אני מרגיש/ה עכשיו?</Text>
            {taskFeelings.length > 0 && (
              <>
                <Text style={styles.label}>רגשות שנבחרו בעבר למשימה זו</Text>
                <View style={styles.chipRow}>
                  {taskFeelings.map((feeling) => (
                    <Pressable key={feeling.id} style={styles.chip} onPress={() => handleChooseFeeling(feeling.id, new Date().toISOString())}>
                      <Text style={styles.chipText}>{feeling.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            {otherFeelings.length > 0 && (
              <>
                <Text style={styles.label}>רגשות תומכים אחרים</Text>
                <View style={styles.chipRow}>
                  {otherFeelings.map((feeling) => (
                    <Pressable key={feeling.id} style={styles.chip} onPress={() => handleChooseFeeling(feeling.id, new Date().toISOString())}>
                      <Text style={styles.chipText}>{feeling.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.label}>רגש חדש</Text>
            <View style={styles.addRow}>
              <Pressable style={styles.addButton} onPress={handleCreateFeeling}>
                <Text style={styles.addButtonText}>הוספה</Text>
              </Pressable>
              <TextInput style={[styles.textInput, styles.flexInput]} value={newFeelingDraft} onChangeText={setNewFeelingDraft} textAlign="right" />
            </View>
          </View>
        )}

        {step === "action" && (
          <View style={styles.stepBlock}>
            <Text style={styles.question}>איזו פעולה פנימית תעזור?</Text>
            {rankedActionIds.length > 0 && (
              <View style={styles.chipRow}>
                {rankedActionIds.map((id) => {
                  const action = actions.find((candidate) => candidate.id === id);
                  if (!action) return null;
                  return (
                    <Pressable key={id} style={styles.chip} onPress={() => handleChooseAction(id)}>
                      <Text style={styles.chipText}>{action.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={styles.label}>פעולה חדשה</Text>
            <View style={styles.addRow}>
              <Pressable style={styles.addButton} onPress={handleCreateAction}>
                <Text style={styles.addButtonText}>הוספה</Text>
              </Pressable>
              <TextInput style={[styles.textInput, styles.flexInput]} value={newActionDraft} onChangeText={setNewActionDraft} textAlign="right" />
            </View>
          </View>
        )}

        {step === "mood" && (
          <View style={styles.stepBlock}>
            <Text style={styles.question}>איך ההרגשה כרגע?</Text>
            <View style={styles.moodRow}>
              <Pressable style={styles.secondaryButton} onPress={() => handleChooseMood("bad")}>
                <Text style={styles.secondaryButtonText}>😟 פחות טוב</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => handleChooseMood("fine")}>
                <Text style={styles.secondaryButtonText}>🙂 סבבה</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => handleChooseMood("great")}>
                <Text style={styles.secondaryButtonText}>😄 מעולה</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === "perform" && (
          <View style={styles.stepBlock}>
            <Text style={styles.question}>מבצע/ת: {chosenAction?.text ?? ""}</Text>
            <Text style={styles.hint}>אפשר להישאר בפעולה כמה זמן שרוצים.</Text>
            <Pressable style={styles.primaryButton} onPress={handleFinishPerforming}>
              <Text style={styles.primaryButtonText}>סיימתי</Text>
            </Pressable>
          </View>
        )}

        {step === "rating" && (
          <View style={styles.stepBlock}>
            <Text style={styles.question}>כמה הפעולה הזו הייתה אפקטיבית? (0-10)</Text>
            <View style={styles.chipRow}>
              {RATING_VALUES.map((value) => (
                <Pressable key={value} style={[styles.chip, ratingDraft === value && styles.chipSelected]} onPress={() => setRatingDraft(value)}>
                  <Text style={[styles.chipText, ratingDraft === value && styles.chipTextSelected]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.primaryButton, ratingDraft === null && styles.primaryButtonDisabled]} onPress={handleSubmitRating} disabled={ratingDraft === null}>
              <Text style={styles.primaryButtonText}>שליחה</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={styles.cancelLink}
          onPress={async () => {
            await clearSupportiveActionFlowPending();
            router.replace({ pathname: "/tasks/[id]", params: { id: taskId } });
          }}
        >
          <Text style={styles.cancelLinkText}>ביטול</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function resolveActionIdsForFeeling(feelingId: string, links: FeelingActionLink[]): string[] {
  return links.filter((link) => link.feelingId === feelingId).map((link) => link.actionId);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 12 },
  label: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 12, marginBottom: 4 },
  question: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  stepBlock: { marginTop: 8 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
  addRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "600" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16, textAlign: "right" },
  flexInput: { flex: 1 },
  moodRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 20 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  cancelLink: { paddingVertical: 16, alignItems: "center" },
  cancelLinkText: { color: "#999", fontSize: 14 },
});

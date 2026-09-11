import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  appendLifeManifestJournalEntry,
  deleteLifeManifestTarget,
  getArcGoal,
  loadArcGoals,
  loadLifeManifestJournal,
  loadLifeManifestTargets,
  loadLifeManifests,
  upsertArcGoal,
  upsertLifeManifest,
  upsertLifeManifestTarget,
} from "../data/storage.ts";
import { reconcileSubGoalDeadlineNotification, reconcileTargetDeadlineNotification } from "../data/lifeManifestReminders.ts";
import type { LifeManifestJournalEntry } from "../data/lifeManifestJournal.ts";
import {
  activateSubGoal,
  allRequiredTargetsComplete,
  completeSubGoal,
  computeSubGoalProgress,
  createEmptyAchievedStateMantra,
  createEmptyEmbodiedIdentityCue,
  createEmptyTarget,
  findSubGoalOwner,
  generateLifeManifestJournalEntryId,
  generateTargetId,
  resolveEffectiveTargetArcGoalId,
  resolveNextSubGoal,
  upsertMajorGoalInLifeManifest,
} from "../arc/lifeManifest.ts";
import type {
  AchievedStateMantra,
  AchievedStateMantraTense,
  EmbodiedIdentityCue,
  LifeManifest,
  SubGoal,
  SubGoalCompletionMode,
  SubGoalOwner,
  Target,
  TargetStatus,
} from "../arc/lifeManifest.ts";
import { createEmptyArcGoal, generateArcGoalId } from "../arc/types.ts";
import type { ArcGoal } from "../arc/types.ts";

const COMPLETION_MODE_LABELS: Record<SubGoalCompletionMode, string> = {
  manual: "ידני",
  all_targets: "כשכל היעדים הנדרשים הושלמו",
  progress_threshold: "כשההתקדמות מגיעה ל-100%",
};
const COMPLETION_MODES: SubGoalCompletionMode[] = ["manual", "all_targets", "progress_threshold"];

const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  draft: "טיוטה",
  active: "פעיל",
  completed: "הושלם",
  overdue: "באיחור",
  paused: "הושהה",
  archived: "הועבר לארכיון",
};
const TARGET_STATUSES: TargetStatus[] = ["draft", "active", "completed", "overdue", "paused", "archived"];

const TENSE_LABELS: Record<AchievedStateMantraTense, string> = {
  present: "הווה (זהות קיימת)",
  past: "עבר (אבן דרך שהושגה)",
};

/**
 * build/LifeManifestSubGoalPanel.tsx
 *
 * Single-page Life Manifest BUILD task: the actual sub-goal management
 * UI (ARC Goal linking -- spec section 1's 5 actions, dates + optional
 * deadline reminders, completion mode, Targets, the Sub-goal completion
 * flow, its own visualization overrides, and its journal), extracted
 * out of what used to be build/LifeManifestSubGoalScreen.tsx's own
 * function body so it can be rendered in TWO places instead of one:
 *
 * 1. Standalone, at its own preserved route (/life-manifest/sub-goal/
 *    [subGoalId]) -- still needed exactly as before for a notification
 *    tap, a journal entry, or a dashboard button, none of which carry a
 *    Major Goal's full questionnaire around with them. Pass
 *    `embedded={false}` (or omit it) there.
 * 2. Nested inside build/LifeManifestEditorScreen.tsx's own single-page
 *    accordion, one CollapsibleSection per Sub-goal, so "all Manifest
 *    construction happens on one scrollable page" genuinely includes
 *    Sub-goal management -- no more hopping to a separate screen mid-BUILD.
 *    Pass `embedded={true}` there: skips this component's own
 *    SafeAreaView/ScrollView (it already renders inside the parent
 *    page's own ScrollView) and its own "back to manifest" link (already
 *    on the manifest page).
 *
 * Every field, action, and modal below is copied verbatim from the
 * original screen -- no new logic, no data-model change. Both render
 * sites share the exact same component, so there is only ever one
 * implementation of "how a Sub-goal is managed" to keep correct.
 */
export function LifeManifestSubGoalPanel({ subGoalId, embedded = false }: { subGoalId: string | undefined; embedded?: boolean }) {
  const [status, setStatus] = useState<"loading" | "notFound" | "editing">("loading");
  const [manifests, setManifests] = useState<LifeManifest[]>([]);
  const [arcGoals, setArcGoals] = useState<ArcGoal[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [journal, setJournal] = useState<LifeManifestJournalEntry[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmDeleteTargetId, setConfirmDeleteTargetId] = useState<string | null>(null);
  const [completionOffer, setCompletionOffer] = useState<{ subGoalName: string } | null>(null);
  const [pendingCompletionConfirm, setPendingCompletionConfirm] = useState(false);

  const reload = useCallback(async () => {
    if (!subGoalId) {
      setStatus("notFound");
      return;
    }
    try {
      const [allManifests, allArcGoals, allTargets, allJournal] = await Promise.all([
        loadLifeManifests(),
        loadArcGoals(),
        loadLifeManifestTargets(),
        loadLifeManifestJournal(),
      ]);
      const owner = findSubGoalOwner(allManifests, subGoalId);
      if (!owner) {
        setStatus("notFound");
        return;
      }
      setManifests(allManifests);
      setArcGoals(allArcGoals);
      setTargets(allTargets.filter((target) => target.subGoalId === subGoalId));
      setJournal(allJournal.filter((entry) => entry.subGoalId === subGoalId));
      setStatus("editing");
    } catch (error) {
      console.warn("[LifeManifestSubGoalPanel] Failed to load -- showing the recovery state instead of hanging.", error);
      setStatus("notFound");
    }
  }, [subGoalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const owner: SubGoalOwner | null = subGoalId ? findSubGoalOwner(manifests, subGoalId) : null;

  function persistSubGoalPatch(patch: Partial<SubGoal>) {
    if (!owner) return;
    const updatedSubGoal: SubGoal = { ...owner.subGoal, ...patch, updatedAt: new Date().toISOString() };
    const updatedManifest = upsertMajorGoalInLifeManifest(
      owner.manifest,
      Object.assign({}, owner.majorGoal, {
        subGoals: owner.majorGoal.subGoals.map((s) => (s.id === updatedSubGoal.id ? updatedSubGoal : s)),
      })
    );
    setManifests((current) => current.map((m) => (m.id === updatedManifest.id ? updatedManifest : m)));
    upsertLifeManifest(updatedManifest).catch(() => setSaveError("אירעה שגיאה בשמירה. נסה שוב."));
    return updatedSubGoal;
  }

  function patchOwnEmbodiedCue(patch: Partial<EmbodiedIdentityCue>) {
    if (!owner) return;
    const base = owner.subGoal.ownEmbodiedIdentityCue ?? createEmptyEmbodiedIdentityCue();
    persistSubGoalPatch({ ownEmbodiedIdentityCue: { ...base, ...patch } });
  }

  function patchOwnAchievedStateMantra(patch: Partial<AchievedStateMantra>) {
    if (!owner) return;
    const base = owner.subGoal.ownAchievedStateMantra ?? createEmptyAchievedStateMantra();
    persistSubGoalPatch({ ownAchievedStateMantra: { ...base, ...patch } });
  }

  async function reconcileReminderAfterDateChange(updatedSubGoal: SubGoal) {
    const reconciled = await reconcileSubGoalDeadlineNotification(updatedSubGoal);
    if (reconciled.deadlineNotificationId !== updatedSubGoal.deadlineNotificationId) {
      persistSubGoalPatch({ deadlineNotificationId: reconciled.deadlineNotificationId, deadlineNotificationScheduledFor: reconciled.deadlineNotificationScheduledFor });
    }
  }

  // -------------------------------------------------------------------
  // ARC Goal linking (spec section 1's 5 actions)
  // -------------------------------------------------------------------

  async function handleLinkExisting(arcGoal: ArcGoal) {
    persistSubGoalPatch({ connectedArcGoalId: arcGoal.id });
    await upsertArcGoal({ ...arcGoal, lifeManifestSubGoalId: owner!.subGoal.id, updatedAt: new Date().toISOString() });
    setLinkPickerOpen(false);
    reload();
  }

  async function handleCreateNew() {
    if (!owner) return;
    const now = new Date().toISOString();
    const goal = { ...createEmptyArcGoal(generateArcGoalId(), owner.subGoal.title, now), lifeManifestSubGoalId: owner.subGoal.id };
    await upsertArcGoal(goal);
    persistSubGoalPatch({ connectedArcGoalId: goal.id });
    router.push({ pathname: "/goals/[id]", params: { id: goal.id } });
  }

  async function handleCreateArcGoalForTarget(target: Target) {
    if (!owner) return;
    const now = new Date().toISOString();
    const goal = { ...createEmptyArcGoal(generateArcGoalId(), target.title, now), lifeManifestSubGoalId: owner.subGoal.id };
    await upsertArcGoal(goal);
    await patchTarget(target, { arcGoalLinkMode: "own", connectedArcGoalId: goal.id });
    router.push({ pathname: "/goals/[id]", params: { id: goal.id } });
  }

  async function handleUnlink() {
    if (!owner || !owner.subGoal.connectedArcGoalId) return;
    const linked = await getArcGoal(owner.subGoal.connectedArcGoalId);
    if (linked) await upsertArcGoal({ ...linked, lifeManifestSubGoalId: null, updatedAt: new Date().toISOString() });
    persistSubGoalPatch({ connectedArcGoalId: null });
    setConfirmUnlink(false);
    reload();
  }

  function handleOpenArcGoal(arcGoalId: string) {
    router.push({ pathname: "/goals/[id]", params: { id: arcGoalId } });
  }

  // -------------------------------------------------------------------
  // Targets
  // -------------------------------------------------------------------

  async function addTarget() {
    if (!owner) return;
    const t = createEmptyTarget(generateTargetId(), owner.subGoal.id, "", new Date().toISOString());
    await upsertLifeManifestTarget(t);
    reload();
  }

  async function patchTarget(target: Target, patch: Partial<Target>) {
    const updated = { ...target, ...patch, updatedAt: new Date().toISOString() };
    await upsertLifeManifestTarget(updated);
    setTargets((current) => current.map((t) => (t.id === updated.id ? updated : t)));
    return updated;
  }

  async function removeTarget(id: string) {
    await deleteLifeManifestTarget(id);
    setConfirmDeleteTargetId(null);
    reload();
  }

  async function handleCompleteTarget(target: Target) {
    if (!owner) return;
    const now = new Date().toISOString();
    const effectiveArcGoalId = resolveEffectiveTargetArcGoalId(target, owner.subGoal);
    const updated = await patchTarget(target, { status: "completed", completedAt: now });

    await appendLifeManifestJournalEntry({
      id: generateLifeManifestJournalEntryId(),
      kind: "target_completed",
      lifeManifestId: owner.manifest.id,
      majorGoalId: owner.majorGoal.id,
      subGoalId: owner.subGoal.id,
      targetId: updated.id,
      linkedArcGoalId: effectiveArcGoalId,
      subGoalTitle: owner.subGoal.title,
      targetTitle: updated.title,
      occurredAt: now,
      createdAt: now,
    });

    const nextTargets = targets.map((t) => (t.id === updated.id ? updated : t));
    setTargets(nextTargets);
    checkAutoCompletionCondition(nextTargets);
    reload();
  }

  // -------------------------------------------------------------------
  // Sub-goal completion (spec sections 2 + 9)
  // -------------------------------------------------------------------

  function checkAutoCompletionCondition(currentTargets: Target[]) {
    if (!owner || owner.subGoal.status === "completed") return;
    const mode = owner.subGoal.completionMode;
    if (mode === "manual") return;
    const met = mode === "all_targets" ? allRequiredTargetsComplete(currentTargets) : computeSubGoalProgress(currentTargets) >= 100;
    if (met) setPendingCompletionConfirm(true);
  }

  async function completeSubGoalNow() {
    if (!owner) return;
    const now = new Date().toISOString();
    const updatedMajorGoal = completeSubGoal(owner.majorGoal, owner.subGoal.id, now);
    const updatedManifest = upsertMajorGoalInLifeManifest(owner.manifest, updatedMajorGoal);
    setManifests((current) => current.map((m) => (m.id === updatedManifest.id ? updatedManifest : m)));
    await upsertLifeManifest(updatedManifest);

    await appendLifeManifestJournalEntry({
      id: generateLifeManifestJournalEntryId(),
      kind: "sub_goal_completed",
      lifeManifestId: owner.manifest.id,
      majorGoalId: owner.majorGoal.id,
      subGoalId: owner.subGoal.id,
      targetId: null,
      linkedArcGoalId: owner.subGoal.connectedArcGoalId,
      subGoalTitle: owner.subGoal.title,
      targetTitle: null,
      occurredAt: now,
      createdAt: now,
    });

    setPendingCompletionConfirm(false);
    setCompletionOffer({ subGoalName: owner.subGoal.title });
  }

  async function handleGoToNextSubGoal() {
    if (!owner) return;
    const refreshedManifests = await loadLifeManifests();
    const refreshedOwner = findSubGoalOwner(refreshedManifests, owner.subGoal.id);
    if (!refreshedOwner) return;
    const next = resolveNextSubGoal(refreshedOwner.majorGoal, refreshedOwner.subGoal.id);
    if (!next) {
      setCompletionOffer(null);
      router.push({ pathname: "/life-manifest/[id]", params: { id: refreshedOwner.manifest.id } });
      return;
    }
    const updatedMajorGoal = activateSubGoal(refreshedOwner.majorGoal, next.id);
    const updatedManifest = upsertMajorGoalInLifeManifest(refreshedOwner.manifest, updatedMajorGoal);
    await upsertLifeManifest(updatedManifest);
    setCompletionOffer(null);
    router.replace({ pathname: "/life-manifest/sub-goal/[subGoalId]", params: { subGoalId: next.id } });
  }

  async function reconcileReminderAfterTargetDateChange(target: Target) {
    const reconciled = await reconcileTargetDeadlineNotification(target);
    if (reconciled.deadlineNotificationId !== target.deadlineNotificationId) {
      await upsertLifeManifestTarget(reconciled);
      setTargets((current) => current.map((t) => (t.id === reconciled.id ? reconciled : t)));
    }
  }

  if (status === "loading") {
    if (embedded) return <View style={styles.embeddedLoading} />;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !owner) {
    const notFoundBody = <Text style={styles.title}>תת־המטרה לא נמצאה</Text>;
    if (embedded) return notFoundBody;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {notFoundBody}
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/life-manifest")}>
            <Text style={styles.buttonText}>חזרה לרשימת המניפסטים</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { manifest, majorGoal, subGoal, order } = owner;
  const linkedArcGoal = subGoal.connectedArcGoalId ? arcGoals.find((g) => g.id === subGoal.connectedArcGoalId) ?? null : null;
  const canComplete = subGoal.completionMode === "manual" || checkConditionMet(subGoal.completionMode, targets);

  const body = (
    <View>
      {!embedded && <Text style={styles.eyebrow}>{`${majorGoal.title} · תת־מטרה ${order}`}</Text>}
      {!embedded && <Text style={styles.title}>{subGoal.title || "תת־מטרה ללא כותרת"}</Text>}
      {saveError && <Text style={styles.errorText}>{saveError}</Text>}

      {/* --- ARC Goal connection --- */}
      <Text style={styles.sectionTitle}>ARC Goal מקושר</Text>
      {linkedArcGoal ? (
        <View style={styles.card}>
          <Text style={styles.body}>{linkedArcGoal.name}</Text>
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={() => handleOpenArcGoal(linkedArcGoal.id)}>
              <Text style={styles.actionButtonText}>לעבור ל־ARC Goal</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => setLinkPickerOpen(true)}>
              <Text style={styles.actionButtonText}>להחליף ARC Goal מקושר</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => setConfirmUnlink(true)}>
              <Text style={[styles.actionButtonText, styles.deleteText]}>לנתק את הקישור</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.hint}>אין ARC Goal מקושר לתת־המטרה הזאת.</Text>
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={() => setLinkPickerOpen(true)}>
              <Text style={styles.actionButtonText}>לקשר ARC Goal קיים</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={handleCreateNew}>
              <Text style={styles.actionButtonText}>ליצור ARC Goal לתת־המטרה</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* --- Dates + reminders --- */}
      <Text style={styles.sectionTitle}>תאריכים</Text>
      <Text style={styles.fieldLabel}>תאריך התחלה (רשות, YYYY-MM-DD)</Text>
      <TextInput
        style={styles.textInput}
        value={subGoal.startDate ?? ""}
        onChangeText={(text) => persistSubGoalPatch({ startDate: text.trim().length > 0 ? text : null })}
        onEndEditing={() => reconcileReminderAfterDateChange(subGoal)}
        textAlign="right"
        placeholder="2025-01-01"
      />
      <Text style={styles.fieldLabel}>מועד סיום (רשות, YYYY-MM-DD)</Text>
      <TextInput
        style={styles.textInput}
        value={subGoal.deadline ?? ""}
        onChangeText={(text) => {
          const updated = persistSubGoalPatch({ deadline: text.trim().length > 0 ? text : null });
          if (updated) reconcileReminderAfterDateChange(updated);
        }}
        textAlign="right"
        placeholder="2025-03-01"
      />
      <View style={styles.switchRow}>
        <Switch
          value={subGoal.remindersEnabled}
          onValueChange={(value) => {
            const updated = persistSubGoalPatch({ remindersEnabled: value });
            if (updated) reconcileReminderAfterDateChange(updated);
          }}
        />
        <Text style={styles.fieldLabel}>תזכורות למועד הסיום (רשות)</Text>
      </View>

      {/* --- Completion mode --- */}
      <Text style={styles.sectionTitle}>מתי תת־המטרה נחשבת הושלמה?</Text>
      <View style={[styles.chipColumn, styles.chipRow]}>
        {COMPLETION_MODES.map((mode) => (
          <Pressable
            key={mode}
            style={[styles.chip, subGoal.completionMode === mode && styles.chipSelected]}
            onPress={() => persistSubGoalPatch({ completionMode: mode })}
          >
            <Text style={styles.chipText}>{COMPLETION_MODE_LABELS[mode]}</Text>
          </Pressable>
        ))}
      </View>

      {/* --- Targets --- */}
      <Text style={styles.sectionTitle}>{`יעדים (${targets.length})`}</Text>
      {targets.map((target) => (
        <TargetCard
          key={target.id}
          target={target}
          subGoal={subGoal}
          arcGoals={arcGoals}
          onPatch={(patch) => patchTarget(target, patch).then((updated) => reconcileReminderAfterTargetDateChange(updated))}
          onDelete={() => setConfirmDeleteTargetId(target.id)}
          onComplete={() => handleCompleteTarget(target)}
          onOpenArcGoal={handleOpenArcGoal}
          onCreateArcGoalForTarget={() => handleCreateArcGoalForTarget(target)}
        />
      ))}
      <Pressable style={[styles.button, styles.fullWidthButton]} onPress={addTarget}>
        <Text style={styles.buttonText}>+ הוסף יעד</Text>
      </Pressable>

      {/* --- Sub-goal completion --- */}
      <Text style={styles.sectionTitle}>סטטוס תת־המטרה</Text>
      <Text style={styles.body}>{`סטטוס נוכחי: ${subGoal.status}`}</Text>
      {subGoal.status !== "completed" && subGoal.status !== "archived" && (
        <>
          <Pressable
            style={[styles.button, styles.fullWidthButton, !canComplete && styles.buttonDisabled]}
            disabled={!canComplete}
            onPress={() => (subGoal.completionMode === "manual" ? completeSubGoalNow() : setPendingCompletionConfirm(true))}
          >
            <Text style={styles.buttonText}>סמן תת־מטרה כהושלמה</Text>
          </Pressable>
          {subGoal.status !== "active" && (
            <Pressable
              style={[styles.button, styles.fullWidthButton, styles.secondaryStyleButton]}
              onPress={() => {
                const updatedMajorGoal = activateSubGoal(majorGoal, subGoal.id);
                const updatedManifest = upsertMajorGoalInLifeManifest(manifest, updatedMajorGoal);
                setManifests((current) => current.map((m) => (m.id === updatedManifest.id ? updatedManifest : m)));
                upsertLifeManifest(updatedManifest);
              }}
            >
              <Text style={styles.buttonText}>הפוך לתת־המטרה הפעילה</Text>
            </Pressable>
          )}
        </>
      )}

      {/* --- Visualization (shortened run) --- */}
      <Text style={styles.sectionTitle}>דמיון מודרך (גרסה מקוצרת)</Text>
      <View style={styles.switchRow}>
        <Switch
          value={subGoal.useSharedEmbodiedCue}
          onValueChange={(value) => {
            persistSubGoalPatch({ useSharedEmbodiedCue: value });
          }}
        />
        <Text style={styles.fieldLabel}>השתמש בשפת הגוף המשותפת של המטרה הגדולה</Text>
      </View>
      {!subGoal.useSharedEmbodiedCue && (
        <View style={styles.card}>
          <Text style={styles.hint}>שפת גוף משלה לתת־המטרה הזאת. כל השדות רשות.</Text>
          <TextInput
            style={styles.textInput}
            value={subGoal.ownEmbodiedIdentityCue?.posture ?? ""}
            onChangeText={(text) => patchOwnEmbodiedCue({ posture: text.trim().length > 0 ? text : null })}
            textAlign="right"
            placeholder="תנוחה"
          />
          <TextInput
            style={styles.textInput}
            value={subGoal.ownEmbodiedIdentityCue?.facialExpression ?? ""}
            onChangeText={(text) => patchOwnEmbodiedCue({ facialExpression: text.trim().length > 0 ? text : null })}
            textAlign="right"
            placeholder="הבעת פנים"
          />
          <TextInput
            style={styles.textInput}
            value={subGoal.ownEmbodiedIdentityCue?.movementQuality ?? ""}
            onChangeText={(text) => patchOwnEmbodiedCue({ movementQuality: text.trim().length > 0 ? text : null })}
            textAlign="right"
            placeholder="איכות תנועה"
          />
          <TextInput
            style={styles.textInput}
            value={subGoal.ownEmbodiedIdentityCue?.breathingStyle ?? ""}
            onChangeText={(text) => patchOwnEmbodiedCue({ breathingStyle: text.trim().length > 0 ? text : null })}
            textAlign="right"
            placeholder="סגנון נשימה"
          />
          <TextInput
            style={styles.textInput}
            value={subGoal.ownEmbodiedIdentityCue?.physicalAnchor ?? ""}
            onChangeText={(text) => patchOwnEmbodiedCue({ physicalAnchor: text.trim().length > 0 ? text : null })}
            textAlign="right"
            placeholder="עוגן פיזי (רשות)"
          />
          <TextInput
            style={styles.textInput}
            value={subGoal.ownEmbodiedIdentityCue?.regulationAnchor ?? ""}
            onChangeText={(text) => patchOwnEmbodiedCue({ regulationAnchor: text.trim().length > 0 ? text : null })}
            textAlign="right"
            placeholder="עוגן ויסות (רשות)"
          />
        </View>
      )}

      <View style={styles.switchRow}>
        <Switch
          value={subGoal.useSharedAchievedStateMantra}
          onValueChange={(value) => {
            persistSubGoalPatch({ useSharedAchievedStateMantra: value });
          }}
        />
        <Text style={styles.fieldLabel}>השתמש במשפט מצב מושג המשותף של המטרה הגדולה</Text>
      </View>
      {!subGoal.useSharedAchievedStateMantra && (
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Switch
              value={subGoal.ownAchievedStateMantra?.enabled ?? false}
              onValueChange={(value) => patchOwnAchievedStateMantra({ enabled: value })}
            />
            <Text style={styles.fieldLabel}>הפעל משפט מצב מושג לתת־המטרה הזאת</Text>
          </View>
          {subGoal.ownAchievedStateMantra?.enabled && (
            <>
              <TextInput
                style={styles.textInput}
                value={subGoal.ownAchievedStateMantra?.text ?? ""}
                onChangeText={(text) => patchOwnAchievedStateMantra({ text: text.trim().length > 0 ? text : null })}
                textAlign="right"
                placeholder='לדוגמה: "השלמתי את תת־המטרה הזאת."'
              />
              <View style={[styles.chipColumn, styles.chipRow]}>
                {(["present", "past"] as AchievedStateMantraTense[]).map((tense) => (
                  <Pressable
                    key={tense}
                    style={[styles.chip, subGoal.ownAchievedStateMantra?.tense === tense && styles.chipSelected]}
                    onPress={() => patchOwnAchievedStateMantra({ tense })}
                  >
                    <Text style={styles.chipText}>{TENSE_LABELS[tense]}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      <Pressable
        style={[styles.button, styles.fullWidthButton]}
        onPress={() =>
          router.push({ pathname: "/life-manifest/visualize/[majorGoalId]", params: { majorGoalId: majorGoal.id, subGoalId: subGoal.id } })
        }
      >
        <Text style={styles.buttonText}>להתחיל דמיון (גרסה מקוצרת)</Text>
      </Pressable>

      {/* --- Journal --- */}
      <Text style={styles.sectionTitle}>יומן</Text>
      {journal.length === 0 && <Text style={styles.hint}>עדיין אין רשומות יומן לתת־המטרה הזאת.</Text>}
      {journal.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <Text style={styles.body}>{entry.kind === "sub_goal_completed" ? `השלמת תת־מטרה: ${entry.subGoalTitle}` : `השלמת יעד: ${entry.targetTitle}`}</Text>
          <Text style={styles.hint}>{new Date(entry.occurredAt).toLocaleString("he-IL")}</Text>
        </View>
      ))}

      {!embedded && (
        <Pressable style={styles.backButton} onPress={() => router.push({ pathname: "/life-manifest/[id]", params: { id: manifest.id } })}>
          <Text style={styles.backButtonText}>חזרה למניפסט</Text>
        </Pressable>
      )}
    </View>
  );

  const modals = (
    <>
      <Modal visible={linkPickerOpen} transparent animationType="fade" onRequestClose={() => setLinkPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>בחר ARC Goal לקישור</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {arcGoals.length === 0 && <Text style={styles.hint}>עדיין אין לך ARC Goal. אפשר ליצור אחד חדש.</Text>}
              {arcGoals.map((g) => (
                <Pressable key={g.id} style={styles.chip} onPress={() => handleLinkExisting(g)}>
                  <Text style={styles.chipText}>{g.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.actionButton} onPress={() => setLinkPickerOpen(false)}>
              <Text style={styles.actionButtonText}>ביטול</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmUnlink} transparent animationType="fade" onRequestClose={() => setConfirmUnlink(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>לנתק את הקישור ל-ARC Goal?</Text>
            <Text style={styles.body}>ה-ARC Goal עצמו לא יימחק.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={handleUnlink}>
                <Text style={styles.buttonText}>נתק</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmUnlink(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmDeleteTargetId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteTargetId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את היעד הזה?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.button, styles.modalButton, styles.deleteButton]}
                onPress={() => confirmDeleteTargetId && removeTarget(confirmDeleteTargetId)}
              >
                <Text style={styles.buttonText}>מחק</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteTargetId(null)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pendingCompletionConfirm} transparent animationType="fade" onRequestClose={() => setPendingCompletionConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{`כל היעדים הנדרשים הושלמו. האם לסמן את תת־המטרה '${subGoal.title}' כהושלמה?`}</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={completeSubGoalNow}>
                <Text style={styles.buttonText}>כן, סמן כהושלמה</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setPendingCompletionConfirm(false)}>
                <Text style={styles.actionButtonText}>לא כרגע</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={completionOffer !== null} transparent animationType="fade" onRequestClose={() => setCompletionOffer(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{completionOffer ? `סיימת את תת־המטרה: ${completionOffer.subGoalName}` : ""}</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={handleGoToNextSubGoal}>
                <Text style={styles.buttonText}>לעבור לתת־המטרה הבאה</Text>
              </Pressable>
            </View>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.button, styles.modalButton, styles.secondaryStyleButton]}
                onPress={() => {
                  setCompletionOffer(null);
                  router.push({ pathname: "/life-manifest/[id]", params: { id: manifest.id } });
                }}
              >
                <Text style={styles.buttonText}>לצפות בסיכום</Text>
              </Pressable>
            </View>
            <Pressable style={styles.actionButton} onPress={() => setCompletionOffer(null)}>
              <Text style={styles.actionButtonText}>להישאר בתת־המטרה הנוכחית</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );

  if (embedded) {
    return (
      <>
        {body}
        {modals}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>{body}</ScrollView>
      {modals}
    </SafeAreaView>
  );
}

function checkConditionMet(mode: SubGoalCompletionMode, targets: Target[]): boolean {
  if (mode === "all_targets") return allRequiredTargetsComplete(targets);
  if (mode === "progress_threshold") return computeSubGoalProgress(targets) >= 100;
  return true;
}

function TargetCard(props: {
  target: Target;
  subGoal: SubGoal;
  arcGoals: ArcGoal[];
  onPatch: (patch: Partial<Target>) => void;
  onDelete: () => void;
  onComplete: () => void;
  onOpenArcGoal: (arcGoalId: string) => void;
  onCreateArcGoalForTarget: () => void;
}) {
  const { target, subGoal, arcGoals, onPatch, onDelete, onComplete, onOpenArcGoal, onCreateArcGoalForTarget } = props;
  const [addToJournalHint, setAddToJournalHint] = useState(false);
  const effectiveArcGoalId = resolveEffectiveTargetArcGoalId(target, subGoal);
  const effectiveArcGoal = effectiveArcGoalId ? arcGoals.find((g) => g.id === effectiveArcGoalId) ?? null : null;

  return (
    <View style={styles.card}>
      <TextInput style={styles.textInput} value={target.title} onChangeText={(text) => onPatch({ title: text })} textAlign="right" placeholder="שם היעד" />
      <TextInput
        style={styles.textInput}
        value={target.description ?? ""}
        onChangeText={(text) => onPatch({ description: text.trim().length > 0 ? text : null })}
        textAlign="right"
        placeholder="תיאור (רשות)"
        multiline
      />
      <TextInput
        style={styles.textInput}
        value={target.successMeasurement ?? ""}
        onChangeText={(text) => onPatch({ successMeasurement: text.trim().length > 0 ? text : null })}
        textAlign="right"
        placeholder="מדד הצלחה (רשות)"
      />
      <View style={styles.rowGap}>
        <TextInput
          style={[styles.textInput, styles.smallInput]}
          value={target.quantity !== null ? String(target.quantity) : ""}
          onChangeText={(text) => onPatch({ quantity: text.trim().length > 0 ? Number(text) : null })}
          textAlign="right"
          placeholder="כמות"
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.textInput, styles.smallInput]}
          value={target.unit ?? ""}
          onChangeText={(text) => onPatch({ unit: text.trim().length > 0 ? text : null })}
          textAlign="right"
          placeholder="יחידה"
        />
      </View>
      <Text style={styles.fieldLabel}>תאריך יעד (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.textInput}
        value={target.targetDate ?? ""}
        onChangeText={(text) => {
          onPatch({ targetDate: text.trim().length > 0 ? text : null });
          setAddToJournalHint(false);
        }}
        textAlign="right"
        placeholder="2025-04-01"
      />
      {target.targetDate ? (
        <Text style={styles.hint}>✓ ביומן/לוח השנה (יש תאריך יעד)</Text>
      ) : (
        <Pressable style={styles.actionButton} onPress={() => setAddToJournalHint(true)}>
          <Text style={styles.actionButtonText}>להוסיף ליומן</Text>
        </Pressable>
      )}
      {addToJournalHint && !target.targetDate && <Text style={styles.hint}>יש להזין תאריך יעד למעלה כדי להוסיף את היעד ליומן/לוח השנה.</Text>}
      <Text style={styles.fieldLabel}>{`התקדמות נוכחית: ${target.currentProgress}%`}</Text>
      <TextInput
        style={styles.textInput}
        value={String(target.currentProgress)}
        onChangeText={(text) => {
          const value = Math.max(0, Math.min(100, Number(text) || 0));
          onPatch({ currentProgress: value });
        }}
        textAlign="right"
        keyboardType="numeric"
      />
      <Text style={styles.fieldLabel}>סטטוס</Text>
      <View style={[styles.chipColumn, styles.chipRow]}>
        {TARGET_STATUSES.map((s) => (
          <Pressable key={s} style={[styles.chip, target.status === s && styles.chipSelected]} onPress={() => onPatch({ status: s })}>
            <Text style={styles.chipText}>{TARGET_STATUS_LABELS[s]}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>ARC Goal</Text>
      <View style={[styles.chipColumn, styles.chipRow]}>
        <Pressable style={[styles.chip, target.arcGoalLinkMode === "inherited" && styles.chipSelected]} onPress={() => onPatch({ arcGoalLinkMode: "inherited" })}>
          <Text style={styles.chipText}>ירושה מתת־המטרה</Text>
        </Pressable>
        <Pressable style={[styles.chip, target.arcGoalLinkMode === "own" && styles.chipSelected]} onPress={() => onPatch({ arcGoalLinkMode: "own" })}>
          <Text style={styles.chipText}>ARC Goal נפרד</Text>
        </Pressable>
      </View>
      {target.arcGoalLinkMode === "own" && (
        <View style={[styles.chipColumn, styles.chipRow]}>
          {arcGoals.map((g) => (
            <Pressable key={g.id} style={[styles.chip, target.connectedArcGoalId === g.id && styles.chipSelected]} onPress={() => onPatch({ connectedArcGoalId: g.id })}>
              <Text style={styles.chipText}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {effectiveArcGoal ? (
        <Pressable style={styles.actionButton} onPress={() => onOpenArcGoal(effectiveArcGoal.id)}>
          <Text style={styles.actionButtonText}>לעבור ל־ARC Goal</Text>
        </Pressable>
      ) : (
        <View>
          <Text style={styles.hint}>ליעד הזה עדיין אין ARC Goal מקושר.</Text>
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={() => onPatch({ arcGoalLinkMode: "own" })}>
              <Text style={styles.actionButtonText}>לקשר ARC Goal קיים</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onCreateArcGoalForTarget}>
              <Text style={styles.actionButtonText}>ליצור ARC Goal חדש</Text>
            </Pressable>
          </View>
        </View>
      )}
      <View style={styles.switchRow}>
        <Switch value={target.remindersEnabled} onValueChange={(value) => onPatch({ remindersEnabled: value })} />
        <Text style={styles.fieldLabel}>תזכורות למועד היעד (רשות)</Text>
      </View>
      <View style={styles.actionsRow}>
        {target.status !== "completed" && (
          <Pressable style={styles.actionButton} onPress={onComplete}>
            <Text style={styles.actionButtonText}>השלם יעד</Text>
          </Pressable>
        )}
        <Pressable style={styles.actionButton} onPress={onDelete}>
          <Text style={[styles.actionButtonText, styles.deleteText]}>מחק יעד</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  embeddedLoading: { height: 40 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 8 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  fieldLabel: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginBottom: 12 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  actionsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12, marginTop: 8 },
  rowGap: { flexDirection: "row-reverse", gap: 8 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 8 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryStyleButton: { backgroundColor: "#666" },
  fullWidthButton: { marginTop: 12 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 6 },
  smallInput: { flex: 1 },
  chipColumn: { gap: 8, marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center", marginBottom: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  deleteText: { color: "#c0392b" },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 12 },
  modalButton: { flex: 0 },
  deleteButton: { backgroundColor: "#c0392b" },
});

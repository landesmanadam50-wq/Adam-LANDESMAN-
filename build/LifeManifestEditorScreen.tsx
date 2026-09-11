import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getLifeManifest, loadArcGoals, loadLifeManifestTargets, upsertLifeManifest } from "../data/storage.ts";
import {
  createEmptyMajorGoal,
  createEmptySubGoal,
  deleteMajorGoalFromLifeManifest,
  deleteSubGoalFromMajorGoal,
  generateMajorGoalId,
  generateSubGoalId,
  isMajorGoalQuestionnaireComplete,
  reorderSubGoals,
  resolveActiveSubGoal,
  upsertMajorGoalInLifeManifest,
  upsertSubGoalInMajorGoal,
} from "../arc/lifeManifest.ts";
import type { AchievedStateMantraTense, EmbodiedIdentityCue, LifeManifest, LifeManifestEntityStatus, MajorGoal, SubGoal, Target } from "../arc/lifeManifest.ts";
import type { ArcGoal } from "../arc/types.ts";
import CollapsibleSection from "./CollapsibleSection.tsx";
import { LifeManifestSubGoalPanel } from "./LifeManifestSubGoalPanel.tsx";

/**
 * Life Manifest task: ONE screen editing ONE LifeManifest -- an overview
 * of its Major Goals (create/open/delete), and, once one is selected,
 * the 9-question Hebrew questionnaire (spec section 2) plus its
 * repeatable, editable/reorderable Sub-goal list.
 *
 * Single-page Life Manifest BUILD task: the Major Goal questionnaire was
 * still a step-by-step wizard ("המשך"/"חזור" between each of its 9
 * questions), and managing a Sub-goal's ARC Goal link/dates/Targets
 * meant leaving for build/LifeManifestSubGoalScreen.tsx's own separate
 * route -- "still divided across separate screens" even after the
 * Phase 3 BUILD screens were unified. Both are fixed here the same way
 * Phase 3 fixed ArcBuild/ArcGoal/Mini ARC: one scrollable page per Major
 * Goal, CollapsibleSection groups (build/CollapsibleSection.tsx) instead
 * of step gating, optional/advanced sections collapsed by default, and
 * every Sub-goal's own full management panel
 * (build/LifeManifestSubGoalPanel.tsx, embedded=true) nested right
 * inside its own card -- no more hopping to a separate screen to link an
 * ARC Goal or add a Target while building. The dedicated
 * /life-manifest/sub-goal/[subGoalId] route is untouched, still needed
 * for a notification/journal/dashboard entry point (see that panel's
 * own doc).
 *
 * Every field still persists immediately on every change
 * (persistManifest, called from patchMajorGoal on every keystroke) --
 * "save progress after every section... do not require completion of
 * the entire questionnaire in one session" (spec section 2) is
 * preserved exactly as before; the one persistent "שמור וחזרה" button
 * at the bottom is an explicit, reassuring close-out action on top of
 * that guarantee, never a replacement for it -- there is no "unsaved
 * draft" state a trainee could lose by not pressing it.
 *
 * Visualization (the guided imagery flow itself, at
 * /life-manifest/visualize/[majorGoalId]) is a separate LIVE experience,
 * deliberately untouched by this task -- only its entry points stay on
 * this page, exactly as before.
 */

const STATUS_LABELS: Record<LifeManifestEntityStatus, string> = {
  draft: "טיוטה",
  active: "פעיל",
  completed: "הושלם",
  paused: "הושהה",
  archived: "הועבר לארכיון",
};
const STATUSES: LifeManifestEntityStatus[] = ["draft", "active", "completed", "paused", "archived"];

const TENSE_LABELS: Record<AchievedStateMantraTense, string> = { present: "הווה (זהות קיימת)", past: "עבר (אבן דרך שהושגה)" };

export default function LifeManifestEditorScreen() {
  const { id, majorGoalId: initialMajorGoalId } = useLocalSearchParams<{ id: string; majorGoalId?: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "editing">("loading");
  const [manifest, setManifest] = useState<LifeManifest | null>(null);
  const [selectedMajorGoalId, setSelectedMajorGoalId] = useState<string | null>(initialMajorGoalId ?? null);
  const [creatingMajorGoal, setCreatingMajorGoal] = useState(false);
  const [newMajorGoalTitle, setNewMajorGoalTitle] = useState("");
  const [confirmDeleteMajorGoalId, setConfirmDeleteMajorGoalId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [arcGoals, setArcGoals] = useState<ArcGoal[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      // Bug-fix task: a missing/undefined route param used to leave
      // `status` stuck at "loading" forever (the early return skipped
      // the only place that ever set it) -- a blank screen bug just as
      // real as an unhandled exception. Route straight to the recovery
      // state instead.
      setStatus("notFound");
      return;
    }
    Promise.all([getLifeManifest(id), loadArcGoals(), loadLifeManifestTargets()])
      .then(([existing, allArcGoals, allTargets]) => {
        if (cancelled) return;
        if (!existing) {
          setStatus("notFound");
          return;
        }
        setManifest(existing);
        setArcGoals(allArcGoals);
        setTargets(allTargets);
        setStatus("editing");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[LifeManifestEditorScreen] Failed to load -- showing the recovery state instead of hanging.", error);
        setStatus("notFound");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const persistManifest = useCallback((updated: LifeManifest) => {
    setManifest(updated);
    upsertLifeManifest(updated).catch(() => {
      setSaveError("אירעה שגיאה בשמירה. הנתונים נשמרו במסך אך ייתכן שלא נשמרו לצמיתות -- כדאי לנסות שוב.");
    });
  }, []);

  function patchMajorGoal(goalId: string, patch: Partial<MajorGoal>) {
    if (!manifest) return;
    const current = manifest.majorGoals.find((g) => g.id === goalId);
    if (!current) return;
    const updatedGoal: MajorGoal = { ...current, ...patch, updatedAt: new Date().toISOString() };
    persistManifest(upsertMajorGoalInLifeManifest(manifest, updatedGoal));
  }

  /** Visualization task: patches ONE field on the Major Goal's own embodiedIdentityCue -- all fields optional/editable. */
  function patchEmbodiedCue(goalId: string, patch: Partial<EmbodiedIdentityCue>) {
    if (!manifest) return;
    const current = manifest.majorGoals.find((g) => g.id === goalId);
    if (!current) return;
    patchMajorGoal(goalId, { embodiedIdentityCue: { ...current.embodiedIdentityCue, ...patch } });
  }

  async function handleCreateMajorGoal() {
    const trimmed = newMajorGoalTitle.trim();
    if (!trimmed || !manifest) return;
    const now = new Date().toISOString();
    const goal = createEmptyMajorGoal(generateMajorGoalId(), trimmed, now);
    persistManifest(upsertMajorGoalInLifeManifest(manifest, goal));
    setCreatingMajorGoal(false);
    setNewMajorGoalTitle("");
    setSelectedMajorGoalId(goal.id);
  }

  function handleDeleteMajorGoal(goalId: string) {
    if (!manifest) return;
    persistManifest(deleteMajorGoalFromLifeManifest(manifest, goalId));
    setConfirmDeleteMajorGoalId(null);
    if (selectedMajorGoalId === goalId) setSelectedMajorGoalId(null);
  }

  function addSubGoal(goalId: string) {
    if (!manifest) return;
    const current = manifest.majorGoals.find((g) => g.id === goalId);
    if (!current) return;
    const subGoal = createEmptySubGoal(generateSubGoalId(), "", new Date().toISOString());
    patchMajorGoal(goalId, { subGoals: upsertSubGoalInMajorGoal(current, subGoal).subGoals });
  }

  function updateSubGoal(goalId: string, subGoal: SubGoal, patch: Partial<SubGoal>) {
    if (!manifest) return;
    const current = manifest.majorGoals.find((g) => g.id === goalId);
    if (!current) return;
    const updated = { ...subGoal, ...patch, updatedAt: new Date().toISOString() };
    patchMajorGoal(goalId, { subGoals: upsertSubGoalInMajorGoal(current, updated).subGoals });
  }

  function removeSubGoal(goalId: string, subGoalId: string) {
    if (!manifest) return;
    const current = manifest.majorGoals.find((g) => g.id === goalId);
    if (!current) return;
    patchMajorGoal(goalId, { subGoals: deleteSubGoalFromMajorGoal(current, subGoalId).subGoals });
  }

  function moveSubGoal(goalId: string, subGoalId: string, direction: "up" | "down") {
    if (!manifest) return;
    const current = manifest.majorGoals.find((g) => g.id === goalId);
    if (!current) return;
    patchMajorGoal(goalId, { subGoals: reorderSubGoals(current, subGoalId, direction).subGoals });
  }

  /** New requirement: one persistent primary Save button -- every field already auto-persists on change, so this simply forces a final persist of whatever is currently on screen and closes back out to the Major Goals overview. Never the only thing standing between a trainee's edits and storage. */
  function handleSaveAndClose() {
    if (!manifest || !selectedGoal) return;
    persistManifest(manifest);
    setSelectedMajorGoalId(null);
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !manifest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא ניתן לטעון את המניפסט.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/life-manifest")}>
            <Text style={styles.buttonText}>חזרה לרשימה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const selectedGoal = manifest.majorGoals.find((g) => g.id === selectedMajorGoalId) ?? null;

  // -------------------------------------------------------------------
  // Major Goals overview -- no goal selected yet.
  // -------------------------------------------------------------------
  if (!selectedGoal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>מטרות גדולות במניפסט</Text>
          {saveError && <Text style={styles.errorText}>{saveError}</Text>}

          {manifest.majorGoals.length === 0 && <Text style={styles.hint}>עדיין אין כאן מטרה גדולה. אפשר להוסיף אחת למטה.</Text>}

          {manifest.majorGoals.map((goal) => (
            <View key={goal.id} style={styles.goalRowColumn}>
              <View style={styles.goalRow}>
                <Pressable style={styles.goalButton} onPress={() => setSelectedMajorGoalId(goal.id)}>
                  <View style={styles.goalTitleRow}>
                    {!isMajorGoalQuestionnaireComplete(goal) && (
                      <View style={styles.draftBadge}>
                        <Text style={styles.draftBadgeText}>טיוטה</Text>
                      </View>
                    )}
                    <Text style={styles.goalButtonText}>{goal.title || "מטרה ללא כותרת"}</Text>
                  </View>
                  <Text style={styles.subText}>{`${goal.subGoals.length} תתי־מטרות`}</Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteMajorGoalId(goal.id)}>
                  <Text style={[styles.actionButtonText, styles.deleteText]}>מחק</Text>
                </Pressable>
              </View>

              {/* Bug-fix task, requirements 3-5: the Major Goal's Sub-goals
                  and a visible visualization entry point, right on the
                  details screen reached by a single tap on the manifest
                  card -- never buried behind the full questionnaire wizard. */}
              {goal.subGoals.length > 0 && (
                <View style={styles.subGoalListCard}>
                  {goal.subGoals.map((subGoal, index) => (
                    <Text key={subGoal.id} style={styles.subGoalListItem}>{`${index + 1}. ${subGoal.title || "תת־מטרה ללא כותרת"}`}</Text>
                  ))}
                </View>
              )}

              <ActiveSubGoalDashboard goal={goal} arcGoals={arcGoals} targets={targets} />

              <Pressable
                style={[styles.button, styles.fullWidthButton]}
                onPress={() => router.push({ pathname: "/life-manifest/visualize/[majorGoalId]", params: { majorGoalId: goal.id } })}
              >
                <Text style={styles.buttonText}>להתחיל את דמיון המניפסט</Text>
              </Pressable>
            </View>
          ))}

          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setCreatingMajorGoal(true)}>
            <Text style={styles.buttonText}>+ הוסף מטרה גדולה</Text>
          </Pressable>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>חזור לרשימת המניפסטים</Text>
          </Pressable>
        </ScrollView>

        <Modal visible={creatingMajorGoal} transparent animationType="fade" onRequestClose={() => setCreatingMajorGoal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>מהי המטרה הגדולה שהיית רוצה להגשים?</Text>
              <TextInput
                style={styles.textInput}
                value={newMajorGoalTitle}
                onChangeText={setNewMajorGoalTitle}
                textAlign="right"
                autoFocus
                multiline
              />
              <View style={styles.modalButtonRow}>
                <Pressable style={[styles.button, styles.modalButton]} disabled={newMajorGoalTitle.trim().length === 0} onPress={handleCreateMajorGoal}>
                  <Text style={styles.buttonText}>צור</Text>
                </Pressable>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => {
                    setCreatingMajorGoal(false);
                    setNewMajorGoalTitle("");
                  }}
                >
                  <Text style={styles.actionButtonText}>ביטול</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={confirmDeleteMajorGoalId !== null} transparent animationType="fade" onRequestClose={() => setConfirmDeleteMajorGoalId(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>למחוק את המטרה הגדולה הזאת?</Text>
              <Text style={styles.body}>כל תתי־המטרות שלה יימחקו יחד איתה. הפעולה אינה הפיכה.</Text>
              <View style={styles.modalButtonRow}>
                <Pressable
                  style={[styles.button, styles.modalButton, styles.deleteButton]}
                  onPress={() => confirmDeleteMajorGoalId && handleDeleteMajorGoal(confirmDeleteMajorGoalId)}
                >
                  <Text style={styles.buttonText}>מחק</Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteMajorGoalId(null)}>
                  <Text style={styles.actionButtonText}>ביטול</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------
  // Single-page questionnaire + Sub-goal management for the selected
  // Major Goal -- one scrollable page, CollapsibleSection groups, no
  // "המשך"/"הבא" navigation between them.
  // -------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{selectedGoal.title || "מטרה ללא כותרת"}</Text>
        <Text style={styles.title}>עריכת מטרה גדולה</Text>
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <CollapsibleSection title="פרטי הבסיס" defaultExpanded>
          <View style={styles.sectionBody}>
            <Text style={styles.question}>מהי המטרה הגדולה שהיית רוצה להגשים?</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.title}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { title: text })}
              textAlign="right"
              multiline
            />
            <Text style={styles.question}>למה המטרה הזאת חשובה לך? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.why ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { why: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
            <Text style={styles.question}>איזה ערך היא מבטאת? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.value ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { value: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="זהות עתידית">
          <View style={styles.sectionBody}>
            <Text style={styles.question}>מי תהיה כשתגשים אותה? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.futureIdentity ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { futureIdentity: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
            <Text style={styles.question}>איך החיים שלך ייראו כשהמטרה תושג? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.futureLifeDescription ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { futureLifeDescription: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
          </View>
        </CollapsibleSection>

        <CollapsibleSection title={`תתי־מטרות (${selectedGoal.subGoals.length})`} defaultExpanded>
          <View style={styles.sectionBody}>
            <Text style={styles.hint}>אפשר להוסיף כמה תתי־מטרות שרוצים, לערוך את הטקסט שלהן, ולשנות את הסדר בחצים.</Text>
            {selectedGoal.subGoals.length === 0 && <Text style={styles.hint}>עדיין אין תתי־מטרות. אפשר להוסיף אחת למטה.</Text>}
            {selectedGoal.subGoals.map((subGoal, index) => (
              <View key={subGoal.id} style={styles.mappingCard}>
                <Text style={styles.mappingLabel}>{`תת־מטרה ${index + 1} · ${subGoal.status}`}</Text>
                <Text style={styles.fieldLabel}>כותרת</Text>
                <TextInput
                  style={styles.textInput}
                  value={subGoal.title}
                  onChangeText={(text) => updateSubGoal(selectedGoal.id, subGoal, { title: text })}
                  textAlign="right"
                />
                <Text style={styles.fieldLabel}>תיאור (רשות)</Text>
                <TextInput
                  style={styles.textInput}
                  value={subGoal.description ?? ""}
                  onChangeText={(text) => updateSubGoal(selectedGoal.id, subGoal, { description: text.trim().length > 0 ? text : null })}
                  textAlign="right"
                  multiline
                />
                <View style={styles.reorderRow}>
                  <Pressable
                    style={[styles.actionButton, index === 0 && styles.buttonDisabled]}
                    disabled={index === 0}
                    onPress={() => moveSubGoal(selectedGoal.id, subGoal.id, "up")}
                  >
                    <Text style={styles.actionButtonText}>למעלה</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, index === selectedGoal.subGoals.length - 1 && styles.buttonDisabled]}
                    disabled={index === selectedGoal.subGoals.length - 1}
                    onPress={() => moveSubGoal(selectedGoal.id, subGoal.id, "down")}
                  >
                    <Text style={styles.actionButtonText}>למטה</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => removeSubGoal(selectedGoal.id, subGoal.id)}>
                    <Text style={[styles.actionButtonText, styles.deleteText]}>מחק תת־מטרה</Text>
                  </Pressable>
                </View>

                {/* Single-page Life Manifest BUILD task: the Sub-goal's own
                    full management panel (ARC Goal linking, dates, Targets,
                    completion, its own visualization overrides, journal) --
                    nested here, collapsed by default (advanced/ongoing
                    management, not a core questionnaire field), so it never
                    requires leaving this page. */}
                <CollapsibleSection title="ניהול תת־המטרה (ARC Goal, יעדים, תאריכים)">
                  <View style={styles.sectionBody}>
                    <LifeManifestSubGoalPanel subGoalId={subGoal.id} embedded />
                  </View>
                </CollapsibleSection>
              </View>
            ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => addSubGoal(selectedGoal.id)}>
              <Text style={styles.buttonText}>+ הוסף תת־מטרה</Text>
            </Pressable>
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="יכולות ומכשולים">
          <View style={styles.sectionBody}>
            <Text style={styles.question}>אילו יכולות או איכויות יהיה עליך לפתח? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.capabilitiesNeeded ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { capabilitiesNeeded: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
            <Text style={styles.question}>מה עלול להפריע בדרך? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.obstacles ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { obstacles: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
            <Text style={styles.question}>אילו מצבים פנימיים יתמכו בך? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.supportiveInternalStates ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { supportiveInternalStates: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
            <Text style={styles.question}>מה יהיה הסימן הממשי לכך שהמטרה הושגה? (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.realWorldSign ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { realWorldSign: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="סטטוס" defaultExpanded>
          <View style={styles.sectionBody}>
            <View style={[styles.chipColumn, styles.chipRow]}>
              {STATUSES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, selectedGoal.status === s && styles.chipSelected]}
                  onPress={() => patchMajorGoal(selectedGoal.id, { status: s })}
                >
                  <Text style={styles.chipText}>{STATUS_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>
            {!isMajorGoalQuestionnaireComplete(selectedGoal) && (
              <Text style={styles.hint}>המטרה עדיין מוצגת כטיוטה עד שכל השאלות ותת־מטרה אחת לפחות ימולאו. אפשר לחזור ולהשלים בכל שלב.</Text>
            )}
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="שפת גוף מנצחת">
          <View style={styles.sectionBody}>
            <Text style={styles.hint}>שפת הגוף שתאמץ בדמיון המודרך כשהמטרה הגדולה כבר הושגה. כל השדות רשות.</Text>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.embodiedIdentityCue.posture ?? ""}
              onChangeText={(text) => patchEmbodiedCue(selectedGoal.id, { posture: text.trim().length > 0 ? text : null })}
              textAlign="right"
              placeholder="תנוחה"
            />
            <TextInput
              style={styles.textInput}
              value={selectedGoal.embodiedIdentityCue.facialExpression ?? ""}
              onChangeText={(text) => patchEmbodiedCue(selectedGoal.id, { facialExpression: text.trim().length > 0 ? text : null })}
              textAlign="right"
              placeholder="הבעת פנים"
            />
            <TextInput
              style={styles.textInput}
              value={selectedGoal.embodiedIdentityCue.movementQuality ?? ""}
              onChangeText={(text) => patchEmbodiedCue(selectedGoal.id, { movementQuality: text.trim().length > 0 ? text : null })}
              textAlign="right"
              placeholder="איכות תנועה"
            />
            <TextInput
              style={styles.textInput}
              value={selectedGoal.embodiedIdentityCue.breathingStyle ?? ""}
              onChangeText={(text) => patchEmbodiedCue(selectedGoal.id, { breathingStyle: text.trim().length > 0 ? text : null })}
              textAlign="right"
              placeholder="סגנון נשימה"
            />
            <TextInput
              style={styles.textInput}
              value={selectedGoal.embodiedIdentityCue.physicalAnchor ?? ""}
              onChangeText={(text) => patchEmbodiedCue(selectedGoal.id, { physicalAnchor: text.trim().length > 0 ? text : null })}
              textAlign="right"
              placeholder="עוגן פיזי (רשות)"
            />
            <TextInput
              style={styles.textInput}
              value={selectedGoal.embodiedIdentityCue.regulationAnchor ?? ""}
              onChangeText={(text) => patchEmbodiedCue(selectedGoal.id, { regulationAnchor: text.trim().length > 0 ? text : null })}
              textAlign="right"
              placeholder="עוגן ויסות (רשות)"
            />
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="משפט מצב מושג">
          <View style={styles.sectionBody}>
            <View style={styles.switchRow}>
              <Switch
                value={selectedGoal.achievedStateMantra.enabled}
                onValueChange={(value) =>
                  patchMajorGoal(selectedGoal.id, { achievedStateMantra: { ...selectedGoal.achievedStateMantra, enabled: value } })
                }
              />
              <Text style={styles.fieldLabel}>הפעל משפט מצב מושג</Text>
            </View>
            {selectedGoal.achievedStateMantra.enabled && (
              <>
                <TextInput
                  style={styles.textInput}
                  value={selectedGoal.achievedStateMantra.text ?? ""}
                  onChangeText={(text) =>
                    patchMajorGoal(selectedGoal.id, {
                      achievedStateMantra: { ...selectedGoal.achievedStateMantra, text: text.trim().length > 0 ? text : null },
                    })
                  }
                  textAlign="right"
                  placeholder='לדוגמה: "אני מוזיקאי עם מאה אלף עוקבים."'
                />
                <View style={[styles.chipColumn, styles.chipRow]}>
                  {(["present", "past"] as AchievedStateMantraTense[]).map((tense) => (
                    <Pressable
                      key={tense}
                      style={[styles.chip, selectedGoal.achievedStateMantra.tense === tense && styles.chipSelected]}
                      onPress={() =>
                        patchMajorGoal(selectedGoal.id, { achievedStateMantra: { ...selectedGoal.achievedStateMantra, tense } })
                      }
                    >
                      <Text style={styles.chipText}>{TENSE_LABELS[tense]}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
        </CollapsibleSection>

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/life-manifest/visualize/[majorGoalId]", params: { majorGoalId: selectedGoal.id } })}
        >
          <Text style={styles.buttonText}>להתחיל דמיון מודרך</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.primarySaveButton, styles.fullWidthButton]} onPress={handleSaveAndClose}>
          <Text style={styles.buttonText}>שמור וחזרה למטרות הגדולות</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Sub-goal↔ARC Goal connection task, spec section 8: "Inside the Life
 * Manifest, show: current active Sub-goal; its linked ARC Goal;
 * current Targets; upcoming deadlines... Provide a prominent button:
 * 'להמשיך ל-ARC Goal של תת־המטרה הפעילה'." Shown per Major Goal on the
 * overview screen -- a sibling of its own Pressable card (never nested
 * inside one, so its own button doesn't fight the card's own tap
 * target).
 */
function ActiveSubGoalDashboard(props: { goal: MajorGoal; arcGoals: ArcGoal[]; targets: Target[] }) {
  const { goal, arcGoals, targets } = props;
  const active = resolveActiveSubGoal(goal);
  if (!active) return null;

  const linkedArcGoal = active.connectedArcGoalId ? arcGoals.find((g) => g.id === active.connectedArcGoalId) ?? null : null;
  const subGoalTargets = targets.filter((t) => t.subGoalId === active.id);
  const upcoming = [
    ...(active.deadline ? [`תת־המטרה: ${active.deadline}`] : []),
    ...subGoalTargets.filter((t) => t.targetDate).map((t) => `${t.title}: ${t.targetDate}`),
  ];

  return (
    <View style={styles.dashboardCard}>
      <Text style={styles.dashboardText}>{`תת־המטרה הפעילה: ${active.title || "ללא כותרת"}`}</Text>
      <Text style={styles.dashboardText}>{`יעדים: ${subGoalTargets.length}`}</Text>
      {upcoming.length > 0 && <Text style={styles.dashboardText}>{`מועדים קרובים: ${upcoming.join(" · ")}`}</Text>}
      {linkedArcGoal ? (
        <Pressable
          style={styles.actionButton}
          onPress={() => router.push({ pathname: "/goals/[id]", params: { id: linkedArcGoal.id } })}
        >
          <Text style={styles.actionButtonText}>להמשיך ל־ARC Goal של תת־המטרה הפעילה</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.actionButton}
          onPress={() => router.push({ pathname: "/life-manifest/sub-goal/[subGoalId]", params: { subGoalId: active.id } })}
        >
          <Text style={styles.actionButtonText}>לקשר ARC Goal לתת־המטרה הפעילה</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8, marginTop: 8 },
  fieldLabel: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginBottom: 12 },
  sectionBody: { padding: 14, gap: 4 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 12, marginBottom: 8 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  primarySaveButton: { backgroundColor: "#1a6b4a" },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 4 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 8 },
  chipColumn: { gap: 8, marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center" },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  mappingCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 16 },
  mappingLabel: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  reorderRow: { flexDirection: "row-reverse", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  deleteText: { color: "#c0392b", fontSize: 14 },
  goalRowColumn: { marginBottom: 12 },
  goalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 12,
  },
  goalButton: { flex: 1 },
  goalTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  goalButtonText: { fontSize: 17, fontWeight: "600", textAlign: "right", color: "#0a7ea4", flexShrink: 1 },
  subText: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 4 },
  draftBadge: { backgroundColor: "#E6F4FE", borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  draftBadgeText: { fontSize: 12, color: "#0a7ea4", fontWeight: "600" },
  subGoalListCard: { backgroundColor: "#f7fbfd", borderRadius: 8, padding: 10, marginTop: 8 },
  subGoalListItem: { fontSize: 13, textAlign: "right", color: "#333", marginBottom: 2 },
  dashboardCard: { backgroundColor: "#f7fbfd", borderRadius: 8, padding: 10, marginTop: 8 },
  dashboardText: { fontSize: 13, textAlign: "right", color: "#333", marginBottom: 4 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right" },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0 },
  deleteButton: { backgroundColor: "#c0392b" },
});

import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import type { LifeManifest, LifeManifestEntityStatus, MajorGoal, SubGoal, Target } from "../arc/lifeManifest.ts";
import type { ArcGoal } from "../arc/types.ts";

/**
 * Life Manifest task: ONE screen editing ONE LifeManifest -- an overview
 * of its Major Goals (create/open/delete), and, once one is selected,
 * the 9-question Hebrew questionnaire (spec section 2) plus its
 * repeatable, editable/reorderable Sub-goal list. Mirrors
 * build/ArcGoalEditorScreen.tsx's step-wizard shape, with one deliberate
 * difference: every step persists immediately (upsertLifeManifest on
 * every patch, not only at a final "save" step) -- "save progress after
 * every section... do not require completion of the entire
 * questionnaire in one session" (spec section 2) means there is no
 * separate save step at all; the trainee can navigate away at any point
 * and resume exactly where they left off (list screen's "טיוטה" badge,
 * isLifeManifestDraft/isMajorGoalQuestionnaireComplete).
 *
 * Visualization (embodied identity cue, Achieved-State Mantra, the
 * guided imagery flow), gratitude, Targets, Scheduled Actions, and ARC
 * Link integration are later phases of this feature (see the approved
 * plan) -- deliberately not present on this screen yet.
 */

type MajorGoalStep =
  | "title"
  | "why"
  | "value"
  | "futureIdentity"
  | "futureLifeDescription"
  | "subGoals"
  | "capabilitiesNeeded"
  | "obstacles"
  | "supportiveInternalStates"
  | "realWorldSign"
  | "review";

const STEP_ORDER: MajorGoalStep[] = [
  "title",
  "why",
  "value",
  "futureIdentity",
  "futureLifeDescription",
  "subGoals",
  "capabilitiesNeeded",
  "obstacles",
  "supportiveInternalStates",
  "realWorldSign",
  "review",
];

const STEP_TITLES: Record<MajorGoalStep, string> = {
  title: "מהי המטרה הגדולה שהיית רוצה להגשים?",
  why: "למה המטרה הזאת חשובה לך?",
  value: "איזה ערך היא מבטאת?",
  futureIdentity: "מי תהיה כשתגשים אותה?",
  futureLifeDescription: "איך החיים שלך ייראו כשהמטרה תושג?",
  subGoals: "אילו תתי־מטרות יובילו אליה?",
  capabilitiesNeeded: "אילו יכולות או איכויות יהיה עליך לפתח?",
  obstacles: "מה עלול להפריע בדרך?",
  supportiveInternalStates: "אילו מצבים פנימיים יתמכו בך?",
  realWorldSign: "מה יהיה הסימן הממשי לכך שהמטרה הושגה?",
  review: "סיכום",
};

/** Optional free-text questions -- only "title" is required, matching isMajorGoalQuestionnaireComplete/createEmptyMajorGoal. */
const OPTIONAL_TEXT_STEPS: MajorGoalStep[] = ["why", "value", "futureIdentity", "futureLifeDescription", "capabilitiesNeeded", "obstacles", "supportiveInternalStates", "realWorldSign"];

const TEXT_STEP_FIELDS: Partial<Record<MajorGoalStep, keyof MajorGoal>> = {
  why: "why",
  value: "value",
  futureIdentity: "futureIdentity",
  futureLifeDescription: "futureLifeDescription",
  capabilitiesNeeded: "capabilitiesNeeded",
  obstacles: "obstacles",
  supportiveInternalStates: "supportiveInternalStates",
  realWorldSign: "realWorldSign",
};

const STATUS_LABELS: Record<LifeManifestEntityStatus, string> = {
  draft: "טיוטה",
  active: "פעיל",
  completed: "הושלם",
  paused: "הושהה",
  archived: "הועבר לארכיון",
};
const STATUSES: LifeManifestEntityStatus[] = ["draft", "active", "completed", "paused", "archived"];

export default function LifeManifestEditorScreen() {
  const { id, majorGoalId: initialMajorGoalId } = useLocalSearchParams<{ id: string; majorGoalId?: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "editing">("loading");
  const [manifest, setManifest] = useState<LifeManifest | null>(null);
  const [selectedMajorGoalId, setSelectedMajorGoalId] = useState<string | null>(initialMajorGoalId ?? null);
  const [step, setStep] = useState<MajorGoalStep>("why");
  const [creatingMajorGoal, setCreatingMajorGoal] = useState(false);
  const [newMajorGoalTitle, setNewMajorGoalTitle] = useState("");
  const [confirmDeleteMajorGoalId, setConfirmDeleteMajorGoalId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [arcGoals, setArcGoals] = useState<ArcGoal[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    Promise.all([getLifeManifest(id), loadArcGoals(), loadLifeManifestTargets()]).then(([existing, allArcGoals, allTargets]) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setManifest(existing);
      setArcGoals(allArcGoals);
      setTargets(allTargets);
      setStatus("editing");
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

  async function handleCreateMajorGoal() {
    const trimmed = newMajorGoalTitle.trim();
    if (!trimmed || !manifest) return;
    const now = new Date().toISOString();
    const goal = createEmptyMajorGoal(generateMajorGoalId(), trimmed, now);
    persistManifest(upsertMajorGoalInLifeManifest(manifest, goal));
    setCreatingMajorGoal(false);
    setNewMajorGoalTitle("");
    setSelectedMajorGoalId(goal.id);
    setStep("why");
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

  function goNext() {
    const currentIndex = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)]);
  }

  function goBackStep() {
    const currentIndex = STEP_ORDER.indexOf(step);
    if (currentIndex === 0) return;
    setStep(STEP_ORDER[currentIndex - 1]);
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
          <Text style={styles.title}>המניפסט לא נמצא</Text>
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
                <Pressable
                  style={styles.goalButton}
                  onPress={() => {
                    setSelectedMajorGoalId(goal.id);
                    setStep("title");
                  }}
                >
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
              <ActiveSubGoalDashboard goal={goal} arcGoals={arcGoals} targets={targets} />
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
  // Questionnaire for the selected Major Goal.
  // -------------------------------------------------------------------
  const textField = TEXT_STEP_FIELDS[step];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{selectedGoal.title || "מטרה ללא כותרת"}</Text>
        <Text style={styles.title}>{STEP_TITLES[step]}</Text>
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        {step === "title" && (
          <View>
            <TextInput
              style={styles.textInput}
              value={selectedGoal.title}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { title: text })}
              textAlign="right"
              multiline
              autoFocus
            />
            <Pressable
              style={[styles.button, styles.fullWidthButton, selectedGoal.title.trim().length === 0 && styles.buttonDisabled]}
              disabled={selectedGoal.title.trim().length === 0}
              onPress={goNext}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {textField && OPTIONAL_TEXT_STEPS.includes(step) && (
          <View>
            <TextInput
              style={styles.textInput}
              value={(selectedGoal[textField] as string | null) ?? ""}
              onChangeText={(text) => patchMajorGoal(selectedGoal.id, { [textField]: text.trim().length > 0 ? text : null } as Partial<MajorGoal>)}
              textAlign="right"
              multiline
              autoFocus
            />
            <Text style={styles.hint}>שאלה זו רשות -- אפשר להמשיך ולחזור אליה מאוחר יותר.</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={goNext}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "subGoals" && (
          <View>
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
                <Pressable
                  style={styles.actionButton}
                  onPress={() => router.push({ pathname: "/life-manifest/sub-goal/[subGoalId]", params: { subGoalId: subGoal.id } })}
                >
                  <Text style={styles.actionButtonText}>ניהול תת־המטרה (ARC Goal, יעדים, תאריכים)</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => addSubGoal(selectedGoal.id)}>
              <Text style={styles.buttonText}>+ הוסף תת־מטרה</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={goNext}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "review" && (
          <View>
            <Text style={styles.body}>{`כותרת: ${selectedGoal.title}`}</Text>
            {selectedGoal.why && <Text style={styles.body}>{`למה זה חשוב: ${selectedGoal.why}`}</Text>}
            {selectedGoal.value && <Text style={styles.body}>{`ערך: ${selectedGoal.value}`}</Text>}
            {selectedGoal.futureIdentity && <Text style={styles.body}>{`מי תהיה: ${selectedGoal.futureIdentity}`}</Text>}
            {selectedGoal.futureLifeDescription && <Text style={styles.body}>{`איך יראו החיים: ${selectedGoal.futureLifeDescription}`}</Text>}
            <Text style={styles.body}>{`תתי־מטרות: ${selectedGoal.subGoals.length}`}</Text>
            {selectedGoal.capabilitiesNeeded && <Text style={styles.body}>{`יכולות נדרשות: ${selectedGoal.capabilitiesNeeded}`}</Text>}
            {selectedGoal.obstacles && <Text style={styles.body}>{`מה עלול להפריע: ${selectedGoal.obstacles}`}</Text>}
            {selectedGoal.supportiveInternalStates && <Text style={styles.body}>{`מצבים פנימיים תומכים: ${selectedGoal.supportiveInternalStates}`}</Text>}
            {selectedGoal.realWorldSign && <Text style={styles.body}>{`הסימן הממשי: ${selectedGoal.realWorldSign}`}</Text>}

            <Text style={styles.fieldLabel}>סטטוס</Text>
            <View style={[styles.chipColumn, styles.chipRow]}>
              {STATUSES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, selectedGoal.status === s && styles.chipSelected]}
                  onPress={() => patchMajorGoal(selectedGoal.id, { status: s })}
                >
                  <Text style={styles.buttonText}>{STATUS_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>

            {!isMajorGoalQuestionnaireComplete(selectedGoal) && (
              <Text style={styles.hint}>המטרה עדיין מוצגת כטיוטה עד שכל השאלות ותת־מטרה אחת לפחות ימולאו. אפשר לחזור ולהשלים בכל שלב.</Text>
            )}

            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => {
                setSelectedMajorGoalId(null);
              }}
            >
              <Text style={styles.buttonText}>חזרה למטרות הגדולות</Text>
            </Pressable>
          </View>
        )}

        {step !== "title" && (
          <Pressable style={styles.backButton} onPress={goBackStep}>
            <Text style={styles.backButtonText}>חזור</Text>
          </Pressable>
        )}
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
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8, marginTop: 8 },
  fieldLabel: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginBottom: 12 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipColumn: { gap: 8, marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center" },
  chipSelected: { backgroundColor: "#0a7ea4" },
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

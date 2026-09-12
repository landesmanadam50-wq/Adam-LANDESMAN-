import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getArcBuild, getArcGoal, loadMiniArcBuilds, upsertArcGoal } from "../data/storage.ts";
import {
  addPracticeRecord,
  computeOverallProgress,
  computeWeekProgress,
  confirmWeekCompleteAndAdvance,
  extendCurrentWeek,
  FOUR_WEEK_META,
  isPastPlannedEndDate,
  resolveCurrentWeek,
  resolveNextWeekOpeningDate,
  resolveWeek,
  saveWeekReflection,
  setLinkedMiniArc,
  setReturnContext,
} from "../arc/fourWeekProgram.ts";
import { activateExecutionPhase } from "../arc/subGoalExecution.ts";
import { reconcileFourWeekProgramWeekNotification } from "../data/fourWeekProgramReminders.ts";
import type { ArcBuild, ArcGoal } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

/**
 * live/ArcGoalFourWeekDashboardScreen.tsx (route: /goals/live/[goalId])
 *
 * Four-Week Program task, spec section 7: the Reach Your Goal LIVE
 * dashboard for an ArcGoal whose fourWeekProgram is enabled -- reached
 * from build/ArcGoalSelectScreen.tsx instead of jumping straight into
 * /arc-goal/live/[goalId] (the existing outer/inner ARC Goal run, which
 * a goal WITHOUT the four-week program still reaches directly,
 * completely unchanged). Shows the current week's own plan/progress and
 * routes into the existing Full ARC (/live), Mini ARC (/mini-arc/live/
 * [id]), ARC Link (/arc-link/[id]) and Mini ARC Link (/mini-arc-link/
 * [id]) screens for the actual guided practice -- this screen itself
 * never re-implements any of those.
 *
 * "Only show actions relevant to the current week" (spec section 7):
 * Week 1 offers ARCHI ARC Link, Full ARC, and a direct action
 * confirmation; Week 2 offers Mini ARCHI Link, Mini ARC, a direct action
 * confirmation, and an "אני צריך עזרה נוספת" Full-ARC fallback (plus,
 * until one is linked, Mini ARC create/select); Week 3 offers Mini ARC
 * Link, an inline Identity Recall, an optional Mini ARC, and a direct
 * action-complete confirmation; Week 4 offers ONLY the direct
 * action-complete confirmation. "אני צריך עזרה מ-ARCHI" (-> Full ARC) is
 * always available as an explicit, optional fallback, never a
 * requirement.
 *
 * Four-Week Program task correction: THREE separate, never-merged
 * linking practices --
 *   - "ARCHI ARC Link" (Week 1): links the trigger to starting the
 *     linked Full ARC in ARCHI (route: ARCHI ARC Link -> linked Full ARC
 *     -> identity-based action -> Success Focus).
 *   - "Mini ARCHI Link" (Week 2): links the trigger to starting the
 *     linked Mini ARC in ARCHI (route: Mini ARCHI Link -> linked Mini
 *     ARC -> target habit/beneficial action).
 *   - "Mini ARC Link" (Week 3): the shorter, learned link toward the
 *     real-world action itself, with Mini ARC used only when needed --
 *     a DIFFERENT practice from Mini ARCHI Link above, tracked as a
 *     different kind even though both route through the SAME
 *     live/MiniArcLinkScreen.tsx (see that screen's own doc for how the
 *     explicit fourWeekKind param tells them apart).
 * None of these three is ever the same practice as, or interchangeable
 * with, Full ARC/Mini ARC themselves -- each routes to its own real
 * screen and logs its own distinct practice-record kind (arc_link/
 * mini_archi_link/mini_arc_link vs. full_arc/mini_arc -- see
 * ArcGoalWeekPracticeRecord's own doc), so "Track ... separately" is a
 * real, queryable distinction, never just a difference in button label.
 * Full ARC and Mini ARC also both stay directly reachable on their own,
 * without going through their Link practice first.
 *
 * Reaching a week's own planned end date NEVER auto-advances it -- it
 * only surfaces the decision prompt (spec section 2) below, and
 * confirmWeekCompleteAndAdvance (arc/fourWeekProgram.ts) is the only
 * thing that actually moves the program forward, always after the
 * weekly reflection (spec section 9).
 */
export default function ArcGoalFourWeekDashboardScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [identityBuild, setIdentityBuild] = useState<ArcBuild | null>(null);
  const [miniArcBuilds, setMiniArcBuilds] = useState<MiniArcBuild[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDraft, setExtendDraft] = useState("");
  const [reflectionWhatHelped, setReflectionWhatHelped] = useState("");
  const [reflectionWhatWasHard, setReflectionWhatWasHard] = useState("");
  const [reflectionIdentityEvidence, setReflectionIdentityEvidence] = useState("");
  const [reflectionReady, setReflectionReady] = useState<boolean | null>(null);
  const [identityRecallOpen, setIdentityRecallOpen] = useState(false);
  const [actionConfirmOpen, setActionConfirmOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!goalId) {
      setStatus("notFound");
      return;
    }
    try {
      const loadedGoal = await getArcGoal(goalId);
      if (!loadedGoal || !loadedGoal.fourWeekProgram?.enabled) {
        setStatus("notFound");
        return;
      }
      setGoal(loadedGoal);
      const [loadedIdentityBuild, allMiniArcs] = await Promise.all([
        loadedGoal.identityProtocolId ? getArcBuild(loadedGoal.identityProtocolId) : Promise.resolve(null),
        loadMiniArcBuilds(),
      ]);
      setIdentityBuild(loadedIdentityBuild);
      setMiniArcBuilds(allMiniArcs);
      setStatus("ready");

      // Sub-goal execution task, spec section 9: brings the CURRENT
      // week's own reminder toggle back in sync with a real scheduled
      // notification on every screen focus -- same lazy, idempotent
      // "reconcile on next relevant touch" pattern data/routines.ts's
      // own reconcileRoutineNotifications already uses. Never touches
      // week-progression fields; fire-and-forget (a failure here is a
      // best-effort background nudge, never something to block on).
      const program = loadedGoal.fourWeekProgram;
      if (program) {
        const currentWeek = program.weeks[program.currentWeek - 1];
        reconcileFourWeekProgramWeekNotification(currentWeek, loadedGoal.id, FOUR_WEEK_META[currentWeek.weekNumber].title).then((reconciledWeek) => {
          if (reconciledWeek.reminderNotificationId === currentWeek.reminderNotificationId && reconciledWeek.reminderScheduledFor === currentWeek.reminderScheduledFor) return;
          const weeks = [...program.weeks] as typeof program.weeks;
          weeks[currentWeek.weekNumber - 1] = reconciledWeek;
          const reconciledGoal = { ...loadedGoal, fourWeekProgram: { ...program, weeks } };
          setGoal(reconciledGoal);
          upsertArcGoal(reconciledGoal);
        });
      }
    } catch (error) {
      console.warn("[ArcGoalFourWeekDashboardScreen] Failed to load -- showing the recovery state instead of hanging.", error);
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

  if (status === "notFound" || !goal || !goal.fourWeekProgram) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא ניתן לטעון את תוכנית ארבעת השבועות.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/reach-your-goal")}>
            <Text style={styles.buttonText}>חזרה להשגת מטרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const program = goal.fourWeekProgram;
  const currentWeek = resolveCurrentWeek(program);
  const meta = FOUR_WEEK_META[currentWeek.weekNumber];
  const nextOpeningDate = resolveNextWeekOpeningDate(program, currentWeek.weekNumber);
  const today = todayLocalDateString();
  const pastEndDate = currentWeek.status === "active" && isPastPlannedEndDate(currentWeek, today);
  const linkedMiniArc = program.linkedMiniArcId ? miniArcBuilds.find((m) => m.id === program.linkedMiniArcId) ?? null : null;

  function recordAndPersist(kind: "identity_recall" | "action" | "archi_support", label: string) {
    if (!goal || !goal.fourWeekProgram) return;
    const now = new Date().toISOString();
    const updatedProgram = addPracticeRecord(goal.fourWeekProgram, goal.fourWeekProgram.currentWeek, kind, label, now);
    persist({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
  }

  /**
   * Four-Week Program task correction: four distinct, non-interchangeable
   * ROUTE targets -- "fullArc"/"miniArc" launch the real Full ARC/Mini
   * ARC session directly; "arcLink"/"miniArcLink" launch their OWN
   * guided linking practice (live/ArcLinkScreen.tsx /
   * live/MiniArcLinkScreen.tsx), which itself leads into starting the
   * linked Full ARC/Mini ARC. Each records its own practice-record kind
   * on return (see those screens' own fourWeekGoalId-aware completion)
   * -- this function only sets the return context and navigates; it
   * never logs the practice record itself; that only happens once the
   * trainee actually finishes there.
   *
   * live/MiniArcLinkScreen.tsx backs TWO distinct kinds (Week 2's "Mini
   * ARCHI Link" and Week 3's "Mini ARC Link" -- never the same practice
   * despite sharing a screen), so the route target alone can't tell it
   * which one this run is; `kind` is threaded through as an explicit
   * fourWeekKind param for exactly that case.
   */
  function startSupportFlow(target: "fullArc" | "miniArc" | "arcLink" | "miniArcLink", kind: "full_arc" | "mini_arc" | "arc_link" | "mini_archi_link" | "mini_arc_link", actionLabel: string) {
    if (!goal || !goal.fourWeekProgram) return;
    const now = new Date().toISOString();
    const updatedProgram = setReturnContext(goal.fourWeekProgram, goal.fourWeekProgram.currentWeek, actionLabel, now);
    persist({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
    const fourWeekParams = { fourWeekGoalId: goal.id, fourWeekWeek: String(updatedProgram.currentWeek) };
    if (target === "fullArc" && goal.identityProtocolId) {
      router.push({ pathname: "/live", params: { buildId: goal.identityProtocolId, ...fourWeekParams } });
    } else if (target === "arcLink" && goal.identityProtocolId) {
      router.push({ pathname: "/arc-link/[id]", params: { id: goal.identityProtocolId, ...fourWeekParams } });
    } else if (target === "miniArc" && updatedProgram.linkedMiniArcId) {
      router.push({ pathname: "/mini-arc/live/[id]", params: { id: updatedProgram.linkedMiniArcId, ...fourWeekParams } });
    } else if (target === "miniArcLink" && updatedProgram.linkedMiniArcId) {
      router.push({ pathname: "/mini-arc-link/[id]", params: { id: updatedProgram.linkedMiniArcId, fourWeekKind: kind, ...fourWeekParams } });
    }
  }

  function openDecisionOrExtend(confirmComplete: boolean) {
    setDecisionOpen(false);
    if (confirmComplete) {
      setReflectionWhatHelped("");
      setReflectionWhatWasHard("");
      setReflectionIdentityEvidence("");
      setReflectionReady(null);
      setReflectionOpen(true);
    } else {
      setExtendDraft(currentWeek.plannedEndDate ?? today);
      setExtendOpen(true);
    }
  }

  function confirmReflectionAndAdvance() {
    if (!goal || !goal.fourWeekProgram) return;
    const now = new Date().toISOString();
    const completingWeekNumber = goal.fourWeekProgram.currentWeek;
    let updatedProgram = saveWeekReflection(
      goal.fourWeekProgram,
      completingWeekNumber,
      {
        whatHelped: reflectionWhatHelped.trim().length > 0 ? reflectionWhatHelped.trim() : null,
        whatWasHard: reflectionWhatWasHard.trim().length > 0 ? reflectionWhatWasHard.trim() : null,
        identityEvidence: reflectionIdentityEvidence.trim().length > 0 ? reflectionIdentityEvidence.trim() : null,
        readyToReduceSupport: reflectionReady,
      },
      now
    );
    updatedProgram = confirmWeekCompleteAndAdvance(updatedProgram, now);
    const updatedGoal = { ...goal, fourWeekProgram: updatedProgram, updatedAt: now };
    setReflectionOpen(false);

    // Sub-goal execution task, spec section 1: Week 4's own confirmation
    // is the ONLY moment that ever transitions the goal into execution
    // (never merely because the planned date arrived) -- activateExecutionPhase
    // itself re-checks readyForSubGoalActivation, so this is safe even if
    // called on every week's confirm; it only ever actually does anything
    // once, right after Week 4.
    if (completingWeekNumber === 4) {
      const withExecutionPhase = activateExecutionPhase(updatedGoal, now);
      persist(withExecutionPhase);
      router.replace({ pathname: "/goals/execution/[goalId]", params: { goalId: goal.id } });
      return;
    }

    persist(updatedGoal);
  }

  function confirmExtend() {
    if (!goal || !goal.fourWeekProgram || extendDraft.trim().length === 0) return;
    const now = new Date().toISOString();
    const updatedProgram = extendCurrentWeek(goal.fourWeekProgram, goal.fourWeekProgram.currentWeek, extendDraft.trim(), now);
    persist({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
    setExtendOpen(false);
  }

  function confirmActionDone() {
    if (!goal) return;
    recordAndPersist("action", goal.goalAction || "ביצוע ההרגל");
    setActionConfirmOpen(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "תוכנית ארבעת השבועות" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{goal.name}</Text>
        <Text style={styles.title}>{meta.title}</Text>
        <Text style={styles.purpose}>{meta.purpose}</Text>
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <View style={styles.card}>
          <Text style={styles.body}>{`תאריך התחלה מתוכנן: ${currentWeek.plannedStartDate ?? "--"}`}</Text>
          <Text style={styles.body}>{`תאריך סיום מתוכנן: ${currentWeek.plannedEndDate ?? "--"}`}</Text>
          {currentWeek.weekNumber < 4 ? (
            <Text style={styles.body}>{`השבוע הבא מתוכנן להיפתח ב-${nextOpeningDate ?? "--"}`}</Text>
          ) : (
            <Text style={styles.body}>{`תוכנית ארבעת השבועות מתוכננת להסתיים ב-${currentWeek.plannedEndDate ?? "--"}`}</Text>
          )}
          <Text style={styles.body}>{`תרגול מומלץ להיום: ${currentWeek.recommendedPractice ?? "--"}`}</Text>
          <Text style={styles.body}>{`הרגל היעד: ${goal.goalAction || "--"}`}</Text>
          <Text style={styles.body}>{`תזכורת קרובה: ${currentWeek.remindersEnabled && currentWeek.reminderScheduledFor ? currentWeek.reminderScheduledFor : "לא נקבעה תזכורת"}`}</Text>
          <Text style={styles.body}>{`התקדמות השבוע: ${computeWeekProgress(currentWeek)}%`}</Text>
          <Text style={styles.body}>{`התקדמות כוללת בתוכנית: ${computeOverallProgress(program)}%`}</Text>
        </View>

        {pastEndDate && (
          <View style={styles.decisionBanner}>
            <Text style={styles.decisionText}>הגיע המועד המתוכנן לשבוע הבא. האם השלמת את השבוע הנוכחי ואתה מוכן להתקדם?</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setDecisionOpen(true)}>
              <Text style={styles.buttonText}>להחליט עכשיו</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>פעולות</Text>

        {currentWeek.weekNumber === 1 && (
          <View>
            {goal.identityProtocolId && (
              <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => startSupportFlow("arcLink", "arc_link", "ARCHI ARC Link")}>
                <Text style={styles.buttonText}>תרגול ARCHI ARC Link</Text>
              </Pressable>
            )}
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => startSupportFlow("fullArc", "full_arc", "ARC מלא")}>
              <Text style={styles.secondaryButtonText}>התחל ARC מלא</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setActionConfirmOpen(true)}>
              <Text style={styles.buttonText}>בצע את הפעולה</Text>
            </Pressable>
          </View>
        )}

        {currentWeek.weekNumber === 2 && (
          <View>
            {!linkedMiniArc ? (
              <View>
                <Text style={styles.hint}>יש לקשר Mini ARC לתוכנית לפני תחילת התרגול.</Text>
                <View style={styles.chipColumn}>
                  {miniArcBuilds.map((m) => (
                    <Pressable
                      key={m.id}
                      style={styles.chip}
                      onPress={() => {
                        if (!goal.fourWeekProgram) return;
                        persist({ ...goal, fourWeekProgram: setLinkedMiniArc(goal.fourWeekProgram, m.id), updatedAt: new Date().toISOString() });
                      }}
                    >
                      <Text style={styles.chipText}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/mini-arc")}>
                  <Text style={styles.buttonText}>+ צור Mini ARC חדש</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => startSupportFlow("miniArcLink", "mini_archi_link", "Mini ARCHI Link")}>
                  <Text style={styles.buttonText}>תרגול Mini ARCHI Link</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => startSupportFlow("miniArc", "mini_arc", "Mini ARC")}>
                  <Text style={styles.secondaryButtonText}>התחל Mini ARC</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setActionConfirmOpen(true)}>
                  <Text style={styles.buttonText}>בצע את הפעולה</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => startSupportFlow("fullArc", "full_arc", "ARC מלא -- תמיכה נוספת")}>
                  <Text style={styles.secondaryButtonText}>אני צריך עזרה נוספת</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {currentWeek.weekNumber === 3 && (
          <View>
            {linkedMiniArc && (
              <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => startSupportFlow("miniArcLink", "mini_arc_link", "Mini ARC Link")}>
                <Text style={styles.buttonText}>Mini ARC Link</Text>
              </Pressable>
            )}
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setIdentityRecallOpen((v) => !v)}>
              <Text style={styles.secondaryButtonText}>היזכרות בזהות</Text>
            </Pressable>
            {identityRecallOpen && (
              <View style={styles.card}>
                <Text style={styles.body}>{`מנטרת זהות: ${identityBuild?.profile.identityEncoding?.mantra ?? "--"}`}</Text>
                <Text style={styles.body}>{`עוגן שפת גוף: ${identityBuild?.profile.identityEncoding?.bodyLanguageCue ?? "--"}`}</Text>
                <Pressable
                  style={[styles.button, styles.fullWidthButton]}
                  onPress={() => {
                    recordAndPersist("identity_recall", "היזכרות בזהות");
                    setIdentityRecallOpen(false);
                  }}
                >
                  <Text style={styles.buttonText}>בוצע</Text>
                </Pressable>
              </View>
            )}
            {linkedMiniArc && (
              <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => startSupportFlow("miniArc", "mini_arc", "Mini ARC")}>
                <Text style={styles.secondaryButtonText}>Mini ARC (בהנחיה)</Text>
              </Pressable>
            )}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setActionConfirmOpen(true)}>
              <Text style={styles.buttonText}>בצע את הפעולה</Text>
            </Pressable>
          </View>
        )}

        {currentWeek.weekNumber === 4 && (
          <View>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setActionConfirmOpen(true)}>
              <Text style={styles.buttonText}>בצע את הפעולה</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
          onPress={() => {
            recordAndPersist("archi_support", "אני צריך עזרה מ-ARCHI");
            startSupportFlow("fullArc", "full_arc", "אני צריך עזרה מ-ARCHI");
          }}
        >
          <Text style={styles.secondaryButtonText}>אני צריך עזרה מ-ARCHI</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.push({ pathname: "/goals/[id]", params: { id: goal.id } })}>
          <Text style={styles.backButtonText}>לעריכת המטרה (BUILD)</Text>
        </Pressable>
      </ScrollView>

      {/* --- Decision prompt (spec section 2) --- */}
      <Modal visible={decisionOpen} transparent animationType="fade" onRequestClose={() => setDecisionOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>הגיע המועד המתוכנן לשבוע הבא. האם השלמת את השבוע הנוכחי ואתה מוכן להתקדם?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={() => openDecisionOrExtend(true)}>
                <Text style={styles.buttonText}>כן, להשלים ולעבור לשבוע הבא</Text>
              </Pressable>
            </View>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton, styles.secondaryStyleButton]} onPress={() => openDecisionOrExtend(false)}>
                <Text style={styles.buttonText}>אני רוצה להמשיך בשבוע הנוכחי</Text>
              </Pressable>
            </View>
            <Pressable style={styles.actionButton} onPress={() => setDecisionOpen(false)}>
              <Text style={styles.actionButtonText}>לא כרגע</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* --- Weekly reflection (spec section 9) --- */}
      <Modal visible={reflectionOpen} transparent animationType="fade" onRequestClose={() => setReflectionOpen(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.modalTitle}>מה עזר לי השבוע?</Text>
            <TextInput style={styles.textInput} value={reflectionWhatHelped} onChangeText={setReflectionWhatHelped} textAlign="right" multiline />
            <Text style={styles.modalTitle}>מה היה לי קשה?</Text>
            <TextInput style={styles.textInput} value={reflectionWhatWasHard} onChangeText={setReflectionWhatWasHard} textAlign="right" multiline />
            <Text style={styles.modalTitle}>איזו הוכחה נתתי לזהות שלי?</Text>
            <TextInput style={styles.textInput} value={reflectionIdentityEvidence} onChangeText={setReflectionIdentityEvidence} textAlign="right" multiline />
            <Text style={styles.modalTitle}>האם אני מוכן להפחית את התמיכה של ARCHI?</Text>
            <View style={styles.modalButtonRow}>
              {[true, false].map((answer) => (
                <Pressable
                  key={String(answer)}
                  style={[styles.chip, reflectionReady === answer && styles.chipSelected]}
                  onPress={() => setReflectionReady(answer)}
                >
                  <Text style={styles.chipText}>{answer ? "כן" : "לא עדיין"}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={confirmReflectionAndAdvance}>
              <Text style={styles.buttonText}>אשר השלמת שבוע</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => setReflectionOpen(false)}>
              <Text style={styles.actionButtonText}>ביטול</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* --- Extend current week --- */}
      <Modal visible={extendOpen} transparent animationType="fade" onRequestClose={() => setExtendOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>תאריך סיום מתוכנן חדש (YYYY-MM-DD)</Text>
            <TextInput style={styles.textInput} value={extendDraft} onChangeText={setExtendDraft} textAlign="right" />
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={confirmExtend}>
                <Text style={styles.buttonText}>עדכן תאריך סיום</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setExtendOpen(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- Direct action-complete confirmation --- */}
      <Modal visible={actionConfirmOpen} transparent animationType="fade" onRequestClose={() => setActionConfirmOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{`לסמן את הפעולה "${goal.goalAction || "ביצוע ההרגל"}" כהושלמה?`}</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={confirmActionDone}>
                <Text style={styles.buttonText}>כן, ביצעתי</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setActionConfirmOpen(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
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
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  purpose: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 8 },
  body: { fontSize: 15, textAlign: "right", marginBottom: 6 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginBottom: 12 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  decisionBanner: { backgroundColor: "#fff7e6", borderRadius: 10, padding: 12, marginBottom: 12 },
  decisionText: { fontSize: 15, textAlign: "right", color: "#7a5200", marginBottom: 8 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  secondaryStyleButton: { backgroundColor: "#666" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  chipColumn: { gap: 8, marginTop: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center", marginBottom: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 8, marginBottom: 8 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 8, alignSelf: "center" },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%", maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 8 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 12 },
  modalButton: { flex: 1 },
});

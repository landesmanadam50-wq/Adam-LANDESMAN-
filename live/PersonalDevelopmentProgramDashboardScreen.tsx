import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getPersonalDevelopmentProgram, loadArcLinks, loadMiniArcBuilds, upsertPersonalDevelopmentProgram } from "../data/storage.ts";
import {
  addPracticeRecord,
  isPastPlannedEndDate,
  isSpeedFluencyWeek,
  PERSONAL_DEVELOPMENT_WEEK_META,
  confirmWeekCompleteAndAdvance,
  resolveCompatibleArcLinksForProtocol,
  resolveCurrentWeek,
  resolvePersonalDevelopmentTaskRoute,
  resolvePersonalDevelopmentWeekPlan,
  setArcLinkId,
  setLinkedMiniArc,
  setMiniArcLinkId,
  setReturnContext,
} from "../arc/personalDevelopmentProgram.ts";
import type { PersonalDevelopmentTaskKind } from "../arc/personalDevelopmentProgram.ts";
import { reconcilePersonalDevelopmentProgramWeekNotification } from "../data/personalDevelopmentProgramReminders.ts";
import type { PersonalDevelopmentFourWeekProgram, PersonalDevelopmentProtocolKind } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import type { ArcLink } from "../arc/routineLinks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

/**
 * live/PersonalDevelopmentProgramDashboardScreen.tsx (route:
 * /personal-development-program/live/[id])
 *
 * Phase 9: the Personal Development four-week LIVE dashboard -- mirrors
 * live/ArcGoalFourWeekDashboardScreen.tsx's own overall shape (current
 * week's own plan/progress, routes into the REAL existing protocol/Link
 * screens for actual practice, a past-end-date decision banner), but
 * deliberately simpler: no weekly reflection, no manual date-cascade
 * editing (see arc/personalDevelopmentProgram.ts's own module doc for
 * why) -- confirming a week just advances it.
 *
 * Task-kind routing (spec sections 2/7/8, "each weekly task must
 * reference the correct saved protocol record, and a weekly Link task
 * must open the rehearsal"): "full"/"mini" route to that protocolKind's
 * own real LIVE screen (the combined Urge/Thought/Presence/Belief
 * screens accept an optional `mode` param added this phase to bypass
 * their own modeChoice picker; "state" uses the pre-existing /live and
 * /mini-arc/live/[id] routes directly). "archi_link" is STATE-ONLY (see
 * arc/personalDevelopmentProgram.ts's own doc on why -- live/ArcLinkScreen.tsx
 * has no equivalent for the other 4 kinds) and routes to /arc-link/[id].
 * "mini_link" routes to /mini-arc-link/[id] using the linked Mini's OWN
 * id (that screen already supports every protocolKind via its own
 * getMiniArcBuild branching). "action_independent" (Week 4) is answered
 * locally -- a direct confirmation, never a protocol/Link route (spec:
 * never invent a screen for something that isn't a real practice).
 *
 * Every route carries pdProgramId/pdWeek so the destination screen logs
 * its own correctly-kinded practice record and returns here on
 * completion (see each of those screens' own Phase 9 doc comments).
 */
export default function PersonalDevelopmentProgramDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [program, setProgram] = useState<PersonalDevelopmentFourWeekProgram | null>(null);
  const [miniArcs, setMiniArcs] = useState<MiniArcBuild[]>([]);
  const [arcLinks, setArcLinks] = useState<ArcLink[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [actionConfirmOpen, setActionConfirmOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!id) {
      setStatus("notFound");
      return;
    }
    try {
      const [loadedProgram, allMiniArcs, allArcLinks] = await Promise.all([getPersonalDevelopmentProgram(id), loadMiniArcBuilds(), loadArcLinks()]);
      if (!loadedProgram) {
        setStatus("notFound");
        return;
      }
      setProgram(loadedProgram);
      setMiniArcs(allMiniArcs);
      setArcLinks(allArcLinks);
      setStatus("ready");

      const currentWeek = resolveCurrentWeek(loadedProgram);
      reconcilePersonalDevelopmentProgramWeekNotification(currentWeek, loadedProgram.id, PERSONAL_DEVELOPMENT_WEEK_META[currentWeek.weekNumber].title).then(
        (reconciledWeek) => {
          if (reconciledWeek.reminderNotificationId === currentWeek.reminderNotificationId && reconciledWeek.reminderScheduledFor === currentWeek.reminderScheduledFor) return;
          const weeks = [...loadedProgram.weeks] as typeof loadedProgram.weeks;
          weeks[currentWeek.weekNumber - 1] = reconciledWeek;
          const reconciledProgram = { ...loadedProgram, weeks };
          setProgram(reconciledProgram);
          upsertPersonalDevelopmentProgram(reconciledProgram);
        }
      );
    } catch (error) {
      console.warn("[PersonalDevelopmentProgramDashboardScreen] Failed to load -- showing the recovery state instead of hanging.", error);
      setStatus("notFound");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function persist(updatedProgram: PersonalDevelopmentFourWeekProgram) {
    setProgram(updatedProgram);
    upsertPersonalDevelopmentProgram(updatedProgram).catch(() => setSaveError("אירעה שגיאה בשמירה. נסה שוב."));
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !program) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא ניתן לטעון את תוכנית ההתפתחות האישית.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/personal-development-program")}>
            <Text style={styles.buttonText}>חזרה לרשימת התוכניות</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentWeek = resolveCurrentWeek(program);
  const meta = PERSONAL_DEVELOPMENT_WEEK_META[currentWeek.weekNumber];
  const today = todayLocalDateString();
  const pastEndDate = currentWeek.status === "active" && isPastPlannedEndDate(currentWeek, today);
  const linkedMini = program.linkedMiniArcId ? miniArcs.find((m) => m.id === program.linkedMiniArcId) ?? null : null;
  const compatibleUnlinkedMinis = !linkedMini ? miniArcs.filter((m) => m.protocolKind === program.protocolKind && m.parentArcBuildId === program.protocolId) : [];
  const hasMini = linkedMini !== null;
  const plan = resolvePersonalDevelopmentWeekPlan(currentWeek.weekNumber, program.protocolKind, hasMini);
  const speedFluency = isSpeedFluencyWeek(currentWeek.weekNumber);

  // Requirement 2/7: existing saved ArcLink candidates for this exact
  // protocol/Mini -- offered as a picker (never invented) so "archi_link"/
  // "mini_link" can reuse a real configured trigger/mode instead of the
  // generic fallback content; a missing candidate list is always a safe
  // no-op (the existing generic Link content still works).
  const linkedArcLink = program.arcLinkId ? arcLinks.find((l) => l.id === program.arcLinkId) ?? null : null;
  const compatibleUnlinkedArcLinks =
    program.protocolKind === "state" && !linkedArcLink ? resolveCompatibleArcLinksForProtocol("arc", program.protocolId, arcLinks) : [];
  const linkedMiniArcLink = program.miniArcLinkId ? arcLinks.find((l) => l.id === program.miniArcLinkId) ?? null : null;
  const compatibleUnlinkedMiniArcLinks = linkedMini && !linkedMiniArcLink ? resolveCompatibleArcLinksForProtocol("mini_arc", linkedMini.id, arcLinks) : [];

  function recordAndPersist(kind: "action", label: string) {
    if (!program) return;
    const now = new Date().toISOString();
    const updated = addPracticeRecord(program, program.currentWeek, kind, label, now);
    persist({ ...updated, updatedAt: now });
  }

  /**
   * Resolves the launching route for one recommended/available task via
   * arc/personalDevelopmentProgram.ts's own pure resolvePersonalDevelopmentTaskRoute
   * (the single place that knows how each protocol kind's Full/Mini/Link
   * task actually routes -- see that function's own doc), saves the
   * return context, and navigates. A null result means nothing real
   * exists yet to route to (e.g. "mini" with no linked Mini) -- handled
   * safely by never navigating, never crashing (requirement 7); the
   * dashboard's own "no Mini yet" card above is the setup path for that
   * case. The destination screen's own Phase 9 completion logic logs the
   * correctly-kinded practice record and returns here.
   */
  function launchTask(kind: PersonalDevelopmentTaskKind) {
    if (!program) return;
    const route = resolvePersonalDevelopmentTaskRoute(program, kind, program.linkedMiniArcId);
    if (!route) return;
    const now = new Date().toISOString();
    const label = TASK_LABELS[kind](speedFluency);
    persist(setReturnContext(program, program.currentWeek, label, now));
    router.push(route as Parameters<typeof router.push>[0]);
  }

  function confirmWeekComplete() {
    if (!program) return;
    const now = new Date().toISOString();
    const updated = confirmWeekCompleteAndAdvance(program, now);
    persist({ ...updated, updatedAt: now });
    setDecisionOpen(false);
  }

  function confirmActionIndependent() {
    recordAndPersist("action", "ביצוע עצמאי של הפעולה, ללא ARCHI");
    setActionConfirmOpen(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "תוכנית התפתחות אישית" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{program.name}</Text>
        <Text style={styles.title}>{meta.title}</Text>
        <Text style={styles.purpose}>{meta.purpose}</Text>
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <View style={styles.card}>
          <Text style={styles.body}>{`סוג פרוטוקול: ${PROTOCOL_KIND_LABELS[program.protocolKind]}`}</Text>
          <Text style={styles.body}>{`שבוע נוכחי: ${currentWeek.weekNumber} מתוך 4`}</Text>
          <Text style={styles.body}>{`תאריך התחלה מתוכנן: ${currentWeek.plannedStartDate ?? "--"}`}</Text>
          <Text style={styles.body}>{`תאריך סיום מתוכנן: ${currentWeek.plannedEndDate ?? "--"}`}</Text>
          <Text style={styles.body}>{`תזכורת קרובה: ${currentWeek.remindersEnabled && currentWeek.reminderScheduledFor ? currentWeek.reminderScheduledFor : "לא נקבעה תזכורת"}`}</Text>
          <Text style={styles.body}>{`Mini מקושר: ${linkedMini ? linkedMini.name : "לא קיים"}`}</Text>
        </View>

        {pastEndDate && (
          <View style={styles.decisionBanner}>
            <Text style={styles.decisionText}>הגיע המועד המתוכנן לשבוע הבא. האם השלמת את השבוע הנוכחי ואתה מוכן להתקדם?</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setDecisionOpen(true)}>
              <Text style={styles.buttonText}>להחליט עכשיו</Text>
            </Pressable>
          </View>
        )}

        {!linkedMini && (
          <View style={styles.card}>
            <Text style={styles.hint}>עדיין אין ARC Mini מקושר לתוכנית זו. אפשר לקשר Mini קיים או ליצור אחד חדש -- זה לא חובה כדי להמשיך עם ARC המלא.</Text>
            {compatibleUnlinkedMinis.length > 0 && (
              <View style={styles.chipColumn}>
                {compatibleUnlinkedMinis.map((m) => (
                  <Pressable
                    key={m.id}
                    style={styles.chip}
                    onPress={() => {
                      if (!program) return;
                      persist({ ...setLinkedMiniArc(program, m.id), updatedAt: new Date().toISOString() });
                    }}
                  >
                    <Text style={styles.chipText}>{m.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/mini-arc")}>
              <Text style={styles.secondaryButtonText}>+ יצירת ARC Mini חדש</Text>
            </Pressable>
          </View>
        )}

        {compatibleUnlinkedArcLinks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.hint}>יש ARC Link שמור עבור פרוטוקול זה -- אפשר לקשר אותו כדי לתרגל עם הטריגר וההגדרות השמורות שלו.</Text>
            <View style={styles.chipColumn}>
              {compatibleUnlinkedArcLinks.map((link) => (
                <Pressable
                  key={link.id}
                  style={styles.chip}
                  onPress={() => {
                    if (!program) return;
                    persist({ ...setArcLinkId(program, link.id), updatedAt: new Date().toISOString() });
                  }}
                >
                  <Text style={styles.chipText}>{`ARC Link (${link.id})`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {compatibleUnlinkedMiniArcLinks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.hint}>יש Mini ARC Link שמור עבור ה-Mini המקושר -- אפשר לקשר אותו כדי לתרגל עם הטריגר וההגדרות השמורות שלו.</Text>
            <View style={styles.chipColumn}>
              {compatibleUnlinkedMiniArcLinks.map((link) => (
                <Pressable
                  key={link.id}
                  style={styles.chip}
                  onPress={() => {
                    if (!program) return;
                    persist({ ...setMiniArcLinkId(program, link.id), updatedAt: new Date().toISOString() });
                  }}
                >
                  <Text style={styles.chipText}>{`Mini ARC Link (${link.id})`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>מומלץ השבוע</Text>
        {plan.recommended.length === 0 && <Text style={styles.hint}>אין המלצה ספציפית השבוע -- ניתן להשתמש בפעולות הזמינות למטה.</Text>}
        {plan.recommended.map((kind) => (
          <Pressable
            key={`recommended-${kind}`}
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => (kind === "action_independent" ? setActionConfirmOpen(true) : launchTask(kind))}
          >
            <Text style={styles.buttonText}>{TASK_LABELS[kind](speedFluency)}</Text>
          </Pressable>
        ))}

        {plan.manuallyAvailable.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>זמין לתרגול נוסף</Text>
            {plan.manuallyAvailable.map((kind) => (
              <Pressable
                key={`available-${kind}`}
                style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
                onPress={() => (kind === "action_independent" ? setActionConfirmOpen(true) : launchTask(kind))}
              >
                <Text style={styles.secondaryButtonText}>{TASK_LABELS[kind](speedFluency)}</Text>
              </Pressable>
            ))}
          </>
        )}

        {currentWeek.practiceRecords.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>תרגולים שבוצעו השבוע</Text>
            <View style={styles.card}>
              {currentWeek.practiceRecords.map((record) => (
                <Text key={record.id} style={styles.body}>{`${record.label} -- ${record.occurredAt}`}</Text>
              ))}
            </View>
          </>
        )}

        <Pressable style={styles.backButton} onPress={() => router.push("/personal-development-program")}>
          <Text style={styles.backButtonText}>לרשימת תוכניות ההתפתחות האישית</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={decisionOpen} transparent animationType="fade" onRequestClose={() => setDecisionOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>הגיע המועד המתוכנן לשבוע הבא. האם השלמת את השבוע הנוכחי ואתה מוכן להתקדם?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={confirmWeekComplete}>
                <Text style={styles.buttonText}>כן, להשלים ולעבור לשבוע הבא</Text>
              </Pressable>
            </View>
            <Pressable style={styles.actionButton} onPress={() => setDecisionOpen(false)}>
              <Text style={styles.actionButtonText}>אני רוצה להמשיך בשבוע הנוכחי</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={actionConfirmOpen} transparent animationType="fade" onRequestClose={() => setActionConfirmOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>לסמן שביצעת את הפעולה בעצמך, ללא ARCHI?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.button, styles.modalButton]} onPress={confirmActionIndependent}>
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

const PROTOCOL_KIND_LABELS: Record<PersonalDevelopmentProtocolKind, string> = {
  state: "ARC State",
  urge: "ARC Urge",
  thought: "ARC Thought",
  presence: "ARC Presence",
  belief: "ARC Belief",
};

const TASK_LABELS: Record<PersonalDevelopmentTaskKind, (speedFluency: boolean) => string> = {
  full: () => "תרגול ARC מלא",
  mini: () => "תרגול ARC Mini",
  archi_link: () => "תרגול ARCHI ARC Link",
  mini_link: (speedFluency) => (speedFluency ? "תרגול Mini ARC Link (שטף)" : "תרגול Mini ARC Link (מונחה)"),
  action_independent: () => "ביצעתי את הפעולה בעצמי, ללא ARCHI",
};

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
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  chipColumn: { gap: 8, marginTop: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center", marginBottom: 8 },
  chipText: { color: "#0a7ea4", fontSize: 14 },
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

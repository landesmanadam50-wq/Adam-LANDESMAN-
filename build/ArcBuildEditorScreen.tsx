import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, upsertArcBuild } from "../data/storage.ts";
import {
  buildProfileFromDraft,
  createEmptyDraft,
  draftFromProfileAndSelection,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  isGoalDraftComplete,
  isIdentityArcDraftComplete,
  isStateArcDraftComplete,
  resolvesNeedsIdentity,
  selectionFromDraft,
  GOAL_STEP_ORDER,
  IDENTITY_ARC_STEP_ORDER,
  STATE_ARC_STEP_ORDER,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";
import { NEGATIVE_ACTION_MAX_DURATION_MINUTES, NEGATIVE_ACTION_MIN_DURATION_MINUTES } from "../program/engine.ts";
import type { ArcBuild, DwellTimes } from "../arc/types.ts";

/**
 * ARC Builds task: ONE screen editing ONE ArcBuild end to end -- the
 * merged successor to the old, separately-routed BUILD-GOAL
 * (build/ProfileBuilderScreen.tsx) and BUILD-ARC (build/ArcMapScreen.tsx)
 * screens. Reuses their exact same underlying step machinery
 * (build/profileWizard.ts's GOAL_STEP_ORDER/STATE_ARC_STEP_ORDER/
 * IDENTITY_ARC_STEP_ORDER, shouldShowProfileStep, getFirstProfileStep/
 * getNextProfileStep/getPreviousProfileStep, buildProfileFromDraft,
 * draftFromProfileAndSelection, selectionFromDraft), completely
 * unchanged -- only ORCHESTRATION is new: instead of two independent
 * routes each owning one array, this screen walks up to three phases
 * in sequence within ONE array-at-a-time state (`phase`), exactly
 * mirroring how ArcMapScreen already switched between its two targets
 * (finishAndSwitchTarget) -- just with the (now goal-less) GOAL steps
 * as an unconditional first phase, ahead of state/identity.
 *
 * Phase order: "goal" (always) -> "state" (only if draft.needsState)
 * -> "identity" (only if resolvesNeedsIdentity(draft)) -> save. Each
 * phase's own "review" step is its internal end marker (unchanged
 * meaning from before), not a final save -- advancing past it either
 * moves to the next needed phase or actually persists, matching
 * ArcMapScreen's finishAndSwitchTarget/finishAndExit split exactly.
 *
 * Saves back onto the ONE ArcBuild identified by the `id` route param
 * only (data/storage.ts's upsertArcBuild) -- never a second, global
 * profile, and never any other build's own fields.
 */

type Phase = "goal" | "state" | "identity";

function stepOrderFor(phase: Phase): ProfileStep[] {
  if (phase === "goal") return GOAL_STEP_ORDER;
  if (phase === "state") return STATE_ARC_STEP_ORDER;
  return IDENTITY_ARC_STEP_ORDER;
}

function isCompleteFor(phase: Phase, draft: ProfileDraft): boolean {
  if (phase === "goal") return isGoalDraftComplete(draft);
  if (phase === "state") return isStateArcDraftComplete(draft);
  return isIdentityArcDraftComplete(draft);
}

const GOAL_STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  negativeActionEnabledAsk: "האם תרצה להפעיל כלי לצמצום פעולה שלילית? (רשות)",
  habit: "מה הפעולה השלילית שתרצה לצמצם?",
  negativeActionDuration: "כמה זמן, בדקות, לאפשר לפעולה הזו? (1 עד 15 דקות)",
  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע במקומו? (ההרגל הרצוי)",
  beneficialActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  needsState: "האם יש מצב פנימי (כמו רוגע, ביטחון או חמלה) שתרצה לפתח ולחזק?",
  needsIdentityImmediately: "לעבוד גם על זהות מקבילה כבר מההתחלה?",
  needsIdentityExplicit: "האם יש זהות שתרצה לפתח?",
  desiredIdentity: "מה הזהות הרצויה?",
  supportiveState: "מה המצב הרצוי שתרצה לחוש יותר?",
  internalAction: "מה הפעולה הפנימית שלך? (למשל סריקת גוף)",
  internalActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
};
const GOAL_TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  habit: "habit",
  beneficialAction: "beneficialAction",
  beneficialActionBodyCue: "beneficialActionBodyCue",
  desiredIdentity: "desiredIdentity",
  supportiveState: "supportiveState",
  internalAction: "internalAction",
  internalActionBodyCue: "internalActionBodyCue",
  preventiveActionDescription: "preventiveActionDescription",
  regulationTool: "regulationTool",
};
const GOAL_OPTIONAL_TEXT_STEPS: ProfileStep[] = ["beneficialActionBodyCue", "internalActionBodyCue"];
const GOAL_YESNO_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  needsState: "needsState",
  needsIdentityImmediately: "needsIdentityImmediately",
  needsIdentityExplicit: "needsIdentityExplicit",
  preventiveActionAsk: "hasPreventiveAction",
  negativeActionEnabledAsk: "negativeActionReductionEnabled",
};

const STATE_STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  challengeContext: "באילו מצבים המצב הרצוי הזה במיוחד רלוונטי? (הקשר האתגר)",
  interferingState: "מה נוטה להפריע למצב הרצוי הזה?",
  statePreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  stateEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  stateEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  stateMantra: "יש לך מנטרה למצב הזה? (רשות)",
  stateBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך במצב הזה? (רשות, למשל כתפיים משוחררות)",
};
const STATE_TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  challengeContext: "challengeContext",
  interferingState: "interferingState",
  statePreventiveAction: "statePreventiveAction",
  stateEncodingRegulationCue: "stateEncodingRegulationCue",
  stateMantra: "stateMantra",
  stateBodyLanguageCue: "stateBodyLanguageCue",
};
const STATE_ASK_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  stateEncodingRegulationCueAsk: "stateWantsShortEncodingRegulationCue",
};
const STATE_OPTIONAL_STEPS: ProfileStep[] = ["statePreventiveAction", "stateEncodingRegulationCue", "stateMantra", "stateBodyLanguageCue"];

const IDENTITY_STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  identityChallengeContext: "באילו מצבים הזהות הרצויה הזו במיוחד רלוונטית? (הקשר האתגר)",
  identityInterferingEmotion: "מה נוטה להפריע לזהות הזו?",
  identityPreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  identityEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  identityEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  identityMantra: "יש לך מנטרה לזהות הזו? (רשות)",
  identityBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך בזהות הזו? (רשות)",
};
const IDENTITY_TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  identityChallengeContext: "identityChallengeContext",
  identityInterferingEmotion: "identityInterferingEmotion",
  identityPreventiveAction: "identityPreventiveAction",
  identityEncodingRegulationCue: "identityEncodingRegulationCue",
  identityMantra: "identityMantra",
  identityBodyLanguageCue: "identityBodyLanguageCue",
};
const IDENTITY_ASK_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  identityEncodingRegulationCueAsk: "identityWantsShortEncodingRegulationCue",
};
const IDENTITY_OPTIONAL_STEPS: ProfileStep[] = [
  "identityPreventiveAction",
  "identityEncodingRegulationCue",
  "identityMantra",
  "identityBodyLanguageCue",
];

function titleFor(phase: Phase, step: ProfileStep): string | undefined {
  if (step === "dwellTimes") return "זמן שהייה";
  if (step === "review") return phase === "goal" ? "סיכום" : "סיכום מפת ARC";
  if (phase === "goal") return GOAL_STEP_TITLES[step];
  if (phase === "state") return STATE_STEP_TITLES[step];
  return IDENTITY_STEP_TITLES[step];
}
function textFieldFor(phase: Phase, step: ProfileStep): keyof ProfileDraft | undefined {
  if (phase === "goal") return GOAL_TEXT_STEP_FIELDS[step];
  if (phase === "state") return STATE_TEXT_STEP_FIELDS[step];
  return IDENTITY_TEXT_STEP_FIELDS[step];
}
function askFieldFor(phase: Phase, step: ProfileStep): keyof ProfileDraft | undefined {
  if (phase === "state") return STATE_ASK_STEP_FIELDS[step];
  if (phase === "identity") return IDENTITY_ASK_STEP_FIELDS[step];
  return undefined;
}
function yesNoFieldFor(phase: Phase, step: ProfileStep): keyof ProfileDraft | undefined {
  return phase === "goal" ? GOAL_YESNO_STEP_FIELDS[step] : undefined;
}
function isOptionalTextStep(phase: Phase, step: ProfileStep): boolean {
  if (phase === "goal") return GOAL_OPTIONAL_TEXT_STEPS.includes(step);
  if (phase === "state") return STATE_OPTIONAL_STEPS.includes(step);
  return IDENTITY_OPTIONAL_STEPS.includes(step);
}

const NEGATIVE_ACTION_DURATION_OPTIONS: number[] = Array.from(
  { length: NEGATIVE_ACTION_MAX_DURATION_MINUTES - NEGATIVE_ACTION_MIN_DURATION_MINUTES + 1 },
  (_, index) => NEGATIVE_ACTION_MIN_DURATION_MINUTES + index
);

const DWELL_ROWS: { key: keyof DwellTimes; label: string }[] = [
  { key: "sensationDwellSeconds", label: "תחושה / מודעות" },
  { key: "acceptanceDwellSeconds", label: "קבלה" },
  { key: "regulationDwellSeconds", label: "ויסות" },
  { key: "encodingDwellSeconds", label: "קידוד / שפת גוף" },
  { key: "actionImageryDwellSeconds", label: "דמיון פעולה" },
  { key: "presenceDwellSeconds", label: "נוכחות" },
  { key: "stopImageryDwellSeconds", label: "דמיון עצירה" },
];

/** Maps a dwell category + the currently-edited phase to its ProfileDraft field name -- only meaningful for phase "state"/"identity" (the "dwellTimes" step never appears in the goal phase). */
function dwellDraftFieldFor(phase: "state" | "identity", key: keyof DwellTimes): keyof ProfileDraft {
  const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return `${phase}${capitalized}` as keyof ProfileDraft;
}

type ScreenStatus = "loading" | "notFound" | "editing";

export default function ArcBuildEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [build, setBuild] = useState<ArcBuild | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [phase, setPhase] = useState<Phase>("goal");
  const [step, setStep] = useState<ProfileStep>("review");

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    getArcBuild(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      const loadedDraft = draftFromProfileAndSelection(existing.profile, {
        needsState: existing.needsState,
        needsIdentity: existing.needsIdentity,
        needsHabit: existing.needsHabit,
        needsIdentityImmediately: existing.needsIdentityImmediately,
        programPath: existing.profile.programPath,
      });
      setBuild(existing);
      setDraft(loadedDraft);
      setPhase("goal");
      setStep(getFirstProfileStep(loadedDraft, GOAL_STEP_ORDER));
      setStatus("editing");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const goNext = useCallback(
    (nextDraft: ProfileDraft) => {
      setDraft(nextDraft);
      setStep((current) => getNextProfileStep(current, nextDraft, stepOrderFor(phase)));
    },
    [phase]
  );

  const goBack = useCallback(() => {
    setStep((current) => getPreviousProfileStep(current, draft, stepOrderFor(phase)) ?? current);
  }, [draft, phase]);

  function enterPhase(nextPhase: Phase, currentDraft: ProfileDraft) {
    setPhase(nextPhase);
    setStep(getFirstProfileStep(currentDraft, stepOrderFor(nextPhase)));
  }

  /** After a phase's own "review" step: move to the next NEEDED phase, or persist and exit if none remain -- exactly mirroring ArcMapScreen's finishAndSwitchTarget/finishAndExit split, just generalized to three phases instead of two. */
  async function advancePastReview(currentDraft: ProfileDraft) {
    if (phase === "goal") {
      if (currentDraft.needsState === true) {
        enterPhase("state", currentDraft);
        return;
      }
      if (resolvesNeedsIdentity(currentDraft)) {
        enterPhase("identity", currentDraft);
        return;
      }
      await finishAndSave(currentDraft);
      return;
    }
    if (phase === "state") {
      if (resolvesNeedsIdentity(currentDraft)) {
        enterPhase("identity", currentDraft);
        return;
      }
      await finishAndSave(currentDraft);
      return;
    }
    await finishAndSave(currentDraft);
  }

  async function finishAndSave(finalDraft: ProfileDraft) {
    if (!build) return;
    const selection = selectionFromDraft(finalDraft);
    const updated: ArcBuild = {
      ...build,
      needsState: selection.needsState,
      needsIdentity: selection.needsIdentity,
      needsHabit: selection.needsHabit,
      needsIdentityImmediately: selection.needsIdentityImmediately,
      profile: { ...buildProfileFromDraft(finalDraft), programPath: build.profile.programPath },
      updatedAt: new Date().toISOString(),
    };
    await upsertArcBuild(updated);
    router.back();
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>ה-ARC Build לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/build")}>
            <Text style={styles.buttonText}>חזרה לרשימת הפרוטוקולים</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const textField = textFieldFor(phase, step);
  const askField = askFieldFor(phase, step);
  const yesNoField = yesNoFieldFor(phase, step);
  const isOptional = isOptionalTextStep(phase, step);
  const firstStepOfPhase = stepOrderFor(phase)[0];
  const isFirstStepOverall = phase === "goal" && step === firstStepOfPhase;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{build?.name}</Text>
        <Text style={styles.title}>{titleFor(phase, step)}</Text>

        {textField && (
          <View>
            <TextInput
              style={styles.textInput}
              value={draft[textField] as string}
              onChangeText={(value) => setDraft({ ...draft, [textField]: value })}
              textAlign="right"
              autoFocus
            />
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              disabled={!isOptional && (draft[textField] as string).trim().length === 0}
              onPress={() => goNext(draft)}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "negativeActionDuration" && (
          <View>
            <View style={styles.chipRow}>
              {NEGATIVE_ACTION_DURATION_OPTIONS.map((minutes) => (
                <Pressable
                  key={minutes}
                  style={[styles.chip, draft.negativeActionBaseDurationMinutes === minutes && styles.chipSelected]}
                  onPress={() => setDraft({ ...draft, negativeActionBaseDurationMinutes: minutes })}
                >
                  <Text style={styles.buttonText}>{minutes} דק&apos;</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, styles.fullWidthButton, draft.negativeActionBaseDurationMinutes === null && styles.buttonDisabled]}
              disabled={draft.negativeActionBaseDurationMinutes === null}
              onPress={() => goNext(draft)}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {yesNoField && (
          <View style={styles.buttonRow}>
            {[true, false].map((answer) => (
              <Pressable key={String(answer)} style={styles.button} onPress={() => goNext({ ...draft, [yesNoField]: answer })}>
                <Text style={styles.buttonText}>{answer ? "כן" : "לא"}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {askField && (
          <View>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => goNext({ ...draft, [askField]: false })}>
              <Text style={styles.buttonText}>השתמש באותו כלי ויסות</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => goNext({ ...draft, [askField]: true })}>
              <Text style={styles.buttonText}>בחר כלי ויסות קצר לקידוד</Text>
            </Pressable>
          </View>
        )}

        {step === "dwellTimes" && (phase === "state" || phase === "identity") && (
          <View>
            <Text style={styles.body}>כמה זמן תרצה להישאר בתרגיל לאחר סיום ההנחיה?</Text>
            {DWELL_ROWS.map((row) => {
              const field = dwellDraftFieldFor(phase, row.key);
              return (
                <View key={row.key} style={styles.dwellRow}>
                  <Text style={styles.dwellLabel}>{row.label}</Text>
                  <TextInput
                    style={styles.dwellInput}
                    value={draft[field] as string}
                    onChangeText={(text) => setDraft({ ...draft, [field]: text.replace(/[^0-9]/g, "") })}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <Text style={styles.dwellUnit}>שניות</Text>
                </View>
              );
            })}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => goNext(draft)}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "review" && phase === "goal" && (
          <View>
            <Text style={styles.body}>{`פעולה מיטיבה (הרגל רצוי): ${draft.beneficialAction}`}</Text>
            {draft.negativeActionReductionEnabled === true && (
              <>
                <Text style={styles.body}>{`פעולה שלילית: ${draft.habit}`}</Text>
                {draft.negativeActionBaseDurationMinutes !== null && (
                  <Text style={styles.body}>{`זמן מותר: ${draft.negativeActionBaseDurationMinutes} דקות`}</Text>
                )}
              </>
            )}
            {draft.needsState && <Text style={styles.body}>{`מצב רצוי: ${draft.supportiveState}`}</Text>}
            {resolvesNeedsIdentity(draft) && <Text style={styles.body}>{`זהות רצויה: ${draft.desiredIdentity}`}</Text>}
            <Text style={styles.body}>{`כלי ויסות: ${draft.regulationTool}`}</Text>
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              disabled={!isCompleteFor("goal", draft)}
              onPress={() => advancePastReview(draft)}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "review" && (phase === "state" || phase === "identity") && (
          <View>
            {phase === "state" ? (
              <>
                <Text style={styles.body}>{`מצב רצוי: ${draft.supportiveState}`}</Text>
                <Text style={styles.body}>{`נוטה להפריע: ${draft.interferingState}`}</Text>
                <Text style={styles.body}>{`הקשר אתגר: ${draft.challengeContext}`}</Text>
                {draft.statePreventiveAction && <Text style={styles.body}>{`פעולה מונעת: ${draft.statePreventiveAction}`}</Text>}
                {draft.stateWantsShortEncodingRegulationCue === true && draft.stateEncodingRegulationCue && (
                  <Text style={styles.body}>{`כלי ויסות קצר לקידוד: ${draft.stateEncodingRegulationCue}`}</Text>
                )}
                {draft.stateBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.stateBodyLanguageCue}`}</Text>}
                {draft.stateMantra && <Text style={styles.body}>{`מנטרה: ${draft.stateMantra}`}</Text>}
              </>
            ) : (
              <>
                <Text style={styles.body}>{`זהות רצויה: ${draft.desiredIdentity}`}</Text>
                <Text style={styles.body}>{`נוטה להפריע: ${draft.identityInterferingEmotion}`}</Text>
                <Text style={styles.body}>{`הקשר אתגר: ${draft.identityChallengeContext}`}</Text>
                {draft.identityPreventiveAction && <Text style={styles.body}>{`פעולה מונעת: ${draft.identityPreventiveAction}`}</Text>}
                {draft.identityWantsShortEncodingRegulationCue === true && draft.identityEncodingRegulationCue && (
                  <Text style={styles.body}>{`כלי ויסות קצר לקידוד: ${draft.identityEncodingRegulationCue}`}</Text>
                )}
                {draft.identityBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.identityBodyLanguageCue}`}</Text>}
                {draft.identityMantra && <Text style={styles.body}>{`מנטרה: ${draft.identityMantra}`}</Text>}
              </>
            )}
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              disabled={!isCompleteFor(phase, draft)}
              onPress={() => advancePastReview(draft)}
            >
              <Text style={styles.buttonText}>שמור</Text>
            </Pressable>
          </View>
        )}

        {!isFirstStepOverall && (
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>חזור</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 8 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  dwellRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  dwellLabel: { flex: 1, fontSize: 16, textAlign: "right" },
  dwellInput: { width: 56, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, fontSize: 16, marginHorizontal: 8 },
  dwellUnit: { fontSize: 14, color: "#666" },
});

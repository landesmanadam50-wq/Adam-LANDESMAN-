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
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";
import { NEGATIVE_ACTION_MAX_DURATION_MINUTES, NEGATIVE_ACTION_MIN_DURATION_MINUTES } from "../program/engine.ts";
import type { ArcBuild, DwellTimes } from "../arc/types.ts";

/**
 * ARC Builds task (correction): ONE screen editing ONE, SINGLE-target
 * ArcBuild -- an ArcBuild targets exactly ONE layer (state, identity,
 * or habit), chosen once up front, never a bundle of several targets
 * walked one after another. This replaces the earlier version of this
 * screen, which still asked a needsState/needsIdentity "do you also
 * want...?" cascade and sequenced through up to two target-specific ARC
 * Maps with a "save and move to the next map" step in between -- the
 * exact "one ARC Map per Desired Goal, guided sequentially" pattern
 * this correction removes. The ArcBuild's own name (chosen at creation,
 * on the ARC Builds list screen) is its only identity; it is never
 * derived from, or shown as, the Desired State/Identity text.
 *
 * Reuses build/profileWizard.ts's step machinery completely unchanged
 * (shouldShowProfileStep/getFirstProfileStep/getNextProfileStep/
 * getPreviousProfileStep, buildProfileFromDraft, draftFromProfileAndSelection)
 * -- only the STEP ORDER ARRAYS below are new, each a flat,
 * single-target list mixing existing ProfileStep values (never new
 * ones except identityAction/identityActionBodyCue, added alongside
 * this correction so a standalone identity-targeted build can capture
 * its own Action without depending on a habit target's beneficialAction
 * -- see profileWizard.ts's ProfileDraft.identityAction doc).
 * draft.needsState/needsIdentityExplicit are set ONCE, to match the
 * chosen target, before any step is shown, so shouldShowProfileStep's
 * existing per-field gating (built around those same flags) continues
 * to work completely unmodified.
 *
 * Saves back onto the ONE ArcBuild identified by the `id` route param
 * only (data/storage.ts's upsertArcBuild) -- never a second, global
 * profile, and never any other build's own fields. Every field not
 * relevant to the chosen target is explicitly cleared to null on save,
 * so deriveActiveLayersForArcBuild (arc/arcEngine.ts) always resolves
 * this build to exactly the one layer it targets, never more.
 */

type Target = "state" | "identity" | "habit";

const STATE_STEPS: ProfileStep[] = [
  "presenceColor",
  "supportiveState",
  "challengeContext",
  "interferingState",
  "internalAction",
  "internalActionBodyCue",
  "statePreventiveAction",
  "regulationTool",
  "stateEncodingRegulationCueAsk",
  "stateEncodingRegulationCue",
  "stateMantra",
  "stateBodyLanguageCue",
  "dwellTimes",
  "review",
];

const IDENTITY_STEPS: ProfileStep[] = [
  "presenceColor",
  "desiredIdentity",
  "identityChallengeContext",
  "identityInterferingEmotion",
  "identityAction",
  "identityActionBodyCue",
  "identityPreventiveAction",
  "regulationTool",
  "identityEncodingRegulationCueAsk",
  "identityEncodingRegulationCue",
  "identityMantra",
  "identityBodyLanguageCue",
  "dwellTimes",
  "review",
];

const HABIT_STEPS: ProfileStep[] = [
  "presenceColor",
  "beneficialAction",
  "beneficialActionBodyCue",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
  "negativeActionEnabledAsk",
  "habit",
  "negativeActionDuration",
  "review",
];

function stepOrderFor(target: Target): ProfileStep[] {
  if (target === "state") return STATE_STEPS;
  if (target === "identity") return IDENTITY_STEPS;
  return HABIT_STEPS;
}

/** Required fields for THIS target only -- mirrors each field's own existing required/optional status (Challenge Context + Interfering State required, the target's own Action required, regulationTool always required, Negative Action's own fields required only once enabled), scoped to one target instead of a whole bundled draft. */
function isTargetDraftComplete(target: Target, draft: ProfileDraft): boolean {
  // Presence Color task: required for every target, exactly like
  // regulationTool right below -- a legacy build reopened for editing
  // cannot pass this check again until the trainee fills it in.
  if (draft.presenceColor.trim().length === 0) return false;
  if (draft.regulationTool.trim().length === 0) return false;
  if (target === "state") {
    return (
      draft.supportiveState.trim().length > 0 && draft.challengeContext.trim().length > 0 && draft.interferingState.trim().length > 0
    );
  }
  if (target === "identity") {
    return (
      draft.desiredIdentity.trim().length > 0 &&
      draft.identityChallengeContext.trim().length > 0 &&
      draft.identityInterferingEmotion.trim().length > 0
    );
  }
  if (draft.beneficialAction.trim().length === 0) return false;
  if (draft.negativeActionReductionEnabled === null) return false;
  if (draft.negativeActionReductionEnabled === true) {
    if (draft.habit.trim().length === 0) return false;
    if (draft.negativeActionBaseDurationMinutes === null) return false;
  }
  return true;
}

/** Sets exactly the needs-flags shouldShowProfileStep already gates on to match ONE chosen target -- never both/neither, so the existing per-field gating (built for the old bundled model) shows exactly this target's own steps. */
function draftForTarget(target: Target, base: ProfileDraft): ProfileDraft {
  return {
    ...base,
    needsState: target === "state",
    needsIdentityImmediately: target === "state" ? false : base.needsIdentityImmediately,
    needsIdentityExplicit: target === "identity",
  };
}

const STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  presenceColor: "באיזה צבע מתמלאת הנוכחות שלך?",
  supportiveState: "מה המצב הרצוי שתרצה לחוש יותר?",
  challengeContext: "באילו מצבים המצב הרצוי הזה במיוחד רלוונטי? (הקשר האתגר)",
  interferingState: "מה נוטה להפריע למצב הרצוי הזה? (לזיהוי בלבד)",
  internalAction: "מה הפעולה הפנימית שלך? (למשל סריקת גוף)",
  internalActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  statePreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  stateEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  stateEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  stateMantra: "יש לך מנטרה למצב הזה? (רשות)",
  stateBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך במצב הזה? (רשות, למשל כתפיים משוחררות)",

  desiredIdentity: "מה הזהות הרצויה?",
  identityChallengeContext: "באילו מצבים הזהות הרצויה הזו במיוחד רלוונטית? (הקשר האתגר)",
  identityInterferingEmotion: "מה נוטה להפריע לזהות הזו? (לזיהוי בלבד)",
  identityAction: "מה הפעולה שמבטאת את הזהות הזו?",
  identityActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  identityPreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  identityEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  identityEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  identityMantra: "יש לך מנטרה לזהות הזו? (רשות)",
  identityBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך בזהות הזו? (רשות)",

  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע? (ההרגל הרצוי)",
  beneficialActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  negativeActionEnabledAsk: "האם תרצה להפעיל כלי לצמצום פעולה שלילית? (רשות)",
  habit: "מה הפעולה השלילית שתרצה לצמצם?",
  negativeActionDuration: "כמה זמן, בדקות, לאפשר לפעולה הזו? (1 עד 15 דקות)",

  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
  dwellTimes: "זמן שהייה",
  review: "סיכום",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  presenceColor: "presenceColor",
  supportiveState: "supportiveState",
  challengeContext: "challengeContext",
  interferingState: "interferingState",
  internalAction: "internalAction",
  internalActionBodyCue: "internalActionBodyCue",
  statePreventiveAction: "statePreventiveAction",
  stateEncodingRegulationCue: "stateEncodingRegulationCue",
  stateMantra: "stateMantra",
  stateBodyLanguageCue: "stateBodyLanguageCue",

  desiredIdentity: "desiredIdentity",
  identityChallengeContext: "identityChallengeContext",
  identityInterferingEmotion: "identityInterferingEmotion",
  identityAction: "identityAction",
  identityActionBodyCue: "identityActionBodyCue",
  identityPreventiveAction: "identityPreventiveAction",
  identityEncodingRegulationCue: "identityEncodingRegulationCue",
  identityMantra: "identityMantra",
  identityBodyLanguageCue: "identityBodyLanguageCue",

  beneficialAction: "beneficialAction",
  beneficialActionBodyCue: "beneficialActionBodyCue",
  preventiveActionDescription: "preventiveActionDescription",
  habit: "habit",

  regulationTool: "regulationTool",
};

const OPTIONAL_TEXT_STEPS: ProfileStep[] = [
  "internalActionBodyCue",
  "statePreventiveAction",
  "stateMantra",
  "stateBodyLanguageCue",
  "identityActionBodyCue",
  "identityPreventiveAction",
  "identityMantra",
  "identityBodyLanguageCue",
  "beneficialActionBodyCue",
];

const ASK_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  stateEncodingRegulationCueAsk: "stateWantsShortEncodingRegulationCue",
  identityEncodingRegulationCueAsk: "identityWantsShortEncodingRegulationCue",
};
const YESNO_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  preventiveActionAsk: "hasPreventiveAction",
  negativeActionEnabledAsk: "negativeActionReductionEnabled",
};

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

/** Maps a dwell category + the chosen target to its ProfileDraft field name -- only meaningful for target "state"/"identity" (habit has no dwellTimes step -- see the field's own pre-existing architecture: dwell times were never asked for the habit layer). */
function dwellDraftFieldFor(target: "state" | "identity", key: keyof DwellTimes): keyof ProfileDraft {
  const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return `${target}${capitalized}` as keyof ProfileDraft;
}

/** Infers this build's already-configured target from its saved profile, for reopening an existing build directly into its own flow -- never shows the target choice again once a target is set. state/identity/habit priority order matches deriveActiveLayersForArcBuild's own (arc/arcEngine.ts), for the rare case more than one somehow ended up configured. */
function inferTarget(profile: ArcBuild["profile"]): Target | null {
  if (profile.stateEncoding !== null || profile.internalAction !== null) return "state";
  if (profile.identityEncoding !== null || profile.identityAction !== null) return "identity";
  if (profile.beneficialAction !== null) return "habit";
  return null;
}

type ScreenStatus = "loading" | "notFound" | "choosingTarget" | "editing";

export default function ArcBuildEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [build, setBuild] = useState<ArcBuild | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
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
      setBuild(existing);
      const inferredTarget = inferTarget(existing.profile);
      const loadedDraft = draftFromProfileAndSelection(existing.profile, {
        needsState: existing.needsState,
        needsIdentity: existing.needsIdentity,
        needsHabit: existing.needsHabit,
        needsIdentityImmediately: existing.needsIdentityImmediately,
        programPath: existing.profile.programPath,
      });
      if (inferredTarget) {
        const targetDraft = draftForTarget(inferredTarget, loadedDraft);
        setTarget(inferredTarget);
        setDraft(targetDraft);
        setStep(getFirstProfileStep(targetDraft, stepOrderFor(inferredTarget)));
        setStatus("editing");
      } else {
        setDraft(loadedDraft);
        setStatus("choosingTarget");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function chooseTarget(chosen: Target) {
    const targetDraft = draftForTarget(chosen, draft);
    setTarget(chosen);
    setDraft(targetDraft);
    setStep(getFirstProfileStep(targetDraft, stepOrderFor(chosen)));
    setStatus("editing");
  }

  const goNext = useCallback(
    (nextDraft: ProfileDraft) => {
      if (!target) return;
      setDraft(nextDraft);
      setStep((current) => getNextProfileStep(current, nextDraft, stepOrderFor(target)));
    },
    [target]
  );

  const goBack = useCallback(() => {
    if (!target) return;
    setStep((current) => getPreviousProfileStep(current, draft, stepOrderFor(target)) ?? current);
  }, [draft, target]);

  async function finishAndSave() {
    if (!build || !target) return;
    // Clears every OTHER target's fields to null explicitly, regardless
    // of what buildProfileFromDraft itself defaults to -- guarantees
    // this build resolves to exactly the one layer it targets (never
    // more), matching deriveActiveLayersForArcBuild's own detection.
    const rawProfile = buildProfileFromDraft(draft);
    const profile =
      target === "state"
        ? {
            ...rawProfile,
            desiredIdentity: null,
            identityChallengeContext: null,
            identityInterferingEmotion: null,
            identityPreventiveAction: null,
            identityEncodingRegulationCue: null,
            identityEncoding: null,
            identityAction: null,
            identityActionBodyCue: null,
            identityDwellTimes: null,
            beneficialAction: null,
            beneficialActionBodyCue: null,
            preventiveAction: null,
            habit: null,
            negativeActionBaseDurationMinutes: null,
            negativeActionReductionEnabled: false,
          }
        : target === "identity"
          ? {
              ...rawProfile,
              supportiveState: null,
              challengeContext: null,
              interferingState: null,
              statePreventiveAction: null,
              stateEncodingRegulationCue: null,
              stateEncoding: null,
              internalAction: null,
              internalActionBodyCue: null,
              stateDwellTimes: null,
              beneficialAction: null,
              beneficialActionBodyCue: null,
              preventiveAction: null,
              habit: null,
              negativeActionBaseDurationMinutes: null,
              negativeActionReductionEnabled: false,
            }
          : {
              ...rawProfile,
              supportiveState: null,
              challengeContext: null,
              interferingState: null,
              statePreventiveAction: null,
              stateEncodingRegulationCue: null,
              stateEncoding: null,
              internalAction: null,
              internalActionBodyCue: null,
              stateDwellTimes: null,
              desiredIdentity: null,
              identityChallengeContext: null,
              identityInterferingEmotion: null,
              identityPreventiveAction: null,
              identityEncodingRegulationCue: null,
              identityEncoding: null,
              identityAction: null,
              identityActionBodyCue: null,
              identityDwellTimes: null,
            };

    const updated: ArcBuild = {
      ...build,
      needsState: target === "state",
      needsIdentity: target === "identity",
      needsHabit: target === "habit",
      needsIdentityImmediately: false,
      profile: { ...profile, programPath: build.profile.programPath },
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

  if (status === "choosingTarget") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>{build?.name}</Text>
          <Text style={styles.title}>על מה יתמקד ה-ARC Build הזה?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("state")}>
            <Text style={styles.buttonText}>מצב פנימי (למשל רוגע, ביטחון, חמלה)</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("identity")}>
            <Text style={styles.buttonText}>זהות רצויה</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("habit")}>
            <Text style={styles.buttonText}>הרגל רצוי (פעולה מיטיבה)</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "editing" -- target is guaranteed non-null here.
  const activeTarget = target as Target;
  const textField = TEXT_STEP_FIELDS[step];
  const askField = ASK_STEP_FIELDS[step];
  const yesNoField = YESNO_STEP_FIELDS[step];
  const isOptional = OPTIONAL_TEXT_STEPS.includes(step);
  const firstStep = stepOrderFor(activeTarget)[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{build?.name}</Text>
        <Text style={styles.title}>{STEP_TITLES[step]}</Text>

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

        {step === "dwellTimes" && (activeTarget === "state" || activeTarget === "identity") && (
          <View>
            <Text style={styles.body}>כמה זמן תרצה להישאר בתרגיל לאחר סיום ההנחיה?</Text>
            {DWELL_ROWS.map((row) => {
              const field = dwellDraftFieldFor(activeTarget, row.key);
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

        {step === "review" && (
          <View>
            <Text style={styles.body}>{`צבע נוכחות: ${draft.presenceColor}`}</Text>
            {activeTarget === "state" && (
              <>
                <Text style={styles.body}>{`מצב רצוי: ${draft.supportiveState}`}</Text>
                <Text style={styles.body}>{`נוטה להפריע: ${draft.interferingState}`}</Text>
                <Text style={styles.body}>{`הקשר אתגר: ${draft.challengeContext}`}</Text>
                {draft.internalAction && <Text style={styles.body}>{`פעולה פנימית: ${draft.internalAction}`}</Text>}
                {draft.statePreventiveAction && <Text style={styles.body}>{`פעולה מונעת: ${draft.statePreventiveAction}`}</Text>}
                {draft.stateBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.stateBodyLanguageCue}`}</Text>}
                {draft.stateMantra && <Text style={styles.body}>{`מנטרה: ${draft.stateMantra}`}</Text>}
              </>
            )}
            {activeTarget === "identity" && (
              <>
                <Text style={styles.body}>{`זהות רצויה: ${draft.desiredIdentity}`}</Text>
                <Text style={styles.body}>{`נוטה להפריע: ${draft.identityInterferingEmotion}`}</Text>
                <Text style={styles.body}>{`הקשר אתגר: ${draft.identityChallengeContext}`}</Text>
                {draft.identityAction && <Text style={styles.body}>{`פעולה: ${draft.identityAction}`}</Text>}
                {draft.identityPreventiveAction && <Text style={styles.body}>{`פעולה מונעת: ${draft.identityPreventiveAction}`}</Text>}
                {draft.identityBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.identityBodyLanguageCue}`}</Text>}
                {draft.identityMantra && <Text style={styles.body}>{`מנטרה: ${draft.identityMantra}`}</Text>}
              </>
            )}
            {activeTarget === "habit" && (
              <>
                <Text style={styles.body}>{`פעולה מיטיבה: ${draft.beneficialAction}`}</Text>
                {draft.negativeActionReductionEnabled === true && (
                  <>
                    <Text style={styles.body}>{`פעולה שלילית: ${draft.habit}`}</Text>
                    {draft.negativeActionBaseDurationMinutes !== null && (
                      <Text style={styles.body}>{`זמן מותר: ${draft.negativeActionBaseDurationMinutes} דקות`}</Text>
                    )}
                  </>
                )}
              </>
            )}
            <Text style={styles.body}>{`כלי ויסות: ${draft.regulationTool}`}</Text>
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              disabled={!isTargetDraftComplete(activeTarget, draft)}
              onPress={finishAndSave}
            >
              <Text style={styles.buttonText}>שמור</Text>
            </Pressable>
          </View>
        )}

        {step !== firstStep && (
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

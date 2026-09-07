import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, upsertArcBuild } from "../data/storage.ts";
import {
  createEmptyDraft,
  draftFromProfileAndSelection,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";
import { buildArcBuildProfileForSave, draftForTarget, inferTarget, isTargetDraftComplete, type Target } from "./arcBuildSave.ts";
import { NEGATIVE_ACTION_MAX_DURATION_MINUTES, NEGATIVE_ACTION_MIN_DURATION_MINUTES } from "../program/engine.ts";
import { ARC_LINK_TRIGGER_TYPE_LABELS } from "../arc/bodyImagery.ts";
import type { ArcLinkTriggerType } from "../arc/bodyImagery.ts";
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
 * getPreviousProfileStep, draftFromProfileAndSelection) -- only the STEP
 * ORDER ARRAYS below are new, each a flat, single-target list mixing
 * existing ProfileStep values (never new ones except
 * identityAction/identityActionBodyCue, added alongside this correction
 * so a standalone identity-targeted build can capture its own Action
 * without depending on a habit target's beneficialAction -- see
 * profileWizard.ts's ProfileDraft.identityAction doc).
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
 *
 * Presence Color bug-fix task: the actual draft-to-profile conversion
 * (buildProfileFromDraft, whose own internal completeness gate was
 * never compatible with a single-target draft) now goes through
 * build/arcBuildSave.ts's buildArcBuildProfileForSave instead of being
 * called directly here -- see that module's doc for the full root
 * cause. isTargetDraftComplete/draftForTarget/inferTarget/Target moved
 * there too, unchanged, so the pure save-path logic (previously only
 * reachable by driving the UI) can be covered by node --test.
 */

const STATE_STEPS: ProfileStep[] = [
  "presenceColor",
  // Coherent-architecture task: build-global "why", asked once regardless of target.
  "value",
  "supportiveState",
  "challengeContext",
  "interferingState",
  // Coherent-architecture task (#12 "Barrier map"): classify the mapped barrier before anything else is built around it.
  "stateBarrierType",
  "statePracticalAlternative",
  "internalAction",
  "internalActionBodyCue",
  "statePreventiveAction",
  // Coherent-architecture task (#5/#6 "Building the bridge"): Supporting Action, then Limiting/Bridge Belief.
  "stateSupportingAction",
  "stateLimitingBelief",
  "stateBridgeBelief",
  "regulationTool",
  "regulationBodyParts",
  "regulationMovementText",
  "stateEncodingRegulationCueAsk",
  "stateEncodingRegulationCue",
  // Coherent-architecture task (#7/#8): the Future-Oriented Mantra, distinct from Identity Mantra (stateMantra, right after it).
  "stateFutureOrientedMantra",
  "stateMantra",
  "stateBodyLanguageCue",
  "stateEncodingBodyParts",
  "stateEncodingMovementText",
  "dwellTimes",
  "linkTriggerType",
  "linkTriggerText",
  "review",
];

const IDENTITY_STEPS: ProfileStep[] = [
  "presenceColor",
  "value",
  "desiredIdentity",
  // Coherent-architecture task (#2): how the trainee wants to feel/act while expressing this identity, distinct from the identity itself.
  "identityDesiredState",
  "identityChallengeContext",
  "identityInterferingEmotion",
  "identityBarrierType",
  "identityPracticalAlternative",
  "identityAction",
  "identityActionBodyCue",
  "identityPreventiveAction",
  "identitySupportingAction",
  "identityLimitingBelief",
  "identityBridgeBelief",
  "regulationTool",
  "regulationBodyParts",
  "regulationMovementText",
  "identityEncodingRegulationCueAsk",
  "identityEncodingRegulationCue",
  "identityFutureOrientedMantra",
  "identityMantra",
  "identityBodyLanguageCue",
  "identityEncodingBodyParts",
  "identityEncodingMovementText",
  "dwellTimes",
  "linkTriggerType",
  "linkTriggerText",
  "review",
];

const HABIT_STEPS: ProfileStep[] = [
  "presenceColor",
  "value",
  "beneficialAction",
  "beneficialActionBodyCue",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
  "regulationBodyParts",
  "regulationMovementText",
  "negativeActionEnabledAsk",
  "habit",
  "negativeActionDuration",
  "linkTriggerType",
  "linkTriggerText",
  "review",
];

function stepOrderFor(target: Target): ProfileStep[] {
  if (target === "state") return STATE_STEPS;
  if (target === "identity") return IDENTITY_STEPS;
  return HABIT_STEPS;
}

const STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  presenceColor: "באיזה צבע מתמלאת הנוכחות שלך?",
  value: "מהו הערך שעומד מאחורי הזהות וההרגל הזה? (רשות, למשל בריאות וחופש)",
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
  stateBarrierType: "המכשול שמפריע הוא בעיקר פנימי או מעשי?",
  statePracticalAlternative: "מהו פתרון מעשי, גרסה מצומצמת או פעולה חלופית שיכולים לעזור? (רשות)",
  stateSupportingAction: "יש פעולה תומכת קצרה שיוצרת תנאים טובים יותר לפעולה המרכזית? (רשות, למשל מדיטציה קצרה)",
  stateLimitingBelief: "יש מחשבה שמפריעה לך להתחיל? (רשות)",
  stateBridgeBelief: "מהי פרשנות מאמינה ומתקדמת יותר למחשבה הזו? (רשות)",
  stateFutureOrientedMantra: "לאיזה כיוון אתה מתקדם עכשיו? (רשות, מנטרה מכוונת עתיד)",

  desiredIdentity: "מה הזהות הרצויה?",
  identityDesiredState: "איך תרצה להרגיש ולפעול כשאתה מבטא את הזהות הזו? (רשות)",
  identityChallengeContext: "באילו מצבים הזהות הרצויה הזו במיוחד רלוונטית? (הקשר האתגר)",
  identityInterferingEmotion: "מה נוטה להפריע לזהות הזו? (לזיהוי בלבד)",
  identityAction: "מה הפעולה שמבטאת את הזהות הזו?",
  identityActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  identityPreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  identityEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  identityEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  identityMantra: "יש לך מנטרה לזהות הזו? (רשות)",
  identityBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך בזהות הזו? (רשות)",
  identityBarrierType: "המכשול שמפריע הוא בעיקר פנימי או מעשי?",
  identityPracticalAlternative: "מהו פתרון מעשי, גרסה מצומצמת או פעולה חלופית שיכולים לעזור? (רשות)",
  identitySupportingAction: "יש פעולה תומכת קצרה שיוצרת תנאים טובים יותר לפעולה המרכזית? (רשות, למשל מדיטציה קצרה)",
  identityLimitingBelief: "יש מחשבה שמפריעה לך להתחיל? (רשות)",
  identityBridgeBelief: "מהי פרשנות מאמינה ומתקדמת יותר למחשבה הזו? (רשות)",
  identityFutureOrientedMantra: "לאיזה כיוון אתה מתקדם עכשיו? (רשות, מנטרה מכוונת עתיד)",

  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע? (ההרגל הרצוי)",
  beneficialActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  negativeActionEnabledAsk: "האם תרצה להפעיל כלי לצמצום פעולה שלילית? (רשות)",
  habit: "מה הפעולה השלילית שתרצה לצמצם?",
  negativeActionDuration: "כמה זמן, בדקות, לאפשר לפעולה הזו? (1 עד 15 דקות)",

  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
  dwellTimes: "זמן שהייה",

  linkTriggerType: "מתי או אחרי מה תרצה לזכור להתחיל את התרגיל? (רשות)",
  linkTriggerText: "תאר את הטריגר (רשות, למשל \"בשעה 10:00\" או \"אחרי שאני קם מהמיטה\")",
  regulationBodyParts: "באילו חלקי גוף מתרחש כלי הוויסות? (רשות, מופרדים בפסיק)",
  regulationMovementText: "איך הגוף מבצע את כלי הוויסות? (רשות, לדמיון ב-ARC Link)",
  stateEncodingBodyParts: "באילו חלקי גוף מתרחשת שפת הגוף שהגדרת? (רשות, מופרדים בפסיק)",
  stateEncodingMovementText: "איך הגוף מבצע אותה? (רשות, לדמיון ב-ARC Link)",
  identityEncodingBodyParts: "באילו חלקי גוף מתרחשת שפת הגוף שהגדרת? (רשות, מופרדים בפסיק)",
  identityEncodingMovementText: "איך הגוף מבצע אותה? (רשות, לדמיון ב-ARC Link)",

  review: "סיכום",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  presenceColor: "presenceColor",
  value: "value",
  supportiveState: "supportiveState",
  challengeContext: "challengeContext",
  interferingState: "interferingState",
  statePracticalAlternative: "statePracticalAlternative",
  internalAction: "internalAction",
  internalActionBodyCue: "internalActionBodyCue",
  statePreventiveAction: "statePreventiveAction",
  stateSupportingAction: "stateSupportingAction",
  stateLimitingBelief: "stateLimitingBelief",
  stateBridgeBelief: "stateBridgeBelief",
  stateFutureOrientedMantra: "stateFutureOrientedMantra",
  stateEncodingRegulationCue: "stateEncodingRegulationCue",
  stateMantra: "stateMantra",
  stateBodyLanguageCue: "stateBodyLanguageCue",

  desiredIdentity: "desiredIdentity",
  identityDesiredState: "identityDesiredState",
  identityChallengeContext: "identityChallengeContext",
  identityInterferingEmotion: "identityInterferingEmotion",
  identityPracticalAlternative: "identityPracticalAlternative",
  identityAction: "identityAction",
  identityActionBodyCue: "identityActionBodyCue",
  identityPreventiveAction: "identityPreventiveAction",
  identitySupportingAction: "identitySupportingAction",
  identityLimitingBelief: "identityLimitingBelief",
  identityBridgeBelief: "identityBridgeBelief",
  identityFutureOrientedMantra: "identityFutureOrientedMantra",
  identityEncodingRegulationCue: "identityEncodingRegulationCue",
  identityMantra: "identityMantra",
  identityBodyLanguageCue: "identityBodyLanguageCue",

  beneficialAction: "beneficialAction",
  beneficialActionBodyCue: "beneficialActionBodyCue",
  preventiveActionDescription: "preventiveActionDescription",
  habit: "habit",

  regulationTool: "regulationTool",

  linkTriggerText: "linkTriggerText",
  regulationBodyParts: "regulationBodyParts",
  regulationMovementText: "regulationMovementText",
  stateEncodingBodyParts: "stateEncodingBodyParts",
  stateEncodingMovementText: "stateEncodingMovementText",
  identityEncodingBodyParts: "identityEncodingBodyParts",
  identityEncodingMovementText: "identityEncodingMovementText",
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
  "linkTriggerText",
  "regulationBodyParts",
  "regulationMovementText",
  "stateEncodingBodyParts",
  "stateEncodingMovementText",
  "identityEncodingBodyParts",
  "identityEncodingMovementText",
  "value",
  "identityDesiredState",
  "statePracticalAlternative",
  "identityPracticalAlternative",
  "stateSupportingAction",
  "identitySupportingAction",
  "stateLimitingBelief",
  "stateBridgeBelief",
  "identityLimitingBelief",
  "identityBridgeBelief",
  "stateFutureOrientedMantra",
  "identityFutureOrientedMantra",
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

type ScreenStatus = "loading" | "notFound" | "choosingTarget" | "editing";

export default function ArcBuildEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [build, setBuild] = useState<ArcBuild | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [step, setStep] = useState<ProfileStep>("review");
  const [saveError, setSaveError] = useState<string | null>(null);

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
      setSaveError(null);
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

    // Defense-in-depth: the review screen's own "שמור" button is already
    // disabled while this is false (see below), but re-checking here
    // means a save attempt can never silently no-op -- an incomplete
    // draft always gets an explicit, visible reason instead.
    if (!isTargetDraftComplete(target, draft)) {
      setSaveError("יש להשלים את כל השדות הנדרשים לפני השמירה (כולל צבע נוכחות וכלי ויסות).");
      return;
    }

    setSaveError(null);
    try {
      // buildArcBuildProfileForSave (build/arcBuildSave.ts) is the ONE
      // place this screen turns the draft into a real ArcBuildProfile --
      // it also clears every field not relevant to the chosen target to
      // null, guaranteeing this build resolves to exactly the one layer
      // it targets.
      const profile = buildArcBuildProfileForSave(target, draft, build.name, build.profile.programPath);
      const updated: ArcBuild = {
        ...build,
        needsState: target === "state",
        needsIdentity: target === "identity",
        needsHabit: target === "habit",
        needsIdentityImmediately: false,
        profile,
        updatedAt: new Date().toISOString(),
      };
      await upsertArcBuild(updated);
      router.back();
    } catch {
      // Never let a save failure vanish as a silent, unhandled promise
      // rejection -- the trainee always sees why nothing was saved.
      setSaveError("אירעה שגיאה בשמירת ה-ARC Build. נסה שוב.");
    }
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

        {(step === "stateBarrierType" || step === "identityBarrierType") && (
          <View>
            <View style={styles.chipRow}>
              {(
                [
                  { value: "internal" as const, label: "חסם פנימי" },
                  { value: "practical" as const, label: "חסם מעשי" },
                ]
              ).map((option) => {
                const field = step === "stateBarrierType" ? "stateBarrierType" : "identityBarrierType";
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, draft[field] === option.value && styles.chipSelected]}
                    onPress={() => goNext({ ...draft, [field]: option.value })}
                  >
                    <Text style={styles.buttonText}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => goNext(draft)}>
              <Text style={styles.buttonText}>דלג (רשות)</Text>
            </Pressable>
          </View>
        )}

        {step === "linkTriggerType" && (
          <View>
            <View style={styles.chipRow}>
              {(Object.keys(ARC_LINK_TRIGGER_TYPE_LABELS) as ArcLinkTriggerType[]).map((type) => (
                <Pressable
                  key={type}
                  style={[styles.chip, draft.linkTriggerType === type && styles.chipSelected]}
                  onPress={() => setDraft({ ...draft, linkTriggerType: type })}
                >
                  <Text style={styles.buttonText}>{ARC_LINK_TRIGGER_TYPE_LABELS[type]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => goNext(draft)}>
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
            {draft.value.trim() && <Text style={styles.body}>{`ערך: ${draft.value}`}</Text>}
            {activeTarget === "state" && (
              <>
                <Text style={styles.body}>{`מצב רצוי: ${draft.supportiveState}`}</Text>
                <Text style={styles.body}>{`נוטה להפריע: ${draft.interferingState}`}</Text>
                <Text style={styles.body}>{`הקשר אתגר: ${draft.challengeContext}`}</Text>
                {draft.stateBarrierType && (
                  <Text style={styles.body}>{`סוג המכשול: ${draft.stateBarrierType === "internal" ? "חסם פנימי" : "חסם מעשי"}`}</Text>
                )}
                {draft.statePracticalAlternative && (
                  <Text style={styles.body}>{`פתרון מעשי: ${draft.statePracticalAlternative}`}</Text>
                )}
                {draft.internalAction && <Text style={styles.body}>{`פעולה פנימית: ${draft.internalAction}`}</Text>}
                {draft.statePreventiveAction && <Text style={styles.body}>{`פעולה מונעת: ${draft.statePreventiveAction}`}</Text>}
                {draft.stateSupportingAction && <Text style={styles.body}>{`פעולה תומכת: ${draft.stateSupportingAction}`}</Text>}
                {draft.stateLimitingBelief && <Text style={styles.body}>{`מחשבה מגבילה: ${draft.stateLimitingBelief}`}</Text>}
                {draft.stateBridgeBelief && <Text style={styles.body}>{`אמונת גשר: ${draft.stateBridgeBelief}`}</Text>}
                {draft.stateFutureOrientedMantra && (
                  <Text style={styles.body}>{`מנטרה מכוונת עתיד: ${draft.stateFutureOrientedMantra}`}</Text>
                )}
                {draft.stateBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.stateBodyLanguageCue}`}</Text>}
                {draft.stateMantra && <Text style={styles.body}>{`מנטרת זהות: ${draft.stateMantra}`}</Text>}
              </>
            )}
            {activeTarget === "identity" && (
              <>
                <Text style={styles.body}>{`זהות רצויה: ${draft.desiredIdentity}`}</Text>
                {draft.identityDesiredState && <Text style={styles.body}>{`מצב הזהות הרצוי: ${draft.identityDesiredState}`}</Text>}
                <Text style={styles.body}>{`נוטה להפריע: ${draft.identityInterferingEmotion}`}</Text>
                <Text style={styles.body}>{`הקשר אתגר: ${draft.identityChallengeContext}`}</Text>
                {draft.identityBarrierType && (
                  <Text style={styles.body}>
                    {`סוג המכשול: ${draft.identityBarrierType === "internal" ? "חסם פנימי" : "חסם מעשי"}`}
                  </Text>
                )}
                {draft.identityPracticalAlternative && (
                  <Text style={styles.body}>{`פתרון מעשי: ${draft.identityPracticalAlternative}`}</Text>
                )}
                {draft.identityAction && <Text style={styles.body}>{`פעולה: ${draft.identityAction}`}</Text>}
                {draft.identityPreventiveAction && <Text style={styles.body}>{`פעולה מונעת: ${draft.identityPreventiveAction}`}</Text>}
                {draft.identitySupportingAction && <Text style={styles.body}>{`פעולה תומכת: ${draft.identitySupportingAction}`}</Text>}
                {draft.identityLimitingBelief && <Text style={styles.body}>{`מחשבה מגבילה: ${draft.identityLimitingBelief}`}</Text>}
                {draft.identityBridgeBelief && <Text style={styles.body}>{`אמונת גשר: ${draft.identityBridgeBelief}`}</Text>}
                {draft.identityFutureOrientedMantra && (
                  <Text style={styles.body}>{`מנטרה מכוונת עתיד: ${draft.identityFutureOrientedMantra}`}</Text>
                )}
                {draft.identityBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.identityBodyLanguageCue}`}</Text>}
                {draft.identityMantra && <Text style={styles.body}>{`מנטרת זהות: ${draft.identityMantra}`}</Text>}
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
            {draft.linkTriggerText.trim() && <Text style={styles.body}>{`טריגר ל-ARC Link: ${draft.linkTriggerText}`}</Text>}
            {!isTargetDraftComplete(activeTarget, draft) && (
              <Text style={styles.errorText}>יש להשלים את כל השדות הנדרשים לפני השמירה (כולל צבע נוכחות וכלי ויסות).</Text>
            )}
            {saveError && <Text style={styles.errorText}>{saveError}</Text>}
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
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 8 },
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

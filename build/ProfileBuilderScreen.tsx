import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  getOrCreatePilotStartedAt,
  loadProfile,
  loadProgramProgress,
  loadProgramSelection,
  saveProfile,
  saveProgramProgress,
  saveProgramSelection,
} from "../data/storage.ts";
import { createInitialProgress } from "../program/progress.ts";
import {
  buildProfileFromDraft,
  createEmptyDraft,
  draftFromProfileAndSelection,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  isGoalDraftComplete,
  selectionFromDraft,
  GOAL_STEP_ORDER,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";
import { NEGATIVE_ACTION_MAX_DURATION_MINUTES, NEGATIVE_ACTION_MIN_DURATION_MINUTES } from "../program/engine.ts";

const NEGATIVE_ACTION_DURATION_OPTIONS: number[] = Array.from(
  { length: NEGATIVE_ACTION_MAX_DURATION_MINUTES - NEGATIVE_ACTION_MIN_DURATION_MINUTES + 1 },
  (_, index) => NEGATIVE_ACTION_MIN_DURATION_MINUTES + index
);

const STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  goal: "מה תרצה להשיג? (לאן אתה רוצה להתקדם)",
  negativeActionEnabledAsk: "האם תרצה להפעיל כלי לצמצום פעולה שלילית? (רשות)",
  habit: "מה הפעולה השלילית שתרצה לצמצם?",
  negativeActionDuration: "כמה זמן, בדקות, לאפשר לפעולה הזו? (1 עד 15 דקות)",
  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע במקומו? (ההרגל הרצוי)",
  needsState: "האם יש מצב פנימי (כמו רוגע, ביטחון או חמלה) שתרצה לפתח ולחזק?",
  needsIdentityImmediately: "לעבוד גם על זהות מקבילה כבר מההתחלה?",
  needsIdentityExplicit: "האם יש זהות שתרצה לפתח?",
  desiredIdentity: "מה הזהות הרצויה?",
  identityInterferingEmotion: "מה הרגש שמפריע לזהות הזו?",
  identityMantra: "יש לך מנטרה לזהות הזו? (רשות)",
  supportiveState: "מה המצב הרצוי שתרצה לחוש יותר?",
  internalAction: "מה הפעולה הפנימית שלך? (למשל סריקת גוף)",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
  review: "סיכום",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  goal: "goal",
  habit: "habit",
  beneficialAction: "beneficialAction",
  desiredIdentity: "desiredIdentity",
  identityInterferingEmotion: "identityInterferingEmotion",
  identityMantra: "identityMantra",
  supportiveState: "supportiveState",
  internalAction: "internalAction",
  preventiveActionDescription: "preventiveActionDescription",
  regulationTool: "regulationTool",
};

const OPTIONAL_TEXT_STEPS: ProfileStep[] = ["identityMantra"];

const YESNO_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  needsState: "needsState",
  needsIdentityImmediately: "needsIdentityImmediately",
  needsIdentityExplicit: "needsIdentityExplicit",
  preventiveActionAsk: "hasPreventiveAction",
  negativeActionEnabledAsk: "negativeActionReductionEnabled",
};

/**
 * BUILD-GOAL: the positive direction only -- Goal -> Desired Habit ->
 * Identity -> Desired State, plus the needs assessment and the
 * general-purpose preventiveAction/regulationTool fields (see
 * profileWizard.ts's module doc for why those stay here rather than
 * in BUILD-ARC). Ends after Desired State; never asks Challenge
 * Context or Interfering State -- that's build/ArcMapScreen.tsx
 * (route /build-arc), reached separately, after this screen.
 */
export default function ProfileBuilderScreen() {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [step, setStep] = useState<ProfileStep>("goal");

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProfile(), loadProgramSelection()]).then(([existing, selection]) => {
      if (cancelled) return;
      const initialDraft = existing ? draftFromProfileAndSelection(existing, selection) : createEmptyDraft();
      setDraft(initialDraft);
      setStep(getFirstProfileStep(initialDraft, GOAL_STEP_ORDER));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goNext = useCallback((nextDraft: ProfileDraft) => {
    setDraft(nextDraft);
    setStep((current) => getNextProfileStep(current, nextDraft, GOAL_STEP_ORDER));
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => getPreviousProfileStep(current, draft, GOAL_STEP_ORDER) ?? current);
  }, [draft]);

  const finish = useCallback(async () => {
    const profile = buildProfileFromDraft(draft);
    const selection = selectionFromDraft(draft);
    await saveProfile(profile);
    await saveProgramSelection(selection);
    await getOrCreatePilotStartedAt();

    // Only (re)start program progress if there's none yet, or the
    // resolved program changed (e.g. the trainee's needs assessment
    // answers changed on a re-edit) -- otherwise editing unrelated
    // fields like regulationTool shouldn't reset accumulated weeks.
    const existingProgress = await loadProgramProgress();
    if (!existingProgress || existingProgress.programPath !== profile.programPath) {
      await saveProgramProgress(createInitialProgress(profile.programPath));
    }

    router.replace("/");
  }, [draft]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const textField = TEXT_STEP_FIELDS[step];
  const yesNoField = YESNO_STEP_FIELDS[step];
  const isOptionalTextStep = OPTIONAL_TEXT_STEPS.includes(step);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
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
              disabled={!isOptionalTextStep && (draft[textField] as string).trim().length === 0}
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

        {step === "review" && (
          <View>
            <Text style={styles.body}>{`מטרה: ${draft.goal}`}</Text>
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
            {resolvesNeedsIdentityText(draft) && <Text style={styles.body}>{`זהות רצויה: ${draft.desiredIdentity}`}</Text>}
            <Text style={styles.body}>{`כלי ויסות: ${draft.regulationTool}`}</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} disabled={!isGoalDraftComplete(draft)} onPress={finish}>
              <Text style={styles.buttonText}>שמור והמשך</Text>
            </Pressable>
            {draft.needsState && (
              <Text style={styles.hint}>לאחר השמירה תוכל להשלים את מפת ה-ARC (מצב מפריע, הקשר אתגר) במסך "בניית מפת ARC".</Text>
            )}
          </View>
        )}

        {step !== "goal" && (
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>חזור</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function resolvesNeedsIdentityText(draft: ProfileDraft): boolean {
  return draft.needsState === true ? true : draft.needsIdentityExplicit === true;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    textAlign: "right",
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    textAlign: "right",
    color: "#777",
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: {
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  chipSelected: {
    backgroundColor: "#0a7ea4",
  },
  backButton: {
    marginTop: 24,
    alignItems: "center",
  },
  backButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
});

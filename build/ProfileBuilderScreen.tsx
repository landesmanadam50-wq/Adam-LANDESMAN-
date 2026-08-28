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
  isDraftComplete,
  selectionFromDraft,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";

const STEP_TITLES: Record<ProfileStep, string> = {
  goal: "מה תרצה להשיג? (לאן אתה רוצה להתקדם)",
  needsState: "האם יש מצב פנימי (כמו רוגע, ביטחון או חמלה) שתרצה לפתח ולחזק?",
  needsIdentityImmediately: "לעבוד גם על זהות מקבילה כבר מההתחלה?",
  needsIdentityExplicit: "האם יש זהות שתרצה לפתח?",
  supportiveState: "מה המצב הרצוי שתרצה לחוש יותר?",
  interferingState: "מה נוטה להפריע למצב הרצוי הזה?",
  challengeContext: "באילו מצבים זה קורה בדרך כלל?",
  internalAction: "מה הפעולה הפנימית שלך? (למשל סריקת גוף)",
  stateMantra: "יש לך מנטרה למצב הזה? (רשות)",
  desiredIdentity: "מה הזהות הרצויה?",
  identityInterferingEmotion: "מה הרגש שמפריע לזהות הזו?",
  identityAction: "מה הפעולה שמבטאת את הזהות הזו?",
  identityMantra: "יש לך מנטרה לזהות הזו? (רשות)",
  habit: "מה ההרגל שתרצה לעבוד עליו?",
  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע במקומו?",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
  review: "סיכום",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  goal: "goal",
  supportiveState: "supportiveState",
  interferingState: "interferingState",
  challengeContext: "challengeContext",
  internalAction: "internalAction",
  stateMantra: "stateMantra",
  desiredIdentity: "desiredIdentity",
  identityInterferingEmotion: "identityInterferingEmotion",
  identityAction: "identityAction",
  identityMantra: "identityMantra",
  habit: "habit",
  beneficialAction: "beneficialAction",
  preventiveActionDescription: "preventiveActionDescription",
  regulationTool: "regulationTool",
};

const OPTIONAL_TEXT_STEPS: ProfileStep[] = ["stateMantra", "identityMantra"];

const YESNO_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  needsState: "needsState",
  needsIdentityImmediately: "needsIdentityImmediately",
  needsIdentityExplicit: "needsIdentityExplicit",
  preventiveActionAsk: "hasPreventiveAction",
};

export default function ProfileBuilderScreen() {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [step, setStep] = useState<ProfileStep>("needsState");

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProfile(), loadProgramSelection()]).then(([existing, selection]) => {
      if (cancelled) return;
      const initialDraft = existing ? draftFromProfileAndSelection(existing, selection) : createEmptyDraft();
      setDraft(initialDraft);
      setStep(getFirstProfileStep(initialDraft));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goNext = useCallback((nextDraft: ProfileDraft) => {
    setDraft(nextDraft);
    setStep((current) => getNextProfileStep(current, nextDraft));
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => getPreviousProfileStep(current, draft) ?? current);
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
            <Text style={styles.body}>{`הרגל: ${draft.habit}`}</Text>
            <Text style={styles.body}>{`פעולה מיטיבה: ${draft.beneficialAction}`}</Text>
            <Text style={styles.body}>{`כלי ויסות: ${draft.regulationTool}`}</Text>
            {draft.needsState && <Text style={styles.body}>{`מצב רצוי: ${draft.supportiveState}`}</Text>}
            {draft.needsState && <Text style={styles.body}>{`נוטה להפריע: ${draft.interferingState} (${draft.challengeContext})`}</Text>}
            <Pressable style={[styles.button, styles.fullWidthButton]} disabled={!isDraftComplete(draft)} onPress={finish}>
              <Text style={styles.buttonText}>שמור והתחל</Text>
            </Pressable>
          </View>
        )}

        {step !== "needsState" && (
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>חזור</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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
  backButton: {
    marginTop: 24,
    alignItems: "center",
  },
  backButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
});

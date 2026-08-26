import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import type { ArcType } from "../engine/types.ts";
import { loadProfile, saveProfile } from "../data/storage.ts";
import {
  buildProfileFromDraft,
  createEmptyDraft,
  draftFromProfile,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  isDraftComplete,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";

const ARC_TYPES: { value: ArcType; label: string }[] = [
  { value: "state", label: "מצב" },
  { value: "identity", label: "זהות" },
  { value: "habit", label: "הרגל" },
];

const MINUTES_OPTIONS = [5, 10, 15, 20];

const STEP_TITLES: Record<ProfileStep, string> = {
  goal: "מה המטרה שלך?",
  arcType: "באיזה סוג ARC אתה עובד?",
  interferingState: "מה המצב הפנימי המפריע?",
  supportiveState: "מה המצב התומך?",
  internalAction: "מה הפעולה הפנימית שלך? (למשל סריקת גוף)",
  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע?",
  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
  mantra: "יש לך מנטרה? (רשות)",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  interferingActionAsk: "יש הרגל מפריע שתרצה לצמצם בהדרגה?",
  interferingActionDescription: "תאר את ההרגל המפריע",
  interferingActionMinutes: "כמה דקות מותר כרגע?",
  review: "סיכום",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  goal: "goal",
  interferingState: "interferingState",
  supportiveState: "supportiveState",
  internalAction: "internalAction",
  beneficialAction: "beneficialAction",
  regulationTool: "regulationTool",
  mantra: "mantra",
  preventiveActionDescription: "preventiveActionDescription",
  interferingActionDescription: "interferingActionDescription",
};

export default function ProfileBuilderScreen() {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [step, setStep] = useState<ProfileStep>("goal");

  useEffect(() => {
    let cancelled = false;
    loadProfile().then((existing) => {
      if (cancelled) return;
      const initialDraft = existing ? draftFromProfile(existing) : createEmptyDraft();
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
    await saveProfile(profile);
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
  const isOptionalTextStep = step === "mantra";

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

        {step === "arcType" && (
          <View style={styles.buttonRow}>
            {ARC_TYPES.map(({ value, label }) => (
              <Pressable key={value} style={styles.chip} onPress={() => goNext({ ...draft, arcType: value })}>
                <Text style={styles.buttonText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {(step === "preventiveActionAsk" || step === "interferingActionAsk") && (
          <View style={styles.buttonRow}>
            {[true, false].map((answer) => (
              <Pressable
                key={String(answer)}
                style={styles.button}
                onPress={() =>
                  goNext(
                    step === "preventiveActionAsk"
                      ? { ...draft, hasPreventiveAction: answer }
                      : { ...draft, hasInterferingAction: answer }
                  )
                }
              >
                <Text style={styles.buttonText}>{answer ? "כן" : "לא"}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === "interferingActionMinutes" && (
          <View style={styles.buttonRow}>
            {MINUTES_OPTIONS.map((minutes) => (
              <Pressable
                key={minutes}
                style={styles.chip}
                onPress={() => goNext({ ...draft, interferingActionAllowedMinutes: minutes })}
              >
                <Text style={styles.buttonText}>{minutes} דק'</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === "review" && (
          <View>
            <Text style={styles.body}>{`מטרה: ${draft.goal}`}</Text>
            <Text style={styles.body}>{`פעולה מיטיבה: ${draft.beneficialAction}`}</Text>
            <Text style={styles.body}>{`כלי ויסות: ${draft.regulationTool}`}</Text>
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              disabled={!isDraftComplete(draft)}
              onPress={finish}
            >
              <Text style={styles.buttonText}>שמור והתחל</Text>
            </Pressable>
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
  chip: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
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

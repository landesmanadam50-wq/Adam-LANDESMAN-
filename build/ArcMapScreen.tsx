import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { loadProfile, loadProgramSelection, saveProfile } from "../data/storage.ts";
import {
  buildProfileFromDraft,
  createEmptyDraft,
  draftFromProfileAndSelection,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  isArcDraftComplete,
  ARC_STEP_ORDER,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";

const STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  challengeContext: "באילו מצבים המצב הרצוי הזה במיוחד רלוונטי? (הקשר האתגר)",
  interferingState: "מה נוטה להפריע למצב הרצוי הזה?",
  stateMantra: "יש לך מנטרה למצב הזה? (רשות)",
  stateBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך במצב הזה? (רשות, למשל כתפיים משוחררות)",
  review: "סיכום מפת ARC",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  challengeContext: "challengeContext",
  interferingState: "interferingState",
  stateMantra: "stateMantra",
  stateBodyLanguageCue: "stateBodyLanguageCue",
};

const OPTIONAL_TEXT_STEPS: ProfileStep[] = ["stateMantra", "stateBodyLanguageCue"];

type ScreenStatus = "loading" | "noProfile" | "noDesiredState" | "ready";

/**
 * BUILD-ARC: creates the ARC Map around the Desired State BUILD-GOAL
 * (build/ProfileBuilderScreen.tsx, route /build) already established --
 * Challenge Context -> Interfering State -> Encoding cues. Never asks
 * for the Desired State itself; only references it (read-only,
 * `draft.supportiveState`). Reached separately, after BUILD-GOAL, from
 * Home. Saves back onto the SAME profile BUILD-GOAL created -- not a
 * second profile, not a second source of truth -- and never touches
 * program selection/progress (that's BUILD-GOAL's job).
 */
export default function ArcMapScreen() {
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [step, setStep] = useState<ProfileStep>("challengeContext");

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProfile(), loadProgramSelection()]).then(([existing, selection]) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("noProfile");
        return;
      }
      const loadedDraft = draftFromProfileAndSelection(existing, selection);
      if (loadedDraft.needsState !== true || !loadedDraft.supportiveState) {
        setStatus("noDesiredState");
        return;
      }
      setDraft(loadedDraft);
      setStep(getFirstProfileStep(loadedDraft, ARC_STEP_ORDER));
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goNext = useCallback((nextDraft: ProfileDraft) => {
    setDraft(nextDraft);
    setStep((current) => getNextProfileStep(current, nextDraft, ARC_STEP_ORDER));
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => getPreviousProfileStep(current, draft, ARC_STEP_ORDER) ?? current);
  }, [draft]);

  const finish = useCallback(async () => {
    const profile = buildProfileFromDraft(draft);
    await saveProfile(profile);
    router.back();
  }, [draft]);

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "noProfile") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>עדיין אין פרופיל</Text>
          <Text style={styles.body}>יש להשלים קודם את בניית המטרה (BUILD-GOAL) לפני בניית מפת ה-ARC.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/build")}>
            <Text style={styles.buttonText}>לבניית מטרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "noDesiredState") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>אין מצב רצוי פעיל</Text>
          <Text style={styles.body}>
            מפת ARC זמינה כשיש מצב רצוי שהוגדר בבניית המטרה. אפשר לחזור לשם ולהוסיף מצב רצוי, או להמשיך בלעדיו.
          </Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/build")}>
            <Text style={styles.buttonText}>לבניית מטרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const textField = TEXT_STEP_FIELDS[step];
  const isOptionalTextStep = OPTIONAL_TEXT_STEPS.includes(step);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{`מפת ARC סביב: ${draft.supportiveState}`}</Text>
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

        {step === "review" && (
          <View>
            <Text style={styles.body}>{`מצב רצוי: ${draft.supportiveState}`}</Text>
            <Text style={styles.body}>{`נוטה להפריע: ${draft.interferingState}`}</Text>
            <Text style={styles.body}>{`הקשר אתגר: ${draft.challengeContext}`}</Text>
            {draft.stateBodyLanguageCue && <Text style={styles.body}>{`שפת גוף: ${draft.stateBodyLanguageCue}`}</Text>}
            {draft.stateMantra && <Text style={styles.body}>{`מנטרה: ${draft.stateMantra}`}</Text>}
            <Pressable style={[styles.button, styles.fullWidthButton]} disabled={!isArcDraftComplete(draft)} onPress={finish}>
              <Text style={styles.buttonText}>שמור מפת ARC</Text>
            </Pressable>
          </View>
        )}

        {step !== "challengeContext" && (
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
  eyebrow: {
    fontSize: 13,
    textAlign: "right",
    color: "#0a7ea4",
    marginBottom: 4,
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

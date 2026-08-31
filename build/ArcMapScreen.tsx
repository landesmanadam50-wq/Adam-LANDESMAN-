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
  isIdentityArcDraftComplete,
  isStateArcDraftComplete,
  resolvesNeedsIdentity,
  IDENTITY_ARC_STEP_ORDER,
  STATE_ARC_STEP_ORDER,
  type ProfileDraft,
  type ProfileStep,
} from "./profileWizard.ts";
import type { DwellTimes } from "../arc/types.ts";

type ArcTarget = "state" | "identity";

/** BUILD-ARC's "זמן שהייה" step (#F): the configurable dwell categories, in display order, each paired with the draft field it edits for whichever target (state/identity) is currently being configured. Coordinated timer/dwell task (Part 17, 20): extended with Presence and Stop-Imagery dwell, parallel to the original five. */
const DWELL_ROWS: { key: keyof DwellTimes; label: string }[] = [
  { key: "sensationDwellSeconds", label: "תחושה / מודעות" },
  { key: "acceptanceDwellSeconds", label: "קבלה" },
  { key: "regulationDwellSeconds", label: "ויסות" },
  { key: "encodingDwellSeconds", label: "קידוד / שפת גוף" },
  { key: "actionImageryDwellSeconds", label: "דמיון פעולה" },
  { key: "presenceDwellSeconds", label: "נוכחות" },
  { key: "stopImageryDwellSeconds", label: "דמיון עצירה" },
];

/** Maps a dwell category + the currently-edited target to its ProfileDraft field name (e.g. "state" + "sensationDwellSeconds" -> "stateSensationDwellSeconds") -- keeps DWELL_ROWS itself target-agnostic rather than duplicating it per target. */
function dwellDraftFieldFor(target: ArcTarget, key: keyof DwellTimes): keyof ProfileDraft {
  const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return `${target}${capitalized}` as keyof ProfileDraft;
}

const STATE_STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  challengeContext: "באילו מצבים המצב הרצוי הזה במיוחד רלוונטי? (הקשר האתגר)",
  interferingState: "מה נוטה להפריע למצב הרצוי הזה?",
  statePreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  stateEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  stateEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  stateMantra: "יש לך מנטרה למצב הזה? (רשות)",
  stateBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך במצב הזה? (רשות, למשל כתפיים משוחררות)",
  dwellTimes: "זמן שהייה",
  review: "סיכום מפת ARC",
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
  dwellTimes: "זמן שהייה",
  review: "סיכום מפת ARC",
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

function stepOrderFor(target: ArcTarget): ProfileStep[] {
  return target === "state" ? STATE_ARC_STEP_ORDER : IDENTITY_ARC_STEP_ORDER;
}
function stepTitlesFor(target: ArcTarget): Partial<Record<ProfileStep, string>> {
  return target === "state" ? STATE_STEP_TITLES : IDENTITY_STEP_TITLES;
}
function textStepFieldsFor(target: ArcTarget): Partial<Record<ProfileStep, keyof ProfileDraft>> {
  return target === "state" ? STATE_TEXT_STEP_FIELDS : IDENTITY_TEXT_STEP_FIELDS;
}
/** The A/B "same cue" vs "shorter cue for Encoding" chooser steps -- map to the draft's boolean choice field, distinct from textStepFieldsFor's plain text fields. */
function askStepFieldsFor(target: ArcTarget): Partial<Record<ProfileStep, keyof ProfileDraft>> {
  return target === "state" ? STATE_ASK_STEP_FIELDS : IDENTITY_ASK_STEP_FIELDS;
}
function optionalStepsFor(target: ArcTarget): ProfileStep[] {
  return target === "state" ? STATE_OPTIONAL_STEPS : IDENTITY_OPTIONAL_STEPS;
}
function isCompleteFor(target: ArcTarget, draft: ProfileDraft): boolean {
  return target === "state" ? isStateArcDraftComplete(draft) : isIdentityArcDraftComplete(draft);
}
function labelFor(target: ArcTarget, draft: ProfileDraft): string {
  return target === "state" ? draft.supportiveState : draft.desiredIdentity;
}

type ScreenStatus = "loading" | "noProfile" | "noDesiredState" | "picking" | "editing";

/**
 * BUILD-ARC: creates the ARC Map(s) around the Desired State(s)
 * BUILD-GOAL (build/ProfileBuilderScreen.tsx, route /build) already
 * established -- Challenge Context -> Interfering State -> Encoding
 * cues. Never asks for a Desired State itself; only references it.
 *
 * A trainee can have up to two independently mappable targets: the
 * state layer's Desired State (supportiveState, e.g. "Focus") and the
 * identity layer's Desired Identity (desiredIdentity, e.g.
 * "Discipline") -- both active together on an advanced_2_week program
 * from week 1, for instance. When both exist, this screen shows a
 * target picker first; editing one target's ARC Map never touches the
 * other's fields (see buildProfileFromDraft's doc). When only one
 * target exists, the picker is skipped and that target is edited
 * directly -- "automatic" selection, but the other target (if it
 * exists) is always still reachable via the "target" screen state,
 * never hidden once mapped.
 *
 * Reached separately, after BUILD-GOAL, from Home. Saves back onto the
 * SAME profile BUILD-GOAL created -- not a second profile, not a
 * second source of truth -- and never touches program selection/
 * progress (that's BUILD-GOAL's job).
 */
export default function ArcMapScreen() {
  const [status, setStatus] = useState<ScreenStatus>("loading");
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [availableTargets, setAvailableTargets] = useState<ArcTarget[]>([]);
  const [target, setTarget] = useState<ArcTarget | null>(null);
  const [step, setStep] = useState<ProfileStep>("review");

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProfile(), loadProgramSelection()]).then(([existing, selection]) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("noProfile");
        return;
      }
      const loadedDraft = draftFromProfileAndSelection(existing, selection);
      const targets: ArcTarget[] = [];
      if (loadedDraft.needsState === true && loadedDraft.supportiveState) targets.push("state");
      if (resolvesNeedsIdentity(loadedDraft) && loadedDraft.desiredIdentity) targets.push("identity");

      if (targets.length === 0) {
        setStatus("noDesiredState");
        return;
      }
      setDraft(loadedDraft);
      setAvailableTargets(targets);
      if (targets.length === 1) {
        selectTarget(targets[0], loadedDraft);
      } else {
        setStatus("picking");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTarget(nextTarget: ArcTarget, currentDraft: ProfileDraft) {
    setTarget(nextTarget);
    setStep(getFirstProfileStep(currentDraft, stepOrderFor(nextTarget)));
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

  const finish = useCallback(async () => {
    const profile = buildProfileFromDraft(draft);
    await saveProfile(profile);
  }, [draft]);

  const finishAndExit = useCallback(async () => {
    await finish();
    router.back();
  }, [finish]);

  const finishAndSwitchTarget = useCallback(
    async (otherTarget: ArcTarget) => {
      await finish();
      selectTarget(otherTarget, draft);
    },
    [finish, draft]
  );

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
            מפת ARC זמינה כשיש מצב רצוי או זהות רצויה שהוגדרו בבניית המטרה. אפשר לחזור לשם ולהוסיף, או להמשיך בלעדיהם.
          </Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/build")}>
            <Text style={styles.buttonText}>לבניית מטרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "picking") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>באיזו מפת ARC תרצה לעבוד?</Text>
          <Text style={styles.body}>יש לך יותר ממטרה רצויה אחת -- לכל אחת מפת ARC נפרדת ובלתי תלויה.</Text>
          {availableTargets.map((t) => (
            <Pressable key={t} style={[styles.button, styles.fullWidthButton]} onPress={() => selectTarget(t, draft)}>
              <Text style={styles.buttonText}>{labelFor(t, draft)}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // status === "editing" -- target is guaranteed non-null here.
  const activeTarget = target as ArcTarget;
  const otherTarget = availableTargets.find((t) => t !== activeTarget) ?? null;
  const textField = textStepFieldsFor(activeTarget)[step];
  const askField = askStepFieldsFor(activeTarget)[step];
  const isOptionalTextStep = optionalStepsFor(activeTarget).includes(step);
  const firstStep = stepOrderFor(activeTarget)[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{`מפת ARC סביב: ${labelFor(activeTarget, draft)}`}</Text>
        <Text style={styles.title}>{stepTitlesFor(activeTarget)[step]}</Text>

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

        {step === "dwellTimes" && (
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
            <Text style={styles.body}>{`מטרה: ${labelFor(activeTarget, draft)}`}</Text>
            {activeTarget === "state" ? (
              <>
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
              disabled={!isCompleteFor(activeTarget, draft)}
              onPress={otherTarget ? () => finishAndSwitchTarget(otherTarget) : finishAndExit}
            >
              <Text style={styles.buttonText}>{otherTarget ? `שמור ועבור למפת ${labelFor(otherTarget, draft)}` : "שמור מפת ARC"}</Text>
            </Pressable>
            {otherTarget && (
              <Pressable
                style={styles.backButton}
                disabled={!isCompleteFor(activeTarget, draft)}
                onPress={finishAndExit}
              >
                <Text style={styles.backButtonText}>שמור וסיים</Text>
              </Pressable>
            )}
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
  dwellRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  dwellLabel: {
    flex: 1,
    fontSize: 16,
    textAlign: "right",
  },
  dwellInput: {
    width: 56,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    marginHorizontal: 8,
  },
  dwellUnit: {
    fontSize: 14,
    color: "#666",
  },
});

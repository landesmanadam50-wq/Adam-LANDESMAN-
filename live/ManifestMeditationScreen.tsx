import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  createEmptyManifestMeditationProfile,
  DEFAULT_MANIFEST_MEDITATION_DURATION_MINUTES,
  getFirstManifestMeditationStage,
  getManifestMeditationStageCopy,
  getNextManifestMeditationStage,
  MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES,
  resolveManifestMeditationDwellSeconds,
} from "../arc/manifestMeditation.ts";
import type { ManifestMeditationProfile, ManifestMeditationStage } from "../arc/manifestMeditation.ts";
import {
  suggestHabitsFromRecurringTasks,
  suggestIdentitiesFromIdentityProfiles,
  suggestPersonalSentencesFromIdentityProfiles,
  suggestValuesFromIdentityProfiles,
} from "../arc/manifestMeditationDataSources.ts";
import { buildTodaySections } from "../arc/todaySchedule.ts";
import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import { loadIdentityProfiles, loadTaskOccurrenceCompletions, loadTasks, upsertTask } from "../data/storage.ts";

/**
 * live/ManifestMeditationScreen.tsx (route /manifest-meditation)
 *
 * Hebrew BUILD/LIVE rework spec, page 3: a standalone, text-only guided
 * practice built from the trainee's own values/identities/goals,
 * personal sentences, a day-imagery description, and today's action --
 * entered once before the practice starts (this screen's own first
 * phase), then shown one stage at a time (settling -> presence ->
 * values/identities -> day-imagery -> personal sentences -> today's
 * action -> gratitude), with a duration-derived per-stage dwell.
 *
 * Mirrors live/LifeManifestVisualizationScreen.tsx's own shape (one
 * stage per screen, tap "המשך" to advance, a small useState machine --
 * no ARC engine involved) while using a completely different stage set
 * and content, per research confirming that screen is a different
 * exercise that doesn't fit this spec. No TTS/audio exists anywhere in
 * this codebase (confirmed) -- Continue is never hard-gated by the
 * dwell countdown, only informed by it, matching the "never force a
 * wait" pattern already used elsewhere in this task (e.g. Bridge to
 * Action's own "adjust posture or continue early").
 */
export default function ManifestMeditationScreen() {
  const [phase, setPhase] = useState<"setup" | "practice">("setup");
  const [profile, setProfile] = useState<ManifestMeditationProfile>(createEmptyManifestMeditationProfile());
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_MANIFEST_MEDITATION_DURATION_MINUTES);
  const [stage, setStage] = useState<ManifestMeditationStage>(getFirstManifestMeditationStage());

  const [valuesText, setValuesText] = useState("");
  const [identitiesText, setIdentitiesText] = useState("");
  const [goalsText, setGoalsText] = useState("");
  const [sentencesText, setSentencesText] = useState("");
  const [dayImageryText, setDayImageryText] = useState("");
  const [todaysActionText, setTodaysActionText] = useState("");

  const [suggestedValues, setSuggestedValues] = useState<string[]>([]);
  const [suggestedIdentities, setSuggestedIdentities] = useState<string[]>([]);
  const [suggestedHabits, setSuggestedHabits] = useState<string[]>([]);
  const [suggestedSentences, setSuggestedSentences] = useState<string[]>([]);
  const [suggestedTodaysAction, setSuggestedTodaysAction] = useState<string | null>(null);
  const [createdTaskConfirm, setCreatedTaskConfirm] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadIdentityProfiles(), loadTasks(), loadTaskOccurrenceCompletions()]).then(([profiles, tasks, completions]) => {
        setSuggestedValues(suggestValuesFromIdentityProfiles(profiles));
        setSuggestedIdentities(suggestIdentitiesFromIdentityProfiles(profiles));
        setSuggestedHabits(suggestHabitsFromRecurringTasks(tasks));
        setSuggestedSentences(suggestPersonalSentencesFromIdentityProfiles(profiles));
        const today = buildTodaySections(tasks, completions, new Date());
        const currentTask = today.currentOrNext?.task ?? null;
        setSuggestedTodaysAction(currentTask ? currentTask.currentAction ?? currentTask.firstAction : null);
      });
    }, [])
  );

  /** Appends a line to a text field's own current value -- never overwrites anything the trainee already typed. */
  function appendLine(current: string, line: string): string {
    const trimmed = current.trim();
    return trimmed ? `${trimmed}\n${line}` : line;
  }

  async function createTaskFromTodaysAction() {
    if (!profile.todaysAction) return;
    const task = createEmptyTask(generateTaskId(), profile.todaysAction, profile.todaysAction, new Date().toISOString());
    await upsertTask(task);
    setTaskCreated(true);
    setCreatedTaskConfirm(false);
  }

  function splitLines(text: string): string[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function startPractice() {
    setProfile({
      values: splitLines(valuesText),
      identities: splitLines(identitiesText),
      goalsAndHabits: splitLines(goalsText),
      personalSentences: splitLines(sentencesText),
      dayImageryDescription: dayImageryText.trim() || null,
      todaysAction: todaysActionText.trim() || null,
    });
    setStage(getFirstManifestMeditationStage());
    setCreatedTaskConfirm(false);
    setTaskCreated(false);
    setPhase("practice");
  }

  if (phase === "setup") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>מדיטציית מניפסט</Text>
          <Text style={styles.subtitle}>אפשר לבחור או לכתוב כל שדה (רשות) -- שדה ריק יקבל הנחיה כללית בתרגול עצמו.</Text>

          <Text style={styles.question}>ערכים מרכזיים (שורה לכל ערך)</Text>
          <AutoTextInput value={valuesText} onChangeText={setValuesText} />
          {suggestedValues.length > 0 && (
            <Pressable style={styles.suggestLink} onPress={() => setValuesText(appendLine(valuesText, suggestedValues.join("\n")))}>
              <Text style={styles.suggestLinkText}>הוספה מערכים שמורים</Text>
            </Pressable>
          )}

          <Text style={styles.question}>זהויות שאתה רוצה לטפח (שורה לכל זהות)</Text>
          <AutoTextInput value={identitiesText} onChangeText={setIdentitiesText} />
          {suggestedIdentities.length > 0 && (
            <Pressable style={styles.suggestLink} onPress={() => setIdentitiesText(appendLine(identitiesText, suggestedIdentities.join("\n")))}>
              <Text style={styles.suggestLinkText}>הוספה מזהויות שמורות</Text>
            </Pressable>
          )}

          <Text style={styles.question}>מטרות והרגלים (שורה לכל אחד, רשות)</Text>
          <AutoTextInput value={goalsText} onChangeText={setGoalsText} />
          {suggestedHabits.length > 0 && (
            <Pressable style={styles.suggestLink} onPress={() => setGoalsText(appendLine(goalsText, suggestedHabits.join("\n")))}>
              <Text style={styles.suggestLinkText}>הוספה ממשימות חזרתיות שמורות</Text>
            </Pressable>
          )}

          <Text style={styles.question}>משפטים אישיים (שורה לכל משפט)</Text>
          <AutoTextInput value={sentencesText} onChangeText={setSentencesText} />
          {suggestedSentences.length > 0 && (
            <Pressable style={styles.suggestLink} onPress={() => setSentencesText(appendLine(sentencesText, suggestedSentences.join("\n")))}>
              <Text style={styles.suggestLinkText}>הוספה ממשפטים שמורים</Text>
            </Pressable>
          )}

          <Text style={styles.question}>דמיון של יום שבו אתה פועל בהתאם לערכיך (רשות)</Text>
          <AutoTextInput value={dayImageryText} onChangeText={setDayImageryText} />

          <Text style={styles.question}>פעולה קטנה להיום (רשות)</Text>
          <AutoTextInput value={todaysActionText} onChangeText={setTodaysActionText} />
          {suggestedTodaysAction && (
            <Pressable style={styles.suggestLink} onPress={() => setTodaysActionText(suggestedTodaysAction)}>
              <Text style={styles.suggestLinkText}>{`שימוש בפעולה של המשימה הנוכחית: ${suggestedTodaysAction}`}</Text>
            </Pressable>
          )}

          <Text style={styles.question}>משך התרגול</Text>
          <View style={styles.chipRow}>
            {MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES.map((minutes) => (
              <Pressable key={minutes} style={[styles.chip, durationMinutes === minutes && styles.chipSelected]} onPress={() => setDurationMinutes(minutes)}>
                <Text style={styles.chipText}>{minutes} דק&apos;</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.primaryButton} onPress={startPractice}>
            <Text style={styles.primaryButtonText}>התחל</Text>
          </Pressable>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>חזרה</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const dwellSeconds = resolveManifestMeditationDwellSeconds(durationMinutes);
  const copy = getManifestMeditationStageCopy(stage, profile, dwellSeconds);
  const isComplete = stage === "complete";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        {isComplete && profile.todaysAction && !taskCreated && (
          <View style={styles.taskConfirmBlock}>
            {createdTaskConfirm ? (
              <>
                <Text style={styles.question}>{`להפוך את "${profile.todaysAction}" למשימה חדשה?`}</Text>
                <Pressable style={styles.secondaryButton} onPress={createTaskFromTodaysAction}>
                  <Text style={styles.secondaryButtonText}>אישור</Text>
                </Pressable>
                <Pressable style={styles.backButton} onPress={() => setCreatedTaskConfirm(false)}>
                  <Text style={styles.backButtonText}>ביטול</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.secondaryButton} onPress={() => setCreatedTaskConfirm(true)}>
                <Text style={styles.secondaryButtonText}>להפוך את הפעולה למשימה</Text>
              </Pressable>
            )}
          </View>
        )}
        {isComplete && taskCreated && <Text style={styles.question}>המשימה נוספה.</Text>}

        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            if (isComplete) {
              router.back();
              return;
            }
            setStage(getNextManifestMeditationStage(stage));
          }}
        >
          <Text style={styles.primaryButtonText}>{isComplete ? "סיום" : "המשך"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function AutoTextInput({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  return <TextInput style={styles.textInput} value={value} onChangeText={onChangeText} textAlign="right" multiline />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 14, marginBottom: 6 },
  body: { fontSize: 17, textAlign: "right", lineHeight: 26, marginTop: 24, marginBottom: 32 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, minHeight: 50 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 8 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  backButton: { marginTop: 16, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  suggestLink: { marginBottom: 8, alignItems: "flex-end" },
  suggestLinkText: { color: "#0a7ea4", fontSize: 13 },
  taskConfirmBlock: { marginBottom: 12 },
});

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { ArcBuild, FourWeekProgramWeekNumber } from "../arc/types.ts";
import { getArcBuild, getArcGoal, getArcLink, getPersonalDevelopmentProgram, loadRoutineTriggers, upsertArcGoal, upsertPersonalDevelopmentProgram } from "../data/storage.ts";
import { resolveArcLinkTarget } from "../arc/arcLink.ts";
import {
  FUTURE_ARC_LINK_FUTURE_GRATITUDE_PROMPT,
  FUTURE_ARC_LINK_GRATITUDE_PAST_PROMPT,
  FUTURE_ARC_LINK_IMPROVEMENT_FALLBACK,
  FUTURE_ARC_LINK_IMPROVEMENT_PROMPT,
  FUTURE_ARC_LINK_MEMORY_CUE_PROMPT,
  FUTURE_ARC_LINK_PARTIAL_SUCCESS_PROMPT,
  FUTURE_ARC_LINK_SCHEDULE_LATER_LABEL,
  FUTURE_ARC_LINK_START_ACTION_LABEL,
  FUTURE_ARC_LINK_TITLE,
  FUTURE_ARC_LINK_TRIGGER_ACTIVATION_PROMPT,
  formatFutureArcLinkSequence,
  getFirstFutureArcLinkStage,
  getNextFutureArcLinkStage,
  resolveFutureArcLinkContent,
  resolveFutureArcLinkTriggerTextFromLegacy,
} from "../arc/futureArcLink.ts";
import type { FutureArcLinkContent, FutureArcLinkStage } from "../arc/futureArcLink.ts";
import { resolveDwellSecondsFor } from "../arc/dwellTimes.ts";
import { addPracticeRecord as addGoalPracticeRecord, clearReturnContext as clearGoalReturnContext } from "../arc/fourWeekProgram.ts";
import { addPracticeRecord as addPdPracticeRecord, clearReturnContext as clearPdReturnContext } from "../arc/personalDevelopmentProgram.ts";
import { useDwellCountdown } from "./screens.tsx";

type Status = "loading" | "notEligible" | "ready";

/**
 * live/FutureArcLinkScreen.tsx (route: /future-arc-link/[id], optional
 * ?linkId=)
 *
 * ARC completion/Link simplification task, spec section 8: the Short
 * Future ARC Link's OWN separate practice -- opened without repeating
 * the Full ARC or Mini ARC. The user-facing button is "תרגול קישור
 * עתידי מקוצר"; this is now the ONLY Link practice a trainee can start
 * standalone (the old Regular/ARCHI/Mini/Mini-ARCHI ARC Link family is
 * never reachable from any new-creation UI any more -- see
 * arc/futureArcLink.ts's own module doc).
 *
 * `id` is an ArcBuild id (same convention as live/ArcLinkScreen.tsx).
 * `linkId`, when present, is an OLD saved ArcLink record -- read only to
 * recover a usable trigger text via
 * resolveFutureArcLinkTriggerTextFromLegacy (spec section 12: convert
 * useful old information into the new sequence, never branch UI on the
 * record's own old kind/mode/practiceMode/bridging fields).
 *
 * A short, linear, non-branching local stage walk (arc/futureArcLink.ts's
 * own FutureArcLinkStage order) -- never the full ArcLiveState/
 * arcEngine.ts machinery (this practice never asks ratings, never
 * branches, and never performs a real timed Action). Dwell-gated
 * replay/improved-imagery/begin-action/result screens reuse the SAME
 * useDwellCountdown hook live/screens.tsx's own Full ARC completion
 * screens use -- never a duplicated timer implementation (spec section
 * 13: preserve the completion-required-for-stars dwell rule for these
 * imagery stages).
 */
export default function FutureArcLinkScreen() {
  const {
    id,
    linkId,
    fourWeekGoalId: fourWeekGoalIdParam,
    fourWeekWeek: fourWeekWeekParam,
    pdProgramId: pdProgramIdParam,
    pdWeek: pdWeekParam,
  } = useLocalSearchParams<{
    id: string;
    linkId?: string;
    fourWeekGoalId?: string;
    fourWeekWeek?: string;
    pdProgramId?: string;
    pdWeek?: string;
  }>();
  const fourWeekGoalId = typeof fourWeekGoalIdParam === "string" ? fourWeekGoalIdParam : null;
  const fourWeekWeek = typeof fourWeekWeekParam === "string" ? fourWeekWeekParam : null;
  const pdProgramId = typeof pdProgramIdParam === "string" ? pdProgramIdParam : null;
  const pdWeek = typeof pdWeekParam === "string" ? pdWeekParam : null;

  const [status, setStatus] = useState<Status>("loading");
  const [build, setBuild] = useState<ArcBuild | null>(null);
  const [content, setContent] = useState<FutureArcLinkContent | null>(null);
  const [stage, setStage] = useState<FutureArcLinkStage>(getFirstFutureArcLinkStage());

  const [gratitudePastText, setGratitudePastText] = useState("");
  const [memoryCueText, setMemoryCueText] = useState("");
  const [improvementText, setImprovementText] = useState("");
  const [futureGratitudeText, setFutureGratitudeText] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        if (!id) {
          setStatus("notEligible");
          return;
        }
        const loadedBuild = await getArcBuild(id);
        if (cancelled) return;
        if (!loadedBuild) {
          setStatus("notEligible");
          return;
        }
        const target = resolveArcLinkTarget(loadedBuild.profile);
        let triggerText: string | null = null;
        if (typeof linkId === "string") {
          const [link, triggers] = await Promise.all([getArcLink(linkId), loadRoutineTriggers()]);
          if (cancelled) return;
          const trigger = link ? triggers.find((t) => t.id === link.triggerId) ?? null : null;
          triggerText = resolveFutureArcLinkTriggerTextFromLegacy(link, trigger);
        }
        const resolvedContent = target ? resolveFutureArcLinkContent(loadedBuild.profile, target, triggerText) : null;
        if (cancelled) return;
        if (!resolvedContent) {
          setStatus("notEligible");
          return;
        }
        setBuild(loadedBuild);
        setContent(resolvedContent);
        setStage(getFirstFutureArcLinkStage());
        setGratitudePastText("");
        setMemoryCueText("");
        setImprovementText("");
        setFutureGratitudeText("");
        setStatus("ready");
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [id, linkId])
  );

  function advance() {
    const next = getNextFutureArcLinkStage(stage);
    if (next === null) return;
    setStage(next);
  }

  async function finishWithRealAction() {
    if (build && content) {
      const now = new Date().toISOString();
      if (fourWeekGoalId) {
        const goal = await getArcGoal(fourWeekGoalId);
        if (goal?.fourWeekProgram) {
          const week = (Number(fourWeekWeek) || goal.fourWeekProgram.currentWeek) as FourWeekProgramWeekNumber;
          const updatedProgram = clearGoalReturnContext(
            addGoalPracticeRecord(goal.fourWeekProgram, week, "future_arc_link", `${FUTURE_ARC_LINK_TITLE} -- ${content.actionLabel}`, now)
          );
          await upsertArcGoal({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
        }
        router.replace({ pathname: "/goals/live/[goalId]", params: { goalId: fourWeekGoalId } });
        return;
      }
      if (pdProgramId) {
        const program = await getPersonalDevelopmentProgram(pdProgramId);
        if (program) {
          const week = (Number(pdWeek) || program.currentWeek) as FourWeekProgramWeekNumber;
          const updatedProgram = clearPdReturnContext(
            addPdPracticeRecord(program, week, "future_arc_link", `${FUTURE_ARC_LINK_TITLE} -- ${content.actionLabel}`, now)
          );
          await upsertPersonalDevelopmentProgram({ ...updatedProgram, updatedAt: now });
        }
        router.replace({ pathname: "/personal-development-program/live/[id]", params: { id: pdProgramId } });
        return;
      }
    }
    router.replace("/self-development");
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notEligible") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא נמצאו נתונים מספיקים לתרגול</Text>
          <Text style={styles.body}>כדי לתרגל קישור ARC עתידי מקוצר, יש להגדיר תחילה פעולה בפרוטוקול הזה.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => (id ? router.replace({ pathname: "/build/[id]", params: { id } }) : router.replace("/self-development"))}>
            <Text style={styles.buttonText}>לעריכת הפרוטוקול (BUILD)</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!content) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{FUTURE_ARC_LINK_TITLE}</Text>
        {stage === "gratitude_past" && (
          <View>
            <Text style={styles.body}>{FUTURE_ARC_LINK_GRATITUDE_PAST_PROMPT}</Text>
            <TextInput style={styles.textInput} value={gratitudePastText} onChangeText={setGratitudePastText} textAlign="right" multiline placeholder="אפשר להשאיר ריק" />
            <PrimaryButton label="המשך" onPress={advance} />
          </View>
        )}

        {stage === "memory_cue" && (
          <View>
            <Text style={styles.body}>{FUTURE_ARC_LINK_MEMORY_CUE_PROMPT}</Text>
            <Text style={styles.hint}>{FUTURE_ARC_LINK_PARTIAL_SUCCESS_PROMPT}</Text>
            <TextInput style={styles.textInput} value={memoryCueText} onChangeText={setMemoryCueText} textAlign="right" multiline placeholder="אפשר להשאיר ריק" />
            <PrimaryButton label="המשך" onPress={advance} />
          </View>
        )}

        {stage === "replay" && <ReplayDwellScreen build={build} onContinue={advance} />}

        {stage === "improvement_reminder" && (
          <View>
            <Text style={styles.body}>{FUTURE_ARC_LINK_IMPROVEMENT_PROMPT}</Text>
            <TextInput style={styles.textInput} value={improvementText} onChangeText={setImprovementText} textAlign="right" multiline placeholder="אפשר להשאיר ריק" />
            <PrimaryButton label="המשך" onPress={advance} />
          </View>
        )}

        {stage === "improved_imagery" && <ImprovedDwellScreen build={build} improvementText={improvementText} onContinue={advance} />}

        {stage === "trigger_activation" && (
          <View>
            <Text style={styles.body}>{FUTURE_ARC_LINK_TRIGGER_ACTIVATION_PROMPT}</Text>
            <Text style={styles.body}>{content.triggerCueText}</Text>
            <PrimaryButton label="המשך" onPress={advance} />
          </View>
        )}

        {stage === "cue_sequence" && (
          <View>
            <Text style={styles.futureLinkSequence}>{formatFutureArcLinkSequence(content)}</Text>
            <PrimaryButton label="המשך" onPress={advance} />
          </View>
        )}

        {stage === "begin_action_imagery" && <BeginActionDwellScreen build={build} actionLabel={content.actionLabel} onContinue={advance} />}

        {stage === "result_imagery" && <ResultDwellScreen build={build} onContinue={advance} />}

        {stage === "future_gratitude" && (
          <View>
            <Text style={styles.body}>{FUTURE_ARC_LINK_FUTURE_GRATITUDE_PROMPT}</Text>
            <TextInput style={styles.textInput} value={futureGratitudeText} onChangeText={setFutureGratitudeText} textAlign="right" multiline placeholder="אפשר להשאיר ריק" />
            <PrimaryButton label="המשך" onPress={advance} />
          </View>
        )}

        {stage === "transition" && (
          <View>
            <Text style={styles.title}>סיום</Text>
            <PrimaryButton label={FUTURE_ARC_LINK_START_ACTION_LABEL} onPress={finishWithRealAction} />
            {(fourWeekGoalId || pdProgramId) && (
              <Pressable style={styles.secondaryButton} onPress={finishWithRealAction}>
                <Text style={styles.secondaryButtonText}>{FUTURE_ARC_LINK_SCHEDULE_LATER_LABEL}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.button, styles.fullWidthButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function ReplayDwellScreen({ build, onContinue }: { build: ArcBuild | null; onContinue: () => void }) {
  const target = build ? resolveArcLinkTarget(build.profile) : null;
  const dwellSeconds = build && target ? resolveDwellSecondsFor("completedActionImageryDwellSeconds", target === "habit" ? "habit" : target, build.profile) : 20;
  const { remainingSeconds, complete } = useDwellCountdown(dwellSeconds);
  return (
    <View>
      <Text style={styles.body}>קח רגע לדמיין בקצרה מה קרה בפעם הקודמת -- מהטריגר ועד התוצאה.</Text>
      <Text style={styles.body}>אפשר לעצום עיניים רק אם זה בטוח ונוח לך.</Text>
      {!complete && <Text style={styles.body}>{`הישאר עם הדמיון עוד ${Math.ceil(remainingSeconds)} שניות`}</Text>}
      <PrimaryButton label="המשך" onPress={onContinue} disabled={!complete} />
    </View>
  );
}

function ImprovedDwellScreen({ build, improvementText, onContinue }: { build: ArcBuild | null; improvementText: string; onContinue: () => void }) {
  const target = build ? resolveArcLinkTarget(build.profile) : null;
  const dwellSeconds = build && target ? resolveDwellSecondsFor("improvedActionImageryDwellSeconds", target === "habit" ? "habit" : target, build.profile) : 20;
  const { remainingSeconds, complete } = useDwellCountdown(dwellSeconds);
  const trimmed = improvementText.trim();
  return (
    <View>
      {trimmed.length > 0 ? (
        <Text style={styles.body}>{`בפעם הבאה: ${trimmed}. דמיין את עצמך פועל כך.`}</Text>
      ) : (
        <Text style={styles.body}>{FUTURE_ARC_LINK_IMPROVEMENT_FALLBACK}</Text>
      )}
      {!complete && <Text style={styles.body}>{`הישאר עם הדמיון עוד ${Math.ceil(remainingSeconds)} שניות`}</Text>}
      <PrimaryButton label="המשך" onPress={onContinue} disabled={!complete} />
    </View>
  );
}

function BeginActionDwellScreen({ build, actionLabel, onContinue }: { build: ArcBuild | null; actionLabel: string; onContinue: () => void }) {
  const target = build ? resolveArcLinkTarget(build.profile) : null;
  const dwellSeconds = build && target ? resolveDwellSecondsFor("actionImageryDwellSeconds", target === "habit" ? "habit" : target, build.profile) : 15;
  const { remainingSeconds, complete } = useDwellCountdown(dwellSeconds);
  return (
    <View>
      <Text style={styles.body}>{`דמיין את עצמך מתחיל: ${actionLabel}`}</Text>
      {!complete && <Text style={styles.body}>{`הישאר עם הדמיון עוד ${Math.ceil(remainingSeconds)} שניות`}</Text>}
      <PrimaryButton label="המשך" onPress={onContinue} disabled={!complete} />
    </View>
  );
}

function ResultDwellScreen({ build, onContinue }: { build: ArcBuild | null; onContinue: () => void }) {
  const target = build ? resolveArcLinkTarget(build.profile) : null;
  const dwellSeconds = build && target ? resolveDwellSecondsFor("resultImageryDwellSeconds", target === "habit" ? "habit" : target, build.profile) : 15;
  const { remainingSeconds, complete } = useDwellCountdown(dwellSeconds);
  return (
    <View>
      <Text style={styles.body}>דמיין את התוצאה החיובית של ביצוע הפעולה.</Text>
      {!complete && <Text style={styles.body}>{`הישאר עם הדמיון עוד ${Math.ceil(remainingSeconds)} שניות`}</Text>}
      <PrimaryButton label="המשך" onPress={onContinue} disabled={!complete} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, fontWeight: "600", textAlign: "right", color: "#0a7ea4", marginBottom: 6 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  futureLinkSequence: { fontSize: 17, fontWeight: "600", textAlign: "right", marginBottom: 24, lineHeight: 28 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.4 },
  secondaryButton: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  secondaryButtonText: { fontSize: 15, color: "#0a7ea4", fontWeight: "600" },
});

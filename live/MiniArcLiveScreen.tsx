import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, getArcGoal, getBeliefArc, getMiniArcBuild, getPersonalDevelopmentProgram, getThoughtArc, getUrgeArc, upsertArcGoal, upsertPersonalDevelopmentProgram } from "../data/storage.ts";
import { getMiniArcPersistentColorLine, getMiniArcStageCopy, getNextMiniArcStage } from "../arc/miniArc.ts";
import type { MiniArcBuild, MiniArcStage } from "../arc/miniArc.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/fourWeekProgram.ts";
import { addPracticeRecord as addPdPracticeRecord, clearReturnContext as clearPdReturnContext } from "../arc/personalDevelopmentProgram.ts";
import type { FourWeekProgramWeekNumber } from "../arc/types.ts";
import { resolveMiniStateEncodingContent } from "../arc/stateLive.ts";
import type { MiniStateEncodingContent } from "../arc/stateLive.ts";

/**
 * live/MiniArcLiveScreen.tsx (route: /mini-arc/live/[id])
 *
 * Mini ARC task: the fixed, linear LIVE sequence -- Initial Pause ->
 * Presence Color (persistent line only, never re-asked) -> Name
 * Current State -> One Regulation Anchor -> One Short Encoding Action
 * -> Brief Side-View Imagery -> Beneficial Action -> Short Completion.
 * Deliberately its OWN small useState machine (stage + the one free-text
 * field entered live), not live/LiveSessionScreen.tsx/ArcLiveRenderer.tsx
 * -- no ArcLiveState, no dwell/timer machinery, no rating inputs, no
 * branching: arc/miniArc.ts's getNextMiniArcStage only ever walks
 * forward one fixed step at a time. currentStateText is intentionally
 * never persisted anywhere (kept only in this component's own state,
 * per the spec: "Keep it only in the current session") and is never
 * sent during BUILD.
 *
 * Four-Week Program task (spec section 10, "Optional support and
 * return context"): the optional fourWeekGoalId/fourWeekWeek route
 * params -- set only by live/ArcGoalFourWeekDashboardScreen.tsx's own
 * "התחל תרגול" for Week 2/3 -- mean this run was launched FROM that
 * dashboard. On reaching "complete", this logs a practice record onto
 * that same week (instead of a silent no-op) and returns there instead
 * of the default /mini-arc list, exactly mirroring the existing
 * routineId-aware pattern already used by live/LiveSessionScreen.tsx.
 * Absent (every other Mini ARC run, including one launched from
 * anywhere else) leaves this screen's behavior completely unchanged.
 *
 * Phase 9 (four-week program integration): optional pdProgramId/pdWeek
 * -- set only by the new Personal Development four-week dashboard's own
 * "mini" task for a "state" protocol -- mirrors fourWeekGoalId/
 * fourWeekWeek exactly, as its own separate pair (see
 * arc/personalDevelopmentProgram.ts's own module doc: the two four-week
 * systems stay completely independent).
 */
export default function MiniArcLiveScreen() {
  const { id, fourWeekGoalId, fourWeekWeek, pdProgramId, pdWeek } = useLocalSearchParams<{
    id: string;
    fourWeekGoalId?: string;
    fourWeekWeek?: string;
    pdProgramId?: string;
    pdWeek?: string;
  }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [build, setBuild] = useState<MiniArcBuild | null>(null);
  const [stage, setStage] = useState<MiniArcStage>("pause");
  const [currentStateText, setCurrentStateText] = useState("");
  /** Phase 7 (ARC State composition), spec section 16: resolved only for a protocolKind:"state" Mini with a configured miniStatePrimaryComponent -- null for every other Mini (the overwhelming majority), leaving the existing generic "encoding" copy completely untouched. */
  const [miniStateEncodingOverride, setMiniStateEncodingOverride] = useState<MiniStateEncodingContent | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMiniArcBuild(id).then(async (existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setBuild(existing);
      setStatus("ready");
      if (existing.protocolKind === "state" && existing.miniStatePrimaryComponent && existing.miniStatePrimaryComponent !== "emotion" && existing.parentArcBuildId) {
        const parentBuild = await getArcBuild(existing.parentArcBuildId);
        const [linkedUrgeArc, linkedThoughtArc, linkedBeliefArc] = await Promise.all([
          parentBuild?.profile.linkedUrgeArcId ? getUrgeArc(parentBuild.profile.linkedUrgeArcId) : Promise.resolve(null),
          parentBuild?.profile.linkedThoughtArcId ? getThoughtArc(parentBuild.profile.linkedThoughtArcId) : Promise.resolve(null),
          parentBuild?.profile.linkedBeliefArcId ? getBeliefArc(parentBuild.profile.linkedBeliefArcId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setMiniStateEncodingOverride(resolveMiniStateEncodingContent(existing, linkedUrgeArc, linkedThoughtArc, linkedBeliefArc));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function advance() {
    setStage((current) => getNextMiniArcStage(current));
  }

  async function finishAndReturn() {
    if (typeof fourWeekGoalId === "string" && build) {
      const goal = await getArcGoal(fourWeekGoalId);
      if (goal?.fourWeekProgram) {
        const now = new Date().toISOString();
        const week = (Number(fourWeekWeek) || goal.fourWeekProgram.currentWeek) as FourWeekProgramWeekNumber;
        const updatedProgram = clearReturnContext(addPracticeRecord(goal.fourWeekProgram, week, "mini_arc", `Mini ARC -- ${build.name}`, now));
        await upsertArcGoal({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
      }
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId: fourWeekGoalId } });
      return;
    }
    if (typeof pdProgramId === "string" && build) {
      const program = await getPersonalDevelopmentProgram(pdProgramId);
      if (program) {
        const now = new Date().toISOString();
        const week = (Number(pdWeek) || program.currentWeek) as FourWeekProgramWeekNumber;
        const updatedProgram = clearPdReturnContext(addPdPracticeRecord(program, week, "mini", `Mini ARC -- ${build.name}`, now));
        await upsertPersonalDevelopmentProgram({ ...updatedProgram, updatedAt: now });
      }
      router.replace({ pathname: "/personal-development-program/live/[id]", params: { id: pdProgramId } });
      return;
    }
    router.replace("/mini-arc");
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !build) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>ה-Mini ARC לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/mini-arc")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-Mini ARC</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const baseCopy = getMiniArcStageCopy(stage, build);
  const copy = stage === "encoding" && miniStateEncodingOverride ? { ...baseCopy, body: miniStateEncodingOverride.body, secondaryBody: miniStateEncodingOverride.secondaryBody } : baseCopy;
  const persistentColorLine = getMiniArcPersistentColorLine(build);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Persistent Presence Color line -- visible on every screen, from the initial pause through completion, always the CURRENT build's own saved color. */}
        <Text style={styles.persistentColorLine}>{persistentColorLine}</Text>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        {copy.hint && <Text style={styles.hint}>{copy.hint}</Text>}

        {stage === "name_state" && (
          <TextInput
            style={styles.textInput}
            value={currentStateText}
            onChangeText={setCurrentStateText}
            textAlign="right"
            placeholder="לדוגמה: דחף"
          />
        )}

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => (stage === "complete" ? finishAndReturn() : advance())}
        >
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  persistentColorLine: {
    fontSize: 13,
    textAlign: "right",
    color: "#0a7ea4",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

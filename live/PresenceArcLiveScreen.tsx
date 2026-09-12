import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { appendSessionLogEntry, getPersonalDevelopmentProgram, getPresenceArc, loadMiniArcBuilds, upsertPersonalDevelopmentProgram } from "../data/storage.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/personalDevelopmentProgram.ts";
import type { ArcLiveState, ArcStage, FourWeekProgramWeekNumber, PresenceArc } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import {
  createEmptyPresenceActionLiveState,
  createPresenceArcInitialSession,
  getFirstMiniPresenceLiveStage,
  getFirstPresenceActionLiveStage,
  getMiniPresenceLiveStageCopy,
  getNextMiniPresenceLiveStage,
  getNextPresenceActionLiveStage,
  getPresenceActionLiveStageCopy,
  isPresenceComplete,
  presenceArcToProfile,
} from "../arc/presenceLive.ts";
import type { MiniPresenceLiveStage, PresenceActionLiveStage, PresenceActionLiveState } from "../arc/presenceLive.ts";
import { getInlineRequiredRatingQuestion, getStageCopy } from "../arc/stageCopy.ts";
import { advanceLiveSession } from "./liveEventAdapter.ts";
import { InstructionScreen, PresenceExperienceScreen, PresenceObjectGroundingScreen, PresenceRatingScreen } from "./screens.tsx";

type Status = "loading" | "notFound" | "modeChoice" | "runningFull" | "runningFullAction" | "runningMini" | "completeFull" | "completeMini";

/**
 * live/PresenceArcLiveScreen.tsx (route: /presence-arcs/live/[id])
 *
 * Phase 5 (ARC Presence and ARC Mini Presence): the standalone,
 * independent LIVE entry for a PresenceArc. Deliberately does NOT
 * mirror live/ThoughtArcLiveScreen.tsx/live/UrgeArcLiveScreen.tsx's own
 * "brand-new independent engine" shape for its Full run -- per explicit
 * instruction, Full ARC Presence reuses the EXISTING, unmodified
 * arc/arcEngine.ts Presence stages verbatim, via arc/presenceLive.ts's
 * presenceArcToProfile adapter and live/liveEventAdapter.ts's own
 * advanceLiveSession (the exact same integration point every other ARC
 * session already runs through). Only the small subset of stages
 * Presence can ever produce (presence_check/presence_grounding/
 * arc_thought_awareness/arc_thought_combined_attention/
 * arc_thought_expand_presence, whose own inline rating internally
 * resolves through arc_thought_presence_recheck's transition -- see
 * live/LiveSessionScreen.tsx's own onPresenceExperienceRating for the
 * precedent this mirrors) is ever rendered here; reaching
 * PRESENCE_EXIT_STAGE ("desired_state_check") means the reused Presence
 * work is complete -- this screen then switches to arc/presenceLive.ts's
 * own small NEW "runningFullAction" sub-engine (Phase 8, universal
 * post-action completion retrofit): a genuine "action" stage (the
 * trainee actually performs presenceArc.beneficialAction now), followed
 * by the shared post-action tail. This is exactly the "reusable later
 * inside ARC State" hand-off point arc/presenceLive.ts's own module doc
 * describes -- a later phase's ARC State composition can keep driving
 * the SAME reused session past that point instead of this screen's own
 * action tail.
 *
 * ARC Mini Presence's own short, linear run (when a linked Mini
 * exists) uses arc/presenceLive.ts's own small dedicated engine
 * instead -- mirroring live/ThoughtArcLiveScreen.tsx's mode-choice
 * shape for that half only.
 *
 * Optional goalId query param (same "minimum shared context and return
 * routing" scope as Phase 4's ThoughtArcLiveScreen): when present, this
 * screen returns to that Goal Achievement context on completion instead
 * of Home.
 *
 * Phase 9 (four-week program integration): optional `mode`/`pdProgramId`/
 * `pdWeek` -- same shape and reasoning as live/UrgeArcLiveScreen.tsx's own
 * Phase 9 doc comment.
 */
export default function PresenceArcLiveScreen() {
  const { id, goalId, mode, pdProgramId, pdWeek } = useLocalSearchParams<{
    id: string;
    goalId?: string;
    mode?: "full" | "mini";
    pdProgramId?: string;
    pdWeek?: string;
  }>();
  const hasPd = typeof pdProgramId === "string" && pdProgramId.length > 0;
  const [status, setStatus] = useState<Status>("loading");
  const [presenceArc, setPresenceArc] = useState<PresenceArc | null>(null);
  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  const [fullStage, setFullStage] = useState<ArcStage>("presence_check");
  const [fullSession, setFullSession] = useState<ArcLiveState>(() => createPresenceArcInitialSession());
  const [presenceObjectGroundingDone, setPresenceObjectGroundingDone] = useState(false);

  const [fullActionStage, setFullActionStage] = useState<PresenceActionLiveStage>(getFirstPresenceActionLiveStage());
  const [fullActionState, setFullActionState] = useState<PresenceActionLiveState>(createEmptyPresenceActionLiveState());
  const [pendingText, setPendingText] = useState("");

  const [miniStage, setMiniStage] = useState<MiniPresenceLiveStage>(getFirstMiniPresenceLiveStage());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (typeof id !== "string") return;
      Promise.all([getPresenceArc(id), loadMiniArcBuilds()]).then(([loaded, miniArcs]) => {
        if (cancelled) return;
        if (!loaded) {
          setStatus("notFound");
          return;
        }
        setPresenceArc(loaded);
        const mini = miniArcs.find((m) => m.protocolKind === "presence" && m.parentArcBuildId === id) ?? null;
        setLinkedMini(mini);

        const { profile, activeLayers } = presenceArcToProfile(loaded);
        const initial = createPresenceArcInitialSession();
        const hop = advanceLiveSession("trigger_selection", initial, profile, activeLayers);
        setFullStage(hop.stage);
        setFullSession(hop.session);
        setPresenceObjectGroundingDone(false);
        setFullActionStage(getFirstPresenceActionLiveStage());
        setFullActionState(createEmptyPresenceActionLiveState());
        setPendingText("");

        setMiniStage(getFirstMiniPresenceLiveStage());
        setSessionStartedAt(new Date().toISOString());
        if (mode === "mini" && mini) setStatus("runningMini");
        else if (mode === "full") setStatus("runningFull");
        else setStatus(mini ? "modeChoice" : "runningFull");
      });
      return () => {
        cancelled = true;
      };
    }, [id, mode])
  );

  async function recordPdPracticeIfNeeded(kind: "full" | "mini") {
    if (!hasPd || typeof pdProgramId !== "string") return;
    const program = await getPersonalDevelopmentProgram(pdProgramId);
    if (!program) return;
    const now = new Date().toISOString();
    const week = (Number(pdWeek) || program.currentWeek) as FourWeekProgramWeekNumber;
    const label = kind === "full" ? "ARC Presence מלא" : "ARC Mini Presence";
    const updated = clearReturnContext(addPracticeRecord(program, week, kind, label, now));
    await upsertPersonalDevelopmentProgram({ ...updated, updatedAt: now });
  }

  function finalizeCompletion(kind: "full" | "mini") {
    const finishedAt = new Date().toISOString();
    appendSessionLogEntry({ id: `presence_${sessionStartedAt}_${finishedAt}`, startedAt: sessionStartedAt, finishedAt, success: true, fall: false });
    recordPdPracticeIfNeeded(kind);
  }

  function returnAfterCompletion() {
    if (hasPd && typeof pdProgramId === "string") {
      router.replace({ pathname: "/personal-development-program/live/[id]", params: { id: pdProgramId } });
      return;
    }
    if (typeof goalId === "string" && goalId.length > 0) {
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId } });
      return;
    }
    router.replace("/self-development");
  }

  function advanceFullFrom(transitionStage: ArcStage, patchedSession: ArcLiveState) {
    if (!presenceArc) return;
    const { profile, activeLayers } = presenceArcToProfile(presenceArc);
    const hop = advanceLiveSession(transitionStage, patchedSession, profile, activeLayers);
    setFullStage(hop.stage);
    setFullSession(hop.session);
    if (isPresenceComplete(hop.stage)) {
      // Phase 8 (universal post-action completion retrofit): the reused
      // Presence session is done -- continue into the NEW local action
      // tail (arc/presenceLive.ts's own small sub-engine) rather than
      // completing immediately.
      setFullActionStage(getFirstPresenceActionLiveStage());
      setFullActionState(createEmptyPresenceActionLiveState());
      setPendingText("");
      setStatus("runningFullAction");
    }
  }

  function advanceFullAction(patch: Partial<PresenceActionLiveState["postAction"]> = {}) {
    const patchedState: PresenceActionLiveState = { ...fullActionState, postAction: { ...fullActionState.postAction, ...patch } };
    const hop = getNextPresenceActionLiveStage(fullActionStage, patchedState);
    setFullActionStage(hop.stage);
    setFullActionState(hop.state);
    setPendingText("");
    if (hop.stage === "complete") {
      finalizeCompletion("full");
      setStatus("completeFull");
    }
  }

  function advanceMini() {
    const next = getNextMiniPresenceLiveStage(miniStage);
    setMiniStage(next);
    if (next === "complete") {
      finalizeCompletion("mini");
      setStatus("completeMini");
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
          <Text style={styles.title}>ה-ARC Presence לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/presence-arcs")}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!presenceArc) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "modeChoice") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{presenceArc.name}</Text>
          <Text style={styles.body}>יש לך גם ARC Mini Presence מקושר לפרוטוקול הזה -- באיזו גרסה תרצה לתרגל?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setStatus("runningFull")}>
            <Text style={styles.buttonText}>ARC Presence מלא</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setStatus("runningMini")}>
            <Text style={styles.secondaryButtonText}>ARC Mini Presence</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (status === "completeFull" || status === "completeMini") {
    const hasGoal = typeof goalId === "string" && goalId.length > 0;
    // Phase 8 Part 2 (Identity Extension): Goal Achievement (goalId
    // present) is MANDATORY -- the only button shown continues directly
    // into Identity Extension, never a skip/finish-here alternative.
    // Personal Development (no goalId) keeps the plain completion via
    // returnAfterCompletion exactly as before, plus an additional
    // OPTIONAL button opening live/IdentityExtensionOfferScreen.tsx's
    // own offer question -- declining there (or never tapping it) is
    // never penalized.
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>סיום</Text>
          <Text style={styles.body}>{status === "completeFull" ? "סיימת את ה-ARC Presence." : "סיימת את ה-ARC Mini Presence."}</Text>
          {hasGoal ? (
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => router.replace({ pathname: "/identity-extension/live", params: { track: "goal_achievement", goalId: goalId as string } })}
            >
              <Text style={styles.buttonText}>המשך לבניית הזהות ולפעולה</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={[styles.button, styles.fullWidthButton]}
                onPress={() =>
                  router.push({
                    pathname: "/identity-extension/offer",
                    params: { returnTo: hasPd && typeof pdProgramId === "string" ? `/personal-development-program/live/${pdProgramId}` : "/self-development" },
                  })
                }
              >
                <Text style={styles.buttonText}>כן, להמשיך לבניית הזהות</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={returnAfterCompletion}>
                <Text style={styles.secondaryButtonText}>{hasPd ? "לא, סיימתי -- חזרה לתוכנית" : "לא, סיימתי"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (status === "runningMini") {
    if (!linkedMini) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>ה-ARC Mini המקושר לא נמצא</Text>
          </View>
        </SafeAreaView>
      );
    }
    const copy = getMiniPresenceLiveStageCopy(miniStage, linkedMini);
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={advanceMini}>
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (status === "runningFullAction") {
    const actionCopy = getPresenceActionLiveStageCopy(fullActionStage, presenceArc, fullActionState);
    const isFreeTextStage = fullActionStage === "improvement_entry" || fullActionStage === "gratitude";
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{actionCopy.title}</Text>
          <Text style={styles.body}>{actionCopy.body}</Text>
          {actionCopy.secondaryBody && <Text style={styles.body}>{actionCopy.secondaryBody}</Text>}

          {fullActionStage === "improvement_entry" && (
            <>
              <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
              <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFullAction({ improvementText: pendingText || null })}>
                <Text style={styles.buttonText}>{actionCopy.buttonLabel}</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={() => advanceFullAction()}>
                <Text style={styles.cancelButtonText}>דילוג</Text>
              </Pressable>
            </>
          )}

          {fullActionStage === "gratitude" && (
            <>
              <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
              <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFullAction({ gratitudeText: pendingText || null })}>
                <Text style={styles.buttonText}>{actionCopy.buttonLabel}</Text>
              </Pressable>
            </>
          )}

          {!isFreeTextStage && (
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFullAction()}>
              <Text style={styles.buttonText}>{actionCopy.buttonLabel}</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "runningFull"
  const { profile, activeLayers } = presenceArcToProfile(presenceArc);
  const copy = getStageCopy(fullStage, profile, fullSession, activeLayers);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {(fullStage === "presence_check" || fullStage === "arc_thought_presence_recheck") && (
          <PresenceRatingScreen copy={copy} onSelect={(value) => advanceFullFrom(fullStage, { ...fullSession, presenceRating: value })} />
        )}

        {(fullStage === "presence_grounding" || fullStage === "arc_thought_awareness" || fullStage === "arc_thought_combined_attention") && (
          <InstructionScreen key={fullStage} copy={copy} onContinue={() => advanceFullFrom(fullStage, fullSession)} />
        )}

        {fullStage === "arc_thought_expand_presence" &&
          (!presenceObjectGroundingDone ? (
            <PresenceObjectGroundingScreen onComplete={() => setPresenceObjectGroundingDone(true)} />
          ) : (
            <PresenceExperienceScreen
              key={`${fullStage}-${fullSession.loopIterationCount}`}
              copy={copy}
              question={getInlineRequiredRatingQuestion("presence")}
              onSelectRating={(value) => advanceFullFrom("arc_thought_presence_recheck", { ...fullSession, presenceRating: value })}
            />
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 20 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  cancelButton: { marginTop: 10, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

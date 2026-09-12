import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { appendSessionLogEntry, getPresenceArc, loadMiniArcBuilds } from "../data/storage.ts";
import type { ArcLiveState, ArcStage, PresenceArc } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import {
  createPresenceArcInitialSession,
  getFirstMiniPresenceLiveStage,
  getMiniPresenceLiveStageCopy,
  getNextMiniPresenceLiveStage,
  isPresenceComplete,
  presenceArcToProfile,
} from "../arc/presenceLive.ts";
import type { MiniPresenceLiveStage } from "../arc/presenceLive.ts";
import { getInlineRequiredRatingQuestion, getStageCopy } from "../arc/stageCopy.ts";
import { advanceLiveSession } from "./liveEventAdapter.ts";
import { InstructionScreen, PresenceExperienceScreen, PresenceObjectGroundingScreen, PresenceRatingScreen } from "./screens.tsx";

type Status = "loading" | "notFound" | "modeChoice" | "runningFull" | "runningMini" | "completeFull" | "completeMini";

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
 * PRESENCE_EXIT_STAGE ("desired_state_check") means Presence work is
 * complete and this screen stops, exactly the "reusable later inside
 * ARC State" hand-off point arc/presenceLive.ts's own module doc
 * describes -- a later phase's ARC State composition can keep driving
 * the SAME session past that point instead.
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
 */
export default function PresenceArcLiveScreen() {
  const { id, goalId } = useLocalSearchParams<{ id: string; goalId?: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [presenceArc, setPresenceArc] = useState<PresenceArc | null>(null);
  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  const [fullStage, setFullStage] = useState<ArcStage>("presence_check");
  const [fullSession, setFullSession] = useState<ArcLiveState>(() => createPresenceArcInitialSession());
  const [presenceObjectGroundingDone, setPresenceObjectGroundingDone] = useState(false);

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

        setMiniStage(getFirstMiniPresenceLiveStage());
        setSessionStartedAt(new Date().toISOString());
        setStatus(mini ? "modeChoice" : "runningFull");
      });
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  function finalizeCompletion() {
    const finishedAt = new Date().toISOString();
    appendSessionLogEntry({ id: `presence_${sessionStartedAt}_${finishedAt}`, startedAt: sessionStartedAt, finishedAt, success: true, fall: false });
  }

  function returnAfterCompletion() {
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
      finalizeCompletion();
      setStatus("completeFull");
    }
  }

  function advanceMini() {
    const next = getNextMiniPresenceLiveStage(miniStage);
    setMiniStage(next);
    if (next === "complete") {
      finalizeCompletion();
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
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>סיום</Text>
          <Text style={styles.body}>{status === "completeFull" ? "סיימת את ה-ARC Presence." : "סיימת את ה-ARC Mini Presence."}</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={returnAfterCompletion}>
            <Text style={styles.buttonText}>{typeof goalId === "string" && goalId.length > 0 ? "חזרה למטרה" : "חזרה להתפתחות אישית"}</Text>
          </Pressable>
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
});

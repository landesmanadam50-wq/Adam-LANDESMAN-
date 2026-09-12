import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { appendSessionLogEntry, getBeliefArc, loadMiniArcBuilds, loadProfile } from "../data/storage.ts";
import { createEmptyBeliefArc } from "../arc/types.ts";
import type { ArcBuildProfile, BeliefArc } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import {
  createEmptyBeliefLiveState,
  getBeliefLiveStageCopy,
  getFirstBeliefLiveStage,
  getFirstMiniBeliefLiveStage,
  getMiniBeliefLiveStageCopy,
  getNextBeliefLiveStage,
  getNextMiniBeliefLiveStage,
  resolveEffectiveBeliefArc,
} from "../arc/beliefLive.ts";
import type { BeliefLiveStage, BeliefLiveState, MiniBeliefLiveStage } from "../arc/beliefLive.ts";

type Status = "loading" | "notFound" | "openingChoice" | "modeChoice" | "runningFull" | "runningMini" | "completeFull" | "completeMini";

const FREE_TEXT_STAGES: BeliefLiveStage[] = ["recognition", "replacement_belief", "future_insight", "future_action", "improvement_entry", "gratitude"];

/**
 * live/BeliefArcLiveScreen.tsx (route: /belief-arcs/live/[id], id="new" for a session-only belief)
 *
 * Phase 6 (ARC Belief and ARC Mini Belief): the standalone, independent
 * LIVE entry for a BeliefArc -- spec section 2: "ARC Belief must be
 * available as an independent LIVE protocol." Drives
 * arc/beliefLive.ts's independent pure engine directly, mirroring
 * live/ThoughtArcLiveScreen.tsx's own shape (mode choice between
 * Full/Mini when a linked Mini exists, generic stage renderer, session
 * log completion record).
 *
 * id === "new" (spec section 3, "לכתוב אמונה שמופיעה עכשיו"): opens an
 * opening-choice screen instead of loading a saved BeliefArc --
 * choosing a saved belief routes to the list screen (its own existing
 * LIVE button already launches this same screen with a real id);
 * choosing to write a new one starts a SESSION-ONLY ephemeral run
 * (never persisted, no linked Mini, no goalId context) whose
 * "recognition" stage is exactly where the trainee types that belief.
 *
 * Optional goalId query param (same "minimum shared context and return
 * routing" scope as Phase 4/5's own LIVE screens): when present, this
 * screen returns to that Goal Achievement context on completion.
 */
export default function BeliefArcLiveScreen() {
  const { id, goalId } = useLocalSearchParams<{ id: string; goalId?: string }>();
  const isSessionOnly = id === "new";
  const [status, setStatus] = useState<Status>(isSessionOnly ? "openingChoice" : "loading");
  const [beliefArc, setBeliefArc] = useState<BeliefArc | null>(null);
  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  const [fullStage, setFullStage] = useState<BeliefLiveStage>(getFirstBeliefLiveStage());
  const [fullState, setFullState] = useState<BeliefLiveState>(createEmptyBeliefLiveState());
  const [pendingText, setPendingText] = useState("");
  const [pendingSecondaryText, setPendingSecondaryText] = useState("");
  const [pendingTertiaryText, setPendingTertiaryText] = useState("");

  const [miniStage, setMiniStage] = useState<MiniBeliefLiveStage>(getFirstMiniBeliefLiveStage());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (isSessionOnly) return;
      if (typeof id !== "string") return;
      Promise.all([getBeliefArc(id), loadMiniArcBuilds(), loadProfile()]).then(([loaded, miniArcs, profile]: [BeliefArc | null, MiniArcBuild[], ArcBuildProfile | null]) => {
        if (cancelled) return;
        if (!loaded) {
          setStatus("notFound");
          return;
        }
        const mini = miniArcs.find((m) => m.protocolKind === "belief" && m.parentArcBuildId === id) ?? null;
        setBeliefArc(resolveEffectiveBeliefArc(loaded, mini, profile));
        setLinkedMini(mini);
        resetSession();
        setStatus(mini ? "modeChoice" : "runningFull");
      });
      return () => {
        cancelled = true;
      };
    }, [id, isSessionOnly])
  );

  function resetSession() {
    setFullStage(getFirstBeliefLiveStage());
    setFullState(createEmptyBeliefLiveState());
    setMiniStage(getFirstMiniBeliefLiveStage());
    setPendingText("");
    setPendingSecondaryText("");
    setPendingTertiaryText("");
    setSessionStartedAt(new Date().toISOString());
  }

  function startSessionOnlyRun() {
    setBeliefArc(createEmptyBeliefArc("session-belief", "", new Date().toISOString()));
    setLinkedMini(null);
    resetSession();
    setStatus("runningFull");
  }

  function finalizeCompletion() {
    const finishedAt = new Date().toISOString();
    appendSessionLogEntry({ id: `belief_${sessionStartedAt}_${finishedAt}`, startedAt: sessionStartedAt, finishedAt, success: true, fall: false });
  }

  function returnAfterCompletion() {
    if (typeof goalId === "string" && goalId.length > 0) {
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId } });
      return;
    }
    router.replace("/self-development");
  }

  function advanceFull(next: Partial<BeliefLiveState> = {}) {
    const patched: BeliefLiveState = { ...fullState, ...next };
    const hop = getNextBeliefLiveStage(fullStage, patched);
    setFullStage(hop.stage);
    setFullState(hop.state);
    setPendingText("");
    setPendingSecondaryText("");
    setPendingTertiaryText("");
    if (hop.stage === "complete") {
      finalizeCompletion();
      setStatus("completeFull");
    }
  }

  function advanceMini() {
    const next = getNextMiniBeliefLiveStage(miniStage).stage;
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

  if (status === "openingChoice") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>על איזו אמונה תרצה לעבוד?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/belief-arcs")}>
            <Text style={styles.buttonText}>לבחור אמונה ששמרתי</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={startSessionOnlyRun}>
            <Text style={styles.secondaryButtonText}>לכתוב אמונה שמופיעה עכשיו</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (status === "notFound") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>ה-ARC Belief לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/belief-arcs")}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!beliefArc) {
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
          <Text style={styles.title}>{beliefArc.name}</Text>
          <Text style={styles.body}>יש לך גם ARC Mini Belief מקושר לפרוטוקול הזה -- באיזו גרסה תרצה לתרגל?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setStatus("runningFull")}>
            <Text style={styles.buttonText}>ARC Belief מלא</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setStatus("runningMini")}>
            <Text style={styles.secondaryButtonText}>ARC Mini Belief</Text>
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
          <Text style={styles.body}>{status === "completeFull" ? "סיימת את ה-ARC Belief." : "סיימת את ה-ARC Mini Belief."}</Text>
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
                onPress={() => router.push({ pathname: "/identity-extension/offer", params: { returnTo: "/self-development" } })}
              >
                <Text style={styles.buttonText}>כן, להמשיך לבניית הזהות</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={returnAfterCompletion}>
                <Text style={styles.secondaryButtonText}>לא, סיימתי</Text>
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
    const copy = getMiniBeliefLiveStageCopy(miniStage, linkedMini, beliefArc, null);
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
  const copy = getBeliefLiveStageCopy(fullStage, beliefArc, fullState);
  const isFreeTextStage = FREE_TEXT_STAGES.includes(fullStage);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        {copy.hint && <Text style={styles.hint}>{copy.hint}</Text>}

        {fullStage === "recognition" && (
          <>
            <Text style={styles.question}>האמונה (רשות)</Text>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Text style={styles.question}>המצב (רשות)</Text>
            <TextInput style={styles.textInput} value={pendingSecondaryText} onChangeText={setPendingSecondaryText} textAlign="right" multiline />
            <Text style={styles.question}>רגש או תחושה (רשות)</Text>
            <TextInput style={styles.textInput} value={pendingTertiaryText} onChangeText={setPendingTertiaryText} textAlign="right" multiline />
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => advanceFull({ limitingBeliefText: pendingText || null, situationText: pendingSecondaryText || null, emotionText: pendingTertiaryText || null })}
            >
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "replacement_belief" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline placeholder="אפשר לכתוב אמונה תומכת חדשה, או לדלג" />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ liveReplacementBeliefText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "future_insight" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline placeholder={copy.secondaryBody ?? ""} />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ futureInsightText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "future_action" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline placeholder={copy.secondaryBody ?? ""} />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ futureActionText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "improvement_entry" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ improvementText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => advanceFull()}>
              <Text style={styles.cancelButtonText}>דילוג</Text>
            </Pressable>
          </>
        )}

        {fullStage === "gratitude" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ gratitudeText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {!isFreeTextStage && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull()}>
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 8, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  cancelButton: { marginTop: 10, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

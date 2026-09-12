import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { appendSessionLogEntry, getThoughtArc, loadMiniArcBuilds, upsertThoughtArc } from "../data/storage.ts";
import { saveUsefulInsightToThoughtArc } from "../arc/thoughtArcs.ts";
import type { ThoughtArc, ThoughtModality, ThoughtTimeOrientation } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import {
  createEmptyMiniThoughtLiveState,
  createEmptyThoughtLiveState,
  getFirstMiniThoughtLiveStage,
  getFirstThoughtLiveStage,
  getMiniThoughtLiveStageCopy,
  getNextMiniThoughtLiveStage,
  getNextThoughtLiveStage,
  getThoughtLiveStageCopy,
  getThoughtModalityOptions,
  getThoughtOpeningDecisionOptions,
  getThoughtTimeOrientationOptions,
  getThoughtUsefulInsightDecisionOptions,
  getTimeOrientedSupportivePromptQuestion,
  THOUGHT_USEFUL_INSIGHT_HELPER_CATEGORIES,
} from "../arc/thoughtLive.ts";
import type { MiniThoughtLiveStage, MiniThoughtLiveState, ThoughtLiveStage, ThoughtLiveState, UsefulInsightDecision } from "../arc/thoughtLive.ts";

type Status = "loading" | "notFound" | "modeChoice" | "runningFull" | "runningMini" | "completeFull" | "completeMini";

/**
 * live/ThoughtArcLiveScreen.tsx (route: /thought-arcs/live/[id])
 *
 * Phase 4 (ARC Thought and ARC Mini Thought): the standalone,
 * independent LIVE entry for a ThoughtArc -- spec section 2: "ARC
 * Thought must be available as an independent LIVE protocol." Drives
 * arc/thoughtLive.ts's independent pure engine directly, mirroring
 * live/UrgeArcLiveScreen.tsx's own shape exactly (mode choice between
 * Full/Mini when a linked Mini exists, generic stage renderer, session
 * log completion record).
 *
 * Optional goalId/subGoalId query params (spec section 25's own
 * "minimum shared context and return routing"): when present, ARC
 * Thought was opened from a Goal Achievement context -- on completion
 * this screen returns to that context (the goal's own four-week
 * dashboard) instead of Home, WITHOUT marking any goal action
 * completed and WITHOUT repeating Stay/Acceptance/Presence/Regulation
 * (this screen never touches the goal's own outer/inner run at all).
 * The full ArcGoalThoughtMapping-style embedded bridge Urge got in
 * Phase 3 is explicitly out of scope this phase (spec: "except for the
 * minimum shared context and return routing required for ARC
 * Thought").
 */
export default function ThoughtArcLiveScreen() {
  const { id, goalId } = useLocalSearchParams<{ id: string; goalId?: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [thoughtArc, setThoughtArc] = useState<ThoughtArc | null>(null);
  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  const [fullStage, setFullStage] = useState<ThoughtLiveStage>(getFirstThoughtLiveStage());
  const [fullState, setFullState] = useState<ThoughtLiveState>(createEmptyThoughtLiveState());
  const [pendingText, setPendingText] = useState("");
  const [pendingSecondaryText, setPendingSecondaryText] = useState("");

  const [miniStage, setMiniStage] = useState<MiniThoughtLiveStage>(getFirstMiniThoughtLiveStage());
  const [miniState, setMiniState] = useState<MiniThoughtLiveState>(createEmptyMiniThoughtLiveState());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (typeof id !== "string") return;
      Promise.all([getThoughtArc(id), loadMiniArcBuilds()]).then(([loaded, miniArcs]) => {
        if (cancelled) return;
        if (!loaded) {
          setStatus("notFound");
          return;
        }
        setThoughtArc(loaded);
        const mini = miniArcs.find((m) => m.protocolKind === "thought" && m.parentArcBuildId === id) ?? null;
        setLinkedMini(mini);
        setFullStage(getFirstThoughtLiveStage());
        setFullState(createEmptyThoughtLiveState());
        setMiniStage(getFirstMiniThoughtLiveStage());
        setMiniState(createEmptyMiniThoughtLiveState());
        setPendingText("");
        setPendingSecondaryText("");
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
    appendSessionLogEntry({ id: `thought_${sessionStartedAt}_${finishedAt}`, startedAt: sessionStartedAt, finishedAt, success: true, fall: false });
  }

  function returnAfterCompletion() {
    if (typeof goalId === "string" && goalId.length > 0) {
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId } });
      return;
    }
    router.replace("/self-development");
  }

  function advanceFull(next: Partial<ThoughtLiveState> = {}) {
    const patched: ThoughtLiveState = { ...fullState, ...next };
    const hop = getNextThoughtLiveStage(fullStage, patched);
    setFullStage(hop.stage);
    setFullState(hop.state);
    setPendingText("");
    setPendingSecondaryText("");
    if (hop.stage === "complete") {
      finalizeCompletion();
      // Spec sections 13/22: a LIVE-found useful insight is saved back
      // onto the ThoughtArc so future Full/Mini sessions can reuse it
      // without asking again -- never for a "not now" answer, and never
      // overwriting an existing insight with blank text.
      if (thoughtArc && hop.state.usefulInsightText && hop.state.usefulInsightText.trim().length > 0) {
        const updated = saveUsefulInsightToThoughtArc(thoughtArc, hop.state.usefulInsightText, new Date().toISOString());
        upsertThoughtArc(updated);
      }
      setStatus("completeFull");
    }
  }

  function advanceMini(next: Partial<MiniThoughtLiveState> = {}) {
    const patched: MiniThoughtLiveState = { ...miniState, ...next };
    const hop = getNextMiniThoughtLiveStage(miniStage, patched);
    setMiniStage(hop.stage);
    setMiniState(hop.state);
    if (hop.stage === "complete") {
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
          <Text style={styles.title}>ה-ARC Thought לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/thought-arcs")}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!thoughtArc) {
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
          <Text style={styles.title}>{thoughtArc.name}</Text>
          <Text style={styles.body}>יש לך גם ARC Mini Thought מקושר לפרוטוקול הזה -- באיזו גרסה תרצה לתרגל?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setStatus("runningFull")}>
            <Text style={styles.buttonText}>ARC Thought מלא</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setStatus("runningMini")}>
            <Text style={styles.secondaryButtonText}>ARC Mini Thought</Text>
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
          <Text style={styles.body}>{status === "completeFull" ? "סיימת את ה-ARC Thought." : "סיימת את ה-ARC Mini Thought."}</Text>
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
    const copy = getMiniThoughtLiveStageCopy(miniStage, linkedMini, thoughtArc, miniState);
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
          {miniStage === "modality" ? (
            <View style={styles.chipRow}>
              {getThoughtModalityOptions().map((option) => (
                <Pressable key={option.value} style={styles.chip} onPress={() => advanceMini({ modality: option.value })}>
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceMini()}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "runningFull"
  const copy = getThoughtLiveStageCopy(fullStage, thoughtArc, fullState);
  const hasSavedSupportive = (thoughtArc.supportiveThought ?? "").trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        {copy.hint && <Text style={styles.hint}>{copy.hint}</Text>}

        {fullStage === "opening_decision" && (
          <>
            {getThoughtOpeningDecisionOptions().map((option) => (
              <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ route: option.value })}>
                <Text style={styles.buttonText}>{option.label}</Text>
              </Pressable>
            ))}
          </>
        )}

        {fullStage === "recognition" && (
          <>
            <Text style={styles.question}>המחשבה (רשות)</Text>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Text style={styles.question}>המצב (רשות)</Text>
            <TextInput style={styles.textInput} value={pendingSecondaryText} onChangeText={setPendingSecondaryText} textAlign="right" multiline />
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => advanceFull({ thoughtText: pendingText || null, situationText: pendingSecondaryText || null })}
            >
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "modality" && (
          <View style={styles.chipRow}>
            {getThoughtModalityOptions().map((option: { value: ThoughtModality; label: string }) => (
              <Pressable key={option.value} style={styles.chip} onPress={() => advanceFull({ modality: option.value })}>
                <Text style={styles.chipText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {fullStage === "emotion" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ emotionText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "time_orientation" && (
          <>
            {getThoughtTimeOrientationOptions().map((option: { value: ThoughtTimeOrientation; label: string }) => (
              <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ timeOrientation: option.value })}>
                <Text style={styles.buttonText}>{option.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => advanceFull({ timeOrientation: null })}>
              <Text style={styles.secondaryButtonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "useful_insight_decision" && (
          <>
            {getThoughtUsefulInsightDecisionOptions().map((option: { value: UsefulInsightDecision; label: string }) => (
              <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ usefulInsightDecision: option.value })}>
                <Text style={styles.buttonText}>{option.label}</Text>
              </Pressable>
            ))}
          </>
        )}

        {fullStage === "useful_insight_entry" && (
          <>
            <Text style={styles.hint}>{THOUGHT_USEFUL_INSIGHT_HELPER_CATEGORIES.join(" · ")}</Text>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ usefulInsightText: pendingText || null })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage === "supportive_fallback" && !hasSavedSupportive && (
          <>
            <Text style={styles.question}>{getTimeOrientedSupportivePromptQuestion(fullState.timeOrientation)}</Text>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ liveSupportiveThought: pendingText || null })}>
              <Text style={styles.buttonText}>שמירה והמשך</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => advanceFull()}>
              <Text style={styles.cancelButtonText}>דילוג, המשך עם עוגן בלבד</Text>
            </Pressable>
          </>
        )}
        {fullStage === "supportive_fallback" && hasSavedSupportive && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull()}>
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        )}

        {fullStage === "supportive_thought_select" && (
          <>
            {hasSavedSupportive && (
              <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull()}>
                <Text style={styles.buttonText}>להשתמש במחשבה השמורה</Text>
              </Pressable>
            )}
            <Text style={styles.question}>{getTimeOrientedSupportivePromptQuestion(null)}</Text>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => advanceFull({ liveSupportiveThought: pendingText || null })}>
              <Text style={styles.secondaryButtonText}>שימוש במחשבה החדשה</Text>
            </Pressable>
          </>
        )}

        {fullStage === "future_insight_action" && (
          <>
            <Text style={styles.question}>בפעם הבאה אני אזכור ש...</Text>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline placeholder={thoughtArc.futureInsight ?? ""} />
            <Text style={styles.question}>כאשר זה יקרה, אפעל כך...</Text>
            <TextInput style={styles.textInput} value={pendingSecondaryText} onChangeText={setPendingSecondaryText} textAlign="right" multiline placeholder={thoughtArc.shortAction ?? ""} />
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => advanceFull({ futureInsightText: pendingText || null, actionText: pendingSecondaryText || null })}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </>
        )}

        {![
          "opening_decision",
          "recognition",
          "modality",
          "emotion",
          "time_orientation",
          "useful_insight_decision",
          "useful_insight_entry",
          "supportive_fallback",
          "supportive_thought_select",
          "future_insight_action",
        ].includes(fullStage) && (
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
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 12 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  chipText: { color: "#0a7ea4", fontSize: 15 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  cancelButton: { marginTop: 10, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

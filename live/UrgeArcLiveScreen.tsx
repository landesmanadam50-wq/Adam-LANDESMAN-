import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { appendSessionLogEntry, getPersonalDevelopmentProgram, getUrgeArc, loadMiniArcBuilds, upsertPersonalDevelopmentProgram } from "../data/storage.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/personalDevelopmentProgram.ts";
import type { UrgeArc, UrgeRepresentation, FourWeekProgramWeekNumber } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import {
  createEmptyMiniUrgeLiveState,
  createEmptyUrgeLiveState,
  getFirstMiniUrgeLiveStage,
  getFirstUrgeLiveStage,
  getMiniUrgeLiveStageCopy,
  getNextMiniUrgeLiveStage,
  getNextUrgeLiveStage,
  getUrgeLiveStageCopy,
  getUrgeRepresentationOptions,
} from "../arc/urgeLive.ts";
import type { MiniUrgeLiveStage, MiniUrgeLiveState, UrgeLiveStage, UrgeLiveState, UrgeRecheckChoice } from "../arc/urgeLive.ts";

type Status = "loading" | "notFound" | "modeChoice" | "runningFull" | "runningMini" | "completeFull" | "completeMini";

/**
 * live/UrgeArcLiveScreen.tsx (route: /urge-arcs/live/[id])
 *
 * Phase 3 (Full + Mini ARC Urge representation encoding): the FIRST
 * standalone, Personal-Development-mode LIVE entry for an UrgeArc --
 * previously an urge could only ever run bridged inside an ARC Goal
 * session (see build/UrgeArcListScreen.tsx's own doc: "an urge only
 * ever runs bridged from within an ARC Goal"). Drives arc/urgeLive.ts's
 * independent pure engine directly -- never arc/arcEngine.ts's shared
 * sequencer, so this screen carries zero risk to any other protocol.
 *
 * Personal Development track (spec section 12): preserves the normal
 * completion record (appendSessionLogEntry, exactly like every other
 * LIVE completion), never requires an identity step to save the
 * session, and -- since the shared Identity Extension engine belongs
 * to a later phase -- simply completes here without inventing an
 * incomplete duplicate of it (spec's own explicit allowance: "Offer
 * the optional Identity Extension when that shared routing becomes
 * available").
 *
 * Phase 9 (four-week program integration): optional `mode` ("full"/
 * "mini") lets a launching screen -- specifically the new Personal
 * Development four-week dashboard -- pre-select which version to run,
 * bypassing the modeChoice screen above (used only when the trainee
 * opened this Urge ARC directly, with no specific week task in mind).
 * Optional `pdProgramId`/`pdWeek` mirror live/ArcLinkScreen.tsx's own
 * fourWeekGoalId/fourWeekWeek pattern exactly: when present, completion
 * logs a "full"/"mini" practice record onto that Personal Development
 * program's own week (never onto an ArcGoal -- the two four-week
 * systems stay completely separate, see arc/personalDevelopmentProgram.ts's
 * own module doc) and offers a route back to its dashboard alongside the
 * existing optional Identity Extension offer -- never mandatory, exactly
 * like every other Personal Development completion.
 */
export default function UrgeArcLiveScreen() {
  const { id, goalId, mode, pdProgramId, pdWeek } = useLocalSearchParams<{
    id: string;
    goalId?: string;
    mode?: "full" | "mini";
    pdProgramId?: string;
    pdWeek?: string;
  }>();
  const hasGoal = typeof goalId === "string" && goalId.length > 0;
  const hasPd = typeof pdProgramId === "string" && pdProgramId.length > 0;
  const [status, setStatus] = useState<Status>("loading");
  const [urgeArc, setUrgeArc] = useState<UrgeArc | null>(null);
  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  const [fullStage, setFullStage] = useState<UrgeLiveStage>(getFirstUrgeLiveStage());
  const [fullState, setFullState] = useState<UrgeLiveState>(createEmptyUrgeLiveState());
  const [recheckIntensityText, setRecheckIntensityText] = useState("");
  const [pendingText, setPendingText] = useState("");

  const [miniStage, setMiniStage] = useState<MiniUrgeLiveStage>(getFirstMiniUrgeLiveStage());
  const [miniState, setMiniState] = useState<MiniUrgeLiveState>(createEmptyMiniUrgeLiveState());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (typeof id !== "string") return;
      Promise.all([getUrgeArc(id), loadMiniArcBuilds()]).then(([loadedUrgeArc, miniArcs]) => {
        if (cancelled) return;
        if (!loadedUrgeArc) {
          setStatus("notFound");
          return;
        }
        setUrgeArc(loadedUrgeArc);
        const mini = miniArcs.find((m) => m.protocolKind === "urge" && m.parentArcBuildId === id) ?? null;
        setLinkedMini(mini);
        setFullStage(getFirstUrgeLiveStage());
        setFullState(createEmptyUrgeLiveState());
        setMiniStage(getFirstMiniUrgeLiveStage());
        setMiniState(createEmptyMiniUrgeLiveState());
        setRecheckIntensityText("");
        setPendingText("");
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
    const label = kind === "full" ? "ARC Urge מלא" : "ARC Mini Urge";
    const updated = clearReturnContext(addPracticeRecord(program, week, kind, label, now));
    await upsertPersonalDevelopmentProgram({ ...updated, updatedAt: now });
  }

  function finalizeCompletion(kind: "full" | "mini") {
    const finishedAt = new Date().toISOString();
    appendSessionLogEntry({ id: `urge_${sessionStartedAt}_${finishedAt}`, startedAt: sessionStartedAt, finishedAt, success: true, fall: false });
    recordPdPracticeIfNeeded(kind);
  }

  function advanceFull(next: Partial<UrgeLiveState> = {}) {
    const patched: UrgeLiveState = { ...fullState, ...next };
    const hop = getNextUrgeLiveStage(fullStage, patched);
    setFullStage(hop.stage);
    setFullState(hop.state);
    setPendingText("");
    if (hop.stage === "recheck") setRecheckIntensityText("");
    if (hop.stage === "complete") {
      finalizeCompletion("full");
      setStatus("completeFull");
    }
  }

  function advanceMini(next: Partial<MiniUrgeLiveState> = {}) {
    const patched: MiniUrgeLiveState = { ...miniState, ...next };
    const hop = getNextMiniUrgeLiveStage(miniStage, patched);
    setMiniStage(hop.stage);
    setMiniState(hop.state);
    if (hop.stage === "complete") {
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
          <Text style={styles.title}>ה-Urge ARC לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/urge-arcs")}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!urgeArc) {
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
          <Text style={styles.title}>{urgeArc.name}</Text>
          <Text style={styles.body}>יש לך גם ARC Mini Urge מקושר לפרוטוקול הזה -- באיזו גרסה תרצה לתרגל?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setStatus("runningFull")}>
            <Text style={styles.buttonText}>ARC Urge מלא</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setStatus("runningMini")}>
            <Text style={styles.secondaryButtonText}>ARC Mini Urge</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (status === "completeFull" || status === "completeMini") {
    // Phase 8 Part 2 (Identity Extension): Goal Achievement (goalId
    // present) is MANDATORY -- the only button shown continues directly
    // into Identity Extension, never a skip/finish-here alternative.
    // Personal Development (no goalId) keeps the plain completion
    // exactly as before, plus an additional OPTIONAL button opening
    // live/IdentityExtensionOfferScreen.tsx's own offer question --
    // declining there (or never tapping it) is never penalized.
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>סיום</Text>
          <Text style={styles.body}>{status === "completeFull" ? "סיימת את ה-ARC Urge." : "סיימת את ה-ARC Mini Urge."}</Text>
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
                    params: { returnTo: hasPd ? `/personal-development-program/live/${pdProgramId}` : "/self-development" },
                  })
                }
              >
                <Text style={styles.buttonText}>כן, להמשיך לבניית הזהות</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
                onPress={() => router.replace(hasPd ? { pathname: "/personal-development-program/live/[id]", params: { id: pdProgramId as string } } : "/self-development")}
              >
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
    const copy = getMiniUrgeLiveStageCopy(miniStage, linkedMini, miniState);
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
          {miniStage === "representation" ? (
            <View style={styles.chipRow}>
              {getUrgeRepresentationOptions().map((option) => (
                <Pressable key={option.value} style={styles.chip} onPress={() => advanceMini({ representation: option.value })}>
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
  const copy = getUrgeLiveStageCopy(fullStage, urgeArc, fullState);
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        {copy.hint && <Text style={styles.hint}>{copy.hint}</Text>}

        {fullStage === "representation" && (
          <View style={styles.chipRow}>
            {getUrgeRepresentationOptions().map((option: { value: UrgeRepresentation; label: string }) => (
              <Pressable key={option.value} style={styles.chip} onPress={() => advanceFull({ representation: option.value })}>
                <Text style={styles.chipText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {fullStage === "recheck" && (
          <>
            <Text style={styles.question}>עוצמה (רשות, 1-10)</Text>
            <TextInput
              style={styles.textInput}
              value={recheckIntensityText}
              onChangeText={setRecheckIntensityText}
              textAlign="right"
              keyboardType="numeric"
            />
            {(
              [
                { value: "repeat_regulation", label: "לחזור על עוגן הוויסות" },
                { value: "repeat_action", label: "לחזור על הפעולה המיטיבה" },
                { value: "alternative_action", label: "לבחור פעולה חלופית" },
                { value: "finish", label: "סיום" },
              ] as { value: UrgeRecheckChoice; label: string }[]
            ).map((option) => (
              <Pressable
                key={option.value}
                style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
                onPress={() => {
                  const parsed = Number(recheckIntensityText);
                  advanceFull({
                    recheckChoice: option.value,
                    recheckIntensity: Number.isFinite(parsed) && recheckIntensityText.trim().length > 0 ? parsed : null,
                  });
                }}
              >
                <Text style={styles.secondaryButtonText}>{option.label}</Text>
              </Pressable>
            ))}
          </>
        )}

        {fullStage === "improvement_entry" && (
          <>
            <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ postAction: { ...fullState.postAction, improvementText: pendingText || null } })}>
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
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advanceFull({ postAction: { ...fullState.postAction, gratitudeText: pendingText || null } })}>
              <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
            </Pressable>
          </>
        )}

        {fullStage !== "representation" && fullStage !== "recheck" && fullStage !== "improvement_entry" && fullStage !== "gratitude" && (
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

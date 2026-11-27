/**
 * live/ArcAddictionSessionScreen.tsx (route: /arc-addiction/session)
 *
 * ARC Addiction – מסוגלות, זמן וקבלה: renders the ONE active session,
 * whatever stage it is in. Every change goes through
 * data/arcAddictionSession.ts's dispatchAddictionEvent (serialized,
 * persisted, side effects derived), so the screen can be left at any
 * moment and reopened – from the app, from the notification, from the
 * floating overlay – on exactly the same step.
 *
 * The user can always: skip an exercise, end the waiting timer early,
 * document that they acted (also before the wait ended) and go to the
 * self-acceptance ARC, or end the practice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { AddictionProfile } from "../arc/arcAddiction.ts";
import { BEHAVIOR_DURATION_QUICK_PICKS, resolveIntensityChoices, resolveIntensityRoute } from "../arc/arcAddiction.ts";
import type { AddictionArcState } from "../arc/arcAddictionArc.ts";
import type { AddictionSession, AddictionSessionEvent } from "../arc/arcAddictionFlow.ts";
import { getActiveWaitRound, getCurrentWaitRound, getWaitRemainingSeconds, shouldShowGentleStopHint } from "../arc/arcAddictionFlow.ts";
import {
  ACCEPTANCE_ARC_INTRO,
  ARC_ADDICTION_ANSWER_NO,
  ARC_ADDICTION_ANSWER_YES,
  ARC_ADDICTION_DECISION_QUESTION,
  ARC_ADDICTION_INTENSITY_HINT,
  ARC_ADDICTION_INTENSITY_QUESTION,
  BEHAVIOR_LOG_DURATION_QUESTION,
  BEHAVIOR_LOG_HARM_NOTE,
  BEHAVIOR_LOG_INTRO,
  BEHAVIOR_LOG_STOPWATCH_HINT,
  BEHAVIOR_LOG_TITLE,
  CLOSING_MESSAGES,
  describeDurationTargetChange,
  describeWaitTargetChange,
  GENTLE_STOP_HINT,
  INTENSITY_CHOICE_LABELS,
  INTENSITY_ROUTE_MESSAGES,
  PROGRESS_NOT_RESET_NOTE,
} from "../arc/arcAddictionCopy.ts";
import { formatRemainingTime } from "../arc/actionTimer.ts";
import { resolveFocusColorHex } from "../arc/focusColorPalette.ts";
import { DEFAULT_ARC_APPEARANCE_SETTINGS } from "../arc/arcAppearanceSettings.ts";
import type { ArcAppearanceSettings } from "../arc/arcAppearanceSettings.ts";
import { getAddictionProfile } from "../data/arcAddictionStorage.ts";
import { dispatchAddictionEvent, loadCurrentAddictionSession, subscribeAddictionSession } from "../data/arcAddictionSession.ts";
import { loadArcAppearanceSettings } from "../data/storage.ts";
import ArcAddictionArcRunner from "./components/ArcAddictionArcRunner.tsx";
import ArcAddictionRatingRow from "./components/ArcAddictionRatingRow.tsx";
import ArcAddictionSuccessMemoryControls, { useAddictionSuccessMemory } from "./components/ArcAddictionSuccessMemory.tsx";
import { arcAddictionStyles as styles } from "./components/arcAddictionStyles.ts";

const ARC_PERSIST_DEBOUNCE_MS = 600;

export default function ArcAddictionSessionScreen() {
  const [session, setSession] = useState<AddictionSession | null | undefined>(undefined);
  const [profile, setProfile] = useState<AddictionProfile | null>(null);
  const [appearance, setAppearance] = useState<ArcAppearanceSettings>(DEFAULT_ARC_APPEARANCE_SETTINGS);
  const [now, setNow] = useState(() => Date.now());
  const [introIntensity, setIntroIntensity] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [localArc, setLocalArc] = useState<AddictionArcState | null>(null);
  const busyRef = useRef(false);
  const arcPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The ARC state waiting for its debounced save – flushed (not dropped) when the screen unmounts. */
  const pendingArcRef = useRef<AddictionArcState | null>(null);
  const elapsedDispatchedFor = useRef<string | null>(null);

  const applySession = useCallback((next: AddictionSession | null) => {
    setSession(next);
    // While the SAME ARC is running, the screen's local copy is the source of truth (it may hold text typed
    // after the last debounced save) – a stored echo must never roll it back. A new/ended ARC replaces it.
    setLocalArc((previous) => {
      const incoming = next?.arc ?? null;
      if (previous && incoming && previous.kind === incoming.kind && previous.startedAt === incoming.startedAt) return previous;
      return incoming;
    });
  }, []);

  const reload = useCallback(() => {
    loadCurrentAddictionSession()
      .then(async (loaded) => {
        applySession(loaded);
        setProfile(loaded ? await getAddictionProfile(loaded.episode.profileId) : null);
      })
      .catch((error) => {
        console.warn("[ArcAddictionSessionScreen] load failed", error);
        applySession(null);
      });
  }, [applySession]);

  useFocusEffect(
    useCallback(() => {
      reload();
      loadArcAppearanceSettings().then(setAppearance).catch(() => undefined);
      return subscribeAddictionSession((next) => applySession(next));
    }, [reload, applySession])
  );

  // 1s tick only while a wait is running; reaching zero advances to the decision once.
  const activeWait = session ? getActiveWaitRound(session) : null;
  useEffect(() => {
    if (!activeWait) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeWait]);

  useEffect(() => {
    if (!activeWait) return;
    if (getWaitRemainingSeconds(activeWait, new Date(now).toISOString()) > 0) return;
    if (elapsedDispatchedFor.current === activeWait.endsAt) return;
    elapsedDispatchedFor.current = activeWait.endsAt;
    void send({ type: "WAIT_ELAPSED" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, activeWait]);

  const successMemory = useAddictionSuccessMemory(session?.episode.profileId ?? null, session?.stage === "efficacy_arc");

  async function send(event: AddictionSessionEvent): Promise<AddictionSession | null> {
    // WAIT_ELAPSED is idempotent in the reducer, so it is never dropped by the busy guard (a dropped one left the timer at 00:00).
    if (busyRef.current && event.type !== "ARC_UPDATE" && event.type !== "WAIT_ELAPSED") return session ?? null;
    busyRef.current = true;
    try {
      const next = await dispatchAddictionEvent(event);
      if (next === null) {
        leave();
        return null;
      }
      applySession(next);
      if (next.episode.profileId) setProfile(await getAddictionProfile(next.episode.profileId));
      return next;
    } finally {
      busyRef.current = false;
    }
  }

  function leave() {
    const taskId = session?.returnToTaskId ?? null;
    if (taskId) router.replace({ pathname: "/tasks/[id]", params: { id: taskId } });
    else router.replace("/arc-addiction");
  }

  function updateArc(arc: AddictionArcState) {
    const stepChanged = arc.stepIndex !== localArc?.stepIndex;
    setLocalArc(arc);
    if (arcPersistTimer.current) clearTimeout(arcPersistTimer.current);
    if (stepChanged) {
      pendingArcRef.current = null;
      void dispatchAddictionEvent({ type: "ARC_UPDATE", arc });
    } else {
      pendingArcRef.current = arc;
      arcPersistTimer.current = setTimeout(() => {
        pendingArcRef.current = null;
        void dispatchAddictionEvent({ type: "ARC_UPDATE", arc });
      }, ARC_PERSIST_DEBOUNCE_MS);
    }
  }

  function cancelPendingArcSave() {
    if (arcPersistTimer.current) clearTimeout(arcPersistTimer.current);
    pendingArcRef.current = null;
  }

  useEffect(
    () => () => {
      // Leaving the screen: save the last edits instead of dropping them.
      if (arcPersistTimer.current) clearTimeout(arcPersistTimer.current);
      if (pendingArcRef.current) void dispatchAddictionEvent({ type: "ARC_UPDATE", arc: pendingArcRef.current });
    },
    []
  );

  if (session === undefined) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  if (session === null || !profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>אין תרגול פעיל</Text>
          <Text style={styles.subtitle}>אפשר להתחיל תרגול חדש מאחד הפרופילים.</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/arc-addiction")}>
            <Text style={styles.buttonText}>ל־ARC Addiction</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const presenceColor = resolveFocusColorHex(appearance.pointColor);
  const circleColor = resolveFocusColorHex(appearance.circleColor ?? appearance.pointColor);
  const stage = session.stage;
  const canReportActed = stage === "intro" || stage === "efficacy_arc" || stage === "wait" || stage === "decision" || stage === "intensity";

  function renderStage() {
    switch (stage) {
      case "intro":
        return (
          <View>
            <Text style={styles.title}>{session!.profileName}</Text>
            <Text style={styles.subtitle}>מרגיש דחף? נתחיל ב־ARC קצר למסוגלות לשאת את התחושה, ואחריו זמן המתנה.</Text>
            <Text style={styles.body}>{`מהי עוצמת הדחף כרגע? (לא חובה)`}</Text>
            <ArcAddictionRatingRow label="עוצמת הדחף" value={introIntensity} onChange={setIntroIntensity} />
            <Pressable style={styles.button} onPress={() => void send({ type: "START", initialIntensity: introIntensity })}>
              <Text style={styles.buttonText}>התחל ARC למסוגלות</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void send({ type: "SKIP_TO_WAIT", initialIntensity: introIntensity })}>
              <Text style={styles.secondaryButtonText}>{`ישר לטיימר ההמתנה (${profile!.waitTargetMinutes} דק')`}</Text>
            </Pressable>
          </View>
        );

      case "efficacy_arc":
      case "acceptance_arc":
        if (!localArc) return null;
        return (
          <View>
            {stage === "acceptance_arc" && localArc.stepIndex === 0 && <Text style={[styles.noticeCard, styles.body]}>{ACCEPTANCE_ARC_INTRO}</Text>}
            <ArcAddictionArcRunner
              key={`${localArc.kind}:${localArc.startedAt}`}
              arc={localArc}
              profile={profile!}
              successMemory={localArc.kind === "efficacy" ? successMemory.memory : null}
              onAnotherSuccessMemory={successMemory.memory ? successMemory.another : undefined}
              presenceColor={presenceColor}
              circleColor={circleColor}
              onChange={updateArc}
              onComplete={(arc) => {
                cancelPendingArcSave();
                void send({ type: "ARC_COMPLETE", arc });
              }}
              onSkip={() => {
                cancelPendingArcSave();
                void send({ type: "ARC_SKIP" });
              }}
            />
          </View>
        );

      case "wait": {
        const round = activeWait ?? getCurrentWaitRound(session!);
        const remaining = round ? getWaitRemainingSeconds(round, new Date(now).toISOString()) : 0;
        return (
          <View>
            <Text style={styles.title}>זמן המתנה</Text>
            <Text style={styles.subtitle}>{`יעד נוכחי: ${round?.targetMinutes ?? profile!.waitTargetMinutes} דק'`}</Text>
            <Text style={styles.bigTimer} accessibilityLabel="זמן המתנה שנותר">
              {formatRemainingTime(remaining)}
            </Text>
            <Text style={styles.body}>אפשר להמשיך בפעילות הרגילה ואפילו לצאת מהאפליקציה – בסיום תגיע התראה.</Text>
            {shouldShowGentleStopHint(session!) && <Text style={[styles.noticeCard, styles.muted]}>{GENTLE_STOP_HINT}</Text>}
            {session!.returnToTaskId && (
              <Pressable style={styles.button} onPress={leave}>
                <Text style={styles.buttonText}>חזרה למשימה (הטיימר ממשיך)</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryButton} onPress={() => void send({ type: "END_WAIT_EARLY" })}>
              <Text style={styles.secondaryButtonText}>סיום הטיימר לפני הזמן</Text>
            </Pressable>
            {!session!.returnToTaskId && (
              <Pressable style={styles.linkButton} onPress={() => router.replace("/arc-addiction")}>
                <Text style={styles.linkButtonText}>יציאה (הטיימר ממשיך ברקע)</Text>
              </Pressable>
            )}
          </View>
        );
      }

      case "decision":
        return (
          <View>
            <Text style={styles.title}>זמן ההמתנה הסתיים</Text>
            <Text style={styles.primaryLine}>{ARC_ADDICTION_DECISION_QUESTION}</Text>
            <View style={[styles.row, { justifyContent: "center" }]}>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={() => void send({ type: "ANSWER", choice: "not_act", episodeId: session!.episode.id })}>
                <Text style={styles.buttonText}>{ARC_ADDICTION_ANSWER_NO}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={() => void send({ type: "ANSWER", choice: "act", episodeId: session!.episode.id })}>
                <Text style={styles.secondaryButtonText}>{ARC_ADDICTION_ANSWER_YES}</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>שתי התשובות בסדר. הבחירה שלך.</Text>
          </View>
        );

      case "intensity": {
        const route = resolveIntensityRoute(session!.intensityDraft);
        return (
          <View>
            <Text style={styles.title}>בחרת שלא לפעול לפי הדחף</Text>
            <Text style={styles.body}>{ARC_ADDICTION_INTENSITY_QUESTION}</Text>
            <Text style={styles.muted}>{ARC_ADDICTION_INTENSITY_HINT}</Text>
            <ArcAddictionRatingRow label="עוצמת הדחף" value={session!.intensityDraft} allowClear={false} onChange={(value) => void send({ type: "RATE_INTENSITY", intensity: value })} />
            {route && (
              <View>
                <Text style={[styles.noticeCard, styles.body]}>{INTENSITY_ROUTE_MESSAGES[route]}</Text>
                {resolveIntensityChoices(route).map((choice, index) => (
                  <Pressable key={choice} style={index === 0 ? styles.button : styles.secondaryButton} onPress={() => void send({ type: "CHOOSE", choice })}>
                    <Text style={index === 0 ? styles.buttonText : styles.secondaryButtonText}>
                      {choice === "extra_wait" ? `${INTENSITY_CHOICE_LABELS.extra_wait} (${profile!.waitTargetMinutes} דק')` : INTENSITY_CHOICE_LABELS[choice]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {shouldShowGentleStopHint(session!) && <Text style={[styles.noticeCard, styles.muted]}>{GENTLE_STOP_HINT}</Text>}
          </View>
        );
      }

      case "behavior_log": {
        const stopwatchRunning = session!.stopwatchStartedAt !== null;
        const elapsed = stopwatchRunning ? Math.max(0, Math.floor((now - Date.parse(session!.stopwatchStartedAt!)) / 1000)) : 0;
        const parsedCustom = Number(customDuration);
        const customValid = customDuration.trim() !== "" && Number.isFinite(parsedCustom) && parsedCustom >= 0;
        return (
          <View>
            <Text style={styles.title}>{BEHAVIOR_LOG_TITLE}</Text>
            <Text style={styles.body}>{BEHAVIOR_LOG_INTRO}</Text>
            {session!.mayCauseBodilyHarm && <Text style={[styles.noticeCard, styles.muted]}>{BEHAVIOR_LOG_HARM_NOTE}</Text>}
            {profile!.behaviorDurationTargetMinutes !== null && <Text style={styles.muted}>{`יעד עדין למשך: עד ${profile!.behaviorDurationTargetMinutes} דק' – לא דרישה.`}</Text>}
            {stopwatchRunning ? (
              <View>
                <Text style={styles.bigTimer}>{formatRemainingTime(elapsed)}</Text>
                <Pressable style={styles.button} onPress={() => void send({ type: "STOP_STOPWATCH" })}>
                  <Text style={styles.buttonText}>סיימתי</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Text style={styles.body}>{BEHAVIOR_LOG_DURATION_QUESTION}</Text>
                <View style={styles.row}>
                  {BEHAVIOR_DURATION_QUICK_PICKS.map((minutes) => (
                    <Pressable key={minutes} style={styles.chip} onPress={() => void send({ type: "LOG_BEHAVIOR", durationMinutes: minutes })}>
                      <Text style={styles.chipText}>{`${minutes} דק'`}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={styles.input} keyboardType="numeric" placeholder="מספר דקות אחר" value={customDuration} onChangeText={setCustomDuration} />
                <Pressable style={[styles.button, !customValid && styles.disabled]} disabled={!customValid} onPress={() => void send({ type: "LOG_BEHAVIOR", durationMinutes: parsedCustom })}>
                  <Text style={styles.buttonText}>שמירה ומעבר לקבלה עצמית</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void send({ type: "LOG_BEHAVIOR", durationMinutes: null })}>
                  <Text style={styles.secondaryButtonText}>בלי לציין משך – לקבלה עצמית</Text>
                </Pressable>
                {!session!.mayCauseBodilyHarm && (
                  <View>
                    <Text style={styles.muted}>{BEHAVIOR_LOG_STOPWATCH_HINT}</Text>
                    <Pressable style={styles.linkButton} onPress={() => void send({ type: "START_STOPWATCH" })}>
                      <Text style={styles.linkButtonText}>הפעלת סטופר</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      }

      case "closing": {
        const episode = session!.episode;
        const outcome = episode.outcome ?? "ended_by_user";
        const durationLine = describeDurationTargetChange(episode.durationTargetBefore, episode.durationTargetAfter);
        return (
          <View>
            <Text style={styles.title}>סיום התרגול</Text>
            <Text style={styles.primaryLine}>{CLOSING_MESSAGES[outcome]}</Text>
            <View style={styles.card}>
              <Text style={styles.cardRow}>{describeWaitTargetChange(episode.waitTargetBefore, episode.waitTargetAfter)}</Text>
              {durationLine && <Text style={styles.cardRow}>{durationLine}</Text>}
              <Text style={styles.muted}>{PROGRESS_NOT_RESET_NOTE}</Text>
            </View>
            {outcome === "resisted" && <ArcAddictionSuccessMemoryControls session={session!} onSaved={(memoryId) => void send({ type: "MEMORY_SAVED", memoryId })} />}
            <Pressable style={styles.button} onPress={() => void send({ type: "CLOSE" })}>
              <Text style={styles.buttonText}>{session!.returnToTaskId ? "סיום וחזרה למשימה" : "סיום"}</Text>
            </Pressable>
            <Pressable
              style={styles.linkButton}
              onPress={async () => {
                const profileId = session!.episode.profileId;
                const closed = await dispatchAddictionEvent({ type: "CLOSE" });
                if (closed === null) router.replace({ pathname: "/arc-addiction/progress/[id]", params: { id: profileId } });
              }}
            >
              <Text style={styles.linkButtonText}>למסך ההתקדמות</Text>
            </Pressable>
          </View>
        );
      }

      default:
        return null;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {renderStage()}
        {canReportActed && (
          <Pressable style={styles.linkButton} onPress={() => void send({ type: "ACTED" })}>
            <Text style={styles.linkButtonText}>פעלתי לפי הדחף – תיעוד ומעבר לקבלה עצמית</Text>
          </Pressable>
        )}
        {stage !== "closing" && (
          <Pressable style={styles.linkButton} onPress={() => void send({ type: "END_SESSION" })}>
            <Text style={[styles.linkButtonText, styles.dangerText]}>סיום התרגול</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


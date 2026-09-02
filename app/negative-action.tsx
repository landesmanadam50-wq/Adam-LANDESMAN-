/**
 * app/negative-action.tsx
 *
 * Negative Action reduction task: the standalone, OPTIONAL Negative
 * Action Timer entry point -- mirrors app/focus-success.tsx's pattern
 * exactly (a real, existing standalone tool reached directly from Home,
 * never through the main ARC session). The main routine stays ARC ->
 * Success Focus -> completion, completely unaffected: this screen is
 * never opened automatically after ARC or after Success Focus, and
 * completing (or never opening) it has no bearing on finishing a LIVE
 * session -- see live/LiveSessionScreen.tsx, which no longer knows
 * anything about "negative_action" at all.
 *
 * Reuses the existing architecture throughout: live/screens.tsx's
 * NegativeActionStartScreen/NegativeActionScreen (unchanged -- the same
 * components the main flow used to render), timerType "negativeAction"
 * (data/storage.ts's existing TimerRun/TimerType, untouched), and
 * arc/stageCopy.ts's existing "negative_action" copy case (still the
 * one place that copy text is built, from the same profile.habit field
 * it always read). The timer only ever starts when the trainee
 * intentionally taps "התחל" here -- there is no other way into it.
 *
 * ARC Builds task: resolves against the saved ArcBuilds (data/storage.ts's
 * loadArcBuilds) instead of the old single global profile -- whichever
 * ONE build has Negative Action enabled (isNegativeActionAvailable) when
 * exactly one does (the common case, unambiguous); if more than one
 * does, a lightweight inline picker asks which build's Negative Action
 * to run, mirroring live/LiveSessionScreen.tsx's own ArcBuild picker.
 * program/'s week-based scaling (resolveNegativeActionDuration/
 * getProgramDefinition) is intentionally NOT used here any more -- an
 * ArcBuild has no program week to scale against (its profile.programPath
 * is a fixed, unvalidated placeholder; calling getProgramDefinition on
 * it would throw) -- so the permitted duration is simply this build's
 * own configured base allowance, clamped to the same valid 1-15 minute
 * range resolveNegativeActionDuration always enforced, unscaled.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, router, Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ArcBuild, ArcBuildProfile } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { isNegativeActionAvailable, NEGATIVE_ACTION_MAX_DURATION_MINUTES, NEGATIVE_ACTION_MIN_DURATION_MINUTES } from "../program/engine.ts";
import { clearTimerRun, loadArcBuilds, loadTimerRun } from "../data/storage.ts";
import type { TimerRun } from "../data/storage.ts";
import { NegativeActionScreen, NegativeActionStartScreen } from "../live/screens.tsx";

const NOT_AVAILABLE_MESSAGE =
  "כלי הפעולה השלילית אינו זמין כרגע. ניתן להפעיל אותו ולהגדיר פעולה שלילית וזמן מותר בעריכת ה-ARC Build הרצוי (BUILD).";

/** Same clamp resolveNegativeActionDuration always applied -- kept here, unscaled, now that there's no program week to scale against. Never invents a value: null stays null. */
function resolveUnscaledDuration(baseDurationMinutes: number | null): number | null {
  if (baseDurationMinutes === null) return null;
  return Math.min(Math.max(baseDurationMinutes, NEGATIVE_ACTION_MIN_DURATION_MINUTES), NEGATIVE_ACTION_MAX_DURATION_MINUTES);
}

export default function NegativeActionTimerScreen() {
  const [status, setStatus] = useState<"loading" | "notAvailable" | "picking" | "ready">("loading");
  const [eligibleBuilds, setEligibleBuilds] = useState<ArcBuild[]>([]);
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [resumedRun, setResumedRun] = useState<TimerRun | null>(null);
  const [started, setStarted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setStarted(false);
      Promise.all([loadArcBuilds(), loadTimerRun("negativeAction")]).then(([builds, run]) => {
        if (cancelled) return;
        const eligible = builds.filter((build) => isNegativeActionAvailable(build.profile));
        setEligibleBuilds(eligible);
        setResumedRun(run);
        if (run) setStarted(true);
        if (eligible.length === 0) {
          setProfile(null);
          setStatus("notAvailable");
        } else if (eligible.length === 1) {
          setProfile(eligible[0].profile);
          setStatus("ready");
        } else {
          setProfile(null);
          setStatus("picking");
        }
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
      </SafeAreaView>
    );
  }

  if (status === "notAvailable") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.notAvailableText}>{NOT_AVAILABLE_MESSAGE}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (status === "picking") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.pickerTitle}>איזה ARC Build תרצה להריץ עבורו את הפעולה השלילית?</Text>
          {eligibleBuilds.map((build) => (
            <Pressable
              key={build.id}
              style={styles.pickerButton}
              onPress={() => {
                setProfile(build.profile);
                setStatus("ready");
              }}
            >
              <Text style={styles.pickerButtonText}>{build.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "ready" -- profile is guaranteed non-null here.
  const readyProfile = profile as ArcBuildProfile;
  const durationMinutes = resolveUnscaledDuration(readyProfile.negativeActionBaseDurationMinutes);
  const session = { ...createEmptyLiveState(), negativeActionStarted: started };
  const copy = getStageCopy("negative_action", readyProfile, session, [], []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
      <ScrollView contentContainerStyle={styles.content}>
        {started ? (
          <NegativeActionScreen
            copy={copy}
            durationMinutes={durationMinutes}
            resumedRun={resumedRun}
            onCompleted={() => {
              clearTimerRun("negativeAction");
              setResumedRun(null);
              router.replace("/");
            }}
          />
        ) : (
          <NegativeActionStartScreen copy={copy} durationMinutes={durationMinutes} onStart={() => setStarted(true)} />
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
    justifyContent: "flex-start",
  },
  notAvailableText: {
    fontSize: 16,
    textAlign: "right",
    lineHeight: 24,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 16,
  },
  pickerButton: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  pickerButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});

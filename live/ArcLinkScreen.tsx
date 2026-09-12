import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, getArcGoal, getArcLink, loadRoutineTriggers, upsertArcGoal, upsertArcLink } from "../data/storage.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/fourWeekProgram.ts";
import {
  buildArcLinkFastSteps,
  buildArcLinkIntroSteps,
  buildArcLinkProtocolSteps,
  buildArcLinkShortSteps,
  resolveArcLinkRouteOptions,
} from "../arc/arcLink.ts";
import type { ArcLinkRehearsalContext, ArcLinkRouteChoice, ArcLinkRouteOption, ArcLinkStep } from "../arc/arcLink.ts";
import { buildBridgingLinkSteps } from "../arc/bridgingArcLink.ts";
import type { BridgingLinkStep } from "../arc/bridgingArcLink.ts";
import { hasConfiguredTrigger, safeTriggerText } from "../arc/bodyImagery.ts";
import { LINK_TIMER_DEFAULT_DURATIONS } from "../arc/linkTimer.ts";
import {
  describeTrigger,
  resolveArcLinkKind,
  resolveArcLinkPracticeModeDefault,
  resolveArcLinkTriggerCategory,
  resolveLinkTimerStyle,
  resolveRoutineTrigger,
} from "../arc/routineLinks.ts";
import type { ArcLink, ArcLinkPracticeMode, LinkTimerStyle } from "../arc/routineLinks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import type { ArcBuild, FourWeekProgramWeekNumber } from "../arc/types.ts";
import BodyImageryStep from "./BodyImageryStep.tsx";
import { LinkTimerDisplay } from "./LinkTimerDisplay.tsx";
import { PresenceObjectGroundingScreen } from "./screens.tsx";

type RouteChooserPhase = "kind" | "target" | null;

/**
 * live/ArcLinkScreen.tsx (route: /arc-link/[id], optionally ?linkId=...)
 *
 * ARC Link task, extended by the Weekly Routine + ARC Link management
 * task: the imagery-rehearsal driver. Without a `linkId` param (the
 * ORIGINAL entry point, build/LiveModeSelectScreen.tsx) vs. WITH a
 * `linkId` param (the Routine-page Practice area, offering the
 * interfering/supportive route choice and recording a practice
 * completion on the ArcLink itself -- never the linked ArcBuild's own
 * beneficial-action completion, which stays untouched here).
 *
 * Link practice-mode task (spec section 8): BOTH paths now open with a
 * "איזה סוג תרגול תרצה לבצע?" chooser (short/full/fast) BEFORE any
 * rehearsal content -- Regular ARC Link / ARCHI ARC Link no longer
 * force full-protocol visualization every time. "full" reproduces this
 * screen's own original, unmodified behavior exactly (legacy path:
 * buildArcLinkIntroSteps + buildArcLinkProtocolSteps(choice: null),
 * confirmed elsewhere to reproduce the retired buildArcLinkSteps
 * exactly; linkId path: the existing intro -> route choice -> protocol
 * flow, completely unchanged). "short"/"fast" skip the route choice
 * entirely (buildArcLinkShortSteps/buildArcLinkFastSteps resolve their
 * own target automatically) and, for "fast", pair the rehearsal with an
 * optional Link timer (arc/linkTimer.ts, live/LinkTimerDisplay.tsx) --
 * its own, fully separate concept from the real Action/Presence/
 * Success-Focus/Negative-Action timers, never auto-closing the session
 * when it reaches zero.
 *
 * Four-Week Program task correction (spec section 10 + "ARCHI ARC Link
 * is its own distinct guided linking practice, never interchangeable
 * with Full ARC"): the optional fourWeekGoalId/fourWeekWeek params --
 * set only by live/ArcGoalFourWeekDashboardScreen.tsx's own "תרגול
 * ARCHI ARC Link" (Week 1) -- always arrive on the LEGACY (no linkId)
 * path. On finishing, this records a kind:"arc_link" practice (never
 * "full_arc" -- tracked completely separately) and returns to the
 * dashboard instead of router.back(). Absent, both legacy completion
 * points below are completely unchanged.
 */
export default function ArcLinkScreen() {
  const {
    id,
    linkId,
    fourWeekGoalId,
    fourWeekWeek,
  } = useLocalSearchParams<{ id: string; linkId?: string; fourWeekGoalId?: string; fourWeekWeek?: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "noTrigger" | "ready">("loading");
  const [arcBuild, setArcBuild] = useState<ArcBuild | null>(null);
  const [arcLink, setArcLink] = useState<ArcLink | null>(null);

  // Link practice-mode task: shared by both paths (mutually exclusive at
  // render time) -- null means the "איזה סוג תרגול תרצה לבצע?" chooser
  // hasn't been answered yet for this session.
  const [practiceMode, setPracticeMode] = useState<ArcLinkPracticeMode | null>(null);
  // The rehearsal context (trigger text/mode/category/mantra override)
  // resolved once at load time, reused by whichever mode is chosen --
  // legacy: { triggerText, mode: "with_archi" } (this screen's own
  // original, always-with_archi legacy behavior); linkId: the ArcLink's
  // own mode/triggerCategory/futureMantraOverride, exactly as before.
  const [pendingCtx, setPendingCtx] = useState<ArcLinkRehearsalContext | null>(null);
  // Link timers task: "fast" mode's own optional timer configuration --
  // pre-filled from the ArcLink's own BUILD-configured fields when
  // present (linkId path only); otherwise chosen immediately before
  // rehearsal via fastConfigPending's own chip picker below.
  const [fastConfigPending, setFastConfigPending] = useState(false);
  const [fastTimerStyle, setFastTimerStyle] = useState<LinkTimerStyle>("guided");
  const [fastTimerDurationSeconds, setFastTimerDurationSeconds] = useState<number | null>(null);

  // Legacy (no linkId) path.
  const [legacySteps, setLegacySteps] = useState<ArcLinkStep[]>([]);
  const [legacyIndex, setLegacyIndex] = useState(0);

  // linkId path.
  const [introSteps, setIntroSteps] = useState<ArcLinkStep[]>([]);
  const [introIndex, setIntroIndex] = useState(0);
  const [phase, setPhase] = useState<"mode" | "intro" | "choose" | "protocol" | "bridging">("mode");
  const [chooserPhase, setChooserPhase] = useState<RouteChooserPhase>(null);
  const [pendingKind, setPendingKind] = useState<"interfering" | "supportive" | null>(null);
  const [targetOptions, setTargetOptions] = useState<ArcLinkRouteOption[]>([]);
  const [protocolSteps, setProtocolSteps] = useState<ArcLinkStep[]>([]);
  const [protocolIndex, setProtocolIndex] = useState(0);

  // Extended ARC Link trigger system: Bridging ARC Link's own step list --
  // an entirely separate content sequence (arc/bridgingArcLink.ts), never
  // the intro/choose/protocol machinery above, and never offered the
  // short/full/fast practice-mode chooser (out of this task's scope).
  // Only populated when resolveArcLinkKind(link) === "bridging".
  const [bridgingSteps, setBridgingSteps] = useState<BridgingLinkStep[]>([]);
  const [bridgingIndex, setBridgingIndex] = useState(0);

  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 10: an
   * optional, session-only environmental-grounding sub-phase (same two
   * questions + confirmation line as the main LIVE flow's own
   * PresenceObjectGroundingScreen -- live/screens.tsx), shown once
   * before whichever step imagines the final linked action
   * ("beneficial_action" when present -- short/fast mode never produce
   * that step id, so this never applies to them). Local component
   * state only -- never added to ArcLink/ArcLinkFormState, never
   * persisted.
   */
  const [groundingDone, setGroundingDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getArcBuild(id).then(async (existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setArcBuild(existing);
      setGroundingDone(false);
      setPracticeMode(null);
      setFastConfigPending(false);

      if (!linkId) {
        // Original entry point -- same trigger/mode resolution as
        // before, but step-building is now deferred to the practice-mode
        // chooser (see chooseLegacyMode below) instead of happening
        // immediately.
        if (!hasConfiguredTrigger(existing.profile.linkSettings)) {
          setStatus("noTrigger");
          return;
        }
        setPendingCtx({ triggerText: safeTriggerText(existing.profile.linkSettings), mode: "with_archi" });
        setStatus("ready");
        return;
      }

      const [link, triggers] = await Promise.all([getArcLink(linkId), loadRoutineTriggers()]);
      if (cancelled) return;
      if (!link || link.protocolId !== existing.id) {
        setStatus("notFound");
        return;
      }
      setArcLink(link);
      const trigger = resolveRoutineTrigger(link.triggerId, triggers);
      const triggerText = describeTrigger(trigger) === "לא הוגדר טריגר" ? "" : describeTrigger(trigger);
      const triggerCategory = resolveArcLinkTriggerCategory(link);

      if (resolveArcLinkKind(link) === "bridging" && link.bridging) {
        const supportiveBuild = await getArcBuild(link.bridging.supportiveProtocolId);
        if (cancelled) return;
        if (!supportiveBuild) {
          setStatus("notFound");
          return;
        }
        const steps = buildBridgingLinkSteps(supportiveBuild.profile, existing.profile, {
          triggerText,
          triggerCategory,
          variant: link.bridging.variant,
          futureMantraOverride: link.bridging.futureMantraOverride,
        });
        setBridgingSteps(steps);
        setBridgingIndex(0);
        setPhase("bridging");
        setStatus("ready");
        return;
      }

      setPendingCtx({ triggerText, mode: link.mode, triggerCategory, futureMantraOverride: link.futureMantraOverride });
      setPhase("mode");
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [id, linkId]);

  // ---- Link practice-mode task: mode selection, shared logic. ----

  function chooseLegacyMode(mode: ArcLinkPracticeMode) {
    if (!arcBuild || !pendingCtx) return;
    if (mode === "fast") {
      setFastConfigPending(true);
      return;
    }
    const steps =
      mode === "short"
        ? buildArcLinkShortSteps(arcBuild.profile, pendingCtx)
        : [...buildArcLinkIntroSteps(arcBuild.profile, pendingCtx), ...buildArcLinkProtocolSteps(arcBuild.profile, null, pendingCtx)];
    setLegacySteps(steps);
    setLegacyIndex(0);
    setPracticeMode(mode);
  }

  function chooseLinkMode(mode: ArcLinkPracticeMode) {
    if (!arcBuild || !pendingCtx) return;
    if (mode === "fast") {
      if (arcLink?.timerEnabled && arcLink.timerDurationSeconds) {
        startFastRehearsal(resolveLinkTimerStyle(arcLink), arcLink.timerDurationSeconds);
        return;
      }
      setFastConfigPending(true);
      return;
    }
    if (mode === "short") {
      setProtocolSteps(buildArcLinkShortSteps(arcBuild.profile, pendingCtx));
      setProtocolIndex(0);
      setPhase("protocol");
      setPracticeMode("short");
      return;
    }
    // "full" -- exactly this screen's own original intro -> route choice
    // -> protocol flow, completely unchanged.
    setIntroSteps(buildArcLinkIntroSteps(arcBuild.profile, pendingCtx));
    setIntroIndex(0);
    setPhase("intro");
    setPracticeMode("full");
  }

  function startFastRehearsal(style: LinkTimerStyle, durationSeconds: number | null) {
    if (!arcBuild || !pendingCtx) return;
    setFastTimerStyle(style);
    setFastTimerDurationSeconds(durationSeconds);
    setFastConfigPending(false);
    setPracticeMode("fast");
    const steps = buildArcLinkFastSteps(arcBuild.profile, pendingCtx);
    if (!linkId) {
      setLegacySteps(steps);
      setLegacyIndex(0);
    } else {
      setProtocolSteps(steps);
      setProtocolIndex(0);
      setPhase("protocol");
    }
  }

  function beginRouteChoice() {
    if (!arcBuild) return;
    const options = resolveArcLinkRouteOptions(arcBuild.profile);
    const hasInterfering = options.interfering.length > 0;
    const hasSupportive = options.supportive.length > 0;

    if (hasInterfering && hasSupportive) {
      setPhase("choose");
      setChooserPhase("kind");
      return;
    }
    if (hasInterfering) {
      if (options.interfering.length > 1) {
        setPendingKind("interfering");
        setTargetOptions(options.interfering);
        setPhase("choose");
        setChooserPhase("target");
        return;
      }
      finishChoice({ kind: "interfering", target: options.interfering[0].target });
      return;
    }
    if (hasSupportive) {
      if (options.supportive.length > 1) {
        setPendingKind("supportive");
        setTargetOptions(options.supportive);
        setPhase("choose");
        setChooserPhase("target");
        return;
      }
      finishChoice({ kind: "supportive", target: options.supportive[0].target });
      return;
    }
    finishChoice(null);
  }

  function chooseKind(kind: "interfering" | "supportive") {
    if (!arcBuild) return;
    const options = resolveArcLinkRouteOptions(arcBuild.profile);
    const list = kind === "interfering" ? options.interfering : options.supportive;
    if (list.length > 1) {
      setPendingKind(kind);
      setTargetOptions(list);
      setChooserPhase("target");
      return;
    }
    finishChoice({ kind, target: list[0].target });
  }

  function finishChoice(choice: ArcLinkRouteChoice) {
    if (!arcBuild || !arcLink) return;
    loadRoutineTriggers().then((triggers) => {
      const trigger = resolveRoutineTrigger(arcLink.triggerId, triggers);
      const triggerText = describeTrigger(trigger) === "לא הוגדר טריגר" ? "" : describeTrigger(trigger);
      const ctx = { triggerText, mode: arcLink.mode, triggerCategory: resolveArcLinkTriggerCategory(arcLink), futureMantraOverride: arcLink.futureMantraOverride };
      // Link practice-mode task: this function is now reached ONLY via
      // practiceMode "full" (chooseLinkMode routes "short"/"fast"
      // straight into buildArcLinkShortSteps/buildArcLinkFastSteps,
      // bypassing route choice entirely) -- so "full" always means the
      // COMPLETE stage-by-stage rehearsal now, regardless of ArcLinkMode.
      // ArcLinkMode (with_archi/without_archi) still steers the ENDING
      // WORDING only (open ARCHI vs "from memory" -- see
      // buildArcLinkProtocolSteps' own mode-aware reinforce step), never
      // whether the full content is shown -- that's what makes ARCHI ARC
      // Link's own full rehearsal genuinely OPTIONAL: with_archi's short
      // single-confirmation ending now belongs to "short"/"fast" practice
      // mode instead (see buildArcLinkShortSteps' own with_archi branch).
      const steps = buildArcLinkProtocolSteps(arcBuild.profile, choice, ctx);
      setProtocolSteps(steps);
      setProtocolIndex(0);
      setPhase("protocol");
    });
  }

  async function completePractice() {
    if (arcLink) {
      const today = todayLocalDateString();
      const updated: ArcLink = {
        ...arcLink,
        completedPracticeDates: arcLink.completedPracticeDates.includes(today)
          ? arcLink.completedPracticeDates
          : [...arcLink.completedPracticeDates, today],
        updatedAt: new Date().toISOString(),
      };
      await upsertArcLink(updated);
    }
    router.back();
  }

  /**
   * Four-Week Program task correction: the legacy (no linkId) path's own
   * completion -- when launched with fourWeekGoalId (Week 1's "תרגול
   * ARCHI ARC Link"), logs a kind:"arc_link" practice onto that week and
   * returns to the dashboard; otherwise router.back(), completely
   * unchanged from before this correction.
   */
  async function finishLegacy() {
    if (typeof fourWeekGoalId === "string" && id) {
      const goal = await getArcGoal(fourWeekGoalId);
      if (goal?.fourWeekProgram) {
        const now = new Date().toISOString();
        const week = (Number(fourWeekWeek) || goal.fourWeekProgram.currentWeek) as FourWeekProgramWeekNumber;
        const updatedProgram = clearReturnContext(addPracticeRecord(goal.fourWeekProgram, week, "arc_link", "ARCHI ARC Link", now));
        await upsertArcGoal({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
      }
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId: fourWeekGoalId } });
      return;
    }
    router.back();
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
          <Text style={styles.title}>ה-ARC Build לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/build")}>
            <Text style={styles.buttonText}>חזרה לרשימת הפרוטוקולים</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "noTrigger") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>ARC Link</Text>
          <Text style={styles.body}>כדי לתרגל ARC Link, יש להגדיר תחילה טריגר ב-BUILD.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Link timers task: the fast-mode duration/style chip picker,
  // shared by both paths -- shown only once "תרגול מהיר" is chosen and
  // no BUILD-configured timer was already found. ----
  if (fastConfigPending) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>משך התרגול המהיר</Text>
          <Text style={styles.body}>אפשר לבחור טיימר קצר, או לתרגל בלי טיימר בקצב שלך.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => startFastRehearsal("guided", null)}>
            <Text style={styles.buttonText}>בלי טיימר</Text>
          </Pressable>
          {LINK_TIMER_DEFAULT_DURATIONS.fast_regular.map((seconds) => (
            <Pressable key={seconds} style={[styles.button, styles.fullWidthButton]} onPress={() => startFastRehearsal("speed", seconds)}>
              <Text style={styles.buttonText}>{`${seconds} שניות`}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ---- Legacy (no linkId) path. ----
  if (!linkId) {
    // Link practice-mode task: the "איזה סוג תרגול תרצה לבצע?" chooser,
    // shown before any rehearsal content -- see this screen's own doc.
    if (practiceMode === null) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>איזה סוג תרגול תרצה לבצע?</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseLegacyMode("short")}>
              <Text style={styles.buttonText}>קישור קצר</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseLegacyMode("full")}>
              <Text style={styles.buttonText}>תרגול מלא</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseLegacyMode("fast")}>
              <Text style={styles.buttonText}>תרגול מהיר</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    const step = legacySteps[legacyIndex];
    if (!step) return null;
    if (step.id === "beneficial_action" && !groundingDone) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <PresenceObjectGroundingScreen onComplete={() => setGroundingDone(true)} />
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          {(step.id === "regulation" || step.id === "encoding") && step.bodyImagery ? (
            <BodyImageryStep
              title={step.title}
              anchorLabel={step.bodyImagery.anchorLabel}
              bodyImagery={step.bodyImagery.imagery}
              extraLines={step.lines}
              buttonLabel={step.buttonLabel}
              onContinue={() => (legacyIndex === legacySteps.length - 1 ? finishLegacy() : setLegacyIndex(legacyIndex + 1))}
            />
          ) : (
            <View>
              <Text style={styles.title}>{step.title}</Text>
              {step.lines.map((line, lineIndex) => (
                <Text key={lineIndex} style={styles.body}>
                  {line}
                </Text>
              ))}
              {step.id === "fast_response" && <LinkTimerDisplay style={fastTimerStyle} targetDurationSeconds={fastTimerDurationSeconds} />}
              <Pressable
                style={[styles.button, styles.fullWidthButton]}
                onPress={() => (legacyIndex === legacySteps.length - 1 ? finishLegacy() : setLegacyIndex(legacyIndex + 1))}
              >
                <Text style={styles.buttonText}>{step.buttonLabel}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- New (linkId) path. ----

  if (phase === "mode") {
    const recommended = arcLink ? resolveArcLinkPracticeModeDefault(arcLink) : "full";
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>איזה סוג תרגול תרצה לבצע?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseLinkMode("short")}>
            <Text style={styles.buttonText}>{recommended === "short" ? "קישור קצר (מומלץ)" : "קישור קצר"}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseLinkMode("full")}>
            <Text style={styles.buttonText}>{recommended === "full" ? "תרגול מלא (מומלץ)" : "תרגול מלא"}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseLinkMode("fast")}>
            <Text style={styles.buttonText}>{recommended === "fast" ? "תרגול מהיר (מומלץ)" : "תרגול מהיר"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "intro") {
    const step = introSteps[introIndex];
    if (!step) return null;
    const isLast = introIndex === introSteps.length - 1;
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{step.title}</Text>
          {step.lines.map((line, lineIndex) => (
            <Text key={lineIndex} style={styles.body}>
              {line}
            </Text>
          ))}
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => (isLast ? beginRouteChoice() : setIntroIndex(introIndex + 1))}
          >
            <Text style={styles.buttonText}>{step.buttonLabel}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === "choose") {
    if (chooserPhase === "kind") {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>מה תרצה לתרגל?</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseKind("interfering")}>
              <Text style={styles.buttonText}>להתמודד עם משהו שמפריע</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseKind("supportive")}>
              <Text style={styles.buttonText}>ליצור מצב פנימי תומך</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    // chooserPhase === "target"
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>{pendingKind === "interfering" ? "עם מה תרצה להתמודד?" : "איזה מצב תרצה ליצור?"}</Text>
          {targetOptions.map((option) => (
            <Pressable
              key={option.target}
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => finishChoice({ kind: pendingKind ?? "interfering", target: option.target })}
            >
              <Text style={styles.buttonText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "bridging") {
    const step = bridgingSteps[bridgingIndex];
    if (!step) return null;
    const isLastBridgingStep = bridgingIndex === bridgingSteps.length - 1;
    if (step.id === "beneficial_action" && !groundingDone) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <PresenceObjectGroundingScreen onComplete={() => setGroundingDone(true)} />
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          {(step.id === "cue" || step.id === "identity") && step.bodyImagery ? (
            <BodyImageryStep
              title={step.title}
              anchorLabel={step.bodyImagery.anchorLabel}
              bodyImagery={step.bodyImagery.imagery}
              extraLines={step.lines}
              buttonLabel={step.buttonLabel}
              onContinue={() => (isLastBridgingStep ? completePractice() : setBridgingIndex(bridgingIndex + 1))}
            />
          ) : (
            <View>
              <Text style={styles.title}>{step.title}</Text>
              {step.lines.map((line, lineIndex) => (
                <Text key={lineIndex} style={styles.body}>
                  {line}
                </Text>
              ))}
              <Pressable
                style={[styles.button, styles.fullWidthButton]}
                onPress={() => (isLastBridgingStep ? completePractice() : setBridgingIndex(bridgingIndex + 1))}
              >
                <Text style={styles.buttonText}>{step.buttonLabel}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // phase === "protocol"
  const step = protocolSteps[protocolIndex];
  if (!step) return null;
  const isLastProtocolStep = protocolIndex === protocolSteps.length - 1;
  if (step.id === "beneficial_action" && !groundingDone) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <PresenceObjectGroundingScreen onComplete={() => setGroundingDone(true)} />
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {(step.id === "regulation" || step.id === "encoding") && step.bodyImagery ? (
          <BodyImageryStep
            title={step.title}
            anchorLabel={step.bodyImagery.anchorLabel}
            bodyImagery={step.bodyImagery.imagery}
            extraLines={step.lines}
            buttonLabel={step.buttonLabel}
            onContinue={() => (isLastProtocolStep ? completePractice() : setProtocolIndex(protocolIndex + 1))}
          />
        ) : (
          <View>
            <Text style={styles.title}>{step.title}</Text>
            {step.lines.map((line, lineIndex) => (
              <Text key={lineIndex} style={styles.body}>
                {line}
              </Text>
            ))}
            {step.id === "fast_response" && <LinkTimerDisplay style={fastTimerStyle} targetDurationSeconds={fastTimerDurationSeconds} />}
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => (isLastProtocolStep ? completePractice() : setProtocolIndex(protocolIndex + 1))}
            >
              <Text style={styles.buttonText}>{step.buttonLabel}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
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

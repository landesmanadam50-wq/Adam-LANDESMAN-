import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, getArcGoal, getArcLink, loadRoutineTriggers, upsertArcGoal, upsertArcLink } from "../data/storage.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/fourWeekProgram.ts";
import {
  buildArcLinkIntroSteps,
  buildArcLinkProtocolSteps,
  buildArcLinkStartConfirmationStep,
  buildArcLinkSteps,
  resolveArcLinkRouteOptions,
} from "../arc/arcLink.ts";
import type { ArcLinkRouteChoice, ArcLinkRouteOption, ArcLinkStep } from "../arc/arcLink.ts";
import { buildBridgingLinkSteps } from "../arc/bridgingArcLink.ts";
import type { BridgingLinkStep } from "../arc/bridgingArcLink.ts";
import { hasConfiguredTrigger } from "../arc/bodyImagery.ts";
import { describeTrigger, resolveArcLinkKind, resolveArcLinkTriggerCategory, resolveRoutineTrigger } from "../arc/routineLinks.ts";
import type { ArcLink } from "../arc/routineLinks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import type { ArcBuild, FourWeekProgramWeekNumber } from "../arc/types.ts";
import BodyImageryStep from "./BodyImageryStep.tsx";
import { PresenceObjectGroundingScreen } from "./screens.tsx";

type RouteChooserPhase = "kind" | "target" | null;

/**
 * live/ArcLinkScreen.tsx (route: /arc-link/[id], optionally ?linkId=...)
 *
 * ARC Link task, extended by the Weekly Routine + ARC Link management
 * task: the imagery-rehearsal driver. Without a `linkId` param (the
 * ORIGINAL entry point, build/LiveModeSelectScreen.tsx), behavior is
 * 100% unchanged -- buildArcLinkSteps(profile), always "with_archi", no
 * route choice, no practice tracking. WITH a `linkId` param (the new
 * Routine-page Practice area), this reads the ArcLink entity's own
 * mode + RoutineTrigger, offers the interfering/supportive route
 * choice, and records a practice completion on the ArcLink itself once
 * finished -- never the linked ArcBuild's own beneficial-action
 * completion, which stays untouched here.
 *
 * Four-Week Program task correction (spec section 10 + "ARCHI ARC Link
 * is its own distinct guided linking practice, never interchangeable
 * with Full ARC"): the optional fourWeekGoalId/fourWeekWeek params --
 * set only by live/ArcGoalFourWeekDashboardScreen.tsx's own "תרגול
 * ARCHI ARC Link" (Week 1) -- always arrive on the LEGACY (no linkId)
 * path, since that's the one always-"with_archi", no-route-choice mode
 * this screen already has, matching Week 1's own "ARCHI ARC Link"
 * exactly. On finishing, this records a kind:"arc_link" practice
 * (never "full_arc" -- tracked completely separately) and returns to
 * the dashboard instead of router.back(). Absent, both legacy
 * completion points below are completely unchanged.
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

  // Legacy (no linkId) path.
  const [legacySteps, setLegacySteps] = useState<ArcLinkStep[]>([]);
  const [legacyIndex, setLegacyIndex] = useState(0);

  // linkId path.
  const [introSteps, setIntroSteps] = useState<ArcLinkStep[]>([]);
  const [introIndex, setIntroIndex] = useState(0);
  const [phase, setPhase] = useState<"intro" | "choose" | "protocol" | "bridging">("intro");
  const [chooserPhase, setChooserPhase] = useState<RouteChooserPhase>(null);
  const [pendingKind, setPendingKind] = useState<"interfering" | "supportive" | null>(null);
  const [targetOptions, setTargetOptions] = useState<ArcLinkRouteOption[]>([]);
  const [protocolSteps, setProtocolSteps] = useState<ArcLinkStep[]>([]);
  const [protocolIndex, setProtocolIndex] = useState(0);

  // Extended ARC Link trigger system: Bridging ARC Link's own step list --
  // an entirely separate content sequence (arc/bridgingArcLink.ts), never
  // the intro/choose/protocol machinery above. Only populated when
  // resolveArcLinkKind(link) === "bridging".
  const [bridgingSteps, setBridgingSteps] = useState<BridgingLinkStep[]>([]);
  const [bridgingIndex, setBridgingIndex] = useState(0);

  /**
   * Unified Presence/Mantra/Trigger/Imagery spec, section 10: an
   * optional, session-only environmental-grounding sub-phase (same two
   * questions + confirmation line as the main LIVE flow's own
   * PresenceObjectGroundingScreen -- live/screens.tsx), shown once
   * before whichever step imagines the final linked action
   * ("beneficial_action" in every one of this screen's three rendering
   * paths). Local component state only -- never added to ArcLink/
   * ArcLinkFormState, never persisted.
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

      if (!linkId) {
        // Original entry point -- completely unchanged.
        if (!hasConfiguredTrigger(existing.profile.linkSettings)) {
          setStatus("noTrigger");
          return;
        }
        setLegacySteps(buildArcLinkSteps(existing.profile));
        setLegacyIndex(0);
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

      const ctx = { triggerText, mode: link.mode, triggerCategory, futureMantraOverride: link.futureMantraOverride };
      setIntroSteps(buildArcLinkIntroSteps(existing.profile, ctx));
      setIntroIndex(0);
      setPhase("intro");
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [id, linkId]);

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
      // Coherent-architecture task (#22 "With ARCHI"): once the route is
      // chosen (imagining selecting it in the app), with_archi mode ends
      // right after imagining pressing Start -- never the full
      // stage-by-stage rehearsal, which only without_archi mode shows.
      const steps = arcLink.mode === "with_archi" ? [buildArcLinkStartConfirmationStep(ctx)] : buildArcLinkProtocolSteps(arcBuild.profile, choice, ctx);
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

  // ---- Legacy (no linkId) path -- unchanged except for the new,
  // optional environmental-grounding sub-phase (section 3/10) shown
  // once before the final linked-action step. ----
  if (!linkId) {
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

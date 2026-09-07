import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, getArcLink, loadRoutineTriggers, upsertArcLink } from "../data/storage.ts";
import {
  buildArcLinkIntroSteps,
  buildArcLinkProtocolSteps,
  buildArcLinkStartConfirmationStep,
  buildArcLinkSteps,
  resolveArcLinkRouteOptions,
} from "../arc/arcLink.ts";
import type { ArcLinkRouteChoice, ArcLinkRouteOption, ArcLinkStep } from "../arc/arcLink.ts";
import { hasConfiguredTrigger } from "../arc/bodyImagery.ts";
import { describeTrigger, resolveRoutineTrigger } from "../arc/routineLinks.ts";
import type { ArcLink } from "../arc/routineLinks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import type { ArcBuild } from "../arc/types.ts";
import BodyImageryStep from "./BodyImageryStep.tsx";

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
 */
export default function ArcLinkScreen() {
  const { id, linkId } = useLocalSearchParams<{ id: string; linkId?: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "noTrigger" | "ready">("loading");
  const [arcBuild, setArcBuild] = useState<ArcBuild | null>(null);
  const [arcLink, setArcLink] = useState<ArcLink | null>(null);

  // Legacy (no linkId) path.
  const [legacySteps, setLegacySteps] = useState<ArcLinkStep[]>([]);
  const [legacyIndex, setLegacyIndex] = useState(0);

  // linkId path.
  const [introSteps, setIntroSteps] = useState<ArcLinkStep[]>([]);
  const [introIndex, setIntroIndex] = useState(0);
  const [phase, setPhase] = useState<"intro" | "choose" | "protocol">("intro");
  const [chooserPhase, setChooserPhase] = useState<RouteChooserPhase>(null);
  const [pendingKind, setPendingKind] = useState<"interfering" | "supportive" | null>(null);
  const [targetOptions, setTargetOptions] = useState<ArcLinkRouteOption[]>([]);
  const [protocolSteps, setProtocolSteps] = useState<ArcLinkStep[]>([]);
  const [protocolIndex, setProtocolIndex] = useState(0);

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
      const ctx = { triggerText: describeTrigger(trigger) === "לא הוגדר טריגר" ? "" : describeTrigger(trigger), mode: link.mode };
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
      const ctx = { triggerText, mode: arcLink.mode };
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

  // ---- Legacy (no linkId) path -- unchanged. ----
  if (!linkId) {
    const step = legacySteps[legacyIndex];
    if (!step) return null;
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
              onContinue={() => (legacyIndex === legacySteps.length - 1 ? router.back() : setLegacyIndex(legacyIndex + 1))}
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
                onPress={() => (legacyIndex === legacySteps.length - 1 ? router.back() : setLegacyIndex(legacyIndex + 1))}
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

  // phase === "protocol"
  const step = protocolSteps[protocolIndex];
  if (!step) return null;
  const isLastProtocolStep = protocolIndex === protocolSteps.length - 1;
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

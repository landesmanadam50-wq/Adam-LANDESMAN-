import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcGoal, getArcLink, getMiniArcBuild, loadRoutineTriggers, upsertArcGoal, upsertArcLink } from "../data/storage.ts";
import { buildMiniArcLinkStartConfirmationStep, buildProtocolSpecificMiniArcLinkSteps } from "../arc/miniArcLink.ts";
import type { MiniArcLinkStep } from "../arc/miniArcLink.ts";
import { hasConfiguredTrigger } from "../arc/bodyImagery.ts";
import { describeTrigger, resolveLinkTimerStyle, resolveRoutineTrigger } from "../arc/routineLinks.ts";
import type { ArcLink } from "../arc/routineLinks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/fourWeekProgram.ts";
import type { ArcGoalWeekPracticeRecord, FourWeekProgramWeekNumber } from "../arc/types.ts";
import BodyImageryStep from "./BodyImageryStep.tsx";
import { LinkTimerDisplay } from "./LinkTimerDisplay.tsx";

/**
 * live/MiniArcLinkScreen.tsx (route: /mini-arc-link/[id], optionally ?linkId=...)
 *
 * Parallel to live/ArcLinkScreen.tsx. Without `linkId` (the original
 * entry point), behavior is 100% unchanged. With `linkId` (the new
 * Routine-page Practice area), reads the ArcLink entity's own mode +
 * RoutineTrigger and records a practice completion on the ArcLink
 * itself once finished. Mini ARC has no route choice (no state/identity
 * distinction) -- unlike ARC Link, there's no chooser phase here.
 *
 * Four-Week Program task correction: THIS SAME SCREEN backs TWO
 * distinct linking practices that must never be tracked as one --
 * Week 2's "Mini ARCHI Link" (links the trigger to starting the linked
 * Mini ARC in ARCHI) and Week 3's "Mini ARC Link" (the shorter, learned
 * link toward the real-world action, Mini ARC used only when needed).
 * The optional fourWeekGoalId/fourWeekWeek/fourWeekKind params -- set
 * only by live/ArcGoalFourWeekDashboardScreen.tsx's own "תרגול Mini
 * ARCHI Link" (Week 2, fourWeekKind="mini_archi_link") and "Mini ARC
 * Link" (Week 3, fourWeekKind="mini_arc_link") -- tell completePractice
 * exactly which one this run was, so it logs the CORRECT kind and
 * returns to the dashboard instead of router.back(). Absent
 * fourWeekKind defaults to this screen's own original "mini_arc_link"
 * semantic. Absent fourWeekGoalId entirely, completePractice is
 * completely unchanged.
 */
export default function MiniArcLinkScreen() {
  const { id, linkId, fourWeekGoalId, fourWeekWeek, fourWeekKind } = useLocalSearchParams<{
    id: string;
    linkId?: string;
    fourWeekGoalId?: string;
    fourWeekWeek?: string;
    fourWeekKind?: string;
  }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "noTrigger" | "ready">("loading");
  const [steps, setSteps] = useState<MiniArcLinkStep[]>([]);
  const [index, setIndex] = useState(0);
  const [arcLink, setArcLink] = useState<ArcLink | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMiniArcBuild(id).then(async (existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }

      if (!linkId) {
        // Original entry point -- completely unchanged.
        if (!hasConfiguredTrigger(existing.linkSettings)) {
          setStatus("noTrigger");
          return;
        }
        // ARC Mini for every protocol task: automatically uses the
        // matching protocol-specific rehearsal when this Mini ARC has a
        // protocolKind configured, and falls straight through to this
        // exact original call for every generic/legacy Mini ARC -- see
        // buildProtocolSpecificMiniArcLinkSteps' own doc.
        setSteps(buildProtocolSpecificMiniArcLinkSteps(existing));
        setIndex(0);
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
      const ctx = { triggerText, mode: link.mode };
      const fullSteps = buildProtocolSpecificMiniArcLinkSteps(existing, ctx);
      // Coherent-architecture task (#22/#24 "With ARCHI"): with_archi
      // mode ends right after imagining opening ARCHI and pressing
      // Start -- never the full Presence Color / naming / regulation /
      // encoding / beneficial-action sequence, which only without_archi
      // mode rehearses. Reuses the SAME intro/trigger/enter_archi
      // content buildMiniArcLinkSteps already produced above (never a
      // second, drifted copy of that text).
      const steps =
        link.mode === "with_archi"
          ? [...fullSteps.filter((s) => s.id === "intro" || s.id === "trigger" || s.id === "enter_archi"), buildMiniArcLinkStartConfirmationStep(ctx)]
          : fullSteps;
      setSteps(steps);
      setIndex(0);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id, linkId]);

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
    if (typeof fourWeekGoalId === "string") {
      const goal = await getArcGoal(fourWeekGoalId);
      if (goal?.fourWeekProgram) {
        const now = new Date().toISOString();
        const week = (Number(fourWeekWeek) || goal.fourWeekProgram.currentWeek) as FourWeekProgramWeekNumber;
        const kind: ArcGoalWeekPracticeRecord["kind"] =
          fourWeekKind === "mini_archi_link" ? "mini_archi_link" : "mini_arc_link";
        const label = kind === "mini_archi_link" ? "Mini ARCHI Link" : "Mini ARC Link";
        const updatedProgram = clearReturnContext(addPracticeRecord(goal.fourWeekProgram, week, kind, label, now));
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
          <Text style={styles.title}>ה-Mini ARC לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/mini-arc")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-Mini ARC</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "noTrigger") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>Mini ARC Link</Text>
          <Text style={styles.body}>כדי לתרגל Mini ARC Link, יש להגדיר תחילה טריגר ב-BUILD.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const step = steps[index];
  if (!step) return null;
  const isLast = index === steps.length - 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Link timers task: one continuous rehearsal timer for the
            WHOLE Mini ARC Link session, when its own ArcLink has one
            configured -- rendered at this stable tree position (never
            gated per step id) so the same LinkTimerDisplay instance
            stays mounted (and its own elapsed clock keeps running)
            across every step transition, rather than resetting each
            time. Never the same concept as the real Beneficial Action
            timer inside Mini ARC itself. */}
        {linkId && arcLink?.timerEnabled && (
          <LinkTimerDisplay style={resolveLinkTimerStyle(arcLink)} targetDurationSeconds={arcLink.timerDurationSeconds ?? null} />
        )}
        {(step.id === "regulation" || step.id === "encoding") && step.bodyImagery ? (
          <BodyImageryStep
            title={step.title}
            anchorLabel={step.bodyImagery.anchorLabel}
            bodyImagery={step.bodyImagery.imagery}
            extraLines={step.lines}
            buttonLabel={step.buttonLabel}
            onContinue={() => (isLast ? completePractice() : setIndex(index + 1))}
          />
        ) : (
          <View>
            <Text style={styles.title}>{step.title}</Text>
            {step.lines.map((line, lineIndex) => (
              <Text key={lineIndex} style={styles.body}>
                {line}
              </Text>
            ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => (isLast ? completePractice() : setIndex(index + 1))}>
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

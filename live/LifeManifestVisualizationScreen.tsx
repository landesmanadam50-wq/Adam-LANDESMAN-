import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { loadArcGoals, loadArcLinks, loadLifeManifestTargets, loadLifeManifests } from "../data/storage.ts";
import {
  createEmptyVisualizationSession,
  getNextVisualizationStage,
  getVisualizationStageCopy,
} from "../arc/lifeManifestVisualization.ts";
import type { LifeManifestVisualizationSession, LifeManifestVisualizationStage } from "../arc/lifeManifestVisualization.ts";
import { findMajorGoalOwner, resolveEffectiveTargetArcGoalId } from "../arc/lifeManifest.ts";
import type { MajorGoal, SubGoal, Target } from "../arc/lifeManifest.ts";
import type { ArcGoal } from "../arc/types.ts";
import type { ArcLink } from "../arc/routineLinks.ts";

/**
 * live/LifeManifestVisualizationScreen.tsx (route:
 * /life-manifest/visualize/[majorGoalId], optional ?subGoalId= for the
 * shortened Sub-goal run)
 *
 * The guided Major-Goal (or Sub-goal) visualization -- its own small
 * useState machine over arc/lifeManifestVisualization.ts's stage
 * sequence, mirroring live/MiniArcLiveScreen.tsx's exact shape. Never
 * ArcLiveState/ArcStage. Gratitude choice/scope is session-local only.
 * On "select_next_action," offers the active/given Sub-goal's own
 * Targets and their connected ArcLinks/ArcGoal -- opens the EXISTING
 * one (never creates a duplicate).
 */
export default function LifeManifestVisualizationScreen() {
  const { majorGoalId, subGoalId } = useLocalSearchParams<{ majorGoalId: string; subGoalId?: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [majorGoal, setMajorGoal] = useState<MajorGoal | null>(null);
  const [subGoal, setSubGoal] = useState<SubGoal | null>(null);
  const [manifestId, setManifestId] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [arcGoals, setArcGoals] = useState<ArcGoal[]>([]);
  const [arcLinks, setArcLinks] = useState<ArcLink[]>([]);

  const [stage, setStage] = useState<LifeManifestVisualizationStage>("observer_perspective");
  const [session, setSession] = useState<LifeManifestVisualizationSession>(createEmptyVisualizationSession());
  const [showGratitudeScopePicker, setShowGratitudeScopePicker] = useState(false);

  useEffect(() => {
    if (!majorGoalId) {
      // Bug-fix task: a missing/undefined route param used to leave
      // `status` stuck at "loading" forever -- route straight to the
      // recovery state instead of hanging on a blank screen.
      setStatus("notFound");
      return;
    }
    let cancelled = false;
    Promise.all([loadLifeManifests(), loadLifeManifestTargets(), loadArcGoals(), loadArcLinks()])
      .then(([manifests, allTargets, allArcGoals, allArcLinks]) => {
        if (cancelled) return;
        const owner = findMajorGoalOwner(manifests, majorGoalId);
        if (!owner) {
          setStatus("notFound");
          return;
        }
        setMajorGoal(owner.majorGoal);
        setManifestId(owner.manifest.id);
        const resolvedSubGoal = subGoalId ? owner.majorGoal.subGoals.find((s) => s.id === subGoalId) ?? null : null;
        setSubGoal(resolvedSubGoal);
        setTargets(allTargets.filter((t) => t.subGoalId === (resolvedSubGoal ? resolvedSubGoal.id : "")));
        setArcGoals(allArcGoals);
        setArcLinks(allArcLinks);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[LifeManifestVisualizationScreen] Failed to load -- showing the recovery state instead of hanging.", error);
        setStatus("notFound");
      });
    return () => {
      cancelled = true;
    };
  }, [majorGoalId, subGoalId]);

  function advance() {
    setStage((current) => getNextVisualizationStage(current, session));
  }

  function chooseGratitude(choice: "yes" | "no") {
    if (choice === "no") {
      const nextSession = { ...session, gratitudeChoice: "no" as const };
      setSession(nextSession);
      setStage(getNextVisualizationStage("gratitude_choice", nextSession));
      return;
    }
    setSession((current) => ({ ...current, gratitudeChoice: "yes" }));
    setShowGratitudeScopePicker(true);
  }

  function chooseGratitudeScope(scope: "present" | "future" | "both") {
    const nextSession: LifeManifestVisualizationSession = { ...session, gratitudeChoice: "yes", gratitudeScope: scope };
    setSession(nextSession);
    setShowGratitudeScopePicker(false);
    setStage(getNextVisualizationStage("gratitude_choice", nextSession));
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !majorGoal || !manifestId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא ניתן לטעון את המניפסט.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/life-manifest")}>
            <Text style={styles.buttonText}>חזרה לרשימת המניפסטים</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const copy = getVisualizationStageCopy(stage, majorGoal, subGoal);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{subGoal ? subGoal.title : majorGoal.title}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.segments && copy.segments.map((line, index) => <Text key={index} style={styles.segment}>{line}</Text>)}

        {stage === "gratitude_choice" && !showGratitudeScopePicker && (
          <View style={styles.chipColumn}>
            <Pressable style={styles.chip} onPress={() => chooseGratitude("yes")}>
              <Text style={styles.buttonText}>כן, להוקיר תודה</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => chooseGratitude("no")}>
              <Text style={styles.buttonText}>לא, להמשיך</Text>
            </Pressable>
          </View>
        )}

        {stage === "gratitude_choice" && showGratitudeScopePicker && (
          <View style={styles.chipColumn}>
            <Pressable style={styles.chip} onPress={() => chooseGratitudeScope("present")}>
              <Text style={styles.buttonText}>הוקרת תודה על מה שכבר קיים ועל מה שכבר השגתי בדרך</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => chooseGratitudeScope("future")}>
              <Text style={styles.buttonText}>הוקרת תודה על העתיד שדמיינתי ועל מה שאני שואף להגשים</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => chooseGratitudeScope("both")}>
              <Text style={styles.buttonText}>שניהם</Text>
            </Pressable>
          </View>
        )}

        {stage === "select_next_action" && (
          <SelectNextActionSection
            subGoal={subGoal}
            targets={targets}
            arcGoals={arcGoals}
            arcLinks={arcLinks}
            onFinish={() => router.push({ pathname: "/life-manifest/[id]", params: { id: manifestId } })}
          />
        )}

        {stage !== "gratitude_choice" && stage !== "select_next_action" && stage !== "complete" && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={advance}>
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        )}

        {stage === "complete" && (
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => router.push({ pathname: "/life-manifest/[id]", params: { id: manifestId } })}
          >
            <Text style={styles.buttonText}>חזרה למניפסט</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SelectNextActionSection(props: {
  subGoal: SubGoal | null;
  targets: Target[];
  arcGoals: ArcGoal[];
  arcLinks: ArcLink[];
  onFinish: () => void;
}) {
  const { subGoal, targets, arcGoals, arcLinks, onFinish } = props;

  function openArcLink(link: ArcLink) {
    router.push(
      link.protocolType === "arc"
        ? { pathname: "/arc-link/[id]", params: { id: link.protocolId, linkId: link.id } }
        : { pathname: "/mini-arc-link/[id]", params: { id: link.protocolId, linkId: link.id } }
    );
  }

  function openArcGoal(arcGoalId: string) {
    router.push({ pathname: "/goals/[id]", params: { id: arcGoalId } });
  }

  return (
    <View>
      {targets.length === 0 && <Text style={styles.hint}>אין יעדים בתת־המטרה הזאת עדיין.</Text>}
      {targets.map((target) => {
        const effectiveArcGoalId = subGoal ? resolveEffectiveTargetArcGoalId(target, subGoal) : target.connectedArcGoalId;
        const effectiveArcGoal = effectiveArcGoalId ? arcGoals.find((g) => g.id === effectiveArcGoalId) ?? null : null;
        const links = arcLinks.filter((l) => target.connectedArcLinkIds.includes(l.id));
        return (
          <View key={target.id} style={styles.card}>
            <Text style={styles.body}>{target.title}</Text>
            {links.map((link) => (
              <Pressable key={link.id} style={styles.actionButton} onPress={() => openArcLink(link)}>
                <Text style={styles.actionButtonText}>לעבור ל־ARC Link של הפעולה</Text>
              </Pressable>
            ))}
            {effectiveArcGoal && (
              <Pressable style={styles.actionButton} onPress={() => openArcGoal(effectiveArcGoal.id)}>
                <Text style={styles.actionButtonText}>להמשיך ל־ARC Goal</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {subGoal && subGoal.connectedArcGoalId && (
        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => openArcGoal(subGoal.connectedArcGoalId!)}>
          <Text style={styles.buttonText}>להמשיך ישירות ל־ARC Goal של תת־המטרה</Text>
        </Pressable>
      )}
      <Pressable style={styles.backButton} onPress={onFinish}>
        <Text style={styles.backButtonText}>סיום ההדמיה -- חזרה למניפסט</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 8 },
  segment: { fontSize: 15, textAlign: "right", color: "#333", marginBottom: 6 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  chipColumn: { gap: 8, marginTop: 12 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, alignItems: "center" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  fullWidthButton: { marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

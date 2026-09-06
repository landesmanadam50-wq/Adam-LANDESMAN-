import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild } from "../data/storage.ts";
import { buildArcLinkSteps } from "../arc/arcLink.ts";
import type { ArcLinkStep } from "../arc/arcLink.ts";
import { hasConfiguredTrigger } from "../arc/bodyImagery.ts";
import type { ArcBuild } from "../arc/types.ts";
import BodyImageryStep from "./BodyImageryStep.tsx";

/**
 * live/ArcLinkScreen.tsx (route: /arc-link/[id])
 *
 * ARC Link task: the imagery-rehearsal driver -- a small local useState
 * step index walking the fixed list arc/arcLink.ts's buildArcLinkSteps
 * produces from the linked ArcBuild's own profile. Deliberately NOT
 * live/LiveSessionScreen.tsx/live/ArcLiveRenderer.tsx: no ArcStage, no
 * ArcLiveState, no dwell/timer machinery, no rating input, and no
 * real Action/Success Focus/Gratitude/Negative Action timer is ever
 * started here -- every screen is "press continue" only.
 */
export default function ArcLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "noTrigger" | "ready">("loading");
  const [steps, setSteps] = useState<ArcLinkStep[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getArcBuild(id).then((existing: ArcBuild | null) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      if (!hasConfiguredTrigger(existing.profile.linkSettings)) {
        setStatus("noTrigger");
        return;
      }
      setSteps(buildArcLinkSteps(existing.profile));
      setIndex(0);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  const step = steps[index];

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
            onContinue={() => (index === steps.length - 1 ? router.back() : setIndex(index + 1))}
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
              onPress={() => (index === steps.length - 1 ? router.back() : setIndex(index + 1))}
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

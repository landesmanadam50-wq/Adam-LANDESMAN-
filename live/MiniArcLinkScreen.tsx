import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getMiniArcBuild } from "../data/storage.ts";
import { buildMiniArcLinkSteps } from "../arc/miniArcLink.ts";
import type { MiniArcLinkStep } from "../arc/miniArcLink.ts";
import { hasConfiguredTrigger } from "../arc/bodyImagery.ts";
import BodyImageryStep from "./BodyImageryStep.tsx";

/**
 * live/MiniArcLinkScreen.tsx (route: /mini-arc-link/[id])
 *
 * ARC Link task: Mini ARC's own rehearsal-mode driver -- parallel to
 * live/ArcLinkScreen.tsx, walking arc/miniArcLink.ts's fixed 9-step
 * list. Never launches normal Mini ARC LIVE (live/MiniArcLiveScreen.tsx)
 * or any of its screens; never starts a timer.
 */
export default function MiniArcLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "noTrigger" | "ready">("loading");
  const [steps, setSteps] = useState<MiniArcLinkStep[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMiniArcBuild(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      if (!hasConfiguredTrigger(existing.linkSettings)) {
        setStatus("noTrigger");
        return;
      }
      setSteps(buildMiniArcLinkSteps(existing));
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

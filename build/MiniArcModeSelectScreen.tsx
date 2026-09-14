import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getMiniArcBuild } from "../data/storage.ts";
import { FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL } from "../arc/futureArcLink.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";

/**
 * build/MiniArcModeSelectScreen.tsx (route: /mini-arc/mode/[id])
 *
 * ARC Link task: the new "מה תרצה לתרגל עכשיו?" entry point for ONE
 * Mini ARC -- reached from build/MiniArcListScreen.tsx's "התחל Mini
 * ARC" button instead of navigating straight to
 * live/MiniArcLiveScreen.tsx. "Mini ARC רגיל" pushes to the EXACT SAME
 * /mini-arc/live/[id] route as before this feature existed -- normal
 * Mini ARC LIVE's own entry point and behavior are completely
 * unchanged.
 */
export default function MiniArcModeSelectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [build, setBuild] = useState<MiniArcBuild | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMiniArcBuild(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setBuild(existing);
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

  if (status === "notFound" || !build) {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{build.name}</Text>
        <Text style={styles.title}>מה תרצה לתרגל עכשיו?</Text>

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/mini-arc/live/[id]", params: { id: build.id } })}
        >
          <Text style={styles.buttonText}>Mini ARC רגיל</Text>
        </Pressable>

        {/*
         * ARC completion/Link simplification task, section 10: Mini ARC
         * itself never gained (and must never gain) its own "Link"
         * concept -- the Short Future ARC Link is offered here only
         * when this Mini ARC is linked to a Full protocol (its own
         * parentArcBuildId), reusing THAT protocol's own real content,
         * never a duplicated Mini-ARC-specific future-link resolution.
         */}
        {build.parentArcBuildId && (
          <Pressable
            style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
            onPress={() => router.push({ pathname: "/future-arc-link/[id]", params: { id: build.parentArcBuildId as string } })}
          >
            <Text style={styles.buttonText}>{FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginTop: 8 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

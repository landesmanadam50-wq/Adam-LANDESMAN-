import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getMiniArcBuild } from "../data/storage.ts";
import { getMiniArcPersistentColorLine, getMiniArcStageCopy, getNextMiniArcStage } from "../arc/miniArc.ts";
import type { MiniArcBuild, MiniArcStage } from "../arc/miniArc.ts";

/**
 * live/MiniArcLiveScreen.tsx (route: /mini-arc/live/[id])
 *
 * Mini ARC task: the fixed, linear LIVE sequence -- Initial Pause ->
 * Presence Color (persistent line only, never re-asked) -> Name
 * Current State -> One Regulation Anchor -> One Short Encoding Action
 * -> Brief Side-View Imagery -> Beneficial Action -> Short Completion.
 * Deliberately its OWN small useState machine (stage + the one free-text
 * field entered live), not live/LiveSessionScreen.tsx/ArcLiveRenderer.tsx
 * -- no ArcLiveState, no dwell/timer machinery, no rating inputs, no
 * branching: arc/miniArc.ts's getNextMiniArcStage only ever walks
 * forward one fixed step at a time. currentStateText is intentionally
 * never persisted anywhere (kept only in this component's own state,
 * per the spec: "Keep it only in the current session") and is never
 * sent during BUILD.
 */
export default function MiniArcLiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [build, setBuild] = useState<MiniArcBuild | null>(null);
  const [stage, setStage] = useState<MiniArcStage>("pause");
  const [currentStateText, setCurrentStateText] = useState("");

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

  function advance() {
    setStage((current) => getNextMiniArcStage(current));
  }

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

  const copy = getMiniArcStageCopy(stage, build);
  const persistentColorLine = getMiniArcPersistentColorLine(build);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Persistent Presence Color line -- visible on every screen, from the initial pause through completion, always the CURRENT build's own saved color. */}
        <Text style={styles.persistentColorLine}>{persistentColorLine}</Text>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        {copy.hint && <Text style={styles.hint}>{copy.hint}</Text>}

        {stage === "name_state" && (
          <TextInput
            style={styles.textInput}
            value={currentStateText}
            onChangeText={setCurrentStateText}
            textAlign="right"
            placeholder="לדוגמה: דחף"
          />
        )}

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => (stage === "complete" ? router.replace("/mini-arc") : advance())}
        >
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  persistentColorLine: {
    fontSize: 13,
    textAlign: "right",
    color: "#0a7ea4",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
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

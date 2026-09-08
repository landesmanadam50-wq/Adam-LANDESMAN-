import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { loadArcBuilds } from "../data/storage.ts";
import { hasConfiguredTrigger } from "../arc/bodyImagery.ts";
import type { ArcBuild } from "../arc/types.ts";

/**
 * build/LiveModeSelectScreen.tsx (route: /live/select)
 *
 * ARC Link task: the new "מה תרצה לתרגל עכשיו?" entry point, reached
 * from Home's "התחל סשן LIVE" instead of navigating straight to
 * live/LiveSessionScreen.tsx. Deliberately a NEW screen in FRONT of the
 * existing entry point rather than a change inside
 * LiveSessionScreen.tsx itself -- that component's own buildId-
 * resolution/resume/routine logic (see its own module doc) is left
 * completely untouched; this screen just resolves which ArcBuild to
 * run (reusing the exact same "auto-pick when exactly one, else show a
 * picker" pattern LiveSessionScreen already used internally) and then
 * asks which mode. "ARC רגיל" pushes to the EXACT SAME /live route
 * with the SAME buildId param as before this feature existed --
 * normal ARC's own entry point and behavior are completely unchanged.
 *
 * ARC Goal task: one new top-level gate ("mode" below), shown BEFORE
 * any ArcBuild is loaded -- "ARC Goal" (spec section 6's "two clear
 * primary options") pushes straight to /arc-goal/select
 * (build/ArcGoalSelectScreen.tsx), never touching this screen's own
 * ArcBuild-picker state at all. "ARC רגיל" reveals the EXACT same
 * picker/mode flow this screen has always had, completely unchanged.
 */
export default function LiveModeSelectScreen() {
  const [mode, setMode] = useState<"chooser" | "regular">("chooser");
  // Weekly Routine + ARC Link management task: an optional `buildId` param
  // -- when a weekly action is linked to a specific ArcBuild, its own
  // "start" button pre-selects that build directly instead of always
  // falling back to "auto-pick when exactly one, else show a picker".
  // Absent (the original entry point from Home), behavior is unchanged.
  const { buildId } = useLocalSearchParams<{ buildId?: string }>();
  const [builds, setBuilds] = useState<ArcBuild[] | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<ArcBuild | null>(null);

  const reload = useCallback(() => {
    loadArcBuilds()
      .then((loaded) => {
        setBuilds(loaded);
        const preSelected = buildId ? loaded.find((build) => build.id === buildId) ?? null : null;
        if (loaded.length === 0) {
          router.replace("/build");
        } else if (preSelected) {
          setSelectedBuild(preSelected);
        } else if (loaded.length === 1) {
          setSelectedBuild(loaded[0]);
        }
      })
      .catch((error) => {
        console.warn("[LiveModeSelectScreen] Failed to load ARC Builds.", error);
        setBuilds([]);
      });
  }, [buildId]);

  useFocusEffect(
    useCallback(() => {
      // ARC Goal task: only load ArcBuilds (and only redirect to /build
      // when none exist) once the trainee has actually chosen "ARC
      // רגיל" -- otherwise a trainee with zero ArcBuilds but at least
      // one ArcGoal would never even see the chooser below, redirected
      // away before they could pick "ARC Goal" at all.
      if (mode === "regular") reload();
    }, [reload, mode])
  );

  if (mode === "chooser") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>מה תרצה לתרגל?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setMode("regular")}>
            <Text style={styles.buttonText}>ARC רגיל</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/arc-goal/select")}>
            <Text style={styles.buttonText}>ARC Goal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!builds) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (!selectedBuild) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>איזה ARC Build תרצה לתרגל?</Text>
          {builds.map((build) => (
            <Pressable key={build.id} style={[styles.button, styles.fullWidthButton]} onPress={() => setSelectedBuild(build)}>
              <Text style={styles.buttonText}>{build.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const linkAvailable = hasConfiguredTrigger(selectedBuild.profile.linkSettings);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{selectedBuild.name}</Text>
        <Text style={styles.title}>מה תרצה לתרגל עכשיו?</Text>

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/live", params: { buildId: selectedBuild.id } })}
        >
          <Text style={styles.buttonText}>ARC רגיל</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.fullWidthButton, !linkAvailable && styles.buttonDisabled]}
          disabled={!linkAvailable}
          onPress={() => router.push({ pathname: "/arc-link/[id]", params: { id: selectedBuild.id } })}
        >
          <Text style={styles.buttonText}>ARC Link</Text>
        </Pressable>
        {!linkAvailable && <Text style={styles.hint}>כדי לתרגל ARC Link, יש להגדיר תחילה טריגר ב-BUILD.</Text>}

        {builds.length > 1 && (
          <Pressable style={styles.backButton} onPress={() => setSelectedBuild(null)}>
            <Text style={styles.backButtonText}>בחר ARC Build אחר</Text>
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
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

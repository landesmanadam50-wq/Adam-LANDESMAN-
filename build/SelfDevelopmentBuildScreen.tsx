import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { upsertArcBuild } from "../data/storage.ts";
import { createEmptyArcBuildProfile, generateArcBuildId } from "../arc/types.ts";
import type { ArcBuild } from "../arc/types.ts";

type ProtocolKind = "state" | "urge" | "thought" | "presence" | "belief";

const PROTOCOL_OPTIONS: { value: ProtocolKind; label: string }[] = [
  { value: "state", label: "מצב רגשי" },
  { value: "urge", label: "דחף" },
  { value: "thought", label: "מחשבה" },
  { value: "presence", label: "נוכחות" },
  { value: "belief", label: "אמונה" },
];

/**
 * build/SelfDevelopmentBuildScreen.tsx (route: /self-development/build)
 *
 * ARCHI entry-flow correction: replaces the old "ARC מלא / Mini ARC /
 * מצב פנימי / זהות רצויה / הרגל רצוי" chooser with a single question --
 * "איזה פרוטוקול תרצה לבנות?" -- over the five real protocol kinds
 * (State/Urge/Thought/Presence/Belief). Full ARC and Mini ARC are no
 * longer separate top-level choices here: each protocol's own existing
 * BUILD engine (build/ArcBuildEditorScreen.tsx for State,
 * build/UrgeArcEditorScreen.tsx / ThoughtArcEditorScreen.tsx /
 * PresenceArcEditorScreen.tsx / BeliefArcEditorScreen.tsx for the other
 * four) already lets the trainee configure the Full protocol AND its
 * own linked Mini ARC version together, in one place -- this screen only
 * routes there, it never re-implements any of that. Identity is
 * likewise not offered here as a sixth protocol (spec section 3): it is
 * reached, when wanted, via the optional "continue to identity?" offer
 * shown after saving one of the five protocols below (see
 * build/IdentityContinuationOffer.tsx).
 *
 * Urge/Thought/Presence/Belief each already support `id === "new"`
 * (their own draft's `name` field is asked inline on that screen), so
 * those four routes are a direct, no-setup navigation. ARC State is the
 * one structural exception: an ArcBuild's `name` is fixed once at
 * creation (never part of its own draft -- see build/profileWizard.ts's
 * own doc), so "מצב רגשי" shows one small inline name step before
 * creating the record and handing off to build/ArcBuildEditorScreen.tsx
 * with a `target=state` param (added there for exactly this case) that
 * skips its choosingTarget picker -- reached directly on the State
 * target, never re-exposing the old identity/habit choices from here.
 *
 * Backward compatibility (spec section 6): this screen only changes
 * where NEW protocols are created from -- it never touches ArcBuild/
 * MiniArcBuild storage shape, and every previously saved program (of any
 * target, including old "identity"/"habit" ArcBuilds) keeps loading and
 * running exactly as before through its own existing screens.
 */
export default function SelfDevelopmentBuildScreen() {
  const [namingState, setNamingState] = useState(false);
  const [stateName, setStateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function choose(kind: ProtocolKind) {
    if (kind === "state") {
      setNamingState(true);
      return;
    }
    const routeByKind: Record<Exclude<ProtocolKind, "state">, string> = {
      urge: "/urge-arcs/[id]",
      thought: "/thought-arcs/[id]",
      presence: "/presence-arcs/[id]",
      belief: "/belief-arcs/[id]",
    };
    router.push({ pathname: routeByKind[kind], params: { id: "new" } });
  }

  async function createStateProtocol() {
    const trimmed = stateName.trim();
    if (!trimmed) return;
    setCreateError(null);
    setCreating(true);
    try {
      const now = new Date().toISOString();
      const build: ArcBuild = {
        id: generateArcBuildId(),
        name: trimmed,
        createdAt: now,
        updatedAt: now,
        needsState: true,
        needsIdentity: false,
        needsHabit: false,
        needsIdentityImmediately: false,
        profile: createEmptyArcBuildProfile(),
      };
      await upsertArcBuild(build);
      router.replace({ pathname: "/build/[id]", params: { id: build.id, target: "state" } });
    } catch {
      setCreateError("אירעה שגיאה ביצירת הפרוטוקול. נסה שוב.");
      setCreating(false);
    }
  }

  if (namingState) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>מצב רגשי</Text>
          <Text style={styles.question}>איך תרצה לקרוא לפרוטוקול הזה?</Text>
          <TextInput
            style={styles.textInput}
            value={stateName}
            onChangeText={setStateName}
            textAlign="right"
            placeholder="לדוגמה: רוגע לפני שיחה"
            autoFocus
          />
          {createError && <Text style={styles.errorText}>{createError}</Text>}
          <Pressable
            style={[styles.button, styles.fullWidthButton, (stateName.trim().length === 0 || creating) && styles.buttonDisabled]}
            disabled={stateName.trim().length === 0 || creating}
            onPress={createStateProtocol}
          >
            <Text style={styles.buttonText}>המשך לבניית הפרוטוקול</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => setNamingState(false)}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>איזה פרוטוקול תרצה לבנות?</Text>
        <View style={styles.optionColumn}>
          {PROTOCOL_OPTIONS.map((option) => (
            <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => choose(option.value)}>
              <Text style={styles.buttonText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 8 },
  optionColumn: { gap: 0 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 12 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  cancelButton: { marginTop: 14, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

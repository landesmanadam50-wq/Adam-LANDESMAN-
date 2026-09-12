import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { ArcBuild } from "../arc/types.ts";
import { createEmptyArcBuildProfile, generateArcBuildId } from "../arc/types.ts";
import { IDENTITY_EXTENSION_OFFER_QUESTION, isIdentityExtensionEligible } from "../arc/identityExtension.ts";
import { loadArcBuilds, upsertArcBuild } from "../data/storage.ts";

type Status = "loading" | "asking" | "picking" | "creating";

/**
 * live/IdentityExtensionOfferScreen.tsx (route: /identity-extension/offer)
 *
 * Phase 8 Part 2: Personal Development's OPTIONAL identity-continuation
 * offer -- IDENTITY_EXTENSION_OFFER_QUESTION, with three real outcomes:
 * pick an existing identity-eligible ArcBuild, create a new one, or
 * finish without identity. Never shown for Goal Achievement -- that
 * track is mandatory and auto-enters live/IdentityExtensionScreen.tsx
 * directly, with no offer/picker at all (see each of Urge/Thought/
 * Presence/Belief's own completion screens, which route here only when
 * no goalId is present).
 *
 * "Creating a new one" saves a minimal, empty needsIdentity ArcBuild and
 * routes to the existing BUILD editor (/build/[id]) so the trainee fills
 * in a real identity action/encoding there -- deliberately NOT a
 * duplicated mini-editor here, and deliberately not a seamless round-trip
 * back into the extension (an eligible, but still blank, ArcBuild has
 * nothing to encode yet): the trainee returns to this offer afterward
 * and picks that now-configured identity from the list.
 */
export default function IdentityExtensionOfferScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const [status, setStatus] = useState<Status>("loading");
  const [eligibleBuilds, setEligibleBuilds] = useState<ArcBuild[]>([]);
  const [newIdentityName, setNewIdentityName] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadArcBuilds().then((builds) => {
        if (cancelled) return;
        setEligibleBuilds(builds.filter(isIdentityExtensionEligible));
        setNewIdentityName("");
        setStatus("asking");
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function finishWithoutIdentity() {
    if (typeof returnTo === "string" && returnTo.length > 0 && returnTo.startsWith("/")) {
      router.replace(returnTo);
      return;
    }
    router.replace("/self-development");
  }

  function continueWithBuild(arcBuildId: string) {
    router.replace({ pathname: "/identity-extension/live", params: { track: "personal_development", arcBuildId } });
  }

  async function handleCreateNewIdentity() {
    const trimmed = newIdentityName.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const build: ArcBuild = {
      id: generateArcBuildId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      needsState: false,
      needsIdentity: true,
      needsHabit: false,
      needsIdentityImmediately: false,
      profile: createEmptyArcBuildProfile(),
    };
    await upsertArcBuild(build);
    router.push({ pathname: "/build/[id]", params: { id: build.id } });
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "picking") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>איזו זהות תרצה להמשיך איתה?</Text>
          {eligibleBuilds.map((build) => (
            <Pressable key={build.id} style={[styles.button, styles.fullWidthButton]} onPress={() => continueWithBuild(build.id)}>
              <Text style={styles.buttonText}>{build.name}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelButton} onPress={() => setStatus("asking")}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (status === "creating") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>יצירת זהות חדשה</Text>
          <Text style={styles.body}>לאחר השמירה תוכל לערוך את פרטי הזהות, ולחזור הנה כדי לבחור בה ולהמשיך.</Text>
          <Text style={styles.question}>שם הזהות</Text>
          <TextInput style={styles.textInput} value={newIdentityName} onChangeText={setNewIdentityName} textAlign="right" placeholder="לדוגמה: אדם ממושמע ורגוע" />
          <Pressable style={[styles.button, styles.fullWidthButton, newIdentityName.trim().length === 0 && styles.buttonDisabled]} disabled={newIdentityName.trim().length === 0} onPress={handleCreateNewIdentity}>
            <Text style={styles.buttonText}>שמירה והמשך לעריכה</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => setStatus("asking")}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "asking"
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{IDENTITY_EXTENSION_OFFER_QUESTION}</Text>
        {eligibleBuilds.length > 0 && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setStatus("picking")}>
            <Text style={styles.buttonText}>בחירת זהות קיימת</Text>
          </Pressable>
        )}
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setStatus("creating")}>
          <Text style={styles.secondaryButtonText}>יצירת זהות חדשה</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={finishWithoutIdentity}>
          <Text style={styles.cancelButtonText}>לא, סיימתי</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 8, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  buttonDisabled: { opacity: 0.4 },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  cancelButton: { marginTop: 14, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

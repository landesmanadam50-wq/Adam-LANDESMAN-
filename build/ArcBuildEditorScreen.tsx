import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, loadSessionLog, upsertArcBuild } from "../data/storage.ts";
import { buildEvidenceIndex } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import { createEmptyDraft, draftFromProfileAndSelection, type ProfileDraft } from "./profileWizard.ts";
import { buildArcBuildProfileForSave, draftForTarget, inferTarget, isTargetDraftComplete, type Target } from "./arcBuildSave.ts";
import { ArcBuildProfileForm } from "./ArcBuildProfileForm.tsx";
import type { ArcBuild } from "../arc/types.ts";

/**
 * Single-page BUILD task (spec section 3): ONE screen editing ONE,
 * SINGLE-target ArcBuild, now a single scrollable page with expandable
 * sections (build/ArcBuildProfileForm.tsx) instead of the earlier
 * step-by-step wizard -- no required "המשך"/"הבא" navigation between
 * sections, optional/advanced sections collapsed by default, nothing
 * typed is ever lost when a section opens or closes (see that file's own
 * doc). The one initial choice that stays -- "what does this build
 * target?" -- is a one-time structural decision (an ArcBuild always
 * targets exactly ONE layer, chosen once up front), not sequential
 * section-to-section gating, so it is unaffected by this task.
 *
 * Everything else about this screen is unchanged from before: it still
 * saves back onto the ONE ArcBuild identified by the `id` route param
 * only (data/storage.ts's upsertArcBuild), still goes through
 * build/arcBuildSave.ts's buildArcBuildProfileForSave as the one place a
 * draft becomes a real ArcBuildProfile, and the route itself
 * (/build/[id]) is completely preserved.
 */
export default function ArcBuildEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "choosingTarget" | "editing">("loading");
  const [build, setBuild] = useState<ArcBuild | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([]);

  useEffect(() => {
    loadSessionLog().then((log) => setEvidenceIndex(buildEvidenceIndex(log)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    getArcBuild(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setBuild(existing);
      const inferredTarget = inferTarget(existing.profile);
      const loadedDraft = draftFromProfileAndSelection(existing.profile, {
        needsState: existing.needsState,
        needsIdentity: existing.needsIdentity,
        needsHabit: existing.needsHabit,
        needsIdentityImmediately: existing.needsIdentityImmediately,
        programPath: existing.profile.programPath,
      });
      if (inferredTarget) {
        setTarget(inferredTarget);
        setDraft(draftForTarget(inferredTarget, loadedDraft));
        setStatus("editing");
      } else {
        setDraft(loadedDraft);
        setStatus("choosingTarget");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function chooseTarget(chosen: Target) {
    setTarget(chosen);
    setDraft((current) => draftForTarget(chosen, current));
    setStatus("editing");
  }

  async function finishAndSave() {
    if (!build || !target) return;
    if (!isTargetDraftComplete(target, draft)) {
      setSaveError("יש להשלים את כל השדות הנדרשים לפני השמירה (כולל צבע אנרגיה וכלי ויסות).");
      return;
    }
    setSaveError(null);
    try {
      const profile = buildArcBuildProfileForSave(target, draft, build.name, build.profile.programPath);
      const updated: ArcBuild = {
        ...build,
        needsState: target === "state",
        needsIdentity: target === "identity",
        needsHabit: target === "habit",
        needsIdentityImmediately: false,
        profile,
        updatedAt: new Date().toISOString(),
      };
      await upsertArcBuild(updated);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ה-ARC Build. נסה שוב.");
    }
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

  if (status === "choosingTarget") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>{build?.name}</Text>
          <Text style={styles.title}>על מה יתמקד ה-ARC Build הזה?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("state")}>
            <Text style={styles.buttonText}>מצב פנימי (למשל רוגע, ביטחון, חמלה)</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("identity")}>
            <Text style={styles.buttonText}>זהות רצויה</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("habit")}>
            <Text style={styles.buttonText}>הרגל רצוי (פעולה מיטיבה)</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const activeTarget = target as Target;
  const complete = isTargetDraftComplete(activeTarget, draft);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{build?.name}</Text>
        <Text style={styles.title}>עריכת ARC Build</Text>

        <ArcBuildProfileForm target={activeTarget} draft={draft} setDraft={setDraft} evidenceIndex={evidenceIndex} />

        {activeTarget === "state" && build && (
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/arc-state-composition/[id]", params: { id: build.id } })}>
            <Text style={styles.buttonText}>הרכבת ARC State (דחף, מחשבה, אמונה)</Text>
          </Pressable>
        )}

        {!complete && <Text style={styles.errorText}>יש להשלים את כל השדות הנדרשים לפני השמירה (כולל צבע אנרגיה וכלי ויסות).</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        <Pressable style={[styles.button, styles.fullWidthButton, !complete && styles.buttonDisabled]} disabled={!complete} onPress={finishAndSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 16 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { backgroundColor: "#3d8fa8" },
});

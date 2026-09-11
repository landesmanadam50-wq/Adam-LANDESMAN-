import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { loadSessionLog, upsertArcBuild, upsertMiniArcBuild } from "../data/storage.ts";
import { buildEvidenceIndex } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import { createEmptyDraft, type ProfileDraft } from "./profileWizard.ts";
import { buildArcBuildProfileForSave, isTargetDraftComplete, type Target } from "./arcBuildSave.ts";
import { ArcBuildProfileForm } from "./ArcBuildProfileForm.tsx";
import { MiniArcProfileForm } from "./MiniArcProfileForm.tsx";
import { buildMiniArcFromDraft, createEmptyMiniArcDraft, generateMiniArcId, isMiniArcDraftComplete } from "../arc/miniArc.ts";
import type { MiniArcDraft } from "../arc/miniArc.ts";
import { generateArcBuildId } from "../arc/types.ts";
import type { ArcBuild } from "../arc/types.ts";

/**
 * build/SelfDevelopmentBuildScreen.tsx (route: /self-development/build)
 *
 * Single-page BUILD task (spec section 3): the new, unified entry point
 * for creating a Self Development program -- one scrollable Hebrew RTL
 * page offering Full ARC only, Mini ARC only, or both together (two
 * independent toggles below, never mutually exclusive), with every
 * section expandable/collapsible and no required "המשך"/"הבא"
 * navigation anywhere on the page. This REPLACES the Self Development
 * dashboard's two separate creation entry points (build/ArcBuildListScreen.tsx's
 * inline "+ הוסף ARC Build" and build/MiniArcListScreen.tsx's own "+"),
 * which previously forced a trainee choosing "I want both" to run two
 * completely separate creation flows one after another.
 *
 * Reuses every existing field, type, save function, and completeness
 * gate unchanged -- this screen never re-implements ArcBuild/MiniArcBuild
 * logic, it only orchestrates the SAME build/ArcBuildProfileForm.tsx and
 * build/MiniArcProfileForm.tsx already used by build/ArcBuildEditorScreen.tsx
 * and build/MiniArcEditorScreen.tsx respectively (see each file's own
 * doc). Saving here creates a brand-new ArcBuild and/or MiniArcBuild
 * record, each through its own existing upsert function
 * (data/storage.ts) -- exactly the records those legacy screens would
 * have created, so every existing list/edit/LIVE-selection screen for
 * either type keeps working unchanged on whatever this screen saves.
 * Editing an ALREADY-saved ArcBuild or MiniArcBuild still goes through
 * their own existing, preserved routes (/build/[id], /mini-arc/[id]) --
 * this screen is creation-only.
 */
export default function SelfDevelopmentBuildScreen() {
  const [sharedName, setSharedName] = useState("");
  const [wantsFullArc, setWantsFullArc] = useState(false);
  const [wantsMiniArc, setWantsMiniArc] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [arcDraft, setArcDraft] = useState<ProfileDraft>(createEmptyDraft());
  const [miniArcDraft, setMiniArcDraft] = useState<MiniArcDraft>(createEmptyMiniArcDraft());
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSessionLog().then((log) => setEvidenceIndex(buildEvidenceIndex(log)));
  }, []);

  function chooseTarget(chosen: Target) {
    setTarget(chosen);
    setArcDraft((current) => ({
      ...current,
      needsState: chosen === "state",
      needsIdentityImmediately: chosen === "state" ? false : current.needsIdentityImmediately,
      needsIdentityExplicit: chosen === "identity",
    }));
  }

  const nameReady = sharedName.trim().length > 0;
  const hasSelection = wantsFullArc || wantsMiniArc;
  const fullArcReady = !wantsFullArc || (target !== null && isTargetDraftComplete(target, arcDraft));
  const effectiveMiniArcDraft: MiniArcDraft = { ...miniArcDraft, name: miniArcDraft.name.trim() || sharedName.trim() };
  const miniArcReady = !wantsMiniArc || isMiniArcDraftComplete(effectiveMiniArcDraft);
  const complete = nameReady && hasSelection && fullArcReady && miniArcReady;

  async function handleSave() {
    if (!complete) {
      setSaveError("יש למלא שם לתוכנית, לבחור Full ARC ו/או Mini ARC, ולהשלים את השדות הנדרשים בכל אחד מהם שנבחר.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (wantsFullArc && target) {
        const profile = buildArcBuildProfileForSave(target, arcDraft, sharedName.trim(), "custom_arc_build");
        const build: ArcBuild = {
          id: generateArcBuildId(),
          name: sharedName.trim(),
          createdAt: now,
          updatedAt: now,
          needsState: target === "state",
          needsIdentity: target === "identity",
          needsHabit: target === "habit",
          needsIdentityImmediately: false,
          profile,
        };
        await upsertArcBuild(build);
      }
      if (wantsMiniArc) {
        const build = buildMiniArcFromDraft(effectiveMiniArcDraft, generateMiniArcId(), now, now);
        await upsertMiniArcBuild(build);
      }
      router.replace("/self-development");
    } catch {
      setSaveError("אירעה שגיאה בשמירת התוכנית. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בניית תוכנית חדשה</Text>
        <Text style={styles.subtitle}>תוכנית ARC מלא, Mini ARC, או שניהם יחד -- הכל בעמוד אחד, עם קטעים שניתן לפתוח ולסגור.</Text>

        <Text style={styles.question}>איך תרצה לקרוא לתוכנית?</Text>
        <TextInput
          style={styles.textInput}
          value={sharedName}
          onChangeText={setSharedName}
          textAlign="right"
          placeholder="לדוגמה: לחץ לפני שיחה"
        />

        <Text style={styles.question}>מה תרצה לבנות?</Text>
        <View style={styles.toggleRow}>
          <Pressable style={[styles.toggle, wantsFullArc && styles.toggleSelected]} onPress={() => setWantsFullArc((v) => !v)}>
            <Text style={[styles.toggleText, wantsFullArc && styles.toggleTextSelected]}>ARC מלא</Text>
          </Pressable>
          <Pressable style={[styles.toggle, wantsMiniArc && styles.toggleSelected]} onPress={() => setWantsMiniArc((v) => !v)}>
            <Text style={[styles.toggleText, wantsMiniArc && styles.toggleTextSelected]}>Mini ARC</Text>
          </Pressable>
        </View>
        {!hasSelection && <Text style={styles.hint}>אפשר לבחור ARC מלא בלבד, Mini ARC בלבד, או את שניהם יחד.</Text>}

        {wantsFullArc && target === null && (
          <View style={styles.targetChooser}>
            <Text style={styles.question}>על מה יתמקד ה-ARC המלא?</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("state")}>
              <Text style={styles.buttonText}>מצב פנימי (למשל רוגע, ביטחון, חמלה)</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("identity")}>
              <Text style={styles.buttonText}>זהות רצויה</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => chooseTarget("habit")}>
              <Text style={styles.buttonText}>הרגל רצוי (פעולה מיטיבה)</Text>
            </Pressable>
          </View>
        )}

        {wantsFullArc && target !== null && (
          <View style={styles.blockWrapper}>
            <Text style={styles.blockTitle}>ARC מלא</Text>
            <ArcBuildProfileForm target={target} draft={arcDraft} setDraft={setArcDraft} evidenceIndex={evidenceIndex} />
          </View>
        )}

        {wantsMiniArc && (
          <View style={styles.blockWrapper}>
            <Text style={styles.blockTitle}>Mini ARC</Text>
            <MiniArcProfileForm draft={miniArcDraft} setDraft={setMiniArcDraft} />
          </View>
        )}

        {!complete && hasSelection && (
          <Text style={styles.errorText}>יש להשלים שם לתוכנית ואת כל השדות הנדרשים בכל תוכנית שנבחרה לפני השמירה.</Text>
        )}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <Pressable style={[styles.button, styles.fullWidthButton, (!complete || saving) && styles.buttonDisabled]} disabled={!complete || saving} onPress={handleSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginTop: 16, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 4 },
  toggleRow: { flexDirection: "row-reverse", gap: 10 },
  toggle: { flex: 1, borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  toggleSelected: { backgroundColor: "#0a7ea4" },
  toggleText: { color: "#0a7ea4", fontSize: 16, fontWeight: "600" },
  toggleTextSelected: { color: "#fff" },
  targetChooser: { marginTop: 8 },
  blockWrapper: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#E6F4FE", paddingTop: 12 },
  blockTitle: { fontSize: 18, fontWeight: "700", textAlign: "right", color: "#1a6b4a" },
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
});

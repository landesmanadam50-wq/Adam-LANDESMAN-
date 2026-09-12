import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcBuild, loadBeliefArcs, loadMiniArcBuilds, loadThoughtArcs, loadUrgeArcs, upsertArcBuild, upsertMiniArcBuild } from "../data/storage.ts";
import type { ArcBuild, ArcStateComponentKind, BeliefArc, ThoughtArc, UrgeArc } from "../arc/types.ts";
import { buildMiniArcFromDraft, createLinkedMiniArcDraft, generateMiniArcId, isMiniArcDraftComplete, linkMiniArcToParent } from "../arc/miniArc.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";

const PRIMARY_COMPONENT_OPTIONS: { value: ArcStateComponentKind; label: string }[] = [
  { value: "emotion", label: "רגש/תחושה (ברירת מחדל)" },
  { value: "urge", label: "דחף" },
  { value: "thought", label: "מחשבה" },
  { value: "belief", label: "אמונה" },
];

const OPTIONAL_COMPONENTS: { value: ArcStateComponentKind; label: string }[] = [
  { value: "urge", label: "דחף" },
  { value: "thought", label: "מחשבה" },
  { value: "belief", label: "אמונה" },
];

/**
 * build/ArcStateCompositionScreen.tsx (route: /arc-state-composition/[id], id = a "state"-target ArcBuild's own id)
 *
 * Phase 7 (ARC State composition), spec section 17: BUILD configuration
 * for which optional components (Urge/Thought/Belief -- "emotion" is
 * the state layer's own always-present recognition, never a toggle
 * here) this ArcBuild's ARC State session may combine, which are
 * selected by default, and which saved Urge/Thought/Belief record each
 * links to (a reference only -- see arc/types.ts's own doc for
 * ArcBuildProfile.stateComposition/linkedUrgeArcId/linkedThoughtArcId/
 * linkedBeliefArcId). A deliberately separate, self-contained screen
 * (never threaded through build/ArcBuildProfileForm.tsx's existing
 * ProfileDraft/accordion machinery) so this new, additive feature
 * carries zero risk to that large, already-working form -- "Do not
 * broadly restructure unrelated flows."
 *
 * Reached only from build/ArcBuildEditorScreen.tsx, and only when that
 * build targets "state" -- Identity/Habit builds have no ARC State
 * composition concept.
 */
export default function ArcStateCompositionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "ready">("loading");
  const [build, setBuild] = useState<ArcBuild | null>(null);
  const [available, setAvailable] = useState<ArcStateComponentKind[]>([]);
  const [defaultSelected, setDefaultSelected] = useState<ArcStateComponentKind[]>([]);
  const [linkedUrgeArcId, setLinkedUrgeArcId] = useState<string | null>(null);
  const [linkedThoughtArcId, setLinkedThoughtArcId] = useState<string | null>(null);
  const [linkedBeliefArcId, setLinkedBeliefArcId] = useState<string | null>(null);
  const [urgeArcs, setUrgeArcs] = useState<UrgeArc[]>([]);
  const [thoughtArcs, setThoughtArcs] = useState<ThoughtArc[]>([]);
  const [beliefArcs, setBeliefArcs] = useState<BeliefArc[]>([]);
  const [linkedMiniState, setLinkedMiniState] = useState<MiniArcBuild | null>(null);
  const [miniCreateError, setMiniCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([getArcBuild(id), loadUrgeArcs(), loadThoughtArcs(), loadBeliefArcs(), loadMiniArcBuilds()]).then(([existing, urges, thoughts, beliefs, miniArcs]) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setBuild(existing);
      setAvailable(existing.profile.stateComposition?.available.filter((k) => k !== "emotion") ?? []);
      setDefaultSelected(existing.profile.stateComposition?.defaultSelected.filter((k) => k !== "emotion") ?? []);
      setLinkedUrgeArcId(existing.profile.linkedUrgeArcId ?? null);
      setLinkedThoughtArcId(existing.profile.linkedThoughtArcId ?? null);
      setLinkedBeliefArcId(existing.profile.linkedBeliefArcId ?? null);
      setUrgeArcs(urges);
      setThoughtArcs(thoughts);
      setBeliefArcs(beliefs);
      setLinkedMiniState(miniArcs.find((m) => m.protocolKind === "state" && m.parentArcBuildId === id) ?? null);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function createLinkedMiniState() {
    if (!build) return;
    const draft = createLinkedMiniArcDraft(
      build.name,
      build.profile.presenceColor ?? "",
      build.profile.regulationTool ?? "",
      build.profile.stateEncoding?.bodyLanguageCue ?? build.profile.stateEncoding?.bodySensationCue ?? "",
      build.profile.beneficialAction ?? ""
    );
    if (!isMiniArcDraftComplete(draft)) {
      setMiniCreateError("יש להשלים צבע נוכחות, עוגן ויסות, רמז קידוד ופעולה מיטיבה בפרופיל ה-ARC Build לפני יצירת ARC Mini State.");
      return;
    }
    setMiniCreateError(null);
    const now = new Date().toISOString();
    const built = buildMiniArcFromDraft(draft, generateMiniArcId(), now, now);
    const linked: MiniArcBuild = { ...linkMiniArcToParent(built, build.id), protocolKind: "state", miniStatePrimaryComponent: "emotion" };
    await upsertMiniArcBuild(linked);
    setLinkedMiniState(linked);
  }

  async function setMiniStatePrimaryComponent(kind: ArcStateComponentKind) {
    if (!linkedMiniState) return;
    const updated: MiniArcBuild = { ...linkedMiniState, miniStatePrimaryComponent: kind, updatedAt: new Date().toISOString() };
    await upsertMiniArcBuild(updated);
    setLinkedMiniState(updated);
  }

  function toggleAvailable(kind: ArcStateComponentKind) {
    setAvailable((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
    // Removing a component from "available" also removes it from "default selected" -- never leave a default pointing at a component that's no longer offered.
    setDefaultSelected((current) => (available.includes(kind) ? current.filter((k) => k !== kind) : current));
  }

  function toggleDefaultSelected(kind: ArcStateComponentKind) {
    if (!available.includes(kind)) return;
    setDefaultSelected((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  }

  async function handleSave() {
    if (!build) return;
    const updated: ArcBuild = {
      ...build,
      profile: {
        ...build.profile,
        stateComposition: available.length > 0 ? { available: ["emotion", ...available], defaultSelected: ["emotion", ...defaultSelected] } : null,
        linkedUrgeArcId,
        linkedThoughtArcId,
        linkedBeliefArcId,
      },
      updatedAt: new Date().toISOString(),
    };
    await upsertArcBuild(updated);
    router.back();
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
          <Text style={styles.title}>ה-ARC Build לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{build.name}</Text>
        <Text style={styles.title}>הרכבת ARC State</Text>
        <Text style={styles.helperText}>
          "רגש או תחושה" תמיד מוכלל -- אין צורך לבחור אותו. בחר אילו מרכיבים נוספים מותר לשלב בפרוטוקול הזה, ואילו מהם יסומנו כברירת מחדל. בזמן אמת ("מה מעורב במצב הזה כרגע?") ניתן
          לכלול רק את מה שרלוונטי לרגע הנוכחי -- זה לא דורס את ברירת המחדל כאן.
        </Text>

        <Text style={styles.sectionHeader}>מרכיבים זמינים</Text>
        <View style={styles.chipRow}>
          {OPTIONAL_COMPONENTS.map((option) => (
            <Pressable key={option.value} style={[styles.chip, available.includes(option.value) && styles.chipSelected]} onPress={() => toggleAvailable(option.value)}>
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionHeader}>נבחרים כברירת מחדל</Text>
        <View style={styles.chipRow}>
          {OPTIONAL_COMPONENTS.filter((option) => available.includes(option.value)).map((option) => (
            <Pressable key={option.value} style={[styles.chip, defaultSelected.includes(option.value) && styles.chipSelected]} onPress={() => toggleDefaultSelected(option.value)}>
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
          {available.length === 0 && <Text style={styles.helperText}>בחר קודם מרכיבים זמינים למעלה.</Text>}
        </View>

        {available.includes("urge") && (
          <>
            <Text style={styles.sectionHeader}>ARC Urge מקושר</Text>
            <View style={styles.chipRow}>
              {urgeArcs.map((urgeArc) => (
                <Pressable key={urgeArc.id} style={[styles.chip, linkedUrgeArcId === urgeArc.id && styles.chipSelected]} onPress={() => setLinkedUrgeArcId(linkedUrgeArcId === urgeArc.id ? null : urgeArc.id)}>
                  <Text style={styles.chipText}>{urgeArc.name}</Text>
                </Pressable>
              ))}
              {urgeArcs.length === 0 && <Text style={styles.helperText}>אין עדיין ARC Urge שמור.</Text>}
            </View>
          </>
        )}

        {available.includes("thought") && (
          <>
            <Text style={styles.sectionHeader}>ARC Thought מקושר</Text>
            <View style={styles.chipRow}>
              {thoughtArcs.map((thoughtArc) => (
                <Pressable key={thoughtArc.id} style={[styles.chip, linkedThoughtArcId === thoughtArc.id && styles.chipSelected]} onPress={() => setLinkedThoughtArcId(linkedThoughtArcId === thoughtArc.id ? null : thoughtArc.id)}>
                  <Text style={styles.chipText}>{thoughtArc.name}</Text>
                </Pressable>
              ))}
              {thoughtArcs.length === 0 && <Text style={styles.helperText}>אין עדיין ARC Thought שמור.</Text>}
            </View>
          </>
        )}

        {available.includes("belief") && (
          <>
            <Text style={styles.sectionHeader}>ARC Belief מקושר</Text>
            <View style={styles.chipRow}>
              {beliefArcs.map((beliefArc) => (
                <Pressable key={beliefArc.id} style={[styles.chip, linkedBeliefArcId === beliefArc.id && styles.chipSelected]} onPress={() => setLinkedBeliefArcId(linkedBeliefArcId === beliefArc.id ? null : beliefArc.id)}>
                  <Text style={styles.chipText}>{beliefArc.name}</Text>
                </Pressable>
              ))}
              {beliefArcs.length === 0 && <Text style={styles.helperText}>אין עדיין ARC Belief שמור.</Text>}
            </View>
          </>
        )}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={handleSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>

        <Text style={styles.sectionHeader}>ARC Mini State</Text>
        <Text style={styles.helperText}>גרסה קצרה: עוגן ויסות אחד ומרכיב עיקרי אחד לקידוד -- לעולם לא משלבת כמה מרכיבים כמו ה-ARC State המלא.</Text>
        {!linkedMiniState && (
          <>
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={createLinkedMiniState}>
              <Text style={styles.buttonText}>+ בניית ARC Mini State מקושר</Text>
            </Pressable>
            {miniCreateError && <Text style={styles.errorText}>{miniCreateError}</Text>}
          </>
        )}
        {linkedMiniState && (
          <>
            <Text style={styles.helperText}>מרכיב עיקרי ל-ARC Mini State:</Text>
            <View style={styles.chipRow}>
              {PRIMARY_COMPONENT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.chip, (linkedMiniState.miniStatePrimaryComponent ?? "emotion") === option.value && styles.chipSelected]}
                  onPress={() => setMiniStatePrimaryComponent(option.value)}
                >
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/mini-arc/[id]", params: { id: linkedMiniState.id } })}>
              <Text style={styles.buttonText}>עריכת ה-ARC Mini State המקושר</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  helperText: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  sectionHeader: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 8, color: "#0a7ea4" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 24 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 12 },
});

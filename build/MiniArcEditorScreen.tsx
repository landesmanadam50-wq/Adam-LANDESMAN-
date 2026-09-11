import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getMiniArcBuild, upsertMiniArcBuild } from "../data/storage.ts";
import { buildMiniArcFromDraft, createEmptyMiniArcDraft, draftFromMiniArc, generateMiniArcId, isMiniArcDraftComplete } from "../arc/miniArc.ts";
import type { MiniArcDraft } from "../arc/miniArc.ts";
import { MiniArcProfileForm } from "./MiniArcProfileForm.tsx";

/**
 * build/MiniArcEditorScreen.tsx (route: /mini-arc/[id], id="new" to create)
 *
 * Mini ARC task: ONE screen, ONE flat form for all five required
 * fields -- deliberately not a multi-step wizard like
 * build/ArcBuildEditorScreen.tsx (Mini ARC has five short questions
 * total, not dozens; a step-machine sized for the full ARC protocol
 * would be both overkill and a needless coupling to that screen's own
 * internals). Preset chips are pure quick-fill convenience -- tapping
 * one just sets the same text field a trainee could type into directly,
 * so a fully custom entry always works for every field (the "preserve a
 * custom-cue option" requirement).
 *
 * Single-page BUILD task (spec section 3): the actual field rendering
 * now lives in build/MiniArcProfileForm.tsx, grouped into
 * CollapsibleSection blocks (required fields expanded, advanced
 * body-part/movement-text and trigger fields collapsed by default) --
 * reused unchanged by build/SelfDevelopmentBuildScreen.tsx's new unified
 * single-page BUILD. This screen still owns loading/saving the ONE
 * MiniArcBuild identified by its own `id` route param, unchanged.
 *
 * Never saves an incomplete Mini ARC: the Save button is disabled while
 * isMiniArcDraftComplete is false, AND finishAndSave re-checks the same
 * way before writing, showing a clear Hebrew message either way rather
 * than a silently inert button -- the same lesson already applied to
 * build/ArcBuildEditorScreen.tsx's own save path.
 */
export default function MiniArcEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [draft, setDraft] = useState<MiniArcDraft>(createEmptyMiniArcDraft());
  const [existingMeta, setExistingMeta] = useState<{ id: string; createdAt: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getMiniArcBuild(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setDraft(draftFromMiniArc(existing));
      setExistingMeta({ id: existing.id, createdAt: existing.createdAt });
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  async function handleSave() {
    if (!isMiniArcDraftComplete(draft)) {
      setSaveError("יש למלא שם, צבע נוכחות, עוגן ויסות, פעולת קידוד ופעולה מיטיבה לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const build = buildMiniArcFromDraft(draft, existingMeta?.id ?? generateMiniArcId(), existingMeta?.createdAt ?? now, now);
      await upsertMiniArcBuild(build);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ה-Mini ARC. נסה שוב.");
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
          <Text style={styles.title}>ה-Mini ARC לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/mini-arc")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-Mini ARC</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const complete = isMiniArcDraftComplete(draft);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "Mini ARC חדש" : "עריכת Mini ARC"}</Text>

        <MiniArcProfileForm draft={draft} setDraft={setDraft} />

        {!complete && <Text style={styles.errorText}>יש למלא שם, צבע נוכחות, עוגן ויסות, פעולת קידוד ופעולה מיטיבה לפני השמירה.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <Pressable
          style={[styles.button, styles.fullWidthButton, !complete && styles.buttonDisabled]}
          disabled={!complete}
          onPress={handleSave}
        >
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 16 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 20 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

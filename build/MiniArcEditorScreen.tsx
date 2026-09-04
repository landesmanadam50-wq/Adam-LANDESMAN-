import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getMiniArcBuild, upsertMiniArcBuild } from "../data/storage.ts";
import {
  buildMiniArcFromDraft,
  createEmptyMiniArcDraft,
  draftFromMiniArc,
  generateMiniArcId,
  isMiniArcDraftComplete,
  MINI_ARC_COLOR_PRESETS,
  MINI_ARC_ENCODING_ACTION_PRESETS,
  MINI_ARC_REGULATION_ANCHOR_PRESETS,
} from "../arc/miniArc.ts";
import type { MiniArcDraft } from "../arc/miniArc.ts";

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

        <Text style={styles.question}>איך תרצה לקרוא ל־Mini ARC הזה?</Text>
        <TextInput
          style={styles.textInput}
          value={draft.name}
          onChangeText={(value) => setDraft({ ...draft, name: value })}
          textAlign="right"
          placeholder="לדוגמה: עצירה מול דחף"
        />

        <Text style={styles.question}>באיזה צבע מתמלאת הנוכחות שלך?</Text>
        <View style={styles.chipRow}>
          {MINI_ARC_COLOR_PRESETS.map((color) => (
            <Pressable
              key={color}
              style={[styles.chip, draft.presenceColor === color && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, presenceColor: color })}
            >
              <Text style={styles.chipText}>{color}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.textInput}
          value={draft.presenceColor}
          onChangeText={(value) => setDraft({ ...draft, presenceColor: value })}
          textAlign="right"
          placeholder="לדוגמה: סגול"
        />

        <Text style={styles.question}>באיזה עוגן ויסות אחד תרצה להשתמש?</Text>
        <View style={styles.chipRow}>
          {MINI_ARC_REGULATION_ANCHOR_PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              style={[styles.chip, draft.regulationAnchor === preset.instruction && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, regulationAnchor: preset.instruction })}
            >
              <Text style={styles.chipText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.textInput}
          value={draft.regulationAnchor}
          onChangeText={(value) => setDraft({ ...draft, regulationAnchor: value })}
          textAlign="right"
          placeholder="לדוגמה: הרגש את כפות הרגליים על הקרקע."
          multiline
        />

        <Text style={styles.question}>איזו פעולת קידוד גופנית קטנה תחבר אותך למצב הרצוי?</Text>
        <View style={styles.chipRow}>
          {MINI_ARC_ENCODING_ACTION_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={[styles.chip, draft.encodingAction === preset && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, encodingAction: preset })}
            >
              <Text style={styles.chipText}>{preset}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.textInput}
          value={draft.encodingAction}
          onChangeText={(value) => setDraft({ ...draft, encodingAction: value })}
          textAlign="right"
          placeholder="לדוגמה: ליישר בעדינות את הגב"
        />

        <Text style={styles.question}>מהי הפעולה המיטיבה שאליה ה־Mini ARC יוביל?</Text>
        <TextInput
          style={styles.textInput}
          value={draft.beneficialAction}
          onChangeText={(value) => setDraft({ ...draft, beneficialAction: value })}
          textAlign="right"
          placeholder="לדוגמה: להרחיק את היד מהאוזן ולהניח אותה על הרגל."
          multiline
        />

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
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginTop: 20, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
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

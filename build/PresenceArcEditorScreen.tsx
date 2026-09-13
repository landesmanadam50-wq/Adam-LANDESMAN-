import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getPresenceArc, loadMiniArcBuilds, upsertMiniArcBuild, upsertPresenceArc } from "../data/storage.ts";
import { buildPresenceArcFromDraft, createEmptyPresenceArcDraft, draftFromPresenceArc, isPresenceArcDraftComplete } from "../arc/presenceArcs.ts";
import type { PresenceArcDraft } from "../arc/presenceArcs.ts";
import { generatePresenceArcId } from "../arc/types.ts";
import { buildMiniArcFromDraft, createLinkedMiniArcDraft, generateMiniArcId, isMiniArcDraftComplete, linkMiniArcToParent } from "../arc/miniArc.ts";
import type { MiniArcBuild, MiniArcDraft } from "../arc/miniArc.ts";

/**
 * build/PresenceArcEditorScreen.tsx (route: /presence-arcs/[id], id="new" to create)
 *
 * Phase 5 (ARC Presence and ARC Mini Presence): ONE flat form for
 * PresenceArc's own small field set (name/presenceColor/
 * presenceDwellSeconds -- the ONLY fields this protocol needs, since
 * every actual Presence STAGE/behavior is reused verbatim from the
 * existing arc/arcEngine.ts implementation via arc/presenceLive.ts's
 * presenceArcToProfile adapter, never re-specified here), mirroring
 * build/ThoughtArcEditorScreen.tsx's own structure -- including its
 * "בניית ARC Mini" section (same createLinkedMiniArcDraft/
 * linkMiniArcToParent helpers). Mini Presence needs no parent-specific
 * field overrides (unlike Mini Thought's supportiveThought) -- its own
 * presenceColor/regulationAnchor/encodingAction/beneficialAction are
 * simply its own MiniArcBuild fields, seeded once from this parent for
 * convenience and then fully independently editable.
 *
 * Only a name is required (isPresenceArcDraftComplete).
 */
export default function PresenceArcEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [draft, setDraft] = useState<PresenceArcDraft>(createEmptyPresenceArcDraft());
  const [existingMeta, setExistingMeta] = useState<{ id: string; createdAt: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [miniDraft, setMiniDraft] = useState<MiniArcDraft | null>(null);
  const [miniSaveError, setMiniSaveError] = useState<string | null>(null);
  const [miniSecondaryEncodingAction, setMiniSecondaryEncodingAction] = useState("");
  const [miniActionDurationMinutes, setMiniActionDurationMinutes] = useState("");
  const [miniGratitudePrompt, setMiniGratitudePrompt] = useState("");
  const [miniActionImageryDwellSecondsText, setMiniActionImageryDwellSecondsText] = useState("");

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getPresenceArc(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setDraft(draftFromPresenceArc(existing));
      setExistingMeta({ id: existing.id, createdAt: existing.createdAt });
      setStatus("ready");
    });
    loadMiniArcBuilds().then((builds) => {
      if (cancelled) return;
      const found = builds.find((b) => b.protocolKind === "presence" && b.parentArcBuildId === id) ?? null;
      setLinkedMini(found);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function startBuildingLinkedMini() {
    if (!existingMeta) return;
    setMiniDraft(createLinkedMiniArcDraft(draft.name, draft.presenceColor, "", "", ""));
    setMiniSecondaryEncodingAction("");
    setMiniActionDurationMinutes("");
    setMiniGratitudePrompt("");
    setMiniActionImageryDwellSecondsText("");
  }

  async function handleSaveLinkedMini() {
    if (!miniDraft || !existingMeta) return;
    if (!isMiniArcDraftComplete(miniDraft)) {
      setMiniSaveError("יש למלא שם, צבע נוכחות, עוגן קשב, פעולת קידוד ופעולה קצרה לפני השמירה.");
      return;
    }
    setMiniSaveError(null);
    try {
      const now = new Date().toISOString();
      const built = buildMiniArcFromDraft(miniDraft, generateMiniArcId(), now, now);
      const secondaryTrimmed = miniSecondaryEncodingAction.trim();
      const parsedDuration = Number(miniActionDurationMinutes);
      const gratitudeTrimmed = miniGratitudePrompt.trim();
      const parsedImageryDwell = Number(miniActionImageryDwellSecondsText);
      const linked: MiniArcBuild = {
        ...linkMiniArcToParent(built, existingMeta.id),
        protocolKind: "presence",
        secondaryEncodingAction: secondaryTrimmed.length > 0 ? secondaryTrimmed : null,
        actionDurationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
        miniGratitudePrompt: gratitudeTrimmed.length > 0 ? gratitudeTrimmed : null,
        miniActionImageryDwellSeconds: Number.isFinite(parsedImageryDwell) && parsedImageryDwell > 0 ? parsedImageryDwell : null,
      };
      await upsertMiniArcBuild(linked);
      setLinkedMini(linked);
      setMiniDraft(null);
      setMiniSecondaryEncodingAction("");
      setMiniActionDurationMinutes("");
      setMiniGratitudePrompt("");
      setMiniActionImageryDwellSecondsText("");
    } catch {
      setMiniSaveError("אירעה שגיאה בשמירת ה-ARC Mini. נסה שוב.");
    }
  }

  async function handleSave() {
    if (!isPresenceArcDraftComplete(draft)) {
      setSaveError("יש למלא שם לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const presenceArc = buildPresenceArcFromDraft(draft, existingMeta?.id ?? generatePresenceArcId(), existingMeta?.createdAt ?? now, now);
      await upsertPresenceArc(presenceArc);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ה-ARC Presence. נסה שוב.");
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
          <Text style={styles.title}>ה-ARC Presence לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/presence-arcs")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-ARC Presence</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const complete = isPresenceArcDraftComplete(draft);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "ARC Presence חדש" : "עריכת ARC Presence"}</Text>

        <Text style={styles.question}>איך תרצה לקרוא לפרוטוקול הזה?</Text>
        <TextInput style={styles.textInput} value={draft.name} onChangeText={(value) => setDraft({ ...draft, name: value })} textAlign="right" placeholder="לדוגמה: נוכחות לפני ישיבה" />

        <Text style={styles.sectionHeader}>צבע האנרגיה בגוף</Text>
        <Text style={styles.question}>צבע האנרגיה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.presenceColor} onChangeText={(value) => setDraft({ ...draft, presenceColor: value })} textAlign="right" placeholder="לדוגמה: כחול" />

        <Text style={styles.sectionHeader}>זמן שהייה</Text>
        <Text style={styles.question}>משך שהייה בנוכחות בשניות (רשות)</Text>
        <Text style={styles.helperText}>אם לא תוגדר, ייעשה שימוש בזמן ברירת המחדל של הפרוטוקול הרגיל.</Text>
        <TextInput style={styles.textInput} value={draft.presenceDwellSeconds} onChangeText={(value) => setDraft({ ...draft, presenceDwellSeconds: value })} textAlign="right" keyboardType="numeric" />

        <Text style={styles.sectionHeader}>פעולה מיטיבה ולאחר הפעולה (רשות)</Text>
        <Text style={styles.helperText}>לאחר שהנוכחות מגיעה למצב הרצוי, מבצעים בפועל פעולה מיטיבה.</Text>
        <Text style={styles.question}>הפעולה המיטיבה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.beneficialAction} onChangeText={(value) => setDraft({ ...draft, beneficialAction: value })} textAlign="right" multiline />
        <Text style={styles.question}>שאלת תודה מותאמת (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.gratitudePrompt} onChangeText={(value) => setDraft({ ...draft, gratitudePrompt: value })} textAlign="right" placeholder="על מה אתה מודה לעצמך בעקבות הפעולה?" multiline />
        <Text style={styles.question}>משך דמיון הפעולה בשניות (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.postActionImageryDwellSeconds} onChangeText={(value) => setDraft({ ...draft, postActionImageryDwellSeconds: value })} textAlign="right" keyboardType="numeric" />

        {!complete && <Text style={styles.errorText}>יש למלא שם לפני השמירה.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <Pressable style={[styles.button, styles.fullWidthButton, !complete && styles.buttonDisabled]} disabled={!complete} onPress={handleSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>

        {existingMeta && (
          <>
            <Text style={styles.sectionHeader}>בניית ARC Mini</Text>
            <Text style={styles.helperText}>צור גרסה קצרה של הפרוטוקול לשימוש מהיר בזמן אמת: שים לב למה שנוכח, נשימה טבעית, עוגן קשב אחד, צבע אנרגיה או רמז קצר, וחזרה לפעולה.</Text>

            {linkedMini && !miniDraft && (
              <View style={styles.miniCard}>
                <Text style={styles.miniCardTitle}>{linkedMini.name}</Text>
                <Text style={styles.miniCardRow}>ה-ARC Mini הזה כבר מקושר ל-ARC Presence הזה.</Text>
                <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/mini-arc/[id]", params: { id: linkedMini.id } })}>
                  <Text style={styles.secondaryButtonText}>עריכת ה-ARC Mini המקושר</Text>
                </Pressable>
              </View>
            )}

            {!linkedMini && !miniDraft && (
              <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={startBuildingLinkedMini}>
                <Text style={styles.secondaryButtonText}>+ בניית ARC Mini מקושר</Text>
              </Pressable>
            )}

            {miniDraft && (
              <View style={styles.miniCard}>
                <Text style={styles.question}>שם ה-ARC Mini</Text>
                <TextInput style={styles.textInput} value={miniDraft.name} onChangeText={(value) => setMiniDraft({ ...miniDraft, name: value })} textAlign="right" />
                <Text style={styles.question}>צבע נוכחות</Text>
                <TextInput style={styles.textInput} value={miniDraft.presenceColor} onChangeText={(value) => setMiniDraft({ ...miniDraft, presenceColor: value })} textAlign="right" placeholder="לדוגמה: כחול" />
                <Text style={styles.question}>עוגן קשב/נוכחות</Text>
                <TextInput style={styles.textInput} value={miniDraft.regulationAnchor} onChangeText={(value) => setMiniDraft({ ...miniDraft, regulationAnchor: value })} textAlign="right" multiline placeholder="לדוגמה: הרגש את כפות הרגליים על הקרקע" />
                <Text style={styles.question}>רמז נוכחות קצר (ליתר גיבוי כשאין צבע אנרגיה)</Text>
                <TextInput style={styles.textInput} value={miniDraft.encodingAction} onChangeText={(value) => setMiniDraft({ ...miniDraft, encodingAction: value })} textAlign="right" multiline />
                <Text style={styles.question}>רמז נוכחות משני (רשות, ל"גם וגם")</Text>
                <TextInput style={styles.textInput} value={miniSecondaryEncodingAction} onChangeText={setMiniSecondaryEncodingAction} textAlign="right" multiline />
                <Text style={styles.question}>חזרה לפעולה המיועדת</Text>
                <TextInput style={styles.textInput} value={miniDraft.beneficialAction} onChangeText={(value) => setMiniDraft({ ...miniDraft, beneficialAction: value })} textAlign="right" multiline />
                <Text style={styles.question}>משך פעולה בדקות (רשות)</Text>
                <TextInput style={styles.textInput} value={miniActionDurationMinutes} onChangeText={setMiniActionDurationMinutes} textAlign="right" keyboardType="numeric" />
                <Text style={styles.question}>שאלת תודה קצרה (רשות)</Text>
                <TextInput style={styles.textInput} value={miniGratitudePrompt} onChangeText={setMiniGratitudePrompt} textAlign="right" placeholder="על מה אתה מודה לעצמך בעקבות הפעולה?" multiline />
                <Text style={styles.question}>משך דמיון הפעולה בשניות (רשות)</Text>
                <TextInput style={styles.textInput} value={miniActionImageryDwellSecondsText} onChangeText={setMiniActionImageryDwellSecondsText} textAlign="right" keyboardType="numeric" />

                {miniSaveError && <Text style={styles.errorText}>{miniSaveError}</Text>}

                <Pressable style={[styles.button, styles.fullWidthButton]} onPress={handleSaveLinkedMini}>
                  <Text style={styles.buttonText}>שמירת ה-ARC Mini המקושר</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={() => setMiniDraft(null)}>
                  <Text style={styles.cancelButtonText}>ביטול</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginTop: 20, marginBottom: 8 },
  helperText: { fontSize: 13, textAlign: "right", color: "#666", marginTop: -4, marginBottom: 8 },
  sectionHeader: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 24, color: "#0a7ea4" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 16 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 20 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  miniCard: { backgroundColor: "#F7FAFC", borderRadius: 12, padding: 16, marginTop: 12 },
  miniCardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  miniCardRow: { fontSize: 14, textAlign: "right", color: "#555", marginBottom: 10 },
  cancelButton: { marginTop: 10, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

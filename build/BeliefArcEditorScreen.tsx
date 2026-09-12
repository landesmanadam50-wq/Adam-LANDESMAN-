import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getBeliefArc, loadMiniArcBuilds, loadProfile, upsertBeliefArc, upsertMiniArcBuild } from "../data/storage.ts";
import { buildBeliefArcFromDraft, createEmptyBeliefArcDraft, draftFromBeliefArc, isBeliefArcDraftComplete, resolveBeliefFallbackLimitingBelief, resolveBeliefFallbackReplacementBelief } from "../arc/beliefArcs.ts";
import type { BeliefArcDraft } from "../arc/beliefArcs.ts";
import { generateBeliefArcId } from "../arc/types.ts";
import type { ArcBuildProfile } from "../arc/types.ts";
import { buildMiniArcFromDraft, createLinkedMiniArcDraft, generateMiniArcId, isMiniArcDraftComplete, linkMiniArcToParent } from "../arc/miniArc.ts";
import type { MiniArcBuild, MiniArcDraft } from "../arc/miniArc.ts";

/**
 * build/BeliefArcEditorScreen.tsx (route: /belief-arcs/[id], id="new" to create)
 *
 * Phase 6 (ARC Belief and ARC Mini Belief), spec sections 20-21: ONE
 * flat form for BeliefArc's own field set, mirroring
 * build/ThoughtArcEditorScreen.tsx's exact structure -- including its
 * own "בניית ARC Mini" section (same createLinkedMiniArcDraft/
 * linkMiniArcToParent helpers, same "preserve customized Mini values,
 * never silently overwrite on parent edit" guarantee) and its own
 * "ייבוא מהמצב הקיים" prefill button (spec section 26: reuse the
 * existing identityLimitingBelief/identityBridgeBelief/
 * stateLimitingBelief/stateBridgeBelief fields where semantically
 * correct -- a one-time, explicit prefill action, never a silent
 * overwrite of whatever the trainee has already typed).
 *
 * Only a name is required (isBeliefArcDraftComplete) -- every other
 * field is optional/"decide in LIVE" by spec design.
 */
export default function BeliefArcEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [draft, setDraft] = useState<BeliefArcDraft>(createEmptyBeliefArcDraft());
  const [existingMeta, setExistingMeta] = useState<{ id: string; createdAt: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);

  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [miniDraft, setMiniDraft] = useState<MiniArcDraft | null>(null);
  const [miniReplacementBelief, setMiniReplacementBelief] = useState("");
  const [miniBridgeMantra, setMiniBridgeMantra] = useState("");
  const [miniSaveError, setMiniSaveError] = useState<string | null>(null);
  const [miniSecondaryEncodingAction, setMiniSecondaryEncodingAction] = useState("");
  const [miniActionDurationMinutes, setMiniActionDurationMinutes] = useState("");
  const [miniActionImageryDwellSeconds, setMiniActionImageryDwellSeconds] = useState("");
  const [miniGratitudePrompt, setMiniGratitudePrompt] = useState("");

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getBeliefArc(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setDraft(draftFromBeliefArc(existing));
      setExistingMeta({ id: existing.id, createdAt: existing.createdAt });
      setStatus("ready");
    });
    loadMiniArcBuilds().then((builds) => {
      if (cancelled) return;
      const found = builds.find((b) => b.protocolKind === "belief" && b.parentArcBuildId === id) ?? null;
      setLinkedMini(found);
      if (found) {
        setMiniReplacementBelief(found.replacementBelief ?? "");
        setMiniBridgeMantra(found.bridgeMantraText ?? "");
        setMiniActionImageryDwellSeconds(found.miniActionImageryDwellSeconds != null ? String(found.miniActionImageryDwellSeconds) : "");
        setMiniGratitudePrompt(found.miniGratitudePrompt ?? "");
      }
    });
    loadProfile().then((loaded) => {
      if (!cancelled) setProfile(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function importFromExistingState() {
    const importedBelief = resolveBeliefFallbackLimitingBelief(null, profile);
    const importedReplacement = resolveBeliefFallbackReplacementBelief(null, null, profile);
    setDraft({
      ...draft,
      limitingBelief: importedBelief && draft.limitingBelief.trim().length === 0 ? importedBelief : draft.limitingBelief,
      replacementBelief: importedReplacement && draft.replacementBelief.trim().length === 0 ? importedReplacement : draft.replacementBelief,
    });
  }

  function startBuildingLinkedMini() {
    if (!existingMeta) return;
    setMiniDraft(createLinkedMiniArcDraft(draft.name, "", draft.regulationAnchor, draft.encodingAnchor, draft.shortAction));
    setMiniReplacementBelief(draft.replacementBelief);
    setMiniBridgeMantra(draft.bridgeMantra);
    setMiniSecondaryEncodingAction("");
    setMiniActionDurationMinutes("");
    setMiniActionImageryDwellSeconds("");
    setMiniGratitudePrompt("");
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
      const replacementTrimmed = miniReplacementBelief.trim();
      const bridgeTrimmed = miniBridgeMantra.trim();
      const gratitudeTrimmed = miniGratitudePrompt.trim();
      const parsedDuration = Number(miniActionDurationMinutes);
      const parsedImageryDwell = Number(miniActionImageryDwellSeconds);
      const linked: MiniArcBuild = {
        ...linkMiniArcToParent(built, existingMeta.id),
        protocolKind: "belief",
        replacementBelief: replacementTrimmed.length > 0 ? replacementTrimmed : null,
        bridgeMantraText: bridgeTrimmed.length > 0 ? bridgeTrimmed : null,
        secondaryEncodingAction: secondaryTrimmed.length > 0 ? secondaryTrimmed : null,
        actionDurationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
        miniActionImageryDwellSeconds: Number.isFinite(parsedImageryDwell) && parsedImageryDwell > 0 ? Math.round(parsedImageryDwell) : null,
        miniGratitudePrompt: gratitudeTrimmed.length > 0 ? gratitudeTrimmed : null,
      };
      await upsertMiniArcBuild(linked);
      setLinkedMini(linked);
      setMiniDraft(null);
    } catch {
      setMiniSaveError("אירעה שגיאה בשמירת ה-ARC Mini. נסה שוב.");
    }
  }

  async function handleSave() {
    if (!isBeliefArcDraftComplete(draft)) {
      setSaveError("יש למלא שם לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const beliefArc = buildBeliefArcFromDraft(draft, existingMeta?.id ?? generateBeliefArcId(), existingMeta?.createdAt ?? now, now);
      await upsertBeliefArc(beliefArc);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ה-ARC Belief. נסה שוב.");
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
          <Text style={styles.title}>ה-ARC Belief לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/belief-arcs")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-ARC Belief</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const complete = isBeliefArcDraftComplete(draft);
  const hasProfileFallback = Boolean(profile?.identityLimitingBelief || profile?.stateLimitingBelief || profile?.identityBridgeBelief || profile?.stateBridgeBelief);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "ARC Belief חדש" : "עריכת ARC Belief"}</Text>

        <Text style={styles.question}>איך תרצה לקרוא לפרוטוקול הזה?</Text>
        <TextInput style={styles.textInput} value={draft.name} onChangeText={(value) => setDraft({ ...draft, name: value })} textAlign="right" placeholder="לדוגמה: אני לא מספיק טוב" />

        {hasProfileFallback && (
          <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={importFromExistingState}>
            <Text style={styles.secondaryButtonText}>ייבוא מהמצב הקיים</Text>
          </Pressable>
        )}

        <Text style={styles.sectionHeader}>זיהוי האמונה</Text>
        <Text style={styles.question}>האמונה המגבילה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.limitingBelief} onChangeText={(value) => setDraft({ ...draft, limitingBelief: value })} textAlign="right" multiline />

        <Text style={styles.question}>מצב/הקשר (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.situationContext} onChangeText={(value) => setDraft({ ...draft, situationContext: value })} textAlign="right" multiline />

        <Text style={styles.question}>רגש או תחושה נלווים (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.associatedEmotion} onChangeText={(value) => setDraft({ ...draft, associatedEmotion: value })} textAlign="right" multiline />

        <Text style={styles.sectionHeader}>שהייה וקבלה</Text>
        <Text style={styles.question}>מנטרת שהייה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.stayMantra} onChangeText={(value) => setDraft({ ...draft, stayMantra: value })} textAlign="right" />
        <Text style={styles.question}>מנטרת קבלה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.acceptanceMantra} onChangeText={(value) => setDraft({ ...draft, acceptanceMantra: value })} textAlign="right" />

        <Text style={styles.sectionHeader}>ויסות</Text>
        <Text style={styles.question}>עוגן ויסות (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.regulationAnchor} onChangeText={(value) => setDraft({ ...draft, regulationAnchor: value })} textAlign="right" multiline />
        <Text style={styles.question}>מנטרת ויסות (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.regulationMantra} onChangeText={(value) => setDraft({ ...draft, regulationMantra: value })} textAlign="right" />

        <Text style={styles.sectionHeader}>מנטרת גשר</Text>
        <Text style={styles.question}>מנטרת גשר (רשות)</Text>
        <Text style={styles.helperText}>מציינת מעבר בין האמונה המגבילה לבין החופש לבחור -- לא מחליפה את האמונה התומכת.</Text>
        <TextInput style={styles.textInput} value={draft.bridgeMantra} onChangeText={(value) => setDraft({ ...draft, bridgeMantra: value })} textAlign="right" multiline />

        <Text style={styles.sectionHeader}>אמונה חלופית ותומכת</Text>
        <Text style={styles.question}>איזו אמונה תומכת תרצה להכין מראש?</Text>
        <Text style={styles.helperText}>אמונה מאוזנת ואמינה, שתומכת בבחירה ובפעולה -- לא חייבת להיות אופטימית באופן לא ריאלי.</Text>
        <TextInput style={styles.textInput} value={draft.replacementBelief} onChangeText={(value) => setDraft({ ...draft, replacementBelief: value })} textAlign="right" multiline />

        <Text style={styles.sectionHeader}>קידוד</Text>
        <Text style={styles.question}>עוגן קידוד (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.encodingAnchor} onChangeText={(value) => setDraft({ ...draft, encodingAnchor: value })} textAlign="right" multiline />
        <Text style={styles.question}>רמז להנהון עדין (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.gentleNodCue} onChangeText={(value) => setDraft({ ...draft, gentleNodCue: value })} textAlign="right" />
        <Text style={styles.question}>דימוי תומך (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.supportiveImage} onChangeText={(value) => setDraft({ ...draft, supportiveImage: value })} textAlign="right" multiline />
        <Text style={styles.question}>הנחיית קול פנימי תומך (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.supportiveVoiceInstruction} onChangeText={(value) => setDraft({ ...draft, supportiveVoiceInstruction: value })} textAlign="right" multiline />

        <Text style={styles.sectionHeader}>תובנה ופעולה עתידית</Text>
        <Text style={styles.question}>תובנה עתידית (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.futureInsight} onChangeText={(value) => setDraft({ ...draft, futureInsight: value })} textAlign="right" multiline placeholder="בפעם הבאה אני אזכור ש..." />
        <Text style={styles.question}>דרך פעולה עתידית (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.futureAction} onChangeText={(value) => setDraft({ ...draft, futureAction: value })} textAlign="right" multiline placeholder="כאשר זה יקרה, אפעל כך..." />
        <Text style={styles.question}>משך דמיון עתידי בשניות (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.futureImageryDwellSeconds} onChangeText={(value) => setDraft({ ...draft, futureImageryDwellSeconds: value })} textAlign="right" keyboardType="numeric" />

        <Text style={styles.sectionHeader}>פעולה עקבית לאמונה וסיום</Text>
        <Text style={styles.question}>פעולה קצרה עקבית לאמונה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.shortAction} onChangeText={(value) => setDraft({ ...draft, shortAction: value })} textAlign="right" multiline />
        <Text style={styles.question}>משך דמיון לאחר הפעולה בשניות (רשות)</Text>
        <Text style={styles.helperText}>משמש גם לדמיון הפעולה כפי שנעשתה וגם לדמיון הפעולה המשופרת.</Text>
        <TextInput style={styles.textInput} value={draft.postActionImageryDwellSeconds} onChangeText={(value) => setDraft({ ...draft, postActionImageryDwellSeconds: value })} textAlign="right" keyboardType="numeric" />
        <Text style={styles.question}>שאלת הוקרת תודה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.gratitudePrompt} onChangeText={(value) => setDraft({ ...draft, gratitudePrompt: value })} textAlign="right" placeholder="על מה אתה מודה לעצמך בעקבות הפעולה?" />

        {!complete && <Text style={styles.errorText}>יש למלא שם לפני השמירה.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <Pressable style={[styles.button, styles.fullWidthButton, !complete && styles.buttonDisabled]} disabled={!complete} onPress={handleSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>

        {existingMeta && (
          <>
            <Text style={styles.sectionHeader}>בניית ARC Mini</Text>
            <Text style={styles.helperText}>צור גרסה קצרה של הפרוטוקול לשימוש מהיר בזמן אמת.</Text>

            {linkedMini && !miniDraft && (
              <View style={styles.miniCard}>
                <Text style={styles.miniCardTitle}>{linkedMini.name}</Text>
                <Text style={styles.miniCardRow}>ה-ARC Mini הזה כבר מקושר ל-ARC Belief הזה.</Text>
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
                <Text style={styles.question}>מנטרת גשר (רשות)</Text>
                <TextInput style={styles.textInput} value={miniBridgeMantra} onChangeText={setMiniBridgeMantra} textAlign="right" multiline />
                <Text style={styles.question}>עוגן ויסות אחד</Text>
                <TextInput style={styles.textInput} value={miniDraft.regulationAnchor} onChangeText={(value) => setMiniDraft({ ...miniDraft, regulationAnchor: value })} textAlign="right" multiline />
                <Text style={styles.question}>אמונה חלופית ותומכת</Text>
                <TextInput style={styles.textInput} value={miniReplacementBelief} onChangeText={setMiniReplacementBelief} textAlign="right" multiline />
                <Text style={styles.question}>רמז קידוד אחד</Text>
                <TextInput style={styles.textInput} value={miniDraft.encodingAction} onChangeText={(value) => setMiniDraft({ ...miniDraft, encodingAction: value })} textAlign="right" multiline />
                <Text style={styles.question}>רמז קידוד משני (רשות, ל"גם וגם")</Text>
                <TextInput style={styles.textInput} value={miniSecondaryEncodingAction} onChangeText={setMiniSecondaryEncodingAction} textAlign="right" multiline />
                <Text style={styles.question}>פעולה עקבית לאמונה, קצרה</Text>
                <TextInput style={styles.textInput} value={miniDraft.beneficialAction} onChangeText={(value) => setMiniDraft({ ...miniDraft, beneficialAction: value })} textAlign="right" multiline />
                <Text style={styles.question}>משך פעולה בדקות (רשות)</Text>
                <TextInput style={styles.textInput} value={miniActionDurationMinutes} onChangeText={setMiniActionDurationMinutes} textAlign="right" keyboardType="numeric" />
                <Text style={styles.question}>משך דמיון קצר לאחר הפעולה בשניות (רשות)</Text>
                <TextInput style={styles.textInput} value={miniActionImageryDwellSeconds} onChangeText={setMiniActionImageryDwellSeconds} textAlign="right" keyboardType="numeric" />
                <Text style={styles.question}>שאלת הוקרת תודה קצרה (רשות)</Text>
                <TextInput style={styles.textInput} value={miniGratitudePrompt} onChangeText={setMiniGratitudePrompt} textAlign="right" placeholder="על מה אתה מודה לעצמך בעקבות הפעולה?" />

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

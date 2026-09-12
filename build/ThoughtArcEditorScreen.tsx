import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getThoughtArc, loadMiniArcBuilds, upsertMiniArcBuild, upsertThoughtArc } from "../data/storage.ts";
import { buildThoughtArcFromDraft, createEmptyThoughtArcDraft, draftFromThoughtArc, isThoughtArcDraftComplete } from "../arc/thoughtArcs.ts";
import type { ThoughtArcDraft } from "../arc/thoughtArcs.ts";
import { generateThoughtArcId } from "../arc/types.ts";
import type { ThoughtModalityPreference, ThoughtRoutePreference, ThoughtTimeOrientationPreference } from "../arc/types.ts";
import { buildMiniArcFromDraft, createLinkedMiniArcDraft, generateMiniArcId, isMiniArcDraftComplete, linkMiniArcToParent } from "../arc/miniArc.ts";
import type { MiniArcBuild, MiniArcDraft } from "../arc/miniArc.ts";

/**
 * build/ThoughtArcEditorScreen.tsx (route: /thought-arcs/[id], id="new" to create)
 *
 * Phase 4 (ARC Thought and ARC Mini Thought), spec sections 22-23: ONE
 * flat form for ThoughtArc's own field set, mirroring
 * build/UrgeArcEditorScreen.tsx's exact structure -- including its own
 * "בניית ARC Mini" section (same createLinkedMiniArcDraft/
 * linkMiniArcToParent helpers, same "preserve customized Mini values,
 * never silently overwrite on parent edit" guarantee).
 *
 * Only a name is required (isThoughtArcDraftComplete) -- every other
 * field is optional/"decide in LIVE" by spec design (sections 6, 22:
 * "Do not require every field").
 */
export default function ThoughtArcEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [draft, setDraft] = useState<ThoughtArcDraft>(createEmptyThoughtArcDraft());
  const [existingMeta, setExistingMeta] = useState<{ id: string; createdAt: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [miniDraft, setMiniDraft] = useState<MiniArcDraft | null>(null);
  const [miniSaveError, setMiniSaveError] = useState<string | null>(null);
  const [miniSecondaryEncodingAction, setMiniSecondaryEncodingAction] = useState("");
  const [miniActionDurationMinutes, setMiniActionDurationMinutes] = useState("");

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getThoughtArc(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setDraft(draftFromThoughtArc(existing));
      setExistingMeta({ id: existing.id, createdAt: existing.createdAt });
      setStatus("ready");
    });
    loadMiniArcBuilds().then((builds) => {
      if (cancelled) return;
      const found = builds.find((b) => b.protocolKind === "thought" && b.parentArcBuildId === id) ?? null;
      setLinkedMini(found);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function startBuildingLinkedMini() {
    if (!existingMeta) return;
    setMiniDraft(createLinkedMiniArcDraft(draft.name, "", draft.encodingAnchor, draft.encodingAnchor, draft.shortAction));
    setMiniSecondaryEncodingAction("");
    setMiniActionDurationMinutes("");
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
      const linked: MiniArcBuild = {
        ...linkMiniArcToParent(built, existingMeta.id),
        protocolKind: "thought",
        supportiveThought: draft.supportiveThought.trim().length > 0 ? draft.supportiveThought : null,
        secondaryEncodingAction: secondaryTrimmed.length > 0 ? secondaryTrimmed : null,
        actionDurationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
      };
      await upsertMiniArcBuild(linked);
      setLinkedMini(linked);
      setMiniDraft(null);
      setMiniSecondaryEncodingAction("");
      setMiniActionDurationMinutes("");
    } catch {
      setMiniSaveError("אירעה שגיאה בשמירת ה-ARC Mini. נסה שוב.");
    }
  }

  async function handleSave() {
    if (!isThoughtArcDraftComplete(draft)) {
      setSaveError("יש למלא שם לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const thoughtArc = buildThoughtArcFromDraft(draft, existingMeta?.id ?? generateThoughtArcId(), existingMeta?.createdAt ?? now, now);
      await upsertThoughtArc(thoughtArc);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ה-ARC Thought. נסה שוב.");
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
          <Text style={styles.title}>ה-ARC Thought לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/thought-arcs")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-ARC Thought</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const complete = isThoughtArcDraftComplete(draft);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "ARC Thought חדש" : "עריכת ARC Thought"}</Text>

        <Text style={styles.question}>איך תרצה לקרוא לפרוטוקול הזה?</Text>
        <TextInput style={styles.textInput} value={draft.name} onChangeText={(value) => setDraft({ ...draft, name: value })} textAlign="right" placeholder="לדוגמה: מחשבה לפני הופעה" />

        <Text style={styles.question}>מסלול ברירת מחדל</Text>
        <ChipRow
          options={[
            { value: "disturbing", label: "להתגבר על מחשבה מפריעה" },
            { value: "supportive", label: "לחזק מחשבה תומכת" },
            { value: "decide_in_live", label: "להחליט בזמן אמת" },
          ]}
          selected={draft.defaultRoute}
          onSelect={(value) => setDraft({ ...draft, defaultRoute: value as ThoughtRoutePreference })}
        />

        <Text style={styles.question}>המחשבה הנוכחית (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.currentThought} onChangeText={(value) => setDraft({ ...draft, currentThought: value })} textAlign="right" multiline />

        <Text style={styles.question}>מצב/הקשר (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.situationContext} onChangeText={(value) => setDraft({ ...draft, situationContext: value })} textAlign="right" multiline />

        <Text style={styles.question}>רגש או תחושה נלווים (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.associatedEmotion} onChangeText={(value) => setDraft({ ...draft, associatedEmotion: value })} textAlign="right" multiline />

        <Text style={styles.question}>אופן הופעת המחשבה</Text>
        <ChipRow
          options={[
            { value: "visual", label: "כתמונה" },
            { value: "auditory", label: "כקול או מילים פנימיות" },
            { value: "both", label: "גם וגם" },
            { value: "decide_in_live", label: "להחליט בזמן אמת" },
          ]}
          selected={draft.modalityPreference}
          onSelect={(value) => setDraft({ ...draft, modalityPreference: value as ThoughtModalityPreference })}
        />

        <Text style={styles.question}>לאיזה זמן המחשבה מתייחסת בעיקר</Text>
        <ChipRow
          options={[
            { value: "past", label: "עבר" },
            { value: "present", label: "הווה" },
            { value: "future", label: "עתיד" },
            { value: "decide_in_live", label: "להחליט בזמן אמת" },
          ]}
          selected={draft.timeOrientationPreference}
          onSelect={(value) => setDraft({ ...draft, timeOrientationPreference: value as ThoughtTimeOrientationPreference })}
        />

        <Text style={styles.sectionHeader}>שהייה וקבלה</Text>
        <Text style={styles.question}>מנטרת שהייה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.stayMantra} onChangeText={(value) => setDraft({ ...draft, stayMantra: value })} textAlign="right" />
        <Text style={styles.question}>מנטרת קבלה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.acceptanceMantra} onChangeText={(value) => setDraft({ ...draft, acceptanceMantra: value })} textAlign="right" />

        <Text style={styles.sectionHeader}>עוגני קשב</Text>
        <Pressable style={styles.toggleRow} onPress={() => setDraft({ ...draft, externalSoundAnchorEnabled: !draft.externalSoundAnchorEnabled })}>
          <Text style={styles.question}>{draft.externalSoundAnchorEnabled ? "☑" : "☐"} לכלול צליל חיצוני כעוגן קשב (למחשבה שמיעתית/גם וגם)</Text>
        </Pressable>
        <Text style={styles.question}>משך שהייה בקשב הגמיש בשניות (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.flexibleAttentionDwellSeconds} onChangeText={(value) => setDraft({ ...draft, flexibleAttentionDwellSeconds: value })} textAlign="right" keyboardType="numeric" />

        <Text style={styles.sectionHeader}>מחשבה תומכת ותובנה מועילה</Text>
        <Text style={styles.question}>איזו מחשבה תומכת תרצה להכין למקרה שלא תמצא משהו מועיל במחשבה המפריעה?</Text>
        <Text style={styles.helperText}>משפט מאוזן ואמין שיוכל לעזור לך להתייחס למצב בדרך מיטיבה ולבחור כיצד לפעול.</Text>
        <TextInput style={styles.textInput} value={draft.supportiveThought} onChangeText={(value) => setDraft({ ...draft, supportiveThought: value })} textAlign="right" multiline />

        <Text style={styles.question}>תובנה מועילה שכבר נמצאה (רשות, מתעדכן גם אחרי תרגול LIVE)</Text>
        <TextInput style={styles.textInput} value={draft.usefulInsight} onChangeText={(value) => setDraft({ ...draft, usefulInsight: value })} textAlign="right" multiline />

        <Text style={styles.sectionHeader}>קידוד</Text>
        <Text style={styles.question}>דימוי תומך/מותאם לוויזואלי (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.visualSupportiveImage} onChangeText={(value) => setDraft({ ...draft, visualSupportiveImage: value })} textAlign="right" multiline />
        <Text style={styles.question}>הנחיית קול פנימי תומך (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.auditorySupportiveVoiceInstruction} onChangeText={(value) => setDraft({ ...draft, auditorySupportiveVoiceInstruction: value })} textAlign="right" multiline />
        <Text style={styles.question}>עוגן קידוד (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.encodingAnchor} onChangeText={(value) => setDraft({ ...draft, encodingAnchor: value })} textAlign="right" multiline />
        <Text style={styles.question}>רמז להנהון עדין (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.gentleNodCue} onChangeText={(value) => setDraft({ ...draft, gentleNodCue: value })} textAlign="right" />

        <Text style={styles.sectionHeader}>תובנה ופעולה עתידית</Text>
        <Text style={styles.question}>תובנה עתידית (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.futureInsight} onChangeText={(value) => setDraft({ ...draft, futureInsight: value })} textAlign="right" multiline placeholder="בפעם הבאה אני אזכור ש..." />
        <Text style={styles.question}>פעולה קצרה (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.shortAction} onChangeText={(value) => setDraft({ ...draft, shortAction: value })} textAlign="right" multiline placeholder="כאשר זה יקרה, אפעל כך..." />
        <Text style={styles.question}>משך דמיון עתידי בשניות (רשות)</Text>
        <TextInput style={styles.textInput} value={draft.futureImageryDwellSeconds} onChangeText={(value) => setDraft({ ...draft, futureImageryDwellSeconds: value })} textAlign="right" keyboardType="numeric" />

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
                <Text style={styles.miniCardRow}>ה-ARC Mini הזה כבר מקושר ל-ARC Thought הזה.</Text>
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
                <Text style={styles.question}>עוגן קשב</Text>
                <TextInput style={styles.textInput} value={miniDraft.regulationAnchor} onChangeText={(value) => setMiniDraft({ ...miniDraft, regulationAnchor: value })} textAlign="right" multiline />
                <Text style={styles.question}>פעולת קידוד קצרה (ראשית)</Text>
                <TextInput style={styles.textInput} value={miniDraft.encodingAction} onChangeText={(value) => setMiniDraft({ ...miniDraft, encodingAction: value })} textAlign="right" multiline />
                <Text style={styles.question}>פעולת קידוד משנית (רשות, ל"גם וגם")</Text>
                <TextInput style={styles.textInput} value={miniSecondaryEncodingAction} onChangeText={setMiniSecondaryEncodingAction} textAlign="right" multiline />
                <Text style={styles.question}>פעולה קצרה</Text>
                <TextInput style={styles.textInput} value={miniDraft.beneficialAction} onChangeText={(value) => setMiniDraft({ ...miniDraft, beneficialAction: value })} textAlign="right" multiline />
                <Text style={styles.question}>משך פעולה בדקות (רשות)</Text>
                <TextInput style={styles.textInput} value={miniActionDurationMinutes} onChangeText={setMiniActionDurationMinutes} textAlign="right" keyboardType="numeric" />

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

function ChipRow<T extends string>({ options, selected, onSelect }: { options: { value: T; label: string }[]; selected: T; onSelect: (value: T) => void }) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => (
        <Pressable key={option.value} style={[styles.chip, selected === option.value && styles.chipSelected]} onPress={() => onSelect(option.value)}>
          <Text style={styles.chipText}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 4, marginBottom: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  toggleRow: { marginTop: 4, marginBottom: 8, alignItems: "flex-end" },
});

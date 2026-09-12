import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getUrgeArc, loadMiniArcBuilds, upsertMiniArcBuild, upsertUrgeArc } from "../data/storage.ts";
import {
  buildUrgeArcFromDraft,
  createEmptyUrgeArcDraft,
  draftFromUrgeArc,
  isUrgeArcDraftComplete,
} from "../arc/urgeArcs.ts";
import type { UrgeArcDraft } from "../arc/urgeArcs.ts";
import { generateUrgeArcId } from "../arc/types.ts";
import {
  buildMiniArcFromDraft,
  createLinkedMiniArcDraft,
  generateMiniArcId,
  isMiniArcDraftComplete,
  linkMiniArcToParent,
} from "../arc/miniArc.ts";
import type { MiniArcBuild, MiniArcDraft } from "../arc/miniArc.ts";

/**
 * build/UrgeArcEditorScreen.tsx (route: /urge-arcs/[id], id="new" to create)
 *
 * ARC Goal Urge route task: ONE screen, ONE flat form for UrgeArc's own
 * short field set -- mirrors build/MiniArcEditorScreen.tsx's own "five
 * short questions, not a wizard" shape exactly, sized instead for
 * UrgeArc's own field count. "Do not treat the urge itself as an
 * ordinary emotion" (spec section 9) is reflected in the wording of
 * every question below (habit/interfering action, beneficial
 * ALTERNATIVE action), never in a different mechanism.
 *
 * Never saves an incomplete UrgeArc: Save is disabled while
 * isUrgeArcDraftComplete is false, and handleSave re-checks the same
 * way before writing -- see arc/urgeArcs.ts's own doc.
 */
export default function UrgeArcEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [draft, setDraft] = useState<UrgeArcDraft>(createEmptyUrgeArcDraft());
  const [existingMeta, setExistingMeta] = useState<{ id: string; createdAt: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Build ARC Mini together with full ARC task (spec section 9): the
  // linked Mini ARC for THIS UrgeArc, when one already exists -- null
  // while none has been built yet. Loaded alongside the UrgeArc itself,
  // never a separate navigation away from this page.
  const [linkedMini, setLinkedMini] = useState<MiniArcBuild | null>(null);
  const [miniDraft, setMiniDraft] = useState<MiniArcDraft | null>(null);
  const [miniSaveError, setMiniSaveError] = useState<string | null>(null);
  // Phase 3 (Full + Mini ARC Urge representation encoding), spec section
  // 19 ("ARC Mini Urge... Optional secondary Encoding action... Optional
  // beneficial-action duration") -- these two fields have no home on the
  // shared 5-field MiniArcDraft (every other Mini kind never uses them),
  // so they're held here, alongside miniDraft, exactly like protocolKind/
  // preventiveStoppingAction already are in handleSaveLinkedMini below.
  const [miniSecondaryEncodingAction, setMiniSecondaryEncodingAction] = useState("");
  const [miniActionDurationMinutes, setMiniActionDurationMinutes] = useState("");

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getUrgeArc(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setDraft(draftFromUrgeArc(existing));
      setExistingMeta({ id: existing.id, createdAt: existing.createdAt });
      setStatus("ready");
    });
    loadMiniArcBuilds().then((builds) => {
      if (cancelled) return;
      const found = builds.find((b) => b.protocolKind === "urge" && b.parentArcBuildId === id) ?? null;
      setLinkedMini(found);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function startBuildingLinkedMini() {
    if (!existingMeta) return;
    // Pre-fills from THIS UrgeArc's own compatible values (spec section
    // 9: "may reuse compatible parent values... but must NOT copy the
    // entire full protocol") -- the trainee still fills in presenceColor
    // and reviews/edits the rest before saving. Phase 3: the Mini's own
    // primary Encoding action pre-fills from the parent's own
    // primaryMiniArcEncodingAction (not the Full protocol's own
    // visual/bodily Encoding pair, which stays Full-only).
    setMiniDraft(
      createLinkedMiniArcDraft(draft.name, "", draft.regulationAnchor, draft.primaryMiniArcEncodingAction, draft.beneficialAlternativeAction)
    );
    setMiniSecondaryEncodingAction(draft.secondaryMiniArcEncodingAction);
    setMiniActionDurationMinutes("");
  }

  async function handleSaveLinkedMini() {
    if (!miniDraft || !existingMeta) return;
    if (!isMiniArcDraftComplete(miniDraft)) {
      setMiniSaveError("יש למלא שם, צבע נוכחות, עוגן ויסות, פעולת קידוד ופעולה מיטיבה לפני השמירה.");
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
        protocolKind: "urge",
        preventiveStoppingAction: draft.stopCue.trim().length > 0 ? draft.stopCue : null,
        // Phase 3: inherits the Full protocol's own BUILD-configured
        // representation preference unless the trainee wants LIVE to
        // decide fresh each session -- never copies the Full protocol's
        // own visual/bodily Encoding pair, only this one preference.
        representationPreference: draft.representationPreference !== "decide_in_live" ? draft.representationPreference : null,
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
    if (!isUrgeArcDraftComplete(draft)) {
      setSaveError("יש למלא שם, פעולה מפריעה, עוגן ויסות ופעולה מיטיבה חלופית לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const urgeArc = buildUrgeArcFromDraft(draft, existingMeta?.id ?? generateUrgeArcId(), existingMeta?.createdAt ?? now, now);
      await upsertUrgeArc(urgeArc);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ה-Urge ARC. נסה שוב.");
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
          <Text style={styles.title}>ה-Urge ARC לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/urge-arcs")}>
            <Text style={styles.buttonText}>חזרה לרשימת ה-Urge ARC</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const complete = isUrgeArcDraftComplete(draft);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "Urge ARC חדש" : "עריכת Urge ARC"}</Text>

        <Text style={styles.question}>איך תרצה לקרוא לדחף הזה?</Text>
        <TextInput
          style={styles.textInput}
          value={draft.name}
          onChangeText={(value) => setDraft({ ...draft, name: value })}
          textAlign="right"
          placeholder="לדוגמה: דחף לעישון"
        />

        <Text style={styles.question}>מהי הפעולה/ההרגל המפריעים?</Text>
        <TextInput
          style={styles.textInput}
          value={draft.interferingAction}
          onChangeText={(value) => setDraft({ ...draft, interferingAction: value })}
          textAlign="right"
          placeholder="לדוגמה: להדליק סיגריה"
          multiline
        />

        <Text style={styles.question}>אילו טריגרים בדרך כלל מפעילים את הדחף הזה? (רשות, מופרדים בפסיק)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.mappedTriggers}
          onChangeText={(value) => setDraft({ ...draft, mappedTriggers: value })}
          textAlign="right"
          placeholder="לדוגמה: לחץ בעבודה, שעת הפסקה"
        />

        <Text style={styles.question}>אילו צרכים עומדים בדרך כלל מאחורי הדחף הזה? (רשות, מופרדים בפסיק)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.underlyingNeeds}
          onChangeText={(value) => setDraft({ ...draft, underlyingNeeds: value })}
          textAlign="right"
          placeholder="לדוגמה: רגיעה, הפוגה"
        />

        <Text style={styles.question}>פעולת עצירה (רשות)</Text>
        <Text style={styles.helperText}>פעולה קצרה שעוזרת לעצור את המשך הפעולה האוטומטית וליצור מרווח לבחירה.</Text>
        <TextInput
          style={styles.textInput}
          value={draft.stopCue}
          onChangeText={(value) => setDraft({ ...draft, stopCue: value })}
          textAlign="right"
          placeholder="לדוגמה: להניח את הטלפון / להרחיק את היד / לעצור לרגע במקום / לצאת מהאפליקציה"
          multiline
        />

        <Text style={styles.question}>באיזה עוגן ויסות תרצה להשתמש?</Text>
        <TextInput
          style={styles.textInput}
          value={draft.regulationAnchor}
          onChangeText={(value) => setDraft({ ...draft, regulationAnchor: value })}
          textAlign="right"
          placeholder="לדוגמה: הרגש את כפות הרגליים על הקרקע."
          multiline
        />

        <Text style={styles.sectionHeader}>קידוד (Encoding)</Text>

        <Text style={styles.question}>רמז שפת גוף לקידוד (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.bodyLanguageCue}
          onChangeText={(value) => setDraft({ ...draft, bodyLanguageCue: value })}
          textAlign="right"
          placeholder="לדוגמה: כתפיים רפויות, מבט קדימה"
          multiline
        />

        <Text style={styles.question}>מנטרה קצרה לקידוד (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.encodingMantra}
          onChangeText={(value) => setDraft({ ...draft, encodingMantra: value })}
          textAlign="right"
          placeholder="לדוגמה: אני בוחר"
          multiline
        />

        {/*
          Phase 3 (Full + Mini ARC Urge representation encoding), spec
          section 19: the full "Urge representation preference" block --
          every field here is optional/backward-compatible (a legacy
          UrgeArc simply has all of these as null, falling back to
          "decide in LIVE"/generic Encoding, per arc/urgeLive.ts).
        */}
        <Text style={styles.sectionHeader}>אופן הופעת הדחף וקידוד מותאם</Text>
        <Text style={styles.helperText}>
          כיצד הדחף הזה בדרך כלל מופיע אצלך -- דימוי, תחושה בגוף, שניהם, או שתרצה להחליט בזמן אמת בכל תרגול.
        </Text>
        <View style={styles.chipRow}>
          {(
            [
              { value: "visual", label: "דימוי" },
              { value: "bodily", label: "תחושה בגוף" },
              { value: "both", label: "גם וגם" },
              { value: "decide_in_live", label: "להחליט בזמן אמת" },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.value}
              style={[styles.chip, draft.representationPreference === option.value && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, representationPreference: option.value })}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.question}>פעולת קידוד לדימוי (רשות)</Text>
        <Text style={styles.helperText}>לדוגמה: להקטין ולהרחיק את התמונה, להפחית בהירות, להאט תנועה.</Text>
        <TextInput
          style={styles.textInput}
          value={draft.visualEncodingAction}
          onChangeText={(value) => setDraft({ ...draft, visualEncodingAction: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>תמונה חלופית רצויה (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.alternativeDesiredImage}
          onChangeText={(value) => setDraft({ ...draft, alternativeDesiredImage: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>פעולת קידוד לתחושת גוף (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.bodilyEncodingAction}
          onChangeText={(value) => setDraft({ ...draft, bodilyEncodingAction: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>תחושת גוף רצויה (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.desiredBodilySensation}
          onChangeText={(value) => setDraft({ ...draft, desiredBodilySensation: value })}
          textAlign="right"
          multiline
        />

        <Pressable
          style={styles.toggleRow}
          onPress={() => setDraft({ ...draft, allowBothEncodingActions: !draft.allowBothEncodingActions })}
        >
          <Text style={styles.question}>{draft.allowBothEncodingActions ? "☑" : "☐"} לאפשר ביצוע שתי פעולות הקידוד יחד כש"גם וגם" נבחר</Text>
        </Pressable>

        <Text style={styles.question}>פעולת קידוד קבועה כשהתשובה "לא בטוח" (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.standardFallbackEncodingAction}
          onChangeText={(value) => setDraft({ ...draft, standardFallbackEncodingAction: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>פעולת קידוד ראשית ל-ARC Mini Urge (רשות)</Text>
        <Text style={styles.helperText}>ערך ברירת מחדל שממנו ARC Mini Urge המקושר יתחיל -- ניתן לערוך לאחר מכן בנפרד.</Text>
        <TextInput
          style={styles.textInput}
          value={draft.primaryMiniArcEncodingAction}
          onChangeText={(value) => setDraft({ ...draft, primaryMiniArcEncodingAction: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>פעולת קידוד משנית ל-ARC Mini Urge (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.secondaryMiniArcEncodingAction}
          onChangeText={(value) => setDraft({ ...draft, secondaryMiniArcEncodingAction: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.sectionHeader}>מנטרות (רשות)</Text>
        <Text style={styles.question}>מנטרת שהייה</Text>
        <TextInput
          style={styles.textInput}
          value={draft.stayMantra}
          onChangeText={(value) => setDraft({ ...draft, stayMantra: value })}
          textAlign="right"
        />
        <Text style={styles.question}>מנטרת קבלה</Text>
        <TextInput
          style={styles.textInput}
          value={draft.acceptanceMantra}
          onChangeText={(value) => setDraft({ ...draft, acceptanceMantra: value })}
          textAlign="right"
        />
        <Text style={styles.question}>מנטרת ויסות</Text>
        <TextInput
          style={styles.textInput}
          value={draft.regulationMantra}
          onChangeText={(value) => setDraft({ ...draft, regulationMantra: value })}
          textAlign="right"
        />
        <Text style={styles.question}>מנטרת גשר (בסוף הוויסות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.bridgeMantra}
          onChangeText={(value) => setDraft({ ...draft, bridgeMantra: value })}
          textAlign="right"
        />

        <Text style={styles.question}>הערות לקבלה של הדחף, בלי להילחם בו (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={draft.acceptanceContent}
          onChangeText={(value) => setDraft({ ...draft, acceptanceContent: value })}
          textAlign="right"
          multiline
        />

        <Text style={styles.question}>מהי הפעולה המיטיבה החלופית שתגשר אל פרוטוקול הזהות?</Text>
        <TextInput
          style={styles.textInput}
          value={draft.beneficialAlternativeAction}
          onChangeText={(value) => setDraft({ ...draft, beneficialAlternativeAction: value })}
          textAlign="right"
          placeholder="לדוגמה: לשתות כוס מים ולצאת להליכה קצרה"
          multiline
        />

        {!complete && <Text style={styles.errorText}>יש למלא שם, פעולה מפריעה, עוגן ויסות ופעולה מיטיבה חלופית לפני השמירה.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <Pressable
          style={[styles.button, styles.fullWidthButton, !complete && styles.buttonDisabled]}
          disabled={!complete}
          onPress={handleSave}
        >
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>

        {/*
          Build ARC Mini together with full ARC task (spec sections 9-10):
          "בניית ARC Mini" lives on the SAME BUILD page as the full
          protocol -- the trainee never leaves this screen to build the
          linked Mini. Shown only for an already-saved Urge ARC (a new,
          unsaved one has no id yet to link a Mini to). "בניית ARC Link"/
          "בניית ARC Mini Link" sections are deferred infrastructure here
          -- see this Phase's own report for what remains.
        */}
        {existingMeta && (
          <>
            <Text style={styles.sectionHeader}>בניית ARC Mini</Text>
            <Text style={styles.helperText}>צור גרסה קצרה של הפרוטוקול לשימוש מהיר בזמן אמת.</Text>

            {linkedMini && !miniDraft && (
              <View style={styles.miniCard}>
                <Text style={styles.miniCardTitle}>{linkedMini.name}</Text>
                <Text style={styles.miniCardRow}>ה-ARC Mini הזה כבר מקושר ל-Urge ARC הזה.</Text>
                <Pressable
                  style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
                  onPress={() => router.push({ pathname: "/mini-arc/[id]", params: { id: linkedMini.id } })}
                >
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
                <TextInput
                  style={styles.textInput}
                  value={miniDraft.name}
                  onChangeText={(value) => setMiniDraft({ ...miniDraft, name: value })}
                  textAlign="right"
                />

                <Text style={styles.question}>צבע נוכחות</Text>
                <TextInput
                  style={styles.textInput}
                  value={miniDraft.presenceColor}
                  onChangeText={(value) => setMiniDraft({ ...miniDraft, presenceColor: value })}
                  textAlign="right"
                  placeholder="לדוגמה: אדום"
                />

                <Text style={styles.question}>עוגן ויסות</Text>
                <TextInput
                  style={styles.textInput}
                  value={miniDraft.regulationAnchor}
                  onChangeText={(value) => setMiniDraft({ ...miniDraft, regulationAnchor: value })}
                  textAlign="right"
                  multiline
                />

                <Text style={styles.question}>פעולת קידוד קצרה</Text>
                <TextInput
                  style={styles.textInput}
                  value={miniDraft.encodingAction}
                  onChangeText={(value) => setMiniDraft({ ...miniDraft, encodingAction: value })}
                  textAlign="right"
                  multiline
                />

                <Text style={styles.question}>פעולה מיטיבה</Text>
                <TextInput
                  style={styles.textInput}
                  value={miniDraft.beneficialAction}
                  onChangeText={(value) => setMiniDraft({ ...miniDraft, beneficialAction: value })}
                  textAlign="right"
                  multiline
                />

                <Text style={styles.question}>פעולת קידוד משנית (רשות)</Text>
                <Text style={styles.helperText}>מעבר מהיר בין הפעולה הראשית לפעולה המשנית, רק כשאופן הופעת הדחף הוא "גם וגם" -- אף פעם לא חובה.</Text>
                <TextInput
                  style={styles.textInput}
                  value={miniSecondaryEncodingAction}
                  onChangeText={setMiniSecondaryEncodingAction}
                  textAlign="right"
                  multiline
                />

                <Text style={styles.question}>משך פעולה מיטיבה בדקות (רשות)</Text>
                <TextInput
                  style={styles.textInput}
                  value={miniActionDurationMinutes}
                  onChangeText={setMiniActionDurationMinutes}
                  textAlign="right"
                  keyboardType="numeric"
                  placeholder="לדוגמה: 2"
                />

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

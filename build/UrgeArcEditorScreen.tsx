import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getUrgeArc, upsertUrgeArc } from "../data/storage.ts";
import {
  buildUrgeArcFromDraft,
  createEmptyUrgeArcDraft,
  draftFromUrgeArc,
  isUrgeArcDraftComplete,
} from "../arc/urgeArcs.ts";
import type { UrgeArcDraft } from "../arc/urgeArcs.ts";
import { generateUrgeArcId } from "../arc/types.ts";

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
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

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
});

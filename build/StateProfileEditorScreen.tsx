import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getStateProfile, upsertStateProfile } from "../data/storage.ts";
import { createEmptyStateProfile, generateStateProfileId, isStateProfileSaveable } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";

const NATURAL_BREATHING_GUIDANCE = "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.";

/**
 * build/StateProfileEditorScreen.tsx (route: /state-profiles/[id], id="new" to create)
 *
 * Adaptive ARC architecture task, Phase 10: ONE flat form over
 * StateProfile's own existing fields, grouped into four understandable
 * sections via CollapsibleSection -- never a new Draft schema (unlike
 * build/UrgeArcEditorScreen.tsx's own UrgeArcDraft, this screen holds a
 * real StateProfile directly as its local state, since
 * createEmptyStateProfile already produces a fully valid, saveable
 * shape with nothing extra to translate).
 *
 * Never exposes id/ownerProgramId/primaryIdentityProfileId/createdAt/
 * updatedAt/schemaVersion/status for manual editing -- every one of
 * those rides along unchanged in `profile` from load to save, touched
 * only by handleSave's own updatedAt bump. primaryIdentityProfileId
 * stays whatever it was loaded as (always null for a Phase 10-created
 * profile -- there is no Identity picker here; IdentityProfile BUILD is
 * a later phase) and ownerProgramId is always null for a brand-new
 * profile (see this screen's own createProfile, and arc/stateProfile.ts's
 * own doc on why it's never guessed for a profile created outside any
 * program context).
 *
 * Safety: this screen never asks the trainee to describe or intensify
 * an INTERFERING state -- every field here describes the DESIRED State
 * to strengthen. The natural-breathing field is framed with a fixed,
 * non-directive caption (NATURAL_BREATHING_GUIDANCE) that never
 * instructs the trainee to deepen, slow, or control their breathing --
 * matching arc/naturalBreathing.ts's own free-breathing convention.
 */
export default function StateProfileEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  // Phase 10: the id is generated exactly once, here, at initial mount --
  // React only ever runs a useState initializer once per component
  // instance, so this is never re-minted on re-render, retry, or repeated
  // Save taps.
  const [profile, setProfile] = useState<StateProfile>(() => createEmptyStateProfile(generateStateProfileId(), "", null, new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getStateProfile(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setProfile(existing);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function updateField<K extends keyof StateProfile>(key: K, value: StateProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateDurationMinutesText(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      updateField("actionTimerConfig", null);
      return;
    }
    const parsed = Number(trimmed);
    updateField("actionTimerConfig", { durationMinutes: Number.isFinite(parsed) ? parsed : Number.NaN });
  }

  async function handleSave() {
    if (saving || !isStateProfileSaveable(profile)) return;
    setSaveError(null);
    setSaving(true);
    try {
      await upsertStateProfile({ ...profile, updatedAt: new Date().toISOString() });
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת המצב הרצוי. נסה שוב.");
      setSaving(false);
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
          <Text style={styles.title}>המצב הרצוי לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const durationMinutesText = profile.actionTimerConfig?.durationMinutes != null ? String(profile.actionTimerConfig.durationMinutes) : "";
  const canSave = isStateProfileSaveable(profile) && !saving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "מצב רצוי חדש" : "עריכת מצב רצוי"}</Text>

        <Field label="שם המצב (חובה)" value={profile.name} onChangeText={(text) => updateField("name", text)} placeholder="לדוגמה: רוגע יציב" />
        <Field
          label="תיאור"
          value={profile.description ?? ""}
          onChangeText={(text) => updateField("description", text.trim().length > 0 ? text : null)}
          placeholder="תיאור כללי של המצב הזה"
          multiline
        />
        <Field
          label="מטרה תפקודית"
          value={profile.purpose ?? ""}
          onChangeText={(text) => updateField("purpose", text.trim().length > 0 ? text : null)}
          placeholder="במה המצב הזה עוזר לך?"
          multiline
        />

        <Section title="ויסות והתגלמות" subtitle="איך תרצה להרגיש ולהיות בגוף במצב הרצוי הזה -- לעולם לא תיאור של המצב המפריע.">
          <Field label="מנטרה" value={profile.stateMantra ?? ""} onChangeText={(text) => updateField("stateMantra", text.trim().length > 0 ? text : null)} placeholder="משפט קצר לחיזוק המצב" />
          <Field
            label="עוגן ויסות"
            value={profile.regulationAnchor ?? ""}
            onChangeText={(text) => updateField("regulationAnchor", text.trim().length > 0 ? text : null)}
            placeholder="פעולה או מוקד קשב שמסייע לוויסות"
          />
          <Field
            label="רמז שפת גוף"
            value={profile.bodyLanguageCue ?? ""}
            onChangeText={(text) => updateField("bodyLanguageCue", text.trim().length > 0 ? text : null)}
            placeholder="יציבה או תנוחה"
          />
          <Field label="רמז מבט" value={profile.gazeCue ?? ""} onChangeText={(text) => updateField("gazeCue", text.trim().length > 0 ? text : null)} placeholder="לאן/איך להביט" />
          <Text style={styles.guidanceText}>{NATURAL_BREATHING_GUIDANCE}</Text>
          <Field
            label="מודעות לנשימה טבעית"
            value={profile.naturalBreathingAwareness ?? ""}
            onChangeText={(text) => updateField("naturalBreathingAwareness", text.trim().length > 0 ? text : null)}
            placeholder="הערה אישית (רשות) -- לעולם לא הנחיה להעמיק, להאט או לשלוט בנשימה"
            multiline
          />
          <Field
            label="תחושה גופנית רצויה"
            value={profile.desiredBodySensation ?? ""}
            onChangeText={(text) => updateField("desiredBodySensation", text.trim().length > 0 ? text : null)}
            placeholder="איך התחושה הרצויה מורגשת בגוף"
          />
          <Field
            label="מיקום התחושה בגוף"
            value={profile.bodySensationLocation ?? ""}
            onChangeText={(text) => updateField("bodySensationLocation", text.trim().length > 0 ? text : null)}
            placeholder="היכן בגוף מורגשת התחושה הרצויה"
          />
          <Field
            label="צבע אנרגיה או דימוי"
            value={profile.energyColor ?? ""}
            onChangeText={(text) => updateField("energyColor", text.trim().length > 0 ? text : null)}
            placeholder="צבע או דימוי שמייצג את המצב הרצוי"
          />
        </Section>

        <Section title="קידוד" subtitle="הרמז והפעולה שמחזקים את המצב הרצוי בזמן אמת.">
          <Field label="רמז קידוד" value={profile.encodingCue ?? ""} onChangeText={(text) => updateField("encodingCue", text.trim().length > 0 ? text : null)} placeholder="רמז קצר לקידוד המצב" />
          <Field label="פעולה" value={profile.action ?? ""} onChangeText={(text) => updateField("action", text.trim().length > 0 ? text : null)} placeholder="פעולה מיטיבה שמבטאת את המצב הרצוי" multiline />
        </Section>

        <Section title="טיימר פעולה" subtitle="משך זמן (בדקות) לפעולה, אם רלוונטי -- ריק פירושו ללא הגבלת זמן.">
          <Field label="משך בדקות (רשות)" value={durationMinutesText} onChangeText={updateDurationMinutesText} placeholder="לדוגמה: 5" keyboardType="numeric" />
        </Section>

        {profile.name.trim().length === 0 && <Text style={styles.errorText}>יש להזין שם למצב הרצוי לפני השמירה.</Text>}
        {profile.name.trim().length > 0 && !isStateProfileSaveable(profile) && (
          <Text style={styles.errorText}>משך הזמן שהוזן אינו תקין -- יש להזין מספר חיובי או להשאיר את השדה ריק.</Text>
        )}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        <Text style={styles.helperText}>אפשר לשמור מצב עם שם בלבד ולהשלים את שאר הפרטים מאוחר יותר -- זה עדיין לא אומר שהמצב מוכן לתרגול LIVE.</Text>

        <Pressable style={[styles.button, styles.fullWidthButton, !canSave && styles.buttonDisabled]} disabled={!canSave} onPress={handleSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>ביטול</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.textInput, multiline && styles.textInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        textAlign="right"
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  section: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#E6F4FE", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  guidanceText: { fontSize: 13, textAlign: "right", color: "#1a6b4a", marginBottom: 6, fontStyle: "italic" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  textInputMultiline: { minHeight: 70, textAlignVertical: "top" },
  helperText: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 16 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  cancelButton: { marginTop: 14, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

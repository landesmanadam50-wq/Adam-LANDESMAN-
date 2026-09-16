import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getInterferenceItem, loadStateProfiles, upsertInterferenceItem } from "../data/storage.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
  generateInterferenceItemId,
  isInterferenceItemCompleteForPractice,
  isInterferenceItemSaveable,
  upgradeInterferenceItemToActionModelV2,
} from "../arc/interferenceItem.ts";
import type { InterferenceCategory, InterferenceItem, InterferenceUrgeRepresentation } from "../arc/interferenceItem.ts";
import { isLibraryItemEnabled } from "../arc/libraryItemStatus.ts";
import type { StateProfile } from "../arc/stateProfile.ts";

/**
 * Adaptive ARC architecture task, Phase 14B-2: shown for every
 * Thought/Belief/Urge category (never Emotion -- its final action IS the
 * required ARC State action, see arc/interferenceItem.ts's own
 * EmotionInterferenceItem doc), regardless of schemaVersion -- a v1
 * record's own beneficialActionAgainstFactor, once filled in, is already
 * honored by arc/factorAction.ts's resolver exactly like a v2 record's;
 * only the "not ready without it" framing differs (a v2 record needs it,
 * a v1 record may still fall back to a route's State action).
 */
const FACTOR_ACTION_CATEGORIES: InterferenceCategory[] = ["thought", "belief", "urge"];

const CATEGORY_LABELS: Record<InterferenceCategory, string> = {
  thought: "מחשבה",
  belief: "אמונה",
  urge: "דחף",
  emotion: "רגש",
};

const CATEGORY_OPTIONS: { value: InterferenceCategory; label: string }[] = [
  { value: "thought", label: "מחשבה" },
  { value: "belief", label: "אמונה" },
  { value: "emotion", label: "רגש" },
  { value: "urge", label: "דחף" },
];

const REPRESENTATION_OPTIONS: { value: InterferenceUrgeRepresentation; label: string }[] = [
  { value: "visual", label: "חזותי" },
  { value: "sensory", label: "תחושתי" },
  { value: "both", label: "גם וגם" },
  { value: "decide_in_live", label: "להחליט בזמן אמת" },
];

/**
 * build/InterferenceItemEditorScreen.tsx (route: /interference-items/[id], id="new" to create)
 *
 * Adaptive ARC architecture task, Phase 11: ONE flat form over an
 * InterferenceItem's own existing fields, adapting to its category
 * (Thought/Belief/Emotion/Urge -- Presence is deliberately not a member
 * of InterferenceCategory, see arc/interferenceItem.ts's own module
 * doc). Never a new Draft schema -- exactly like
 * build/StateProfileEditorScreen.tsx (Phase 10), this screen holds a
 * real InterferenceItem directly as its local state, since each
 * createEmptyXInterferenceItem factory already produces a fully valid,
 * saveable shape.
 *
 * Category is chosen ONCE, before the record exists at all (a fresh
 * "new" entry starts at the category chooser below) -- InterferenceItem
 * is a discriminated union, so an existing record's category can never
 * be changed afterward; the editor shows it as a fixed, read-only label
 * once a record exists.
 *
 * Never exposes id/ownerProgramId/schemaVersion/createdAt/updatedAt/
 * status for manual editing. identityProfileIdOverride stays whatever
 * it was loaded as (always null for a Phase-11-created item -- there is
 * no Identity picker here; IdentityProfile BUILD is a later phase, so
 * no proper picker for it exists yet). alternativeStateProfileIds and
 * miniOverride are likewise left untouched by this screen -- out of
 * scope for this phase (see this task's own approved boundary).
 * primaryStateProfileId DOES get a proper picker below (a chip list
 * over Phase 10's now-existing loadStateProfiles), since that relationship
 * can be selected safely and meaningfully today.
 */
export default function InterferenceItemEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "choosingCategory" | "ready">(isNew ? "choosingCategory" : "loading");
  const [item, setItem] = useState<InterferenceItem | null>(null);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Phase 11: the id is generated exactly once, here, at initial mount --
  // React only ever runs a useState initializer once per component
  // instance -- and reused for whichever category the trainee ends up
  // choosing on the "new" flow below.
  const [pendingId] = useState(() => generateInterferenceItemId());
  const [pendingNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    loadStateProfiles()
      .then((profiles) => setStateProfiles(profiles.filter(isLibraryItemEnabled)))
      .catch(() => setStateProfiles([]));
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getInterferenceItem(id).then((existing) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setItem(existing);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function chooseCategory(category: InterferenceCategory) {
    const factory = {
      thought: createEmptyThoughtInterferenceItem,
      belief: createEmptyBeliefInterferenceItem,
      urge: createEmptyUrgeInterferenceItem,
      emotion: createEmptyEmotionInterferenceItem,
    }[category];
    setItem(factory(pendingId, "", null, pendingNow));
    setStatus("ready");
  }

  // InterferenceItem is a discriminated union -- keyof InterferenceItem
  // only ever includes the fields common to every category
  // (InterferenceItemBase + category), which is too narrow for a single
  // generic setter to cover every category-specific field below. This
  // function accepts a plain patch object instead (e.g.
  // updateField({ thoughtText: text })) -- always merged onto the
  // currently loaded item, never touching any field not named in the
  // patch, and always re-asserted back to InterferenceItem since the
  // merge itself never changes `category`.
  function updateField(patch: Record<string, string | boolean | null>) {
    setItem((current) => (current ? ({ ...current, ...patch } as InterferenceItem) : current));
  }

  async function handleSave() {
    if (!item || saving || !isInterferenceItemSaveable(item)) return;
    setSaveError(null);
    setSaving(true);
    try {
      await upsertInterferenceItem({ ...item, updatedAt: new Date().toISOString() });
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת הפריט. נסה שוב.");
      setSaving(false);
    }
  }

  /**
   * Adaptive ARC architecture task, Phase 14B-2: the EXPLICIT upgrade
   * action -- applies upgradeInterferenceItemToActionModelV2 to local
   * state only; the coach still presses the ordinary Save button
   * afterward. Never fires from loading the screen or editing any other
   * field.
   */
  function handleUpgradeToActionModelV2() {
    setItem((current) => (current ? upgradeInterferenceItemToActionModelV2(current, new Date().toISOString()) : current));
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
          <Text style={styles.title}>הפריט לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "choosingCategory") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>סוג ההפרעה</Text>
          <Text style={styles.helperText}>באיזה סוג פריט תרצה לעבוד?</Text>
          {CATEGORY_OPTIONS.map((option) => (
            <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => chooseCategory(option.value)}>
              <Text style={styles.buttonText}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "ready"
  const current = item as InterferenceItem;
  const canSave = isInterferenceItemSaveable(current) && !saving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{CATEGORY_LABELS[current.category]}</Text>
        <Text style={styles.title}>{isNew ? "פריט הפרעה חדש" : "עריכת פריט הפרעה"}</Text>

        <Field label="שם (חובה)" value={current.name} onChangeText={(text) => updateField({ name: text })} placeholder="שם קצר לפריט" />
        <Field
          label="תיאור"
          value={current.description ?? ""}
          onChangeText={(text) => updateField({ description: text.trim().length > 0 ? text : null })}
          placeholder="תיאור כללי"
          multiline
        />
        <Field
          label="הקשר או מצב שבו זה מופיע"
          value={current.situationContext ?? ""}
          onChangeText={(text) => updateField({ situationContext: text.trim().length > 0 ? text : null })}
          placeholder="מתי או איפה זה נוטה להופיע"
        />
        <Field
          label="מה בדרך כלל מפעיל את זה"
          value={current.triggerInfo ?? ""}
          onChangeText={(text) => updateField({ triggerInfo: text.trim().length > 0 ? text : null })}
          placeholder="טריגר אופייני"
        />

        {current.category === "thought" && (
          <Section title="מחשבה">
            <Field
              label="המחשבה המפריעה"
              value={current.thoughtText ?? ""}
              onChangeText={(text) => updateField({ thoughtText: text.trim().length > 0 ? text : null })}
              placeholder="נוסח המחשבה"
              multiline
            />
            <Field
              label="משפט קבלה"
              value={current.acceptanceMantra ?? ""}
              onChangeText={(text) => updateField({ acceptanceMantra: text.trim().length > 0 ? text : null })}
              placeholder="משפט קצר לקבלת נוכחות המחשבה"
            />
            <Field
              label="פרשנות חלופית או מחשבה מחליפה"
              value={current.alternativeInterpretation ?? ""}
              onChangeText={(text) => updateField({ alternativeInterpretation: text.trim().length > 0 ? text : null })}
              placeholder="פרשנות מאוזנת יותר"
              multiline
            />
            <LegacyRegulationNote value={current.regulationCue} />
            <Field
              label="רמז הנהון"
              value={current.existingNodCue ?? ""}
              onChangeText={(text) => updateField({ existingNodCue: text.trim().length > 0 ? text : null })}
              placeholder="רמז הנהון עדין (רשות)"
            />
            <FactorActionField item={current} updateField={updateField} onUpgrade={handleUpgradeToActionModelV2} />
          </Section>
        )}

        {current.category === "belief" && (
          <Section title="אמונה">
            <Field
              label="האמונה"
              value={current.beliefText ?? ""}
              onChangeText={(text) => updateField({ beliefText: text.trim().length > 0 ? text : null })}
              placeholder="נוסח האמונה"
              multiline
            />
            <Field
              label="אמונה תומכת או חלופית"
              value={current.supportiveBelief ?? ""}
              onChangeText={(text) => updateField({ supportiveBelief: text.trim().length > 0 ? text : null })}
              placeholder="אמונה מאוזנת יותר"
              multiline
            />
            <LegacyRegulationNote value={current.regulationCue} />
            <FactorActionField item={current} updateField={updateField} onUpgrade={handleUpgradeToActionModelV2} />
          </Section>
        )}

        {current.category === "emotion" && (
          <Section title="רגש">
            <Field
              label="שם הרגש"
              value={current.emotionName ?? ""}
              onChangeText={(text) => updateField({ emotionName: text.trim().length > 0 ? text : null })}
              placeholder="לדוגמה: תסכול"
            />
            <Text style={styles.helperText}>רגש תמיד מקושר למצב רצוי -- הפעולה הסופית שלו היא פעולת המצב הרצוי עצמה, ללא פעולה נפרדת מול הגורם המפריע.</Text>
            <LegacyRegulationNote value={current.regulationCue} />
          </Section>
        )}

        {current.category === "urge" && (
          <Section title="דחף">
            <Field
              label="שם או סוג הדחף"
              value={current.urgeName ?? ""}
              onChangeText={(text) => updateField({ urgeName: text.trim().length > 0 ? text : null })}
              placeholder="לדוגמה: דחף לעישון"
            />
            <Field
              label="פעולת עצירה מונעת"
              value={current.preventiveStoppingAction ?? ""}
              onChangeText={(text) => updateField({ preventiveStoppingAction: text.trim().length > 0 ? text : null })}
              placeholder="פעולה שעוצרת את הדחף מבעוד מועד"
            />
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>אופן ייצוג הדחף</Text>
              <View style={styles.chipRow}>
                {REPRESENTATION_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, current.representationPreference === option.value && styles.chipSelected]}
                    onPress={() => updateField({ representationPreference: option.value })}
                  >
                    <Text style={styles.chipText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Field
              label="קידוד חזותי קיים"
              value={current.visualEncodingConfig ?? ""}
              onChangeText={(text) => updateField({ visualEncodingConfig: text.trim().length > 0 ? text : null })}
              placeholder="תיאור חזותי לקידוד (רשות)"
            />
            <Field
              label="קידוד תחושתי קיים"
              value={current.sensoryEncodingConfig ?? ""}
              onChangeText={(text) => updateField({ sensoryEncodingConfig: text.trim().length > 0 ? text : null })}
              placeholder="תיאור תחושתי לקידוד (רשות)"
            />
            <LegacyRegulationNote value={current.regulationAnchor} />
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>אפשר בדיקה חוזרת?</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, current.recheckEnabled && styles.chipSelected]} onPress={() => updateField({ recheckEnabled: true })}>
                  <Text style={styles.chipText}>כן</Text>
                </Pressable>
                <Pressable style={[styles.chip, !current.recheckEnabled && styles.chipSelected]} onPress={() => updateField({ recheckEnabled: false })}>
                  <Text style={styles.chipText}>לא</Text>
                </Pressable>
              </View>
            </View>
            {current.recheckEnabled && (
              <Field
                label="שאלת הבדיקה החוזרת"
                value={current.recheckPrompt ?? ""}
                onChangeText={(text) => updateField({ recheckPrompt: text.trim().length > 0 ? text : null })}
                placeholder="שאלה לבדיקה חוזרת"
              />
            )}
            <FactorActionField item={current} updateField={updateField} onUpgrade={handleUpgradeToActionModelV2} />
          </Section>
        )}

        {/*
          Adaptive ARC architecture task, Phase 14B-2: legacy applicability
          metadata ONLY -- read-only, never the way to decide whether ARC
          State participates in a combined route. The route-level
          stateInclusionPolicy/stateProfileId (arc/personalDevelopmentRouteConfig.ts,
          configured in the new route editor) is the actual, authoritative
          State control; this section never writes to primaryStateProfileId
          and every existing stored id is preserved untouched through
          ordinary saves.
        */}
        {(current.primaryStateProfileId || current.alternativeStateProfileIds.length > 0) && (
          <Section title="קישור למצב רצוי -- מידע ישן (לקריאה בלבד)">
            <Text style={styles.helperText}>
              זהו קישור היסטורי בין הפריט למצב רצוי. הוא אינו קובע האם מצב רצוי ישתתף במסלול תרגול משולב -- זה נקבע בעורך תצורת המסלול.
            </Text>
            {[current.primaryStateProfileId, ...current.alternativeStateProfileIds]
              .filter((id): id is string => Boolean(id))
              .map((id) => (
                <Text key={id} style={styles.legacyNote}>
                  {stateProfiles.find((profile) => profile.id === id)?.name ?? id}
                </Text>
              ))}
          </Section>
        )}

        {current.name.trim().length === 0 && <Text style={styles.errorText}>יש להזין שם לפני השמירה.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        <Text style={styles.helperText}>אפשר לשמור פריט עם שם בלבד ולהשלים את שאר הפרטים מאוחר יותר -- זה עדיין לא אומר שהפריט מוכן לתרגול LIVE.</Text>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
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
      />
    </View>
  );
}

/**
 * Adaptive ARC architecture task, Phase 14B-2: read-only display of a
 * legacy general-regulation value -- never rendered as an editable
 * TextInput any more (see this file's own removal of the old "רמז ויסות"/
 * "עוגן ויסות" fields), never erased by an unrelated save (the value
 * simply rides through unchanged since nothing writes to this key
 * anymore), never relabeled as ARC State regulation, never copied onto
 * any StateProfile. Renders nothing at all when there is no legacy value
 * to show.
 */
function LegacyRegulationNote({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>ערך ויסות ישן (לקריאה בלבד)</Text>
      <Text style={styles.legacyNote}>{value}</Text>
    </View>
  );
}

type FactorActionBearingItem = Extract<InterferenceItem, { category: "thought" | "belief" | "urge" }>;

/**
 * Adaptive ARC architecture task, Phase 14B-2: "פעולה מיטיבה מול הגורם
 * המפריע" -- shown for every Thought/Belief/Urge item, any schemaVersion.
 * A schemaVersion-2 item without this is flagged as not ready for LIVE
 * practice (never blocking Save); a schemaVersion-1 (legacy) item gets a
 * softer note plus an explicit, one-tap upgrade action -- upgrading never
 * fires from merely opening or saving this screen.
 */
function FactorActionField({ item, updateField, onUpgrade }: { item: FactorActionBearingItem; updateField: (patch: Record<string, string | boolean | null>) => void; onUpgrade: () => void }) {
  // hasResolvableStateAction is conservatively false here -- this screen has
  // no route context (a route's own State readiness is a
  // PersonalDevelopmentRouteConfig-level concern, see arc/personalDevelopmentRouteConfigReadiness.ts),
  // so this only ever reflects whether the item has its OWN action -- never
  // over-claims readiness a route might not actually deliver.
  const hasOwnAction = isInterferenceItemCompleteForPractice(item, false);
  return (
    <View style={styles.section}>
      <Field
        label="פעולה מיטיבה מול הגורם המפריע"
        value={item.beneficialActionAgainstFactor ?? ""}
        onChangeText={(text) => updateField({ beneficialActionAgainstFactor: text.trim().length > 0 ? text : null })}
        placeholder="התגובה החלופית והמיטיבה מול הגורם המפריע הזה"
        multiline
      />
      {item.schemaVersion >= 2 && !hasOwnAction && <Text style={styles.errorText}>פריט זה אינו מוכן לתרגול LIVE ללא פעולה מיטיבה מול הגורם המפריע.</Text>}
      {item.schemaVersion < 2 && (
        <View style={styles.legacyNoticeBox}>
          <Text style={styles.legacyNoticeText}>
            פריט זה נוצר לפי המודל הישן.
            {hasOwnAction ? " יש לו פעולה משלו." : " אם לא תוגדר כאן פעולה, בעת שימוש במסלול משולב עם מצב רצוי תשמש פעולת המצב הרצוי כברירת מחדל."}
          </Text>
          <Pressable style={styles.upgradeButton} onPress={onUpgrade}>
            <Text style={styles.upgradeButtonText}>שדרג למודל הפעולה החדש</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  helperText: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  section: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#E6F4FE", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 12 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  textInputMultiline: { minHeight: 70, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  legacyNote: { fontSize: 14, textAlign: "right", color: "#666", fontStyle: "italic" },
  legacyNoticeBox: { backgroundColor: "#FDF3D9", borderRadius: 10, padding: 12, marginTop: 4 },
  legacyNoticeText: { fontSize: 13, textAlign: "right", color: "#8a6d1a", lineHeight: 19, marginBottom: 8 },
  upgradeButton: { alignItems: "flex-end" },
  upgradeButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  cancelButton: { marginTop: 14, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

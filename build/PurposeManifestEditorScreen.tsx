import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  composeFutureMantra,
  createEmptyPurposeManifest,
  extractMantraSuffix,
  FOCUS_POINT_COLORS,
  FUTURE_MANTRA_PREFIX,
  generatePurposeManifestId,
  type PurposeManifest,
} from "../arc/purposeManifest.ts";
import { loadPurposeManifests, upsertPurposeManifest } from "../data/storage.ts";

/**
 * build/PurposeManifestEditorScreen.tsx (route /purpose-manifests/[id], id === "new" to create)
 *
 * Manifest Upgrade task, requirements 1-2: the full setup/edit form for
 * ONE PurposeManifest -- long-term goal, personal reason, personal
 * value, and exactly three future behaviors each with its own reason.
 * Same create/edit convention as build/TaskEditorScreen.tsx (local
 * draft state, explicit "שמירה", id === "new" means create).
 *
 * Final Manifest & Startup Popup Updates task: extended with three more,
 * all-optional fields -- a future mantra (always composed/decomposed via
 * composeFutureMantra/extractMantraSuffix, so it always keeps its fixed
 * "אני אצליח" prefix no matter what the trainee types), a focus-point
 * color picked from the fixed FOCUS_POINT_COLORS palette, and a free-text
 * future body movement. None of the three affects isPurposeManifestComplete
 * -- leaving them blank never excludes this manifest from daily selection.
 *
 * Editing an existing manifest never touches any OTHER manifest --
 * saves go through data/storage.ts's upsertPurposeManifest, which
 * upserts by id into the full list.
 */
export default function PurposeManifestEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [draft, setDraft] = useState<PurposeManifest | null>(null);
  const [loaded, setLoaded] = useState(isNew);

  useFocusEffect(
    useCallback(() => {
      if (isNew) {
        setDraft(createEmptyPurposeManifest(generatePurposeManifestId(), new Date().toISOString()));
        setLoaded(true);
        return;
      }
      loadPurposeManifests().then((manifests) => {
        const existing = manifests.find((candidate) => candidate.id === id);
        if (existing) setDraft(existing);
        setLoaded(true);
      });
    }, [id, isNew]),
  );

  async function handleSave() {
    if (!draft) return;
    const now = new Date().toISOString();
    await upsertPurposeManifest({ ...draft, updatedAt: now, createdAt: isNew ? now : draft.createdAt });
    router.back();
  }

  if (!loaded || !draft) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "מניפסט חדש" : "עריכת מניפסט"}</Text>

        <Field label="מה המטרה שלך לטווח הארוך?">
          <TextInput style={styles.textInput} value={draft.longTermGoal} onChangeText={(value) => setDraft({ ...draft, longTermGoal: value })} textAlign="right" multiline />
        </Field>

        <Field label="למה חשוב לך להשיג את המטרה הזאת?">
          <TextInput style={styles.textInput} value={draft.personalReason} onChangeText={(value) => setDraft({ ...draft, personalReason: value })} textAlign="right" multiline />
        </Field>

        <Field label="איזה ערך חשוב בחיים שלך המטרה הזאת מבטאת?">
          <TextInput style={styles.textInput} value={draft.personalValue} onChangeText={(value) => setDraft({ ...draft, personalValue: value })} textAlign="right" multiline />
        </Field>

        <Field label="איזה אדם אתה רוצה להיות באמצעות המטרה הזאת? (רשות)">
          <TextInput style={styles.textInput} value={draft.personalIdentity} onChangeText={(value) => setDraft({ ...draft, personalIdentity: value })} textAlign="right" multiline />
        </Field>

        <Text style={styles.sectionTitle}>שלוש התנהגויות של האדם שאתה רוצה להיות בעתיד</Text>
        {draft.behaviors.map((behavior, index) => (
          <View key={behavior.id} style={styles.behaviorBlock}>
            <Text style={styles.behaviorNumber}>{`התנהגות ${index + 1}`}</Text>
            <Field label="תאר את ההתנהגות">
              <TextInput
                style={styles.textInput}
                value={behavior.description}
                onChangeText={(value) => {
                  const behaviors = [...draft.behaviors] as PurposeManifest["behaviors"];
                  behaviors[index] = { ...behaviors[index], description: value };
                  setDraft({ ...draft, behaviors });
                }}
                textAlign="right"
                multiline
              />
            </Field>
            <Field label="למה חשוב לך להתנהג כך?">
              <TextInput
                style={styles.textInput}
                value={behavior.reason}
                onChangeText={(value) => {
                  const behaviors = [...draft.behaviors] as PurposeManifest["behaviors"];
                  behaviors[index] = { ...behaviors[index], reason: value };
                  setDraft({ ...draft, behaviors });
                }}
                textAlign="right"
                multiline
              />
            </Field>
          </View>
        ))}

        <Text style={styles.sectionTitle}>מנטרה לעתיד</Text>
        <Field label={`המנטרה מתחילה תמיד ב"${FUTURE_MANTRA_PREFIX}" -- אפשר להשלים אותה באופן אישי (רשות)`}>
          <View style={styles.mantraRow}>
            <Text style={styles.mantraPrefix}>{FUTURE_MANTRA_PREFIX}</Text>
            <TextInput
              style={[styles.textInput, styles.mantraInput]}
              value={extractMantraSuffix(draft.futureMantra)}
              onChangeText={(value) => setDraft({ ...draft, futureMantra: composeFutureMantra(value) })}
              textAlign="right"
              placeholder="להיות מאמן שמקשיב בתשומת לב ועוזר לאנשים להבין את עצמם"
              multiline
            />
          </View>
        </Field>

        <Text style={styles.sectionTitle}>נקודת מיקוד בצבע (רשות)</Text>
        <View style={styles.colorRow}>
          {FOCUS_POINT_COLORS.map((color) => (
            <Pressable
              key={color.id}
              style={[styles.colorSwatch, { backgroundColor: color.hex }, draft.focusPointColor === color.id && styles.colorSwatchSelected]}
              onPress={() => setDraft({ ...draft, focusPointColor: color.id })}
            />
          ))}
        </View>
        {draft.focusPointColor ? (
          <Text style={styles.colorLabel}>{FOCUS_POINT_COLORS.find((color) => color.id === draft.focusPointColor)?.labelHebrew}</Text>
        ) : null}

        <Field label='איזו תנועת גוף מייצגת עבורך את האדם שכבר השיג את המטרה? (רשות)'>
          <TextInput
            style={styles.textInput}
            value={draft.futureBodyMovement}
            onChangeText={(value) => setDraft({ ...draft, futureBodyMovement: value })}
            textAlign="right"
            multiline
            placeholder="לדוגמה: ישר בגב, כתפיים רפויות, ראש מורם"
          />
        </Field>

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>שמירה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 12, marginBottom: 8 },
  behaviorBlock: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 14, backgroundColor: "#fafafa" },
  behaviorNumber: { fontSize: 14, fontWeight: "700", color: "#0a7ea4", textAlign: "right", marginBottom: 6 },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15, minHeight: 44 },
  mantraRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  mantraPrefix: { fontSize: 15, fontWeight: "700", color: "#0a7ea4" },
  mantraInput: { flex: 1 },
  colorRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12, marginBottom: 8 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "transparent" },
  colorSwatchSelected: { borderColor: "#222" },
  colorLabel: { fontSize: 14, textAlign: "right", color: "#444", marginBottom: 14 },
  saveButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  saveButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

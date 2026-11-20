import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { ARC_APPEARANCE_COLOR_PRESETS, DEFAULT_ARC_APPEARANCE_SETTINGS, isValidArcAppearanceColor } from "../arc/arcAppearanceSettings.ts";
import type { ArcAppearanceSettings } from "../arc/arcAppearanceSettings.ts";
import { resolveFocusColorHex } from "../arc/focusColorPalette.ts";
import { loadArcAppearanceSettings, loadShowHomeInsightButtonSetting, saveArcAppearanceSettings, saveShowHomeInsightButtonSetting } from "../data/storage.ts";

/**
 * build/SettingsScreen.tsx (route /settings)
 *
 * ARCHI -- Unified 7-Part Update task, Part 7.1/7.2 ("APP SETTINGS AND
 * ONE-TAP ANDROID SHORTCUTS"): the one general Settings hub -- "if an
 * existing Settings screen already exists, reuse it; do not create a
 * duplicate settings system." No general hub existed before this task
 * (only feature-specific ones -- morning alarm, floating timer,
 * emotional check-in/shortcuts), so this is the first and only one;
 * every pre-existing feature-specific settings screen stays exactly
 * where it was, this hub simply links out to the one this task itself
 * calls out by name (the shortcuts screen, reused verbatim below,
 * never reimplemented here).
 *
 * "עיצוב תרגיל ARC": two fully independent, persisted color choices --
 * the Presence point/ring color and the circle's own outline color --
 * applying to EVERY ARC route (Full/Shortened/Mini/Task LIVE ARC/ARC
 * GYM) because they all read the exact same
 * data/storage.ts's own loadArcAppearanceSettings. "These colors must
 * not override contraction, supportive-region, or Encoding body
 * colors": this screen never touches CONTRACTION_SELECTED_COLOR/
 * HEAVINESS_CLOSEDNESS_SELECTED_COLOR/OPENING_SUPPORT_SELECTED_COLOR/
 * arc/arcBodyMantraCircleLogic.ts's own OPENING_*_COLOR tiers at all --
 * those stay their own fixed, independent constants.
 */
export default function SettingsScreen() {
  const [settings, setSettings] = useState<ArcAppearanceSettings>(DEFAULT_ARC_APPEARANCE_SETTINGS);
  const [pointDraft, setPointDraft] = useState("");
  const [circleDraft, setCircleDraft] = useState("");
  const [showHomeInsightButton, setShowHomeInsightButton] = useState(true);

  const reload = useCallback(() => {
    loadArcAppearanceSettings().then((loaded) => {
      setSettings(loaded);
      setPointDraft(loaded.pointColor ?? "");
      setCircleDraft(loaded.circleColor ?? "");
    });
    loadShowHomeInsightButtonSetting().then(setShowHomeInsightButton);
  }, []);

  useFocusEffect(reload);

  async function persist(next: ArcAppearanceSettings) {
    setSettings(next);
    await saveArcAppearanceSettings(next);
  }

  const pointPreviewHex = resolveFocusColorHex(settings.pointColor);
  const circlePreviewHex = resolveFocusColorHex(settings.circleColor ?? settings.pointColor);
  const customPointValid = !pointDraft.trim() || isValidArcAppearanceColor(pointDraft);
  const customCircleValid = !circleDraft.trim() || isValidArcAppearanceColor(circleDraft);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>הגדרות</Text>

        <Text style={styles.sectionTitle}>עיצוב תרגיל ARC</Text>
        <Text style={styles.hint}>
          הצבעים האלה חלים על תרגילי ARC מלא, מקוצר (סבבה), מיני, ARC בתוך משימה חיה, ו-ARC GYM -- הם לא משפיעים על צבעי הכיווץ, האזורים התומכים, או
          הקידוד בגוף.
        </Text>

        <Text style={styles.fieldLabel}>תצוגה מקדימה</Text>
        <View style={[styles.previewCircle, { borderColor: circlePreviewHex }]}>
          <View style={[styles.previewDot, { backgroundColor: pointPreviewHex }]} />
        </View>

        <Text style={styles.fieldLabel}>צבע נקודת המיקוד</Text>
        <View style={styles.chipRow}>
          {ARC_APPEARANCE_COLOR_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={[styles.chip, settings.pointColor === preset && styles.chipSelected]}
              onPress={() => {
                setPointDraft(preset);
                persist({ ...settings, pointColor: preset });
              }}
            >
              <Text style={[styles.chipText, settings.pointColor === preset && styles.chipTextSelected]}>{preset}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.textInput} value={pointDraft} onChangeText={setPointDraft} textAlign="right" placeholder="או קוד צבע מותאם, לדוגמה #1976D2" />
        {!customPointValid && <Text style={styles.errorText}>קוד הצבע לא תקין</Text>}
        <Pressable
          style={[styles.secondaryButton, !customPointValid && styles.disabledButton]}
          disabled={!customPointValid || !pointDraft.trim()}
          onPress={() => persist({ ...settings, pointColor: pointDraft.trim() })}
        >
          <Text style={styles.secondaryButtonText}>שמירת צבע הנקודה</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>צבע העיגול</Text>
        <View style={styles.chipRow}>
          {ARC_APPEARANCE_COLOR_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={[styles.chip, settings.circleColor === preset && styles.chipSelected]}
              onPress={() => {
                setCircleDraft(preset);
                persist({ ...settings, circleColor: preset });
              }}
            >
              <Text style={[styles.chipText, settings.circleColor === preset && styles.chipTextSelected]}>{preset}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.textInput} value={circleDraft} onChangeText={setCircleDraft} textAlign="right" placeholder="או קוד צבע מותאם, לדוגמה #7B1FA2" />
        {!customCircleValid && <Text style={styles.errorText}>קוד הצבע לא תקין</Text>}
        <Pressable
          style={[styles.secondaryButton, !customCircleValid && styles.disabledButton]}
          disabled={!customCircleValid || !circleDraft.trim()}
          onPress={() => persist({ ...settings, circleColor: circleDraft.trim() })}
        >
          <Text style={styles.secondaryButtonText}>שמירת צבע העיגול</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => persist({ ...settings, circleColor: null })}>
          <Text style={styles.linkText}>איפוס לצבע הנקודה (ברירת מחדל)</Text>
        </Pressable>

        {/*
         * ARCHI -- Unified Development Specification task, Part 4
         * ("INSIGHT SETTINGS"): "A" reuses the SAME /insights/new
         * screen the Home-screen button opens -- never a second
         * insight-entry UI. "B" applies immediately (persist() below
         * saves on every toggle) and defaults safely to ON for an
         * installation with no saved preference yet
         * (loadShowHomeInsightButtonSetting's own true-by-default).
         */}
        <Text style={styles.sectionTitle}>תובנות</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/insights/new")}>
          <Text style={styles.secondaryButtonText}>הוסף תובנה</Text>
        </Pressable>
        <View style={styles.switchRow}>
          <Switch
            value={showHomeInsightButton}
            onValueChange={(value) => {
              setShowHomeInsightButton(value);
              saveShowHomeInsightButtonSetting(value);
            }}
          />
          <Text style={styles.fieldLabel}>הצג כפתור &quot;הוסף תובנה&quot; במסך הראשי</Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/insights")}>
          <Text style={styles.secondaryButtonText}>אוסף תובנות</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>קיצורי דרך</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/tasks/emotional-checkin-settings")}>
          <Text style={styles.secondaryButtonText}>הוסף כפתורי ARC למסך הבית ולמסך הנעילה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 24, marginBottom: 6 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12, lineHeight: 19 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", color: "#333", marginTop: 14, marginBottom: 6 },
  previewCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 8 },
  previewDot: { width: 16, height: 16, borderRadius: 8 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { borderColor: "#0a7ea4", backgroundColor: "#e6f4fe" },
  chipText: { fontSize: 14, color: "#333" },
  chipTextSelected: { color: "#0a7ea4", fontWeight: "600" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, textAlign: "right", marginBottom: 4 },
  errorText: { color: "#D32F2F", fontSize: 12, textAlign: "right", marginBottom: 4 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 6 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  disabledButton: { opacity: 0.4 },
  linkButton: { marginTop: 10, alignItems: "center" },
  linkText: { color: "#666", fontSize: 13, textDecorationLine: "underline" },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 10 },
});

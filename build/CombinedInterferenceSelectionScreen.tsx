import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getStateProfile, loadCombinedInterferenceSelections, loadInterferenceItems, restoreCombinedInterferenceSelection, upsertCombinedInterferenceSelection } from "../data/storage.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { CombinedInterferenceSelection } from "../arc/combinedInterferenceSelection.ts";
import {
  SAVE_BLOCKED_REASON_LABELS,
  UNAVAILABLE_REASON_LABELS,
  buildCombinedSelectionSaveDraft,
  classifyConfiguredItems,
  findExistingSelectionForState,
  groupAvailableItemsByCategory,
  removeSelectedItemId,
  resolveSaveEligibility,
  toggleSelectedItemId,
} from "../arc/combinedSelectionBuild.ts";
import type { AvailableItemsByCategory, ClassifiedConfiguredItem } from "../arc/combinedSelectionBuild.ts";

const CATEGORY_GROUPS: { key: keyof AvailableItemsByCategory; title: string }[] = [
  { key: "thought", title: "מחשבות" },
  { key: "belief", title: "אמונות" },
  { key: "emotion", title: "רגשות" },
  { key: "urge", title: "דחפים" },
];

type Status = "loading" | "stateNotFound" | "stateNotEnabled" | "loadError" | "ready";

/**
 * build/CombinedInterferenceSelectionScreen.tsx (route: /combined-selection/[stateProfileId])
 *
 * Adaptive ARC architecture task, Phase 13: the visible BUILD screen for
 * associating multiple InterferenceItems (and optionally full Presence)
 * with one StateProfile -- reached from that State's own card on
 * build/StateProfileListScreen.tsx ("הגדרת גורמים מפריעים", enabled
 * States only). The State itself is selected by which card the trainee
 * came from -- this screen never offers a second State picker.
 *
 * This screen configures what is AVAILABLE for combined practice with
 * this State -- never which items will run in any particular LIVE
 * session. A future LIVE phase asks "what is interfering now" and lets
 * the trainee pick one or more of THIS configured set each time; saving
 * a large configured set here never forces every item into every
 * session.
 *
 * All non-visual logic (grouping, classification, toggling, save
 * eligibility, the save draft itself) lives in
 * arc/combinedSelectionBuild.ts and is called here, never duplicated.
 * This screen never calls any StateProfile or InterferenceItem write
 * function (upsert/disable/archive/restore) -- it only reads them and
 * only ever writes CombinedInterferenceSelection.
 */
export default function CombinedInterferenceSelectionScreen() {
  const { stateProfileId } = useLocalSearchParams<{ stateProfileId: string }>();

  const [status, setStatus] = useState<Status>("loading");
  const [stateProfile, setStateProfile] = useState<StateProfile | null>(null);
  const [allItems, setAllItems] = useState<InterferenceItem[]>([]);
  const [existingSelection, setExistingSelection] = useState<CombinedInterferenceSelection | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [presenceEnabled, setPresenceEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  function load() {
    if (!stateProfileId) return;
    setStatus("loading");
    Promise.all([getStateProfile(stateProfileId), loadInterferenceItems(), loadCombinedInterferenceSelections()])
      .then(([profile, items, selections]) => {
        if (!profile) {
          setStatus("stateNotFound");
          return;
        }
        setStateProfile(profile);
        setAllItems(items);
        if (profile.status !== "enabled") {
          setStatus("stateNotEnabled");
          return;
        }
        const existing = findExistingSelectionForState(selections, stateProfileId);
        setExistingSelection(existing);
        setSelectedItemIds(existing?.configuredItemIds ?? []);
        setPresenceEnabled(existing?.presenceEnabled ?? false);
        setStatus("ready");
      })
      .catch((error) => {
        console.warn("[CombinedInterferenceSelectionScreen] Failed to load -- showing an error state rather than fabricating an empty configuration.", error);
        setStatus("loadError");
      });
  }

  useEffect(load, [stateProfileId]);

  const groups = groupAvailableItemsByCategory(allItems, stateProfileId ?? "");
  const hasAnyAvailableItemsAtAll = CATEGORY_GROUPS.some((group) => groups[group.key].length > 0);
  const classifiedItems: ClassifiedConfiguredItem[] = classifyConfiguredItems(selectedItemIds, allItems, stateProfileId ?? "");
  const unavailableItems = classifiedItems.filter((c) => c.classification.kind === "unavailable");
  const configEditableNow = existingSelection === null || existingSelection.status === "enabled";
  const eligibility = stateProfile ? resolveSaveEligibility(stateProfile.status, selectedItemIds, classifiedItems) : { allowed: false, blockedReason: null };

  function toggleItem(id: string) {
    setSelectedItemIds((current) => toggleSelectedItemId(current, id));
  }

  function removeUnavailable(id: string) {
    setSelectedItemIds((current) => removeSelectedItemId(current, id));
  }

  async function handleRestoreSelection() {
    if (!existingSelection || restoring) return;
    setRestoring(true);
    try {
      await restoreCombinedInterferenceSelection(existingSelection.id, new Date().toISOString());
      load();
    } finally {
      setRestoring(false);
    }
  }

  async function handleSave() {
    if (saving || !eligibility.allowed || !stateProfileId) return;
    setSaveError(null);
    setSaving(true);
    try {
      const draft = buildCombinedSelectionSaveDraft(existingSelection, stateProfileId, null, selectedItemIds, presenceEnabled, new Date().toISOString());
      await upsertCombinedInterferenceSelection(draft);
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת ההגדרה. נסה שוב.");
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

  if (status === "stateNotFound") {
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

  if (status === "stateNotEnabled") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>המצב הרצוי אינו פעיל</Text>
          <Text style={styles.body}>לא ניתן להגדיר או לשמור גורמים מפריעים עבור מצב שאינו פעיל. לאחר שהמצב יופעל או ישוחזר מחדש, ההגדרה תהיה זמינה שוב.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "loadError") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>אירעה שגיאה בטעינת ההגדרה</Text>
          <Text style={styles.body}>לא ניתן היה לטעון את הנתונים כרגע. נסה שוב מאוחר יותר.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={load}>
            <Text style={styles.buttonText}>נסה שוב</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // status === "ready"
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{stateProfile?.name}</Text>
        <Text style={styles.title}>הגדרת גורמים מפריעים</Text>
        <Text style={styles.helperText}>כאן מגדירים אילו גורמים עשויים להפריע למצב הזה. בזמן התרגול תוכל לבחור רק את מה שמפריע לך באותו רגע.</Text>

        {existingSelection && existingSelection.status !== "enabled" && (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerText}>{existingSelection.status === "disabled" ? "הגדרה זו מושבתת כרגע." : "הגדרה זו נמצאת בארכיון."}</Text>
            <Pressable style={[styles.button, styles.fullWidthButton]} disabled={restoring} onPress={handleRestoreSelection}>
              <Text style={styles.buttonText}>{existingSelection.status === "disabled" ? "הפעל הגדרה זו" : "שחזר הגדרה זו"}</Text>
            </Pressable>
          </View>
        )}

        {configEditableNow && (
          <>
            {!hasAnyAvailableItemsAtAll && (
              <Text style={styles.emptyText}>אין כרגע פריטי הפרעה מקושרים למצב הזה. אפשר לקשר פריט הפרעה למצב הזה דרך עריכת פריט ההפרעה שלו.</Text>
            )}

            {CATEGORY_GROUPS.map((group) => {
              const items = groups[group.key];
              if (items.length === 0) return null;
              return (
                <Section key={group.key} title={group.title}>
                  {items.map((item) => (
                    <Pressable key={item.id} style={styles.checkboxRow} onPress={() => toggleItem(item.id)}>
                      <Text style={styles.checkboxMark}>{selectedItemIds.includes(item.id) ? "☑" : "☐"}</Text>
                      <Text style={styles.checkboxLabel}>{item.name}</Text>
                    </Pressable>
                  ))}
                </Section>
              );
            })}

            <Section title="נוכחות">
              <Pressable style={styles.checkboxRow} onPress={() => setPresenceEnabled((current) => !current)}>
                <Text style={styles.checkboxMark}>{presenceEnabled ? "☑" : "☐"}</Text>
                <Text style={styles.checkboxLabel}>לכלול תרגול נוכחות בעת הצורך</Text>
              </Pressable>
            </Section>

            {unavailableItems.length > 0 && (
              <Section title="לא זמינים כרגע">
                {unavailableItems.map((c) => (
                  <View key={c.id} style={styles.unavailableRow}>
                    <Text style={styles.unavailableLabel}>
                      {c.classification.kind === "unavailable" ? (c.classification.item?.name ?? "פריט לא ידוע") : ""}
                      {c.classification.kind === "unavailable" ? ` -- ${UNAVAILABLE_REASON_LABELS[c.classification.reason]}` : ""}
                    </Text>
                    <Pressable style={styles.actionButton} onPress={() => removeUnavailable(c.id)}>
                      <Text style={styles.actionButtonText}>הסר מהתצורה</Text>
                    </Pressable>
                  </View>
                ))}
              </Section>
            )}

            {!eligibility.allowed && eligibility.blockedReason && <Text style={styles.errorText}>{SAVE_BLOCKED_REASON_LABELS[eligibility.blockedReason]}</Text>}
            {saveError && <Text style={styles.errorText}>{saveError}</Text>}

            <Pressable style={[styles.button, styles.fullWidthButton, (!eligibility.allowed || saving) && styles.buttonDisabled]} disabled={!eligibility.allowed || saving} onPress={handleSave}>
              <Text style={styles.buttonText}>שמור</Text>
            </Pressable>
          </>
        )}

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>חזרה</Text>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  helperText: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  body: { fontSize: 15, textAlign: "right", color: "#333", marginBottom: 16, lineHeight: 21 },
  emptyText: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  statusBanner: { backgroundColor: "#FDF3D9", borderRadius: 10, padding: 14, marginBottom: 16 },
  statusBannerText: { fontSize: 14, textAlign: "right", color: "#8a6d1a", marginBottom: 8 },
  section: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#E6F4FE", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 10 },
  checkboxRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 8, gap: 10 },
  checkboxMark: { fontSize: 18, color: "#0a7ea4" },
  checkboxLabel: { fontSize: 16, textAlign: "right", color: "#333", flex: 1 },
  unavailableRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  unavailableLabel: { fontSize: 14, textAlign: "right", color: "#666", flex: 1 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#c0392b", fontSize: 14 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 16 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  cancelButton: { marginTop: 20, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import {
  getPersonalDevelopmentRouteConfig,
  loadInterferenceItems,
  loadPersonalDevelopmentRouteProgressStore,
  loadPresenceArcs,
  loadStateProfiles,
  savePersonalDevelopmentRouteProgressStore,
  upsertPersonalDevelopmentRouteConfig,
} from "../data/storage.ts";
import {
  createEmptyPersonalDevelopmentRouteConfig,
  generatePersonalDevelopmentRouteConfigId,
  isPersonalDevelopmentRouteConfigSaveable,
  resolveActionRelationshipForItem,
  resolvePendingBuildNewStateReturn,
  validatePersonalDevelopmentRouteConfig,
} from "../arc/personalDevelopmentRouteConfig.ts";
import type { BeneficialActionPolicy, PersonalDevelopmentRouteConfig, PersonalDevelopmentRouteGoalConnection } from "../arc/personalDevelopmentRouteConfig.ts";
import { isPersonalDevelopmentRouteConfigCompleteForPractice } from "../arc/personalDevelopmentRouteConfigReadiness.ts";
import { reconcileRouteStageForPolicyChange } from "../arc/personalDevelopmentRouteProgress.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { ActionRelationship } from "../arc/factorAction.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { PresenceArc } from "../arc/types.ts";
import { isLibraryItemEnabled } from "../arc/libraryItemStatus.ts";
import { generateStateProfileId } from "../arc/stateProfile.ts";

const CATEGORY_PREFIX_LABELS: Record<InterferenceItem["category"], string> = {
  thought: "מחשבה",
  belief: "אמונה",
  urge: "דחף",
  emotion: "רגש",
};

const VALIDATION_REASON_LABELS: Record<string, string> = {
  no_factors_configured: "יש לבחור לפחות גורם מפריע אחד או לכלול נוכחות.",
  configured_item_not_found: "אחד הפריטים שנבחרו כבר אינו זמין.",
  linked_requires_state_profile_id: "יש לבחור מצב רצוי.",
  linked_state_not_found: "המצב הרצוי שנבחר לא נמצא.",
  emotion_requires_linked_state: "מסלול הכולל רגש דורש מצב רצוי מקושר (לא ניתן להשתמש ב\"לא\" או ב\"להחליט בזמן התרגול\").",
  decide_in_live_requires_a_candidate_state_profile_id: "יש לבחור מצב רצוי מועמד עבור החלטה בזמן התרגול.",
  decide_in_live_candidate_state_not_found: "המצב הרצוי המועמד לא נמצא.",
  none_must_not_reference_a_state: "לא ניתן לקשר מצב רצוי כאשר נבחרה האפשרות \"לא\".",
  missing_item_action_relationship: "חסר מידע פנימי על יחס הפעולה עבור אחד הפריטים.",
};

function ownFactorActionIsSet(item: InterferenceItem): boolean {
  return item.category !== "emotion" && (item.beneficialActionAgainstFactor ?? "").trim().length > 0;
}

/**
 * build/PersonalDevelopmentRouteEditorScreen.tsx (route: /personal-development-routes/[id], id="new" to create)
 *
 * Adaptive ARC architecture task, Phase 14B-2: the BUILD screen for
 * PersonalDevelopmentRouteConfig (arc/personalDevelopmentRouteConfig.ts)
 * -- the actual owner of whether ARC State participates in a combined
 * route and which one. Deliberately does NOT filter selectable
 * InterferenceItems by their own legacy primaryStateProfileId/
 * alternativeStateProfileIds -- those remain library applicability
 * metadata only (see build/InterferenceItemEditorScreen.tsx's own
 * read-only legacy section), never a second source of truth for this
 * route's own State policy.
 *
 * "Build new State" reuses the exact "navigate away, come back, a
 * useFocusEffect refreshes just the one list, the rest of this screen's
 * own local draft state survives because the screen is only re-focused,
 * never unmounted" mechanism already proven by
 * build/CombinedInterferenceSelectionScreen.tsx's own Presence-creation
 * flow -- the one difference is auto-selection, driven by
 * arc/personalDevelopmentRouteConfig.ts's own pure
 * resolvePendingBuildNewStateReturn.
 */
export default function PersonalDevelopmentRouteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [pendingId] = useState(() => generatePersonalDevelopmentRouteConfigId());
  const [pendingNow] = useState(() => new Date().toISOString());
  const [config, setConfig] = useState<PersonalDevelopmentRouteConfig>(() => createEmptyPersonalDevelopmentRouteConfig(pendingId, null, pendingNow));
  const [items, setItems] = useState<InterferenceItem[]>([]);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [presenceArcs, setPresenceArcs] = useState<PresenceArc[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // "Build new State" -- see this screen's own header doc.
  const [pendingNewStateId, setPendingNewStateId] = useState<string | null>(null);

  /** The beneficialActionPolicy this config was loaded with (null for a new, unsaved route) -- see handleSave's own reconcileRouteStageForPolicyChange call for why this is tracked separately from `config`. */
  const loadedBeneficialActionPolicyRef = useRef<BeneficialActionPolicy | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadInterferenceItems().then(setItems).catch(() => setItems([]));
      loadPresenceArcs().then(setPresenceArcs).catch(() => setPresenceArcs([]));
      loadStateProfiles()
        .then((profiles) => {
          setStateProfiles(profiles);
          if (pendingNewStateId) {
            const resolution = resolvePendingBuildNewStateReturn(pendingNewStateId, profiles);
            if (resolution.found) {
              setConfig((current) => ({ ...current, stateInclusionPolicy: "linked", stateProfileId: resolution.stateProfileId }));
              setPendingNewStateId(null);
            }
          }
        })
        .catch(() => setStateProfiles([]));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingNewStateId])
  );

  useFocusEffect(
    useCallback(() => {
      if (isNew || !id) return;
      let cancelled = false;
      getPersonalDevelopmentRouteConfig(id).then((existing) => {
        if (cancelled) return;
        if (!existing) {
          setStatus("notFound");
          return;
        }
        setConfig(existing);
        loadedBeneficialActionPolicyRef.current = existing.beneficialActionPolicy;
        setStatus("ready");
      });
      return () => {
        cancelled = true;
      };
      // Loaded once per id -- an in-progress local edit is never
      // clobbered by a focus event on the SAME screen instance (only the
      // initial mount for this id triggers this effect body's real work).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isNew])
  );

  function toggleItem(itemId: string) {
    setConfig((current) => {
      const included = current.interferenceItemIds.includes(itemId);
      const interferenceItemIds = included ? current.interferenceItemIds.filter((existing) => existing !== itemId) : [...current.interferenceItemIds, itemId];
      const itemRelationships = { ...current.itemRelationships };
      if (included) {
        delete itemRelationships[itemId];
      } else if (!itemRelationships[itemId]) {
        itemRelationships[itemId] = { actionRelationship: "legacy_unspecified" };
      }
      return { ...current, interferenceItemIds, itemRelationships };
    });
  }

  function setItemActionRelationship(itemId: string, relationship: ActionRelationship) {
    setConfig((current) => ({ ...current, itemRelationships: { ...current.itemRelationships, [itemId]: { actionRelationship: relationship } } }));
  }

  function chooseExistingState() {
    setConfig((current) => ({ ...current, stateInclusionPolicy: "linked" }));
  }

  function chooseDecideInLive() {
    setConfig((current) => ({ ...current, stateInclusionPolicy: "decide_in_live" }));
  }

  function chooseNoState() {
    setConfig((current) => ({ ...current, stateInclusionPolicy: "none", stateProfileId: null }));
    setPendingNewStateId(null);
  }

  function chooseStateProfile(stateProfileId: string) {
    setConfig((current) => ({ ...current, stateProfileId }));
  }

  function handleBuildNewState() {
    const newId = generateStateProfileId();
    setPendingNewStateId(newId);
    router.push({ pathname: "/state-profiles/[id]", params: { id: "new", presetId: newId } });
  }

  function selectPresenceArc(presenceArcId: string) {
    setConfig((current) => ({ ...current, linkedPresenceArcId: current.linkedPresenceArcId === presenceArcId ? null : presenceArcId }));
  }

  function toggleGoalConnection() {
    setConfig((current) => ({
      ...current,
      goalConnection: current.goalConnection ? null : { desiredResultText: "", valueText: "", personalReasonText: "" },
    }));
  }

  function patchGoalConnection(patch: Partial<PersonalDevelopmentRouteGoalConnection>) {
    setConfig((current) => (current.goalConnection ? { ...current, goalConnection: { ...current.goalConnection, ...patch } } : current));
  }

  async function handleSave() {
    if (saving || !isPersonalDevelopmentRouteConfigSaveable(config, items, stateProfiles)) return;
    setSaveError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await upsertPersonalDevelopmentRouteConfig({ ...config, updatedAt: now });
      // Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
      // correction: a coach changing beneficialActionPolicy on an EXISTING route
      // (never a brand-new one -- there is no progress record yet) reconciles
      // that route's own already-accumulated 4-stage-program stage immediately,
      // via the same pure resolver LIVE's own stage-advancement path uses --
      // zero replay of old sessions, only ever `stage`/`updatedAt` change (see
      // reconcileRouteStageForPolicyChange's own doc). A route with no progress
      // record yet has nothing to reconcile.
      if (loadedBeneficialActionPolicyRef.current !== null && loadedBeneficialActionPolicyRef.current !== config.beneficialActionPolicy) {
        const progressStore = await loadPersonalDevelopmentRouteProgressStore();
        const existingProgress = progressStore[config.id];
        if (existingProgress) {
          const reconciled = reconcileRouteStageForPolicyChange(existingProgress, config.beneficialActionPolicy, now);
          if (reconciled !== existingProgress) {
            await savePersonalDevelopmentRouteProgressStore({ ...progressStore, [config.id]: reconciled });
          }
        }
      }
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת המסלול. נסה שוב.");
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
          <Text style={styles.title}>המסלול לא נמצא</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const enabledItems = items.filter(isLibraryItemEnabled);
  const enabledStateProfiles = stateProfiles.filter(isLibraryItemEnabled);
  const stateIncluded = config.stateInclusionPolicy !== "none";
  const validation = validatePersonalDevelopmentRouteConfig(config, items, stateProfiles);
  const canSave = isPersonalDevelopmentRouteConfigSaveable(config, items, stateProfiles) && !saving;
  const ready = isPersonalDevelopmentRouteConfigCompleteForPractice(config, items, stateProfiles, presenceArcs);
  const selectedPresenceArc = config.linkedPresenceArcId ? presenceArcs.find((arc) => arc.id === config.linkedPresenceArcId) : null;
  const presenceOwnActionSet = (selectedPresenceArc?.beneficialAction ?? "").trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "מסלול תרגול משולב חדש" : "עריכת מסלול תרגול משולב"}</Text>

        <Section title="גורמים מפריעים">
          {enabledItems.length === 0 && <Text style={styles.helperText}>אין עדיין פריטי הפרעה זמינים. אפשר ליצור אחד במסך פריטי ההפרעה.</Text>}
          {enabledItems.map((item) => {
            const included = config.interferenceItemIds.includes(item.id);
            const relationship = resolveActionRelationshipForItem(config, item.id);
            const askRelationship = included && stateIncluded && ownFactorActionIsSet(item);
            return (
              <View key={item.id} style={styles.itemBlock}>
                <Pressable style={styles.checkboxRow} onPress={() => toggleItem(item.id)}>
                  <Text style={styles.checkboxMark}>{included ? "☑" : "☐"}</Text>
                  <Text style={styles.checkboxLabel}>{`${CATEGORY_PREFIX_LABELS[item.category]}: ${item.name}`}</Text>
                </Pressable>
                {askRelationship && (
                  <View style={styles.relationshipBlock}>
                    <Text style={styles.question}>האם הפעולה מתוך המצב הרצוי היא גם הפעולה המיטיבה מול הגורם המפריע?</Text>
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chip, relationship === "same_action" && styles.chipSelected]} onPress={() => setItemActionRelationship(item.id, "same_action")}>
                        <Text style={styles.chipText}>כן -- זו אותה פעולה</Text>
                      </Pressable>
                      <Pressable style={[styles.chip, relationship === "different_actions" && styles.chipSelected]} onPress={() => setItemActionRelationship(item.id, "different_actions")}>
                        <Text style={styles.chipText}>לא -- אלו שתי פעולות שונות</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </Section>

        <Section title="מעבר למצב רצוי תומך">
          <Text style={styles.question}>האם נדרש גם מעבר למצב רצוי תומך?</Text>
          <View style={styles.optionColumn}>
            <Pressable style={[styles.optionButton, config.stateInclusionPolicy === "linked" && styles.optionButtonSelected]} onPress={chooseExistingState}>
              <Text style={styles.optionButtonText}>כן -- לבחור מצב רצוי קיים</Text>
            </Pressable>
            <Pressable style={styles.optionButton} onPress={handleBuildNewState}>
              <Text style={styles.optionButtonText}>כן -- לבנות מצב רצוי חדש</Text>
            </Pressable>
            <Pressable style={[styles.optionButton, config.stateInclusionPolicy === "none" && styles.optionButtonSelected]} onPress={chooseNoState}>
              <Text style={styles.optionButtonText}>לא</Text>
            </Pressable>
            <Pressable style={[styles.optionButton, config.stateInclusionPolicy === "decide_in_live" && styles.optionButtonSelected]} onPress={chooseDecideInLive}>
              <Text style={styles.optionButtonText}>להחליט בזמן התרגול</Text>
            </Pressable>
          </View>

          {pendingNewStateId && <Text style={styles.helperText}>ממתין ליצירת מצב רצוי חדש -- חזור למסך זה לאחר השמירה.</Text>}

          {(config.stateInclusionPolicy === "linked" || config.stateInclusionPolicy === "decide_in_live") && (
            <View style={styles.stateBlock}>
              <Text style={styles.helperText}>{config.stateInclusionPolicy === "decide_in_live" ? "בחירת מצב רצוי מועמד -- LIVE יחליט האם להשתמש בו." : "בחירת מצב רצוי."}</Text>
              <View style={styles.chipRow}>
                {enabledStateProfiles.map((profile) => (
                  <Pressable key={profile.id} style={[styles.chip, config.stateProfileId === profile.id && styles.chipSelected]} onPress={() => chooseStateProfile(profile.id)}>
                    <Text style={styles.chipText}>{profile.name}</Text>
                  </Pressable>
                ))}
                {enabledStateProfiles.length === 0 && <Text style={styles.helperText}>אין עדיין מצבים רצויים זמינים.</Text>}
              </View>
            </View>
          )}
        </Section>

        <Section title="נוכחות">
          <Pressable style={styles.checkboxRow} onPress={() => setConfig((current) => ({ ...current, presenceEnabled: !current.presenceEnabled }))}>
            <Text style={styles.checkboxMark}>{config.presenceEnabled ? "☑" : "☐"}</Text>
            <Text style={styles.checkboxLabel}>לכלול תרגול נוכחות</Text>
          </Pressable>
          {config.presenceEnabled && (
            <View style={styles.stateBlock}>
              <View style={styles.chipRow}>
                {presenceArcs.map((presenceArc) => (
                  <Pressable key={presenceArc.id} style={styles.checkboxRow} onPress={() => selectPresenceArc(presenceArc.id)}>
                    <Text style={styles.checkboxMark}>{config.linkedPresenceArcId === presenceArc.id ? "●" : "○"}</Text>
                    <Text style={styles.checkboxLabel}>{presenceArc.name}</Text>
                  </Pressable>
                ))}
                {presenceArcs.length === 0 && <Text style={styles.helperText}>עדיין לא נבנה פרוטוקול נוכחות.</Text>}
              </View>
              {selectedPresenceArc && !presenceOwnActionSet && (
                <Text style={styles.readinessNote}>לפרוטוקול הנוכחות שנבחר אין עדיין פעולה מיטיבה מול הגורם המפריע -- הוא לא ייחשב מוכן למסלול זה.</Text>
              )}
              {stateIncluded && selectedPresenceArc && presenceOwnActionSet && (
                <View style={styles.relationshipBlock}>
                  <Text style={styles.question}>האם הפעולה מתוך המצב הרצוי היא גם הפעולה המיטיבה מול הגורם המפריע?</Text>
                  <View style={styles.chipRow}>
                    <Pressable
                      style={[styles.chip, config.presenceActionRelationship === "same_action" && styles.chipSelected]}
                      onPress={() => setConfig((current) => ({ ...current, presenceActionRelationship: "same_action" }))}
                    >
                      <Text style={styles.chipText}>כן -- זו אותה פעולה</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chip, config.presenceActionRelationship === "different_actions" && styles.chipSelected]}
                      onPress={() => setConfig((current) => ({ ...current, presenceActionRelationship: "different_actions" }))}
                    >
                      <Text style={styles.chipText}>לא -- אלו שתי פעולות שונות</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </Section>

        <Section title="הפעולה המיטיבה / הפעולה לוויסות">
          <Text style={styles.question}>מה מעמדה של הפעולה המיטיבה במסלול הזה?</Text>
          <View style={styles.optionColumn}>
            <Pressable style={[styles.optionButton, config.beneficialActionPolicy === "required" && styles.optionButtonSelected]} onPress={() => setConfig((current) => ({ ...current, beneficialActionPolicy: "required" }))}>
              <Text style={styles.optionButtonText}>חובה -- יש לבצע אותה כדי לסיים את התרגול</Text>
            </Pressable>
            <Pressable
              style={[styles.optionButton, config.beneficialActionPolicy === "optional_in_live" && styles.optionButtonSelected]}
              onPress={() => setConfig((current) => ({ ...current, beneficialActionPolicy: "optional_in_live" }))}
            >
              <Text style={styles.optionButtonText}>רשות -- אפשרות מפורשת לדלג עליה בזמן התרגול</Text>
            </Pressable>
            <Pressable style={[styles.optionButton, config.beneficialActionPolicy === "none" && styles.optionButtonSelected]} onPress={() => setConfig((current) => ({ ...current, beneficialActionPolicy: "none" }))}>
              <Text style={styles.optionButtonText}>ללא -- המסלול הזה אינו כולל פעולה מיטיבה כלל</Text>
            </Pressable>
          </View>
          {config.beneficialActionPolicy === "none" && (
            <Text style={styles.helperText}>מסלול ללא פעולה מיטיבה אינו זמין לשלב 3 (ARC Link) ולשלב 4 (פעולה מיטיבה בלבד) בתוכנית ארבעת השלבים -- שלבים 1-2 נותרים זמינים במלואם.</Text>
          )}
        </Section>

        <Section title="חיבור למטרה (Goal Connection)">
          <Text style={styles.helperText}>
            כשמוגדר, חיבור למטרה מוצג פעם אחת בלבד, בסוף שלב הוויסות ולפני קידוד התגובה החדשה -- דמיון קצר של התוצאה הרצויה, המנטרה מכוונת העתיד, הערך והסיבה האישית. מוצג רק כאשר המסלול כולל מצב רצוי.
          </Text>
          <Pressable style={styles.checkboxRow} onPress={toggleGoalConnection}>
            <Text style={styles.checkboxMark}>{config.goalConnection !== null ? "☑" : "☐"}</Text>
            <Text style={styles.checkboxLabel}>לכלול חיבור למטרה במסלול הזה</Text>
          </Pressable>
          {config.goalConnection !== null && !stateIncluded && (
            <Text style={styles.helperText}>שים לב: המסלול הזה אינו כולל מצב רצוי כרגע, ולכן חיבור למטרה לא יוצג בזמן התרגול עד שייכלל מצב רצוי.</Text>
          )}
          {config.goalConnection !== null && (
            <View>
              <Text style={styles.question}>מהי התוצאה הרצויה של הפעולה?</Text>
              <TextInput
                style={styles.textInput}
                value={config.goalConnection.desiredResultText}
                onChangeText={(text) => patchGoalConnection({ desiredResultText: text })}
                textAlign="right"
              />

              <Text style={styles.question}>מהו הערך שהיא מבטאת? (רשות)</Text>
              <TextInput style={styles.textInput} value={config.goalConnection.valueText} onChangeText={(text) => patchGoalConnection({ valueText: text })} textAlign="right" />

              <Text style={styles.question}>מהי הסיבה האישית שלך? (רשות)</Text>
              <TextInput
                style={styles.textInput}
                value={config.goalConnection.personalReasonText}
                onChangeText={(text) => patchGoalConnection({ personalReasonText: text })}
                textAlign="right"
              />
            </View>
          )}
        </Section>

        <Text style={[styles.readinessBadge, ready ? styles.readinessBadge_ready : styles.readinessBadge_draft]}>{ready ? "מוכן לתרגול LIVE" : "טיוטה -- עדיין לא מוכן לתרגול LIVE"}</Text>
        {!validation.valid && validation.reason && <Text style={styles.errorText}>{VALIDATION_REASON_LABELS[validation.reason] ?? validation.reason}</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        <Text style={styles.helperText}>אפשר לשמור מסלול כטיוטה ולהשלים אותו מאוחר יותר -- זה עדיין לא אומר שהוא מוכן לתרגול LIVE.</Text>

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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  helperText: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  readinessNote: { fontSize: 13, textAlign: "right", color: "#8a6d1a", marginTop: 6, lineHeight: 19 },
  section: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#E6F4FE", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 12 },
  question: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 8 },
  itemBlock: { marginBottom: 10 },
  checkboxRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 6, gap: 10 },
  checkboxMark: { fontSize: 18, color: "#0a7ea4" },
  checkboxLabel: { fontSize: 16, textAlign: "right", color: "#333", flex: 1 },
  relationshipBlock: { marginTop: 4, paddingEnd: 26 },
  optionColumn: { gap: 8 },
  optionButton: { backgroundColor: "#F5F9FC", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  optionButtonSelected: { backgroundColor: "#0a7ea4" },
  optionButtonText: { color: "#0a7ea4", fontSize: 15, textAlign: "right" },
  stateBlock: { marginTop: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  readinessBadge: { fontSize: 14, fontWeight: "700", textAlign: "right", marginTop: 16 },
  readinessBadge_ready: { color: "#1a6b4a" },
  readinessBadge_draft: { color: "#8a6d1a" },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  cancelButton: { marginTop: 14, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import {
  getPersonalDevelopmentRouteConfig,
  loadInterferenceItems,
  loadPersonalDevelopmentRouteConfigs,
  loadPersonalDevelopmentRouteProgressStore,
  loadPresenceArcs,
  loadStateProfiles,
  savePersonalDevelopmentRouteProgressStore,
  upsertInterferenceItem,
  upsertPersonalDevelopmentRouteConfig,
  upsertPresenceArc,
  upsertStateProfile,
} from "../data/storage.ts";
import {
  createEmptyPersonalDevelopmentRouteConfig,
  generatePersonalDevelopmentRouteConfigId,
  isPersonalDevelopmentRouteConfigSaveable,
  resolveActionRelationshipForItem,
  validatePersonalDevelopmentRouteConfig,
} from "../arc/personalDevelopmentRouteConfig.ts";
import type { BeneficialActionPolicy, PersonalDevelopmentRouteConfig, PersonalDevelopmentRouteGoalConnection } from "../arc/personalDevelopmentRouteConfig.ts";
import { isPersonalDevelopmentRouteConfigCompleteForPractice } from "../arc/personalDevelopmentRouteConfigReadiness.ts";
import { reconcileRouteStageForPolicyChange } from "../arc/personalDevelopmentRouteProgress.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
  generateInterferenceItemId,
  isInterferenceItemCompleteForPractice,
  upgradeInterferenceItemToActionModelV2,
} from "../arc/interferenceItem.ts";
import type { InterferenceCategory, InterferenceItem, InterferenceUrgeRepresentation } from "../arc/interferenceItem.ts";
import type { ActionRelationship } from "../arc/factorAction.ts";
import { createEmptyStateProfile, generateStateProfileId, isStateProfileCompleteForPractice } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { PresenceArc } from "../arc/types.ts";
import { generatePresenceArcId } from "../arc/types.ts";
import { buildPresenceArcFromDraft, createEmptyPresenceArcDraft, draftFromPresenceArc, isPresenceArcDraftComplete } from "../arc/presenceArcs.ts";
import type { PresenceArcDraft } from "../arc/presenceArcs.ts";
import { isLibraryItemEnabled } from "../arc/libraryItemStatus.ts";
import {
  cloneInterferenceItemForProgram,
  clonePresenceArcDraftForProgram,
  cloneStateProfileForProgram,
  findRouteConfigsReferencingInterferenceItem,
  findRouteConfigsReferencingPresenceArc,
  findRouteConfigsReferencingStateProfile,
  isLibraryItemSharedElsewhere,
  repointInterferenceItemReference,
  repointPresenceArcReference,
  repointStateProfileReference,
} from "../arc/libraryItemUsage.ts";

const CATEGORY_PREFIX_LABELS: Record<InterferenceItem["category"], string> = {
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
 * Personal Development consolidation task, step 2: the ONE dynamic BUILD
 * screen for every Personal Development program -- rewritten from its
 * own earlier shape (Phase 14B-2), which toggled EXISTING InterferenceItem/
 * StateProfile/PresenceArc library records by reference but always
 * navigated AWAY to a separate editor (InterferenceItemEditorScreen.tsx/
 * StateProfileEditorScreen.tsx/PresenceArcEditorScreen.tsx) to actually
 * edit one. Per the approved consolidation plan, every normal program
 * -- including a program that merely references a record another program
 * also uses -- is edited HERE, inline, never redirected to those legacy
 * screens (they stay registered only as technical fallbacks, per the
 * plan's own explicit "no visible destination change for other programs"
 * correction).
 *
 * Selecting a factor category, an existing State, or Presence renders
 * that record's own fields directly in this same scrollable page the
 * moment it is selected/created -- no navigation, no separate screen per
 * factor. The underlying data model is UNCHANGED (still a reusable
 * shared-library reference by id, per the approved "inline UI over the
 * shared library" decision): editing here still writes the exact same
 * InterferenceItem/StateProfile/PresenceArc records via the exact same
 * upsert* functions those legacy editors used.
 *
 * Shared-item safety gate: before an inline edit can silently ripple
 * into every OTHER program referencing the same record, this screen
 * checks arc/libraryItemUsage.ts's own findRouteConfigsReferencing*
 * helpers (loaded once via loadPersonalDevelopmentRouteConfigs, excluding
 * this route itself) and, when the count is > 0, shows a banner naming
 * that count with two explicit choices -- "continue editing" (normal
 * shared-library write, affects every referencing program) or "copy for
 * this program only" (clones the record under a fresh id and repoints
 * ONLY this route's own reference; the original record and every other
 * referencing route are never touched). A brand-new record created here
 * is never shared (nothing else can reference an id that doesn't exist
 * yet), so it never shows this gate.
 *
 * "Continue editing"/creation-in-progress local state
 * (itemEdits/stateDraft/presenceDraft below) is lazily populated only on
 * the FIRST actual field edit -- selecting an existing, already-complete
 * record and never touching its fields writes nothing extra on Save
 * (see handleSave: only records present in local edit state are ever
 * upserted).
 */
export default function PersonalDevelopmentRouteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [status, setStatus] = useState<"loading" | "notFound" | "ready">(isNew ? "ready" : "loading");
  const [pendingId] = useState(() => generatePersonalDevelopmentRouteConfigId());
  const [pendingNow] = useState(() => new Date().toISOString());
  const [config, setConfig] = useState<PersonalDevelopmentRouteConfig>(() => createEmptyPersonalDevelopmentRouteConfig(pendingId, null, pendingNow));
  const [items, setItems] = useState<InterferenceItem[]>([]);
  const [itemEdits, setItemEdits] = useState<Record<string, InterferenceItem>>({});
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [stateDraft, setStateDraft] = useState<StateProfile | null>(null);
  const [presenceArcs, setPresenceArcs] = useState<PresenceArc[]>([]);
  const [presenceDraft, setPresenceDraft] = useState<PresenceArcDraft | null>(null);
  const [presenceDraftId, setPresenceDraftId] = useState<string | null>(null);
  const [allRouteConfigs, setAllRouteConfigs] = useState<PersonalDevelopmentRouteConfig[]>([]);
  const [acknowledgedSharedKeys, setAcknowledgedSharedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** The beneficialActionPolicy this config was loaded with (null for a new, unsaved route) -- see handleSave's own reconcileRouteStageForPolicyChange call for why this is tracked separately from `config`. */
  const [loadedBeneficialActionPolicy, setLoadedBeneficialActionPolicy] = useState<BeneficialActionPolicy | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadInterferenceItems().then(setItems).catch(() => setItems([]));
      loadPresenceArcs().then(setPresenceArcs).catch(() => setPresenceArcs([]));
      loadStateProfiles().then(setStateProfiles).catch(() => setStateProfiles([]));
      loadPersonalDevelopmentRouteConfigs().then(setAllRouteConfigs).catch(() => setAllRouteConfigs([]));
    }, [])
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
        setLoadedBeneficialActionPolicy(existing.beneficialActionPolicy);
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

  // ---------------------------------------------------------------------
  // Factors (InterferenceItem) -- toggle an existing library item, or add
  // a brand-new one directly; both render their own fields inline below.
  // ---------------------------------------------------------------------

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

  function addNewFactor(category: InterferenceCategory) {
    const newId = generateInterferenceItemId();
    const now = new Date().toISOString();
    const factory = {
      thought: createEmptyThoughtInterferenceItem,
      belief: createEmptyBeliefInterferenceItem,
      urge: createEmptyUrgeInterferenceItem,
      emotion: createEmptyEmotionInterferenceItem,
    }[category];
    const created = factory(newId, "", null, now);
    setItemEdits((current) => ({ ...current, [newId]: created }));
    setConfig((current) => ({
      ...current,
      interferenceItemIds: [...current.interferenceItemIds, newId],
      itemRelationships: { ...current.itemRelationships, [newId]: { actionRelationship: "legacy_unspecified" } },
    }));
  }

  /** Removes a factor created directly in THIS session (never saved yet) -- distinct from toggleItem, which only ever un-selects an existing library item without discarding it. */
  function removeUnsavedNewFactor(itemId: string) {
    setConfig((current) => {
      const interferenceItemIds = current.interferenceItemIds.filter((existing) => existing !== itemId);
      const itemRelationships = { ...current.itemRelationships };
      delete itemRelationships[itemId];
      return { ...current, interferenceItemIds, itemRelationships };
    });
    setItemEdits((current) => {
      const { [itemId]: _dropped, ...rest } = current;
      return rest;
    });
  }

  function resolveItemContent(itemId: string): InterferenceItem | null {
    return itemEdits[itemId] ?? items.find((existing) => existing.id === itemId) ?? null;
  }

  function updateItemField(itemId: string, patch: Record<string, string | boolean | null>) {
    setItemEdits((current) => {
      const base = current[itemId] ?? items.find((existing) => existing.id === itemId);
      if (!base) return current;
      return { ...current, [itemId]: { ...base, ...patch } as InterferenceItem };
    });
  }

  function handleUpgradeItemToActionModelV2(itemId: string) {
    setItemEdits((current) => {
      const base = current[itemId] ?? items.find((existing) => existing.id === itemId);
      if (!base) return current;
      return { ...current, [itemId]: upgradeInterferenceItemToActionModelV2(base, new Date().toISOString()) };
    });
  }

  function copyInterferenceItemForThisProgram(originalItemId: string) {
    const original = resolveItemContent(originalItemId);
    if (!original) return;
    const newId = generateInterferenceItemId();
    const cloned = cloneInterferenceItemForProgram(original, newId, new Date().toISOString());
    setItemEdits((current) => ({ ...current, [newId]: cloned }));
    setConfig((current) => repointInterferenceItemReference(current, originalItemId, newId));
  }

  // ---------------------------------------------------------------------
  // State (StateProfile) -- one per route, inline the moment it's chosen
  // or created.
  // ---------------------------------------------------------------------

  function chooseExistingState() {
    setConfig((current) => ({ ...current, stateInclusionPolicy: "linked" }));
  }

  function chooseDecideInLive() {
    setConfig((current) => ({ ...current, stateInclusionPolicy: "decide_in_live" }));
  }

  function chooseNoState() {
    setConfig((current) => ({ ...current, stateInclusionPolicy: "none", stateProfileId: null }));
    setStateDraft(null);
  }

  function chooseStateProfile(stateProfileId: string) {
    setConfig((current) => ({ ...current, stateProfileId }));
  }

  function handleBuildNewStateInline() {
    const newId = generateStateProfileId();
    const now = new Date().toISOString();
    setStateDraft(createEmptyStateProfile(newId, "", null, now));
    setConfig((current) => ({ ...current, stateInclusionPolicy: "linked", stateProfileId: newId }));
  }

  function resolveStateContent(): StateProfile | null {
    if (!config.stateProfileId) return null;
    if (stateDraft && stateDraft.id === config.stateProfileId) return stateDraft;
    return stateProfiles.find((profile) => profile.id === config.stateProfileId) ?? null;
  }

  function updateStateField<K extends keyof StateProfile>(key: K, value: StateProfile[K]) {
    setStateDraft((current) => {
      const base = current && current.id === config.stateProfileId ? current : (stateProfiles.find((profile) => profile.id === config.stateProfileId) ?? null);
      if (!base) return current;
      return { ...base, [key]: value };
    });
  }

  function updateStateDurationMinutesText(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      updateStateField("actionTimerConfig", null);
      return;
    }
    const parsed = Number(trimmed);
    updateStateField("actionTimerConfig", { durationMinutes: Number.isFinite(parsed) ? parsed : Number.NaN });
  }

  function copyStateProfileForThisProgram() {
    const original = resolveStateContent();
    if (!original) return;
    const newId = generateStateProfileId();
    setStateDraft(cloneStateProfileForProgram(original, newId, new Date().toISOString()));
    setConfig((current) => repointStateProfileReference(current, newId));
  }

  // ---------------------------------------------------------------------
  // Presence -- one per route, inline the moment it's chosen or created.
  // Only the fields the combined-route engine actually reads
  // (name/presenceColor/presenceDwellSeconds/beneficialAction -- see
  // arc/combinedFactorPlan.ts's own resolvePresenceActionOutcome call,
  // which reads ONLY beneficialAction) are inlined here. Gratitude
  // prompt/post-action imagery dwell/the linked-Mini-ARC sub-flow are
  // standalone-Presence-LIVE-only concerns (out of scope for this
  // consolidation, per the approved plan's own "leave standalone ARC
  // systems out of scope") -- still reachable, unchanged, through the
  // legacy PresenceArcEditorScreen fallback route.
  // ---------------------------------------------------------------------

  function selectExistingPresenceArc(presenceArcId: string) {
    setConfig((current) => ({ ...current, linkedPresenceArcId: current.linkedPresenceArcId === presenceArcId ? null : presenceArcId }));
    setPresenceDraft(null);
    setPresenceDraftId(null);
  }

  function handleCreateNewPresenceInline() {
    const newId = generatePresenceArcId();
    setConfig((current) => ({ ...current, linkedPresenceArcId: newId }));
    setPresenceDraftId(newId);
    setPresenceDraft(createEmptyPresenceArcDraft());
  }

  function resolvePresenceContent(): PresenceArcDraft | null {
    if (!config.linkedPresenceArcId) return null;
    if (presenceDraft && presenceDraftId === config.linkedPresenceArcId) return presenceDraft;
    const existing = presenceArcs.find((arc) => arc.id === config.linkedPresenceArcId);
    return existing ? draftFromPresenceArc(existing) : null;
  }

  function updatePresenceField(patch: Partial<PresenceArcDraft>) {
    if (!config.linkedPresenceArcId) return;
    setPresenceDraftId(config.linkedPresenceArcId);
    setPresenceDraft((current) => {
      const base =
        current && presenceDraftId === config.linkedPresenceArcId
          ? current
          : (() => {
              const existing = presenceArcs.find((arc) => arc.id === config.linkedPresenceArcId);
              return existing ? draftFromPresenceArc(existing) : createEmptyPresenceArcDraft();
            })();
      return { ...base, ...patch };
    });
  }

  function copyPresenceArcForThisProgram() {
    const original = resolvePresenceContent();
    if (!original) return;
    const newId = generatePresenceArcId();
    setPresenceDraftId(newId);
    setPresenceDraft(clonePresenceArcDraftForProgram(original));
    setConfig((current) => repointPresenceArcReference(current, newId));
  }

  // ---------------------------------------------------------------------
  // Goal Connection / beneficialActionPolicy -- unchanged from the
  // earlier editor.
  // ---------------------------------------------------------------------

  function toggleGoalConnection() {
    setConfig((current) => ({
      ...current,
      goalConnection: current.goalConnection ? null : { desiredResultText: "", valueText: "", personalReasonText: "" },
    }));
  }

  function patchGoalConnection(patch: Partial<PersonalDevelopmentRouteGoalConnection>) {
    setConfig((current) => (current.goalConnection ? { ...current, goalConnection: { ...current.goalConnection, ...patch } } : current));
  }

  function acknowledgeShared(key: string) {
    setAcknowledgedSharedKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  // ---------------------------------------------------------------------
  // Save -- upserts every locally created/edited factor/State/Presence
  // record first, then the route config itself. A record never touched
  // this session (no entry in itemEdits, and stateDraft/presenceDraft not
  // pointed at it) is never re-written.
  // ---------------------------------------------------------------------

  async function handleSave() {
    if (saving || !isPersonalDevelopmentRouteConfigSaveable(config, effectiveItems, effectiveStateProfiles)) return;
    setSaveError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const edited of Object.values(itemEdits)) {
        await upsertInterferenceItem({ ...edited, updatedAt: now });
      }
      if (stateDraft && stateDraft.id === config.stateProfileId) {
        await upsertStateProfile({ ...stateDraft, updatedAt: now });
      }
      if (presenceDraft && presenceDraftId && presenceDraftId === config.linkedPresenceArcId && isPresenceArcDraftComplete(presenceDraft)) {
        const existingMeta = presenceArcs.find((arc) => arc.id === presenceDraftId);
        await upsertPresenceArc(buildPresenceArcFromDraft(presenceDraft, presenceDraftId, existingMeta?.createdAt ?? now, now));
      }
      await upsertPersonalDevelopmentRouteConfig({ ...config, updatedAt: now });
      // Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
      // correction: a coach changing beneficialActionPolicy on an EXISTING route
      // (never a brand-new one -- there is no progress record yet) reconciles
      // that route's own already-accumulated 4-stage-program stage immediately,
      // via the same pure resolver LIVE's own stage-advancement path uses --
      // zero replay of old sessions, only ever `stage`/`updatedAt` change (see
      // reconcileRouteStageForPolicyChange's own doc). A route with no progress
      // record yet has nothing to reconcile.
      if (loadedBeneficialActionPolicy !== null && loadedBeneficialActionPolicy !== config.beneficialActionPolicy) {
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

  // Effective (baseline + any local, unsaved edits) collections -- fed to
  // every readiness/validation predicate below, so the screen reflects
  // in-progress inline edits live, exactly like the route's own fields do.
  const effectiveItems: InterferenceItem[] = items.map((existing) => itemEdits[existing.id] ?? existing).concat(Object.values(itemEdits).filter((edited) => !items.some((existing) => existing.id === edited.id)));
  const effectiveStateProfiles: StateProfile[] = (() => {
    if (!stateDraft) return stateProfiles;
    const exists = stateProfiles.some((profile) => profile.id === stateDraft.id);
    return exists ? stateProfiles.map((profile) => (profile.id === stateDraft.id ? stateDraft : profile)) : [...stateProfiles, stateDraft];
  })();
  const effectivePresenceArcs: PresenceArc[] = (() => {
    if (!presenceDraftId || !presenceDraft || !isPresenceArcDraftComplete(presenceDraft)) return presenceArcs;
    const existingMeta = presenceArcs.find((arc) => arc.id === presenceDraftId);
    const built = buildPresenceArcFromDraft(presenceDraft, presenceDraftId, existingMeta?.createdAt ?? pendingNow, pendingNow);
    const exists = presenceArcs.some((arc) => arc.id === presenceDraftId);
    return exists ? presenceArcs.map((arc) => (arc.id === presenceDraftId ? built : arc)) : [...presenceArcs, built];
  })();

  const enabledItems = items.filter(isLibraryItemEnabled);
  const enabledStateProfiles = stateProfiles.filter(isLibraryItemEnabled);
  const stateIncluded = config.stateInclusionPolicy !== "none";
  const validation = validatePersonalDevelopmentRouteConfig(config, effectiveItems, effectiveStateProfiles);
  const canSave = isPersonalDevelopmentRouteConfigSaveable(config, effectiveItems, effectiveStateProfiles) && !saving;
  const ready = isPersonalDevelopmentRouteConfigCompleteForPractice(config, effectiveItems, effectiveStateProfiles, effectivePresenceArcs);

  const stateContent = resolveStateContent();
  const stateOtherRoutes = config.stateProfileId ? findRouteConfigsReferencingStateProfile(config.stateProfileId, allRouteConfigs, config.id) : [];
  const stateIsNewlyCreated = config.stateProfileId !== null && !stateProfiles.some((profile) => profile.id === config.stateProfileId);

  const presenceContent = resolvePresenceContent();
  const presenceOtherRoutes = config.linkedPresenceArcId ? findRouteConfigsReferencingPresenceArc(config.linkedPresenceArcId, allRouteConfigs, config.id) : [];
  const presenceIsNewlyCreated = config.linkedPresenceArcId !== null && !presenceArcs.some((arc) => arc.id === config.linkedPresenceArcId);
  const presenceOwnActionSet = (presenceContent?.beneficialAction ?? "").trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "תוכנית חדשה" : "עריכת תוכנית"}</Text>

        <Field
          label="שם התוכנית (רשות)"
          value={config.name ?? ""}
          onChangeText={(text) => setConfig((current) => ({ ...current, name: text.trim().length > 0 ? text : null }))}
          placeholder="לדוגמה: התמודדות עם לחץ בעבודה"
        />

        <Section title="גורמים מפריעים">
          {enabledItems.length === 0 && Object.keys(itemEdits).length === 0 && <Text style={styles.helperText}>עדיין אין פריטי הפרעה. אפשר להוסיף אחד למטה.</Text>}
          {enabledItems.map((item) => {
            const included = config.interferenceItemIds.includes(item.id);
            const content = included ? resolveItemContent(item.id) : null;
            return (
              <View key={item.id} style={styles.itemBlock}>
                <Pressable style={styles.checkboxRow} onPress={() => toggleItem(item.id)}>
                  <Text style={styles.checkboxMark}>{included ? "☑" : "☐"}</Text>
                  <Text style={styles.checkboxLabel}>{`${CATEGORY_PREFIX_LABELS[item.category]}: ${item.name}`}</Text>
                </Pressable>
                {included && content && (
                  <InlineFactorFields
                    item={content}
                    otherRoutesCount={findRouteConfigsReferencingInterferenceItem(item.id, allRouteConfigs, config.id).length}
                    acknowledged={acknowledgedSharedKeys.has(item.id)}
                    onAcknowledge={() => acknowledgeShared(item.id)}
                    onCopy={() => copyInterferenceItemForThisProgram(item.id)}
                    onChange={(patch) => updateItemField(item.id, patch)}
                    onUpgrade={() => handleUpgradeItemToActionModelV2(item.id)}
                  />
                )}
                {included && stateIncluded && content && ownFactorActionIsSet(content) && (
                  <View style={styles.relationshipBlock}>
                    <Text style={styles.question}>האם הפעולה מתוך המצב הרצוי היא גם הפעולה המיטיבה מול הגורם המפריע?</Text>
                    <View style={styles.chipRow}>
                      <Pressable
                        style={[styles.chip, resolveActionRelationshipForItem(config, item.id) === "same_action" && styles.chipSelected]}
                        onPress={() => setConfig((current) => ({ ...current, itemRelationships: { ...current.itemRelationships, [item.id]: { actionRelationship: "same_action" as ActionRelationship } } }))}
                      >
                        <Text style={styles.chipText}>כן -- זו אותה פעולה</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chip, resolveActionRelationshipForItem(config, item.id) === "different_actions" && styles.chipSelected]}
                        onPress={() =>
                          setConfig((current) => ({ ...current, itemRelationships: { ...current.itemRelationships, [item.id]: { actionRelationship: "different_actions" as ActionRelationship } } }))
                        }
                      >
                        <Text style={styles.chipText}>לא -- אלו שתי פעולות שונות</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          {config.interferenceItemIds
            .filter((itemId) => !items.some((existing) => existing.id === itemId))
            .map((itemId) => {
              const content = resolveItemContent(itemId);
              if (!content) return null;
              return (
                <View key={itemId} style={styles.itemBlock}>
                  <View style={styles.newFactorHeaderRow}>
                    <Text style={styles.checkboxLabel}>{`${CATEGORY_PREFIX_LABELS[content.category]} חדש/ה`}</Text>
                    <Pressable onPress={() => removeUnsavedNewFactor(itemId)}>
                      <Text style={styles.removeFactorText}>✕ הסר</Text>
                    </Pressable>
                  </View>
                  <InlineFactorFields
                    item={content}
                    otherRoutesCount={0}
                    acknowledged
                    onAcknowledge={() => {}}
                    onCopy={() => {}}
                    onChange={(patch) => updateItemField(itemId, patch)}
                    onUpgrade={() => handleUpgradeItemToActionModelV2(itemId)}
                  />
                  {stateIncluded && ownFactorActionIsSet(content) && (
                    <View style={styles.relationshipBlock}>
                      <Text style={styles.question}>האם הפעולה מתוך המצב הרצוי היא גם הפעולה המיטיבה מול הגורם המפריע?</Text>
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[styles.chip, resolveActionRelationshipForItem(config, itemId) === "same_action" && styles.chipSelected]}
                          onPress={() => setConfig((current) => ({ ...current, itemRelationships: { ...current.itemRelationships, [itemId]: { actionRelationship: "same_action" as ActionRelationship } } }))}
                        >
                          <Text style={styles.chipText}>כן -- זו אותה פעולה</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.chip, resolveActionRelationshipForItem(config, itemId) === "different_actions" && styles.chipSelected]}
                          onPress={() =>
                            setConfig((current) => ({ ...current, itemRelationships: { ...current.itemRelationships, [itemId]: { actionRelationship: "different_actions" as ActionRelationship } } }))
                          }
                        >
                          <Text style={styles.chipText}>לא -- אלו שתי פעולות שונות</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

          <View style={styles.addFactorRow}>
            {CATEGORY_OPTIONS.map((option) => (
              <Pressable key={option.value} style={styles.addFactorButton} onPress={() => addNewFactor(option.value)}>
                <Text style={styles.addFactorButtonText}>{`+ ${option.label}`}</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="מעבר למצב רצוי תומך">
          <Text style={styles.question}>האם נדרש גם מעבר למצב רצוי תומך?</Text>
          <View style={styles.optionColumn}>
            <Pressable style={[styles.optionButton, config.stateInclusionPolicy === "linked" && styles.optionButtonSelected]} onPress={chooseExistingState}>
              <Text style={styles.optionButtonText}>כן -- לבחור מצב רצוי קיים</Text>
            </Pressable>
            <Pressable style={styles.optionButton} onPress={handleBuildNewStateInline}>
              <Text style={styles.optionButtonText}>כן -- לבנות מצב רצוי חדש</Text>
            </Pressable>
            <Pressable style={[styles.optionButton, config.stateInclusionPolicy === "none" && styles.optionButtonSelected]} onPress={chooseNoState}>
              <Text style={styles.optionButtonText}>לא</Text>
            </Pressable>
            <Pressable style={[styles.optionButton, config.stateInclusionPolicy === "decide_in_live" && styles.optionButtonSelected]} onPress={chooseDecideInLive}>
              <Text style={styles.optionButtonText}>להחליט בזמן התרגול</Text>
            </Pressable>
          </View>

          {(config.stateInclusionPolicy === "linked" || config.stateInclusionPolicy === "decide_in_live") && (
            <View style={styles.stateBlock}>
              <Text style={styles.helperText}>{config.stateInclusionPolicy === "decide_in_live" ? "בחירת מצב רצוי מועמד -- LIVE יחליט האם להשתמש בו." : "בחירת מצב רצוי."}</Text>
              <View style={styles.chipRow}>
                {enabledStateProfiles.map((profile) => (
                  <Pressable key={profile.id} style={[styles.chip, config.stateProfileId === profile.id && styles.chipSelected]} onPress={() => chooseStateProfile(profile.id)}>
                    <Text style={styles.chipText}>{profile.name}</Text>
                  </Pressable>
                ))}
                {enabledStateProfiles.length === 0 && <Text style={styles.helperText}>אין עדיין מצבים רצויים זמינים -- אפשר לבנות אחד חדש למעלה.</Text>}
              </View>

              {stateContent &&
                (() => {
                  if (stateIsNewlyCreated) {
                    return <InlineStateFields profile={stateContent} onChange={updateStateField} onDurationMinutesTextChange={updateStateDurationMinutesText} />;
                  }
                  const shared = isLibraryItemSharedElsewhere(stateOtherRoutes);
                  const acknowledged = acknowledgedSharedKeys.has("state");
                  if (shared && !acknowledged) {
                    return <SharedItemGate otherRoutesCount={stateOtherRoutes.length} onContinue={() => acknowledgeShared("state")} onCopy={copyStateProfileForThisProgram} />;
                  }
                  return <InlineStateFields profile={stateContent} onChange={updateStateField} onDurationMinutesTextChange={updateStateDurationMinutesText} />;
                })()}
              {!stateContent && config.stateProfileId && <Text style={styles.errorText}>המצב הרצוי שנבחר לא נמצא.</Text>}
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
                  <Pressable key={presenceArc.id} style={styles.checkboxRow} onPress={() => selectExistingPresenceArc(presenceArc.id)}>
                    <Text style={styles.checkboxMark}>{config.linkedPresenceArcId === presenceArc.id ? "●" : "○"}</Text>
                    <Text style={styles.checkboxLabel}>{presenceArc.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.addFactorButton} onPress={handleCreateNewPresenceInline}>
                <Text style={styles.addFactorButtonText}>+ פרוטוקול נוכחות חדש</Text>
              </Pressable>

              {presenceContent &&
                (() => {
                  if (presenceIsNewlyCreated) {
                    return <InlinePresenceFields draft={presenceContent} onChange={updatePresenceField} />;
                  }
                  const shared = isLibraryItemSharedElsewhere(presenceOtherRoutes);
                  const acknowledged = acknowledgedSharedKeys.has("presence");
                  if (shared && !acknowledged) {
                    return <SharedItemGate otherRoutesCount={presenceOtherRoutes.length} onContinue={() => acknowledgeShared("presence")} onCopy={copyPresenceArcForThisProgram} />;
                  }
                  return <InlinePresenceFields draft={presenceContent} onChange={updatePresenceField} />;
                })()}
              {presenceContent && !presenceOwnActionSet && (
                <Text style={styles.readinessNote}>לפרוטוקול הנוכחות שנבחר אין עדיין פעולה מיטיבה מול הגורם המפריע -- הוא לא ייחשב מוכן למסלול זה.</Text>
              )}
              {stateIncluded && presenceContent && presenceOwnActionSet && (
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
        <Text style={styles.helperText}>אפשר לשמור תוכנית כטיוטה ולהשלים אותה מאוחר יותר -- זה עדיין לא אומר שהיא מוכנה לתרגול LIVE.</Text>

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

/**
 * The shared-item safety gate -- shown instead of a record's own fields
 * whenever it is referenced by at least one OTHER non-archived route
 * (arc/libraryItemUsage.ts) and this session hasn't already acknowledged
 * editing it in place. Never redirects anywhere; the count alone is
 * enough (per the approved plan's own "does not need to redirect the
 * user to the legacy editors" correction).
 */
function SharedItemGate({ otherRoutesCount, onContinue, onCopy }: { otherRoutesCount: number; onContinue: () => void; onCopy: () => void }) {
  return (
    <View style={styles.sharedGateBox}>
      <Text style={styles.sharedGateText}>{`פריט זה משמש גם ב-${otherRoutesCount} ${otherRoutesCount === 1 ? "תוכנית נוספת" : "תוכניות נוספות"}.`}</Text>
      <View style={styles.sharedGateActions}>
        <Pressable style={styles.sharedGateButton} onPress={onContinue}>
          <Text style={styles.sharedGateButtonText}>{`המשך לערוך (ישפיע על ${otherRoutesCount === 1 ? "התוכנית הנוספת" : "התוכניות הנוספות"})`}</Text>
        </Pressable>
        <Pressable style={[styles.sharedGateButton, styles.sharedGateCopyButton]} onPress={onCopy}>
          <Text style={styles.sharedGateButtonText}>צור עותק לתוכנית זו בלבד</Text>
        </Pressable>
      </View>
    </View>
  );
}

type FactorActionBearingItem = Extract<InterferenceItem, { category: "thought" | "belief" | "urge" }>;

function FactorActionInlineField({ item, onChange, onUpgrade }: { item: FactorActionBearingItem; onChange: (patch: Record<string, string | boolean | null>) => void; onUpgrade: () => void }) {
  const hasOwnAction = isInterferenceItemCompleteForPractice(item, false);
  return (
    <View>
      <Field
        label="פעולה מיטיבה מול הגורם המפריע"
        value={item.beneficialActionAgainstFactor ?? ""}
        onChangeText={(text) => onChange({ beneficialActionAgainstFactor: text.trim().length > 0 ? text : null })}
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

/**
 * The inline per-category field set -- same fields, same labels, same
 * behavior as the earlier separate build/InterferenceItemEditorScreen.tsx,
 * just rendered in place instead of on its own screen. Wraps the shared
 * safety gate when the item is used elsewhere and not yet acknowledged.
 */
function InlineFactorFields({
  item,
  otherRoutesCount,
  acknowledged,
  onAcknowledge,
  onCopy,
  onChange,
  onUpgrade,
}: {
  item: InterferenceItem;
  otherRoutesCount: number;
  acknowledged: boolean;
  onAcknowledge: () => void;
  onCopy: () => void;
  onChange: (patch: Record<string, string | boolean | null>) => void;
  onUpgrade: () => void;
}) {
  if (otherRoutesCount > 0 && !acknowledged) {
    return <SharedItemGate otherRoutesCount={otherRoutesCount} onContinue={onAcknowledge} onCopy={onCopy} />;
  }

  return (
    <View style={styles.inlineFieldsBlock}>
      <Field label="שם (חובה)" value={item.name} onChangeText={(text) => onChange({ name: text })} placeholder="שם קצר לפריט" />
      <Field
        label="הקשר או מצב שבו זה מופיע"
        value={item.situationContext ?? ""}
        onChangeText={(text) => onChange({ situationContext: text.trim().length > 0 ? text : null })}
        placeholder="מתי או איפה זה נוטה להופיע"
      />
      <Field label="מה בדרך כלל מפעיל את זה" value={item.triggerInfo ?? ""} onChangeText={(text) => onChange({ triggerInfo: text.trim().length > 0 ? text : null })} placeholder="טריגר אופייני" />

      {item.category === "thought" && (
        <>
          <Field label="המחשבה המפריעה" value={item.thoughtText ?? ""} onChangeText={(text) => onChange({ thoughtText: text.trim().length > 0 ? text : null })} placeholder="נוסח המחשבה" multiline />
          <Field
            label="פרשנות חלופית או מחשבה מחליפה"
            value={item.alternativeInterpretation ?? ""}
            onChangeText={(text) => onChange({ alternativeInterpretation: text.trim().length > 0 ? text : null })}
            placeholder="פרשנות מאוזנת יותר"
            multiline
          />
          <FactorActionInlineField item={item} onChange={onChange} onUpgrade={onUpgrade} />
        </>
      )}

      {item.category === "belief" && (
        <>
          <Field label="האמונה" value={item.beliefText ?? ""} onChangeText={(text) => onChange({ beliefText: text.trim().length > 0 ? text : null })} placeholder="נוסח האמונה" multiline />
          <Field
            label="אמונה תומכת או חלופית"
            value={item.supportiveBelief ?? ""}
            onChangeText={(text) => onChange({ supportiveBelief: text.trim().length > 0 ? text : null })}
            placeholder="אמונה מאוזנת יותר"
            multiline
          />
          <FactorActionInlineField item={item} onChange={onChange} onUpgrade={onUpgrade} />
        </>
      )}

      {item.category === "emotion" && (
        <>
          <Field label="שם הרגש" value={item.emotionName ?? ""} onChangeText={(text) => onChange({ emotionName: text.trim().length > 0 ? text : null })} placeholder="לדוגמה: תסכול" />
          <Text style={styles.helperText}>רגש תמיד מקושר למצב רצוי -- הפעולה הסופית שלו היא פעולת המצב הרצוי עצמה, ללא פעולה נפרדת מול הגורם המפריע.</Text>
        </>
      )}

      {item.category === "urge" && (
        <>
          <Field label="שם או סוג הדחף" value={item.urgeName ?? ""} onChangeText={(text) => onChange({ urgeName: text.trim().length > 0 ? text : null })} placeholder="לדוגמה: דחף לעישון" />
          <Field
            label="פעולת עצירה מונעת"
            value={item.preventiveStoppingAction ?? ""}
            onChangeText={(text) => onChange({ preventiveStoppingAction: text.trim().length > 0 ? text : null })}
            placeholder="פעולה שעוצרת את הדחף מבעוד מועד"
          />
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>אופן ייצוג הדחף</Text>
            <View style={styles.chipRow}>
              {REPRESENTATION_OPTIONS.map((option) => (
                <Pressable key={option.value} style={[styles.chip, item.representationPreference === option.value && styles.chipSelected]} onPress={() => onChange({ representationPreference: option.value })}>
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Field
            label="קידוד חזותי קיים"
            value={item.visualEncodingConfig ?? ""}
            onChangeText={(text) => onChange({ visualEncodingConfig: text.trim().length > 0 ? text : null })}
            placeholder="תיאור חזותי לקידוד (רשות)"
          />
          <Field
            label="קידוד תחושתי קיים"
            value={item.sensoryEncodingConfig ?? ""}
            onChangeText={(text) => onChange({ sensoryEncodingConfig: text.trim().length > 0 ? text : null })}
            placeholder="תיאור תחושתי לקידוד (רשות)"
          />
          <FactorActionInlineField item={item} onChange={onChange} onUpgrade={onUpgrade} />
        </>
      )}
    </View>
  );
}

/** The inline State field set, mirroring build/StateProfileEditorScreen.tsx's own "ויסות והתגלמות" + "קידוד" + "טיימר פעולה" sections. */
function InlineStateFields({
  profile,
  onChange,
  onDurationMinutesTextChange,
}: {
  profile: StateProfile;
  onChange: <K extends keyof StateProfile>(key: K, value: StateProfile[K]) => void;
  onDurationMinutesTextChange: (text: string) => void;
}) {
  const durationMinutesText = profile.actionTimerConfig?.durationMinutes != null ? String(profile.actionTimerConfig.durationMinutes) : "";
  return (
    <View style={styles.inlineFieldsBlock}>
      <Field label="שם המצב (חובה)" value={profile.name} onChangeText={(text) => onChange("name", text)} placeholder="לדוגמה: רוגע יציב" />
      <Field label="מנטרה" value={profile.stateMantra ?? ""} onChangeText={(text) => onChange("stateMantra", text.trim().length > 0 ? text : null)} placeholder="משפט קצר לחיזוק המצב" />
      <Field label="עוגן ויסות" value={profile.regulationAnchor ?? ""} onChangeText={(text) => onChange("regulationAnchor", text.trim().length > 0 ? text : null)} placeholder="פעולה או מוקד קשב שמסייע לוויסות" />
      <Field label="רמז שפת גוף" value={profile.bodyLanguageCue ?? ""} onChangeText={(text) => onChange("bodyLanguageCue", text.trim().length > 0 ? text : null)} placeholder="יציבה או תנוחה" />
      <Field label="תחושה גופנית רצויה" value={profile.desiredBodySensation ?? ""} onChangeText={(text) => onChange("desiredBodySensation", text.trim().length > 0 ? text : null)} placeholder="איך התחושה הרצויה מורגשת בגוף" />
      <Field label="רמז קידוד" value={profile.encodingCue ?? ""} onChangeText={(text) => onChange("encodingCue", text.trim().length > 0 ? text : null)} placeholder="רמז קצר לקידוד המצב" />
      <Field label="פעולה מתוך המצב הרצוי" value={profile.action ?? ""} onChangeText={(text) => onChange("action", text.trim().length > 0 ? text : null)} placeholder="פעולה מיטיבה שמבטאת את המצב הרצוי" multiline />
      <Field label="משך פעולה בדקות (רשות)" value={durationMinutesText} onChangeText={onDurationMinutesTextChange} placeholder="לדוגמה: 5" keyboardType="numeric" />
      {!isStateProfileCompleteForPractice(profile) && (
        <Text style={styles.readinessNote}>מצב רצוי מוכן לתרגול LIVE רק לאחר שהוגדרו עבורו עוגן ויסות, רמז קידוד, ופעולה מתוך המצב הרצוי.</Text>
      )}
    </View>
  );
}

/** The inline Presence field set -- scoped to exactly what the combined-route engine reads (name/presenceColor/presenceDwellSeconds/beneficialAction); see this file's own module doc. */
function InlinePresenceFields({ draft, onChange }: { draft: PresenceArcDraft; onChange: (patch: Partial<PresenceArcDraft>) => void }) {
  return (
    <View style={styles.inlineFieldsBlock}>
      <Field label="שם (חובה)" value={draft.name} onChangeText={(text) => onChange({ name: text })} placeholder="לדוגמה: נוכחות לפני ישיבה" />
      <Field label="צבע אנרגיה (רשות)" value={draft.presenceColor} onChangeText={(text) => onChange({ presenceColor: text })} placeholder="לדוגמה: כחול" />
      <Field label="משך שהייה בשניות (רשות)" value={draft.presenceDwellSeconds} onChangeText={(text) => onChange({ presenceDwellSeconds: text })} placeholder="ריק פירושו ברירת המחדל" keyboardType="numeric" />
      <Field label="פעולה מיטיבה מול הגורם המפריע" value={draft.beneficialAction} onChangeText={(text) => onChange({ beneficialAction: text })} placeholder="הפעולה שמבוצעת בפועל" multiline />
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
  newFactorHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  removeFactorText: { color: "#c0392b", fontSize: 14 },
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
  textInputMultiline: { minHeight: 70, textAlignVertical: "top" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6 },
  inlineFieldsBlock: { marginTop: 8, paddingStart: 12, borderStartWidth: 2, borderStartColor: "#E6F4FE" },
  addFactorRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  addFactorButton: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginTop: 8 },
  addFactorButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  sharedGateBox: { backgroundColor: "#FDF3D9", borderRadius: 10, padding: 14, marginTop: 8 },
  sharedGateText: { fontSize: 14, textAlign: "right", color: "#8a6d1a", marginBottom: 10, lineHeight: 19 },
  sharedGateActions: { gap: 8 },
  sharedGateButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  sharedGateCopyButton: { backgroundColor: "#3d8fa8" },
  sharedGateButtonText: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center" },
  legacyNoticeBox: { backgroundColor: "#FDF3D9", borderRadius: 10, padding: 12, marginTop: 4 },
  legacyNoticeText: { fontSize: 13, textAlign: "right", color: "#8a6d1a", lineHeight: 19, marginBottom: 8 },
  upgradeButton: { alignItems: "flex-end" },
  upgradeButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
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

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  archivePersonalDevelopmentRouteConfig,
  disablePersonalDevelopmentRouteConfig,
  loadCombinedInterferenceSelections,
  loadInterferenceItems,
  loadPersonalDevelopmentRouteConfigs,
  loadPersonalDevelopmentRouteProgressStore,
  loadPresenceArcs,
  loadStateProfiles,
  restorePersonalDevelopmentRouteConfig,
  savePersonalDevelopmentRouteConfigs,
} from "../data/storage.ts";
import type { PersonalDevelopmentRouteProgressStore } from "../data/storage.ts";
import { autoMigrateAllLegacyCombinedSelections } from "../arc/personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { isPersonalDevelopmentRouteConfigCompleteForPractice } from "../arc/personalDevelopmentRouteConfigReadiness.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { PresenceArc } from "../arc/types.ts";
import type { LibraryItemStatus } from "../arc/libraryItemStatus.ts";

const INTERFERENCE_TYPE_LABELS = {
  thought: "מחשבה",
  belief: "אמונה",
  emotion: "רגש",
  urge: "דחף",
} as const;

const STATUS_LABELS: Record<LibraryItemStatus, string> = {
  enabled: "פעיל",
  disabled: "מושבת",
  archived: "בארכיון",
};

const STATE_INCLUSION_LABELS = {
  linked: "עם מצב רצוי",
  none: "ללא מצב רצוי",
  decide_in_live: "החלטה בזמן התרגול",
};

/**
 * build/PersonalDevelopmentRouteListScreen.tsx (route: /personal-development-routes)
 *
 * Personal Development consolidation task: "My Routine" -- the ONE
 * visible list of every saved Personal Development program
 * (PersonalDevelopmentRouteConfig, arc/personalDevelopmentRouteConfig.ts).
 * Originally built as Phase 14B-2's own management screen (mirroring
 * build/StateProfileListScreen.tsx's row+action-button conventions);
 * relabeled and trimmed here per the approved consolidation plan, with no
 * structural change to its own Edit/Practice wiring -- Edit always opens
 * the same shared BUILD (PersonalDevelopmentRouteEditorScreen.tsx) with
 * the selected program loaded; Practice always opens the same shared
 * LIVE entry (via /live/select's own focusRouteId param) with the
 * selected program loaded. The user may have many saved programs -- this
 * list is never restricted to one active/practice-ready program.
 *
 * Archived routes are hidden by default (showArchived toggle reveals
 * them) but never deleted -- disable/archive/restore only ever change
 * `status` via the existing CRUD, the same record/id is kept forever.
 */
export default function PersonalDevelopmentRouteListScreen() {
  const [configs, setConfigs] = useState<PersonalDevelopmentRouteConfig[] | null>(null);
  const [items, setItems] = useState<InterferenceItem[]>([]);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [presenceArcs, setPresenceArcs] = useState<PresenceArc[]>([]);
  const [progressStore, setProgressStore] = useState<PersonalDevelopmentRouteProgressStore>({});
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadPersonalDevelopmentRouteConfigs(), loadCombinedInterferenceSelections(), loadInterferenceItems(), loadStateProfiles(), loadPresenceArcs(), loadPersonalDevelopmentRouteProgressStore()])
      .then(async ([loadedConfigs, legacySelections, loadedItems, loadedStates, loadedPresence, loadedProgress]) => {
        // Personal Development consolidation task, step 4: every enabled
        // legacy CombinedInterferenceSelection with no route yet becomes
        // one automatically -- additive and idempotent (see
        // arc/personalDevelopmentRouteConfig.ts's own
        // autoMigrateAllLegacyCombinedSelections doc), so a coach's
        // pre-consolidation combined-selection work still shows up here
        // without the old manual "convert" button.
        const { configs: migratedConfigs, createdCount } = autoMigrateAllLegacyCombinedSelections(loadedConfigs, legacySelections, new Date().toISOString());
        if (createdCount > 0) await savePersonalDevelopmentRouteConfigs(migratedConfigs);
        setConfigs(migratedConfigs);
        setItems(loadedItems);
        setStateProfiles(loadedStates);
        setPresenceArcs(loadedPresence);
        setProgressStore(loadedProgress);
      })
      .catch((error) => {
        console.warn("[PersonalDevelopmentRouteListScreen] Failed to load -- showing the empty state.", error);
        setConfigs([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDisable(id: string) {
    await disablePersonalDevelopmentRouteConfig(id, new Date().toISOString());
    reload();
  }

  async function handleArchive(id: string) {
    await archivePersonalDevelopmentRouteConfig(id, new Date().toISOString());
    reload();
  }

  async function handleRestore(id: string) {
    await restorePersonalDevelopmentRouteConfig(id, new Date().toISOString());
    reload();
  }

  if (!configs) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const visibleConfigs = configs.filter((config) => showArchived || config.status !== "archived");

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>השגרה שלי</Text>
        <Text style={styles.subtitle}>כל התוכניות השמורות שלך. כל תוכנית נערכת דרך אותו BUILD ומתורגלת דרך אותו LIVE.</Text>

        <Pressable style={styles.toggleRow} onPress={() => setShowArchived((current) => !current)}>
          <Text style={styles.toggleText}>{showArchived ? "הסתר תוכניות בארכיון" : "הצג גם תוכניות בארכיון"}</Text>
        </Pressable>

        {configs.length === 0 && <Text style={styles.emptyText}>עדיין אין כאן תוכניות. אפשר להוסיף אחת חדשה למטה.</Text>}
        {configs.length > 0 && visibleConfigs.length === 0 && <Text style={styles.emptyText}>כל התוכניות שלך נמצאות כרגע בארכיון.</Text>}

        {visibleConfigs.map((config) => {
          const ready = isPersonalDevelopmentRouteConfigCompleteForPractice(config, items, stateProfiles, presenceArcs);
          const progress = progressStore[config.id] ?? null;
          return (
            <View key={config.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{config.name ?? `${config.interferenceItemIds.length} גורמים${config.presenceEnabled ? " + נוכחות" : ""}`}</Text>
                <Text style={[styles.statusBadge, styles[`statusBadge_${config.status}`]]}>{STATUS_LABELS[config.status]}</Text>
              </View>
              {config.name && <Text style={styles.cardRow}>{`${config.interferenceItemIds.length} גורמים${config.presenceEnabled ? " + נוכחות" : ""}`}</Text>}
              <Text style={styles.cardRow}>{STATE_INCLUSION_LABELS[config.stateInclusionPolicy]}</Text>
              <Text style={[styles.readinessBadge, ready ? styles.readinessBadge_ready : styles.readinessBadge_draft]}>{ready ? "מוכן לתרגול" : "טיוטה -- לא מוכן לתרגול"}</Text>

              {progress && progress.completedSessions > 0 && (
                <View style={styles.progressBlock}>
                  <Text style={styles.progressLine}>{`סשנים שהושלמו: ${progress.completedSessions}`}</Text>
                  {(Object.keys(INTERFERENCE_TYPE_LABELS) as (keyof typeof INTERFERENCE_TYPE_LABELS)[]).map(
                    (type) =>
                      progress.completedByInterferenceType[type] > 0 && (
                        <Text key={type} style={styles.progressLine}>{`${INTERFERENCE_TYPE_LABELS[type]}: ${progress.completedByInterferenceType[type]}`}</Text>
                      )
                  )}
                  {progress.embeddedPresenceUses > 0 && <Text style={styles.progressLine}>{`תרגולי נוכחות קצרים: ${progress.embeddedPresenceUses}`}</Text>}
                  {progress.fullPresenceCompletions > 0 && <Text style={styles.progressLine}>{`נוכחות מלאה: ${progress.fullPresenceCompletions}`}</Text>}
                </View>
              )}

              {ready && config.status === "enabled" && (
                <View style={styles.cardActions}>
                  {/*
                   * Adaptive ARC architecture task (unified PD/ARC Goal),
                   * correction round 3: this management screen manages routes
                   * (edit/activate/progress) but never launches a protocol
                   * mode directly -- every "practice" command routes through
                   * the one shared unified entry controller
                   * (build/LiveModeSelectScreen.tsx), which resolves this
                   * route's own current stage and available modes itself.
                   * Never a second place that decides "full" vs "mini" vs
                   * "route_link" vs "action_only".
                   */}
                  <Pressable
                    style={styles.startButton}
                    onPress={() => router.push({ pathname: "/live/select", params: { focusRouteId: config.id } })}
                  >
                    <Text style={styles.startButtonText}>▶ תרגול</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.cardActions}>
                <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: "/personal-development-routes/[id]", params: { id: config.id } })}>
                  <Text style={styles.actionButtonText}>ערוך</Text>
                </Pressable>
                {config.status === "enabled" && (
                  <>
                    <Pressable style={styles.actionButton} onPress={() => handleDisable(config.id)}>
                      <Text style={styles.actionButtonText}>השבת</Text>
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={() => handleArchive(config.id)}>
                      <Text style={styles.actionButtonText}>העבר לארכיון</Text>
                    </Pressable>
                  </>
                )}
                {config.status === "disabled" && (
                  <>
                    <Pressable style={styles.actionButton} onPress={() => handleRestore(config.id)}>
                      <Text style={styles.actionButtonText}>הפעל</Text>
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={() => handleArchive(config.id)}>
                      <Text style={styles.actionButtonText}>העבר לארכיון</Text>
                    </Pressable>
                  </>
                )}
                {config.status === "archived" && (
                  <Pressable style={styles.actionButton} onPress={() => handleRestore(config.id)}>
                    <Text style={styles.actionButtonText}>שחזר</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/personal-development-routes/[id]", params: { id: "new" } })}>
          <Text style={styles.buttonText}>+ מסלול חדש</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>חזרה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 12 },
  toggleRow: { alignItems: "flex-end", marginBottom: 16 },
  toggleText: { fontSize: 14, color: "#0a7ea4" },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  card: { marginBottom: 16, borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14 },
  cardHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  statusBadge: { fontSize: 12, fontWeight: "600", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, overflow: "hidden" },
  statusBadge_enabled: { backgroundColor: "#E3F7E8", color: "#1a6b4a" },
  statusBadge_disabled: { backgroundColor: "#FDF3D9", color: "#8a6d1a" },
  statusBadge_archived: { backgroundColor: "#F0F0F0", color: "#666" },
  cardRow: { fontSize: 14, textAlign: "right", color: "#333", marginTop: 6 },
  readinessBadge: { fontSize: 12, fontWeight: "600", textAlign: "right", marginTop: 6 },
  readinessBadge_ready: { color: "#1a6b4a" },
  readinessBadge_draft: { color: "#8a6d1a" },
  progressBlock: { marginTop: 8 },
  progressLine: { fontSize: 13, textAlign: "right", color: "#555" },
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, justifyContent: "flex-end" },
  startButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  startButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 20, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

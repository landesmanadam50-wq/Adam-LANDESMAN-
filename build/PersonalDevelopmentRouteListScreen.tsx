import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  archivePersonalDevelopmentRouteConfig,
  disablePersonalDevelopmentRouteConfig,
  loadInterferenceItems,
  loadPersonalDevelopmentRouteConfigs,
  loadPresenceArcs,
  loadStateProfiles,
  restorePersonalDevelopmentRouteConfig,
} from "../data/storage.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { isPersonalDevelopmentRouteConfigCompleteForPractice } from "../arc/personalDevelopmentRouteConfigReadiness.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { PresenceArc } from "../arc/types.ts";
import type { LibraryItemStatus } from "../arc/libraryItemStatus.ts";

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
 * Adaptive ARC architecture task, Phase 14B-2: the management screen for
 * PersonalDevelopmentRouteConfig (arc/personalDevelopmentRouteConfig.ts)
 * -- mirrors build/StateProfileListScreen.tsx's own row+action-button
 * conventions exactly. This is the State-INDEPENDENT entry point the
 * approved architecture requires: unlike
 * build/CombinedInterferenceSelectionScreen.tsx (reached only from a
 * StateProfile card), a route here can be created without ever choosing
 * a StateProfile first -- see this screen's own "+ מסלול חדש" button.
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
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadPersonalDevelopmentRouteConfigs(), loadInterferenceItems(), loadStateProfiles(), loadPresenceArcs()])
      .then(([loadedConfigs, loadedItems, loadedStates, loadedPresence]) => {
        setConfigs(loadedConfigs);
        setItems(loadedItems);
        setStateProfiles(loadedStates);
        setPresenceArcs(loadedPresence);
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
        <Text style={styles.title}>מסלולי תרגול משולבים</Text>
        <Text style={styles.subtitle}>יצירה וניהול של מסלולי תרגול המשלבים כמה גורמים מפריעים, עם או בלי מצב רצוי.</Text>

        <Pressable style={styles.toggleRow} onPress={() => setShowArchived((current) => !current)}>
          <Text style={styles.toggleText}>{showArchived ? "הסתר מסלולים בארכיון" : "הצג גם מסלולים בארכיון"}</Text>
        </Pressable>

        {configs.length === 0 && <Text style={styles.emptyText}>עדיין אין כאן מסלולי תרגול משולבים. אפשר להוסיף אחד חדש למטה.</Text>}
        {configs.length > 0 && visibleConfigs.length === 0 && <Text style={styles.emptyText}>כל מסלולי התרגול שלך נמצאים כרגע בארכיון.</Text>}

        {visibleConfigs.map((config) => {
          const ready = isPersonalDevelopmentRouteConfigCompleteForPractice(config, items, stateProfiles, presenceArcs);
          return (
            <View key={config.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{`${config.interferenceItemIds.length} גורמים${config.presenceEnabled ? " + נוכחות" : ""}`}</Text>
                <Text style={[styles.statusBadge, styles[`statusBadge_${config.status}`]]}>{STATUS_LABELS[config.status]}</Text>
              </View>
              <Text style={styles.cardRow}>{STATE_INCLUSION_LABELS[config.stateInclusionPolicy]}</Text>
              <Text style={[styles.readinessBadge, ready ? styles.readinessBadge_ready : styles.readinessBadge_draft]}>{ready ? "מוכן לתרגול" : "טיוטה -- לא מוכן לתרגול"}</Text>

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
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, justifyContent: "flex-end" },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 20, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

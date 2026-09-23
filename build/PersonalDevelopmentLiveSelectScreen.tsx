import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { loadInterferenceItems, loadPersonalDevelopmentRouteConfigs, loadPersonalDevelopmentRouteProgressStore, loadPresenceArcs, loadStateProfiles } from "../data/storage.ts";
import type { PersonalDevelopmentRouteProgressStore } from "../data/storage.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { selectActiveCombinedRoutesForLive } from "../arc/personalDevelopmentRouteConfigReadiness.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { PresenceArc } from "../arc/types.ts";
import { CombinedRoutesSection } from "./CombinedRoutesSection.tsx";

/**
 * build/PersonalDevelopmentLiveSelectScreen.tsx (route: /personal-development-routes/live-select)
 *
 * Personal Development consolidation task, step 5: the PD main screen's
 * own "One Dynamic LIVE" entry -- deliberately its OWN screen, never a
 * reuse of build/LiveModeSelectScreen.tsx's own `mode=self_development`
 * branch, because that screen still surfaces the legacy ArcBuild picker
 * (its own "ARC Build" chooser step) whenever the trainee happens to
 * have any saved ArcBuilds -- exactly the kind of legacy-system leakage
 * into the "normal Personal Development interface" the approved
 * consolidation plan's decision 1 forbids ("legacy routes... must not
 * appear in the normal Personal Development interface"). This screen
 * shows ONLY ready Personal Development programs
 * (PersonalDevelopmentRouteConfig, via the exact same
 * selectActiveCombinedRoutesForLive selector every other PD LIVE entry
 * point already uses) and renders them through the SAME shared
 * build/CombinedRoutesSection.tsx component build/LiveModeSelectScreen.tsx
 * also uses -- "one dynamic LIVE" means one real implementation, reused,
 * never a second parallel rendering of the same Full ARC / Mini ARC /
 * advanced-Route-Link/Action-Only logic. No ArcBuild, no ARC Goal, no
 * "ARC רגיל" chooser step anywhere on this screen.
 */
export default function PersonalDevelopmentLiveSelectScreen() {
  const [routeConfigs, setRouteConfigs] = useState<PersonalDevelopmentRouteConfig[]>([]);
  const [items, setItems] = useState<InterferenceItem[]>([]);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [presenceArcs, setPresenceArcs] = useState<PresenceArc[]>([]);
  const [progressStore, setProgressStore] = useState<PersonalDevelopmentRouteProgressStore>({});
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadPersonalDevelopmentRouteConfigs(), loadInterferenceItems(), loadStateProfiles(), loadPresenceArcs(), loadPersonalDevelopmentRouteProgressStore()])
      .then(([configs, loadedItems, loadedStates, loadedPresence, loadedProgress]) => {
        setRouteConfigs(configs);
        setItems(loadedItems);
        setStateProfiles(loadedStates);
        setPresenceArcs(loadedPresence);
        setProgressStore(loadedProgress);
        setLoaded(true);
      })
      .catch((error) => {
        console.warn("[PersonalDevelopmentLiveSelectScreen] Failed to load Personal Development programs.", error);
        setRouteConfigs([]);
        setLoaded(true);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const readyRoutes = selectActiveCombinedRoutesForLive(routeConfigs, items, stateProfiles, presenceArcs);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>מה תרצה לתרגל?</Text>
        {readyRoutes.length === 0 && (
          <Text style={styles.emptyText}>עדיין אין תוכניות מוכנות לתרגול. אפשר להשלים תוכנית קיימת או לבנות אחת חדשה.</Text>
        )}
        <CombinedRoutesSection routes={readyRoutes} progressStore={progressStore} />
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
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666" },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});

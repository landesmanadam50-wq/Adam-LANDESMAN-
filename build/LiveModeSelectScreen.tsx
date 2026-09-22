import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { loadArcBuilds, loadInterferenceItems, loadPersonalDevelopmentRouteConfigs, loadPersonalDevelopmentRouteProgressStore, loadPresenceArcs, loadStateProfiles } from "../data/storage.ts";
import type { PersonalDevelopmentRouteProgressStore } from "../data/storage.ts";
import { FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL } from "../arc/futureArcLink.ts";
import type { ArcBuild, PresenceArc } from "../arc/types.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { selectActiveCombinedRoutesForLive } from "../arc/personalDevelopmentRouteConfigReadiness.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import { resolveAvailableEntryModes } from "../arc/personalDevelopmentRouteProgress.ts";
import type { CombinedFactorMode } from "../arc/combinedFactorPlan.ts";

const STATE_INCLUSION_LABELS = {
  linked: "עם מצב רצוי",
  none: "ללא מצב רצוי",
  decide_in_live: "החלטה בזמן התרגול",
};

/**
 * build/LiveModeSelectScreen.tsx (route: /live/select)
 *
 * ARC Link task: the new "מה תרצה לתרגל עכשיו?" entry point, reached
 * from Home's "התחל סשן LIVE" instead of navigating straight to
 * live/LiveSessionScreen.tsx. Deliberately a NEW screen in FRONT of the
 * existing entry point rather than a change inside
 * LiveSessionScreen.tsx itself -- that component's own buildId-
 * resolution/resume/routine logic (see its own module doc) is left
 * completely untouched; this screen just resolves which ArcBuild to
 * run (reusing the exact same "auto-pick when exactly one, else show a
 * picker" pattern LiveSessionScreen already used internally) and then
 * asks which mode. "ARC רגיל" pushes to the EXACT SAME /live route
 * with the SAME buildId param as before this feature existed --
 * normal ARC's own entry point and behavior are completely unchanged.
 *
 * ARC Goal task: one new top-level gate ("uiStep" below), shown BEFORE
 * any ArcBuild is loaded -- "ARC Goal" (spec section 6's "two clear
 * primary options") pushes straight to /arc-goal/select
 * (build/ArcGoalSelectScreen.tsx), never touching this screen's own
 * ArcBuild-picker state at all. "ARC רגיל" reveals the EXACT same
 * picker/mode flow this screen has always had, completely unchanged.
 *
 * New architecture task, Phase 1 (spec section 2): an optional
 * `mode=self_development` param -- set only by
 * build/SelfDevelopmentDashboardScreen.tsx's own "LIVE התפתחות אישית"
 * button -- skips this screen's own mixed "ARC רגיל / ARC Goal" chooser
 * entirely, starting directly at the ArcBuild-picker step. Self
 * Development LIVE must never offer ARC Goal (spec section 2's "must
 * not require... ARC Goal"); every OTHER caller (the original Home
 * entry point, routine "start" buttons) omits this param and keeps
 * today's exact chooser behavior, unchanged.
 *
 * Regression repair task: this screen never gained awareness of
 * PersonalDevelopmentRouteConfig (build/PersonalDevelopmentRouteListScreen.tsx's
 * own combined routes, Phase 14B-2/14B-4) -- an active, ready route could
 * only ever be started from that management screen directly, never from
 * here. `readyCombinedRoutes` below is loaded on every focus (regardless
 * of `mode`, unlike the ArcBuild list, so it is visible from the chooser
 * too) and rendered via `CombinedRoutesSection` on every step of this
 * screen, reusing the EXACT existing `/personal-development-routes/[id]/live`
 * route (live/CombinedInterferenceLiveScreen.tsx + its combined LIVE
 * controller) -- no parallel flow, no new storage. Only `status ===
 * "enabled"` and `isPersonalDevelopmentRouteConfigCompleteForPractice`
 * routes are shown, matching the management screen's own start-button
 * gate exactly, and the section renders nothing at all when the list is
 * empty. The ArcBuild-empty redirect to /build is also gated on this list
 * now, so a trainee with only combined routes and zero ArcBuilds still
 * reaches this screen instead of being redirected away from it.
 */
export default function LiveModeSelectScreen() {
  // Weekly Routine + ARC Link management task: an optional `buildId` param
  // -- when a weekly action is linked to a specific ArcBuild, its own
  // "start" button pre-selects that build directly instead of always
  // falling back to "auto-pick when exactly one, else show a picker".
  // Absent (the original entry point from Home), behavior is unchanged.
  const { buildId, mode: modeParam } = useLocalSearchParams<{ buildId?: string; mode?: string }>();
  const [mode, setMode] = useState<"chooser" | "regular">(modeParam === "self_development" ? "regular" : "chooser");
  const [builds, setBuilds] = useState<ArcBuild[] | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<ArcBuild | null>(null);

  const [routeConfigs, setRouteConfigs] = useState<PersonalDevelopmentRouteConfig[]>([]);
  const [routeInterferenceItems, setRouteInterferenceItems] = useState<InterferenceItem[]>([]);
  const [routeStateProfiles, setRouteStateProfiles] = useState<StateProfile[]>([]);
  const [routePresenceArcs, setRoutePresenceArcs] = useState<PresenceArc[]>([]);
  const [routeProgressStore, setRouteProgressStore] = useState<PersonalDevelopmentRouteProgressStore>({});
  const [combinedRoutesLoaded, setCombinedRoutesLoaded] = useState(false);

  const reload = useCallback(() => {
    loadArcBuilds()
      .then((loaded) => {
        setBuilds(loaded);
        const preSelected = buildId ? loaded.find((build) => build.id === buildId) ?? null : null;
        if (preSelected) {
          setSelectedBuild(preSelected);
        } else if (loaded.length === 1) {
          setSelectedBuild(loaded[0]);
        }
      })
      .catch((error) => {
        console.warn("[LiveModeSelectScreen] Failed to load ARC Builds.", error);
        setBuilds([]);
      });
  }, [buildId]);

  const reloadCombinedRoutes = useCallback(() => {
    Promise.all([loadPersonalDevelopmentRouteConfigs(), loadInterferenceItems(), loadStateProfiles(), loadPresenceArcs(), loadPersonalDevelopmentRouteProgressStore()])
      .then(([configs, items, states, presence, progressStore]) => {
        setRouteConfigs(configs);
        setRouteInterferenceItems(items);
        setRouteStateProfiles(states);
        setRoutePresenceArcs(presence);
        setRouteProgressStore(progressStore);
        setCombinedRoutesLoaded(true);
      })
      .catch((error) => {
        console.warn("[LiveModeSelectScreen] Failed to load combined routes -- showing none.", error);
        setRouteConfigs([]);
        setCombinedRoutesLoaded(true);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      // ARC Goal task: only load ArcBuilds once the trainee has actually
      // chosen "ARC רגיל" -- otherwise a trainee with zero ArcBuilds but
      // at least one ArcGoal would never even see the chooser below,
      // redirected away before they could pick "ARC Goal" at all.
      if (mode === "regular") reload();
      // Combined routes must appear on every step of this screen
      // (including the chooser), so they are reloaded on every focus
      // regardless of `mode` -- this is also what makes a route created
      // or activated just before returning to this screen show up
      // immediately.
      reloadCombinedRoutes();
    }, [reload, reloadCombinedRoutes, mode])
  );

  const readyCombinedRoutes = selectActiveCombinedRoutesForLive(routeConfigs, routeInterferenceItems, routeStateProfiles, routePresenceArcs);

  useEffect(() => {
    // The ArcBuild-empty redirect only ever fires once BOTH lists have
    // resolved -- a trainee with zero ArcBuilds but at least one ready
    // combined route must land on this screen, not be redirected to
    // /build before they can see it.
    if (mode !== "regular") return;
    if (builds === null || !combinedRoutesLoaded) return;
    if (builds.length === 0 && readyCombinedRoutes.length === 0) {
      router.replace("/build");
    }
  }, [mode, builds, combinedRoutesLoaded, readyCombinedRoutes.length]);

  if (mode === "chooser") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>מה תרצה לתרגל?</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setMode("regular")}>
            <Text style={styles.buttonText}>ARC רגיל</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/arc-goal/select")}>
            <Text style={styles.buttonText}>ARC Goal</Text>
          </Pressable>
          <CombinedRoutesSection routes={readyCombinedRoutes} progressStore={routeProgressStore} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (builds === null || (!combinedRoutesLoaded && builds.length === 0)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (!selectedBuild) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          {builds.length > 0 && (
            <>
              <Text style={styles.title}>איזה ARC Build תרצה לתרגל?</Text>
              {builds.map((build) => (
                <Pressable key={build.id} style={[styles.button, styles.fullWidthButton]} onPress={() => setSelectedBuild(build)}>
                  <Text style={styles.buttonText}>{build.name}</Text>
                </Pressable>
              ))}
            </>
          )}
          <CombinedRoutesSection routes={readyCombinedRoutes} progressStore={routeProgressStore} />
          {builds.length === 0 && (
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>חזרה</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{selectedBuild.name}</Text>
        <Text style={styles.title}>מה תרצה לתרגל עכשיו?</Text>

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/live", params: { buildId: selectedBuild.id } })}
        >
          <Text style={styles.buttonText}>ARC רגיל</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/future-arc-link/[id]", params: { id: selectedBuild.id } })}
        >
          <Text style={styles.buttonText}>{FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL}</Text>
        </Pressable>

        <CombinedRoutesSection routes={readyCombinedRoutes} progressStore={routeProgressStore} />

        {builds.length > 1 && (
          <Pressable style={styles.backButton} onPress={() => setSelectedBuild(null)}>
            <Text style={styles.backButtonText}>בחר ARC Build אחר</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Regression repair task: the shared "combined routes" list rendered on
 * every step of LiveModeSelectScreen. Renders nothing at all when
 * `routes` is empty -- never an empty section header. Each card mirrors
 * build/PersonalDevelopmentRouteListScreen.tsx's own identifying summary
 * ("3 גורמים + נוכחות") and starts the EXACT SAME existing combined LIVE
 * route/screen that screen's own start buttons already use.
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task: per the approved "recommend, don't hard-lock" design, each route
 * now shows its own current stage's ONE prominent recommended entry
 * (arc/personalDevelopmentRouteProgress.ts's own resolveAvailableEntryModes)
 * plus every earlier stage's own advancement mode as a smaller secondary
 * button -- never a hard lock to a single mode. A route with no recorded
 * progress yet (absent from `progressStore`) defaults to Stage 1 (Full
 * recommended, Mini secondary), matching
 * createEmptyPersonalDevelopmentRouteProgress's own default. Mode ->
 * route mapping: "full"/"mini" push the existing combined LIVE route with
 * their own `mode` param (unchanged); "route_link" pushes the new
 * Stage 3 rehearsal screen; "action_only" pushes the new Stage 4
 * mark-as-done screen -- both reusing this SAME route config, never a
 * parallel flow.
 */
function resolveModeLabel(mode: CombinedFactorMode): string {
  switch (mode) {
    case "full":
      return "ARC מלא";
    case "mini":
      return "Mini ARC";
    case "route_link":
      return "קישור ARC למסלול";
    case "action_only":
      return "סימון פעולה מיטיבה כבוצעה";
  }
}

function pushCombinedRouteMode(routeConfigId: string, mode: CombinedFactorMode) {
  if (mode === "full" || mode === "mini") {
    router.push({ pathname: "/personal-development-routes/[id]/live", params: { id: routeConfigId, mode } });
    return;
  }
  if (mode === "route_link") {
    router.push({ pathname: "/personal-development-routes/[id]/route-link", params: { id: routeConfigId } });
    return;
  }
  router.push({ pathname: "/personal-development-routes/[id]/action-only", params: { id: routeConfigId } });
}

function CombinedRoutesSection({ routes, progressStore }: { routes: PersonalDevelopmentRouteConfig[]; progressStore: PersonalDevelopmentRouteProgressStore }) {
  if (routes.length === 0) return null;

  return (
    <View style={styles.combinedRoutesSection}>
      <Text style={styles.sectionTitle}>מסלולי תרגול משולבים</Text>
      {routes.map((config) => {
        const stage = progressStore[config.id]?.stage ?? 1;
        const { recommended, secondary } = resolveAvailableEntryModes(stage);
        return (
          <View key={config.id} style={styles.routeCard}>
            <Text style={styles.routeCardTitle}>{`${config.interferenceItemIds.length} גורמים${config.presenceEnabled ? " + נוכחות" : ""}`}</Text>
            <Text style={styles.routeCardSubtitle}>{STATE_INCLUSION_LABELS[config.stateInclusionPolicy]}</Text>
            <View style={styles.routeCardActions}>
              <Pressable style={styles.routeStartButton} onPress={() => pushCombinedRouteMode(config.id, recommended)}>
                <Text style={styles.routeStartButtonText}>{`▶ ${resolveModeLabel(recommended)}`}</Text>
              </Pressable>
            </View>
            {secondary.length > 0 && (
              <View style={styles.routeCardActions}>
                {secondary.map((mode) => (
                  <Pressable key={mode} style={styles.routeSecondaryButton} onPress={() => pushCombinedRouteMode(config.id, mode)}>
                    <Text style={styles.routeSecondaryButtonText}>{resolveModeLabel(mode)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginTop: 8 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  combinedRoutesSection: { marginTop: 28 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  routeCard: { marginBottom: 12, borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14 },
  routeCardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  routeCardSubtitle: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 4 },
  routeCardActions: { flexDirection: "row-reverse", gap: 12, marginTop: 10, justifyContent: "flex-end" },
  routeStartButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  routeStartButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  routeSecondaryButton: { backgroundColor: "#E6F4FE", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  routeSecondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 12 },
});

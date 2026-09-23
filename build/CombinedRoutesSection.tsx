import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import type { PersonalDevelopmentRouteProgressStore } from "../data/storage.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { resolveAvailableEntryModes } from "../arc/personalDevelopmentRouteProgress.ts";
import type { PersonalDevelopmentRouteStage } from "../arc/personalDevelopmentRouteProgress.ts";
import type { CombinedFactorMode } from "../arc/combinedFactorPlan.ts";

const STATE_INCLUSION_LABELS = {
  linked: "עם מצב רצוי",
  none: "ללא מצב רצוי",
  decide_in_live: "החלטה בזמן התרגול",
};

/**
 * build/CombinedRoutesSection.tsx
 *
 * Personal Development consolidation task, step 5: extracted out of
 * build/LiveModeSelectScreen.tsx (its original, only home) so it can be
 * reused, unmodified, by both that general ArcBuild/ArcGoal/PD chooser
 * AND the new PD-only build/PersonalDevelopmentLiveSelectScreen.tsx
 * (the "One Dynamic LIVE" dashboard entry) -- "one shared LIVE" means
 * literally one implementation, never two independently-maintained
 * copies of the same rendering/routing logic.
 *
 * Renders nothing at all when `routes` is empty -- never an empty
 * section header. Each card mirrors build/PersonalDevelopmentRouteListScreen.tsx's
 * own identifying summary (config.name, falling back to "3 גורמים +
 * נוכחות"). This is the ONE place in the app that resolves a route's
 * stage into an actual mode and launches a protocol screen --
 * build/PersonalDevelopmentRouteListScreen.tsx (route management) never
 * launches anything directly -- see build/personalDevelopmentSingleLiveEntry.test.ts.
 *
 * Personal Development consolidation task, step 4 (approved decision 2 --
 * "One unified LIVE"): the normal LIVE flow shows ONLY two primary
 * choices, Full ARC and Mini ARC, for EVERY route regardless of its own
 * current stage -- both are always valid, practicable modes at every
 * stage (see arc/personalDevelopmentRouteProgress.ts's own
 * ADVANCEMENT_MODES_BY_STAGE: full/mini are never locked out, only
 * route_link/action_only are stage-gated), so no stage lookup is needed
 * to decide whether to SHOW them, only to decide whether route_link/
 * action_only are unlocked yet. Stage 3/4 stay fully implemented
 * underneath (arc/personalDevelopmentRouteLink.ts/
 * arc/personalDevelopmentRouteActionOnly.ts, untouched) but are never
 * promoted to an equal primary LIVE option; once resolveAvailableEntryModes(stage)
 * actually unlocks route_link and/or action_only, they appear ONLY in a
 * clearly separate, visually secondary "מתקדם" (advanced) row below the
 * two primary buttons -- never replacing them, never equal-weight. A
 * route with no recorded progress yet defaults to Stage 1 (no advanced
 * modes unlocked), matching createEmptyPersonalDevelopmentRouteProgress's
 * own default. Mode -> route mapping: "full"/"mini" push the existing
 * combined LIVE route with their own `mode` param; "route_link" pushes
 * the Stage 3 rehearsal screen; "action_only" pushes the Stage 4
 * mark-as-done screen -- all reusing this SAME route config, never a
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

/** The Stage 3/4 advanced modes unlocked for `stage`, if any -- never full/mini (those are always the two primary buttons, never repeated here). */
function resolveAdvancedModesForStage(stage: PersonalDevelopmentRouteStage): CombinedFactorMode[] {
  const { recommended, secondary } = resolveAvailableEntryModes(stage);
  const advanced = new Set<CombinedFactorMode>();
  for (const mode of [recommended, ...secondary]) {
    if (mode === "route_link" || mode === "action_only") advanced.add(mode);
  }
  return [...advanced];
}

export function CombinedRoutesSection({ routes, progressStore }: { routes: PersonalDevelopmentRouteConfig[]; progressStore: PersonalDevelopmentRouteProgressStore }) {
  if (routes.length === 0) return null;

  return (
    <View style={styles.combinedRoutesSection}>
      <Text style={styles.sectionTitle}>מסלולי תרגול משולבים</Text>
      {routes.map((config) => {
        const stage = progressStore[config.id]?.stage ?? 1;
        const advancedModes = resolveAdvancedModesForStage(stage);
        return (
          <View key={config.id} style={styles.routeCard}>
            <Text style={styles.routeCardTitle}>{config.name ?? `${config.interferenceItemIds.length} גורמים${config.presenceEnabled ? " + נוכחות" : ""}`}</Text>
            <Text style={styles.routeCardSubtitle}>{STATE_INCLUSION_LABELS[config.stateInclusionPolicy]}</Text>
            <View style={styles.routeCardActions}>
              <Pressable style={styles.routeStartButton} onPress={() => pushCombinedRouteMode(config.id, "full")}>
                <Text style={styles.routeStartButtonText}>{`▶ ${resolveModeLabel("full")}`}</Text>
              </Pressable>
              <Pressable style={styles.routeStartButton} onPress={() => pushCombinedRouteMode(config.id, "mini")}>
                <Text style={styles.routeStartButtonText}>{`▶ ${resolveModeLabel("mini")}`}</Text>
              </Pressable>
            </View>
            {advancedModes.length > 0 && (
              <View style={styles.routeCardActions}>
                <Text style={styles.advancedLabel}>מתקדם:</Text>
                {advancedModes.map((mode) => (
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
  advancedLabel: { fontSize: 12, color: "#888", alignSelf: "center" },
});

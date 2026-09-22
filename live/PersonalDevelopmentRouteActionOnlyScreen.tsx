import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { clearTimerRun, loadInterferenceItems, loadPersonalDevelopmentRouteConfigs, loadPersonalDevelopmentRouteProgressStore, loadPresenceArcs, loadStateProfiles, loadTimerRun } from "../data/storage.ts";
import type { TimerRun, TimerType } from "../data/storage.ts";
import {
  answerActionOnlyStateDecision,
  chooseActionOnlyPrimaryFactor,
  confirmActionOnlyActionCompleted,
  createActionOnlySession,
  markActionOnlyActionReached,
  resolveCurrentActionOnlyRole,
  toActionOnlySessionFacts,
} from "../arc/personalDevelopmentRouteActionOnly.ts";
import type { ActionOnlyState } from "../arc/personalDevelopmentRouteActionOnly.ts";
import { STATE_DECISION_QUESTION } from "../arc/combinedFactorPlan.ts";
import type { PersonalDevelopmentSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import { allActionRolesConfirmed, applyActionRoleConfirmedToSnapshot, resolveNextUnconfirmedActionRole, resolveTerminalFactsForSnapshot } from "../arc/frozenCombinedActionRecovery.ts";
import type { FrozenCombinedActionSnapshot } from "../arc/frozenCombinedActionRecovery.ts";
import { ActionScreen } from "./screens.tsx";

const COMBINED_ACTION_TIMER_TYPES: TimerType[] = ["combinedStateAction", "combinedFactorAction", "combinedSharedAction"];

/**
 * live/PersonalDevelopmentRouteActionOnlyScreen.tsx (route:
 * /personal-development-routes/[id]/action-only)
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task: Stage 4's own thin renderer, driving
 * arc/personalDevelopmentRouteActionOnly.ts's pure controller. Renders
 * ONLY the real resolved Beneficial Action (and, for a route whose
 * primary factor still needs resolving, the same direct primary-factor/
 * State-decision questions Route Link asks) -- no recognition, no State
 * regulation/encoding review. Mirrors live/PersonalDevelopmentRouteLinkScreen.tsx's
 * own restart-recovery shape exactly, scoped to this route's own
 * "action_only"-mode TimerRun slot only.
 */
async function findResumableActionOnlyAction(routeConfigId: string): Promise<TimerRun | null> {
  for (const timerType of COMBINED_ACTION_TIMER_TYPES) {
    const run = await loadTimerRun(timerType);
    if (!run?.frozenCombinedActionSnapshot) continue;
    if (run.frozenCombinedActionSnapshot.facts.routeConfigId !== routeConfigId) continue;
    if (run.frozenCombinedActionSnapshot.facts.mode !== "action_only") continue;
    if (allActionRolesConfirmed(run.frozenCombinedActionSnapshot.actionRoleProgress)) continue;
    return run;
  }
  return null;
}

export default function PersonalDevelopmentRouteActionOnlyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<ActionOnlyState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  const [resumedActionRun, setResumedActionRun] = useState<TimerRun | null>(null);
  const [bypassSnapshot, setBypassSnapshot] = useState<FrozenCombinedActionSnapshot | null>(null);
  const [resumedTerminalFacts, setResumedTerminalFacts] = useState<PersonalDevelopmentSharedFacts | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    if (typeof id !== "string") return;
    startedRef.current = true;
    findResumableActionOnlyAction(id)
      .then((resumed) => {
        if (!mountedRef.current) return;
        if (resumed?.frozenCombinedActionSnapshot) {
          setResumedActionRun(resumed);
          setBypassSnapshot(resumed.frozenCombinedActionSnapshot);
          return;
        }
        return Promise.all([loadPersonalDevelopmentRouteConfigs(), loadInterferenceItems(), loadStateProfiles(), loadPresenceArcs(), loadPersonalDevelopmentRouteProgressStore()]).then(
          ([configs, items, stateProfiles, presenceArcs, progressStore]) => {
            if (!mountedRef.current) return;
            const config = configs.find((c) => c.id === id) ?? null;
            if (!config) {
              setLoadError(true);
              return;
            }
            const stageAtStart = progressStore[config.id]?.stage ?? 1;
            const created = createActionOnlySession({ config, items, stateProfiles, presenceArcs, startedAt: new Date().toISOString(), stageAtStart });
            setSession(created);
          }
        );
      })
      .catch((error) => {
        console.warn("[PersonalDevelopmentRouteActionOnlyScreen] Failed to load route data.", error);
        if (mountedRef.current) setLoadError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleBypassActionConfirmed() {
    setBypassSnapshot((current) => {
      if (!current) return current;
      const role = resolveNextUnconfirmedActionRole(current.actionRoleProgress);
      if (!role) return current;
      const patched = applyActionRoleConfirmedToSnapshot(current, role.role);
      clearTimerRun(role.timerType);
      if (allActionRolesConfirmed(patched.actionRoleProgress)) {
        setResumedTerminalFacts({ track: "personal_development", facts: resolveTerminalFactsForSnapshot(patched) });
        setResumedActionRun(null);
        return null;
      }
      return patched;
    });
  }

  function update(next: ActionOnlyState) {
    setSession(next);
  }

  if (resumedTerminalFacts) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ActionOnlyCompletionScreen facts={resumedTerminalFacts} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (bypassSnapshot) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>{renderBypassAction(bypassSnapshot, resumedActionRun, handleBypassActionConfirmed)}</ScrollView>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא ניתן לטעון את המסלול</Text>
          <Text style={styles.body}>המסלול המבוקש לא נמצא, או שאירעה שגיאה בטעינת הנתונים. אפשר לחזור ולנסות שוב.</Text>
          <PrimaryButton label="חזרה" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContent}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>{renderBody(session, update)}</ScrollView>
    </SafeAreaView>
  );
}

function renderBypassAction(snapshot: FrozenCombinedActionSnapshot, resumedRun: TimerRun | null, onConfirmed: () => void) {
  const role = resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress);
  if (!role) return null;
  const runToResume = resumedRun && resumedRun.timerType === role.timerType ? resumedRun : null;
  return (
    <View>
      <Text style={styles.title}>סימון פעולה מיטיבה כבוצעה</Text>
      <ActionScreen
        key={role.role}
        copy={{ title: "פעולה מיטיבה", body: role.action, segments: null }}
        durationMinutes={role.role === "state" ? snapshot.stateActionDurationMinutes : null}
        timerType={role.timerType}
        relatedCombinedSessionId={snapshot.facts.sessionId}
        resumedRun={runToResume}
        frozenCombinedActionSnapshot={snapshot}
        onCompleted={onConfirmed}
      />
    </View>
  );
}

function recognitionHeading(category: "thought" | "belief" | "emotion" | "urge"): string {
  switch (category) {
    case "thought":
      return "מחשבה";
    case "belief":
      return "אמונה";
    case "urge":
      return "דחף";
    case "emotion":
      return "רגש";
  }
}

function resolveActionOnlyStateActionDuration(state: ActionOnlyState): number | null {
  if (!state.resolvedPlan?.stateIncluded) return null;
  const policy = state.snapshot.config.stateInclusionPolicy;
  const id = policy === "none" ? null : state.snapshot.config.stateProfileId;
  const stateProfile = id ? (state.snapshot.stateProfiles.find((s) => s.id === id) ?? null) : null;
  return stateProfile?.actionTimerConfig?.durationMinutes ?? null;
}

function renderBody(state: ActionOnlyState, update: (next: ActionOnlyState) => void) {
  switch (state.phase) {
    case "invalid":
      return (
        <View>
          <Text style={styles.title}>לא ניתן להציג את הפעולה המיטיבה</Text>
          <Text style={styles.body}>אירעה בעיה בפתרון הפעולה המיטיבה עבור המסלול הזה ({state.invalidReason ?? "לא ידוע"}). אפשר לחזור ולערוך את המסלול.</Text>
          <PrimaryButton label="חזרה" onPress={() => router.back()} />
        </View>
      );

    case "primary_choice":
      return (
        <View>
          <Text style={styles.title}>{state.pendingPrimaryFactorQuestion}</Text>
          {(state.pendingPrimaryFactorCandidates ?? []).map((itemId) => {
            const item = state.snapshot.items.find((i) => i.id === itemId);
            if (!item) return null;
            return <PrimaryButton key={itemId} label={recognitionHeading(item.category)} onPress={() => update(chooseActionOnlyPrimaryFactor(state, itemId))} />;
          })}
        </View>
      );

    case "state_decision":
      return (
        <View>
          <Text style={styles.title}>{STATE_DECISION_QUESTION}</Text>
          <View style={styles.buttonRow}>
            <PrimaryButton label="כן" onPress={() => update(answerActionOnlyStateDecision(state, true))} />
            <PrimaryButton label="לא" onPress={() => update(answerActionOnlyStateDecision(state, false))} />
          </View>
        </View>
      );

    case "action": {
      const entry = resolveCurrentActionOnlyRole(state);
      if (!entry) {
        return (
          <View>
            <Text style={styles.title}>לא ניתן להציג את הפעולה</Text>
            <Text style={styles.body}>אירעה בעיה בפתרון הפעולה המיטיבה עבור המסלול הזה.</Text>
          </View>
        );
      }
      if (!entry.reached) update(markActionOnlyActionReached(state));
      return (
        <View>
          <Text style={styles.title}>סימון פעולה מיטיבה כבוצעה</Text>
          <ActionScreen
            key={entry.role}
            copy={{ title: "פעולה מיטיבה", body: entry.action, segments: null }}
            durationMinutes={entry.role === "state" ? resolveActionOnlyStateActionDuration(state) : null}
            timerType={entry.timerType}
            relatedCombinedSessionId={state.sessionId}
            frozenCombinedActionSnapshot={{ facts: toActionOnlySessionFacts(state), actionRoleProgress: state.actionRoleProgress, stateActionDurationMinutes: resolveActionOnlyStateActionDuration(state) }}
            onCompleted={() => {
              clearTimerRun(entry.timerType);
              update(confirmActionOnlyActionCompleted(state));
            }}
          />
        </View>
      );
    }

    case "complete": {
      const facts = toActionOnlySessionFacts(state);
      return <ActionOnlyCompletionScreen facts={{ track: "personal_development", facts }} />;
    }
  }
}

type ActionOnlySaveStatus = "saving" | "done" | "error";

function ActionOnlyCompletionScreen({ facts }: { facts: PersonalDevelopmentSharedFacts }) {
  const [status, setStatus] = useState<ActionOnlySaveStatus>("saving");
  const mountedRef = useRef(true);
  const startedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function attemptSave() {
    setStatus("saving");
    const now = new Date().toISOString();
    recordSharedLiveSessionCompletion(facts, now)
      .then((result) => {
        if (!mountedRef.current) return;
        setStatus(result.outcome.kind === "applied" || result.outcome.kind === "duplicate_session" ? "done" : "error");
      })
      .catch((error: unknown) => {
        console.warn("[PersonalDevelopmentRouteActionOnlyScreen] Failed to record session completion.", error);
        if (mountedRef.current) setStatus("error");
      });
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    attemptSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "saving") {
    return (
      <View>
        <Text style={styles.title}>סיום</Text>
        <Text style={styles.body}>שומר את התרגול...</Text>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View>
        <Text style={styles.title}>סיום</Text>
        <Text style={styles.body}>הפעולה בוצעה, אך שמירת ההתקדמות נכשלה. אפשר לנסות לשמור שוב, או לצאת בכל זאת.</Text>
        <PrimaryButton label="נסה לשמור שוב" onPress={attemptSave} />
        <PrimaryButton label="יציאה" onPress={() => router.replace("/personal-development-routes")} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>סיום</Text>
      <Text style={styles.body}>הפעולה המיטיבה סומנה כבוצעה.</Text>
      <PrimaryButton label="סיום" onPress={() => router.replace("/personal-development-routes")} />
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text onPress={onPress} style={styles.button} accessibilityRole="button">
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  loadingContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  body: { fontSize: 16, textAlign: "right", color: "#333", marginBottom: 16, lineHeight: 22 },
  buttonRow: { flexDirection: "row-reverse", gap: 12, marginTop: 8 },
  button: { backgroundColor: "#0a7ea4", color: "#fff", fontWeight: "600", fontSize: 16, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, textAlign: "center", overflow: "hidden", marginTop: 8 },
});

import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { clearTimerRun, loadInterferenceItems, loadPersonalDevelopmentRouteConfigs, loadPersonalDevelopmentRouteProgressStore, loadPresenceArcs, loadStateProfiles, loadTimerRun } from "../data/storage.ts";
import type { TimerRun, TimerType } from "../data/storage.ts";
import {
  advanceRouteLinkStep,
  answerRouteLinkStateDecision,
  chooseRouteLinkPrimaryFactor,
  confirmRouteLinkActionCompleted,
  createRouteLinkSession,
  markRouteLinkActionReached,
  toRouteLinkSessionFacts,
} from "../arc/personalDevelopmentRouteLink.ts";
import type { RouteLinkState } from "../arc/personalDevelopmentRouteLink.ts";
import { STATE_DECISION_QUESTION } from "../arc/combinedFactorPlan.ts";
import {
  NEUTRAL_PROCESSING_CONTINUATION_LINE,
  getAcceptanceStepCopy,
  getFactorProcessingStepCopy,
  getNeutralRegulationCueCopy,
  getRecognitionStepCopy,
  getStateDesiredStateEncodingCopy,
  getStateRegulationAnchorCopy,
} from "../arc/combinedFactorPlanCopy.ts";
import { resolveStateInclusion } from "../arc/stateInclusion.ts";
import type { PersonalDevelopmentSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import { allActionRolesConfirmed, applyActionRoleConfirmedToSnapshot, resolveNextUnconfirmedActionRole, resolveTerminalFactsForSnapshot } from "../arc/frozenCombinedActionRecovery.ts";
import type { FrozenCombinedActionSnapshot } from "../arc/frozenCombinedActionRecovery.ts";
import { ActionScreen } from "./screens.tsx";

const COMBINED_ACTION_TIMER_TYPES: TimerType[] = ["combinedStateAction", "combinedFactorAction", "combinedSharedAction"];

/**
 * live/PersonalDevelopmentRouteLinkScreen.tsx (route:
 * /personal-development-routes/[id]/route-link)
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task: Stage 3's own thin renderer, driving arc/personalDevelopmentRouteLink.ts's
 * pure controller -- mirrors live/CombinedInterferenceLiveScreen.tsx's own
 * async lifecycle and restart-recovery shape exactly (load once ->
 * create one immutable session -> render; a pending real action's own
 * wall-clock timer survives a restart via the SAME frozen-snapshot
 * machinery, arc/frozenCombinedActionRecovery.ts, unmodified), scoped to
 * this route's own "route_link"-mode TimerRun slot only (never
 * intercepting a Full/Mini/Action-Only pending action for the same
 * route -- see findResumableRouteLinkAction below).
 *
 * Never wires a skip control -- Route Link's real action always requires
 * genuine performance/confirmation (see arc/personalDevelopmentRouteLink.ts's
 * own header doc and arc/personalDevelopmentRouteProgress.ts's
 * isRequiredActionOutcomeValidForMode).
 */
async function findResumableRouteLinkAction(routeConfigId: string): Promise<TimerRun | null> {
  for (const timerType of COMBINED_ACTION_TIMER_TYPES) {
    const run = await loadTimerRun(timerType);
    if (!run?.frozenCombinedActionSnapshot) continue;
    if (run.frozenCombinedActionSnapshot.facts.routeConfigId !== routeConfigId) continue;
    if (run.frozenCombinedActionSnapshot.facts.mode !== "route_link") continue;
    if (allActionRolesConfirmed(run.frozenCombinedActionSnapshot.actionRoleProgress)) continue;
    return run;
  }
  return null;
}

export default function PersonalDevelopmentRouteLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<RouteLinkState | null>(null);
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
    findResumableRouteLinkAction(id)
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
            const created = createRouteLinkSession({ config, items, stateProfiles, presenceArcs, startedAt: new Date().toISOString(), stageAtStart });
            setSession(created);
          }
        );
      })
      .catch((error) => {
        console.warn("[PersonalDevelopmentRouteLinkScreen] Failed to load route data.", error);
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

  function update(next: RouteLinkState) {
    setSession(next);
  }

  if (resumedTerminalFacts) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <RouteLinkCompletionScreen facts={resumedTerminalFacts} />
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
      <Text style={styles.title}>קישור ARC למסלול</Text>
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

function resolveSessionState(state: RouteLinkState) {
  if (!state.resolvedPlan?.stateIncluded) return null;
  const policy = state.snapshot.config.stateInclusionPolicy;
  const id = policy === "none" ? null : state.snapshot.config.stateProfileId;
  return id ? (state.snapshot.stateProfiles.find((s) => s.id === id) ?? null) : null;
}

function resolveStateActionDuration(state: RouteLinkState): number | null {
  return resolveSessionState(state)?.actionTimerConfig?.durationMinutes ?? null;
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

function renderBody(state: RouteLinkState, update: (next: RouteLinkState) => void) {
  switch (state.phase) {
    case "invalid":
      return (
        <View>
          <Text style={styles.title}>המסלול אינו מוכן לתרגול קישור</Text>
          <Text style={styles.body}>אירעה בעיה בהגדרת המסלול ({state.invalidReason ?? "לא ידוע"}). אפשר לחזור ולערוך את המסלול.</Text>
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
            return <PrimaryButton key={itemId} label={recognitionHeading(item.category)} onPress={() => update(chooseRouteLinkPrimaryFactor(state, itemId))} />;
          })}
        </View>
      );

    case "state_decision":
      return (
        <View>
          <Text style={styles.title}>{STATE_DECISION_QUESTION}</Text>
          <View style={styles.buttonRow}>
            <PrimaryButton label="כן" onPress={() => update(answerRouteLinkStateDecision(state, true))} />
            <PrimaryButton label="לא" onPress={() => update(answerRouteLinkStateDecision(state, false))} />
          </View>
        </View>
      );

    case "steps":
      return renderStep(state, update);

    case "complete": {
      const facts = toRouteLinkSessionFacts(state);
      return <RouteLinkCompletionScreen facts={{ track: "personal_development", facts }} />;
    }
  }
}

function renderStep(state: RouteLinkState, update: (next: RouteLinkState) => void) {
  const step = state.remainingSteps[state.stepIndex];
  if (!step) return null;

  switch (step.kind) {
    case "urge_preventive_stopping": {
      const item = step.itemId ? state.snapshot.items.find((i) => i.id === step.itemId) : null;
      return (
        <View>
          <Text style={styles.title}>עצירה מונעת</Text>
          <Text style={styles.body}>{item && item.category === "urge" ? item.preventiveStoppingAction || "אפשר לעצור לפני שהדחף מתממש." : "אפשר לעצור לפני שהדחף מתממש."}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "acceptance": {
      const stateProfile = resolveSessionState(state);
      const categories = state.resolvedPlan ? state.resolvedPlan.factors.map((factor) => factor.category) : [];
      const copy = getAcceptanceStepCopy(categories, stateProfile?.regulationAnchor);
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "neutral_regulation": {
      // Correction round 3: UNIVERSAL, State-independent -- reuses the
      // same regulationAnchor resolveSessionState already exposes for
      // Acceptance (null when this session has no State, falling back to
      // the fixed default anchor inside getNeutralRegulationCueCopy
      // itself). Never reads getStateRegulationAnchorCopy's own content --
      // that stays genuinely State-specific, rendered separately below,
      // only when stateIncluded.
      const stateProfile = resolveSessionState(state);
      const copy = getNeutralRegulationCueCopy(stateProfile?.regulationAnchor);
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "factor_recognition": {
      const item = step.itemId ? state.snapshot.items.find((i) => i.id === step.itemId) : null;
      if (!item) return null;
      const recognition = getRecognitionStepCopy(item);
      return (
        <View>
          <Text style={styles.title}>{recognition.framing}</Text>
          {recognition.context ? <Text style={styles.body}>{recognition.context}</Text> : null}
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "factor_replacement_cue": {
      const item = step.itemId ? state.snapshot.items.find((i) => i.id === step.itemId) : null;
      if (!item) return null;
      const processing = getFactorProcessingStepCopy(item);
      return (
        <View>
          <Text style={styles.title}>{recognitionHeading(item.category)}</Text>
          <Text style={styles.body}>{processing.text ?? NEUTRAL_PROCESSING_CONTINUATION_LINE}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "state_regulation_anchor": {
      const stateProfile = resolveSessionState(state);
      const copy = stateProfile ? getStateRegulationAnchorCopy(stateProfile, "mini") : { title: "ויסות מהמצב הרצוי", lines: [] };
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          {copy.lines.map((line, index) => (
            <Text key={index} style={styles.body}>
              {line}
            </Text>
          ))}
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "state_desired_state_encoding": {
      const stateProfile = resolveSessionState(state);
      const copy = stateProfile ? getStateDesiredStateEncodingCopy(stateProfile, "mini") : { title: "קידוד המצב הרצוי", lines: [] };
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          {copy.lines.map((line, index) => (
            <Text key={index} style={styles.body}>
              {line}
            </Text>
          ))}
          <PrimaryButton label="המשך" onPress={() => update(advanceRouteLinkStep(state))} />
        </View>
      );
    }
    case "state_action":
    case "factor_action": {
      const index = state.actionRoleProgress.length === 2 ? (step.kind === "state_action" ? 0 : 1) : 0;
      const entry = state.actionRoleProgress[index];
      if (!entry) {
        return (
          <View>
            <Text style={styles.title}>לא ניתן להציג את הפעולה</Text>
            <Text style={styles.body}>אירעה בעיה בפתרון הפעולה המיטיבה עבור המסלול הזה.</Text>
          </View>
        );
      }
      if (!entry.reached) update(markRouteLinkActionReached(state));
      return (
        <View>
          <Text style={styles.title}>קישור ARC למסלול</Text>
          <ActionScreen
            key={entry.role}
            copy={{ title: "פעולה מיטיבה", body: entry.action, segments: null }}
            durationMinutes={entry.role === "state" ? resolveStateActionDuration(state) : null}
            timerType={entry.timerType}
            relatedCombinedSessionId={state.sessionId}
            frozenCombinedActionSnapshot={{ facts: toRouteLinkSessionFacts(state), actionRoleProgress: state.actionRoleProgress, stateActionDurationMinutes: resolveStateActionDuration(state) }}
            onCompleted={() => {
              clearTimerRun(entry.timerType);
              update(confirmRouteLinkActionCompleted(state));
            }}
          />
        </View>
      );
    }
    case "terminal_boundary":
      return null;
  }
}

type RouteLinkSaveStatus = "saving" | "done" | "error";

/**
 * Correction round 4: the short, non-interactive success
 * reinforcement/gratitude line the terminal boundary was missing (unlike
 * Full/Mini's own interactive gratitude question, arc/postActionCompletion.ts --
 * Route Link deliberately stays a single static line, never a second
 * prompt). Rendered by RouteLinkCompletionScreen below ONLY once `status
 * === "done"` -- i.e. only after arc/personalDevelopmentRouteLink.ts's own
 * terminalCompleted (every required action role already confirmed, see
 * confirmRouteLinkActionCompleted) AND the one completion record has
 * actually landed (recordSharedLiveSessionCompletion resolved
 * "applied"/"duplicate_session"). Never shown on "saving" or "error" --
 * this is deliberately NOT a second completion trigger, just reinforcement
 * copy attached to the same one write. A restart before this point simply
 * re-shows "saving"/resumes the pending action (see
 * findResumableRouteLinkAction above); resolveNextUnconfirmedActionRole
 * returning null once every role is confirmed is what guarantees a
 * restart can never re-prompt for an already-confirmed action, so this
 * line is never at risk of being shown, then re-triggering a second
 * confirmation.
 */
const ROUTE_LINK_REINFORCEMENT_LINE = "כל הכבוד על התרגול. הפעולה שעשית עכשיו מחזקת את היכולת שלך לפעול כך גם בפעם הבאה.";

function RouteLinkCompletionScreen({ facts }: { facts: PersonalDevelopmentSharedFacts }) {
  const [status, setStatus] = useState<RouteLinkSaveStatus>("saving");
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
        console.warn("[PersonalDevelopmentRouteLinkScreen] Failed to record session completion.", error);
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
        <Text style={styles.body}>התרגול הושלם, אך שמירת ההתקדמות נכשלה. אפשר לנסות לשמור שוב, או לצאת בכל זאת.</Text>
        <PrimaryButton label="נסה לשמור שוב" onPress={attemptSave} />
        <PrimaryButton label="יציאה" onPress={() => router.replace("/personal-development-routes")} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>סיום</Text>
      <Text style={styles.body}>תרגול הקישור הושלם.</Text>
      <Text style={styles.body}>{ROUTE_LINK_REINFORCEMENT_LINE}</Text>
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

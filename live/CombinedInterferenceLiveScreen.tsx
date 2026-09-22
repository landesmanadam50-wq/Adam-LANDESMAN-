import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import {
  clearTimerRun,
  loadInterferenceItems,
  loadPersonalDevelopmentRouteConfigs,
  loadPresenceArcs,
  loadStateProfiles,
  loadTimerRun,
} from "../data/storage.ts";
import type { TimerRun, TimerType } from "../data/storage.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { ArcLiveState, ArcStage, PresenceArc } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import {
  advanceAwarenessRecognition,
  advanceEmbeddedPresenceStage,
  advanceStep,
  advanceTail,
  answerPresenceOptionalOffer,
  answerReassessment,
  answerStateDecision,
  beginMiniPresenceIntervention,
  chooseTiePrimaryFactor,
  completeFullPresenceSubSession,
  confirmActionCompleted,
  createCombinedLiveSession,
  markActionReached,
  recordAwarenessRating,
  recordDesiredStateRating,
  recordStepRating,
  recordTailGratitudeText,
  recordTailImprovementText,
  resolveCurrentAwarenessRatingFactor,
  resolveCurrentStepRatingFactor,
} from "../arc/combinedLiveSession.ts";
import type { CombinedFactorMode } from "../arc/combinedFactorPlan.ts";
import type { CombinedLiveSessionState } from "../arc/combinedLiveSession.ts";
import {
  getCognitiveReassessmentCopy,
  getFactorProcessingStepCopy,
  getGoalConnectionCopy,
  getRecognitionStepCopy,
  getSharedStageCopy,
  getStateDesiredStateEncodingCopy,
  getStateRegulationAnchorCopy,
  resolveCognitiveReassessmentVariant,
  NEUTRAL_PROCESSING_CONTINUATION_LINE,
} from "../arc/combinedFactorPlanCopy.ts";
import { getFactorRatingQuestion } from "../arc/factorRating.ts";
import { getEmbeddedPresenceStageCopy } from "../arc/embeddedPresence.ts";
import { getMiniPostActionCompletionCopy, getPostActionCompletionCopy } from "../arc/postActionCompletion.ts";
import { presenceArcToProfile, isPresenceComplete } from "../arc/presenceLive.ts";
import { advanceLiveSession } from "./liveEventAdapter.ts";
import { ActionScreen, ScaleButtons } from "./screens.tsx";
import { toPersonalDevelopmentSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import type { PersonalDevelopmentSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import { toCombinedLiveSessionFacts } from "../arc/combinedLiveSessionFacts.ts";
import {
  allActionRolesConfirmed,
  applyActionRoleConfirmedToSnapshot,
  resolveNextUnconfirmedActionRole,
  resolveTerminalFactsForSnapshot,
} from "../arc/frozenCombinedActionRecovery.ts";
import type { FrozenCombinedActionSnapshot } from "../arc/frozenCombinedActionRecovery.ts";

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: the three "combined*Action" TimerType values, in the fixed
 * order restart-recovery scans them -- see findResumableCombinedAction's
 * own doc for why fixed order plus an immediate clearTimerRun on
 * confirmation together keep this scan unambiguous even if a session
 * (state_then_factor) uses two of these slots in sequence.
 */
const COMBINED_ACTION_TIMER_TYPES: TimerType[] = ["combinedStateAction", "combinedFactorAction", "combinedSharedAction"];

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: restart recovery for a pending combined-action real action +
 * wall-clock timer, mirroring regular ARC's own loadTimerRun("beneficialAction")
 * resume check in live/LiveSessionScreen.tsx. Scans all three combined
 * action timer slots (a session only ever occupies the ones its own
 * actionOutcomeKind needs) for one whose frozen snapshot belongs to THIS
 * route config and still has an unconfirmed role -- the same validation
 * shape as relatedCombinedSessionId's own doc (a stale/foreign record is
 * never silently resumed). Returns the first match in fixed scan order;
 * see the call site for why at most one genuinely resumable record should
 * ever exist at a time.
 */
async function findResumableCombinedAction(routeConfigId: string): Promise<TimerRun | null> {
  for (const timerType of COMBINED_ACTION_TIMER_TYPES) {
    const run = await loadTimerRun(timerType);
    if (!run?.frozenCombinedActionSnapshot) continue;
    if (run.frozenCombinedActionSnapshot.facts.routeConfigId !== routeConfigId) continue;
    if (allActionRolesConfirmed(run.frozenCombinedActionSnapshot.actionRoleProgress)) continue;
    return run;
  }
  return null;
}

/**
 * live/CombinedInterferenceLiveScreen.tsx (route:
 * /personal-development-routes/[id]/live)
 *
 * Adaptive ARC architecture task, Phase 14B-4: the thin renderer for
 * combined Personal Development LIVE practice (Full and Mini), driving
 * arc/combinedLiveSession.ts's pure controller. This screen owns only
 * what arc/ genuinely cannot: async storage loading, the timer hook
 * (live/screens.tsx's own ActionScreen), the nested Full-Presence
 * ArcLiveState sub-session (arc/presenceLive.ts + live/liveEventAdapter.ts,
 * driven exactly like live/PresenceArcLiveScreen.tsx's own advanceFullFrom),
 * navigation, and rendering. Every business decision (which step is
 * current, which factor still needs a rating, which action role a step
 * represents) is read directly off the controller's own state -- never
 * re-derived here.
 *
 * Async lifecycle (per the approved correction): "loading" -> load the
 * route config + referenced records once -> create one immutable session
 * snapshot -> mint the session id once -> initialize the controller once
 * -> render. Re-renders never reload or remint (createCombinedLiveSession
 * is called exactly once, inside the load effect, gated by a ref so a
 * fast double-invoke or unrelated re-render can never call it twice). A
 * fresh mount after abandonment may create a fresh session -- nothing was
 * ever persisted, so there is nothing to reconcile.
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: a restart WHILE a real action's own wall-clock timer is
 * pending is now recoverable, mirroring regular ARC's own
 * live/LiveSessionScreen.tsx precedent. The load effect below checks
 * findResumableCombinedAction FIRST, before ever loading route config or
 * calling createCombinedLiveSession -- a genuine resume never reconstructs
 * CombinedLiveSessionState (which is, by design, never persisted; see the
 * async-lifecycle doc above) and instead renders directly from the frozen
 * snapshot captured the moment the pending action's timer began (see
 * arc/frozenCombinedActionRecovery.ts's own header doc). `resumedActionRun`
 * holds the ONE genuinely-persisted TimerRun found this way -- passed as
 * `resumedRun` only to the specific action role it belongs to, so
 * live/screens.tsx's useTimerRun reuses its exact anchor/runId/notification
 * rather than starting a second timer; every role reached AFTER that one
 * within this same mount (chaining state_then_factor's second role, or
 * simply this role being shown again after a duplicate confirmation) is a
 * genuinely fresh ActionScreen that persists its own new run. `bypassSnapshot`
 * is the frozen-snapshot state actually driving this recovery render path;
 * `resumedTerminalFacts` is set once every required role is confirmed,
 * routing straight to CombinedSessionCompletionScreen without ever
 * synthesizing a fake CombinedLiveSessionState.
 */
export default function CombinedInterferenceLiveScreen() {
  const { id, mode: modeParam } = useLocalSearchParams<{ id: string; mode: string }>();
  const mode: CombinedFactorMode = modeParam === "mini" ? "mini" : "full";

  const [session, setSession] = useState<CombinedLiveSessionState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  // Restart recovery -- see this component's own doc above.
  const [resumedActionRun, setResumedActionRun] = useState<TimerRun | null>(null);
  const [bypassSnapshot, setBypassSnapshot] = useState<FrozenCombinedActionSnapshot | null>(null);
  const [resumedTerminalFacts, setResumedTerminalFacts] = useState<PersonalDevelopmentSharedFacts | null>(null);

  // Nested Full-Presence sub-session -- screen-owned, never controller state.
  const [presenceArcRef, setPresenceArcRef] = useState<PresenceArc | null>(null);
  const [fullPresenceStage, setFullPresenceStage] = useState<ArcStage>("trigger_selection");
  const [fullPresenceSession, setFullPresenceSession] = useState<ArcLiveState>(() => createEmptyLiveState());

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
    findResumableCombinedAction(id)
      .then((resumed) => {
        if (!mountedRef.current) return;
        if (resumed?.frozenCombinedActionSnapshot) {
          setResumedActionRun(resumed);
          setBypassSnapshot(resumed.frozenCombinedActionSnapshot);
          return;
        }
        return Promise.all([loadPersonalDevelopmentRouteConfigs(), loadInterferenceItems(), loadStateProfiles(), loadPresenceArcs()]).then(
          ([configs, items, stateProfiles, presenceArcs]) => {
            if (!mountedRef.current) return;
            const config = configs.find((c) => c.id === id) ?? null;
            if (!config) {
              setLoadError(true);
              return;
            }
            const created = createCombinedLiveSession({ mode, config, items, stateProfiles, presenceArcs, startedAt: new Date().toISOString() });
            setSession(created);
            const linkedPresenceArc = config.linkedPresenceArcId ? (presenceArcs.find((p) => p.id === config.linkedPresenceArcId) ?? null) : null;
            setPresenceArcRef(linkedPresenceArc);
          }
        );
      })
      .catch((error) => {
        console.warn("[CombinedInterferenceLiveScreen] Failed to load route data.", error);
        if (mountedRef.current) setLoadError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  /**
   * Explicit confirmation of the currently-shown recovered/chained action
   * role -- never fires from a timer merely reaching zero (ActionScreen's
   * own onCompleted is only ever wired to its "עשיתי את זה" button, disabled
   * until the timer completes but never auto-pressed). Idempotent: a
   * duplicate confirmation (double-tap, or a second restart before the next
   * role's own fresh run persists) finds no unconfirmed role left and is a
   * no-op against `patched`'s state, though the underlying TimerRun slot is
   * safely re-cleared either way.
   */
  function handleBypassActionConfirmed() {
    setBypassSnapshot((current) => {
      if (!current) return current;
      const role = resolveNextUnconfirmedActionRole(current.actionRoleProgress);
      if (!role) return current; // already confirmed -- nothing left to do
      const patched = applyActionRoleConfirmedToSnapshot(current, role.role);
      clearTimerRun(role.timerType); // this role's own run is now superseded -- never matched by findResumableCombinedAction again
      if (allActionRolesConfirmed(patched.actionRoleProgress)) {
        setResumedTerminalFacts({ track: "personal_development", facts: resolveTerminalFactsForSnapshot(patched) });
        setResumedActionRun(null);
        return null;
      }
      return patched;
    });
  }

  function update(next: CombinedLiveSessionState) {
    if (!mountedRef.current) return;
    setSession(next);
  }

  function startFullPresenceSubSession() {
    if (!presenceArcRef) return;
    const { profile, activeLayers } = presenceArcToProfile(presenceArcRef);
    const initial = createEmptyLiveState();
    const hop = advanceLiveSession("trigger_selection", initial, profile, activeLayers);
    setFullPresenceStage(hop.stage);
    setFullPresenceSession(hop.session);
  }

  function advanceFullPresenceFrom(stage: ArcStage, patched: ArcLiveState) {
    if (!presenceArcRef || !session) return;
    const { profile, activeLayers } = presenceArcToProfile(presenceArcRef);
    const hop = advanceLiveSession(stage, patched, profile, activeLayers);
    setFullPresenceStage(hop.stage);
    setFullPresenceSession(hop.session);
    if (isPresenceComplete(hop.stage)) {
      // Reached PRESENCE_EXIT_STAGE -- never rendered, never enters
      // arc/presenceLive.ts's own standalone action/tail sub-engine.
      // Resume the parent combined plan directly.
      update(completeFullPresenceSubSession(session));
    }
  }

  if (resumedTerminalFacts) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <CombinedSessionCompletionScreen facts={resumedTerminalFacts} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (bypassSnapshot) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          {renderBypassAction(bypassSnapshot, resumedActionRun, handleBypassActionConfirmed)}
        </ScrollView>
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
      <ScrollView contentContainerStyle={styles.content}>
        {renderBody(session, update, {
          startFullPresenceSubSession,
          advanceFullPresenceFrom,
          fullPresenceStage,
          fullPresenceSession,
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

interface PresenceHandles {
  startFullPresenceSubSession: () => void;
  advanceFullPresenceFrom: (stage: ArcStage, patched: ArcLiveState) => void;
  fullPresenceStage: ArcStage;
  fullPresenceSession: ArcLiveState;
}

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: renders the currently-pending action role from a frozen
 * restart-recovery snapshot -- see this file's own module doc for why
 * `resumedRun` is only ever passed for the ONE role genuinely recovered
 * from a persisted TimerRun (every role reached afterward within this
 * same mount starts, and persists, a fresh run of its own).
 */
function renderBypassAction(snapshot: FrozenCombinedActionSnapshot, resumedRun: TimerRun | null, onConfirmed: () => void) {
  const role = resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress);
  if (!role) return null; // Guarded by the caller (resumedTerminalFacts takes over once every role is confirmed) -- defensive only.
  const runToResume = resumedRun && resumedRun.timerType === role.timerType ? resumedRun : null;
  return (
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
  );
}

function renderBody(state: CombinedLiveSessionState, update: (next: CombinedLiveSessionState) => void, presence: PresenceHandles) {
  switch (state.phase) {
    case "invalid":
      return (
        <View>
          <Text style={styles.title}>המסלול אינו מוכן לתרגול</Text>
          <Text style={styles.body}>אירעה בעיה בהגדרת המסלול ({state.invalidReason ?? "לא ידוע"}). אפשר לחזור ולערוך את המסלול.</Text>
          <PrimaryButton label="חזרה" onPress={() => router.back()} />
        </View>
      );

    case "awareness":
      return renderAwareness(state, update);

    case "primary_choice":
      return renderPrimaryChoice(state, update);

    case "state_decision":
      return (
        <View>
          <Text style={styles.title}>האם נדרש גם מעבר למצב רצוי תומך?</Text>
          <YesNoRow onYes={() => update(answerStateDecision(state, true))} onNo={() => update(answerStateDecision(state, false))} />
        </View>
      );

    case "steps":
      return renderStep(state, update, presence);

    case "presence_optional_offer":
      return (
        <View>
          <Text style={styles.title}>נוכחות מלאה</Text>
          <Text style={styles.body}>יש אפשרות לתרגל נוכחות מלאה בשלב הזה. להמשיך אליה?</Text>
          <YesNoRow onYes={() => update(answerPresenceOptionalOffer(state, true))} onNo={() => update(answerPresenceOptionalOffer(state, false))} />
        </View>
      );

    case "presence_embedded":
      return renderEmbeddedPresence(state, update, () => update(advanceEmbeddedPresenceStage(state)));

    case "presence_full_active":
      return renderFullPresence(presence, update, state);

    case "tail":
      return renderTail(state, update);

    case "complete":
      return <CombinedSessionCompletionScreen facts={toPersonalDevelopmentSharedFacts(state)} />;
  }
}

// ---------------------------------------------------------------------------
// Terminal completion -- Phase 15, now routed through Phase 5's shared,
// track-neutral dispatcher (data/sharedLiveSessionCompletion.ts) rather
// than calling data/personalDevelopmentRouteProgressPersistence.ts's own
// recordCombinedSessionCompletion directly. The dispatcher's own
// personal_development branch is a pure compatibility wrapper around that
// exact function (see its own doc) -- this swap changes nothing about
// WHEN or WHAT gets recorded, only which module makes the call.
//
// This screen only ever reaches this component when `state.phase` is
// "complete" (see renderBody's own switch below) -- the correct
// completion boundary the unified architecture calls for: reachable only
// once every required action role has been EXPLICITLY confirmed (never
// merely reached/timer-completed), whether that means confirming a
// required Beneficial Action, confirming an offered-and-performed one, or
// completing the approved path when the action is skipped/disabled (see
// arc/combinedLiveSession.ts's own advanceTail doc, and
// arc/personalDevelopmentRouteProgress.ts's header doc on why
// `terminalCompleted` is the sufficient umbrella proof). There is no
// separate boundary check to add here -- the controller already
// structurally prevents reaching this component any earlier.
//
// `facts.facts.sessionId` is minted exactly once, when the session is
// created (see this file's own module doc on session lifecycle), and is
// never regenerated by a retry -- attemptSave below always closes over the
// same `facts` prop, so every retry (the "נסה לשמור שוב" button) resubmits
// the identical sessionId. The component-local "saving" guard prevents a
// noisy repeated call while one is already in flight, and
// data/personalDevelopmentRouteProgressPersistence.ts's own persisted
// countedSessionIds ledger (checked via a fresh load on every call) is the
// AUTHORITATIVE idempotency guarantee -- it, not this ref, is what makes a
// re-render, a repeated terminal event, or back/forward navigation all safe
// to retry against.
//
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6 correction:
// this component now takes the already-projected `facts` directly (built
// either the normal way, via toPersonalDevelopmentSharedFacts(state) once
// state.phase reaches "complete", or via the restart-recovery path above,
// via resolveTerminalFactsForSnapshot on a frozen snapshot whose every
// required role has just been confirmed) rather than a live
// CombinedLiveSessionState -- a genuine app restart while a pending
// action's own wall-clock timer is running now DOES resume correctly (see
// findResumableCombinedAction and this file's own module doc), so this
// component can no longer assume its caller always holds one.
// ---------------------------------------------------------------------------

type CombinedSessionSaveStatus = "saving" | "done" | "error";

function CombinedSessionCompletionScreen({ facts }: { facts: PersonalDevelopmentSharedFacts }) {
  const [status, setStatus] = useState<CombinedSessionSaveStatus>("saving");
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
        // "applied" and "duplicate_session" both mean the completion is
        // safely recorded -- a duplicate is not a lesser success, it is
        // confirmation the session was already counted (e.g. an earlier
        // attempt succeeded before a retry was triggered).
        setStatus(result.outcome.kind === "applied" || result.outcome.kind === "duplicate_session" ? "done" : "error");
      })
      .catch((error: unknown) => {
        console.warn("[CombinedInterferenceLiveScreen] Failed to record session completion.", error);
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
      <Text style={styles.body}>התרגול הושלם.</Text>
      <PrimaryButton label="סיום" onPress={() => router.replace("/personal-development-routes")} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Awareness (Full only)
// ---------------------------------------------------------------------------

function renderAwareness(state: CombinedLiveSessionState, update: (next: CombinedLiveSessionState) => void) {
  const step = state.awarenessSteps[state.awarenessIndex];
  if (!step) return null;
  if (step.kind === "recognition" && step.itemId) {
    const item = state.snapshot.items.find((i) => i.id === step.itemId);
    if (!item) return null;
    const copy = getRecognitionStepCopy(item);
    return (
      <View>
        <Text style={styles.title}>{copy.framing}</Text>
        {copy.context && <Text style={styles.body}>{copy.context}</Text>}
        <PrimaryButton label="המשך" onPress={() => update(advanceAwarenessRecognition(state))} />
      </View>
    );
  }
  if (step.kind === "rating_checkpoint") {
    const factor = resolveCurrentAwarenessRatingFactor(state);
    if (!factor) return null;
    return (
      <View>
        <Text style={styles.title}>{factor.label}</Text>
        <Text style={styles.body}>{getFactorRatingQuestion(factor.factorType)}</Text>
        <ScaleButtons onSelect={(value) => update(recordAwarenessRating(state, factor.factorId, factor.factorType, value))} />
      </View>
    );
  }
  return null;
}

function renderPrimaryChoice(state: CombinedLiveSessionState, update: (next: CombinedLiveSessionState) => void) {
  const candidates = state.pendingPrimaryFactorCandidates ?? [];
  return (
    <View>
      <Text style={styles.title}>{state.pendingPrimaryFactorQuestion}</Text>
      {candidates.map((itemId) => {
        const item = state.snapshot.items.find((i) => i.id === itemId);
        return (
          <PrimaryButton key={itemId} label={item ? factorLabel(item) : itemId} onPress={() => update(chooseTiePrimaryFactor(state, itemId))} />
        );
      })}
    </View>
  );
}

function factorLabel(item: InterferenceItem): string {
  switch (item.category) {
    case "thought":
      return item.thoughtText ?? "מחשבה";
    case "belief":
      return item.beliefText ?? "אמונה";
    case "urge":
      return item.urgeName ?? "דחף";
    case "emotion":
      return item.emotionName ?? "רגש";
  }
}

// ---------------------------------------------------------------------------
// Steps phase
// ---------------------------------------------------------------------------

function renderStep(state: CombinedLiveSessionState, update: (next: CombinedLiveSessionState) => void, presence: PresenceHandles) {
  const step = state.remainingSteps[state.stepIndex];
  if (!step) return null;

  switch (step.kind) {
    case "urge_preventive_stopping": {
      const item = state.snapshot.items.find((i) => i.id === step.itemId);
      return (
        <View>
          <Text style={styles.title}>עצירה מונעת</Text>
          <Text style={styles.body}>{item && item.category === "urge" ? item.preventiveStoppingAction || "אפשר לעצור לפני שהדחף מתממש." : "אפשר לעצור לפני שהדחף מתממש."}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "shared_stay": {
      const copy = getSharedStageCopy("shared_stay");
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "shared_acceptance": {
      const copy = getSharedStageCopy("shared_acceptance");
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "rating_checkpoint": {
      const factor = resolveCurrentStepRatingFactor(state, step.checkpoint!);
      if (!factor) return null;
      return (
        <View>
          <Text style={styles.title}>{factor.label}</Text>
          <Text style={styles.body}>{getFactorRatingQuestion(factor.factorType)}</Text>
          <ScaleButtons onSelect={(value) => update(recordStepRating(state, factor.factorId, factor.factorType, step.checkpoint!, value))} />
        </View>
      );
    }
    case "state_regulation_anchor": {
      const stateProfile = resolveSessionState(state);
      const copy = stateProfile ? getStateRegulationAnchorCopy(stateProfile) : { title: "ויסות מהמצב הרצוי", anchor: null };
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          {copy.anchor && <Text style={styles.body}>{copy.anchor}</Text>}
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "goal_connection": {
      // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 7: only
      // ever reached when arc/combinedFullPlan.ts actually emitted this
      // step -- i.e. only when the route has a configured
      // PersonalDevelopmentRouteGoalConnection. See that module's own
      // header doc for the exact "Acceptance -> Regulation -> Goal
      // Connection -> Encoding" placement this mirrors.
      const goalConnection = state.snapshot.config.goalConnection;
      if (!goalConnection) return null;
      const copy = getGoalConnectionCopy(goalConnection);
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.desiredResultLine}</Text>
          <Text style={styles.body}>{copy.valueLine}</Text>
          <Text style={styles.body}>{copy.personalReasonLine}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "processing": {
      const item = state.snapshot.items.find((i) => i.id === step.itemId);
      if (!item) return null;
      const copy = getFactorProcessingStepCopy(item);
      return (
        <View>
          <Text style={styles.title}>{recognitionHeading(item.category)}</Text>
          <Text style={styles.body}>{copy.text ?? NEUTRAL_PROCESSING_CONTINUATION_LINE}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "factor_intervention": {
      const item = state.snapshot.items.find((i) => i.id === step.itemId);
      if (!item) return null;
      const copy = getFactorProcessingStepCopy(item);
      return (
        <View>
          <Text style={styles.title}>{recognitionHeading(item.category)}</Text>
          <Text style={styles.body}>{copy.text ?? NEUTRAL_PROCESSING_CONTINUATION_LINE}</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "combined_recognition": {
      return (
        <View>
          <Text style={styles.title}>שים לב למה שמפריע עכשיו.</Text>
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "presence_intervention": {
      return renderEmbeddedPresence(state, update, () => {
        if (state.embeddedPresenceStage === null) {
          update(beginMiniPresenceIntervention(state));
        } else {
          update(advanceEmbeddedPresenceStage(state));
        }
      }, true);
    }
    case "cognitive_reassessment": {
      const hasThought = state.resolvedPlan?.factors.some((f) => f.category === "thought") ?? false;
      const hasBelief = state.resolvedPlan?.factors.some((f) => f.category === "belief") ?? false;
      const variant = resolveCognitiveReassessmentVariant(hasThought, hasBelief);
      const copy = getCognitiveReassessmentCopy(variant);
      return (
        <View>
          <Text style={styles.title}>{copy.question}</Text>
          <YesNoRow
            yesLabel={copy.stillStuckLabel}
            noLabel={copy.notStuckLabel}
            onYes={() => update(answerReassessment(state, "still_stuck"))}
            onNo={() => update(answerReassessment(state, "not_stuck"))}
          />
        </View>
      );
    }
    case "state_desired_state_encoding": {
      const stateProfile = resolveSessionState(state);
      const copy = stateProfile ? getStateDesiredStateEncodingCopy(stateProfile) : { title: "קידוד המצב הרצוי", cue: null };
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          {copy.cue && <Text style={styles.body}>{copy.cue}</Text>}
          <PrimaryButton label="המשך" onPress={() => update(advanceStep(state))} />
        </View>
      );
    }
    case "desired_state_rating": {
      return (
        <View>
          <Text style={styles.title}>מה רמת המצב הרצוי כרגע?</Text>
          <ScaleButtons onSelect={(value) => update(recordDesiredStateRating(state, value))} />
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
      if (!entry.reached) update(markActionReached(state));
      return (
        <ActionScreen
          key={entry.role}
          copy={{ title: "פעולה מיטיבה", body: entry.action, segments: null }}
          durationMinutes={entry.role === "state" ? resolveStateActionDuration(state) : null}
          timerType={entry.timerType}
          relatedCombinedSessionId={state.sessionId}
          frozenCombinedActionSnapshot={{ facts: toCombinedLiveSessionFacts(state), actionRoleProgress: state.actionRoleProgress, stateActionDurationMinutes: resolveStateActionDuration(state) }}
          onCompleted={() => {
            clearTimerRun(entry.timerType); // this role is now explicitly confirmed -- never a valid restart-recovery match again
            update(confirmActionCompleted(state));
          }}
        />
      );
    }
    case "presence": {
      if (state.presenceMode === "embedded") return renderEmbeddedPresence(state, update, () => update(advanceEmbeddedPresenceStage(state)));
      if (state.presenceMode === "full") return renderFullPresence(presence, update, state);
      return null;
    }
    case "terminal_boundary":
      return null;
  }
}

function recognitionHeading(category: InterferenceItem["category"]): string {
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

function resolveSessionState(state: CombinedLiveSessionState): StateProfile | null {
  if (!state.resolvedPlan?.stateIncluded) return null;
  const policy = state.snapshot.config.stateInclusionPolicy;
  const id = policy === "none" ? null : state.snapshot.config.stateProfileId;
  return id ? (state.snapshot.stateProfiles.find((s) => s.id === id) ?? null) : null;
}

function resolveStateActionDuration(state: CombinedLiveSessionState): number | null {
  const stateProfile = resolveSessionState(state);
  return stateProfile?.actionTimerConfig?.durationMinutes ?? null;
}

// ---------------------------------------------------------------------------
// Embedded Presence (Full's "presence" step in embedded mode, and Mini's
// own compact "presence_intervention" step -- same four reused stages).
// ---------------------------------------------------------------------------

function renderEmbeddedPresence(state: CombinedLiveSessionState, update: (next: CombinedLiveSessionState) => void, onContinue: () => void, isMiniStep = false) {
  const stage = state.embeddedPresenceStage ?? "visual_field";
  const line = getEmbeddedPresenceStageCopy(stage);
  return (
    <View>
      <Text style={styles.title}>נוכחות</Text>
      <Text style={styles.body}>{line}</Text>
      <PrimaryButton label={isMiniStep && state.embeddedPresenceStage === null ? "התחל" : "המשך"} onPress={onContinue} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Full Presence -- the nested sub-session, screen-owned entirely.
// ---------------------------------------------------------------------------

function renderFullPresence(presence: PresenceHandles, update: (next: CombinedLiveSessionState) => void, state: CombinedLiveSessionState) {
  if (presence.fullPresenceStage === "trigger_selection") {
    return (
      <View>
        <Text style={styles.title}>נוכחות מלאה</Text>
        <PrimaryButton label="התחל" onPress={() => presence.startFullPresenceSubSession()} />
      </View>
    );
  }
  return (
    <View>
      <Text style={styles.title}>נוכחות מלאה</Text>
      <Text style={styles.body}>שלב: {presence.fullPresenceStage}</Text>
      <PrimaryButton label="המשך" onPress={() => presence.advanceFullPresenceFrom(presence.fullPresenceStage, presence.fullPresenceSession)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Post-action tail -- existing Full/Mini engines, no new tail invented.
// ---------------------------------------------------------------------------

function renderTail(state: CombinedLiveSessionState, update: (next: CombinedLiveSessionState) => void) {
  if (!state.tailStage) return null;
  const copy = state.mode === "full" ? getPostActionCompletionCopy(state.tailStage as never, state.tailState) : getMiniPostActionCompletionCopy(state.tailStage as never);
  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      {copy.body.length > 0 && <Text style={styles.body}>{copy.body}</Text>}
      {state.mode === "full" && state.tailStage === "improvement_entry" && (
        <PrimaryButton label={copy.buttonLabel} onPress={() => update(advanceTail(recordTailImprovementText(state, null)))} />
      )}
      {state.tailStage === "gratitude" && <PrimaryButton label={copy.buttonLabel} onPress={() => update(advanceTail(recordTailGratitudeText(state, null)))} />}
      {state.tailStage !== "gratitude" && !(state.mode === "full" && state.tailStage === "improvement_entry") && (
        <PrimaryButton label={copy.buttonLabel} onPress={() => update(advanceTail(state))} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small local UI primitives (Hebrew RTL, matching this codebase's existing
// button/row conventions).
// ---------------------------------------------------------------------------

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text onPress={onPress} style={styles.button} accessibilityRole="button">
      {label}
    </Text>
  );
}

function YesNoRow({ onYes, onNo, yesLabel = "כן", noLabel = "לא" }: { onYes: () => void; onNo: () => void; yesLabel?: string; noLabel?: string }) {
  return (
    <View style={styles.buttonRow}>
      <Text onPress={onYes} style={styles.button} accessibilityRole="button">
        {yesLabel}
      </Text>
      <Text onPress={onNo} style={styles.button} accessibilityRole="button">
        {noLabel}
      </Text>
    </View>
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

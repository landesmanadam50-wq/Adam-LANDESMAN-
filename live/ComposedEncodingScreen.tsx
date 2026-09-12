import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getBeliefArc, getThoughtArc, getUrgeArc } from "../data/storage.ts";
import type { ArcBuildProfile, BeliefArc, ThoughtArc, UrgeArc } from "../arc/types.ts";
import { createEmptyUrgeArc } from "../arc/types.ts";
import {
  createEmptyArcStateComposedSession,
  getNextEncodingComponent,
  markComponentEncoded,
  resolveEffectiveArcStateComponents,
} from "../arc/arcStateComposer.ts";
import type { ArcStateComposedSessionState } from "../arc/arcStateComposer.ts";
import {
  createEmptyBeliefLiveState,
  getBeliefLiveStageCopy,
  getFirstEmbeddedBeliefLiveStage,
  getNextBeliefLiveStage,
} from "../arc/beliefLive.ts";
import type { BeliefLiveStage, BeliefLiveState } from "../arc/beliefLive.ts";
import {
  createEmptyThoughtLiveState,
  getFirstEmbeddedThoughtLiveStage,
  getNextThoughtLiveStage,
  getThoughtLiveStageCopy,
  getThoughtUsefulInsightDecisionOptions,
} from "../arc/thoughtLive.ts";
import type { ThoughtLiveStage, ThoughtLiveState, UsefulInsightDecision } from "../arc/thoughtLive.ts";
import { createEmptyUrgeLiveState, getFirstEmbeddedUrgeLiveStage, getUrgeLiveStageCopy } from "../arc/urgeLive.ts";
import type { UrgeLiveStage, UrgeLiveState } from "../arc/urgeLive.ts";

/** Each embedded protocol stops at its own spec-defined Encoding-only exit stage -- reaching it and continuing means THIS component is done, never a hop into that protocol's own post-Encoding tail (Urge's act/recheck/complete, Thought's future_insight_action/future_imagery/complete, Belief's future_imagery/action/etc -- all of those belong to ARC State's own shared beneficial action, never repeated per-component). */
const URGE_EXIT_STAGE: UrgeLiveStage = "encode";
const THOUGHT_EXIT_STAGE: ThoughtLiveStage = "encoding";
/** Belief's embedded entry always uses bridgeMantraAlreadyShown=true -- the shared, unmodified "regulate" ArcStage (arc/stageCopy.ts's own "regulate" case) already shows the Bridge Mantra via getBridgeMantraLine(profile) before "encode" is ever reached, so Belief must never show it again. */
const BELIEF_EXIT_STAGE: BeliefLiveStage = "future_action";

type ActiveEmbedded =
  | { kind: "urge"; stage: UrgeLiveStage; state: UrgeLiveState }
  | { kind: "thought"; stage: ThoughtLiveStage; state: ThoughtLiveState }
  | { kind: "belief"; stage: BeliefLiveStage; state: BeliefLiveState };

/**
 * live/ComposedEncodingScreen.tsx
 *
 * Phase 7 (ARC State composition), spec section 9: rendered by
 * live/ArcLiveRenderer.tsx's own "encode" case INSTEAD OF the existing,
 * unmodified <EncodingScreen> -- but ONLY when this session's resolved
 * components (arc/arcStateComposer.ts's resolveEffectiveArcStateComponents)
 * include something beyond "emotion". A legacy/unconfigured "state"
 * build, or one where the trainee never opted into composition, never
 * reaches this component at all -- ArcLiveRenderer's own branch (see
 * that file's "encode" case) keeps rendering the plain existing
 * <EncodingScreen> unchanged in that case, so nothing about the
 * existing ARC State route is touched.
 *
 * Walks each selected optional component (urge -> thought -> belief,
 * arc/arcStateComposer.ts's own fixed order) through its OWN embedded
 * Encoding-only entry point, never repeating Stay/Acceptance/
 * Regulation (already run by the existing, unmodified stages before
 * "encode" was ever reached) and never continuing into that
 * component's own post-Encoding tail. Once every selected component is
 * encoded, calls onComplete -- the caller then continues the EXISTING
 * engine's own "encode" -> "act" transition exactly as it always has,
 * so Desired State Encoding, the beneficial action, and everything
 * after it (spec section 9.1: "The desired state begins here, not
 * during Recognition, Stay or Acceptance") run completely unchanged.
 *
 * Scope note (see this phase's own commit/report): component-specific
 * Recognition (Urge's representation choice, Thought's modality, a
 * specific selected belief) is not yet collected during the existing
 * shared Recognition stages -- each embedded engine's own safe
 * "unsure"/anchor fallback is used instead, exactly as if the trainee
 * had never answered that question. This is a real, honestly-scoped
 * simplification, never a crash or invented content.
 */
export function ComposedEncodingScreen({ profile, onComplete }: { profile: ArcBuildProfile; onComplete: () => void }) {
  const [linkedUrgeArc, setLinkedUrgeArc] = useState<UrgeArc | null>(null);
  const [linkedThoughtArc, setLinkedThoughtArc] = useState<ThoughtArc | null>(null);
  const [linkedBeliefArc, setLinkedBeliefArc] = useState<BeliefArc | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [composedSession, setComposedSession] = useState<ArcStateComposedSessionState>(() =>
    createEmptyArcStateComposedSession(resolveEffectiveArcStateComponents(profile.stateComposition, null))
  );
  const [active, setActive] = useState<ActiveEmbedded | null>(null);
  const [pendingText, setPendingText] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      profile.linkedUrgeArcId ? getUrgeArc(profile.linkedUrgeArcId) : Promise.resolve(null),
      profile.linkedThoughtArcId ? getThoughtArc(profile.linkedThoughtArcId) : Promise.resolve(null),
      profile.linkedBeliefArcId ? getBeliefArc(profile.linkedBeliefArcId) : Promise.resolve(null),
    ]).then(([urgeArc, thoughtArc, beliefArc]) => {
      if (cancelled) return;
      setLinkedUrgeArc(urgeArc);
      setLinkedThoughtArc(thoughtArc);
      setLinkedBeliefArc(beliefArc);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (active !== null) return;
    startNextComponent(composedSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function startNextComponent(session: ArcStateComposedSessionState) {
    const next = getNextEncodingComponent(session);
    if (next === "urge") {
      setActive({ kind: "urge", stage: getFirstEmbeddedUrgeLiveStage(), state: createEmptyUrgeLiveState() });
    } else if (next === "thought") {
      setActive({ kind: "thought", stage: getFirstEmbeddedThoughtLiveStage(), state: createEmptyThoughtLiveState() });
    } else if (next === "belief") {
      setActive({ kind: "belief", stage: getFirstEmbeddedBeliefLiveStage(true), state: createEmptyBeliefLiveState() });
    } else {
      onComplete();
      return;
    }
    setPendingText("");
  }

  function finishActiveComponent(kind: "urge" | "thought" | "belief") {
    const updated = markComponentEncoded(composedSession, kind);
    setComposedSession(updated);
    setActive(null);
    startNextComponent(updated);
  }

  if (!loaded || !active) {
    return <View />;
  }

  if (active.kind === "urge") {
    const copy = getUrgeLiveStageCopy(active.stage, linkedUrgeArc ?? createEmptyUrgeArc("session-urge", "", new Date().toISOString()), active.state);
    return (
      <View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        <Pressable style={styles.button} onPress={() => finishActiveComponent("urge")}>
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </Pressable>
      </View>
    );
  }

  if (active.kind === "thought") {
    const copy = getThoughtLiveStageCopy(active.stage, linkedThoughtArc, active.state);
    const isExit = active.stage === THOUGHT_EXIT_STAGE;

    function advanceThought(patch: Partial<ThoughtLiveState> = {}) {
      const activeThought = active as ActiveEmbedded & { kind: "thought" };
      const patchedState = { ...activeThought.state, ...patch };
      if (isExit) {
        finishActiveComponent("thought");
        return;
      }
      const hop = getNextThoughtLiveStage(activeThought.stage, patchedState);
      setActive({ kind: "thought", stage: hop.stage, state: hop.state });
      setPendingText("");
    }

    if (active.stage === "useful_insight_decision") {
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {getThoughtUsefulInsightDecisionOptions().map((option: { value: UsefulInsightDecision; label: string }) => (
            <Pressable key={option.value} style={styles.button} onPress={() => advanceThought({ usefulInsightDecision: option.value })}>
              <Text style={styles.buttonText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      );
    }

    if (active.stage === "useful_insight_entry" || (active.stage === "supportive_fallback" && !linkedThoughtArc?.supportiveThought)) {
      return (
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
          <Pressable
            style={styles.button}
            onPress={() => advanceThought(active.stage === "useful_insight_entry" ? { usefulInsightText: pendingText || null } : { liveSupportiveThought: pendingText || null })}
          >
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        <Pressable style={styles.button} onPress={() => advanceThought()}>
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </Pressable>
      </View>
    );
  }

  // active.kind === "belief"
  const copy = getBeliefLiveStageCopy(active.stage, linkedBeliefArc, active.state);
  const isExit = active.stage === BELIEF_EXIT_STAGE;
  const isFreeTextStage = active.stage === "replacement_belief" || active.stage === "future_insight" || active.stage === "future_action";

  function advanceBelief(patch: Partial<BeliefLiveState> = {}) {
    const activeBelief = active as ActiveEmbedded & { kind: "belief" };
    const patchedState = { ...activeBelief.state, ...patch };
    if (isExit) {
      finishActiveComponent("belief");
      return;
    }
    const hop = getNextBeliefLiveStage(activeBelief.stage, patchedState);
    setActive({ kind: "belief", stage: hop.stage, state: hop.state });
    setPendingText("");
  }

  if (isFreeTextStage) {
    return (
      <View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
        <TextInput style={styles.textInput} value={pendingText} onChangeText={setPendingText} textAlign="right" multiline />
        <Pressable
          style={styles.button}
          onPress={() =>
            advanceBelief(
              active.stage === "replacement_belief"
                ? { liveReplacementBeliefText: pendingText || null }
                : active.stage === "future_insight"
                  ? { futureInsightText: pendingText || null }
                  : { futureActionText: pendingText || null }
            )
          }
        >
          <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
      <Pressable style={styles.button} onPress={() => advanceBelief()}>
        <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

/** Never used directly by LiveSessionScreen -- ArcLiveRenderer wraps ComposedEncodingScreen in its own ScrollView already, this is only exported for a caller that wants its own scroll container. */
export function ComposedEncodingScreenScrollable(props: { profile: ArcBuildProfile; onComplete: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ComposedEncodingScreen {...props} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
